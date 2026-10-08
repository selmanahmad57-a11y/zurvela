/**
 * TÉMOIN de la voie A, au niveau du MONTAGE (logique de `structure.ts`),
 * complément du témoin de vrai chemin `preuve-faible.banc.test.ts`.
 *
 * Le banc prouve qu'un recouvrement DÉCOUVERT au rejeu (vrai chemin) sort
 * minoré ; ici on éprouve la LOGIQUE de la branche, là où le vrai chemin ne
 * donne pas le cas (un persistant, la préséance du mur, la portée) :
 *  - GARDE CARDINALE : un `confirmee`/`victime-stable` n'est JAMAIS minoré ;
 *  - PRÉSÉANCE : un recouvrement À LA FOIS murCouvrant et preuve-faible →
 *    le mur gagne (déjà minoré, sa voix), jamais de double-minoration ;
 *  - PORTÉE : la preuve-faible ne touche QUE les recouvrements (clic-intercepte),
 *    pas une découverte d'une autre famille.
 */
import { describe, expect, it } from 'vitest';
import { construireStructure } from './structure.js';
import { LIBELLES_RAPPORT } from './voix.js';
import { anomalie, rapportTechnique, resultatGroupe, tentative } from './aide-tests.js';
import { DESCRIPTION_CLIC_INTERCEPTE } from '../scanner/detection/d-recouvrement.js';
import type { Anomalie, SectionRapport, VerdictConfirmation } from '../types.js';

function structurer(anomalies: Anomalie[]): SectionRapport[] {
  const groupes = anomalies.map((a, i) => resultatGroupe(a.groupe ?? `g${i}`, [tentative(1, true), tentative(2, true)], (a.verdict ?? 'confirmee') as VerdictConfirmation));
  return construireStructure(rapportTechnique({ anomalies, groupes }), 'fr').rapportBusiness.sections;
}

describe('voie A — logique de minoration de la preuve faible', () => {
  it('GARDE : un recouvrement CONFIRMÉ (persistance) n’est JAMAIS minoré — gravité intacte', () => {
    const [section] = structurer([
      anomalie('r1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'fonctionnel', gravite: 'important', verdict: 'confirmee' }),
    ]);
    expect(section?.preuveFaible).toBeUndefined();
    expect(section?.gravite).toBe('important');
  });

  it('un recouvrement DÉCOUVERT (statut sans re-test) est minoré : mineur + voix honnête, section présente', () => {
    const libelles = LIBELLES_RAPPORT.fr;
    const [section] = structurer([
      anomalie('d1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'fonctionnel', gravite: 'important', verdict: 'decouverte' }),
    ]);
    expect(section).toBeDefined();
    expect(section?.preuveFaible).toBe(true);
    expect(section?.gravite).toBe('mineur');
    expect(section?.statutFormule).toBe(libelles.statutPreuveFaible);
    expect(section?.titre).toBe(libelles.titrePreuveFaible);
    expect(section?.actionSuggeree).toBe(libelles.actionPreuveFaible);
    expect(section?.impact).toBe('');
  });

  it('PRÉSÉANCE : un recouvrement murCouvrant ET découvert → le MUR gagne (sa voix, pas de double-minoration)', () => {
    const libelles = LIBELLES_RAPPORT.fr;
    const [section] = structurer([
      { ...anomalie('m1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'mobile', gravite: 'mineur', verdict: 'decouverte', pages: ['/a', '/b'] }), murCouvrant: true },
    ]);
    expect(section?.murCouvrant).toBe(true);
    expect(section?.preuveFaible).toBeUndefined();
    expect(section?.statutFormule).toBe(libelles.statutMurCouvrant);
  });

  it('PORTÉE : une découverte d’une AUTRE famille (image cassée) n’est pas touchée par la voie A', () => {
    const [section] = structurer([
      anomalie('i1', { description: 'image-cassee', categorie: 'visuel', gravite: 'mineur', verdict: 'decouverte' }),
    ]);
    expect(section?.preuveFaible).toBeUndefined();
  });
});
