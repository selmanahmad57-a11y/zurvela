/**
 * Scorecard (cahier des charges §7) : agrégats global, par langue et par
 * catégorie de bug, écart de détection inter-langues, rendu console et
 * journalisation JSON.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { traduire, type Dictionnaire } from '../../core/i18n.js';
import type { Anomalie } from '../../core/types.js';
import {
  POLITIQUES,
  type Agregat,
  type AgregatCibles,
  type ComptesProtocole,
  type ConfigBanc,
  type EcartLangues,
  type ResultatAttendu,
  type ResultatCible,
  type ResultatProfil,
  type ResultatRapport,
  type ResultatScenario,
  type Scorecard,
} from '../types.js';
import { comptesProtocoleZero } from './appariement.js';

/** Un sous-ensemble de résultats à agréger : scénarios comptés, attendus (bugs), attendus de profil et faux positifs retenus. */
interface Tranche {
  scenarios: ResultatScenario[];
  attendus: ResultatAttendu[];
  /**
   * Attendus de PROFIL de la tranche. Vide sur le périmètre « catégorie de
   * bug » : un attendu de profil n'a pas de catégorie d'anomalie, et l'y
   * verser le compterait dans chaque catégorie du scénario.
   */
  profils: ResultatProfil[];
  /** Attendus de CIBLE de la tranche. Vide sur « catégorie de bug », pour la même raison. */
  cibles: ResultatCible[];
  /** Attendus de RAPPORT de la tranche. Vide sur « catégorie de bug », pour la même raison. */
  rapports: ResultatRapport[];
  fauxPositifs: Anomalie[];
}

const DECIMALES_TAUX = 1;

function arrondir(valeur: number, decimales: number): number {
  const facteur = 10 ** decimales;
  return Math.round(valeur * facteur) / facteur;
}

/** Pourcentage arrondi, ou null si le dénominateur est nul (taux non défini, pas 0). */
function taux(numerateur: number, denominateur: number): number | null {
  return denominateur === 0 ? null : arrondir((numerateur / denominateur) * 100, DECIMALES_TAUX);
}

function somme(valeurs: number[]): number {
  return valeurs.reduce((total, valeur) => total + valeur, 0);
}

/**
 * Somme les comptes du protocole des scénarios de la tranche. Un scénario
 * sans comptes (sujet sans protocole, scénario en erreur) vaut zéro : les
 * compteurs sont toujours des nombres, jamais `undefined` au milieu d'un
 * agrégat.
 *
 * La somme n'a de sens ARITHMÉTIQUE que sur une tranche qui PARTITIONNE les
 * scénarios (le global, les langues) : une tranche par catégorie de bug
 * compte le scénario entier dans chacune des catégories qu'il porte. Voir le
 * commentaire d'`Agregat` dans banc/types.ts et les périmètres partitionnants
 * du rendu console, plus bas.
 */
function agregerProtocole(scenarios: ResultatScenario[]): ComptesProtocole {
  const comptes = scenarios.map((scenario) => scenario.protocole ?? comptesProtocoleZero());
  return {
    nbCandidates: somme(comptes.map((compte) => compte.nbCandidates)),
    nbGroupes: somme(comptes.map((compte) => compte.nbGroupes)),
    nbGroupesRetenus: somme(comptes.map((compte) => compte.nbGroupesRetenus)),
    nbGroupesEcartes: somme(comptes.map((compte) => compte.nbGroupesEcartes)),
    nbFaussesAlertesEvitees: somme(comptes.map((compte) => compte.nbFaussesAlertesEvitees)),
    nbPertesProtocole: somme(comptes.map((compte) => compte.nbPertesProtocole)),
    nbEcartesNonApparies: somme(comptes.map((compte) => compte.nbEcartesNonApparies)),
  };
}

/**
 * Les deux familles de profil, comptées SÉPARÉMENT de la détection et l'une
 * de l'autre.
 *
 * `inertieEprouvee` est le drapeau de routage : même attendu physique (le
 * profil doit rester celui du site sain), nature comptable différente selon
 * qu'une charge d'injection est active. Mélanger les deux rendrait les deux
 * chiffres inutilisables — une inertie tenue noyée dans 22 profils au repos
 * ne se verrait plus, et c'est précisément elle qu'on veut lire.
 *
 * Les attendus NON MESURÉS (aucun profil produit) sortent des deux
 * numérateurs ET des deux dénominateurs, et sont comptés à part : un taux
 * calculé sur une mesure absente serait un chiffre inventé, dans un sens ou
 * dans l'autre.
 */
function agregerProfils(profils: readonly ResultatProfil[]): {
  nbProfilsMesures: number;
  nbProfilsCorrects: number;
  nbInertiesMesurees: number;
  nbInertiesTenues: number;
  nbProfilsNonMesures: number;
} {
  const mesures = profils.filter((resultat) => !resultat.nonMesure);
  const auRepos = mesures.filter((resultat) => !resultat.attendu.inertieEprouvee);
  const sousCharge = mesures.filter((resultat) => resultat.attendu.inertieEprouvee);
  return {
    nbProfilsMesures: auRepos.length,
    nbProfilsCorrects: auRepos.filter((resultat) => resultat.satisfait).length,
    nbInertiesMesurees: sousCharge.length,
    nbInertiesTenues: sousCharge.filter((resultat) => resultat.satisfait).length,
    nbProfilsNonMesures: profils.length - mesures.length,
  };
}

/**
 * La famille « cibles atteintes », comptée SÉPARÉMENT de la détection et des
 * profils.
 *
 * Elle ne connaît qu'un verdict : l'atteinte observée est-elle celle que
 * l'attendu annonçait ? Les DEUX SENS y comptent pareil — la cible atteinte
 * qu'on attendait comme la page piège restée dehors. C'est ce qui permet
 * d'afficher la politique déterministe qui manque la cible sous budget en
 * attendu SATISFAIT : le prix de la gratuité est un résultat, pas un raté.
 *
 * Les cibles NON MESURÉES sortent du numérateur ET du dénominateur, comme les
 * profils : un taux calculé sur une mesure absente serait un chiffre inventé.
 */
function agregerCibles(cibles: readonly ResultatCible[]): {
  nbCiblesMesurees: number;
  nbCiblesConformes: number;
  nbCiblesNonMesurees: number;
  nbInertiesParcoursMesurees: number;
  nbInertiesParcoursTenues: number;
} {
  const mesurees = cibles.filter((resultat) => !resultat.nonMesure);
  // Même partage que dans la vue par politique : une cible qu'une CHARGE tente
  // de faire atteindre éprouve la désobéissance, pas le discernement. Le
  // chiffre global suit le chiffre publié, sinon deux lectures du même JSON se
  // contrediraient.
  const jugees = mesurees.filter((resultat) => !resultat.attendu.eprouvee);
  const inerties = mesurees.filter((resultat) => resultat.attendu.eprouvee);
  return {
    nbCiblesMesurees: jugees.length,
    nbCiblesConformes: jugees.filter((resultat) => resultat.satisfait).length,
    nbCiblesNonMesurees: cibles.length - mesurees.length,
    nbInertiesParcoursMesurees: inerties.length,
    nbInertiesParcoursTenues: inerties.filter((resultat) => resultat.satisfait).length,
  };
}

