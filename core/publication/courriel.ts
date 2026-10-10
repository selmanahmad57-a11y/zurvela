/**
 * E-MAIL DE LIVRAISON (publication, étape 6) — le canal du scan lent (2-5 min).
 *
 * Deux responsabilités, toutes deux universelles et testables au banc :
 *  - `emailValide` : la GARDE ANTI-INJECTION du destinataire. Critère structurel
 *    (longueur, aucun caractère de contrôle, format `local@domaine.tld`), aucune
 *    langue naturelle — le code connaît LE WEB, pas LE MONDE.
 *  - `envoyerCourriel` : POST HTTPS vers Resend, corps JSON STRUCTURÉ. Le `to`
 *    est un champ JSON (pas un en-tête brut) → l'injection d'en-tête SMTP
 *    classique n'est pas un vecteur ; on re-valide quand même (défense en
 *    profondeur, le second bord de la garde). Le transport est injecté → le banc
 *    le double (zéro mail réel). Aucune dépendance npm : Resend est une
 *    dépendance de SERVICE, appelée en HTTPS direct.
 *
 * L'URL de destination est une CONSTANTE : le `to` fourni par le visiteur n'est
 * jamais l'hôte appelé → pas de SSRF au transport (contrairement au GET de
 * vérification, où l'hôte est l'entrée publique et doit être épinglé).
 */
import https from 'node:https';

/** RFC 5321 : une adresse e-mail ne dépasse pas 254 octets (fait universel). */
export const LONGUEUR_MAX_EMAIL = 254;

/**
 * Le destinataire est-il une adresse sûre à stocker puis poster ? Rejette :
 * vide ou trop long ; tout caractère de contrôle (`charCode ≤ 0x20`, ce qui
 * couvre `\r \n \t \0`) et l'espace — LE CŒUR DE LA GARDE : un CR/LF ne doit
 * jamais atteindre Resend ; un format qui n'est pas `local@domaine.tld`.
 */
export function emailValide(email: string): boolean {
  if (email.length === 0 || email.length > LONGUEUR_MAX_EMAIL) {
    return false;
  }
  for (let i = 0; i < email.length; i++) {
    const code = email.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) {
      return false; // caractère de contrôle (CR/LF/TAB/NUL…) ou espace
    }
  }
  const arobase = email.indexOf('@');
  if (arobase <= 0 || arobase !== email.lastIndexOf('@') || arobase === email.length - 1) {
    return false; // zéro, deux `@`, ou `@` en bord
  }
  const domaine = email.slice(arobase + 1);
  if (!domaine.includes('.') || domaine.startsWith('.') || domaine.endsWith('.')) {
    return false; // domaine sans point, ou point en bord
  }
  return true;
}

/** Transport HTTPS injectable (le banc le double → zéro mail réel). */
export type PosterHttps = (opts: {
  url: string;
  enTetes: Record<string, string>;
  corps: string;
  delaiMs: number;
}) => Promise<{ statut: number; corps: string }>;

export interface EnvoiCourriel {
  readonly destinataire: string;
  readonly sujet: string;
  readonly html: string;
}

export interface OptionsEnvoi {
  readonly cleApi: string;
  readonly expediteur: string;
  readonly delaiMs: number;
  readonly poster: PosterHttps;
}

/** L'API Resend : un seul point d'envoi, constant. */
const URL_RESEND = 'https://api.resend.com/emails';

/**
 * Envoie un rapport via Resend. GARDE DE SORTIE : le `to` est re-validé AVANT
 * le POST (défense en profondeur) ; invalide → aucun envoi, `poster` jamais
 * appelé. Rend `ok` sur 2xx, `ok:false` sur tout autre statut ou si le
 * transport jette — l'échec ne remonte jamais en exception (l'id reste le filet).
 */
export async function envoyerCourriel(envoi: EnvoiCourriel, opts: OptionsEnvoi): Promise<{ ok: boolean; statut?: number }> {
  if (!emailValide(envoi.destinataire)) {
    return { ok: false };
  }
  const corps = JSON.stringify({ from: opts.expediteur, to: envoi.destinataire, subject: envoi.sujet, html: envoi.html });
  try {
    const rep = await opts.poster({
      url: URL_RESEND,
      enTetes: { authorization: `Bearer ${opts.cleApi}`, 'content-type': 'application/json' },
      corps,
      delaiMs: opts.delaiMs,
    });
    return { ok: rep.statut >= 200 && rep.statut < 300, statut: rep.statut };
  } catch {
    return { ok: false };
  }
}

/** Transport HTTPS RÉEL (`node:https`). Utilisé en production uniquement ; le banc injecte un double. */
export function posterHttpsReel(): PosterHttps {
  return ({ url, enTetes, corps, delaiMs }) =>
    new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname,
          method: 'POST',
          headers: { ...enTetes, 'content-length': Buffer.byteLength(corps) },
          timeout: delaiMs,
        },
        (res) => {
          let c = '';
          res.setEncoding('utf8');
          res.on('data', (d: string) => (c += d));
          res.on('end', () => resolve({ statut: res.statusCode ?? 0, corps: c }));
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('délai dépassé'));
      });
      req.on('error', reject);
      req.write(corps);
      req.end();
    });
}
