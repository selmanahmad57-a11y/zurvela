/**
 * Doublures pour les tests : un gabarit et une configuration entièrement en
 * mémoire, sans fichier ni serveur. Réservé aux fichiers *.test.ts.
 */
import type { BugInjectable, ConfigBanc, Gabarit } from '../types.js';

export const BUGS_FACTICES: BugInjectable[] = [
  { id: 'F01', nom: 'bouton-mort', categorie: 'fonctionnel', gravite: 'bloquant', pages: ['/contact'] },
  { id: 'F02', nom: 'echec-silencieux', categorie: 'fonctionnel', gravite: 'bloquant', pages: ['/contact'] },
  { id: 'R01', nom: 'api-lente', categorie: 'performance', gravite: 'important', pages: ['/contact'] },
  { id: 'V01', nom: 'image-cassee', categorie: 'visuel', gravite: 'mineur', pages: ['/', '/contact', '/confirmation'] },
  { id: 'M01', nom: 'bouton-masque-mobile', categorie: 'mobile', gravite: 'bloquant', pages: ['/contact'] },
  { id: 'I01', nom: 'api-intermittente', categorie: 'fonctionnel', gravite: 'important', pages: ['/contact'], verdictAttendu: 'intermittente' },
  { id: 'T01', nom: 'echec-transitoire', categorie: 'fonctionnel', gravite: 'bloquant', pages: ['/contact'], verdictAttendu: 'non-reproduite' },
  { id: 'L01', nom: 'lenteur-transitoire', categorie: 'performance', gravite: 'important', pages: ['/contact'], verdictAttendu: 'non-reproduite' },
];

export function gabaritFactice(nom = 'gabarit-factice', bugs: BugInjectable[] = BUGS_FACTICES): Gabarit {
  return {
    nom,
    dossierSite: '/inexistant',
    routesPages: { '/': 'pages/accueil.html' },
    prefixeStatique: '/statique',
    dossierStatique: 'statique',
    dossierLocales: 'locales',
    cheminApiFormulaire: '/api/contact',
    traiterApi: async () => ({ statut: 200, entetes: {}, corps: '' }),
    bugs,
  };
}

export function configFactice(surcharges: Partial<ConfigBanc> = {}): ConfigBanc {
  return {
    langueConsole: 'fr',
    langues: ['fr', 'en'],
    serveur: { portDeBase: 4800, nombrePortsEssayes: 5 },
    scan: { timeoutMs: 1000, sujetParDefaut: 'reel' },
    scorecard: { seuilAlarmeEcartLanguesPoints: 5, dossierResultats: 'banc/resultats', retentionRuns: 100 },
    scenarios: { dossier: 'banc/scenarios', jetonSain: 'sain', combinaisons: [['F01', 'M01']] },
    site: { delaiReponseApiMs: 0 },
    bugs: {},
    ...surcharges,
  };
}
