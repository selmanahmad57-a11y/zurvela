/**
 * Appariement rapport ↔ manifeste (cahier des charges §6.3).
 *
 * L'appariement est STRUCTUREL : une anomalie apparie un attendu si elle a
 * la même catégorie et si sa localisation normalisée est l'une des pages
 * déclarées par le bug. La description (prose IA) et la gravité ne servent
 * jamais de clé (règle maîtresse §2).
 */
import { VERDICTS_RETENUS, type Anomalie, type CandidateEcartee, type Rapport } from '../../core/types.js';
import type { ComptesProtocole, Manifeste, ResultatAttendu } from '../types.js';

/** Motif structurel d'une URL absolue : schéma suivi de `//` (RFC 3986). */
const MOTIF_URL_ABSOLUE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Retire le `/` final d'un chemin, sauf pour la racine. */
function retirerSlashFinal(chemin: string): string {
  return chemin.length > 1 && chemin.endsWith('/') ? chemin.slice(0, -1) : chemin;
}

/**
 * Extrait le chemin décodé d'une URL absolue, ou null si la chaîne n'en est
 * pas une (le motif est plus large que ce que l'analyseur accepte, et le
 * chemin peut porter un encodage invalide).
 */
function cheminUrlAbsolue(texte: string): string | null {
  if (!MOTIF_URL_ABSOLUE.test(texte)) {
    return null;
  }
  try {
    return decodeURIComponent(new URL(texte).pathname);
  } catch {
    return null;
  }
}

/**
 * Ramène une localisation d'anomalie à une clé comparable aux pages d'un
 * manifeste : URL absolue → pathname décodé (les pages sont déclarées en
 * clair) ; chemin (`/…`) ou libellé d'étape → tel quel. Le `/` final est
 * retiré, sauf pour la racine.
 *
 * Fonction totale : `urlOuEtape` est de la prose du moteur (donnée non
 * fiable), une valeur mal formée est gardée telle quelle et sera traitée
 * comme un libellé d'étape (donc comptée en faux positif), jamais levée.
 */
export function normaliserLocalisation(urlOuEtape: string): string {
  return retirerSlashFinal(cheminUrlAbsolue(urlOuEtape) ?? urlOuEtape);
}

/**
 * Construit l'apparieur STRUCTUREL d'un manifeste : une fonction qui rend
 * l'indice du premier attendu de même catégorie dont l'une des pages est la
 * localisation de l'anomalie, ou -1.
 *
 * Seul point de vérité de la règle d'appariement : les anomalies retenues,
 * les candidates écartées et les groupes du protocole y passent tous. Une
 * règle dupliquée ferait diverger le taux de détection et la mesure des
 * fausses alertes évitées, qui doivent se lire ensemble.
 */
function construireApparieur(manifeste: Manifeste): (anomalie: Anomalie) => number {
  const pagesNormalisees = manifeste.attendus.map((attendu) => new Set(attendu.pages.map(normaliserLocalisation)));
  return function indiceAttendu(anomalie: Anomalie): number {
    const localisation = normaliserLocalisation(anomalie.urlOuEtape);
    return manifeste.attendus.findIndex(
      (attendu, i) => attendu.categorie === anomalie.categorie && pagesNormalisees[i]?.has(localisation),
    );
  };
}

/**
 * Chaque anomalie s'apparie à AU PLUS un attendu (le premier qui correspond) ;
 * un attendu est DÉTECTÉ dès qu'une anomalie RETENUE ou une candidate ÉCARTÉE
 * lui est appariée — détecter puis écarter à raison est une réussite, c'est
 * tout l'objet du protocole anti-faux-positifs.
 *
 * Deux asymétries voulues :
 * - `anomaliesAppariees` ne contient que des anomalies RETENUES : ce sont les
 *   seuls signalements du moteur, et le taux de faux positifs se calcule sur
 *   eux. Un attendu détecté uniquement parmi les écartées a donc un verdict
 *   `detecte` et zéro anomalie appariée.
 * - les FAUX POSITIFS ne se comptent QUE parmi les anomalies retenues : une
 *   candidate écartée non appariée n'en est pas un, le moteur s'est tu.
 *
 * `verdictRendu` est le verdict de confirmation porté par l'appariement (les
 * retenues d'abord, les écartées ensuite), null si l'attendu n'apparaît nulle
 * part ou si le protocole n'a rendu aucun verdict ; `bienJuge` le compare au
 * verdict attendu du manifeste.
 */
