/** Intégration courte de l'observateur sur le banc : les signaux attendus par les détecteurs de M01, F02 et R01. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHEMIN_API_FORMULAIRE, PAGE_ACCUEIL, PAGE_CONFIRMATION, PAGE_CONTACT } from '../../../banc/gabarits/formulaire-contact/structure.js';
import { chemins, preparerBanc, signauxDe, soumissions, type BancEssai } from '../exploration/aide-tests-banc.js';

const DELAI_R01_MS = 600;

let banc: BancEssai;

beforeAll(async () => {
  banc = await preparerBanc();
});

afterAll(async () => {
  await banc?.fermer();
});

describe('observateur sur le banc', () => {
  it('M01 (bouton masqué mobile) : interception constatée sur mobile seulement, par géométrie puis par le clic', async () => {
    const resultat = await banc.explorer(['M01']);
    const [desktop] = soumissions(resultat, 'desktop');
    expect(desktop?.resultat).toBe('ok');
    expect(signauxDe(resultat, 'interception-clic').filter((s) => s.viewport === 'desktop')).toEqual([]);
    expect(chemins(resultat, 'desktop')).toContain(PAGE_CONFIRMATION);

    const [mobile] = soumissions(resultat, 'mobile');
    expect(mobile?.resultat).toBe('bloquee');
    const interceptions = signauxDe(resultat, 'interception-clic').filter((s) => s.viewport === 'mobile');
    expect(interceptions.map((s) => s.source).sort()).toEqual(['clic', 'geometrie']);
    for (const interception of interceptions) {
      expect(interception.element.balise).toBe('button');
      expect(interception.intercepteur?.balise).toBe('span');
      expect(new URL(interception.page).pathname).toBe(PAGE_CONTACT);
    }
    expect(interceptions.find((s) => s.source === 'clic')?.actionId).toBe(mobile?.id);
    // Le clic bloqué n'a pas d'effet, mais l'action n'est pas `ok` : ce n'est pas un élément inerte.
    const [fin] = signauxDe(resultat, 'fin-action', mobile?.id);
    expect(fin?.effets).toMatchObject({ requetes: 0, navigation: false });
    expect(chemins(resultat, 'mobile')).not.toContain(PAGE_CONFIRMATION);
  }, 30_000);

  it('F02 (échec silencieux) : réponse 500 liée à la soumission, aucune mutation en zone après la réponse, pas de navigation', async () => {
    const resultat = await banc.explorer(['F02']);
    for (const viewport of banc.config.viewports.map((v) => v.nom)) {
      const [soumission] = soumissions(resultat, viewport);
      expect(soumission?.resultat).toBe('ok');
      const id = soumission?.id ?? '';
      const [reponse] = signauxDe(resultat, 'reponse-reseau', id).filter((s) => new URL(s.urlRessource).pathname === CHEMIN_API_FORMULAIRE);
      expect(reponse?.statut).toBe(500);
      expect(signauxDe(resultat, 'requete-echouee', id)).toEqual([]);
      expect(signauxDe(resultat, 'navigation', id)).toEqual([]);
      const mutations = signauxDe(resultat, 'mutation-dom', id);
      // Le script désactive le bouton AVANT la requête : ces mutations sont antérieures à la réponse.
      expect(mutations.some((m) => m.nbZone > 0)).toBe(true);
      expect(mutations.filter((m) => m.nbZone > 0 && m.horodatage > (reponse?.horodatage ?? ''))).toEqual([]);
      const [fin] = signauxDe(resultat, 'fin-action', id);
      expect(fin?.effets.navigation).toBe(false);
      expect(chemins(resultat, viewport)).toEqual([PAGE_ACCUEIL, PAGE_CONTACT]);
    }
  }, 30_000);

  it('R01 (API lente) : la durée mesurée de la réponse liée à la soumission dépasse le délai injecté', async () => {
    const resultat = await banc.explorer(['R01'], { R01: { delaiReponseMs: DELAI_R01_MS } });
    for (const viewport of banc.config.viewports.map((v) => v.nom)) {
      const [soumission] = soumissions(resultat, viewport);
      expect(soumission?.resultat).toBe('ok');
      const [reponse] = signauxDe(resultat, 'reponse-reseau', soumission?.id).filter((s) => new URL(s.urlRessource).pathname === CHEMIN_API_FORMULAIRE);
      expect(reponse?.statut).toBe(200);
      expect(reponse?.dureeMs).toBeGreaterThan(DELAI_R01_MS);
      expect(chemins(resultat, viewport)).toContain(PAGE_CONFIRMATION);
    }
  }, 30_000);
});
