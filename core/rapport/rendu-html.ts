/**
 * RENDU HTML du rapport business (publication, étape 1). Rendu PARALLÈLE au
 * Markdown de `rendu.ts` — même structure source (`RapportBusiness`), jamais le
 * Markdown (qui referait les erreurs de voix et laisserait des artefacts
 * d'échappement). Il sert DEUX surfaces : la page de démo figée, et le corps du
 * mail de livraison. D'où les contraintes du dénominateur commun mail+web.
 *
 * DEUX GARDES CARDINALES :
 *  1. ANTI-INJECTION (garde 1) : tout contenu du site scanné est échappé PAR
 *     CONSTRUCTION — le gabarit `html` échappe chaque interpolation, et `prose`
 *     échappe avant d'ajouter les seuls `<br>`. Les URL ne deviennent un `href`
 *     que si leur schéma est http(s) (`lienHref`) — l'échappement HTML ne
 *     protège pas un `javascript:`. Jamais de contenu du site dans un attribut
 *     `style` ni dans un nom d'attribut.
 *  2. VOIX (garde 2) : la gravité, le statut fixe, le titre, le constat,
 *     l'impact (vide quand il l'est) sont déjà posés par `structure.ts`
 *     (mur/preuve-faible/ordinaire) ; on les rend tels quels. Le libellé
 *     d'action est routé par `libelleAction` — la fonction PARTAGÉE avec
 *     `rendu.ts`, pour qu'il n'existe qu'en un endroit.
 *
 * MAIL : structure en TABLEAU (Outlook ignore la mise en page moderne), largeur
 * max ~600 px, polices système, couleur de texte ET de fond déclarées ENSEMBLE
 * sur chaque bloc (sinon le mode sombre produit du texte foncé sur fond foncé),
 * styles inline (les clients suppriment `<style>` en `<head>`), zéro script,
 * zéro ressource externe.
 *
 * GRAVITÉ : libellé texte, aucune couleur d'alarme (décision du propriétaire).
 * Le mot porte l'information ; la teinte (ardoise/gris) et le filet gauche ne
 * font que l'accompagner — un rapport en mode sombre, imprimé ou lu par un
 * daltonien reste lisible.
 */
import type { RapportBusiness, SectionRapport } from '../types.js';
import { STATUTS_SANS_RETEST } from './statuts.js';
import { LIBELLES_CATEGORIE, LIBELLES_GRAVITE, LIBELLES_RAPPORT, estLangueRapport, libelleAction, type LangueRapport } from './voix.js';
import { brut, html, lienHref, prose, type FragmentHtml } from './html.js';

export interface OptionsRenduHtml {
  /** URL scannée, affichée en tête. */
  url?: string;
}

function langueDe(rapportBusiness: RapportBusiness): LangueRapport {
  return estLangueRapport(rapportBusiness.langue) ? rapportBusiness.langue : 'fr';
}

function libelleEnumere(table: Readonly<Record<string, Readonly<Record<LangueRapport, string>> | undefined>>, valeur: string, langue: LangueRapport): string {
  return table[valeur]?.[langue] ?? valeur;
}

/** Teinte de la gravité — sobre, sans alarme. `mineur` effacé (gris), le reste appuyé (ardoise). Le mot reste l'information. */
function styleGravite(gravite: string): { texte: string; filet: string; graisse: string } {
  return gravite === 'mineur'
    ? { texte: '#6b7280', filet: '#d1d5db', graisse: 'normal' }
    : { texte: '#1f2937', filet: '#1f2937', graisse: '700' };
}

/** Un champ « étiquette : valeur » d'une section, la valeur en prose échappée. */
function champ(label: string, valeur: FragmentHtml): FragmentHtml {
  return html`<p style="margin:4px 0;color:#1f2937;"><strong>${label}</strong> ${valeur}</p>`;
}

