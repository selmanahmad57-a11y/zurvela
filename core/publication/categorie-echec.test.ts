/**
 * TÉMOIN (red-first) — la DISCRIMINATION HONNÊTE des échecs de vérification.
 *
 * Le serveur est le seul observateur (il va chercher le fichier à travers le
 * proxy d'egress + épinglage SSRF ; l'UI ne peut refaire ce GET). Il discrimine
 * déjà SIX causes (`RaisonEchec`). Ce témoin exige un mapping TOTAL vers une
 * catégorie marchand, gouverné par UN critère :
 *
 *   - deux causes partagent une catégorie SSI elles appellent la même ACTION du
 *     marchand (partition par action requise, pas taxonomie technique) ;
 *   - une catégorie porte `urlVerifiee` SSI son action est « inspecte cette URL
 *     toi-même » — exactement `absent` (seau irréductible : pas-encore-là /
 *     mauvais-endroit / mauvais-nom, que seul le marchand peut trancher) et
 *     `contenu-inattendu` (page d'accueil servie à la place ? fichier modifié ?).
 *
 * Complétude imposée par `tsc` (régime de `voix.ts`, apprentissage n°56 : une 7ᵉ
 * `RaisonEchec` ne compilera pas sans sa catégorie). Et le TYPE porte la règle de
 * l'`urlVerifiee` : union où `absent`/`contenu-inattendu` l'ONT, les autres non —
 * `tsc` refuse une réponse `absent` nue ou un `injoignable` avec URL. Le gate ne
 * lance que vitest, donc un test runtime double la garde de type.
 */
import { describe, expect, it } from 'vitest';
import { categoriserEchec, CATEGORIES_ECHEC_MARCHAND, type EchecMarchand } from './categorie-echec.js';
import type { RaisonEchec } from './verification-propriete.js';

const URL_TEST = 'https://site.test/zurvela-verification-abc.txt';

// Table validée : catégorie par ACTION + `urlVerifiee` ssi « inspecte cette URL ».
// Le `Record<RaisonEchec, …>` force (via tsc) la couverture des 11 causes.
const ATTENDU: Record<RaisonEchec, { categorie: string; url: boolean }> = {
  'fichier-absent': { categorie: 'absent', url: true },
  'mauvais-contenu': { categorie: 'contenu-inattendu', url: true },
  'redirection-refusee': { categorie: 'redirection', url: false },
  'erreur-reseau': { categorie: 'injoignable', url: false },
  'hote-non-public': { categorie: 'non-public', url: false },
  'jeton-absent': { categorie: 'session-expiree', url: false },
  'jeton-expire': { categorie: 'session-expiree', url: false },
  'url-invalide': { categorie: 'url-invalide', url: false },
  'schema-non-supporte': { categorie: 'url-invalide', url: false },
  'userinfo-interdit': { categorie: 'url-invalide', url: false },
  'ip-litterale-interdite': { categorie: 'url-invalide', url: false },
};

describe('categoriserEchec — catégorie par ACTION marchand', () => {
  it('mappe chaque cause serveur vers sa catégorie', () => {
    for (const raison of Object.keys(ATTENDU) as RaisonEchec[]) {
      expect(categoriserEchec(raison, URL_TEST).categorie).toBe(ATTENDU[raison].categorie);
    }
  });

  it('urlVerifiee présente SSI l’action est « inspecte cette URL » (absent + contenu-inattendu)', () => {
    for (const raison of Object.keys(ATTENDU) as RaisonEchec[]) {
      const echec = categoriserEchec(raison, URL_TEST);
      if (ATTENDU[raison].url) {
        expect(echec).toHaveProperty('urlVerifiee', URL_TEST);
      } else {
        expect(echec).not.toHaveProperty('urlVerifiee');
      }
    }
  });

  // CEINTURE DOCUMENTAIRE, PAS une garde mutable-rouge. Le type
  // `CategorieEchecMarchand` interdit DÉJÀ de retourner une catégorie hors
  // vocabulaire (tsc refuse) — donc aucune mutation compilable ne peut faire
  // rougir ce test. Il documente l'intention ; il ne la PROUVE pas. La vraie
  // preuve anti-effondrement est le premier témoin (chaque cause épinglée à sa
  // catégorie, mutation « redirection→injoignable » le fait rougir). Ne pas
  // s'y reposer comme sur une garde runtime.
  it('AUCUNE cause ne s’effondre en « échec » générique ; catégorie du vocabulaire fermé', () => {
    for (const raison of Object.keys(ATTENDU) as RaisonEchec[]) {
      const { categorie } = categoriserEchec(raison, URL_TEST);
      expect(categorie).not.toBe('echec');
      expect(CATEGORIES_ECHEC_MARCHAND).toContain(categorie);
    }
  });

  it('le TYPE impose urlVerifiee sur absent/contenu-inattendu et l’interdit ailleurs (garde tsc)', () => {
    // @ts-expect-error — `absent` SANS urlVerifiee ne compile pas
    const _a: EchecMarchand = { categorie: 'absent' };
    // @ts-expect-error — `injoignable` AVEC urlVerifiee ne compile pas
    const _b: EchecMarchand = { categorie: 'injoignable', urlVerifiee: URL_TEST };
    void _a;
    void _b;
    expect(true).toBe(true);
  });
});
