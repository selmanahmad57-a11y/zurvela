/**
 * ÉTAT DURABLE EN JSON (publication, étape 4). Preuves, jetons et scans
 * survivent à un redémarrage (cohérent avec le quota). Écriture ATOMIQUE par
 * fichier temporaire + `rename` (POSIX) : jamais de fichier à moitié écrit. Un
 * seul processus serveur + file 1-à-la-fois → pas de course read-modify-write
 * concurrente ; le `rename` suffit ici (le jour d'une file parallèle, il
 * faudra un verrou — noté).
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { EntreeJeton, Preuve, StockVerification } from './verification-propriete.js';
import type { EntreeScan, StockScans } from './serveur-scan.js';
import type { StockQuota } from './quota.js';
import type { EvenementHorodate, StockWebhook } from './webhook-resend.js';

/**
 * Écriture ATOMIQUE d'un JSON (fichier temporaire + `rename` POSIX) : le lecteur
 * voit l'ancien OU le nouveau, jamais un demi-fichier. Partagé (2e usage réel :
 * `TableJson` et le journal des webhooks).
 */
function ecrireJsonAtomique(chemin: string, donnees: unknown): void {
  const tmp = `${chemin}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  writeFileSync(tmp, JSON.stringify(donnees), 'utf8');
  renameSync(tmp, chemin);
}

/** Table clé→valeur persistée en un JSON, écriture atomique. */
export class TableJson<T> {
  constructor(private readonly chemin: string) {}
  private lireTout(): Record<string, T> {
    try {
      return JSON.parse(readFileSync(this.chemin, 'utf8')) as Record<string, T>;
    } catch {
      return {}; // absent ou illisible = vide
    }
  }
  private ecrireTout(donnees: Record<string, T>): void {
    ecrireJsonAtomique(this.chemin, donnees);
  }
  lire(cle: string): T | undefined {
    return this.lireTout()[cle];
  }
  ecrire(cle: string, valeur: T): void {
    const d = this.lireTout();
    d[cle] = valeur;
    this.ecrireTout(d);
  }
  valeurs(): T[] {
    return Object.values(this.lireTout());
  }
}

/** Stock de vérification (jetons + preuves) adossé à deux fichiers JSON. */
export function stockVerificationFichier(cheminJetons: string, cheminPreuves: string): StockVerification {
  const jetons = new TableJson<EntreeJeton>(cheminJetons);
  const preuves = new TableJson<Preuve>(cheminPreuves);
  return {
    lireJeton: (o) => jetons.lire(o),
    ecrireJeton: (o, e) => jetons.ecrire(o, e),
    lirePreuve: (o) => preuves.lire(o),
    ecrirePreuve: (o, p) => preuves.ecrire(o, p),
  };
}

/** Compteurs de quota adossés à un fichier JSON (clé `jourUTC|portée` → nombre). */
export function stockQuotaFichier(chemin: string): StockQuota {
  const table = new TableJson<number>(chemin);
  return { lire: (c) => table.lire(c), ecrire: (c, n) => table.ecrire(c, n) };
}

/** File des scans adossée à un fichier JSON ; `prochainEnAttente` = le plus ancien « en-attente ». */
export function stockScansFichier(chemin: string): StockScans {
  const table = new TableJson<EntreeScan>(chemin);
  return {
    lire: (id) => table.lire(id),
    ecrire: (id, e) => table.ecrire(id, e),
    prochainEnAttente: () =>
      table
        .valeurs()
        .filter((e) => e.etat === 'en-attente')
        .sort((a, b) => a.creeLe - b.creeLe)[0],
  };
}

/**
 * Journal durable des webhooks Resend (étape 7) : idempotence (svix-id vus) +
 * fenêtre d'événements (stats de bounce/plainte), en UN seul JSON, écriture
 * atomique. Les DEUX listes sont élaguées par `fenetreMs` — qui, borné en bas par
 * le schéma de config (≥ horizon de retry Svix), garde la fenêtre d'idempotence
 * assez longue pour qu'une redelivery tardive reste reconnue.
 */
interface EtatWebhookPersiste {
  readonly vus: Record<string, number>;
  readonly evenements: readonly EvenementHorodate[];
}
export function stockWebhookFichier(chemin: string): StockWebhook {
  const lire = (): EtatWebhookPersiste => {
    try {
      const v = JSON.parse(readFileSync(chemin, 'utf8')) as Partial<EtatWebhookPersiste>;
      return { vus: v.vus ?? {}, evenements: v.evenements ?? [] };
    } catch {
      return { vus: {}, evenements: [] }; // absent ou illisible = vide
    }
  };
  return {
    dejaVu: (id) => id in lire().vus,
    enregistrer: (id, evt, maintenant, fenetreMs) => {
      const etat = lire();
      const limite = maintenant - fenetreMs;
      const vus: Record<string, number> = {};
      for (const [k, t] of Object.entries(etat.vus)) if (t >= limite) vus[k] = t;
      vus[id] = maintenant;
      const evenements = [...etat.evenements.filter((e) => e.creeLe >= limite), evt];
      ecrireJsonAtomique(chemin, { vus, evenements } satisfies EtatWebhookPersiste);
    },
    fenetre: (maintenant, fenetreMs) => lire().evenements.filter((e) => e.creeLe >= maintenant - fenetreMs),
  };
}