function rendreSectionHtml(section: SectionRapport, langue: LangueRapport, rang: number, muette: boolean): FragmentHtml {
  const libelles = LIBELLES_RAPPORT[langue];
  const g = styleGravite(section.gravite);
  const gravite = libelleEnumere(LIBELLES_GRAVITE, section.gravite, langue);
  const categorie = libelleEnumere(LIBELLES_CATEGORIE, section.categorie, langue);
  const pages = section.localisations
    .map((loc) => (loc.viewports.length === 0 ? echapPage(loc.page) : html`${loc.page} — ${loc.viewports.join(', ')}`))
    .reduce<FragmentHtml>((acc, p, i) => (i === 0 ? p : html`${acc} · ${p}`), html``);
  const morceaux: FragmentHtml[] = [
    // La gravité en libellé (le mot porte l'info) ; teinte et graisse accompagnent.
    brut(`<p style="margin:0 0 4px 0;color:${g.texte};font-weight:${g.graisse};">${esc(gravite)} · <span style="color:#6b7280;font-weight:normal;">${esc(categorie)}</span></p>`),
    champ(`${libelles.statut} :`, prose(section.statutFormule)),
    champ(`${libelles.pagesConcernees} :`, pages),
  ];
  if (section.origine !== undefined) {
    morceaux.push(champ(`${libelles.serviceExterieur} :`, prose(section.origine)));
  }
  if (section.constat !== '') {
    morceaux.push(champ(`${libelles.constat} —`, prose(section.constat)));
  }
  // Impact rendu SEULEMENT s'il est non vide (le garde de rendu.ts : le mur et
  // la preuve faible ne prétendent aucune conséquence).
  if (section.impact !== '') {
    morceaux.push(champ(`${libelles.impact} —`, prose(section.impact)));
  }
  if (section.actionSuggeree !== '') {
    morceaux.push(champ(`${libelleAction(section, langue)} —`, prose(section.actionSuggeree)));
  }
  if (muette) {
    morceaux.push(html`<p style="margin:4px 0;color:#9ca3af;font-style:italic;">${libelles.sectionNonRedigee}</p>`);
  }
  const titre = html`<h2 style="margin:0 0 6px 0;font-size:16px;color:#1f2937;">${rang}. ${section.titre}</h2>`;
  return html`<div style="border-left:3px solid ${brut(g.filet)};padding:4px 0 4px 14px;margin:16px 0;background:#ffffff;color:#1f2937;">${titre}${joindre(morceaux)}</div>`;
}

/** Ligne de méthode : les comptes de la structure (jamais de la prose), + la phrase du modèle si elle existe. */
function methode(rapportBusiness: RapportBusiness, libelles: (typeof LIBELLES_RAPPORT)[LangueRapport]): string {
  const lignes = [rapportBusiness.nbEcartes === null ? libelles.methodeIndisponible : libelles.ligneEcartes(rapportBusiness.nbEcartes)];
  if (rapportBusiness.nbNonVerifies !== null && rapportBusiness.nbNonVerifies > 0) {
    lignes.push(libelles.ligneNonVerifies(rapportBusiness.nbNonVerifies));
  }
  const nbDecouvertes = rapportBusiness.sections.filter((s) => STATUTS_SANS_RETEST.includes(s.statut)).length;
  if (nbDecouvertes > 0) {
    lignes.push(libelles.ligneDecouvertes(nbDecouvertes));
  }
  if (rapportBusiness.nbRecouvrementsEcartes > 0) {
    lignes.push(libelles.ligneEcartements(rapportBusiness.nbRecouvrementsEcartes));
  }
  if (!rapportBusiness.soumissionsTestees) {
    lignes.push(libelles.soumissionsNonTestees);
  }
  if (rapportBusiness.ligneMethode !== '') {
    lignes.push(rapportBusiness.ligneMethode);
  }
  return lignes.join(' ');
}

