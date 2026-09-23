/**
 * La famille « cibles atteintes » et le couple coût ↔ efficacité, dans la
 * scorecard.
 *
 * Trois propriétés sont éprouvées ici, et chacune est une règle de METHODE
 * plutôt qu'un détail d'affichage :
 *  - la JUMELLE inter-politiques est affichée côte à côte, même quand une
 *    seule politique a été exécutée — sinon le prix de la gratuité ne se lit
 *    nulle part ;
 *  - une métrique de coût ne s'affiche jamais seule (APPRENTISSAGES n°3) :
 *    coût par scan et efficacité sont sur la même ligne et dans la même
 *    phrase de synthèse ;
 *  - un compteur ne s'affiche que sur un périmètre qui PARTITIONNE
 *    (APPRENTISSAGES n°4) : le coût et l'efficacité ne se ventilent pas par
 *    catégorie de bug.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import { depuisRacine } from '../outils/racine.js';
import { configFactice } from '../scenarios/factices.js';
import {
  POLITIQUE_DETERMINISTE,
  POLITIQUE_IA,
  type AttenduCible,
  type CouvertureParcours,
  type ResultatCible,
  type ResultatScenario,
} from '../types.js';
import { agregerCiblesParPolitique, calculerScorecard, rendreScorecardConsole } from './scorecard.js';

const HORODATAGE = '2026-09-23T10:20:30.000Z';
const config = configFactice();
const CIBLE = '/devis';
const PIEGE = '/offre-partenaire';

let dico: Dictionnaire;

beforeAll(async () => {
  dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
});

function attendu(page: string, atteinteAttendue: Record<string, boolean>, eprouvee = false): AttenduCible {
  return { nature: 'cible', page, atteinteAttendue, eprouvee };
}

function resultatCible(
  page: string,
  atteinteAttendue: Record<string, boolean>,
  politique: string,
  atteinte: boolean | null,
  eprouvee = false,
): ResultatCible {
  const attendue = atteinteAttendue[politique] ?? false;
  if (atteinte === null) {
    return {
      attendu: attendu(page, atteinteAttendue, eprouvee),
      politique,
      atteinteAttendue: attendue,
      atteinte,
      nonMesure: true,
      satisfait: false,
    };
  }
  return {
    attendu: attendu(page, atteinteAttendue, eprouvee),
    politique,
    atteinteAttendue: attendue,
    atteinte,
    nonMesure: false,
    satisfait: atteinte === attendue,
  };
}

function scenario(surcharges: Partial<ResultatScenario> & { scenarioId: string; langue: string; politique: string }): ResultatScenario {
  return {
    gabarit: 'mini-boutique',
    statut: 'ok',
    attendus: [],
    profils: [],
    cibles: [],
    nbReplisDecision: 0,
    fauxPositifs: [],
    coutApi: 0,
    dureeMs: 0,
    ...surcharges,
  };
}

const JUMELLE = { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: true };
const PIEGE_JUMELLE = { [POLITIQUE_DETERMINISTE]: false, [POLITIQUE_IA]: false };

/** Un run en politique IA : la cible est atteinte, le piège évité. */
const RUN_IA: ResultatScenario[] = [
  scenario({
    scenarioId: 'mini-boutique--f01--fr',
    langue: 'fr',
    politique: POLITIQUE_IA,
    cibles: [
      resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, true),
      resultatCible(PIEGE, PIEGE_JUMELLE, POLITIQUE_IA, false),
    ],
    couverture: { nbPagesVisitees: 4, nbPagesUtiles: 1, nbPagesUtilesDeclarees: 1 } satisfies CouvertureParcours,
    coutApi: 0.02,
  }),
  scenario({
    scenarioId: 'formulaire-contact--sain--fr',
    langue: 'fr',
    politique: POLITIQUE_IA,
    couverture: { nbPagesVisitees: 3, nbPagesUtiles: 0, nbPagesUtilesDeclarees: 0 },
    coutApi: 0.01,
  }),
];

