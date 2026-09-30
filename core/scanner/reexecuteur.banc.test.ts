/**
 * Le re-exécuteur en INTÉGRATION sur le banc (cahier §4.3) : un vrai
 * Chromium, un vrai mini-site servi en mémoire, le scénario F01 (bouton
 * mort).
 *
 * Ce que ce test prouve, et qu'aucun test unitaire ne peut prouver : le
 * rejeu REFAIT L'ÉTAT avant de rejouer l'action. Le contexte de reproduction
 * de la brique 2 promettait que `actionsPrealables` suffisait à reproduire
 * une soumission isolément ; ici le journal du rejeu le montre, remplissage
 * d'abord, soumission ensuite — et le bouton mort est re-constaté par le
 * MÊME détecteur qu'au premier passage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { chargerConfig } from '../../banc/config.js';
import { formulaireContact } from '../../banc/gabarits/formulaire-contact/index.js';
import { demarrerServeur } from '../../banc/serveur.js';
import type { ServeurScenario } from '../../banc/types.js';
import type { AnomalieCandidate, EntreeJournal, Parcours, Reexecuteur, Signal } from '../types.js';
import { chargerActionsInterdites, chargerConfigScanner, type ConfigScanner } from './config.js';
import { creerDetecteurs } from './detection/index.js';
import { detecter } from './detection/index.js';
import { NOM_DETECTEUR_INERTE } from './detection/d-inerte.js';
import { creerExplorateur } from './exploration/explorateur.js';
import { creerFiltre, creerFiltreElement } from './exploration/filtre-actions.js';
import { politiqueDeterministe } from './exploration/politique.js';
import { lancerNavigateur } from './navigateur.js';
import { creerObservateur } from './observation/observateur.js';
import { creerReexecuteur } from './reexecuteur.js';

const ECHEANCE_MS = 40_000;

let config: ConfigScanner;
let navigateur: Browser;
let serveur: ServeurScenario;
let candidate: AnomalieCandidate;

beforeAll(async () => {
  const base = await chargerConfigScanner();
  // Mêmes resserrages que l'aide aux tests d'exploration : seules les ATTENTES
  // du chemin nominal sont raccourcies, jamais les délais d'échec.
  config = { ...base, exploration: { ...base.exploration, attenteEffetMaxMs: 3000, stabilisationMs: 150, sondageMs: 25, margeEcheanceMs: 0 } };
  const configBanc = await chargerConfig();
  serveur = await demarrerServeur(
    { id: 'test--reexecuteur-f01', gabarit: formulaireContact.nom, langue: 'fr', bugsActifs: ['F01'] },
    formulaireContact,
    configBanc,
  );
  navigateur = await lancerNavigateur(config);

  const observateur = creerObservateur();
  const journal: EntreeJournal[] = [];
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
    {
      urlDepart: serveur.url,
      echeance: Date.now() + ECHEANCE_MS,
      journaliser: (type, details) => journal.push({ horodatage: new Date().toISOString(), type, details }),
    },
    observateur,
  );
  const candidates = detecter(
    observateur.signaux(),
    { urlDepart: serveur.url, parcours, viewports: config.viewports },
    creerDetecteurs(config.detecteurs),
  );
  const trouvee = candidates.find((examinee) => examinee.detecteur === NOM_DETECTEUR_INERTE);
  if (trouvee === undefined) {
    throw new Error('candidate-inerte-absente');
  }
  candidate = trouvee;
}, 90_000);

afterAll(async () => {
  await navigateur?.close();
  await serveur?.arreter();
});

/** Rejoue la candidate et rend le rejeu avec le journal qu'il a produit. */
async function rejouer(): Promise<{ journal: EntreeJournal[]; signaux: Signal[]; parcours: Parcours; echecOutillage: boolean }> {
  const journal: EntreeJournal[] = [];
  const reexecuteur: Reexecuteur = creerReexecuteur({
    navigateur,
    config,
    journaliser: (type, details) => journal.push({ horodatage: new Date().toISOString(), type, details }),
  });
  const resultat = await reexecuteur.rejouer(candidate.reproduction, candidate.reproduction.viewport);
  return { journal, ...resultat };
}

describe('creerReexecuteur sur le banc — F01', () => {
  it('la détection a bien produit un contexte de reproduction avec un remplissage préalable', () => {
    expect(candidate.reproduction.action?.action.type).toBe('soumettre');
    expect(candidate.reproduction.actionsPrealables.map((action) => action.action.type)).toEqual(['remplir']);
  });

  it('rejoue actionsPrealables AVANT l’action — le journal du rejeu le prouve', async () => {
    const { journal, parcours, echecOutillage } = await rejouer();

    expect(echecOutillage).toBe(false);
    const actions = journal.filter((entree) => entree.type === 'rejeu.action').map((entree) => entree.details as { type: string; prealable: boolean; resultat: string });
    expect(actions).toEqual([
      { id: 'r1', type: 'naviguer', prealable: false, resultat: 'ok', page: candidate.reproduction.url, viewport: candidate.reproduction.viewport.nom },
      { id: 'r2', type: 'remplir', prealable: true, resultat: 'ok', page: candidate.reproduction.url, viewport: candidate.reproduction.viewport.nom },
      { id: 'r3', type: 'soumettre', prealable: false, resultat: 'ok', page: candidate.reproduction.url, viewport: candidate.reproduction.viewport.nom },
    ]);
    // Le parcours rendu porte la même chronologie : c'est lui que relisent les détecteurs.
    expect(parcours.actions.map((action) => action.action.type)).toEqual(['naviguer', 'remplir', 'soumettre']);
    expect(journal[0]?.type).toBe('rejeu.debut');
    expect(journal.at(-1)).toMatchObject({ type: 'rejeu.fin', details: { echecOutillage: false } });
  }, 60_000);

  it('les MÊMES détecteurs re-constatent le bouton mort sur les signaux du rejeu', async () => {
    const { signaux, parcours } = await rejouer();
    const candidates = detecter(
      signaux,
      { urlDepart: serveur.url, parcours, viewports: config.viewports },
      creerDetecteurs(config.detecteurs),
    );
    const rejouee = candidates.find((examinee) => examinee.detecteur === NOM_DETECTEUR_INERTE);
    expect(rejouee?.description).toBe(candidate.description);
    expect(rejouee?.element?.selecteur).toBe(candidate.element?.selecteur);
  }, 60_000);

  it('un contexte navigateur NEUF par rejeu : le stockage d’un rejeu ne survit pas au suivant', async () => {
    const premier = await rejouer();
    const second = await rejouer();
    // Chaque rejeu recharge la page depuis le réseau : il a sa propre réponse de document.
    const documents = (rejeu: { signaux: Signal[] }): number =>
      rejeu.signaux.filter((signal) => signal.type === 'reponse-reseau' && signal.typeRessource === 'document').length;
    expect(documents(premier)).toBeGreaterThan(0);
    expect(documents(second)).toBe(documents(premier));
  }, 90_000);
});