export function rendreRapportHtml(rapportBusiness: RapportBusiness, options: OptionsRenduHtml = {}): string {
  const langue = langueDe(rapportBusiness);
  const libelles = LIBELLES_RAPPORT[langue];
  const corps: FragmentHtml[] = [html`<h1 style="margin:0 0 12px 0;font-size:20px;color:#1f2937;">${libelles.titre}</h1>`];

  if (options.url !== undefined) {
    const href = lienHref(options.url);
    // L'URL ne devient un lien que si son schéma est http(s) ; sinon texte seul
    // (un `javascript:`/`data:` ne produit jamais de `href`).
    corps.push(href === null ? html`<p style="margin:0 0 12px 0;color:#6b7280;">${options.url}</p>` : html`<p style="margin:0 0 12px 0;"><a href="${href}" style="color:#245c4f;">${options.url}</a></p>`);
  }

  const rienVerifie = rapportBusiness.rejouabilite !== null && rapportBusiness.rejouabilite.groupes > 0 && rapportBusiness.rejouabilite.groupesRejoues === 0;
  if (rienVerifie) {
    // RIEN VÉRIFIÉ N'EST PAS RIEN TROUVÉ (P2-1) : en tête, appuyé, garantie sémantique.
    corps.push(html`<p style="margin:0 0 12px 0;padding:10px 14px;border-left:3px solid #1f2937;background:#f3f4f6;color:#1f2937;font-weight:700;">${libelles.rienVerifie(rapportBusiness.nbNonVerifies ?? rapportBusiness.rejouabilite?.groupes ?? 0)}</p>`);
  }
  if (rapportBusiness.synthese !== '') {
    corps.push(html`<p style="margin:0 0 12px 0;color:#1f2937;">${prose(rapportBusiness.synthese)}</p>`);
  }
  if (rapportBusiness.sansProse && rapportBusiness.sections.length > 0) {
    corps.push(html`<p style="margin:0 0 12px 0;color:#9ca3af;font-style:italic;">${libelles.sansProse}</p>`);
  }
  const nbMuettes = rapportBusiness.sections.length - rapportBusiness.nbSectionsRedigees;
  const partiel = !rapportBusiness.sansProse && nbMuettes > 0;
  if (partiel) {
    corps.push(html`<p style="margin:0 0 12px 0;color:#9ca3af;font-style:italic;">${libelles.partiellementRedige(nbMuettes, rapportBusiness.sections.length)}</p>`);
  }

  if (rapportBusiness.sections.length === 0) {
    corps.push(html`<p style="margin:0 0 12px 0;color:#1f2937;">${libelles.sansAnomalie}</p>`);
  } else {
    rapportBusiness.sections.forEach((section, rang) => {
      corps.push(rendreSectionHtml(section, langue, rang + 1, partiel && section.titre === ''));
    });
  }

  corps.push(html`<h2 style="margin:20px 0 6px 0;font-size:15px;color:#1f2937;">${libelles.methode}</h2>`);
  corps.push(html`<p style="margin:0;color:#6b7280;font-size:13px;">${prose(methode(rapportBusiness, libelles))}</p>`);

  const document = html`<!doctype html>
<html lang="${langue}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;color:#1f2937;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;color:#1f2937;"><tr><td style="padding:24px;">
${joindre(corps)}
</td></tr></table>
</td></tr></table>
</body></html>`;
  return document.valeur;
}

// Auxiliaires d'échappement : `esc` pour un fragment de texte brut inséré dans
// une chaîne de style (le seul endroit où l'on compose du HTML littéral, via
// `brut`), `echapPage` pour un chemin de localisation (contenu du site).
function esc(valeur: string): string {
  return html`${valeur}`.valeur;
}
function echapPage(page: string): FragmentHtml {
  return html`${page}`;
}
function joindre(fragments: FragmentHtml[]): FragmentHtml {
  return brut(fragments.map((f) => f.valeur).join(''));
}