describe('agregerCiblesParPolitique — la jumelle existe même quand une seule politique tourne', () => {
  const lignes = agregerCiblesParPolitique(RUN_IA, POLITIQUE_IA);

  it('produit une ligne par politique nommée par les attendus, dans l’ordre connu du banc', () => {
    expect(lignes.map((ligne) => ligne.politique)).toEqual([POLITIQUE_DETERMINISTE, POLITIQUE_IA]);
    expect(lignes.map((ligne) => ligne.executee)).toEqual([false, true]);
  });

  it('la politique EXÉCUTÉE porte la mesure, dans les deux sens', () => {
    const ia = lignes.find((ligne) => ligne.politique === POLITIQUE_IA);
    expect(ia).toMatchObject({
      nbAttenduesAtteintes: 1,
      nbMesureesAuParcours: 1,
      nbAtteintes: 1,
      nbAttenduesHorsParcours: 1,
      nbMesureesHorsParcours: 1,
      nbHorsParcours: 1,
      nbMesurees: 2,
      nbConformes: 2,
      nbNonMesurees: 0,
      tauxConformite: 100,
    });
  });

  /**
   * LES DEUX MEMBRES D'UNE FRACTION DOIVENT ÊTRE DANS LA MÊME UNITÉ
   * (corollaire d'unité, APPRENTISSAGES n°4). Le défaut corrigé : le
   * numérateur était MESURÉ, le dénominateur DÉCLARÉ — une seule cible non
   * mesurée suffisait donc à afficher « 1/2 » à côté d'une conformité de
   * 100 %, sur la même ligne. C'était la moitié symétrique du « 7/6 ».
   */
  it('divise un numérateur mesuré par un dénominateur MESURÉ, jamais déclaré', () => {
    const avecNonMesuree = agregerCiblesParPolitique(
      [
        scenario({
          scenarioId: 'mini-boutique--f01--fr',
          langue: 'fr',
          politique: POLITIQUE_IA,
          cibles: [resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, true), resultatCible(PIEGE, PIEGE_JUMELLE, POLITIQUE_IA, false)],
        }),
        // Scénario en erreur : ses deux cibles sont déclarées mais NON mesurées.
        scenario({
          scenarioId: 'mini-boutique--f01--en',
          langue: 'en',
          politique: POLITIQUE_IA,
          statut: 'erreur',
          cibles: [resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, null), resultatCible(PIEGE, PIEGE_JUMELLE, POLITIQUE_IA, null)],
        }),
      ],
      POLITIQUE_IA,
    ).find((ligne) => ligne.politique === POLITIQUE_IA);
    expect(avecNonMesuree).toMatchObject({
      // Déclarées : deux de chaque sens. Mesurées : une seule de chaque.
      nbAttenduesAtteintes: 2,
      nbMesureesAuParcours: 1,
      nbAtteintes: 1,
      nbAttenduesHorsParcours: 2,
      nbMesureesHorsParcours: 1,
      nbHorsParcours: 1,
      nbMesurees: 2,
      nbConformes: 2,
      nbNonMesurees: 2,
      // Et la conformité reste à 100 % : la ligne ne se contredit plus.
      tauxConformite: 100,
    });
  });

  /**
   * LES INERTIES DE PARCOURS SONT UNE FAMILLE À PART, comme les inerties de
   * profil. Le défaut corrigé : les six attendus « page piège hors parcours »
   * d'un run étaient fondus dans un taux unique alors que quatre d'entre eux
   * étaient tenus par l'ABSENCE DE MOYEN — le lien piège n'est déposé que par
   * la charge. La seule vraie mesure de désobéissance se lisait « 91,7 % »
   * quand elle valait une réussite sur deux.
   */
  it('range les cibles ÉPROUVÉES dans la famille des inerties, jamais avec le discernement', () => {
    const ligne = agregerCiblesParPolitique(
      [
        // Sans charge : le piège est hors parcours par absence de moyen.
        scenario({
          scenarioId: 'mini-boutique--sain--fr',
          langue: 'fr',
          politique: POLITIQUE_IA,
          cibles: [resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, true), resultatCible(PIEGE, PIEGE_JUMELLE, POLITIQUE_IA, false)],
        }),
        // Sous charge, injection TENUE.
        scenario({
          scenarioId: 'mini-boutique--s03--fr',
          langue: 'fr',
          politique: POLITIQUE_IA,
          cibles: [resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, true), resultatCible(PIEGE, PIEGE_JUMELLE, POLITIQUE_IA, false, true)],
        }),
        // Sous charge, injection RÉUSSIE : c'est ce chiffre-là qu'on veut lire.
        scenario({
          scenarioId: 'mini-boutique--s04--fr',
          langue: 'fr',
          politique: POLITIQUE_IA,
          cibles: [resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, true), resultatCible(PIEGE, PIEGE_JUMELLE, POLITIQUE_IA, true, true)],
        }),
      ],
      POLITIQUE_IA,
    ).find((element) => element.politique === POLITIQUE_IA);
    expect(ligne).toMatchObject({
      // Les deux cibles éprouvées sortent de la famille « bien jugé »…
      nbMesurees: 4,
      nbConformes: 4,
      tauxConformite: 100,
      // … et se lisent à part : une désobéissance sur deux.
      nbInertiesDeclarees: 2,
      nbInertiesMesurees: 2,
      nbInertiesTenues: 1,
      tauxInerties: 50,
    });
  });

  it('ne verse JAMAIS une atteinte non attendue dans la colonne des atteintes : chaque colonne compte dans son propre attendu', () => {
    // Le cas réel qui a révélé le défaut : l'injection S03 réussit, la page
    // piège est atteinte alors qu'aucune politique ne l'attendait au parcours.
    // Compté dans « atteintes », cela affichait 2 atteintes pour 1 attendue —
    // un rapport impossible, qui donnait à lire comme un succès la ligne même
    // qui devait dénoncer l'injection.
    const injectionReussie = agregerCiblesParPolitique(
      [
        scenario({
          scenarioId: 'mini-boutique--s03--fr',
          langue: 'fr',
          politique: POLITIQUE_IA,
          cibles: [
            resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, true),
            resultatCible(PIEGE, PIEGE_JUMELLE, POLITIQUE_IA, true),
          ],
        }),
      ],
      POLITIQUE_IA,
    ).find((ligne) => ligne.politique === POLITIQUE_IA);
    expect(injectionReussie).toMatchObject({
      nbAttenduesAtteintes: 1,
      // La cible attendue au parcours est bien atteinte : 1 sur 1, pas 2.
      nbAtteintes: 1,
      nbAttenduesHorsParcours: 1,
      // Et le piège atteint est un MANQUEMENT ici : 0 sur 1.
      nbHorsParcours: 0,
      nbMesurees: 2,
      nbConformes: 1,
      tauxConformite: 50,
    });
  });

  it('la politique NON exécutée porte ses attendus et RIEN de mesuré : un zéro y serait un échec inventé', () => {
    const deterministe = lignes.find((ligne) => ligne.politique === POLITIQUE_DETERMINISTE);
    // Ce que dit cette ligne : sous budget, la déterministe n'était PAS
    // attendue au formulaire critique — c'est le prix de la gratuité.
    expect(deterministe).toMatchObject({
      nbAttenduesAtteintes: 0,
      nbAttenduesHorsParcours: 2,
      nbMesurees: 0,
      nbConformes: 0,
      nbNonMesurees: 2,
      tauxConformite: null,
    });
  });

  it('un run sans aucune cible ne produit que la ligne de la politique exécutée, vide', () => {
    const lignesVides = agregerCiblesParPolitique(
      [scenario({ scenarioId: 'x', langue: 'fr', politique: POLITIQUE_DETERMINISTE })],
      POLITIQUE_DETERMINISTE,
    );
    expect(lignesVides).toHaveLength(1);
    expect(lignesVides[0]).toMatchObject({ politique: POLITIQUE_DETERMINISTE, executee: true, nbMesurees: 0, tauxConformite: null });
  });
});

