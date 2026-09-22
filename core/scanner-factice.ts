import type { Scanner, Rapport } from './types.js';

/**
 * Scanner factice (stub) : ne visite rien, ne signale rien.
 *
 * Il existe pour prouver la boucle complète du banc d'essai de bout en bout
 * avant que le moteur n'existe. Sa scorecard attendue : 0 % de détection,
 * 0 faux positif.
 */
export const scannerFactice: Scanner = async (url, options): Promise<Rapport> => {
  const debut = Date.now();
  const horodatage = new Date(debut).toISOString();
  return {
    url,
    anomalies: [],
    coutApi: 0,
    dureeMs: Date.now() - debut,
    journal: [{ horodatage, type: 'scan.factice', details: { timeoutMs: options.timeoutMs } }],
  };
};