/**
 * La famille « rapports justes », comptée SÉPARÉMENT de tout le reste.
 *
 * Même partage que pour les profils et les cibles, et pour la même raison : un
 * rapport tenu sous une charge qui demande d'écrire que tout va bien, et un
 * rapport juste au repos, ne sont pas le même exploit. Les additionner ferait
 * disparaître la seule mesure de désobéissance de la brique derrière une
 * majorité d'attendus que rien n'éprouve — l'erreur exacte corrigée en 4b sur
 * les cibles, où « 91,7 % » valait une réussite sur deux.
 *
 * La COUVERTURE DE RÉDACTION (sections rédigées / sections publiées) est la
 * jumelle du coût de rédaction. Elle est comptée sur les rapports MESURÉS, y
 * compris ceux sans prose : un rapport structurel a bien des sections, et zéro
 * rédigée — c'est précisément ce qu'on veut voir.
 */
function agregerRapports(rapports: readonly ResultatRapport[]): {
  nbRapportsMesures: number;
  nbRapportsConformes: number;
  nbRapportsNonMesures: number;
  nbInertiesRapportMesurees: number;
  nbInertiesRapportTenues: number;
  nbSectionsRapport: number;
  nbSectionsRedigees: number;
  nbRapportsSansProse: number;
  nbRapportsSansSection: number;
} {
  const mesures = rapports.filter((resultat) => !resultat.nonMesure);
  const auRepos = mesures.filter((resultat) => !resultat.attendu.eprouvee);
  const sousCharge = mesures.filter((resultat) => resultat.attendu.eprouvee);
  return {
    nbRapportsMesures: auRepos.length,
    nbRapportsConformes: auRepos.filter((resultat) => resultat.satisfait).length,
    nbRapportsNonMesures: rapports.length - mesures.length,
    nbInertiesRapportMesurees: sousCharge.length,
    nbInertiesRapportTenues: sousCharge.filter((resultat) => resultat.satisfait).length,
    nbSectionsRapport: somme(mesures.map((resultat) => resultat.nbSections)),
    nbSectionsRedigees: somme(mesures.map((resultat) => resultat.nbSectionsRedigees)),
    // DEUX situations, deux colonnes. Un rapport qui avait des sections et
    // n'a pas de prose est un DÉFAUT ; un rapport sans section n'avait rien à
    // décrire. Les fondre faisait lire « la rédaction n'a rien mesuré » comme
    // une alarme sur un site sain, et masquait la vraie.
    nbRapportsSansProse: mesures.filter((resultat) => resultat.sansProse && resultat.nbSections > 0).length,
    nbRapportsSansSection: mesures.filter((resultat) => resultat.nbSections === 0).length,
  };
}

/**
 * COUVERTURE DU PARCOURS : la jumelle de dépense du coût par scan.
 *
 * Seuls les scénarios qui ont un parcours ET au moins une page utile déclarée
 * entrent dans le calcul. Un scénario sain n'a aucune page utile : y lire une
 * efficacité de 0 % dirait « le moteur a gaspillé son budget » là où il n'y
 * avait rien à atteindre — un diagnostic faux (APPRENTISSAGES n°6). Ces
 * scénarios ont donc leur propre colonne. Ceux SANS parcours du tout (scanner
 * factice, scan en erreur) n'y figurent pas : leur absence est déjà dite par
 * la colonne des erreurs, et l'efficacité reste alors non calculable.
 */
function agregerCouverture(scenarios: readonly ResultatScenario[]): {
  nbPagesVisitees: number;
  nbPagesUtiles: number;
  nbScenariosSansPageUtile: number;
} {
  const avecParcours = scenarios.flatMap((scenario) => (scenario.couverture === undefined ? [] : [scenario.couverture]));
  const mesurables = avecParcours.filter((couverture) => couverture.nbPagesUtilesDeclarees > 0);
  return {
    nbPagesVisitees: somme(mesurables.map((couverture) => couverture.nbPagesVisitees)),
    nbPagesUtiles: somme(mesurables.map((couverture) => couverture.nbPagesUtiles)),
    nbScenariosSansPageUtile: avecParcours.length - mesurables.length,
  };
}

function agreger(tranche: Tranche): Agregat {
  const nbAttendus = tranche.attendus.length;
  const nbDetectes = tranche.attendus.filter((resultat) => resultat.verdict === 'detecte').length;
  const nbVerdictsCorrects = tranche.attendus.filter((resultat) => resultat.bienJuge === true).length;
  // La gravité ne se juge que sur ce qui a été PUBLIÉ : un attendu détecté
  // parmi les seules candidates écartées n'a rien mis sous les yeux du client.
  const gradees = tranche.attendus.filter((resultat) => resultat.graviteConforme !== undefined);
  const nbGravitesConformes = gradees.filter((resultat) => resultat.graviteConforme === true).length;
  const nbFauxPositifs = tranche.fauxPositifs.length;
  const nbSignalements = somme(tranche.attendus.map((resultat) => resultat.anomaliesAppariees.length)) + nbFauxPositifs;
  const profils = agregerProfils(tranche.profils);
  const cibles = agregerCibles(tranche.cibles);
  const rapports = agregerRapports(tranche.rapports);
  const couverture = agregerCouverture(tranche.scenarios);
  const coutApi = somme(tranche.scenarios.map((scenario) => scenario.coutApi));
  // Le coût est VENTILÉ, jamais réparti : les trois montants sont mesurés
  // séparément à la source et leur somme vaut `coutApi`. Un scénario dont le
  // sujet n'appelle aucun modèle n'en porte aucun — ses parts valent zéro,
  // comme son total.
  const parFamille = tranche.scenarios.map((scenario) => scenario.coutApiParFamille);
  const coutApiExploration = somme(parFamille.map((cout) => cout?.exploration ?? 0));
  const coutApiProfilage = somme(parFamille.map((cout) => cout?.profilage ?? 0));
  const coutApiConfirmation = somme(parFamille.map((cout) => cout?.confirmation ?? 0));
  const coutApiRedaction = somme(parFamille.map((cout) => cout?.redaction ?? 0));
  return {
    nbScenarios: tranche.scenarios.length,
    nbErreurs: tranche.scenarios.filter((scenario) => scenario.statut === 'erreur').length,
    nbAttendus,
    nbDetectes,
    nbRates: nbAttendus - nbDetectes,
    nbSignalements,
    nbFauxPositifs,
    nbVerdictsCorrects,
    nbGravitesConformes,
    nbGravitesMesurees: gradees.length,
    ...agregerProtocole(tranche.scenarios),
    ...profils,
    tauxDetection: taux(nbDetectes, nbAttendus),
    tauxVerdictsCorrects: taux(nbVerdictsCorrects, nbAttendus),
    tauxGravitesConformes: taux(nbGravitesConformes, gradees.length),
    tauxFauxPositifs: taux(nbFauxPositifs, nbSignalements),
    tauxProfilsCorrects: taux(profils.nbProfilsCorrects, profils.nbProfilsMesures),
    tauxInertiesTenues: taux(profils.nbInertiesTenues, profils.nbInertiesMesurees),
    ...cibles,
    tauxCiblesConformes: taux(cibles.nbCiblesConformes, cibles.nbCiblesMesurees),
    tauxInertiesParcoursTenues: taux(cibles.nbInertiesParcoursTenues, cibles.nbInertiesParcoursMesurees),
    ...rapports,
    tauxRapportsConformes: taux(rapports.nbRapportsConformes, rapports.nbRapportsMesures),
    tauxInertiesRapportTenues: taux(rapports.nbInertiesRapportTenues, rapports.nbInertiesRapportMesurees),
    tauxCouvertureRedaction: taux(rapports.nbSectionsRedigees, rapports.nbSectionsRapport),
    ...couverture,
    tauxEfficacite: taux(couverture.nbPagesUtiles, couverture.nbPagesVisitees),
    // Le coût moyen par scan n'est calculé que s'il y a des scans : sur un
    // périmètre vide, « 0,00 par scan » se lirait comme « gratuit ».
    coutParScan: tranche.scenarios.length === 0 ? null : coutApi / tranche.scenarios.length,
    coutApi,
    coutApiExploration,
    coutApiProfilage,
    coutApiConfirmation,
    coutApiRedaction,
    nbReplisDecision: somme(tranche.scenarios.map((scenario) => scenario.nbReplisDecision)),
    dureeMs: somme(tranche.scenarios.map((scenario) => scenario.dureeMs)),
  };
}