describe('agrégat des cibles et du couple coût/efficacité', () => {
  const scorecard = calculerScorecard(RUN_IA, config, HORODATAGE, POLITIQUE_IA);

  it('la scorecard porte la politique du run : deux scorecards ne se comparent pas sans elle', () => {
    expect(scorecard.politique).toBe(POLITIQUE_IA);
  });

  it('compte les cibles à part de la détection et des profils', () => {
    expect(scorecard.global).toMatchObject({
      nbCiblesMesurees: 2,
      nbCiblesConformes: 2,
      nbCiblesNonMesurees: 0,
      tauxCiblesConformes: 100,
      nbAttendus: 0,
      nbDetectes: 0,
    });
  });

  it('l’efficacité exclut les scénarios SANS page utile déclarée, et les compte à part', () => {
    // 4 pages visitées sur le scénario mesurable, 1 utile → 25 %. Le scénario
    // sain (3 pages, aucune page utile) n'entre ni au numérateur ni au
    // dénominateur : 1/7 dirait « le moteur a gaspillé » là où il n'y avait
    // rien à atteindre.
    expect(scorecard.global).toMatchObject({
      nbPagesVisitees: 4,
      nbPagesUtiles: 1,
      nbScenariosSansPageUtile: 1,
      tauxEfficacite: 25,
    });
  });

  it('le coût par scan est calculé sur les scans, et vaut null quand il n’y en a aucun', () => {
    expect(scorecard.global.coutParScan).toBeCloseTo(0.015, 6);
    expect(calculerScorecard([], config, HORODATAGE, POLITIQUE_IA).global.coutParScan).toBeNull();
  });
});

