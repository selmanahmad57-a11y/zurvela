/**
 * Le protocole de bout en bout, avec un `Reexecuteur` FACTICE et les VRAIS
 * détecteurs : le factice ne décide jamais « reproduite », il rend des
 * signaux que la détection relit. Aucun navigateur ici.
 */
import { describe, expect, it } from 'vitest';
import type { AnomalieCandidate, EntreeJournal, Reexecuteur, Signal, Viewport } from '../../types.js';
import { creerDetecteurHttp } from '../detection/d-http.js';
import { creerDetecteurLenteur } from '../detection/d-lenteur.js';
import { creerDetecteurRecouvrement } from '../detection/d-recouvrement.js';
import {
  INTERCEPTEUR,
  CONFIG_TEST,
  DESKTOP,
  MOBILE,
  URL_CONTACT,
  etatImage,
  interception,
  reponse,
  requeteEnAttente,
  soumission,
} from '../detection/fabriques-test.js';
import { MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE, autoDiagnosticMecanique } from './auto-diagnostic.js';
import { MOTIF_SOUS_SEUIL_RETENUE } from './calibration.js';
import {
  CONFIG_CONFIRMATION_TEST,
  candidateSimulee,
  contexteConfirmation,
  reexecuteurFactice,
  type RejeuScripte,
} from './fabriques-test.js';
import { EVENEMENT_TIERS_SANS_EFFET, NOM_PROTOCOLE_ANTI_FAUX_POSITIFS, creerProtocole } from './protocole.js';
import { MOTIF_MESURE_SOUS_SEUIL, MOTIF_NON_MESUREE, MOTIF_TIERS_SANS_EFFET } from './verdict.js';
import {
  MOTIF_CONFIANCE_SUFFISANTE,
  MOTIF_ECHEANCE_ATTEINTE,
  MOTIF_JAMAIS_REPRODUITE,
  MOTIF_REJEU_IMPOSSIBLE,
  MOTIF_REPRODUCTION_PARTIELLE,
  MOTIF_REPRODUITE,
} from './verdict.js';

const DETECTEURS = [
  creerDetecteurHttp(CONFIG_TEST.http, CONFIG_TEST.tiers),
  creerDetecteurLenteur(CONFIG_TEST.lenteur),
  creerDetecteurRecouvrement(CONFIG_TEST.recouvrement),
];

const protocole = creerProtocole({ config: CONFIG_CONFIRMATION_TEST, autoDiagnostic: autoDiagnosticMecanique });

interface Execution {
  journal: EntreeJournal[];
  rejeu: { appels: { viewport: string }[] };
}

/** Lance le protocole sur des candidates avec un re-exécuteur scripté. */
async function confirmer(candidates: AnomalieCandidate[], scripts: RejeuScripte[], surcharges: { echeance?: number } = {}) {
  const journal: EntreeJournal[] = [];
  const rejeu = reexecuteurFactice(scripts);
  const contexte = contexteConfirmation({ journal, reexecuteur: rejeu, detecteurs: DETECTEURS, ...surcharges });
  const resultat = await protocole.confirmer(candidates, contexte);
  return { resultat, journal, rejeu };
}

function typesJournal({ journal }: Execution): string[] {
  return journal.map((entree) => entree.type);
}

function details(journal: EntreeJournal[], type: string): Record<string, unknown> | undefined {
  return journal.find((entree) => entree.type === type)?.details as Record<string, unknown> | undefined;
}

