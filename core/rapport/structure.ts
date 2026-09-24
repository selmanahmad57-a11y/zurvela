/**
 * LA STRUCTURE FACTUELLE du rapport business : tout ce qu'un humain lira et
 * que le modèle n'a pas le droit d'écrire.
 *
 * Ce module transforme un `Rapport` technique en `RapportBusiness` SANS
 * PROSE. C'est déjà un rapport complet et lisible — statuts, gravités, pages,
 * viewports, nombre de signalements écartés — et c'est très exactement ce que
 * le mode dégradé publie quand aucune rédaction n'est possible
 * (constitution §4 : le moteur reste utile sans IA).
 *
 * ── LA RÈGLE MAÎTRESSE DE LA BRIQUE ─────────────────────────────────────────
 *
 * Tout ce qui se lit comme un FAIT est posé ici, en code, depuis le rapport
 * technique. Le modèle, lui, ne remplira que quatre champs de phrases par
 * section plus deux au global. Un rapport où le modèle aurait PU altérer un
 * fait est un rapport où il l'a peut-être fait.
 *
 * ── CE QUI N'EST PAS CHIFFRÉ, ET POURQUOI ───────────────────────────────────
 *
 * `impactChiffre` n'est JAMAIS rempli en Phase 1. Le moteur ne connaît ni le
 * panier moyen, ni le trafic, ni la marge : tout montant qu'il produirait
 * serait une estimation déguisée en mesure, adressée à la personne la moins
 * armée pour s'en défendre (APPRENTISSAGES n°6). Le logement existe pour le
 * jour où le client fournira ses grandeurs — et un test vérifie qu'il reste
 * vide, parce qu'un logement vide non gardé finit par se remplir tout seul.
 */
import {
  VERDICTS_RETENUS,
  type Anomalie,
  type Gravite,
  type LocalisationLisible,
  type Rapport,
  type RapportBusiness,
  type ResultatGroupe,
  type SectionRapport,
  type StatutSection,
} from '../types.js';
import { AUCUNE_VERIFICATION, chiffresDe, statutDe, type ChiffresStatut } from './statuts.js';
import { formulerStatut, type LangueRapport } from './voix.js';

/**
 * Ordre d'affichage des gravités : le plus grave d'abord. Un lecteur qui
 * n'ira pas au bout doit avoir lu ce qui l'empêche de vendre.
 */
const RANG_GRAVITE: Readonly<Record<Gravite, number>> = { bloquant: 0, important: 1, mineur: 2 };

/**
 * Ordre d'affichage des statuts, à gravité égale : du plus ÉTABLI au moins
 * établi. Ce n'est pas une hiérarchie d'importance — une découverte peut être
 * la panne la plus grave du scan — c'est une hiérarchie de CERTITUDE, et elle
 * range le rapport dans l'ordre où il se défend.
 */
const RANG_STATUT: Readonly<Record<StatutSection, number>> = {
  confirmee: 0,
  intermittente: 1,
  'constatee-au-rejeu': 2,
  'diagnostic-site': 3,
};

/** Ce que la construction rend : le rapport, et ce qu'elle n'a pas su situer. */
export interface StructureConstruite {
  rapportBusiness: RapportBusiness;
  /**
   * Anomalies RETENUES par le protocole auxquelles aucun statut honnête ne
   * correspond (verdict non retenu, ou aucun verdict du tout).
   *
   * Elles ne sont ni publiées sous une formulation fausse, ni perdues en
   * silence : elles remontent ici pour être journalisées par l'appelant. En
   * sortie du protocole réel, cette liste est TOUJOURS vide — et un test le
   * vérifie, sans quoi la garde serait une garde qui ne peut pas se déclencher.
   */
  nonSituees: Anomalie[];
}

/**
 * Chemin d'URL d'une localisation : l'adresse complète (protocole, hôte,
 * port) n'apprend rien à un lecteur, le chemin lui dit OÙ.
 *
 * AUCUNE TRONCATURE ICI. `cheminMaxChars` borne ce que le MODÈLE voit, pas ce
 * que le CLIENT lit — exactement comme `localisationsMaxParSection`, dont
 * c'est le jumeau à deux lignes de distance. Le corriger sans corriger
 * celui-ci laissait le rapport publié amputer l'adresse d'une page où le
 * défaut se manifeste : le propriétaire du site reçoit une URL tronquée de la
 * page qu'il doit aller réparer. L'adresse est celle de SON site ; la lui
 * montrer entière est la moindre des choses, et le rendu l'échappe.
 */
function cheminDe(urlOuEtape: string): string {
  try {
    return new URL(urlOuEtape).pathname;
  } catch {
    // Pas une URL absolue : c'est déjà un chemin ou un libellé d'étape.
    return urlOuEtape;
  }
}

