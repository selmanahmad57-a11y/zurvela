/**
 * Appariement rapport ↔ manifeste (cahier des charges §6.3).
 *
 * L'appariement est STRUCTUREL : une anomalie apparie un attendu si elle a
 * la même catégorie et si sa localisation normalisée est l'une des pages
 * déclarées par le bug. La description (prose IA) et la gravité ne servent
 * jamais de clé (règle maîtresse §2).
 */
import { VERDICTS_RETENUS, type Anomalie, type CandidateEcartee, type Rapport } from '../../core/types.js';
import { attendusBug, attendusProfil, type AttenduBug, type ComptesProtocole, type Manifeste, type ResultatAttendu, type ResultatProfil } from '../types.js';

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
function construireApparieur(attendus: readonly AttenduBug[]): (anomalie: Anomalie) => number {
  const pagesNormalisees = attendus.map((attendu) => new Set(attendu.pages.map(normaliserLocalisation)));
  return function indiceAttendu(anomalie: Anomalie): number {
    const localisation = normaliserLocalisation(anomalie.urlOuEtape);
    return attendus.findIndex(
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
  // ROUTAGE PAR DISCRIMINANT : l'appariement ne connaît que les attendus de
  // nature `bug`. Un attendu de PROFIL ne s'apparie à aucune anomalie — il
  // n'a ni catégorie ni page —, et l'inclure ici ferait de son échec un
  // « raté » de détection, donc un chiffre faux dans les deux familles.
  const attendusDeBug = attendusBug(manifeste);
  const indiceAttendu = construireApparieur(attendusDeBug);

  const retenues: Anomalie[][] = attendusDeBug.map(() => []);
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
  const ecartees: (CandidateEcartee | undefined)[] = attendusDeBug.map(() => undefined);
  for (const ecartee of rapport.ecartees ?? []) {
    const indice = indiceAttendu(ecartee.candidate);
    if (indice !== -1 && ecartees[indice] === undefined) {
      ecartees[indice] = ecartee;
    }
  }

  const attendus = attendusDeBug.map((attendu, i): ResultatAttendu => {
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
      // TOUTES les anomalies publiées pour cet attendu doivent porter la
      // gravité annoncée, pas seulement l'une d'elles : le client les lit
      // toutes, et une seule mal graduée suffit à l'envoyer au mauvais endroit.
      ...(anomaliesAppariees.length === 0
        ? {}
        : {
            graviteConforme: anomaliesAppariees.every((anomalie) => anomalie.graviteEstimee === attendu.gravite),
            gravitesRendues: anomaliesAppariees.map((anomalie) => anomalie.graviteEstimee),
          }),
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
  // Même routage que `apparier`, et sur la MÊME liste : les indices de
  // `attendus` sont ceux des attendus de bug, pas ceux du manifeste entier.
  const attendusDeBug = attendusBug(manifeste);
  const indiceAttendu = construireApparieur(attendusDeBug);
  const comptes = comptesProtocoleZero();
  comptes.nbCandidates = rapport.candidates?.length ?? 0;
  const groupes = rapport.groupes ?? [];
  comptes.nbGroupes = groupes.length;

  /** L'attendu doit être retenu ET aucune anomalie retenue ne le couvre déjà. */
  const estPerdu = (indice: number): boolean => {
    const attendu = attendusDeBug[indice];
    return (
      attendu !== undefined &&
      VERDICTS_RETENUS.includes(attendu.verdictAttendu) &&
      (attendus[indice]?.anomaliesAppariees.length ?? 0) === 0
    );
  };
  const estAEcarter = (indice: number): boolean => {
    const attendu = attendusDeBug[indice];
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


// ---------------------------------------------------------------------------
// INVARIANT : une anomalie réelle perdue interdit le statut `ok`
// ---------------------------------------------------------------------------

/**
 * Raison technique stable (jamais de prose) d'un scénario que le banc refuse
 * de déclarer `ok` : le protocole y a détruit au moins une anomalie réelle.
 */
export const RAISON_PERTES_PROTOCOLE = 'scenario-non-ok:pertes-protocole';

/**
 * Raison technique stable d'un scénario refusé en `ok` parce que des attendus
 * de profil n'ont pas été mesurés alors que l'IA était CENSÉE répondre.
 */
export const RAISON_PROFILS_NON_MESURES = 'scenario-non-ok:profils-non-mesures';

/**
 * INVARIANT JUMEAU de celui des pertes, et il porte sur une DISTINCTION, pas
 * sur un compteur.
 *
 * Une absence de profil a deux causes qui produisent le même symptôme :
 * elle est DEMANDÉE (`--sans-ia` : on a dit au banc de ne pas appeler l'IA) ou
 * SUBIE (cassette manquante, mode dégradé inattendu, appel en échec). Le
 * compteur `nbProfilsNonMesures` ne les distingue pas ; le statut doit le
 * faire — c'est l'apprentissage n°6 appliqué au statut : deux causes, même
 * symptôme, la garde nomme la bonne.
 *
 * En régime IA actif, une absence subie interdit donc `ok`. En régime déclaré
 * sans IA, elle est attendue et n'entache rien — mais la scorecard l'affiche
 * comme DÉCLARÉE, jamais comme un taux nul silencieux.
 */
export function profilsNonMesuresSubis(profils: readonly ResultatProfil[], iaDeclareeAbsente: boolean): number {
  return iaDeclareeAbsente ? 0 : profils.filter((resultat) => resultat.nonMesure).length;
}

/**
 * INVARIANT, posé ICI et non par ricochet : `nbPertesProtocole > 0` ⟹ le
 * scénario ne peut pas être `ok`.
 *
 * Arbitrage de clôture de la brique 3, qui voyage dans la 4a. Sans lui, un
 * scénario où le protocole a écarté à tort un vrai bug s'affiche `ok` avec sa
 * ligne verte, et la seule trace de la destruction est une colonne que
 * personne n'est obligé de lire. Le statut est la lecture de premier niveau
 * du banc : c'est LUI qui doit refuser de dire « tout va bien ».
 *
 * Écrit comme une fonction totale d'un seul argument pour qu'un test puisse
 * l'éprouver DIRECTEMENT, sans fabriquer un scan complet — et pour que le
 * jour où un second appelant en a besoin, il ne réinvente pas la règle.
 */
export function statutSelonPertes(protocole: ComptesProtocole): 'ok' | 'erreur' {
  return protocole.nbPertesProtocole > 0 ? 'erreur' : 'ok';
}

// ---------------------------------------------------------------------------
// Notation des attendus de PROFIL (famille distincte de la détection)
// ---------------------------------------------------------------------------

/**
 * Note les attendus de nature `profil` d'un manifeste contre le profil porté
 * par le rapport.
 *
 * Trois règles, et elles sont toutes des refus de flatter :
 *
 * 1. **Familles distinctes.** Un attendu de profil non satisfait n'est ni un
 *    « raté » de détection, ni un faux positif : il ne touche à aucun des deux
 *    chiffres. L'inverse serait tout aussi faux — un profil correct
 *    n'améliore pas un taux de détection.
 * 2. **Rien n'est déduit d'une absence.** Sans profil (mode dégradé, cassette
 *    absente, `--sans-ia`), l'attendu est NON MESURÉ : ni crédité, ni imputé,
 *    et il sort des dénominateurs. Un « 0 % » dirait que le moteur a eu tort
 *    alors qu'il n'a rien dit ; un « 100 % » serait un mensonge pur.
 * 3. **Seuls les champs OBJECTIFS sont notés.** `typeSite` et la langue. La
 *    description libre et la confiance déclarée restent journalisées dans
 *    `profil` et ne participent jamais au verdict : noter une prose produite
 *    par un modèle sous injection reviendrait à laisser la page se noter
 *    elle-même (constitution §3).
 *
 * La comparaison de langue est une égalité stricte de codes : le banc
 * n'invente aucune équivalence linguistique, et un `fr-FR` là où `fr` est
 * attendu doit se voir, pas se faire absorber par une règle indulgente.
 */
export function noterProfils(rapport: Rapport, manifeste: Manifeste): ResultatProfil[] {
  const profil = rapport.profil;
  if (profil === undefined) {
    return profilsNonMesures(manifeste);
  }
  return attendusProfil(manifeste).map((attendu): ResultatProfil => {
    const langueAttendue = attendu.langue ?? manifeste.langue;
    return {
      attendu,
      langueAttendue,
      profil,
      nonMesure: false,
      satisfait: profil.typeSite === attendu.typeSite && profil.langue === langueAttendue,
    };
  });
}

/**
 * Les attendus de profil d'un scénario dont AUCUN rapport exploitable n'est
 * sorti (scanner en échec, timeout, rapport inexploitable) : tous non mesurés.
 * Un scan qui n'a pas abouti n'apprend rien sur le discernement du modèle, et
 * le compter en échec de profil imputerait au modèle la panne du navigateur.
 */
export function profilsNonMesures(manifeste: Manifeste): ResultatProfil[] {
  return attendusProfil(manifeste).map((attendu): ResultatProfil => ({
    attendu,
    langueAttendue: attendu.langue ?? manifeste.langue,
    nonMesure: true,
    satisfait: false,
  }));
}