describe('creerProtocole — verdicts', () => {
  it('2/2 : confirmee, RETENUE, enrichie des localisations et des observations du groupe', async () => {
    const candidate = candidateSimulee();
    const { resultat, journal, rejeu } = await confirmer([candidate], [{ enEchec: true }]);

    expect(protocole.nom).toBe(NOM_PROTOCOLE_ANTI_FAUX_POSITIFS);
    expect(rejeu.appels).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
    expect(rejeu.appels.map((appel) => appel.viewport)).toEqual([DESKTOP.nom, DESKTOP.nom]);
    expect(resultat.ecartees).toEqual([]);
    expect(resultat.retenues).toHaveLength(1);
    const [anomalie] = resultat.retenues;
    expect(anomalie?.verdict).toBe('confirmee');
    // L'anomalie porte son POURQUOI et la clé de son groupe : le rapport se
    // relit sans le journal (traçabilité, cahier §1a).
    expect(anomalie?.motif).toBe(MOTIF_REPRODUITE);
    expect(anomalie?.groupe).toBe(resultat.groupes?.[0]?.groupe.cle);
    expect(anomalie?.localisations).toEqual([{ urlOuEtape: URL_CONTACT }]);
    expect(anomalie?.observations).toEqual([{ viewport: DESKTOP.nom }]);
    // Un verdict confirmé RENFORCE la confiance du détecteur.
    expect(anomalie?.confiance).toBeGreaterThan(candidate.confiance);
    expect(resultat.coutApi).toBe(0);
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'confirmee', motif: MOTIF_REPRODUITE, tauxReproduction: 1 });
    expect(details(journal, 'confirmation.verdict')).toMatchObject({ verdict: 'confirmee', motif: MOTIF_REPRODUITE, taux: 1 });
  });

  it('1/2 : intermittente, RETENUE et marquée — un bug sur deux requêtes est un bug (I01)', async () => {
    const { resultat } = await confirmer([candidateSimulee()], [{ enEchec: true }, { enEchec: false }]);
    expect(resultat.retenues).toHaveLength(1);
    expect(resultat.retenues[0]?.verdict).toBe('intermittente');
    expect(resultat.retenues[0]?.motif).toBe(MOTIF_REPRODUCTION_PARTIELLE);
    expect(resultat.groupes?.[0]).toMatchObject({ motif: MOTIF_REPRODUCTION_PARTIELLE, tauxReproduction: 0.5 });
  });

  it('0/2 : non-reproduite, ÉCARTÉE avec sa raison — le faux positif simulé (T01)', async () => {
    const { resultat } = await confirmer([candidateSimulee()], [{ enEchec: false }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees).toHaveLength(1);
    expect(resultat.ecartees[0]).toMatchObject({ verdict: 'non-reproduite', raison: MOTIF_JAMAIS_REPRODUITE });
    // La candidate écartée garde ses preuves d'origine et RÉFÉRENCE son groupe
    // par sa clé : la preuve complète existe une fois (P2-1, contrat 7).
    expect(resultat.ecartees[0]?.candidate).toBe(resultat.groupes?.[0]?.groupe.membres[0]);
    expect(resultat.ecartees[0]?.cle).toBe(resultat.groupes?.[0]?.groupe.cle);
    expect(resultat.groupes?.find((groupe) => groupe.groupe.cle === resultat.ecartees[0]?.cle)?.tentatives).toHaveLength(2);
    expect(JSON.stringify(resultat.ecartees[0])).not.toContain('"membres"');
  });

  it('le rapport pèse en O(n) des candidates : une écartée RÉFÉRENCE son groupe, elle ne le recopie pas (P2-1, contrat 7)', async () => {
    // Le contrôle qui peut échouer : quand chaque écartée recopiait son groupe
    // avec tous ses membres, un groupe de N membres pesait N² — 6,9 Mo à 187
    // candidates (fiche 07), 42 Mo à 1 649 (fiche 10). Quatre fois plus de
    // candidates doit peser environ quatre fois plus, pas seize.
    const poids = async (n: number): Promise<number> => {
      const candidates = Array.from({ length: n }, (_, i) => candidateSimulee({ urlOuEtape: `${URL_CONTACT}?p=${i}` }));
      const { resultat } = await confirmer(candidates, [{ enEchec: false }]);
      expect(resultat.groupes).toHaveLength(1);
      expect(resultat.ecartees).toHaveLength(n);
      return JSON.stringify({ groupes: resultat.groupes, ecartees: resultat.ecartees }).length;
    };
    const petit = await poids(10);
    const grand = await poids(40);
    expect(grand / petit).toBeLessThan(6);
  });

  it('un groupe fait SEULEMENT de tiers sans effet est écarté d’office : verdict sans-effet, aucun rejeu, journalisé (P2-2, contrat 1)', async () => {
    const tiers = candidateSimulee({ description: 'dependance-tierce-en-echec', graviteEstimee: 'mineur', sansEffetVisible: true, preuves: [reponse({ statut: 503, actionId: 'a1', urlRessource: 'https://widget.tiers.invalid/chat.js', interne: false })] });
    const { resultat, journal, rejeu } = await confirmer([tiers], [{ enEchec: true }]);
    expect(rejeu.appels).toEqual([]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'sans-effet', motif: MOTIF_TIERS_SANS_EFFET, tentatives: [] });
    expect(resultat.ecartees[0]).toMatchObject({ verdict: 'sans-effet', raison: MOTIF_TIERS_SANS_EFFET });
    expect(details(journal, EVENEMENT_TIERS_SANS_EFFET)).toMatchObject({ nbMembres: 1, hote: 'widget.tiers.invalid' });
  });

  it('un seul membre à effet visible suffit : le groupe est jugé normalement — le silence ne gagne pas par majorité', async () => {
    const preuve = reponse({ statut: 503, actionId: 'a1', urlRessource: 'https://widget.tiers.invalid/chat.js', interne: false });
    const sans = candidateSimulee({ description: 'dependance-tierce-en-echec', sansEffetVisible: true, preuves: [preuve] });
    const avec = candidateSimulee({ description: 'dependance-tierce-en-echec', viewport: 'mobile', preuves: [preuve] });
    const { resultat, rejeu } = await confirmer([sans, avec], [{ enEchec: true }]);
    expect(rejeu.appels.length).toBeGreaterThan(0);
    expect(resultat.groupes?.every((groupe) => groupe.verdict !== 'sans-effet')).toBe(true);
  });

  it('la SECONDE PORTE : une découverte tierce sans effet visible est tue, comptée et journalisée (P2-2, contrat 1)', async () => {
    // LE DÉFAUT QUE LE RÉEL A TROUVÉ. La doctrine ne filtrait que les
    // candidates du scan. Les découvertes du rejeu entraient par une autre
    // porte, sans être jugées : automationexercise a publié vingt-deux
    // sections « service extérieur » pour le gestionnaire de consentement de
    // Google, expandtesting treize, toutes en découvertes. Le contrôle qui
    // peut échouer : retirer le filtre de la boucle des découvertes.
    const tiers = reponse({
      statut: 503,
      urlRessource: 'https://consentement.tiers.invalid/cs.js',
      methode: 'GET',
      typeRessource: 'script',
      interne: false,
    });
    const { resultat, journal } = await confirmer([candidateSimulee()], [{ enEchec: true, signauxEnPlus: [tiers] }]);
    // Le groupe d'origine, lui, est confirmé : la découverte est bien née.
    expect(resultat.retenues.map((anomalie) => anomalie.verdict)).toEqual(['confirmee']);
    expect(resultat.decouvertes).toEqual([]);
    // Tue, mais PAS invisible : le silence se compte comme les autres.
    expect(resultat.groupes?.filter((groupe) => groupe.verdict === 'sans-effet')).toHaveLength(1);
    expect(details(journal, EVENEMENT_TIERS_SANS_EFFET)).toMatchObject({
      hote: 'consentement.tiers.invalid',
      typeRessource: 'script',
    });
    // … et sa PREUVE reste, parmi les écartées, comme pour une candidate tue
    // par la première porte. Le banc l'a exigé avant ce test : sans cette
    // trace, le correcteur ne pouvait apparier aucun silence de découverte,
    // et une revue n'aurait pas su DE QUOI le moteur s'était tu.
    const tues = resultat.ecartees.filter((ecartee) => ecartee.verdict === 'sans-effet');
    // Une preuve par rejeu : le groupe est un, ses constats sont deux.
    expect(tues).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
    expect(tues.every((ecartee) => ecartee.raison === MOTIF_TIERS_SANS_EFFET)).toBe(true);
    expect(new Set(tues.map((ecartee) => ecartee.cle)).size).toBe(1);
  });

  it('… et DANS L’AUTRE SENS : une découverte tierce à effet visible est publiée — un filtre qui ne peut pas rater n’en est pas un', async () => {
    // Même porte, même doctrine : ce qui se VOIT passe. Sans ce second sens,
    // « tout taire » ferait passer le test précédent.
    const image = 'https://images.tiers.invalid/banniere.png';
    const { resultat } = await confirmer(
      [candidateSimulee()],
      [
        {
          enEchec: true,
          signauxEnPlus: [
            reponse({ statut: 503, urlRessource: image, methode: 'GET', typeRessource: 'image', interne: false }),
            etatImage({ ressource: image, complete: true, largeurNaturelle: 0, hauteurNaturelle: 0 }),
          ],
        },
      ],
    );
    expect(resultat.decouvertes?.map((anomalie) => anomalie.verdict)).toEqual(['decouverte']);
    expect(resultat.groupes?.some((groupe) => groupe.verdict === 'sans-effet')).toBe(false);
  });

  it('aucune tentative exploitable : limite-automatisation — distincte de non-reproduite', async () => {
    const { resultat } = await confirmer([candidateSimulee()], [{ echecOutillage: true, erreur: 'page-inchargeable' }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees[0]?.verdict).toBe('limite-automatisation');
    expect(resultat.ecartees[0]?.raison).toBe(MOTIF_REJEU_IMPOSSIBLE);
    expect(resultat.groupes?.[0]?.tauxReproduction).toBeNull();
  });

  it('un rejeu partiellement impossible sans reproduction : l’auto-diagnostic corrige le verdict brut', async () => {
    const { resultat, journal } = await confirmer(
      [candidateSimulee()],
      [{ echecOutillage: true, erreur: 'navigateur-perdu' }, { enEchec: false }],
    );
    expect(resultat.groupes?.[0]?.verdict).toBe('limite-automatisation');
    expect(resultat.groupes?.[0]?.motif).toBe(MOTIF_REJEU_PARTIELLEMENT_IMPOSSIBLE);
    expect(details(journal, 'confirmation.auto-diagnostic')).toMatchObject({
      verdictBrut: 'non-reproduite',
      verdict: 'limite-automatisation',
    });
  });

  it('garde le motif le plus précis quand l’auto-diagnostic ne change pas le verdict', async () => {
    const { resultat, journal } = await confirmer([candidateSimulee()], [{ echecOutillage: true }]);
    expect(resultat.groupes?.[0]?.motif).toBe(MOTIF_REJEU_IMPOSSIBLE);
    expect(journal.map((entree) => entree.type)).not.toContain('confirmation.auto-diagnostic');
  });

  it('rétrograde en basse-confiance une intermittente trop faible, et l’écarte', async () => {
    const { resultat } = await confirmer([candidateSimulee({ confiance: 0.5 })], [{ enEchec: true }, { enEchec: false }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees[0]?.verdict).toBe('basse-confiance');
    expect(resultat.ecartees[0]?.raison).toBe(MOTIF_SOUS_SEUIL_RETENUE);
  });
});