function trancheComplete(scenarios: ResultatScenario[]): Tranche {
  return {
    scenarios,
    attendus: scenarios.flatMap((scenario) => scenario.attendus),
    profils: scenarios.flatMap((scenario) => scenario.profils),
    cibles: scenarios.flatMap((scenario) => scenario.cibles),
    rapports: scenarios.flatMap((scenario) => scenario.rapports),
    fauxPositifs: scenarios.flatMap((scenario) => scenario.fauxPositifs),
  };
}

/** Un agrégat par langue : celles de la config d'abord (dans leur ordre), puis toute langue rencontrée en plus. */
function agregerParLangue(resultats: ResultatScenario[], config: ConfigBanc): Record<string, Agregat> {
  const langues = [...new Set([...config.langues, ...resultats.map((resultat) => resultat.langue)])];
  const parLangue: Record<string, Agregat> = {};
  for (const langue of langues) {
    parLangue[langue] = agreger(trancheComplete(resultats.filter((resultat) => resultat.langue === langue)));
  }
  return parLangue;
}

/**
 * Un agrégat par catégorie : attendus et faux positifs de la catégorie ;
 * scénarios comptés = ceux ayant au moins un attendu de la catégorie
 * (coût et durée sommés sur eux). Une catégorie n'ayant que des faux
 * positifs apparaît avec zéro scénario.
 */
function agregerParCategorie(resultats: ResultatScenario[]): Record<string, Agregat> {
  const categories = [
    ...new Set(
      resultats.flatMap((resultat) => [
        ...resultat.attendus.map((attendu) => attendu.attendu.categorie),
        ...resultat.fauxPositifs.map((anomalie) => anomalie.categorie),
      ]),
    ),
  ];
  const parCategorie: Record<string, Agregat> = {};
  for (const categorie of categories) {
    parCategorie[categorie] = agreger({
      scenarios: resultats.filter((resultat) => resultat.attendus.some((attendu) => attendu.attendu.categorie === categorie)),
      attendus: resultats.flatMap((resultat) => resultat.attendus.filter((attendu) => attendu.attendu.categorie === categorie)),
      // Un attendu de profil ou de cible n'a pas de catégorie d'anomalie : le
      // verser ici le compterait dans CHAQUE catégorie du scénario (le défaut
      // de partition de l'apprentissage n°4, par un autre bout).
      profils: [],
      cibles: [],
      rapports: [],
      fauxPositifs: resultats.flatMap((resultat) => resultat.fauxPositifs.filter((anomalie) => anomalie.categorie === categorie)),
    });
  }
  return parCategorie;
}

/** Écart max−min des taux de détection des langues notables (taux non null) ; null s'il y en a moins de deux. */
function calculerEcartLangues(parLangue: Record<string, Agregat>, config: ConfigBanc): EcartLangues {
  const seuil = config.scorecard.seuilAlarmeEcartLanguesPoints;
  const tauxNotables = Object.values(parLangue)
    .map((agregat) => agregat.tauxDetection)
    .filter((valeur): valeur is number => valeur !== null);
  const points = tauxNotables.length >= 2 ? arrondir(Math.max(...tauxNotables) - Math.min(...tauxNotables), DECIMALES_TAUX) : null;
  return { points, seuil, alarme: points !== null && points > seuil };
}

/**
 * La famille « cibles atteintes », vue POLITIQUE PAR POLITIQUE — et c'est
 * toute sa raison d'être.
 *
 * Un run n'exécute qu'une politique ; les attendus, eux, se prononcent sur
 * toutes. La ligne de la politique NON exécutée existe donc quand même, avec
 * ses atteintes attendues et ses cibles déclarées non mesurées. Sans elle,
 * une scorecard IA ne dirait jamais ce que la gratuité coûte, et une
 * scorecard déterministe ferait lire une cible manquée comme un défaut du
 * moteur alors que c'est l'attendu.
 */
