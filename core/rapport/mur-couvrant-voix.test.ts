/**
 * TÉMOIN du cahier P2-11 (b) / C3-b : la VOIX du mur couvrant.
 *
 * Le détecteur fond un mur couvrant en 1 cause marquée `murCouvrant`, gravité
 * « mineur » (cahier P2-11). Ce témoin éprouve ce que le CLIENT lit, dans les
 * trois modes qui comptent — chacun un sens, aucun appel réel (zéro dollar :
 * une fausse IA qui enregistre son contexte prouve l'exclusion).
 *
 * Décisions de voix du propriétaire (toutes tranchées, cahier P2-11 Q4) :
 *  - titre fixe « Élément recouvrant l'interface » ;
 *  - constat « Un élément recouvre l'interface et masque N éléments interactifs
 *    sur [pages] » (avec pages, sans nature, sans conséquence) ;
 *  - impact VIDE ; action = invitation à vérifier, sous le libellé « Ce qu'il
 *    faut vérifier » (jamais « faire corriger », qui présumerait un défaut) ;
 *  - statut PROPRE « Observé de façon constante lors de nos passages » (pas la
 *    phrase `confirmee`, qui promettrait un défaut vérifié) ;
 *  - jamais « muette » (la prose fixe compte comme rédigée).
 */
import { describe, expect, it } from 'vitest';
import type { ClientIa, ContexteRedaction, RedactionEstampillee, ResultatIa } from '../ia/index.js';
import { construireStructure } from './structure.js';
import { rendreRapport } from './rendu.js';
import { redigerRapportBusiness } from './index.js';
import { LIBELLES_RAPPORT } from './voix.js';
import { CONFIG_RAPPORT_TEST, anomalie, rapportTechnique, resultatGroupe, tentative } from './aide-tests.js';
import type { Anomalie } from '../types.js';

const PROVENANCE = {
  versionPrompt: 'v1',
  modeleDemande: 'claude-opus-5',
  modeleServi: 'claude-opus-5-20260101',
  apresRelance: false,
} as const;

/** Un mur couvrant : 1 cause, marqueur `murCouvrant`, gravité mineur, 3 éléments masqués sur 2 pages. */
function murCouvrant(): Anomalie {
  return {
    ...anomalie('mur1', {
      categorie: 'mobile',
      gravite: 'mineur',
      verdict: 'confirmee',
      description: 'clic-intercepte',
      pages: ['/panier', '/panier', '/produits'],
      viewportLocalisation: 'mobile',
    }),
    murCouvrant: true,
  };
}

/** Une fausse IA qui ENREGISTRE le contexte reçu et rédige les `aRediger` premières sections de ce contexte. */
function iaEspionne(aRediger = 99): ClientIa & { contexteVu: ContexteRedaction | null } {
  const etat: { contexte: ContexteRedaction | null } = { contexte: null };
  return {
    mode: 'actif',
    raisonDegrade: null,
    profiler: async () => ({ disponible: false, raison: 'hors-sujet' }),
    cleDecision: () => null,
    decider: async () => ({ disponible: false, raison: 'hors-sujet' }),
    diagnostiquer: async () => ({ disponible: false, raison: 'hors-sujet' }),
    rediger: async (contexte): Promise<ResultatIa<RedactionEstampillee>> => {
      etat.contexte = contexte;
      return {
        disponible: true,
        coutApi: 0.03,
        valeur: {
          synthese: `Synthèse en ${contexte.langue}.`,
          ligneMethode: 'Chaque signalement est re-vérifié avant publication.',
          sections: contexte.sections.slice(0, aRediger).map((section) => ({
            sectionId: section.id,
            titre: `Titre IA ${section.id}`,
            constat: `Constat IA ${section.id}`,
            impact: `Impact IA ${section.id}`,
            actionSuggeree: `Action IA ${section.id}`,
          })),
          provenance: PROVENANCE,
        },
      };
    },
    get contexteVu() {
      return etat.contexte;
    },
  } as ClientIa & { contexteVu: ContexteRedaction | null };
}

