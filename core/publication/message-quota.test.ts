/**
 * TÉMOIN — EXHAUSTIVITÉ du message quota par PORTÉE (la garde que `depense` a révélée).
 *
 * Le 429 porte une `portee ∈ RaisonQuota` ; l'UI la traduit par
 * `cleMessageQuota(portee)`. Rien côté client (glue non typée + JSON) ne garde que
 * CHAQUE portée a un message — c'est ce qui a failli oublier `depense` (4ᵉ portée que
 * le type porte, absente de la liste informelle). Cette ceinture rend permanente la
 * vérification faite à la main : toute `RaisonQuota` a un message de locale cliente non
 * vide, et si le serveur gagne une 5ᵉ portée, le témoin rougit tant qu'elle n'a pas son
 * message — au lieu d'un `t(...)` qui lèverait chez le marchand. Même régime que la
 * ceinture `echecMarchand` : la liste source est `RAISONS_QUOTA` (le type `RaisonQuota`
 * en est dérivé), et `cleMessageQuota` est la source unique de la clé (navigateur ET
 * témoin), donc pas de divergence de préfixe.
 */
import { describe, expect, it } from 'vitest';
import { chargerDictionnaire, chercher } from '../i18n.js';
import { RAISONS_QUOTA } from './quota.js';
import { cleMessageQuota } from '../../deploiement/ui/message-quota.js';

describe('message quota — exhaustivité par portée (présentation côté navigateur)', () => {
  it('EXHAUSTIVITÉ : chaque RaisonQuota → une entrée de locale cliente NON VIDE', async () => {
    const dict = await chargerDictionnaire('deploiement/ui/locales', 'fr');
    for (const portee of RAISONS_QUOTA) {
      const texte = chercher(dict, cleMessageQuota(portee)); // lève si la clé manque
      expect(texte.trim().length).toBeGreaterThan(0);
    }
  });

  it('DISTINCTION : chaque portée → une clé distincte (la dérivation lit son argument)', () => {
    const cles = RAISONS_QUOTA.map(cleMessageQuota);
    expect(new Set(cles).size).toBe(RAISONS_QUOTA.length);
  });
});