/**
 * Où l'anomalie se manifeste, dit à un humain : des pages, et les viewports
 * où chacune a été observée.
 *
 * Les viewports d'une page viennent de ses localisations quand elles en
 * déclarent — c'est le cas des anomalies qui DÉPENDENT du viewport, et c'est
 * ce qui fait survivre « mobile uniquement » jusqu'à la phrase finale, trois
 * briques après sa collecte. Quand aucune ne le fait, l'anomalie ne dépend pas
 * du viewport : on affiche ceux où le groupe a été observé, ce qui est un
 * constat et non une extrapolation.
 */
export function localisationsLisibles(anomalie: Anomalie): LocalisationLisible[] {
  const sources =
    anomalie.localisations !== undefined && anomalie.localisations.length > 0
      ? anomalie.localisations
      : [{ urlOuEtape: anomalie.urlOuEtape, ...(anomalie.viewport === undefined ? {} : { viewport: anomalie.viewport }) }];
  const observes = (anomalie.observations ?? []).map((observation) => observation.viewport);

  const parPage = new Map<string, Set<string>>();
  for (const source of sources) {
    const page = cheminDe(source.urlOuEtape);
    const viewports = parPage.get(page) ?? new Set<string>();
    if (source.viewport !== undefined) {
      viewports.add(source.viewport);
    }
    parPage.set(page, viewports);
  }
  // AUCUNE TRONCATURE ICI. `localisationsMaxParSection` borne ce que le
  // MODÈLE voit (`normaliserFaits`), pas ce que le CLIENT lit : sa description
  // le dit, et l'appliquer au rapport publié faisait disparaître des pages où
  // le défaut se manifeste — un plafond de dépense qui ampute un constat.
  return [...parPage.entries()]
    .map(([page, viewports]) => ({
      page,
      viewports: viewports.size > 0 ? [...viewports] : [...new Set(observes)],
    }));
}

/** Index des résultats de groupe par clé : la source des CHIFFRES d'un statut. */
function indexerGroupes(groupes: ResultatGroupe[] | undefined): Map<string, ResultatGroupe> {
  return new Map((groupes ?? []).map((resultat) => [resultat.groupe.cle, resultat]));
}

function chiffresPour(anomalie: Anomalie, index: Map<string, ResultatGroupe>): ChiffresStatut {
  const resultat = anomalie.groupe === undefined ? undefined : index.get(anomalie.groupe);
  return resultat === undefined ? AUCUNE_VERIFICATION : chiffresDe(resultat);
}

/**
 * Signalements ÉCARTÉS par les re-vérifications : le chiffre NEUTRE de la
 * brique 3, compté en GROUPES DE CAUSE RACINE et jamais en candidates.
 *
 * Trois candidates issues d'une même ressource en échec ne sont pas trois
 * fausses alertes évitées : les compter ainsi ferait grossir notre mérite en
 * dégradant la consolidation. Un groupe écarté qui a tout de même publié une
 * DÉCOUVERTE est retiré du compte — il a produit une section, l'annoncer
 * écarté serait le compter deux fois, dans les deux sens opposés.
 *
 * Sa DÉCOMPOSITION (fausses alertes évitées / anomalies réelles perdues)
 * n'apparaît jamais ici : elle exige la vérité terrain, que seul le banc
 * possède. Un rapport client ne peut pas savoir laquelle des deux il a faite.
 *
 * Rend `null` quand aucune consolidation n'a eu lieu : voir le contrat de
 * `RapportBusiness.nbEcartes`.
 */
/**
 * Un groupe a-t-il été RÉELLEMENT re-vérifié ?
 *
 * La question n'est pas « le protocole a-t-il rendu un verdict » — il en rend
 * toujours un — mais « une re-exécution a-t-elle eu lieu et dit quelque chose
 * du site ». Deux chemins écartent un groupe SANS l'éprouver, et tous deux
 * laissent `groupes` défini et plein :
 *  - l'échéance atteinte avant son tour (`tentatives: []`) ;
 *  - tous les rejeux en échec d'outillage (aucune tentative exploitable).
 *
 * C'est la correction d'un défaut que la revue a construit : le refus de
 * compter était conditionné à l'ABSENCE du tableau `groupes`, c'est-à-dire au
 * seul cas où le protocole avait LEVÉ. Sur les deux chemins ci-dessus — de
 * loin les plus fréquents — le rapport annonçait « N signalements écartés par
 * nos re-vérifications » sans qu'aucune re-vérification n'ait eu lieu.
 */
function aEteReverifie(resultat: ResultatGroupe): boolean {
  return chiffresDe(resultat).nbVerifications > 0;
}

export function compterEcartes(rapport: Rapport, clesPubliees: Set<string>): number | null {
  // PAS DE GROUPES, PAS DE COMPTE. Sans consolidation, il n'y a eu ni cause
  // racine ni re-exécution : `ecartees` ne contient que des candidates, et
  // les publier sous la phrase « écartés par nos re-vérifications » serait
  // faux deux fois — mauvaise unité, et mauvais verbe. Le cas arrive
  // précisément quand le protocole est TOMBÉ, c'est-à-dire au moment où un
  // chiffre flatteur serait le plus trompeur.
  if (rapport.groupes === undefined) {
    return null;
  }
  return groupesEcartes(rapport, clesPubliees).filter(aEteReverifie).length;
}

