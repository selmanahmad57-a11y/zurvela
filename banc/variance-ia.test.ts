/**
 * La commande de variance ne doit JAMAIS publier un accord sur du vide.
 *
 * Sans ce garde-fou, cinq appels muets s'affichaient « 5/5, 1 valeur
 * distincte » avec un code de sortie 0 : l'accord parfait sur le silence.
 * C'est l'apprentissage n°4 (un compteur doit pouvoir révéler qu'il n'a rien
 * mesuré) doublé du n°6 (un diagnostic faux est cru).
 */
import { describe, expect, it } from 'vitest';
import { accord, nbMesuresExploitables } from './variance-ia.js';

const ABSENTE = '—';

describe('variance : mesures exploitables', () => {
  it('ne compte que les appels ayant produit une valeur', () => {
    expect(nbMesuresExploitables([ABSENTE, ABSENTE, ABSENTE, ABSENTE, ABSENTE])).toBe(0);
    expect(nbMesuresExploitables(['vitrine-contact', ABSENTE, 'vitrine-contact'])).toBe(2);
    expect(nbMesuresExploitables(['vitrine-contact', 'boutique'])).toBe(2);
  });

  it('un échantillon entièrement muet a un accord NUMÉRIQUEMENT parfait : c\'est bien pourquoi le compte de mesures est indispensable', () => {
    const muet = [ABSENTE, ABSENTE, ABSENTE, ABSENTE, ABSENTE];
    const resultat = accord(muet);
    expect(resultat.occurrences).toBe(5);
    expect(resultat.distinctes).toBe(1);
    // Le seul chiffre qui distingue ce cas d'une vraie unanimité :
    expect(nbMesuresExploitables(muet)).toBe(0);
  });

  it('un appel muet reste un désaccord, jamais une observation retirée de l\'échantillon', () => {
    const partiel = ['vitrine-contact', 'vitrine-contact', ABSENTE];
    expect(accord(partiel)).toMatchObject({ modalite: 'vitrine-contact', occurrences: 2, total: 3 });
    expect(nbMesuresExploitables(partiel)).toBe(2);
  });
});
