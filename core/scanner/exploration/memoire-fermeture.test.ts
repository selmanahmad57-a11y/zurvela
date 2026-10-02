/**
 * LA CLÉ D'UN SOUVENIR (cahier P2-4, contrat du coût de fermeture, F1-F2).
 *
 * Ce qui s'éprouve ici est ce qui sépare deux recouvrements : la page, le
 * viewport, la signature. Une clé trop large fait confondre deux objets
 * différents — et un souvenir qui confond est pire que pas de souvenir,
 * puisqu'il fait sauter une mesure au mauvais endroit.
 */
import { describe, expect, it } from 'vitest';
import { creerMemoireFermeture } from './memoire-fermeture.js';

describe('la clé d’un souvenir de fermeture', () => {
  it('sépare les PAGES : le même bandeau sur deux pages n’est pas le même objet', () => {
    const memoire = creerMemoireFermeture();
    memoire.pour('http://x.invalid/a', 'desktop').retenir('sig', { aucunGeste: true });
    expect(memoire.pour('http://x.invalid/b', 'desktop').consulter('sig')).toBeUndefined();
  });

  it('sépare les VIEWPORTS : un bandeau présent sur desktop peut être absent sur mobile', () => {
    // Le contrôle qui peut échouer : retirer le viewport de la clé. Un
    // souvenir de desktop ferait alors sauter la mesure sur mobile.
    const memoire = creerMemoireFermeture();
    memoire.pour('http://x.invalid/', 'desktop').retenir('sig', { geste: 'echap' });
    expect(memoire.pour('http://x.invalid/', 'mobile').consulter('sig')).toBeUndefined();
    expect(memoire.pour('http://x.invalid/', 'desktop').consulter('sig')).toEqual({ geste: 'echap' });
  });

  it('une signature VIDE ne se retient pas et ne se consulte pas : sans identité stable, on mesure', () => {
    const memoire = creerMemoireFermeture();
    const liee = memoire.pour('http://x.invalid/', 'desktop');
    liee.retenir('', { aucunGeste: true });
    expect(liee.consulter('')).toBeUndefined();
    expect(memoire.taille()).toBe(0);
  });

  it('ne connaît rien avant qu’on lui apprenne : une mémoire neuve est vide', () => {
    expect(creerMemoireFermeture().taille()).toBe(0);
  });
});
