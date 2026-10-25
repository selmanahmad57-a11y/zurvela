/**
 * TÉMOIN du pied de l'E-MAIL (étape 6, délivrabilité). Spécifique au courriel :
 * inséré à l'envoi, JAMAIS sur /statut/:id ni la démo. Prouve : le contexte +
 * l'identité + les liens zurvela.com CLIQUABLES, aucun lien vers le marchand,
 * l'échappement du contenu interpolé, et l'insertion avant </body>.
 */
import { describe, expect, it } from 'vitest';
import { piedCourrielHtml, piedCourrielTexte, insererPiedCourriel } from './pied-courriel.js';

const O = {
  contexte: 'Vérification de https://marchand.test demandée le 25 octobre 2026.',
  raisonSociale: 'Zurvela SASU',
  adresse: '1 rue Exemple, 75000 Paris',
  lienMentions: 'https://zurvela.com/mentions-legales/',
  libelleMentions: 'Mentions légales',
  lienConfidentialite: 'https://zurvela.com/confidentialite/',
  libelleConfidentialite: 'Confidentialité',
};

describe('pied-courriel', () => {
  it('le pied HTML porte le contexte, l’identité et les liens zurvela.com (cliquables)', () => {
    const h = piedCourrielHtml(O);
    expect(h).toContain('demandée le 25 octobre 2026');
    expect(h).toContain('Zurvela SASU');
    expect(h).toContain('href="https://zurvela.com/mentions-legales/"');
    expect(h).toContain('href="https://zurvela.com/confidentialite/"');
  });

  it('n’introduit AUCUN lien vers le domaine du marchand (délivrabilité : l’origine reste du texte)', () => {
    const h = piedCourrielHtml(O);
    expect(h).not.toContain('href="https://marchand.test');
  });

  it('échappe le contenu interpolé (anti-injection) — une balise piégée ne s’ouvre pas', () => {
    const h = piedCourrielHtml({ ...O, raisonSociale: '<script>x</script>' });
    expect(h).not.toContain('<script>x</script>');
    expect(h).toContain('&lt;script&gt;');
  });

  it('le pied TEXTE reprend les mêmes infos, liens en clair', () => {
    const t = piedCourrielTexte(O);
    expect(t).toContain('Zurvela SASU');
    expect(t).toContain('https://zurvela.com/mentions-legales/');
    expect(t).toContain('demandée le 25 octobre 2026');
  });

  it('insererPiedCourriel place le pied AVANT </body> et appende au texte', () => {
    const { html, texte } = insererPiedCourriel('<html><body>RAPPORT</body></html>', 'RAPPORT', O);
    expect(html.indexOf('Zurvela SASU')).toBeGreaterThan(html.indexOf('RAPPORT')); // après le corps…
    expect(html.indexOf('Zurvela SASU')).toBeLessThan(html.indexOf('</body>')); // …mais avant la fermeture
    expect(texte.startsWith('RAPPORT')).toBe(true);
    expect(texte).toContain('Zurvela SASU');
  });
});