describe('creerProtocole — consolidation, échéance, politique', () => {
  it('ne paie QU’UNE re-exécution par cause racine, et écarte tous les membres du groupe', async () => {
    const membres = [
      candidateSimulee({ detecteur: 'd-http', description: 'reponse-5xx' }),
      candidateSimulee({ detecteur: 'd-http', description: 'reponse-5xx', urlOuEtape: `${URL_CONTACT}?b=1` }),
    ];
    const { resultat, rejeu, journal } = await confirmer(membres, [{ enEchec: false }]);

    expect(resultat.groupes).toHaveLength(1);
    expect(rejeu.appels).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
    expect(resultat.ecartees.map((ecartee) => ecartee.candidate)).toEqual(membres);
    expect(details(journal, 'confirmation.debut')).toMatchObject({ nbCandidates: 2, nbGroupes: 1 });
  });

  it('échéance atteinte : les groupes restants sont limite-automatisation, SANS rejeu', async () => {
    const { resultat, rejeu } = await confirmer([candidateSimulee()], [{ enEchec: true }], { echeance: Date.now() });
    expect(rejeu.appels).toEqual([]);
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'limite-automatisation', motif: MOTIF_ECHEANCE_ATTEINTE });
    expect(resultat.retenues).toEqual([]);
  });

  it('budget insuffisant pour une tentative ENTIÈRE : limite-automatisation, et surtout pas un verdict sur une tentative tronquée', async () => {
    // Il reste du temps (5 s) mais pas de quoi mener un rejeu jusqu'au bout
    // (marge 3 s + budget minimal 8 s). Une tentative écourtée ne se
    // distinguerait pas d'un rejeu complet qui n'aurait rien reproduit : le
    // verdict d'un défaut déterministe dépendrait alors du temps restant.
    const { resultat, rejeu } = await confirmer([candidateSimulee()], [{ enEchec: true }], { echeance: Date.now() + 5000 });
    expect(rejeu.appels).toEqual([]);
    expect(resultat.groupes?.[0]).toMatchObject({ verdict: 'limite-automatisation', motif: MOTIF_ECHEANCE_ATTEINTE, tauxReproduction: null });
    expect(resultat.retenues).toEqual([]);
  });

  it('politique économe : un groupe déjà très sûr est confirmé sans rejeu', async () => {
    const econome = creerProtocole({
      config: { ...CONFIG_CONFIRMATION_TEST, politique: 'econome' },
      autoDiagnostic: autoDiagnosticMecanique,
    });
    const journal: EntreeJournal[] = [];
    const rejeu = reexecuteurFactice([{ enEchec: false }]);
    const contexte = contexteConfirmation({ journal, reexecuteur: rejeu, detecteurs: DETECTEURS });

    const resultat = await econome.confirmer([candidateSimulee({ confiance: 0.95 }), candidateSimulee({ confiance: 0.7, urlOuEtape: `${URL_CONTACT}?b=1`, preuves: [reponse({ statut: 500, urlRessource: `${URL_CONTACT}/autre` })] })], contexte);

    expect(resultat.retenues[0]?.verdict).toBe('confirmee');
    expect(resultat.groupes?.[0]?.motif).toBe(MOTIF_CONFIANCE_SUFFISANTE);
    expect(resultat.groupes?.[0]?.tentatives).toEqual([]);
    // Le groupe sous le seuil, lui, est bien re-exécuté.
    expect(rejeu.appels).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
  });

  it('politique économe : une lenteur EN ATTENTE n’est JAMAIS confirmée sans rejeu, même très sûre (C3bis)', async () => {
    // « Ne finit pas » est un signal de GRAVITÉ, pas une preuve de
    // reproduction : on ignore si la requête pend à chaque fois ou une fois
    // par congestion. La confiance peut être haute (voie dédiée), mais le
    // court-circuit `confiance-suffisante` traiterait cette confiance comme
    // une preuve — faux par nature. Sans cette exclusion, une congestion
    // transitoire vue une fois serait publiée sans rejeu : le faux positif que
    // la correction de l'échelle de confiance vient d'éviter.
    const econome = creerProtocole({
      config: { ...CONFIG_CONFIRMATION_TEST, politique: 'econome' },
      autoDiagnostic: autoDiagnosticMecanique,
    });
    const journal: EntreeJournal[] = [];
    const rejeu = reexecuteurFactice([{ enEchec: false }]);
    const contexte = contexteConfirmation({ journal, reexecuteur: rejeu, detecteurs: DETECTEURS });

    const enAttente = candidateSimulee({
      confiance: 0.95, // ≥ seuilConfirmationDirecte (0,9)
      detecteur: 'd-lenteur',
      description: 'reponse-lente',
      preuves: [requeteEnAttente({ actionId: 'a1', attenteMs: CONFIG_TEST.lenteur.seuilMs * 2 })],
    });
    const resultat = await econome.confirmer([enAttente], contexte);

    // PAS de court-circuit : elle est rejouée, et son verdict vient du rejeu.
    expect(resultat.groupes?.[0]?.motif).not.toBe(MOTIF_CONFIANCE_SUFFISANTE);
    expect(rejeu.appels).toHaveLength(CONFIG_CONFIRMATION_TEST.reExecutions);
  });

  it('sans candidate : rien à confirmer, rien à rejouer, journal quand même tenu', async () => {
    const { resultat, rejeu, journal } = await confirmer([], [{ enEchec: true }]);
    expect(resultat).toMatchObject({ retenues: [], ecartees: [], coutApi: 0, groupes: [] });
    expect(rejeu.appels).toEqual([]);
    expect(journal.map((entree) => entree.type)).toEqual(['confirmation.debut', 'confirmation.fin']);
  });

  it('journalise chaque étape, dans l’ordre (constitution §5)', async () => {
    const { journal, rejeu } = await confirmer([candidateSimulee()], [{ enEchec: true }]);
    expect(typesJournal({ journal, rejeu })).toEqual([
      'confirmation.debut',
      'confirmation.groupe',
      // La part allouée AVANT de la dépenser : sans elle, on lirait le
      // nombre de rejeux sans savoir combien le groupe avait le droit d'en
      // prendre, ni sur quelle estimation de coût (contrat du budget
      // réparti, R1 et R2).
      'confirmation.quota',
      'confirmation.tentative',
      'confirmation.tentative',
      'confirmation.verdict',
      'confirmation.fin',
    ]);
    expect(details(journal, 'confirmation.quota')).toMatchObject({ rejeuxMax: 3, groupesRestants: 1 });
    expect(details(journal, 'confirmation.tentative')).toMatchObject({ numero: 1, viewport: DESKTOP.nom, reproduite: true, echecOutillage: false });
    expect(details(journal, 'confirmation.fin')).toMatchObject({ nbRetenues: 1, nbEcartees: 0, coutApi: 0 });
  });
});

