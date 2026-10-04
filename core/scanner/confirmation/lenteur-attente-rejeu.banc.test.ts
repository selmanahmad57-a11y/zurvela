/**
 * C5bis — le CYCLE COMPLET d'une lenteur en attente à travers le protocole,
 * sur le banc, avec un VRAI re-exécuteur : détection (confiance dédiée 0,95,
 * voie A) → pas de court-circuit (C3bis) → rejeu → verdict.
 *
 * Ce qu'aucun test unitaire ne prouve : que le rejeu d'une requête qui ne
 * finit pas MESURE son attente (et non une absence), et que le verdict qui en
 * sort est cohérent. R01 (api-lente) est RETENUE au-delà de la fenêtre d'effet
 * (délai 6000 > fenêtre 4000) : à chaque passage — scan ET rejeux — la
 * soumission reste en vol à la fermeture. L'attente se REPRODUIT, donc le
 * verdict est `confirmee`. (La face transitoire — une attente qui ne revient
 * pas — tombe en `non-reproduite` par la mesure du rejeu, ligne
 * `mesurerRessourceVisee` qui lit `attenteMs` ; elle est couverte par L01/L02
 * côté « reçu » et par la logique de `verdict.ts`.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chargerConfig } from '../../../banc/config.js';
import { formulaireContact } from '../../../banc/gabarits/formulaire-contact/index.js';
import { CHEMIN_API_FORMULAIRE } from '../../../banc/gabarits/formulaire-contact/structure.js';
import { demarrerServeur } from '../../../banc/serveur.js';
import type { ServeurScenario } from '../../../banc/types.js';
import type { AnomalieCandidate, EntreeJournal, Parcours, ResultatConfirmation } from '../../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from '../config.js';
import { creerDetecteurs, detecter } from '../detection/index.js';
import { DESCRIPTION_LENTE, NOM_DETECTEUR_LENTEUR } from '../detection/d-lenteur.js';
import { creerExplorateur } from '../exploration/explorateur.js';
import { creerFiltre, creerFiltreElement } from '../exploration/filtre-actions.js';
import { politiqueDeterministe } from '../exploration/politique.js';
import { lancerNavigateur } from '../navigateur.js';
import { creerObservateur } from '../observation/observateur.js';
import { creerReexecuteur } from '../reexecuteur.js';
import { autoDiagnosticMecanique } from './auto-diagnostic.js';
import { MOTIF_REPRODUITE } from './verdict.js';
import { creerProtocole } from './protocole.js';
import { creerCompteurObservations } from '../observation/observations.js';

const ECHEANCE_MS = 60_000;
const FENETRE_MS = 4000;
const DELAI_API_MS = 6000; // > fenêtre : l'API pend à chaque passage (scan et rejeux)

let config: ConfigScanner;
let navigateur: Browser;
let serveur: ServeurScenario;
let candidates: AnomalieCandidate[];
let urlDepart: string;

beforeAll(async () => {
  const base = await chargerConfigScanner();
  // Fenêtre d'effet ÉLARGIE au-dessus du seuil (3000) : sans cela une attente
  // bornée par la fenêtre resterait ≤ seuil et ne serait pas lente.
  config = { ...base, exploration: { ...base.exploration, attenteEffetMaxMs: FENETRE_MS, stabilisationMs: 150, sondageMs: 25, margeEcheanceMs: 0 } };
  const configBanc = await chargerConfig();
  serveur = await demarrerServeur(
    { id: 'test--lenteur-attente-r01', gabarit: formulaireContact.nom, langue: 'fr', bugsActifs: ['R01'], parametres: { R01: { delaiReponseMs: DELAI_API_MS } } },
    formulaireContact,
    configBanc,
  );
  urlDepart = serveur.url;
  navigateur = await lancerNavigateur(config);

  const observateur = creerObservateur();
  const deterministe = politiqueDeterministe();
  const explorateur = creerExplorateur({
    config,
    politique: deterministe,
    secours: deterministe,
    filtre: creerFiltre(await chargerActionsInterdites()),
    filtreElement: creerFiltreElement(await chargerActionsInterdites()),
    navigateur,
  });
  const parcours: Parcours = await explorateur.explorer(
    { urlDepart, echeance: Date.now() + ECHEANCE_MS, compteurObservations: creerCompteurObservations(), journaliser: () => undefined },
    observateur,
  );
  candidates = detecter(observateur.signaux(), { urlDepart, parcours, viewports: config.viewports }, creerDetecteurs(config.detecteurs));
}, 120_000);

afterAll(async () => {
  await navigateur?.close();
  await serveur?.arreter();
});

async function confirmer(): Promise<{ resultat: ResultatConfirmation; journal: EntreeJournal[] }> {
  const journal: EntreeJournal[] = [];
  const journaliser = (type: string, details?: unknown): void => {
    journal.push({ horodatage: new Date().toISOString(), type, details });
  };
  const protocole = creerProtocole({ config: config.confirmation, autoDiagnostic: autoDiagnosticMecanique });
  const resultat = await protocole.confirmer(candidates, {
    urlDepart,
    options: { timeoutMs: ECHEANCE_MS },
    echeance: Date.now() + ECHEANCE_MS,
    journaliser,
    reexecuteur: creerReexecuteur({ filtreElement: creerFiltreElement(await chargerActionsInterdites()), navigateur, config, journaliser, compteurObservations: creerCompteurObservations() }),
    detecteurs: creerDetecteurs(config.detecteurs),
    viewports: config.viewports,
  });
  return { resultat, journal };
}

describe('C5bis — cycle complet d’une lenteur en attente', () => {
  it('la détection produit bien une lenteur EN ATTENTE à la confiance dédiée (voie A)', () => {
    const lentes = candidates.filter(
      (c) =>
        c.detecteur === NOM_DETECTEUR_LENTEUR &&
        c.description === DESCRIPTION_LENTE &&
        c.preuves.some((p) => p.type === 'requete-en-attente' && new URL(p.urlRessource).pathname === CHEMIN_API_FORMULAIRE),
    );
    expect(lentes.length, 'une candidate lenteur en attente sur l’API').toBeGreaterThan(0);
    for (const c of lentes) {
      expect(c.confiance).toBe(config.detecteurs.lenteur.confianceEnAttente);
    }
  });

  it('une attente qui SE REPRODUIT au rejeu → confirmee (et non court-circuitée, non non-mesurée)', async () => {
    const { resultat } = await confirmer();
    const groupe = resultat.groupes?.find(
      (g) =>
        g.groupe.representant.detecteur === NOM_DETECTEUR_LENTEUR &&
        g.groupe.representant.preuves.some((p) => p.type === 'requete-en-attente' && new URL(p.urlRessource).pathname === CHEMIN_API_FORMULAIRE),
    );
    expect(groupe, 'le groupe de lenteur en attente est jugé').toBeDefined();
    // Le rejeu a MESURÉ l'attente (ligne `mesurerRessourceVisee` lit attenteMs),
    // elle est revenue au-dessus du seuil → reproduite → confirmee.
    expect(groupe?.verdict).toBe('confirmee');
    expect(groupe?.motif).toBe(MOTIF_REPRODUITE);
    expect(groupe?.tentatives.length, 'elle a bien été rejouée, pas court-circuitée').toBeGreaterThan(0);
    const retenue = resultat.retenues.find((a) => a.groupe === groupe?.groupe.cle);
    expect(retenue?.verdict).toBe('confirmee');
  }, 90_000);
});
