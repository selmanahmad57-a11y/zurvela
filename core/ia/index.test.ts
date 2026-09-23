import { describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../scanner/config.js';
import { creerClientIa, RAISON_CLE_ABSENTE, RAISON_NON_IMPLEMENTE } from './index.js';

const config = await chargerConfigScanner();

describe('creerClientIa', () => {
  it('sans clé : mode dégradé, raison « clé absente »', async () => {
    const client = creerClientIa(config.ia, {});
    expect(client.mode).toBe('degrade');
    expect(client.raisonDegrade).toBe(RAISON_CLE_ABSENTE);
    await expect(client.decider({ pageCourante: { url: '', viewport: '', statutHttp: null, liensInternes: [], formulaires: [], horodatage: '' }, formulairesRemplis: [], formulairesSoumis: [], urlsEnAttente: [], nbPagesVisitees: 0 })).resolves.toEqual({
      disponible: false,
      raison: RAISON_CLE_ABSENTE,
    });
  });

  it('AVEC clé : dégradé quand même, raison « non implémenté »', () => {
    // `creerClientIa` est la fabrique du « sans IA » : elle n'implémente
    // aucune fonction, même avec une clé. Le client concret se construit
    // avec `creerClientAnthropic`. Le mode reflète la disponibilité
    // effective, pas la présence de la clé : le journal `ia.mode` ne doit
    // pas annoncer un moteur actif qui ne l'est pas.
    const client = creerClientIa(config.ia, { [config.ia.variableCle]: 'cle-factice' });
    expect(client.mode).toBe('degrade');
    expect(client.raisonDegrade).toBe(RAISON_NON_IMPLEMENTE);
  });
});
