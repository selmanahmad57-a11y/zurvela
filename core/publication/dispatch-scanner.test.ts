/**
 * TÉMOIN (red-first) — DISPATCH de la réponse /scanner vers la bonne logique.
 *
 * C'est la 2ᵉ fonction pure de la brique (la 1ʳᵉ fois que la table de flux disait
 * « branche sur code HTTP → glue » : faux — cette branche DÉCIDE quelle logique
 * s'applique ensuite, donc c'est de la logique). Source unique `.js` (deploiement/ui/),
 * importée par la glue ET ce témoin — comme reessai.js / message-echec.js.
 *
 * LE RISQUE PRIORITAIRE, testé d'abord (pas le happy-path) : qu'un 429 (quota) ou un
 * 500 (incohérence) N'ATTEIGNE JAMAIS la branche `echec-verification` — car c'est elle
 * qui alimente `actionReessai`. Un 429 routé là donnerait « corrige ton adresse » à un
 * marchand qui a juste atteint son quota : le MÊME faux message que le 403 secondaire,
 * par un autre chemin. Le routage est par CODE HTTP, jamais par le contenu du corps —
 * seul un 403 (discriminé POST-(a)) mène à `echec-verification`.
 */
import { describe, expect, it } from 'vitest';
import { dispatcherReponseScanner } from '../../deploiement/ui/dispatch-scanner.js';

describe('dispatcherReponseScanner — router /scanner par code (le risque : ne pas confondre)', () => {
  it('202 → scan-lance (scanId)', () => {
    expect(dispatcherReponseScanner(202, { scanId: 'abc' })).toEqual({ type: 'scan-lance', scanId: 'abc' });
  });

  it('403 discriminé → echec-verification (portant l’échec, pour actionReessai + cleMessageEchec)', () => {
    const echec = { categorie: 'absent', urlVerifiee: 'https://x/z', reessai: { reponseServie: true, jetonMort: false } };
    expect(dispatcherReponseScanner(403, echec)).toEqual({ type: 'echec-verification', echec });
  });

  it('429 → quota (portee), JAMAIS echec-verification', () => {
    expect(dispatcherReponseScanner(429, { erreur: 'limite-atteinte', portee: 'origine' })).toEqual({ type: 'quota', portee: 'origine' });
  });

  it('400 → saisie-invalide (champ)', () => {
    expect(dispatcherReponseScanner(400, { erreur: 'email-invalide' })).toEqual({ type: 'saisie-invalide', champ: 'email-invalide' });
  });

  it('500 → incoherence-serveur, JAMAIS echec-verification', () => {
    expect(dispatcherReponseScanner(500, { erreur: 'incoherence-interne' })).toEqual({ type: 'incoherence-serveur' });
  });

  // Le `sinon` est un FAIL-CLOSED délibéré (le pendant client du fail-closed serveur
  // de (a)) : tout code NON listé → générique honnête, jamais un routage au hasard.
  // Prouvé, pas supposé — et la note du module exige d'ajouter tout futur code
  // SÉMANTIQUE explicitement, pour qu'il ne soit pas avalé en silence (inverse du `never`).
  it('FAIL-CLOSED : un code non listé (503 infra, 418…) → incoherence-serveur', () => {
    expect(dispatcherReponseScanner(503, { erreur: 'service-indisponible' })).toEqual({ type: 'incoherence-serveur' });
    expect(dispatcherReponseScanner(418, {})).toEqual({ type: 'incoherence-serveur' });
  });

  // LE RISQUE, nommé : le routage est par STATUT, pas par le contenu. Même un corps
  // PIÉGÉ qui « ressemble » à un échec (il porte `categorie`) ne doit mener à
  // `echec-verification` que sous un 403 — sinon un 429 trompeur fuiterait vers
  // actionReessai (faux message du quota en « corrige ton adresse »).
  it('INVARIANT DE ROUTAGE : seul 403 → echec-verification (aucune fuite vers actionReessai)', () => {
    const corpsPiege = { erreur: 'limite-atteinte', portee: 'global', scanId: 'y', categorie: 'absent' };
    for (const statut of [200, 202, 400, 429, 500, 502, 301]) {
      expect(dispatcherReponseScanner(statut, corpsPiege).type).not.toBe('echec-verification');
    }
    expect(dispatcherReponseScanner(403, corpsPiege).type).toBe('echec-verification');
  });
});
