/**
 * Normalisation DÉTERMINISTE de ce que le rédacteur voit.
 *
 * Même rôle, et mêmes raisons, que `etat-decision.ts` pour la navigation et
 * `contexte-diagnostic.ts` pour le diagnostic : le bloc produit ici est À LA
 * FOIS ce que le prompt affiche et ce que la clé de cassette hache. Les deux
 * doivent être la même chose, sans quoi une réponse figée serait rejouée sur
 * un prompt différent de celui qui l'a produite — la bonne réponse du mauvais
 * prompt.
 *
 * ── CE QUI ENTRE, ET CE QUI N'ENTRE PAS ─────────────────────────────────────
 *
 * ENTRE : la catégorie, la gravité et le statut (valeurs de CODE, montrées
 * pour que la prose ne promette pas plus que son statut), le symptôme
 * technique du détecteur (constante de code), les CHEMINS D'URL et les noms de
 * viewport, et le type de site du profil (vocabulaire fermé de
 * `config/profilage.json`).
 *
 * N'ENTRE PAS, et chaque absence est une décision :
 *  - les SÉLECTEURS et attributs d'éléments : le rapport parle de pages, pas
 *    de CSS, donc les montrer n'achèterait rien et élargirait la surface
 *    d'injection ;
 *  - `profil.natureLibre` : c'est la chaîne la plus directement contrôlée par
 *    la page de tout le moteur, et elle n'aide en rien à écrire une phrase
 *    d'impact. La brique 4b l'a fait entrer dans le prompt de navigation parce
 *    que la décision en avait besoin ; ici, rien n'en a besoin, et « rien n'en
 *    a besoin » est la seule bonne raison de ne pas montrer une donnée hostile ;
 *  - tous les COMPTES du rapport — nombre de sections écartées, nombre de
 *    vérifications, confiances. Le modèle n'a pas le droit d'écrire un
 *    chiffre : lui en montrer serait l'inviter à le recopier.
 *
 * ── DEUX SURFACES D'INJECTION, ET AUCUNE N'EST UNE COÏNCIDENCE ──────────────
 *
 * Le CHEMIN d'une page est choisi par le site inspecté : c'est la surface
 * évidente. Il est borné deux fois (par chemin, puis en cumul) et balisé comme
 * contenu non fiable.
 *
 * La SECONDE est le champ `description` d'une anomalie, recopié dans la ligne
 * de symptômes. Une version antérieure de cet en-tête affirmait que le chemin
 * était la seule surface, au motif que « les descriptions de détecteurs sont
 * des constantes de code ». C'était vrai des sept détecteurs d'aujourd'hui, et
 * le contrat du champ dit l'inverse : `Anomalie.description` est déclarée
 * « prose (rédigée par l'IA ou un détecteur) ». La propriété invoquée n'était
 * pas tenue par le type, elle était tenue par une coïncidence — et la chaîne
 * de méfiance ne se fonde pas sur une coïncidence (constitution §3, données
 * DÉRIVÉES : une sortie de nos propres modèles n'est pas fiable parce qu'elle
 * est nôtre).
 *
 * Elle est donc traitée comme le chemin : bornée, aplatie sur une ligne, et
 * balisée non fiable. Le jour où un détecteur reprendra l'attribut `alt` d'une
 * image, ou qu'une découverte portera une description écrite par le modèle de
 * diagnostic, rien ne s'ouvrira — c'était déjà refermé.
 *
 * Les catégories et gravités restent des valeurs d'énumération et les viewports
 * viennent de la configuration : ceux-là, le type les tient.
 */
import type { Anomalie, Rapport, RapportBusiness, SectionRapport, Signal } from '../types.js';
import type { ConfigRapport } from '../scanner/config.js';
import type { ContexteRedaction } from '../ia/index.js';

/** Aplatissement des sauts de ligne : la classe LARGE du diagnostic, jamais la restreinte. */
const SEPARATEURS_DE_LIGNE = /[\r\n\v\f\u0085\u2028\u2029]+/g;

function surUneLigne(valeur: string, maxChars: number): string {
  return valeur.replace(SEPARATEURS_DE_LIGNE, ' ').slice(0, Math.max(0, maxChars));
}

