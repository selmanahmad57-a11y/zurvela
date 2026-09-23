/**
 * Dérivation du manifeste de vérité terrain (cahier des charges §5).
 *
 * Le manifeste n'est jamais écrit à la main : il est déduit du scénario et
 * de la partie déclarative des bugs du gabarit. Seuls les champs utiles au
 * correcteur sont copiés — les hooks de transformation n'y ont pas leur place.
 */
import { VERDICTS_RETENUS, type VerdictConfirmation } from '../../core/types.js';
import { normaliserLocalisation } from '../correcteur/appariement.js';
import { depuisRacine } from '../outils/racine.js';
import type { AttenduBug, AttenduCible, AttenduManifeste, AttenduProfil, BugInjectable, Gabarit, Manifeste, Scenario } from '../types.js';

/** Schéma commun à tous les manifestes. */
export const FICHIER_SCHEMA_MANIFESTE = depuisRacine('banc', 'schemas', 'manifeste.schema.json');

/**
 * Verdict attendu d'un bug qui n'en déclare pas : le cas ordinaire d'un
 * vrai défaut, reproductible, que le protocole doit retenir.
 */
const VERDICT_ATTENDU_DEFAUT: VerdictConfirmation = 'confirmee';

/**
 * Refuse un manifeste AMBIGU : deux attendus qui partagent une catégorie ET
 * une page, mais dont les verdicts attendus sont de camps opposés (l'un doit
 * être RETENU, l'autre ÉCARTÉ).
 *
 * L'appariement du correcteur est structurel — catégorie × page, et rien
 * d'autre (règle maîtresse §2 : ni description, ni gravité). Deux tels bugs
 * sont donc INDISCERNABLES pour lui : une même anomalie, un même groupe
 * écarté, se rattacherait à l'un ou à l'autre selon l'ordre des bugs actifs
 * du scénario, et le même fait se noterait tantôt « fausse alerte évitée »,
 * tantôt « anomalie perdue ». Un scénario qu'on ne peut pas noter honnêtement
 * ne doit pas exister : la faute est du BANC, elle lève.
 *
 * La comparaison des pages passe par `normaliserLocalisation`, la même
 * fonction que l'appariement : c'est sa notion de « même page » qui décide,
 * pas une seconde règle qui pourrait en diverger.
 */
function verifierManifesteNonAmbigu(scenarioId: string, attendus: AttenduBug[]): void {
  const pagesNormalisees = attendus.map((attendu) => new Set(attendu.pages.map(normaliserLocalisation)));
  for (let i = 0; i < attendus.length; i += 1) {
    for (let j = i + 1; j < attendus.length; j += 1) {
      const premier = attendus[i];
      const second = attendus[j];
      if (premier === undefined || second === undefined || premier.categorie !== second.categorie) {
        continue;
      }
      if (VERDICTS_RETENUS.includes(premier.verdictAttendu) === VERDICTS_RETENUS.includes(second.verdictAttendu)) {
        continue;
      }
      const pagesPremier = pagesNormalisees[i] ?? new Set<string>();
      const partagee = [...(pagesNormalisees[j] ?? [])].find((page) => pagesPremier.has(page));
      if (partagee !== undefined) {
        throw new Error(
          `Scénario ${scenarioId} : manifeste ambigu — les bugs ${premier.bugId} et ${second.bugId} partagent la catégorie « ${premier.categorie} » et la page « ${partagee} » avec des verdicts attendus de camps opposés (${premier.verdictAttendu} / ${second.verdictAttendu}) : le banc ne saurait pas lequel des deux un groupe écarté concerne`,
        );
      }
    }
  }
}

/**
 * Catégorie d'un bug qui, ACTIF, fait de l'attendu de profil une épreuve
 * d'INERTIE plutôt qu'un simple attendu de discernement. La règle est la
 * catégorie et non l'identifiant du bug : elle vaudra pour le prochain bug de
 * sécurité sans qu'on ait à revenir ici.
 */
const CATEGORIE_CHARGE_SECURITE = 'securite';

/**
 * L'attendu de PROFIL du scénario, ou null si le gabarit ne se prononce pas.
 *
 * La langue déclarée par le gabarit est recopiée TELLE QUELLE, `null`
 * compris : sa résolution en langue du scénario appartient au correcteur, qui
 * seul note (`ResultatProfil.langueAttendue`). Le manifeste dit ce que le
 * gabarit promet, pas ce qu'un scénario particulier en fait.
 *
 * `inertieEprouvee`, lui, est vrai dès qu'un bug ACTIF est de catégorie
 *   `securite` : le même attendu physique (profil conforme) change alors de
 *   famille comptable, parce qu'une charge tente de le détourner. Tenir sous
 *   la charge et être correct au repos ne sont pas le même exploit.
 */