describe('creerProtocole — détecteur gradué et contre-épreuve', () => {
  const candidateLente = (surcharges: Partial<AnomalieCandidate> = {}): AnomalieCandidate =>
    candidateSimulee({
      detecteur: 'd-lenteur',
      description: 'reponse-lente',
      categorie: 'performance',
      graviteEstimee: 'important',
      confiance: 0.95,
      preuves: [reponse({ statut: 200, actionId: 'a1', dureeMs: 9000 })],
      ...surcharges,
    });

  it('enregistre la mesure brute de chaque tentative et l’agrège (D-LENTEUR est le seul détecteur gradué)', async () => {
    const { resultat, journal } = await confirmer([candidateLente()], [{ dureeMs: 9000 }, { dureeMs: 5000 }]);
    expect(resultat.groupes?.[0]?.verdict).toBe('confirmee');
    expect(resultat.groupes?.[0]?.mesureAgregee).toBe(7000);
    expect(details(journal, 'confirmation.tentative')).toMatchObject({ mesureMs: 9000 });
  });

  it('une lenteur qui ne se reproduit plus est écartée (L01) — par RE-MESURE, pas par absence de mesure', async () => {
    // Avant P2-1 (contrat 4), la ressource revenue sous le seuil ne produisait
    // pas de candidate, donc pas de mesure : le verdict tombait « jamais
    // reproduite » par absence (C-04). Désormais la ressource visée est relue
    // dans les signaux du rejeu, et le verdict tient sur sa mesure.
    const { resultat } = await confirmer([candidateLente()], [{ dureeMs: 100 }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees[0]?.verdict).toBe('non-reproduite');
    expect(resultat.ecartees[0]?.raison).toBe(MOTIF_MESURE_SOUS_SEUIL);
    expect(resultat.groupes?.[0]?.mesureAgregee).toBe(100);
    expect(resultat.groupes?.[0]?.tentatives.every((tentative) => tentative.mesureMs === 100 && tentative.nonMesuree === undefined)).toBe(true);
  });

  it('un rejeu de lenteur où la ressource visée n’est PAS rechargée est NON MESURÉ : limite, jamais « non reproduite »', async () => {
    // Le contrôle qui peut échouer : un rejeu qui charge la page mais ne
    // redemande pas la ressource lente ne prouve rien sur sa lenteur.
    const { resultat } = await confirmer([candidateLente({ preuves: [reponse({ actionId: 'a1', urlRessource: 'http://127.0.0.1:4800/api/autre', dureeMs: 9000 })] })], [{ dureeMs: 100 }]);
    expect(resultat.retenues).toEqual([]);
    expect(resultat.ecartees[0]?.verdict).toBe('limite-automatisation');
    expect(resultat.ecartees[0]?.raison).toBe(MOTIF_NON_MESUREE);
    expect(resultat.groupes?.[0]?.tentatives.every((tentative) => tentative.nonMesuree === true)).toBe(true);
  });

  it('anomalie de viewport : contre-épreuve dans l’AUTRE viewport, l’asymétrie attendue renforce la confiance', async () => {
    const candidate = candidateSimulee({
      detecteur: 'd-recouvrement',
      description: 'clic-intercepte',
      categorie: 'mobile',
      viewport: MOBILE.nom,
      element: INTERCEPTEUR,
      confiance: CONFIG_TEST.recouvrement.confianceGeometrie,
      observations: [{ viewport: MOBILE.nom }],
      preuves: [interception({ viewport: MOBILE.nom })],
      reproduction: { url: URL_CONTACT, pageDepart: URL_CONTACT, viewport: MOBILE, action: soumission('a1', { viewport: MOBILE.nom }), actionsPrealables: [] },
    });
    // Le recouvrement n'existe QUE sur mobile : c'est ce que la contre-épreuve doit constater.
    const rejeu: Reexecuteur & { viewports: string[] } = {
      viewports: [],
      rejouer(reproduction, viewport: Viewport) {
        rejeu.viewports.push(viewport.nom);
        const signaux: Signal[] = viewport.mobile ? [interception({ viewport: viewport.nom, page: reproduction.url })] : [];
        return Promise.resolve({
          signaux,
          parcours: { urlDepart: reproduction.url, pages: [], actions: [], arret: 'complet', enAttenteALArret: 0, pagesRestantesALArret: 0 as const, nbRecouvrementsEcartes: 0 },
          echecOutillage: false,
          dureeMs: 5,
        });
      },
    };
    const journal: EntreeJournal[] = [];
    const contexte = contexteConfirmation({ journal, reexecuteur: rejeu, detecteurs: DETECTEURS });

    const resultat = await protocole.confirmer([candidate], contexte);

    expect(rejeu.viewports).toEqual([MOBILE.nom, MOBILE.nom, DESKTOP.nom]);
    expect(resultat.groupes?.[0]?.contreEpreuve).toMatchObject({ viewport: DESKTOP.nom, reproduite: false, echecOutillage: false, attendue: true });
    // La contre-épreuve porte, elle aussi, CE QU'ELLE A OBSERVÉ : c'est
    // souvent la pièce la plus parlante du dossier — un rejeu qui va au bout
    // dans l'autre viewport, au même instant, prouve que le site répondait.
    expect(resultat.groupes?.[0]?.contreEpreuve?.observations).toMatchObject({ nbActions: 0, nbSignaux: 0 });
    expect(details(journal, 'confirmation.contre-epreuve')).toMatchObject({ viewport: DESKTOP.nom, attendue: true });
    // Bonus de contre-épreuve appliqué en plus du facteur de verdict.
    const attendue =
      candidate.confiance * CONFIG_CONFIRMATION_TEST.calibration.facteurVerdict.confirmee * (1 + CONFIG_CONFIRMATION_TEST.calibration.bonusContreEpreuve);
    expect(resultat.retenues[0]?.confiance).toBeCloseTo(attendue, 10);
  });
});
