/**
 * TÉMOINS du dépouilleur du grand tableau (dette n°32). Deux contrôles, les
 * deux que la dette et le run du 2026-10-07 ont nommés :
 *   - le CONTRÔLE blob: : une reponse-lente sur un schéma local DOIT rougir ;
 *   - la BONNE PAGE par victime : `cibleAJuger` lit la page dans la preuve,
 *     jamais une racine — le piège qui, au run, aurait fait passer deux vrais
 *     positifs demoqa pour des « introuvables » transitoires.
 */
import { describe, expect, it } from 'vitest';
import { cibleAJuger, controleBlob, siteDeChemin, type JournalReel, type SectionReel } from './depouiller-reel.js';

function lenteur(cible: string): SectionReel {
  return { description: 'reponse-lente', categorie: 'performance', verdict: 'decouverte', confiance: 0.7, preuves: [{ type: 'reponse-reseau', urlRessource: cible, dureeMs: 9000 }] };
}

describe('dette n°32 — le contrôle blob: rougit sur un schéma local', () => {
  it('une reponse-lente sur blob: fait ÉCHOUER le contrôle (c’est un instantané, pas une mesure réseau)', () => {
    const j: JournalReel = { url: 'https://exemple.test', anomalies: [lenteur('blob:https://exemple.test/abcd')] };
    const c = controleBlob([j]);
    expect(c.tenu).toBe(false);
    expect(c.suspectes).toBe(1);
    expect(c.suspectesDetail[0]).toContain('blob:');
  });

  it('les autres schémas locaux rougissent aussi (data:, filesystem:, about:, javascript:)', () => {
    for (const schema of ['data:text/html,x', 'filesystem:https://x/y', 'about:blank', 'javascript:void 0']) {
      expect(controleBlob([{ anomalies: [lenteur(schema)] }]).tenu).toBe(false);
    }
  });

  it('une reponse-lente sur une vraie URL réseau NE rougit PAS (c’est une mesure légitime)', () => {
    const c = controleBlob([{ url: 'https://exemple.test', anomalies: [lenteur('https://exemple.test/lourd.js')] }]);
    expect(c.tenu).toBe(true);
    expect(c.lenteurs).toBe(1);
    expect(c.suspectes).toBe(0);
  });

  it('aucune reponse-lente : contrôle tenu, et le total compte toutes les sections', () => {
    const j: JournalReel = { anomalies: [{ description: 'clic-intercepte' }, { description: 'image-cassee' }] };
    const c = controleBlob([j]);
    expect(c.tenu).toBe(true);
    expect(c.lenteurs).toBe(0);
    expect(c.total).toBe(2);
  });
});

describe('dette n°32 — cibleAJuger lit la BONNE PAGE dans la preuve (le piège du run)', () => {
  const sousPage: SectionReel = {
    description: 'clic-intercepte',
    groupe: 'd-recouvrement:element:#root > footer:desktop',
    preuves: [{ type: 'interception-clic', page: 'https://demoqa.com/elements', viewport: 'desktop', element: { selecteur: '#item-8 > a' }, intercepteur: { selecteur: '#root > footer' } }],
    localisations: [{ urlOuEtape: 'https://demoqa.com/elements', element: { selecteur: '#root > footer' }, viewport: 'desktop' }],
  };

  it('prend la page de la preuve (/elements), PAS la racine — sinon la victime est introuvable', () => {
    const cible = cibleAJuger(sousPage);
    expect(cible).not.toBeNull();
    expect(cible?.url).toBe('https://demoqa.com/elements');
    expect(cible?.url).not.toBe('https://demoqa.com');
    expect(cible?.victime).toBe('#item-8 > a');
    expect(cible?.viewport).toBe('desktop');
  });

  it('une section qui n’est pas un recouvrement ne se juge pas à l’oracle (null)', () => {
    expect(cibleAJuger({ description: 'image-cassee', preuves: [{ element: { selecteur: 'img' } }] })).toBeNull();
    expect(cibleAJuger({ description: 'reponse-lente', preuves: [{ urlRessource: 'https://x/y' }] })).toBeNull();
  });

  it('un recouvrement sans page ni victime dans la preuve ne fabrique pas de cible (null)', () => {
    expect(cibleAJuger({ description: 'clic-intercepte', preuves: [{ type: 'interception-clic' }] })).toBeNull();
    expect(cibleAJuger({ description: 'clic-intercepte', preuves: [] })).toBeNull();
  });
});

describe('dette n°32 — siteDeChemin', () => {
  it('tire le nom de site du chemin du journal', () => {
    expect(siteDeChemin('/x/y/demoqa.apres.journal.json')).toBe('demoqa');
    expect(siteDeChemin('automationexercise.apres.journal.json')).toBe('automationexercise');
  });
});