describe('P2-11 (b) — la voix du mur couvrant', () => {
  it('Mode A (sans IA) : le mur porte sa prose FIXE, gravité mineur, statut propre, libellé « vérifier »', () => {
    const libelles = LIBELLES_RAPPORT.fr;
    const rapport = rapportTechnique({ anomalies: [murCouvrant()], groupes: [resultatGroupe('mur1', [tentative(1, true), tentative(2, true)])] });
    const { rapportBusiness } = construireStructure(rapport, 'fr');
    const section = rapportBusiness.sections[0];
    expect(section?.murCouvrant).toBe(true);
    expect(section?.gravite).toBe('mineur');
    expect(section?.titre).toBe(libelles.titreMurCouvrant);
    expect(section?.constat).toBe(libelles.constatMurCouvrant(3, '/panier, /produits'));
    expect(section?.actionSuggeree).toBe(libelles.actionMurCouvrant);
    expect(section?.impact).toBe('');
    expect(section?.statutFormule).toBe(libelles.statutMurCouvrant);
    const sortie = rendreRapport(rapportBusiness, { url: rapport.url });
    expect(sortie).toContain(libelles.titreMurCouvrant);
    expect(sortie).toContain('masque 3 éléments interactifs sur /panier, /produits');
    expect(sortie).toContain(libelles.actionLabelMurCouvrant); // « Ce qu'il faut vérifier »
    expect(sortie).not.toContain(libelles.action); // jamais « Ce qu'il faut faire corriger »
    expect(sortie).not.toContain('reproduit lors de nos'); // jamais la phrase « défaut vérifié »
  });

  it('Mode C (IA) : la section mur n’est PAS envoyée à la rédaction (exclusion, Q3 — prouvé sans appel réel)', async () => {
    const ia = iaEspionne();
    const rapport = rapportTechnique({
      anomalies: [murCouvrant(), anomalie('autre', { categorie: 'fonctionnel', gravite: 'bloquant', description: 'bouton-sans-effet', pages: ['/contact'] })],
      groupes: [resultatGroupe('mur1', [tentative(1, true)]), resultatGroupe('autre', [tentative(1, true)])],
    });
    const { rapportBusiness } = await redigerRapportBusiness({ rapport, config: CONFIG_RAPPORT_TEST, ia, journaliser: () => undefined, echeance: null });
    const idsVus = (ia.contexteVu?.sections ?? []).map((s) => s.id);
    const idMur = rapportBusiness.sections.find((s) => s.murCouvrant === true)?.id;
    expect(idMur).toBeDefined();
    expect(idsVus).not.toContain(idMur); // le mur n'a pas été montré à l'IA
    // Et sa prose fixe a SURVÉCU (l'IA ne l'a pas écrasée).
    const mur = rapportBusiness.sections.find((s) => s.murCouvrant === true);
    expect(mur?.titre).toBe(LIBELLES_RAPPORT.fr.titreMurCouvrant);
    expect(mur?.constat).toBe(LIBELLES_RAPPORT.fr.constatMurCouvrant(3, '/panier, /produits'));
  });

  it('Mode B (partiel) : le mur n’est JAMAIS « muette », même quand une AUTRE section l’est', async () => {
    // L'IA ne rédige qu'UNE des sections de son contexte → l'autre non-mur est
    // génuinement muette (titre=''). Le mur, exclu de l'IA mais porteur de sa
    // prose fixe, ne doit pas être compté parmi les muettes (Q5).
    const ia = iaEspionne(1);
    const rapport = rapportTechnique({
      anomalies: [
        murCouvrant(),
        anomalie('a', { categorie: 'fonctionnel', gravite: 'bloquant', description: 'bouton-sans-effet', pages: ['/a'] }),
        anomalie('b', { categorie: 'fonctionnel', gravite: 'important', description: 'ressource-interne-404', pages: ['/b'] }),
      ],
      groupes: [
        resultatGroupe('mur1', [tentative(1, true)]),
        resultatGroupe('a', [tentative(1, true)]),
        resultatGroupe('b', [tentative(1, true)]),
      ],
    });
    const { rapportBusiness } = await redigerRapportBusiness({ rapport, config: CONFIG_RAPPORT_TEST, ia, journaliser: () => undefined, echeance: null });
    const mur = rapportBusiness.sections.find((s) => s.murCouvrant === true);
    expect(mur?.titre).toBe(LIBELLES_RAPPORT.fr.titreMurCouvrant); // prose fixe intacte → compté rédigé
    const sortie = rendreRapport(rapportBusiness, { url: rapport.url });
    // La section mur ne porte pas la marque « non rédigé », même en mode partiel.
    const blocMur = sortie.slice(sortie.indexOf(LIBELLES_RAPPORT.fr.titreMurCouvrant));
    const finBlocMur = blocMur.indexOf('### ', 5);
    expect((finBlocMur === -1 ? blocMur : blocMur.slice(0, finBlocMur))).not.toContain(LIBELLES_RAPPORT.fr.sectionNonRedigee);
    // Mais le rapport EST partiel (une autre section est muette) : la garde a un sens.
    expect(sortie).toContain(LIBELLES_RAPPORT.fr.sectionNonRedigee);
  });
});
