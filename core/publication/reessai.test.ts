/**
 * TÉMOIN (red-first) — LA DÉCISION DE RÉESSAI, pure, côté UI (archi B).
 *
 * Au clic « réessayer », l'UI re-GETerait la MÊME URL du jeton courant : sûr SSI
 * rien de cachable n'y a été servi ET le jeton n'était pas déjà mort. Les deux
 * faits (`reponseServie`, `jetonMort`) sont CONSTATÉS par le serveur (seul témoin
 * du GET) et remontés dans l'échec de /scanner ; l'UI applique la règle, elle ne
 * re-constate rien. `url-invalide` n'a pas de contexte de réessai (`reessai`
 * absent) → il n'entre jamais ici.
 *
 * Espace de 4 états, 3 ATTEIGNABLES. `{reponseServie:true, jetonMort:true}` est
 * INATTEIGNABLE par construction (jeton mort ⟹ retour AVANT le GET ⟹ rien servi),
 * prouvé À LA SOURCE par le témoin des faits d'acheverVerification. On ne teste
 * donc PAS un comportement dessus : ce serait meubler une branche fantôme.
 */
import { describe, expect, it } from 'vitest';
// SOURCE UNIQUE : le MÊME fichier que le navigateur importe (servi statique par
// Caddy). Pas de jumeau TS → pas de divergence possible à détecter (n°44).
import { decisionReessai } from '../../deploiement/ui/reessai.js';

describe('decisionReessai — LE CRITÈRE (faits serveur → intention)', () => {
  it('resoumettre SSI (rien servi ET jeton pas mort) ; sinon reverifier', () => {
    // rien servi, jeton vivant → re-GET sûr (injoignable / non-public)
    expect(decisionReessai({ reponseServie: false, jetonMort: false })).toBe('resoumettre');
    // réponse cachable servie → nouvelle URL (absent / contenu-inattendu / redirection)
    expect(decisionReessai({ reponseServie: true, jetonMort: false })).toBe('reverifier');
    // jeton mort → jeton neuf (session-expiree)
    expect(decisionReessai({ reponseServie: false, jetonMort: true })).toBe('reverifier');
    // {reponseServie:true, jetonMort:true} : INATTEIGNABLE — non testé (cf. témoin
    // des faits d'acheverVerification, qui prouve qu'aucune RaisonEchec ne le produit).
  });
});
