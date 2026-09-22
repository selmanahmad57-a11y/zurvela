import { describe, expect, it } from 'vitest';
import {
  compterBalises,
  insererApresElement,
  insererAvantFermeture,
  modifierAttribut,
  retirerBlocs,
} from './transformations.js';

const BOUTON = { balise: 'button', attribut: 'data-role', valeur: 'envoyer' };

describe('modifierAttribut', () => {
  it("remplace l'attribut quel que soit son ordre dans la balise", () => {
    expect(modifierAttribut('<button type="submit" data-role="envoyer">x</button>', BOUTON, 'type', 'button')).toBe(
      '<button type="button" data-role="envoyer">x</button>',
    );
    expect(modifierAttribut("<button data-role='envoyer' type=submit>x</button>", BOUTON, 'type', 'button')).toBe(
      "<button data-role='envoyer' type=\"button\">x</button>",
    );
  });

  it('ne touche pas les balises voisines ni les attributs homonymes préfixés', () => {
    const html = '<button data-type="submit" type="submit" data-role="envoyer"></button><button type="submit"></button>';
    expect(modifierAttribut(html, BOUTON, 'type', 'button')).toBe(
      '<button data-type="submit" type="button" data-role="envoyer"></button><button type="submit"></button>',
    );
  });

  it('modifie toutes les balises correspondantes', () => {
    const html = '<img data-role="logo" src="/a.svg"><p></p><img src="/a.svg" data-role="logo">';
    expect(modifierAttribut(html, { balise: 'img', attribut: 'data-role', valeur: 'logo' }, 'src', '/b.svg')).toBe(
      '<img data-role="logo" src="/b.svg"><p></p><img src="/b.svg" data-role="logo">',
    );
  });

  it('échappe la nouvelle valeur', () => {
    expect(modifierAttribut('<a data-role="x" href="/">', { balise: 'a', attribut: 'data-role', valeur: 'x' }, 'href', '/?a=1&b="2"')).toBe(
      '<a data-role="x" href="/?a=1&amp;b=&quot;2&quot;">',
    );
  });

  it('lève si la balise ou l’attribut manque', () => {
    expect(() => modifierAttribut('<button type="submit">x</button>', BOUTON, 'type', 'button')).toThrow(/introuvable/);
    expect(() => modifierAttribut('<button data-role="envoyer">x</button>', BOUTON, 'type', 'button')).toThrow(/absent/);
  });
});

describe('compterBalises', () => {
  it('compte les balises ouvrantes désignées', () => {
    expect(compterBalises('<div data-role="zone"><div data-role="zone"></div></div>', { balise: 'div', attribut: 'data-role', valeur: 'zone' })).toBe(2);
    expect(compterBalises('<div data-role="autre"></div>', { balise: 'div', attribut: 'data-role', valeur: 'zone' })).toBe(0);
    // Un sélecteur ne déborde pas sur une balise plus longue (`<buttons>`) ni sur un attribut ressemblant.
    expect(compterBalises('<buttons data-role="envoyer">', BOUTON)).toBe(0);
  });
});

describe('insererApresElement', () => {
  it('insère après la fermante de chaque élément désigné', () => {
    const html = '<div><button data-role="envoyer">Go</button></div>';
    expect(insererApresElement(html, BOUTON, '<span></span>')).toBe('<div><button data-role="envoyer">Go</button><span></span></div>');
  });

  it('lève si l’élément ou sa fermante manque', () => {
    expect(() => insererApresElement('<div></div>', BOUTON, '<span></span>')).toThrow(/introuvable/);
    expect(() => insererApresElement('<button data-role="envoyer">Go', BOUTON, '<span></span>')).toThrow(/fermante/);
  });
});

describe('insererAvantFermeture', () => {
  it('insère avant </head> et </body>', () => {
    const html = '<html><head><title>t</title></head><body><p>x</p></body></html>';
    expect(insererAvantFermeture(html, 'head', '<style></style>')).toBe(
      '<html><head><title>t</title><style></style></head><body><p>x</p></body></html>',
    );
    expect(insererAvantFermeture(html, 'body', '<script></script>')).toBe(
      '<html><head><title>t</title></head><body><p>x</p><script></script></body></html>',
    );
  });

  it('lève si la fermante manque', () => {
    expect(() => insererAvantFermeture('<p>x</p>', 'body', '')).toThrow(/introuvable/);
  });
});

describe('retirerBlocs', () => {
  it('retire les blocs nommés, marqueurs compris, et laisse les autres', () => {
    const source = [
      'a();',
      '/* @bloc:erreur */',
      'b();',
      '/* @fin-bloc:erreur */',
      'c();',
      '/* @bloc:autre */ d(); /* @fin-bloc:autre */',
      '/* @bloc:erreur */ e(); /* @fin-bloc:erreur */',
    ].join('\n');
    const resultat = retirerBlocs(source, 'erreur');
    expect(resultat).toContain('a();');
    expect(resultat).toContain('c();');
    expect(resultat).toContain('d();');
    expect(resultat).not.toContain('b();');
    expect(resultat).not.toContain('e();');
    expect(resultat).not.toContain('@bloc:erreur');
  });

  it('lève si aucun bloc ne porte ce nom', () => {
    expect(() => retirerBlocs('a();', 'erreur')).toThrow(/introuvable/);
  });
});