export function apparier(rapport: Rapport, manifeste: Manifeste): { attendus: ResultatAttendu[]; fauxPositifs: Anomalie[] } {
  const indiceAttendu = construireApparieur(manifeste);

  const retenues: Anomalie[][] = manifeste.attendus.map(() => []);
  const fauxPositifs: Anomalie[] = [];
  for (const anomalie of rapport.anomalies) {
    const indice = indiceAttendu(anomalie);
    if (indice === -1) {
      fauxPositifs.push(anomalie);
    } else {
      retenues[indice]?.push(anomalie);
    }
  }

  // Une seule écartée par attendu suffit : elle porte le verdict du groupe
  // auquel la candidate appartenait, les suivantes le répéteraient.
  const ecartees: (CandidateEcartee | undefined)[] = manifeste.attendus.map(() => undefined);
  for (const ecartee of rapport.ecartees ?? []) {
    const indice = indiceAttendu(ecartee.candidate);
    if (indice !== -1 && ecartees[indice] === undefined) {
      ecartees[indice] = ecartee;
    }
  }

  const attendus = manifeste.attendus.map((attendu, i): ResultatAttendu => {
    const anomaliesAppariees = retenues[i] ?? [];
    const ecartee = ecartees[i];
    const verdictRendu =
      anomaliesAppariees.find((anomalie) => anomalie.verdict !== undefined)?.verdict ?? ecartee?.verdict ?? null;
    return {
      attendu,
      verdict: anomaliesAppariees.length > 0 || ecartee !== undefined ? 'detecte' : 'rate',
      anomaliesAppariees,
      verdictRendu,
      bienJuge: verdictRendu === attendu.verdictAttendu,
    };
  });
  return { attendus, fauxPositifs };
}

// ---------------------------------------------------------------------------
// Mesure du protocole anti-faux-positifs (avant / après)
// ---------------------------------------------------------------------------

/**
 * Raison technique stable (jamais de prose) d'un rapport que le correcteur
 * refuse de noter : des candidates ont été ÉCARTÉES sans qu'aucun groupe de
 * cause racine ne soit rendu.
 */
export const RAISON_ECARTEES_SANS_GROUPES = 'rapport-inexploitable:ecartees-sans-groupes';

/**
 * Rapport structurellement inexploitable par le correcteur. Le scénario passe
 * en `statut: 'erreur'` par le MÊME chemin qu'une exception du scanner (le
 * `catch` de `noterScenario`) : une faute du sujet noté, jamais du banc.
 */
export class ErreurRapportInexploitable extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = 'ErreurRapportInexploitable';
  }
}

/**
 * INVARIANT DUR. Quand le protocole TOMBE, le pipeline écarte toutes les
 * candidates avec leur raison mais ne rend AUCUN groupe. Lu naïvement, un tel
 * rapport se note « 0 écartée, 0 perdue, pas d'alarme » avec 100 % de
 * détection — alors que 100 % des anomalies réelles viennent d'être
 * détruites. Un scan où le moteur n'a rien retenu ne doit jamais se lire
 * comme un sans-faute : le rapport est déclaré inexploitable.
 *
 * Le cas légitime « pas de groupes » reste permis : un protocole qui ne
 * consolide pas (passe-plat) rend `ecartees: []`, et un scanner qui n'a pas
 * de protocole du tout (factice) ne rend ni l'un ni l'autre.
 */
export function verifierRapportExploitable(rapport: Rapport): void {
  if (rapport.groupes === undefined && (rapport.ecartees?.length ?? 0) > 0) {
    throw new ErreurRapportInexploitable(RAISON_ECARTEES_SANS_GROUPES);
  }
}

/** Comptes d'un scénario sur lequel le protocole n'a rien fait : zéro partout, jamais `undefined`. */
export function comptesProtocoleZero(): ComptesProtocole {
  return {
    nbCandidates: 0,
    nbGroupes: 0,
    nbGroupesRetenus: 0,
    nbGroupesEcartes: 0,
    nbFaussesAlertesEvitees: 0,
    nbPertesProtocole: 0,
    nbEcartesNonApparies: 0,
  };
}