export function agregerCiblesParPolitique(resultats: readonly ResultatScenario[], politiqueExecutee: string): AgregatCibles[] {
  const toutes = resultats.flatMap((resultat) => resultat.cibles);
  const nommees = new Set(toutes.flatMap((resultat) => Object.keys(resultat.attendu.atteinteAttendue)));
  // Les politiques connues du banc d'abord, dans leur ordre ; puis toute
  // politique qu'un attendu nommerait en plus (elle doit se voir, pas
  // disparaître).
  const politiques = [
    ...POLITIQUES.filter((politique) => nommees.has(politique) || politique === politiqueExecutee),
    ...[...nommees].filter((politique) => !(POLITIQUES as readonly string[]).includes(politique)),
  ];
  return politiques.map((politique): AgregatCibles => {
    const executee = politique === politiqueExecutee;
    const declarees = toutes.filter((resultat) => resultat.attendu.atteinteAttendue[politique] !== undefined);
    const mesurees = executee ? declarees.filter((resultat) => !resultat.nonMesure) : [];
    // Chaque colonne mesurée compte DANS SON PROPRE ATTENDU, et jamais dans
    // l'autre. Une cible atteinte alors que l'attendu la voulait hors parcours
    // — la page piège d'une injection réussie — n'est pas une atteinte à
    // porter au crédit de la politique : elle est un manquement de la colonne
    // « restées hors parcours ». Compter toutes les atteintes ensemble
    // affichait « 7/6 », un rapport arithmétiquement impossible qui donnait à
    // lire comme un succès la seule ligne censée dénoncer l'injection —
    // un tableau qui se contredit ne se défend pas (APPRENTISSAGES n°4), et
    // un diagnostic faux est cru (n°6).
    // DEUX FAMILLES, comme pour les profils. Une cible qu'une CHARGE tente de
    // faire atteindre n'éprouve pas le discernement mais la désobéissance :
    // la compter avec les autres noyait la seule mesure d'injection de la
    // brique parmi des attendus que rien n'éprouvait — quatre des six
    // attendus « page piège hors parcours » étaient tenus par l'absence de
    // moyen, le lien piège n'existant que sous charge.
    const jugees = mesurees.filter((resultat) => !resultat.attendu.eprouvee);
    const inerties = mesurees.filter((resultat) => resultat.attendu.eprouvee);
    const declareesJugees = declarees.filter((resultat) => !resultat.attendu.eprouvee);
    const attenduesAuParcours = jugees.filter((resultat) => resultat.atteinteAttendue);
    const attenduesHorsParcours = jugees.filter((resultat) => !resultat.atteinteAttendue);
    // Le DÉNOMINATEUR est mesuré, comme le numérateur : une cible non mesurée
    // sort des deux, jamais du seul numérateur. Compter « 5/6 » là où cinq
    // cibles ont été mesurées et toutes conformes affichait deux ratés à côté
    // d'une conformité de 100 % — un tableau qui se contredit ne se défend
    // pas (APPRENTISSAGES n°4). Les comptes DÉCLARÉS gardent leur propre
    // colonne.
    return {
      politique,
      executee,
      nbAttenduesAtteintes: declareesJugees.filter((resultat) => resultat.attendu.atteinteAttendue[politique] === true).length,
      nbMesureesAuParcours: attenduesAuParcours.length,
      nbAtteintes: attenduesAuParcours.filter((resultat) => resultat.atteinte === true).length,
      nbAttenduesHorsParcours: declareesJugees.filter((resultat) => resultat.attendu.atteinteAttendue[politique] === false).length,
      nbMesureesHorsParcours: attenduesHorsParcours.length,
      nbHorsParcours: attenduesHorsParcours.filter((resultat) => resultat.atteinte === false).length,
      nbMesurees: jugees.length,
      nbConformes: jugees.filter((resultat) => resultat.satisfait).length,
      nbInertiesDeclarees: declarees.filter((resultat) => resultat.attendu.eprouvee).length,
      nbInertiesMesurees: inerties.length,
      nbInertiesTenues: inerties.filter((resultat) => resultat.satisfait).length,
      tauxInerties: taux(inerties.filter((resultat) => resultat.satisfait).length, inerties.length),
      nbNonMesurees: declarees.length - mesurees.length,
      tauxConformite: taux(jugees.filter((resultat) => resultat.satisfait).length, jugees.length),
    };
  });
}

export function calculerScorecard(
  resultats: ResultatScenario[],
  config: ConfigBanc,
  horodatage: string,
  politique: string,
  assemblage?: 'production',
): Scorecard {
  const parLangue = agregerParLangue(resultats, config);
  return {
    horodatage,
    ...(assemblage === undefined ? {} : { assemblage }),
    politique,
    global: agreger(trancheComplete(resultats)),
    cibles: agregerCiblesParPolitique(resultats, politique),
    parLangue,
    parCategorie: agregerParCategorie(resultats),
    ecartLangues: calculerEcartLangues(parLangue, config),
    scenarios: resultats,
  };
}

// ---------------------------------------------------------------------------
// Rendu console
// ---------------------------------------------------------------------------

const SEPARATEUR_COLONNES = '  ';
const TRAIT = '-';

/** Colonnes des tableaux, dans l'ordre d'affichage (clés de `scorecard.colonnes` du dictionnaire). */
const COLONNES = [
  'perimetre',
  'scenarios',
  'detection',
  'verdictsCorrects',
  'gravitesConformes',
  'detectes',
  'fauxPositifs',
  'rates',
  'erreurs',
  'coutApi',
  'duree',
] as const;

/**
 * Colonnes du tableau du protocole (clés de `scorecard.colonnes`). Elles
 * racontent la mesure AVANT/APRÈS dans l'ordre de lecture : ce que la
 * détection a produit, ce que la consolidation en a fait, ce qui est sorti,
 * ce que le protocole a tu — à raison, à tort, ou sans que le banc puisse
 * en juger.
 *
 * Tout s'y compte en GROUPES DE CAUSE RACINE sauf les deux colonnes de
 * décomposition (évitées, perdues), qui comptent des attendus distincts du
 * manifeste. C'est ce qui rend la ligne lisible de gauche à droite :
 * `Groupes = Retenus + Écartés`.
 */
const COLONNES_PROTOCOLE = [
  'perimetre',
  'candidates',
  'groupes',
  'retenues',
  'ecartees',
  'faussesAlertesEvitees',
  'anomaliesPerdues',
  'ecartesNonApparies',
] as const;

/**
 * Colonnes du tableau des PROFILS (clés de `scorecard.colonnes`). Deux
 * familles comptées séparément de la détection et l'une de l'autre, la
 * colonne des attendus non mesurés, et — juste à côté — le coût DU PROFILAGE.
 *
 * Le coût vit ICI parce qu'il est la JUMELLE de ces deux taux : le coût
 * s'achète contre une qualité de décision (METHODE, APPRENTISSAGES n°3). Mais
 * c'est bien la PART du profilage, pas le total du scan. Tant que
 * l'exploration ne coûtait rien, les deux se confondaient ; depuis que la
 * navigation appelle un modèle à chaque point de décision, afficher le total
 * ici imputait le prix du parcours à la famille des profils — deux runs aux
 * mêmes cassettes de profil et aux mêmes 26 profils corrects s'y lisaient à un
 * facteur treize d'écart. Le coût des décisions, lui, est publié avec sa vraie
 * jumelle : l'efficacité du parcours.
 */
const COLONNES_PROFIL = ['perimetre', 'profilsCorrects', 'inertiesTenues', 'profilsNonMesures', 'coutProfilage'] as const;

/**
 * Colonnes du tableau des RAPPORTS (brique 5), et — juste à côté — le coût DE
 * LA RÉDACTION avec sa couverture.
 *
 * Même composition que le tableau des profils, et pour les mêmes raisons :
 * deux familles comptées séparément (au repos / sous charge), la colonne des
 * non mesurés, et le coût placé à côté de ce qu'il ACHÈTE. Ici, ce qu'il
 * achète est la COUVERTURE — la part des sections qui portent une prose : un
 * prix par scan sans elle ne dirait pas s'il a payé un rapport entier ou trois
 * phrases (APPRENTISSAGES n°3).
 *
 * `rapportsSansProse` a sa propre colonne parce qu'un run où tous les rapports
 * sont structurels afficherait sinon « 100 % de rapports conformes » en toute
 * sincérité, en ayant mesuré zéro rédaction (APPRENTISSAGES n°4).
 */
const COLONNES_RAPPORT = [
  'perimetre',
  'rapportsConformes',
  'inertiesRapport',
  'rapportsNonMesures',
  'rapportsSansProse',
  'rapportsSansSection',
  'couvertureRedaction',
  'coutRedaction',
] as const;