/**
 * Le SYMPTÔME technique d'une section : les descriptions distinctes du groupe
 * de cause racine, ou celle de l'anomalie à défaut.
 *
 * Ce sont des identifiants de détecteur (`ressource-interne-404`,
 * `bouton-sans-effet`) : le seul vocabulaire dont le modèle dispose pour dire
 * CE QUI s'est passé. La consolidation les a conservés exprès — sans eux, le
 * symptôme le plus parlant pour un humain disparaîtrait derrière le plus riche
 * en contexte.
 */
/**
 * La ligne de symptômes d'une anomalie, telle que le rédacteur la verra.
 * Exposée pour que le plafond de ligne puisse être confronté à la FONCTION et
 * pas seulement à l'arithmétique d'un commentaire.
 */
export function symptomesLisibles(anomalie: Anomalie, descriptions: string[] | undefined, maxChars: number): string {
  return symptomesDe(anomalie, descriptions, maxChars);
}

function symptomesDe(anomalie: Anomalie, descriptions: string[] | undefined, maxChars: number): string {
  const brutes = descriptions !== undefined && descriptions.length > 0 ? descriptions : [anomalie.description];
  // DEUX BORNES, ET IL FAUT LES DEUX. Chaque description est bornée pour
  // qu'une seule, très longue, n'écrase pas les autres ; puis la LIGNE entière
  // l'est aussi, parce que rien ne borne le NOMBRE de descriptions d'un groupe
  // — un groupe « reseau » en agrège une par détecteur. Sans la seconde borne,
  // la pire ligne de symptômes croissait sans limite, et le plafond de ligne
  // posé au seuil de `core/ia` la coupait en silence : la troncature muette
  // que ce plafond existe précisément pour empêcher.
  return surUneLigne(brutes.map((description) => surUneLigne(description, maxChars)).join(' ; '), maxChars);
}

/** Une section, réduite à ce que le modèle en voit. */
export interface SectionNormalisee {
  id: string;
  categorie: string;
  gravite: string;
  statut: string;
  symptomes: string;
  /** `chemin (viewports)` — les chemins viennent du SITE. */
  localisations: string[];
}

export interface FaitsNormalises {
  langue: string;
  /** Type de site du profil, ou null en mode dégradé : vocabulaire fermé, jamais de prose. */
  typeSite: string | null;
  sections: SectionNormalisee[];
}

/**
 * Réduit le rapport business structurel à ce qui sera MONTRÉ.
 *
 * Les sections au-delà de `sectionsMax` sont écartées de la RÉDACTION, jamais
 * du rapport : elles gardent leurs faits, leur statut et leurs localisations,
 * et n'auront simplement pas de prose. Un plafond borne une dépense ; il ne
 * fait pas disparaître une anomalie d'un rapport destiné à celui qui la subit.
 */
export function normaliserFaits(
  rapportBusiness: RapportBusiness,
  rapport: Rapport,
  config: ConfigRapport,
): FaitsNormalises {
  const descriptionsParGroupe = new Map(
    (rapport.groupes ?? []).map((resultat) => [resultat.groupe.cle, resultat.groupe.descriptions]),
  );
  const anomaliesParGroupe = new Map(
    rapport.anomalies.filter((anomalie) => anomalie.groupe !== undefined).map((anomalie) => [anomalie.groupe ?? '', anomalie]),
  );

  const sections = rapportBusiness.sections
    .slice(0, Math.max(1, config.sectionsMax))
    // MUR COUVRANT (cahier P2-11, C3-b, Q3) et RECOUVREMENT À PREUVE FAIBLE
    // (voie A) : ces sections portent une prose FIXE à garantie sémantique ;
    // elles ne sont PAS envoyées à la rédaction, qui les reformulerait (et
    // sur-promettrait sur une preuve faible). Exclues ici, elles survivent par
    // construction (le modèle ne les voit pas, ne les réécrit pas, ne les paie pas).
    .filter((section) => section.murCouvrant !== true && section.preuveFaible !== true)
    .map((section): SectionNormalisee => {
      const anomalie = section.groupe === undefined ? undefined : anomaliesParGroupe.get(section.groupe);
      return {
        id: section.id,
        categorie: section.categorie,
        gravite: section.gravite,
        statut: section.statut,
        symptomes:
          anomalie === undefined
            ? ''
            : symptomesDe(
                anomalie,
                section.groupe === undefined ? undefined : descriptionsParGroupe.get(section.groupe),
                config.symptomesMaxChars,
              ),
        localisations: localisationsMontrees(section, config),
      };
    });

  return {
    langue: rapportBusiness.langue,
    typeSite: rapport.profil?.typeSite ?? null,
    sections,
  };
}