/**
 * Ce que le protocole a fait sur un scénario : combien de candidates la
 * détection a produites AVANT lui, en combien de groupes de cause racine
 * elles ont été consolidées, combien de groupes il a retenus et combien il a
 * écartés — et, pour chacun de ces derniers, si le manifeste lui donne
 * raison, tort, ou ne sait pas.
 *
 * C'est la mesure AVANT/APRÈS de l'argument central du produit, et elle ne
 * vaut que par son refus de flatter. Trois règles portent ce refus :
 *
 * 1. **Appariement de groupe PESSIMISTE.** Un groupe consolidé couvre
 *    plusieurs membres (V01 : trois pages, un groupe) : on apparie TOUS ses
 *    membres, on dédoublonne les attendus obtenus, et s'il s'en trouve un
 *    seul qui devait être RETENU, le groupe est une perte — il ne crédite
 *    alors aucune fausse alerte évitée. Sans cela, c'est le premier membre
 *    de la liste qui déciderait, et deux scénarios physiquement identiques
 *    ne différant que par l'ordre de leurs bugs se noteraient l'un « fausse
 *    alerte évitée », l'autre « anomalie perdue ».
 * 2. **Aucune interprétation flatteuse par défaut.** Un groupe écarté qui
 *    n'apparie AUCUN attendu n'est pas crédité : ce peut être du bruit tu à
 *    raison comme un vrai bug que l'appariement structurel n'a pas su
 *    rattacher. Il va dans sa propre colonne, `nbEcartesNonApparies`.
 * 3. **On compte des ATTENDUS, pas des groupes.** Trois groupes écartés qui
 *    apparient le même faux positif simulé valent UNE fausse alerte évitée :
 *    sinon, dégrader la consolidation améliorerait le chiffre de vente.
 *
 * `attendus` vient d'`apparier(rapport, manifeste)` : les deux mesures se
 * lisent ensemble, et un attendu déjà couvert par une anomalie RETENUE n'est
 * pas une perte même si l'un de ses groupes a été écarté (un doublon écarté
 * ne détruit rien ; une alarme qui crie pour rien est une alarme qu'on
 * ignore).
 *
 * Un sujet sans protocole (passe-plat, scanner factice) rend des zéros.
 */
export function calculerComptesProtocole(
  rapport: Rapport,
  manifeste: Manifeste,
  attendus: readonly ResultatAttendu[],
): ComptesProtocole {
  verifierRapportExploitable(rapport);
  const indiceAttendu = construireApparieur(manifeste);
  const comptes = comptesProtocoleZero();
  comptes.nbCandidates = rapport.candidates?.length ?? 0;
  const groupes = rapport.groupes ?? [];
  comptes.nbGroupes = groupes.length;

  /** L'attendu doit être retenu ET aucune anomalie retenue ne le couvre déjà. */
  const estPerdu = (indice: number): boolean => {
    const attendu = manifeste.attendus[indice];
    return (
      attendu !== undefined &&
      VERDICTS_RETENUS.includes(attendu.verdictAttendu) &&
      (attendus[indice]?.anomaliesAppariees.length ?? 0) === 0
    );
  };
  const estAEcarter = (indice: number): boolean => {
    const attendu = manifeste.attendus[indice];
    return attendu !== undefined && !VERDICTS_RETENUS.includes(attendu.verdictAttendu);
  };

  const attendusEvites = new Set<number>();
  const attendusPerdus = new Set<number>();
  for (const resultat of groupes) {
    if (VERDICTS_RETENUS.includes(resultat.verdict)) {
      comptes.nbGroupesRetenus += 1;
      continue;
    }
    comptes.nbGroupesEcartes += 1;
    const indices = [...new Set(resultat.groupe.membres.map(indiceAttendu))].filter((indice) => indice !== -1);
    if (indices.length === 0) {
      comptes.nbEcartesNonApparies += 1;
      continue;
    }
    const perdus = indices.filter(estPerdu);
    if (perdus.length > 0) {
      // Règle pessimiste : ce groupe a détruit un vrai bug, il ne crédite rien.
      for (const indice of perdus) {
        attendusPerdus.add(indice);
      }
      continue;
    }
    for (const indice of indices.filter(estAEcarter)) {
      attendusEvites.add(indice);
    }
  }
  comptes.nbFaussesAlertesEvitees = attendusEvites.size;
  comptes.nbPertesProtocole = attendusPerdus.size;
  return comptes;
}
