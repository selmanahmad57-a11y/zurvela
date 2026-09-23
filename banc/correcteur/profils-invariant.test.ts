/**
 * INVARIANT JUMEAU de celui des pertes (brique 4a) : un attendu de profil non
 * mesuré interdit le statut `ok` — mais SEULEMENT quand l'absence est SUBIE.
 *
 * Une absence de profil a deux causes qui produisent le même symptôme :
 * demandée (`--sans-ia`) ou subie (cassette absente, mode dégradé, appel en
 * échec). Le compteur ne les distingue pas, le statut doit le faire — c'est
 * l'apprentissage n°6 appliqué au statut : deux causes, même symptôme, la
 * garde nomme la bonne. Sans cette distinction, soit `--sans-ia` devient
 * rouge sans raison, soit un parc de cassettes absent produit une scorecard
 * entièrement verte : les deux mentent.
 */
import { describe, expect, it } from 'vitest';
import { profilsNonMesuresSubis } from './appariement.js';
import type { ResultatProfil } from '../types.js';

const attendu = { nature: 'profil', typeSite: 'vitrine-contact', langue: null, inertieEprouvee: false } as const;
const nonMesure: ResultatProfil = { attendu, langueAttendue: 'fr', nonMesure: true, satisfait: false };
const mesure: ResultatProfil = {
  attendu,
  langueAttendue: 'fr',
  nonMesure: false,
  satisfait: true,
  profil: {
    typeSite: 'vitrine-contact',
    natureLibre: null,
    langue: 'fr',
    confiance: 0.9,
    versionPrompt: 'v1',
    modeleDemande: 'claude-haiku-4-5',
    modeleServi: 'claude-haiku-4-5-20251001',
    apresRelance: false,
  },
};

describe('invariant des profils non mesurés', () => {
  it('en régime IA actif, une absence est SUBIE et se compte', () => {
    expect(profilsNonMesuresSubis([nonMesure], false)).toBe(1);
    expect(profilsNonMesuresSubis([nonMesure, nonMesure], false)).toBe(2);
  });

  it('en régime déclaré sans IA, la même absence ne se compte pas : elle était demandée', () => {
    expect(profilsNonMesuresSubis([nonMesure], true)).toBe(0);
    expect(profilsNonMesuresSubis([nonMesure, nonMesure], true)).toBe(0);
  });

  it('un profil mesuré ne compte jamais, quel que soit le régime', () => {
    expect(profilsNonMesuresSubis([mesure], false)).toBe(0);
    expect(profilsNonMesuresSubis([mesure], true)).toBe(0);
  });

  it('les deux régimes ne diffèrent QUE sur les non mesurés : le symptôme est le même, la lecture non', () => {
    const melange = [mesure, nonMesure, mesure];
    expect(profilsNonMesuresSubis(melange, false)).toBe(1);
    expect(profilsNonMesuresSubis(melange, true)).toBe(0);
  });
});
