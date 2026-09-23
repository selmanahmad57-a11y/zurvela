/**
 * Fabriques d'états de décision pour les tests de `core/ia`.
 *
 * Elles vivent dans un module ordinaire — et non dans un fichier de test —
 * parce que plusieurs suites en dépendent (prompt, clé de cassette, rejeu) et
 * qu'un état de décision est fastidieux à écrire à la main : recopié partout,
 * il dériverait, et les suites cesseraient de parler du même objet.
 */
import type { ActionProposee, EtatDecisionEnumere, ProfilSiteRapporte } from '../types.js';

/** Profil type : une sortie de NOTRE IA, qui entre malgré tout comme donnée non fiable. */
export const PROFIL_BOUTIQUE: ProfilSiteRapporte = {
  typeSite: 'boutique',
  natureLibre: null,
  langue: 'fr',
  confiance: 0.9,
  versionPrompt: 'v1',
  modeleDemande: 'claude-haiku-4-5',
  modeleServi: 'claude-haiku-4-5-20251001',
  apresRelance: false,
};

export function actionDe(
  id: string,
  chemin: string,
  libelle: string | null,
  reperes: Record<string, string> = {},
): ActionProposee {
  return {
    id,
    type: 'naviguer',
    action: { type: 'naviguer', url: `https://boutique.invalid${chemin}` },
    reperes: { balise: 'a', chemin, ...reperes },
    libelle,
  };
}

/** Un point de décision complet, que chaque test ajuste par `modifications`. */
export function etatDeTest(modifications: Partial<EtatDecisionEnumere> = {}): EtatDecisionEnumere {
  return {
    page: '/catalogue',
    viewport: 'bureau',
    profil: PROFIL_BOUTIQUE,
    actions: [
      actionDe('c1', '/catalogue?page=2', 'Page suivante'),
      actionDe('c2', '/produit/12', 'Théière en fonte'),
      actionDe('c3', '/commande', 'Passer commande'),
    ],
    historique: [
      { type: 'naviguer', page: '/' },
      { type: 'naviguer', page: '/catalogue' },
    ],
    nbPagesVisitees: 2,
    pagesRestantes: 3,
    ...modifications,
  };
}