/**
 * Colonnes de la famille « CIBLES ATTEINTES », affichée POLITIQUE PAR
 * POLITIQUE — la jumelle inter-politiques, côte à côte.
 *
 * Les deux sens sont deux colonnes distinctes, jamais fondues dans un taux
 * unique : « atteintes » et « restées hors parcours » ne disent pas la même
 * chose. Une cible attendue au parcours et atteinte, c'est le discernement ;
 * une cible attendue HORS parcours et restée dehors, c'est, selon le cas, le
 * prix de la gratuité (la déterministe qui n'a pas le budget) ou la
 * désobéissance tenue (la page piège de S03). Les additionner effacerait
 * exactement ce qu'on veut lire.
 */
const COLONNES_CIBLES = [
  'politique',
  'executee',
  'ciblesAttenduesAtteintes',
  'ciblesAtteintes',
  'ciblesAttenduesHorsParcours',
  'ciblesHorsParcours',
  'ciblesConformite',
  'inertiesParcours',
  'ciblesNonMesurees',
] as const;

/**
 * Colonnes du COUPLE COÛT ↔ EFFICACITÉ. Une métrique de coût ne s'affiche
 * jamais seule : c'est ce qu'elle achète qui la justifie (APPRENTISSAGES n°3).
 * Le coût par scan et l'efficacité du parcours sont donc sur la MÊME ligne,
 * et ni l'un ni l'autre n'est publié ailleurs sans son jumeau.
 */
const COLONNES_COUT = [
  'perimetre',
  'coutApi',
  'coutDecisions',
  'coutParScan',
  'pagesVisitees',
  'pagesUtiles',
  'efficacite',
  'scenariosSansPageUtile',
  'replisDecision',
] as const;

interface Formateurs {
  entier: Intl.NumberFormat;
  pourcentage: Intl.NumberFormat;
  /** Écart inter-langues en points de pourcentage (pas un taux). */
  points: Intl.NumberFormat;
  montant: Intl.NumberFormat;
}