/**
 * L'hôte de la ressource d'une autre origine qui fonde l'anomalie, lu dans sa
 * preuve réseau — SEULE source de cet hôte dans tout le moteur.
 *
 * Il ne figure PAS dans ce que le modèle voit (cahier P2-2, contrat 3) : le
 * rapport le pose lui-même à côté de la prose. Le lui montrer l'aurait invité
 * à le recopier, donc à écrire un fait — et à écrire des chiffres, puisqu'un
 * hôte peut n'être que cela (`127.0.0.1`). `URL` le normalise (minuscules, punycode) : c'est un nom
 * d'hôte, jamais une phrase. Il reste une donnée NON FIABLE — le site l'a
 * choisi — et passe par le même bloc balisé que les chemins.
 */
export function hoteDePreuve(anomalie: Anomalie): string | undefined {
  const preuves = (anomalie as { preuves?: readonly Signal[] }).preuves ?? [];
  const reseau = preuves.find(
    (preuve): preuve is Extract<Signal, { type: 'reponse-reseau' | 'requete-echouee' }> =>
      (preuve.type === 'reponse-reseau' || preuve.type === 'requete-echouee') && !preuve.interne,
  );
  if (reseau === undefined) {
    return undefined;
  }
  try {
    const hote = new URL(reseau.urlRessource).hostname;
    return hote === '' ? undefined : hote;
  } catch {
    return undefined;
  }
}

function localisationsMontrees(section: SectionRapport, config: ConfigRapport): string[] {
  return section.localisations.slice(0, Math.max(1, config.localisationsMaxParSection)).map((localisation) => {
    const page = surUneLigne(localisation.page, config.cheminMaxChars);
    return localisation.viewports.length === 0 ? page : `${page} (${localisation.viewports.join(', ')})`;
  });
}

/**
 * Les faits d'une section, ligne à ligne, dans l'ordre d'affichage.
 *
 * La STRUCTURE est conservée : rien n'est assemblé ici. C'est
 * `core/ia/contexte-redaction.ts` qui borne puis sérialise, et il le fait sur
 * des sections entières — une version antérieure assemblait d'abord et
 * tronquait ensuite au caractère, ce qui coupait au milieu d'une section et
 * faisait exiger du modèle une prose sur des faits qu'il n'avait pas reçus.
 */
function lignesDe(section: SectionNormalisee): string[] {
  return [
    `catégorie: ${section.categorie}`,
    `gravité: ${section.gravite}`,
    `statut: ${section.statut}`,
    `symptôme technique: ${section.symptomes}`,
    `pages: ${section.localisations.join(' | ')}`,
  ];
}

/**
 * Le contexte complet d'un appel de rédaction, prêt pour le prompt ET pour la
 * clé.
 *
 * Aucun filtrage d'identifiants ici : la borne de `core/ia` retire des
 * sections ENTIÈRES, donc l'énumération qu'elle rend est par construction ce
 * que le modèle a sous les yeux. C'est la correction d'un défaut de fond —
 * un filtre qui vérifiait la survie de la seule ligne d'en-tête laissait
 * énumérée une section dont les faits avaient été coupés.
 */
export function contexteRedaction(faits: FaitsNormalises): ContexteRedaction {
  return {
    langue: faits.langue,
    enTete: [`type de site: ${faits.typeSite ?? '(non déterminé)'}`],
    sections: faits.sections.map((section) => ({ id: section.id, lignes: lignesDe(section) })),
  };
}

// L'empreinte de contrat et la clé de cassette vivent dans
// `core/ia/contexte-redaction.ts`, avec les bornes qu'elles hachent : c'est
// `core/ia` qui possède les clés de cassette, et ce module-ci qui possède la
// construction du contexte. Le sens des dépendances reste unique —
// `core/rapport` connaît `core/ia`, jamais l'inverse.
