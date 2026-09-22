/**
 * CONSOLIDATION (1re étape du protocole anti-faux-positifs) : regrouper les
 * candidates qui partagent une CAUSE RACINE avant de confirmer, pour ne
 * payer qu'une re-exécution par cause (une ressource en échec sur cinq
 * pages est un seul défaut, pas cinq).
 *
 * L'identité de cause est STRUCTURELLE, jamais textuelle (Mur 1) :
 * 1. un signal RÉSEAU parmi les preuves fait une cause indépendante du
 *    détecteur — plusieurs détecteurs qui constatent la même ressource ou la
 *    même requête en échec constatent UNE cause (c'est ce qui fait de V01,
 *    vu par D-IMAGE et par D-HTTP, un seul groupe) ;
 * 2. sinon, l'élément en cause QUALIFIÉ par son détecteur — un bouton mort
 *    et un bouton recouvert sont deux causes distinctes sur le même élément.
 *    Le viewport entre dans la clé quand la candidate en dépend (elle porte
 *    alors son nom), pour que l'asymétrie « mobile uniquement » survive ;
 * 3. sinon, le détecteur et le chemin de la page.
 *
 * Le groupe ne perd RIEN de ses membres : toutes les localisations, tous les
 * viewports observés, toutes les descriptions distinctes, et la confiance la
 * plus HAUTE (leçon de la bascule de la brique 2 : la fusion n'efface pas la
 * force du signal). Les descriptions comptent autant que le reste : la
 * consolidation ne garde qu'UN représentant, et le membre le plus riche en
 * contexte n'est pas le plus parlant pour un humain — sans cette liste, le
 * symptôme visible (`image-cassee`) disparaîtrait derrière la cause technique
 * (`ressource-interne-404`) qui l'a supplanté.
 */
import type { AnomalieCandidate, GroupeCause, LocalisationCause, Observation, Signal } from '../../types.js';
import { cheminDePage } from '../detection/commun.js';

const SEPARATEUR_CLE = ':';

/** Préfixes des trois familles d'identité (identifiants techniques stables). */
const IDENTITE_RESEAU = 'reseau';
const IDENTITE_ELEMENT = 'element';
const IDENTITE_PAGE = 'page';

type SignalReseau = Extract<Signal, { type: 'reponse-reseau' | 'requete-echouee' | 'requete-en-attente' }>;

function estSignalReseau(signal: Signal): signal is SignalReseau {
  return signal.type === 'reponse-reseau' || signal.type === 'requete-echouee' || signal.type === 'requete-en-attente';
}

function identite(candidate: AnomalieCandidate, avecViewport: boolean): string {
  const reseau = candidate.preuves.find(estSignalReseau);
  if (reseau !== undefined) {
    return [IDENTITE_RESEAU, reseau.methode, cheminDePage(reseau.urlRessource)].join(SEPARATEUR_CLE);
  }
  if (candidate.element !== undefined) {
    const parties = [candidate.detecteur, IDENTITE_ELEMENT, candidate.element.selecteur];
    // `viewport` n'est porté que par une candidate qui en DÉPEND (construireCandidate).
    if (avecViewport && candidate.viewport !== undefined) {
      parties.push(candidate.viewport);
    }
    return parties.join(SEPARATEUR_CLE);
  }
  return [candidate.detecteur, IDENTITE_PAGE, cheminDePage(candidate.urlOuEtape)].join(SEPARATEUR_CLE);
}

/**
 * Identité de la cause racine d'une candidate. Deux candidates de même
 * identité sont deux manifestations du MÊME défaut.
 */
export function identiteCause(candidate: AnomalieCandidate): string {
  return identite(candidate, true);
}

/**
 * La même identité, viewport ôté : elle seule permet de comparer une
 * anomalie d'un viewport à l'autre, ce qu'exige la CONTRE-ÉPREUVE (« mobile
 * KO, desktop OK ? »). La clé de groupe, elle, garde le viewport : c'est ce
 * qui empêche de confondre les deux constats.
 */