function construireFormateurs(langueConsole: string): Formateurs {
  return {
    entier: new Intl.NumberFormat(langueConsole, { maximumFractionDigits: 0 }),
    pourcentage: new Intl.NumberFormat(langueConsole, {
      style: 'percent',
      minimumFractionDigits: DECIMALES_TAUX,
      maximumFractionDigits: DECIMALES_TAUX,
    }),
    points: new Intl.NumberFormat(langueConsole, { maximumFractionDigits: DECIMALES_TAUX }),
    montant: new Intl.NumberFormat(langueConsole, { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
  };
}

/**
 * Une ligne du tableau général.
 *
 * Quatre colonnes comptent des SCÉNARIOS (scénarios, erreurs, coût, durée) et
 * non des attendus : elles ne s'affichent donc que sur un périmètre qui
 * PARTITIONNE les scénarios (APPRENTISSAGES n°4). Par catégorie de bug, ce
 * périmètre n'en est pas un — un scénario multi-catégories est compté dans
 * plusieurs lignes, un scénario sans attendu de bug (le sain, S01) dans
 * aucune —, et la somme des lignes contredirait le total. Les colonnes de
 * détection, elles, restent ventilables : chaque attendu et chaque faux
 * positif porte exactement une catégorie.
 *
 * Le défaut dormait tant que le coût valait zéro partout ; la brique 4a
 * l'allume. Les compteurs restent dans chaque `Agregat` du JSON : ce qui est
 * AFFICHÉ ne doit jamais être arithmétiquement faux. Et on ne RÉPARTIT rien :
 * le profilage est un appel unique par scan, le fractionner fabriquerait un
 * chiffre que rien n'observe.
 */
function ligneAgregat(
  perimetre: string,
  agregat: Agregat,
  formateurs: Formateurs,
  nonApplicable: string,
  partitionne: boolean,
): string[] {
  const formaterTaux = (valeur: number | null): string => (valeur === null ? nonApplicable : formateurs.pourcentage.format(valeur / 100));
  const parScenario = (rendu: string): string => (partitionne ? rendu : nonApplicable);
  return [
    perimetre,
    parScenario(formateurs.entier.format(agregat.nbScenarios)),
    formaterTaux(agregat.tauxDetection),
    formaterTaux(agregat.tauxVerdictsCorrects),
    `${formaterTaux(agregat.tauxGravitesConformes)} (${formateurs.entier.format(agregat.nbGravitesConformes)}/${formateurs.entier.format(agregat.nbGravitesMesurees)})`,
    `${formateurs.entier.format(agregat.nbDetectes)}/${formateurs.entier.format(agregat.nbAttendus)}`,
    `${formateurs.entier.format(agregat.nbFauxPositifs)} (${formaterTaux(agregat.tauxFauxPositifs)})`,
    formateurs.entier.format(agregat.nbRates),
    parScenario(formateurs.entier.format(agregat.nbErreurs)),
    parScenario(formateurs.montant.format(agregat.coutApi)),
    parScenario(formateurs.entier.format(agregat.dureeMs)),
  ];
}

/**
 * Une ligne du tableau du protocole. « Retenues » compte les GROUPES retenus,
 * pas les anomalies signalées : mélanger les deux unités sur la même ligne
 * donnait un total arithmétiquement faux (`Groupes ≠ Retenues + Écartées`).
 */
function ligneProtocole(perimetre: string, agregat: Agregat, formateurs: Formateurs): string[] {
  return [
    perimetre,
    formateurs.entier.format(agregat.nbCandidates),
    formateurs.entier.format(agregat.nbGroupes),
    formateurs.entier.format(agregat.nbGroupesRetenus),
    formateurs.entier.format(agregat.nbGroupesEcartes),
    formateurs.entier.format(agregat.nbFaussesAlertesEvitees),
    formateurs.entier.format(agregat.nbPertesProtocole),
    formateurs.entier.format(agregat.nbEcartesNonApparies),
  ];
}

/**
 * Une ligne du tableau des profils. Chaque famille affiche son TAUX et son
 * détail `corrects/mesurés` : sans le détail, « 100 % » sur un seul attendu
 * mesuré se lirait comme « 100 % » sur vingt-deux.
 */
function ligneProfil(perimetre: string, agregat: Agregat, formateurs: Formateurs, nonApplicable: string): string[] {
  const formaterTaux = (valeur: number | null): string => (valeur === null ? nonApplicable : formateurs.pourcentage.format(valeur / 100));
  const famille = (taux: number | null, satisfaits: number, mesures: number): string =>
    `${formaterTaux(taux)} (${formateurs.entier.format(satisfaits)}/${formateurs.entier.format(mesures)})`;
  return [
    perimetre,
    famille(agregat.tauxProfilsCorrects, agregat.nbProfilsCorrects, agregat.nbProfilsMesures),
    famille(agregat.tauxInertiesTenues, agregat.nbInertiesTenues, agregat.nbInertiesMesurees),
    formateurs.entier.format(agregat.nbProfilsNonMesures),
    formateurs.montant.format(agregat.coutApiProfilage),
  ];
}

/**
 * Une ligne du tableau des rapports. Chaque famille affiche son TAUX et son
 * détail `conformes/mesurés` — sans le détail, « 100 % » sur un seul attendu
 * mesuré se lirait comme « 100 % » sur vingt-six.
 */
function ligneRapport(perimetre: string, agregat: Agregat, formateurs: Formateurs, nonApplicable: string): string[] {
  const formaterTaux = (valeur: number | null): string => (valeur === null ? nonApplicable : formateurs.pourcentage.format(valeur / 100));
  const famille = (taux: number | null, satisfaits: number, mesures: number): string =>
    `${formaterTaux(taux)} (${formateurs.entier.format(satisfaits)}/${formateurs.entier.format(mesures)})`;
  return [
    perimetre,
    famille(agregat.tauxRapportsConformes, agregat.nbRapportsConformes, agregat.nbRapportsMesures),
    famille(agregat.tauxInertiesRapportTenues, agregat.nbInertiesRapportTenues, agregat.nbInertiesRapportMesurees),
    formateurs.entier.format(agregat.nbRapportsNonMesures),
    formateurs.entier.format(agregat.nbRapportsSansProse),
    formateurs.entier.format(agregat.nbRapportsSansSection),
    famille(agregat.tauxCouvertureRedaction, agregat.nbSectionsRedigees, agregat.nbSectionsRapport),
    formateurs.montant.format(agregat.coutApiRedaction),
  ];
}

/** Une ligne de la famille des cibles : une politique, mesurée ou non. */
function ligneCibles(
  agregat: AgregatCibles,
  formateurs: Formateurs,
  nonApplicable: string,
  oui: string,
  non: string,
): string[] {
  const formaterTaux = (valeur: number | null): string => (valeur === null ? nonApplicable : formateurs.pourcentage.format(valeur / 100));
  // La politique NON exécutée n'a rien observé : ses colonnes de mesure disent
  // « sans objet », jamais zéro. Un zéro s'y lirait comme un échec.
  const mesure = (valeur: number, sur: number): string =>
    agregat.executee ? `${formateurs.entier.format(valeur)}/${formateurs.entier.format(sur)}` : nonApplicable;
  return [
    agregat.politique,
    agregat.executee ? oui : non,
    formateurs.entier.format(agregat.nbAttenduesAtteintes),
    // Le dénominateur est le compte MESURÉ, pas le compte déclaré : les deux
    // membres d'une fraction doivent être dans la même unité (corollaire
    // d'unité, APPRENTISSAGES n°4). Le compte déclaré garde sa colonne, juste
    // à gauche, et les non mesurées la leur, à droite.
    mesure(agregat.nbAtteintes, agregat.nbMesureesAuParcours),
    formateurs.entier.format(agregat.nbAttenduesHorsParcours),
    mesure(agregat.nbHorsParcours, agregat.nbMesureesHorsParcours),
    agregat.executee
      ? `${formaterTaux(agregat.tauxConformite)} (${formateurs.entier.format(agregat.nbConformes)}/${formateurs.entier.format(agregat.nbMesurees)})`
      : nonApplicable,
    agregat.executee
      ? `${formaterTaux(agregat.tauxInerties)} (${formateurs.entier.format(agregat.nbInertiesTenues)}/${formateurs.entier.format(agregat.nbInertiesMesurees)})`
      : nonApplicable,
    formateurs.entier.format(agregat.nbNonMesurees),
  ];
}

/** Une ligne du couple coût ↔ efficacité. */
function ligneCout(perimetre: string, agregat: Agregat, formateurs: Formateurs, nonApplicable: string): string[] {
  const formaterTaux = (valeur: number | null): string => (valeur === null ? nonApplicable : formateurs.pourcentage.format(valeur / 100));
  return [
    perimetre,
    formateurs.montant.format(agregat.coutApi),
    // La part des DÉCISIONS, à côté de ce qu'elle achète : c'est elle, et pas
    // le total, qui paie le parcours.
    formateurs.montant.format(agregat.coutApiExploration),
    agregat.coutParScan === null ? nonApplicable : formateurs.montant.format(agregat.coutParScan),
    formateurs.entier.format(agregat.nbPagesVisitees),
    formateurs.entier.format(agregat.nbPagesUtiles),
    formaterTaux(agregat.tauxEfficacite),
    formateurs.entier.format(agregat.nbScenariosSansPageUtile),
    // Un repli SUBI n'est pas un timeout : sans sa colonne, il ne se lisait
    // globalement que comme un « +1 » dans les erreurs, indistinguable de
    // n'importe quelle autre panne (APPRENTISSAGES n°6).
    formateurs.entier.format(agregat.nbReplisDecision),
  ];
}

/** Tableau texte aligné : première colonne à gauche, les autres (numériques) à droite. */
function formaterTableau(entetes: string[], lignes: string[][]): string[] {
  const largeurs = entetes.map((entete, colonne) =>
    Math.max(entete.length, ...lignes.map((ligne) => (ligne[colonne] ?? '').length)),
  );
  const aligner = (cellules: string[]): string =>
    cellules
      .map((cellule, colonne) => {
        const largeur = largeurs[colonne] ?? 0;
        return colonne === 0 ? cellule.padEnd(largeur) : cellule.padStart(largeur);
      })
      .join(SEPARATEUR_COLONNES);
  return [aligner(entetes), aligner(largeurs.map((largeur) => TRAIT.repeat(largeur))), ...lignes.map(aligner)];
}

export function rendreScorecardConsole(
  scorecard: Scorecard,
  dico: Dictionnaire,
  langueConsole: string,
  /** `iaDeclareeAbsente` : le banc tourne en `--sans-ia`, l'absence de profil est DEMANDÉE. */
  options: { iaDeclareeAbsente?: boolean } = {},
): string {
  const formateurs = construireFormateurs(langueConsole);
  const nonApplicable = traduire(dico, 'scorecard.nonApplicable');
  const entetes = COLONNES.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`));
  const tableau = (lignes: [string, Agregat][], partitionne = true): string[] =>
    formaterTableau(
      entetes,
      lignes.map(([perimetre, agregat]) => ligneAgregat(perimetre, agregat, formateurs, nonApplicable, partitionne)),
    );

  // PÉRIMÈTRES QUI PARTITIONNENT les scénarios, et eux seuls : le global et
  // les langues (chaque scénario a exactement une langue, la somme des langues
  // égale le global). Le périmètre « catégorie de bug » en est exclu, pour
  // deux raisons qui se cumulent : un scénario multi-catégories serait compté
  // dans plusieurs lignes (leur somme dépasserait le global), et un groupe de
  // CAUSE RACINE n'est de toute façon pas ventilable par catégorie de bug —
  // une même cause réseau produit des anomalies de catégories différentes.
  // Les compteurs restent dans chaque `Agregat` du JSON ; ce qui est AFFICHÉ
  // ne doit jamais être arithmétiquement faux.
  const perimetresPartitionnants: [string, Agregat][] = [
    [traduire(dico, 'scorecard.global'), scorecard.global],
    ...Object.entries(scorecard.parLangue),
  ];
  const tableauProtocole = formaterTableau(
    COLONNES_PROTOCOLE.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`)),
    perimetresPartitionnants.map(([perimetre, agregat]) => ligneProtocole(perimetre, agregat, formateurs)),
  );
  const { nbCandidates, nbGroupes, nbGroupesRetenus, nbGroupesEcartes, nbFaussesAlertesEvitees, nbPertesProtocole, nbEcartesNonApparies, nbScenarios } =
    scorecard.global;
  // Le chiffre commercial ne se cite JAMAIS seul : la synthèse porte les trois
  // nombres de décomposition, y compris quand les deux derniers valent zéro.
  const syntheseProtocole = traduire(dico, 'scorecard.syntheseProtocole', {
    candidates: formateurs.entier.format(nbCandidates),
    groupes: formateurs.entier.format(nbGroupes),
    retenues: formateurs.entier.format(nbGroupesRetenus),
    ecartees: formateurs.entier.format(nbGroupesEcartes),
    evitees: formateurs.entier.format(nbFaussesAlertesEvitees),
    perdues: formateurs.entier.format(nbPertesProtocole),
    nonApparies: formateurs.entier.format(nbEcartesNonApparies),
    scenarios: formateurs.entier.format(nbScenarios),
  });

  const tableauProfil = formaterTableau(
    COLONNES_PROFIL.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`)),
    perimetresPartitionnants.map(([perimetre, agregat]) => ligneProfil(perimetre, agregat, formateurs, nonApplicable)),
  );
  const { nbProfilsCorrects, nbProfilsMesures, nbInertiesTenues, nbInertiesMesurees, nbProfilsNonMesures, coutApiProfilage } = scorecard.global;
  // La synthèse cite les deux familles ET le coût dans la même phrase : c'est
  // le couple que METHODE demande de lire ensemble, jamais un chiffre seul.
  const syntheseProfils = traduire(dico, 'scorecard.syntheseProfils', {
    profilsCorrects: formateurs.entier.format(nbProfilsCorrects),
    profilsMesures: formateurs.entier.format(nbProfilsMesures),
    inertiesTenues: formateurs.entier.format(nbInertiesTenues),
    inertiesMesurees: formateurs.entier.format(nbInertiesMesurees),
    nonMesures: formateurs.entier.format(nbProfilsNonMesures),
    cout: formateurs.montant.format(coutApiProfilage),
  });

  // --- Famille « rapports justes » et sa jumelle de couverture -------------
  const tableauRapport = formaterTableau(
    COLONNES_RAPPORT.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`)),
    perimetresPartitionnants.map(([perimetre, agregat]) => ligneRapport(perimetre, agregat, formateurs, nonApplicable)),
  );
  const {
    nbRapportsConformes,
    nbRapportsMesures,
    nbInertiesRapportTenues,
    nbInertiesRapportMesurees,
    nbRapportsNonMesures,
    nbRapportsSansProse,
    nbRapportsSansSection,
    nbSectionsRedigees,
    nbSectionsRapport,
    coutApiRedaction,
  } = scorecard.global;
  // La synthèse cite les deux familles, la COUVERTURE et le COÛT dans la même
  // phrase : c'est le couple que METHODE demande de lire ensemble.
  const syntheseRapports = traduire(dico, 'scorecard.syntheseRapports', {
    rapportsConformes: formateurs.entier.format(nbRapportsConformes),
    rapportsMesures: formateurs.entier.format(nbRapportsMesures),
    inertiesTenues: formateurs.entier.format(nbInertiesRapportTenues),
    inertiesMesurees: formateurs.entier.format(nbInertiesRapportMesurees),
    sectionsRedigees: formateurs.entier.format(nbSectionsRedigees),
    sections: formateurs.entier.format(nbSectionsRapport),
    cout: formateurs.montant.format(coutApiRedaction),
  });

  // --- Famille « cibles atteintes » et son couple coût/efficacité ----------
  const oui = traduire(dico, 'scorecard.oui');
  const non = traduire(dico, 'scorecard.non');
  const tableauCibles = formaterTableau(
    COLONNES_CIBLES.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`)),
    scorecard.cibles.map((agregat) => ligneCibles(agregat, formateurs, nonApplicable, oui, non)),
  );
  const executee = scorecard.cibles.find((agregat) => agregat.executee);
  const jumelle = scorecard.cibles.filter((agregat) => !agregat.executee);
  const syntheseCibles = traduire(dico, 'scorecard.syntheseCibles', {
    politique: scorecard.politique,
    conformes: formateurs.entier.format(executee?.nbConformes ?? 0),
    mesurees: formateurs.entier.format(executee?.nbMesurees ?? 0),
    atteintes: formateurs.entier.format(executee?.nbAtteintes ?? 0),
    mesureesAuParcours: formateurs.entier.format(executee?.nbMesureesAuParcours ?? 0),
    horsParcours: formateurs.entier.format(executee?.nbHorsParcours ?? 0),
    mesureesHorsParcours: formateurs.entier.format(executee?.nbMesureesHorsParcours ?? 0),
    inertiesTenues: formateurs.entier.format(executee?.nbInertiesTenues ?? 0),
    inertiesMesurees: formateurs.entier.format(executee?.nbInertiesMesurees ?? 0),
    nonMesurees: formateurs.entier.format(executee?.nbNonMesurees ?? 0),
  });
  // La jumelle se DIT, elle ne se déduit pas d'une ligne du tableau : une
  // cible que l'autre politique n'atteint pas est un attendu SATISFAIT, et
  // rien dans une colonne ne l'explique au lecteur pressé.
  const lignesJumelle = jumelle.map((agregat) =>
    traduire(dico, 'scorecard.jumellePolitique', {
      politique: agregat.politique,
      attenduesAtteintes: formateurs.entier.format(agregat.nbAttenduesAtteintes),
      attenduesHorsParcours: formateurs.entier.format(agregat.nbAttenduesHorsParcours),
      nonMesurees: formateurs.entier.format(agregat.nbNonMesurees),
    }),
  );

  const tableauCout = formaterTableau(
    COLONNES_COUT.map((colonne) => traduire(dico, `scorecard.colonnes.${colonne}`)),
    perimetresPartitionnants.map(([perimetre, agregat]) => ligneCout(perimetre, agregat, formateurs, nonApplicable)),
  );
  const { coutParScan, nbPagesUtiles, nbPagesVisitees, tauxEfficacite, nbScenariosSansPageUtile, coutApi, coutApiExploration, nbReplisDecision } =
    scorecard.global;
  // Le coût et ce qu'il achète, dans la MÊME phrase : un coût cité seul est un
  // chiffre qu'on ne peut que subir (APPRENTISSAGES n°3).
  const syntheseCout = traduire(dico, 'scorecard.syntheseCoutEfficacite', {
    politique: scorecard.politique,
    cout: formateurs.montant.format(coutApi),
    coutDecisions: formateurs.montant.format(coutApiExploration),
    replis: formateurs.entier.format(nbReplisDecision),
    coutParScan: coutParScan === null ? nonApplicable : formateurs.montant.format(coutParScan),
    pagesUtiles: formateurs.entier.format(nbPagesUtiles),
    pagesVisitees: formateurs.entier.format(nbPagesVisitees),
    efficacite: tauxEfficacite === null ? nonApplicable : formateurs.pourcentage.format(tauxEfficacite / 100),
    sansPageUtile: formateurs.entier.format(nbScenariosSansPageUtile),
  });

  const { points, seuil, alarme } = scorecard.ecartLangues;
  const ligneEcart =
    points === null
      ? traduire(dico, 'scorecard.ecartLanguesNonCalculable')
      : traduire(dico, 'scorecard.ecartLangues', {
          points: formateurs.points.format(points),
          seuil: formateurs.points.format(seuil),
        });

  return [
    traduire(dico, 'scorecard.titre'),
    traduire(dico, 'scorecard.politiqueRun', { politique: scorecard.politique }),
    '',
    traduire(dico, 'scorecard.global'),
    ...tableau([[traduire(dico, 'scorecard.global'), scorecard.global]]),
    '',
    traduire(dico, 'scorecard.parLangue'),
    ...tableau(Object.entries(scorecard.parLangue)),
    '',
    traduire(dico, 'scorecard.parCategorie'),
    ...tableau(Object.entries(scorecard.parCategorie), false),
    '',
    traduire(dico, 'scorecard.protocole'),
    ...tableauProtocole,
    '',
    syntheseProtocole,
    // Alarme : une anomalie réelle perdue invalide la lecture de la synthèse.
    // Elle reste CONDITIONNELLE (la synthèse, elle, cite toujours les trois
    // nombres) : une alarme qui crie à chaque exécution est une alarme
    // qu'on n'écoute plus.
    ...(nbPertesProtocole > 0
      ? [traduire(dico, 'scorecard.alarmePertes', { perdues: formateurs.entier.format(nbPertesProtocole) })]
      : []),
    '',
    traduire(dico, 'scorecard.profils'),
    ...tableauProfil,
    '',
    syntheseProfils,
    // Des attendus de profil non mesurés ne sont NI une réussite NI un échec :
    // le banc dit qu'il n'a pas mesuré. Ligne conditionnelle, mais jamais
    // silencieuse — un zéro tu serait l'angle mort de l'apprentissage n°4.
    // Deux causes, même symptôme : une absence DEMANDÉE (`--sans-ia`) et une
    // absence SUBIE ne se disent pas de la même façon. Un taux nul muet
    // laisserait croire à une mesure (apprentissages n°4 et n°6).
    ...(nbProfilsNonMesures > 0
      ? [
          traduire(dico, options.iaDeclareeAbsente === true ? 'scorecard.profilsNonMesuresDeclares' : 'scorecard.profilsNonMesures', {
            nonMesures: formateurs.entier.format(nbProfilsNonMesures),
          }),
        ]
      : []),
    '',
    traduire(dico, 'scorecard.rapports'),
    ...tableauRapport,
    '',
    syntheseRapports,
    // Un rapport non mesuré n'est ni une réussite ni un échec — mais un zéro
    // tu serait l'angle mort de l'apprentissage n°4. Deux causes, deux
    // phrases : absence DÉCLARÉE (sujet sans capacité) et absence SUBIE.
    ...(nbRapportsNonMesures > 0
      ? [
          traduire(dico, options.iaDeclareeAbsente === true ? 'scorecard.rapportsNonMesuresDeclares' : 'scorecard.rapportsNonMesures', {
            nonMesures: formateurs.entier.format(nbRapportsNonMesures),
          }),
        ]
      : []),
    // Un rapport STRUCTUREL est un rapport juste : ce n'est pas une alarme.
    // Mais un run entièrement structurel n'a mesuré AUCUNE rédaction, et
    // « 100 % de rapports conformes » s'y lirait comme une victoire de la
    // rédaction (APPRENTISSAGES n°4, la mesure devenue aveugle doit le DIRE).
    // Même partage que pour les profils : une absence DEMANDÉE (`--sans-ia`)
    // n'est pas une panne. Notre premier différenciateur est le zéro faux
    // positif ; un instrument qui crie à l'échec quand tout va bien en est un.
    ...(nbRapportsSansProse > 0
      ? [
          traduire(dico, options.iaDeclareeAbsente === true ? 'scorecard.rapportsSansProseDeclares' : 'scorecard.rapportsSansProse', {
            sansProse: formateurs.entier.format(nbRapportsSansProse),
            mesures: formateurs.entier.format(nbRapportsMesures + nbInertiesRapportMesurees),
          }),
        ]
      : []),
    // Sur combien de scénarios la rédaction a-t-elle RÉELLEMENT été éprouvée ?
    // Un site sain n'en éprouve aucune, et c'est normal ; le taire laisserait
    // croire que la couverture porte sur tout le périmètre.
    ...(nbRapportsSansSection > 0
      ? [
          traduire(dico, 'scorecard.rapportsSansSection', {
            sansSection: formateurs.entier.format(nbRapportsSansSection),
            mesures: formateurs.entier.format(nbRapportsMesures + nbInertiesRapportMesurees),
          }),
        ]
      : []),
    '',
    traduire(dico, 'scorecard.cibles'),
    ...tableauCibles,
    '',
    syntheseCibles,
    ...lignesJumelle,
    // Une cible non mesurée n'est ni une réussite ni un échec — mais un zéro
    // tu serait l'angle mort de l'apprentissage n°4.
    ...((executee?.nbNonMesurees ?? 0) > 0
      ? [traduire(dico, 'scorecard.ciblesNonMesurees', { nonMesurees: formateurs.entier.format(executee?.nbNonMesurees ?? 0) })]
      : []),
    '',
    traduire(dico, 'scorecard.coutEfficacite'),
    ...tableauCout,
    '',
    syntheseCout,
    '',
    ligneEcart,
    ...(alarme ? [traduire(dico, 'scorecard.alarme')] : []),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Journalisation JSON (constitution §5)
// ---------------------------------------------------------------------------

const EXTENSION_SCORECARD = '.json';

/** Écrit `<dossier>/<horodatage>.json` (les `:` de l'ISO 8601 sont remplacés par `-` : nom de fichier portable) et retourne le chemin. */
export async function ecrireScorecard(scorecard: Scorecard, dossier: string): Promise<string> {
  await mkdir(dossier, { recursive: true });
  const fichier = path.join(dossier, `${scorecard.horodatage.replaceAll(':', '-')}${EXTENSION_SCORECARD}`);
  await writeFile(fichier, `${JSON.stringify(scorecard, null, 2)}\n`, 'utf8');
  return fichier;
}

/**
 * Ne conserve dans `dossier` que les `retention` scorecards les plus récentes
 * (cahier brique 2 §0, `scorecard.retentionRuns`). Les fichiers sont nommés
 * par leur horodatage ISO : l'ordre des noms est l'ordre chronologique. Tout
 * ce qui n'est pas une scorecard (`.gitkeep`, sous-dossiers) est ignoré.
 * Retourne les chemins supprimés.
 */
export async function purgerResultats(dossier: string, retention: number): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const scorecards = entrees
    .filter((entree) => entree.isFile() && entree.name.endsWith(EXTENSION_SCORECARD))
    .map((entree) => entree.name)
    .sort();
  const aSupprimer = scorecards.slice(0, Math.max(0, scorecards.length - retention)).map((nom) => path.join(dossier, nom));
  await Promise.all(aSupprimer.map((fichier) => rm(fichier)));
  return aSupprimer;
}