/** Les groupes écartés qui n'ont produit aucune section : le domaine des deux comptes. */
function groupesEcartes(rapport: Rapport, clesPubliees: Set<string>): ResultatGroupe[] {
  return (rapport.groupes ?? []).filter(
    (resultat) => !VERDICTS_RETENUS.includes(resultat.verdict) && !clesPubliees.has(resultat.groupe.cle),
  );
}

/**
 * Signalements écartés SANS avoir été re-vérifiés. Le pendant honnête de
 * `compterEcartes` : ensemble, les deux couvrent tout ce que le protocole a
 * écarté, et séparément ils disent ce qui a été ÉPROUVÉ et ce qui a seulement
 * été abandonné.
 */
export function compterNonVerifies(rapport: Rapport, clesPubliees: Set<string>): number | null {
  if (rapport.groupes === undefined) {
    return null;
  }
  return groupesEcartes(rapport, clesPubliees).filter((resultat) => !aEteReverifie(resultat)).length;
}

/**
 * Construit le rapport business STRUCTUREL. Aucun appel, aucun réseau, aucune
 * lecture de page : le rapport technique suffit, et c'est la garantie qui rend
 * cette étape rejouable et notable.
 *
 * ── ET AUCUNE CONFIGURATION ─────────────────────────────────────────────────
 *
 * La signature le dit : le rapport PUBLIÉ est une fonction du seul rapport
 * technique et de la langue. Plus aucune borne n'y touche. C'est l'aboutissement
 * d'une correction en deux temps — `localisationsMaxParSection` puis
 * `cheminMaxChars` tronquaient ici ce que leur description disait ne borner
 * que pour le modèle, et le second est resté deux lignes à côté du premier
 * pendant toute une revue. Les bornes vivent désormais entièrement du côté de
 * ce que le MODÈLE voit (`normaliserFaits`, `bornerContexteRedaction`) : un
 * réglage de dépense ne peut plus amputer ce que le client lit.
 */
export function construireStructure(rapport: Rapport, langue: LangueRapport): StructureConstruite {
  const index = indexerGroupes(rapport.groupes);
  const nonSituees: Anomalie[] = [];
  const situees: { anomalie: Anomalie; statut: StatutSection }[] = [];

  for (const anomalie of rapport.anomalies) {
    const statut = statutDe(anomalie);
    if (statut === null) {
      nonSituees.push(anomalie);
      continue;
    }
    situees.push({ anomalie, statut });
  }

  // Le tri est TOTAL et déterministe : gravité, puis certitude, puis l'ordre
  // du rapport technique. Sans le dernier critère, deux anomalies de même
  // gravité et même statut pourraient permuter d'un run à l'autre, et la clé
  // de cassette de la rédaction avec elles — l'instrument cesserait d'être
  // déterministe sans qu'une seule ligne du moteur ne change.
  const triees = situees
    .map((entree, rang) => ({ ...entree, rang }))
    .sort(
      (gauche, droite) =>
        RANG_GRAVITE[gauche.anomalie.graviteEstimee] - RANG_GRAVITE[droite.anomalie.graviteEstimee] ||
        RANG_STATUT[gauche.statut] - RANG_STATUT[droite.statut] ||
        gauche.rang - droite.rang,
    );

  const sections: SectionRapport[] = triees.map(({ anomalie, statut }, rang) => ({
    id: `s${rang + 1}`,
    ...(anomalie.groupe === undefined ? {} : { groupe: anomalie.groupe }),
    categorie: anomalie.categorie,
    gravite: anomalie.graviteEstimee,
    statut,
    statutFormule: formulerStatut(statut, langue, chiffresPour(anomalie, index)),
    localisations: localisationsLisibles(anomalie),
    // `impactChiffre` : ABSENT, et c'est la décision, pas un oubli (voir l'en-tête).
    titre: '',
    constat: '',
    impact: '',
    actionSuggeree: '',
  }));

  const clesPubliees = new Set(sections.map((section) => section.groupe).filter((cle): cle is string => cle !== undefined));

  return {
    rapportBusiness: {
      langue,
      synthese: '',
      sections,
      nbEcartes: compterEcartes(rapport, clesPubliees),
      nbNonVerifies: compterNonVerifies(rapport, clesPubliees),
      ligneMethode: '',
      // Aucune prose n'a encore été demandée : zéro section rédigée. La
      // rédaction remplacera ce compte par ce qu'elle a réellement écrit.
      nbSectionsRedigees: 0,
      // Rien n'a encore été montré à personne : `null`, et non zéro.
      nbLocalisationsMasquees: null,
      sansProse: true,
    },
    nonSituees,
  };
}