export function identiteHorsViewport(candidate: AnomalieCandidate): string {
  return identite(candidate, false);
}

/**
 * Viewports où une candidate a été observée : ceux que le dédoublonnage lui
 * a laissés, sinon le sien (nom explicite s'il dépend du viewport, celui de
 * sa reproduction sinon).
 */
function viewportsDe(candidate: AnomalieCandidate): string[] {
  const observations = candidate.observations;
  if (observations !== undefined && observations.length > 0) {
    return observations.map((observation) => observation.viewport);
  }
  return [candidate.viewport ?? candidate.reproduction.viewport.nom];
}

function localisationDe(candidate: AnomalieCandidate): LocalisationCause {
  return {
    urlOuEtape: candidate.urlOuEtape,
    ...(candidate.element === undefined ? {} : { element: candidate.element }),
    ...(candidate.viewport === undefined ? {} : { viewport: candidate.viewport }),
  };
}

function cleLocalisation(localisation: LocalisationCause): string {
  return [localisation.urlOuEtape, localisation.element?.selecteur ?? '', localisation.viewport ?? ''].join('|');
}

/**
 * Le membre le plus riche en contexte, celui qu'on re-exécutera : une
 * candidate qui porte une action déclenchante d'abord (on sait quoi
 * rejouer), à égalité la mieux fournie en preuves, puis la première venue
 * (l'ordre d'entrée tranche : la consolidation reste déterministe).
 */
function choisirRepresentant(membres: AnomalieCandidate[]): AnomalieCandidate | undefined {
  let retenu: AnomalieCandidate | undefined;
  let meilleurScore = -1;
  let meilleuresPreuves = -1;
  for (const membre of membres) {
    const score = membre.reproduction.action !== null ? 1 : 0;
    if (score > meilleurScore || (score === meilleurScore && membre.preuves.length > meilleuresPreuves)) {
      retenu = membre;
      meilleurScore = score;
      meilleuresPreuves = membre.preuves.length;
    }
  }
  return retenu;
}

function construireGroupe(cle: string, membres: AnomalieCandidate[], representant: AnomalieCandidate): GroupeCause {
  const localisations: LocalisationCause[] = [];
  const clesVues = new Set<string>();
  const observations: Observation[] = [];
  const viewportsVus = new Set<string>();
  const descriptions: string[] = [];
  const descriptionsVues = new Set<string>();
  let confiance = 0;
  for (const membre of membres) {
    const localisation = localisationDe(membre);
    const cleLieu = cleLocalisation(localisation);
    if (!clesVues.has(cleLieu)) {
      clesVues.add(cleLieu);
      localisations.push(localisation);
    }
    for (const viewport of viewportsDe(membre)) {
      if (!viewportsVus.has(viewport)) {
        viewportsVus.add(viewport);
        observations.push({ viewport });
      }
    }
    // Identifiant technique de détecteur (`image-cassee`), jamais de la prose :
    // le dédoublonnage par égalité stricte ne viole pas le Mur 1.
    if (!descriptionsVues.has(membre.description)) {
      descriptionsVues.add(membre.description);
      descriptions.push(membre.description);
    }
    confiance = Math.max(confiance, membre.confiance);
  }
  return { cle, representant, membres, localisations, observations, confiance, descriptions };
}

/**
 * Groupes de cause racine, dans l'ordre d'apparition de leur première
 * candidate (la consolidation ne réordonne jamais le rapport).
 */
export function consolider(candidates: AnomalieCandidate[]): GroupeCause[] {
  const parCle = new Map<string, AnomalieCandidate[]>();
  for (const candidate of candidates) {
    const cle = identiteCause(candidate);
    const membres = parCle.get(cle) ?? [];
    membres.push(candidate);
    parCle.set(cle, membres);
  }
  const groupes: GroupeCause[] = [];
  for (const [cle, membres] of parCle) {
    const representant = choisirRepresentant(membres);
    if (representant === undefined) {
      continue;
    }
    groupes.push(construireGroupe(cle, membres, representant));
  }
  return groupes;
}