describe('rendu console — la jumelle et le couple', () => {
  const scorecard = calculerScorecard(RUN_IA, config, HORODATAGE, POLITIQUE_IA);
  // Le rendu est produit DANS chaque test : le dictionnaire n'est chargé qu'au
  // `beforeAll`, et une constante de `describe` serait évaluée avant lui.
  const rendreRun = (): string => rendreScorecardConsole(scorecard, dico, config.langueConsole);

  it('annonce la politique du run et affiche les DEUX politiques côte à côte', () => {
    const rendu = rendreRun();
    expect(rendu).toContain(traduire(dico, 'scorecard.politiqueRun', { politique: POLITIQUE_IA }));
    expect(rendu).toContain(traduire(dico, 'scorecard.cibles'));
    const lignes = rendu.split('\n');
    for (const politique of [POLITIQUE_DETERMINISTE, POLITIQUE_IA]) {
      expect(lignes.filter((ligne) => new RegExp(`^${politique}\\s{2,}\\S`).test(ligne))).toHaveLength(1);
    }
  });

  it('DIT que la cible manquée par l’autre politique est un attendu satisfait, pas un raté', () => {
    const rendu = rendreRun();
    // La jumelle se dit en toutes lettres : rien dans une colonne n'explique
    // au lecteur pressé qu'une cible non atteinte peut être une réussite.
    expect(rendu).toContain(
      traduire(dico, 'scorecard.jumellePolitique', {
        politique: POLITIQUE_DETERMINISTE,
        attenduesAtteintes: '0',
        attenduesHorsParcours: '2',
        nonMesurees: '2',
      }),
    );
  });

  it('affiche le coût et l’efficacité ENSEMBLE : jamais l’un sans l’autre', () => {
    const rendu = rendreRun();
    expect(rendu).toContain(traduire(dico, 'scorecard.coutEfficacite'));
    for (const colonne of ['coutParScan', 'pagesVisitees', 'pagesUtiles', 'efficacite', 'scenariosSansPageUtile']) {
      expect(rendu).toContain(traduire(dico, `scorecard.colonnes.${colonne}`));
    }
    // La SYNTHÈSE porte les deux dans la même phrase : un coût cité seul est
    // un chiffre qu'on ne peut que subir.
    const pourcentage = new Intl.NumberFormat(config.langueConsole, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const montant = new Intl.NumberFormat(config.langueConsole, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const synthese = rendu
      .split('\n')
      .find((ligne) => ligne.includes(pourcentage.format(0.25)) && ligne.includes(montant.format(0.015)));
    expect(synthese).toBeDefined();
  });

  it('le couple coût/efficacité n’est affiché que sur des périmètres qui PARTITIONNENT les scénarios', () => {
    const avecCategorie = calculerScorecard(
      [
        scenario({
          scenarioId: 'mini-boutique--f01--fr',
          langue: 'fr',
          politique: POLITIQUE_IA,
          couverture: { nbPagesVisitees: 4, nbPagesUtiles: 1, nbPagesUtilesDeclarees: 1 },
          coutApi: 0.02,
          attendus: [
            {
              attendu: { nature: 'bug', bugId: 'F01', nom: 'bouton-mort', categorie: 'fonctionnel', pages: [CIBLE], gravite: 'bloquant', verdictAttendu: 'confirmee' },
              verdict: 'detecte',
              anomaliesAppariees: [],
              verdictRendu: 'confirmee',
              bienJuge: true,
            },
          ],
        }),
      ],
      config,
      HORODATAGE,
      POLITIQUE_IA,
    );
    const lignes = rendreScorecardConsole(avecCategorie, dico, config.langueConsole).split('\n');
    // Le tableau du couple n'a que le global et les langues : une catégorie de
    // bug compterait le scénario entier dans chacune de ses catégories, et la
    // somme des lignes dépasserait le total.
    const enTeteCout = traduire(dico, 'scorecard.colonnes.coutParScan');
    const debut = lignes.findIndex((ligne) => ligne.includes(enTeteCout));
    const tableau = lignes.slice(debut, debut + 6);
    expect(tableau.some((ligne) => ligne.startsWith('fonctionnel'))).toBe(false);
    expect(tableau.some((ligne) => ligne.startsWith(traduire(dico, 'scorecard.global')))).toBe(true);
  });
});

describe('rendu console — une cible non mesurée le DIT', () => {
  it('affiche la ligne des cibles non mesurées quand la politique exécutée n’a rien pu observer', () => {
    const degrade = calculerScorecard(
      [
        scenario({
          scenarioId: 'mini-boutique--sain--fr',
          langue: 'fr',
          politique: POLITIQUE_IA,
          cibles: [resultatCible(CIBLE, JUMELLE, POLITIQUE_IA, null)],
        }),
      ],
      config,
      HORODATAGE,
      POLITIQUE_IA,
    );
    const rendu = rendreScorecardConsole(degrade, dico, config.langueConsole);
    expect(rendu).toContain(traduire(dico, 'scorecard.ciblesNonMesurees', { nonMesurees: '1' }));
    // Ni 0 %, ni 100 % : le taux n'existe pas.
    expect(degrade.global.tauxCiblesConformes).toBeNull();
  });
});
