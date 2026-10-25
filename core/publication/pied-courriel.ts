/**
 * PIED DE L'E-MAIL de livraison (étape 6, délivrabilité). SPÉCIFIQUE au courriel :
 * construit et inséré au MOMENT DE L'ENVOI, jamais dans le rapport rendu (que
 * `/statut/:id` et la démo partagent). Un « vous recevez cet e-mail car… » n'a de
 * sens que dans l'e-mail.
 *
 * Deux exigences de délivrabilité portées ici :
 *  - les SEULS liens cliquables sont sur zurvela.com (mentions, confidentialité) ;
 *    l'origine du marchand reste du TEXTE dans la ligne de contexte, jamais un href ;
 *  - tout contenu interpolé est échappé par construction (`html`) — identité et
 *    contexte viennent de notre config/locale, mais le contexte PORTE l'origine
 *    (donnée du visiteur), donc la garde anti-injection s'applique.
 */
import { html } from '../rapport/html.js';

export interface OptionsPiedCourriel {
  /** Ligne de contexte DÉJÀ interpolée (origine + date de la demande). */
  readonly contexte: string;
  readonly raisonSociale: string;
  readonly adresse: string;
  readonly lienMentions: string;
  readonly libelleMentions: string;
  readonly lienConfidentialite: string;
  readonly libelleConfidentialite: string;
}

/**
 * Pied HTML du courriel : une table pleine largeur SOUS la carte du rapport, texte
 * gris et petit (tableau + styles inline + couleurs explicites : contraintes mail).
 */
export function piedCourrielHtml(o: OptionsPiedCourriel): string {
  const bloc = html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;"><tr><td align="center" style="padding:16px 12px;color:#9ca3af;font-size:12px;line-height:1.5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:600px;">${o.contexte}<br>${o.raisonSociale} — ${o.adresse}<br><a href="${o.lienMentions}" style="color:#9ca3af;">${o.libelleMentions}</a> · <a href="${o.lienConfidentialite}" style="color:#9ca3af;">${o.libelleConfidentialite}</a></div>
</td></tr></table>`;
  return bloc.valeur;
}

/** Pied TEXTE du courriel (part text/plain), même contenu, liens en clair. */
export function piedCourrielTexte(o: OptionsPiedCourriel): string {
  return `\n\n—\n${o.contexte}\n${o.raisonSociale} — ${o.adresse}\n${o.libelleMentions} : ${o.lienMentions}\n${o.libelleConfidentialite} : ${o.lienConfidentialite}\n`;
}

/**
 * Insère le pied dans un rapport DÉJÀ RENDU : le HTML avant la fermeture `</body>`
 * (le gabarit de `rendu-html.ts` en contient exactement une), le texte appendé.
 */
export function insererPiedCourriel(rapportHtml: string, rapportTexte: string, o: OptionsPiedCourriel): { html: string; texte: string } {
  return {
    html: rapportHtml.replace('</body>', `${piedCourrielHtml(o)}</body>`),
    texte: rapportTexte + piedCourrielTexte(o),
  };
}