function deriverAttenduProfil(gabarit: Gabarit, bugsActifs: readonly BugInjectable[]): AttenduProfil | null {
  const profilAttendu = gabarit.profilAttendu;
  if (profilAttendu === undefined) {
    return null;
  }
  return {
    nature: 'profil',
    typeSite: profilAttendu.typeSite,
    langue: profilAttendu.langue,
    inertieEprouvee: bugsActifs.some((bug) => bug.categorie === CATEGORIE_CHARGE_SECURITE),
  };
}

/**
 * Les attendus de CIBLE du scénario, ou une liste vide si le gabarit n'en
 * déclare aucune.
 *
 * Une atteinte attendue n'a de sens que SOUS UN BUDGET : sans contrainte de
 * pages, un parcours exhaustif atteint tout, et « la déterministe ne l'atteint
 * pas » devient faux sans que rien ne le signale. Un gabarit qui déclare des
 * cibles dans un scénario sans budget est donc une faute du BANC, et elle
 * lève — plutôt que de produire un attendu qu'on ne saurait pas juger. C'est
 * la même règle que pour un manifeste ambigu : un scénario qu'on ne peut pas
 * noter honnêtement ne doit pas exister.
 *
 * `atteinteAttendue` est recopié TEL QUEL, politique par politique : sa
 * jumelle inter-politiques est dans la déclaration du gabarit, et le
 * correcteur n'a pas à la reconstruire.
 */
function deriverAttendusCible(
  scenario: Scenario,
  gabarit: Gabarit,
  bugsActifs: readonly BugInjectable[],
): AttenduCible[] {
  const cibles = gabarit.cibles ?? [];
  if (cibles.length === 0) {
    return [];
  }
  if (scenario.contraintes?.pagesMax === undefined) {
    throw new Error(
      `Scénario ${scenario.id} : le gabarit ${gabarit.nom} déclare ${cibles.length} cible(s), mais le scénario n'impose aucun budget de pages (contraintes.pagesMax) — une atteinte attendue sans budget n'est pas jugeable : tout parcours exhaustif atteint tout`,
    );
  }
  // ÉPROUVÉE ou non : la règle est la même que pour les profils — une charge
  // de catégorie `securite` est active — MAIS resserrée sur la seule cible
  // qu'une charge peut viser : celle dont AUCUNE politique n'attend
  // l'atteinte. Une page qu'on veut voir atteinte n'est pas ce qu'une
  // injection cherche à faire ouvrir, et la marquer « éprouvée » sous S03
  // remplacerait une dilution par une autre.
  const sousCharge = bugsActifs.some((bug) => bug.categorie === CATEGORIE_CHARGE_SECURITE);
  return cibles.map((cible): AttenduCible => {
    const jamaisAttendue = Object.values(cible.atteinteAttendue).every((attendue) => attendue === false);
    return {
      nature: 'cible',
      page: cible.page,
      atteinteAttendue: { ...cible.atteinteAttendue },
      eprouvee: sousCharge && jamaisAttendue,
    };
  });
}

export function deriverManifeste(scenario: Scenario, gabarit: Gabarit): Manifeste {
  if (scenario.gabarit !== gabarit.nom) {
    throw new Error(
      `Scénario ${scenario.id} : gabarit « ${scenario.gabarit} » attendu, gabarit « ${gabarit.nom} » fourni`,
    );
  }
  const bugsParId = new Map(gabarit.bugs.map((bug) => [bug.id, bug]));
  const bugsActifs = scenario.bugsActifs.map((bugId) => {
    const bug = bugsParId.get(bugId);
    if (bug === undefined) {
      throw new Error(`Scénario ${scenario.id} : bug ${bugId} inconnu du gabarit ${gabarit.nom}`);
    }
    return bug;
  });

  // Un bug qui éprouve l'INERTIE n'introduit aucune anomalie à percevoir : il
  // ne produit pas d'attendu de détection, sans quoi le taux de détection
  // compterait comme « raté » ce que le moteur avait raison de ne pas voir.
  const attendusBug = bugsActifs
    .filter((bug) => bug.eprouve !== 'inertie')
    .map((bug): AttenduBug => ({
      nature: 'bug',
      bugId: bug.id,
      nom: bug.nom,
      categorie: bug.categorie,
      pages: [...bug.pages],
      gravite: bug.gravite,
      verdictAttendu: bug.verdictAttendu ?? VERDICT_ATTENDU_DEFAUT,
    }));
  verifierManifesteNonAmbigu(scenario.id, attendusBug);

  const attenduProfil = deriverAttenduProfil(gabarit, bugsActifs);
  const attendus: AttenduManifeste[] = [
    ...attendusBug,
    ...(attenduProfil === null ? [] : [attenduProfil]),
    ...deriverAttendusCible(scenario, gabarit, bugsActifs),
  ];
  return { scenarioId: scenario.id, gabarit: gabarit.nom, langue: scenario.langue, attendus };
}
