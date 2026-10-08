/**
 * TÉMOIN du rendu HTML (publication, étape 1). Les DEUX gardes cardinales :
 *  1. ANTI-INJECTION : un contenu de site avec `<script>` sort échappé, jamais
 *     exécutable ; une URL `javascript:` ne devient jamais un `href`.
 *  2. VOIX : le mur et la preuve faible gardent leur gravité mineur et leur
 *     libellé « ce qu'il faut vérifier » ; le vrai persistant reste important.
 * + un rapport complet rendu (relu comme un commerçant).
 */
import { describe, expect, it } from 'vitest';
import { construireStructure } from './structure.js';
import { rendreRapportHtml } from './rendu-html.js';
import { LIBELLES_GRAVITE, LIBELLES_RAPPORT } from './voix.js';
import { anomalie, rapportTechnique, resultatGroupe, tentative } from './aide-tests.js';
import { DESCRIPTION_CLIC_INTERCEPTE } from '../scanner/detection/d-recouvrement.js';
import type { Anomalie, RapportBusiness, VerdictConfirmation } from '../types.js';

function rapport(anomalies: Anomalie[]): RapportBusiness {
  const groupes = anomalies.map((a, i) => resultatGroupe(a.groupe ?? `g${i}`, [tentative(1, true), tentative(2, true)], (a.verdict ?? 'confirmee') as VerdictConfirmation));
  return construireStructure(rapportTechnique({ anomalies, groupes }), 'fr').rapportBusiness;
}

describe('rendu HTML — garde 1 : anti-injection (XSS)', () => {
  it('un chemin de site avec <script> sort ÉCHAPPÉ, jamais exécutable', () => {
    const rb = rapport([anomalie('x1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'fonctionnel', gravite: 'important', verdict: 'confirmee', pages: ['/<script>alert(1)</script>'] })]);
    const sortie = rendreRapportHtml(rb);
    expect(sortie).not.toContain('<script>alert(1)</script>');
    expect(sortie).toContain('&lt;script&gt;');
  });

  it('une URL de schéma javascript: ne devient JAMAIS un href', () => {
    const rb = rapport([]);
    const sortie = rendreRapportHtml(rb, { url: 'javascript:alert(1)' });
    expect(sortie).not.toMatch(/href="javascript:/i);
    expect(sortie).not.toContain('javascript:alert(1)</a>');
  });

  it('une URL http(s) devient un lien (schéma validé)', () => {
    const sortie = rendreRapportHtml(rapport([]), { url: 'https://exemple.test' });
    expect(sortie).toContain('href="https://exemple.test"');
  });
});

describe('rendu HTML — garde 2 : voix (mur, preuve faible, persistant)', () => {
  it('un mur couvrant : titre fixe, mineur, « ce qu’il faut vérifier », jamais « faire corriger »', () => {
    const libelles = LIBELLES_RAPPORT.fr;
    const mur = { ...anomalie('m1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'mobile', gravite: 'mineur', verdict: 'confirmee', pages: ['/a', '/b'] }), murCouvrant: true };
    const sortie = rendreRapportHtml(rapport([mur]));
    expect(sortie).toContain(libelles.titreMurCouvrant);
    expect(sortie).toContain(libelles.actionLabelMurCouvrant);
    expect(sortie).not.toContain(libelles.action); // « faire corriger » (le libellé ordinaire) absent
  });

  it('une preuve faible : « observé une seule fois », mineur, « ce qu’il faut vérifier »', () => {
    const libelles = LIBELLES_RAPPORT.fr;
    const sortie = rendreRapportHtml(rapport([anomalie('d1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'fonctionnel', gravite: 'important', verdict: 'decouverte' })]));
    expect(sortie).toContain(libelles.titrePreuveFaible);
    expect(sortie).toContain(libelles.statutPreuveFaible);
    expect(sortie).toContain(libelles.actionLabelPreuveFaible);
  });

  it('un vrai persistant (confirmee) : gravité « important », PAS minoré (ni voix preuve-faible, ni mineur)', () => {
    const sortie = rendreRapportHtml(rapport([anomalie('r1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'fonctionnel', gravite: 'important', verdict: 'confirmee' })]));
    expect(sortie).toContain(LIBELLES_GRAVITE.important.fr);
    expect(sortie).not.toContain(LIBELLES_RAPPORT.fr.titrePreuveFaible);
    expect(sortie).not.toContain(LIBELLES_RAPPORT.fr.statutPreuveFaible);
  });
});

describe('rendu HTML — document complet', () => {
  it('un document autonome : doctype, charset utf-8, zéro script, tableau 600px', () => {
    const sortie = rendreRapportHtml(rapport([anomalie('r1', { description: DESCRIPTION_CLIC_INTERCEPTE, categorie: 'fonctionnel', gravite: 'important', verdict: 'confirmee' })]), { url: 'https://exemple.test' });
    expect(sortie).toContain('<!doctype html>');
    expect(sortie).toContain('<meta charset="utf-8">');
    expect(sortie).not.toContain('<script'); // zéro script dans la sortie
    expect(sortie).toContain('max-width:600px');
  });
});
