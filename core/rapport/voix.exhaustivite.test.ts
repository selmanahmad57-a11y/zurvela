/**
 * CE QUE L'EXCEPTION DU MUR 1 DOIT PAYER.
 *
 * `voix.ts` est le seul fichier du moteur autorisé à porter des phrases
 * adressées à un humain (constitution §2, « textes à garantie sémantique »).
 * Le prix de cette exception est la COMPLÉTUDE : toute langue de rapport doit
 * couvrir tout statut épistémique, tout libellé, toute gravité, toute
 * catégorie — sans trou possible.
 *
 * `tsc` l'impose déjà par le typage : `Record<StatutSection, Record<LangueRapport, …>>`
 * ne compile pas s'il manque une entrée. Ce fichier est son JUMEAU D'EXÉCUTION,
 * et il attrape ce que le typage ne voit pas : une entrée PRÉSENTE mais VIDE,
 * ou une formulation qui ne dit rien. Une table complète de chaînes vides
 * compile parfaitement et publie un rapport muet.
 */
import { describe, expect, it } from 'vitest';
import type { Categorie, Gravite, StatutSection } from '../types.js';
import { AUCUNE_VERIFICATION } from './statuts.js';
import { FORMULATIONS, LANGUES_RAPPORT, LIBELLES_CATEGORIE, LIBELLES_GRAVITE, LIBELLES_RAPPORT, formulerStatut } from './voix.js';

const STATUTS: StatutSection[] = ['confirmee', 'intermittente', 'constatee-au-rejeu', 'diagnostic-site'];
const GRAVITES: Gravite[] = ['bloquant', 'important', 'mineur'];
const CATEGORIES: Categorie[] = ['fonctionnel', 'performance', 'accessibilite', 'seo', 'securite', 'visuel', 'mobile'];

/** Les comptes que le protocole peut produire, y compris ses cas limites. */
const CHIFFRES = [
  AUCUNE_VERIFICATION,
  { nbVerifications: 1, nbReproductions: 1 },
  { nbVerifications: 2, nbReproductions: 1 },
  { nbVerifications: 3, nbReproductions: 3 },
];

describe('toute langue couvre tout statut, et aucune phrase n’est vide', () => {
  it('chaque couple (statut, langue) produit une phrase pour chaque compte possible', () => {
    for (const langue of LANGUES_RAPPORT) {
      for (const statut of STATUTS) {
        for (const chiffres of CHIFFRES) {
          const phrase = formulerStatut(statut, langue, chiffres);
          expect(phrase.trim(), `${statut}/${langue}`).not.toBe('');
          // Une formulation est une PHRASE : le lecteur d'un rapport n'a pas à
          // décoder un fragment.
          expect(phrase.trim(), `${statut}/${langue}`).toMatch(/[.!?…]$/u);
        }
      }
    }
  });

  it('la table des formulations n’a aucun trou : autant de langues que de statuts', () => {
    expect(Object.keys(FORMULATIONS).sort()).toEqual([...STATUTS].sort());
    for (const statut of STATUTS) {
      expect(Object.keys(FORMULATIONS[statut]).sort()).toEqual([...LANGUES_RAPPORT].sort());
    }
  });

  it('chaque langue porte tous ses libellés, et aucun n’est vide', () => {
    for (const langue of LANGUES_RAPPORT) {
      const libelles = LIBELLES_RAPPORT[langue];
      for (const [nom, valeur] of Object.entries(libelles)) {
        if (typeof valeur === 'string') {
          expect(valeur.trim(), `${langue}.${nom}`).not.toBe('');
        }
      }
      // Les libellés PARAMÉTRÉS aussi : une fonction qui rend une chaîne vide
      // passerait les contrôles ci-dessus sans être vue.
      expect(libelles.ligneEcartes(0).trim()).not.toBe('');
      expect(libelles.ligneEcartes(1).trim()).not.toBe('');
      expect(libelles.ligneEcartes(7).trim()).not.toBe('');
      expect(libelles.ligneNonVerifies(1).trim()).not.toBe('');
      expect(libelles.ligneNonVerifies(4).trim()).not.toBe('');
      expect(libelles.partiellementRedige(1, 3).trim()).not.toBe('');
      expect(libelles.partiellementRedige(2, 3).trim()).not.toBe('');
      // Le constat du mur couvrant (cahier P2-11 b) : paramétré par N, donc une
      // chaîne vide passerait l'itération des chaînes ci-dessus.
      expect(libelles.constatMurCouvrant(1, '/a').trim(), `${langue}.constatMurCouvrant(1)`).not.toBe('');
      expect(libelles.constatMurCouvrant(3, '/a, /b').trim(), `${langue}.constatMurCouvrant(3)`).not.toBe('');
    }
  });

  it('chaque gravité et chaque catégorie ont un libellé dans chaque langue', () => {
    for (const langue of LANGUES_RAPPORT) {
      for (const gravite of GRAVITES) {
        expect(LIBELLES_GRAVITE[gravite][langue].trim(), `${gravite}/${langue}`).not.toBe('');
      }
      for (const categorie of CATEGORIES) {
        expect(LIBELLES_CATEGORIE[categorie][langue].trim(), `${categorie}/${langue}`).not.toBe('');
      }
    }
  });

  it('les deux langues ne disent PAS la même chose : une table recopiée n’est pas une table traduite', () => {
    // Le trou que le typage ne peut pas voir : une langue ajoutée en copiant
    // la précédente compile, publie, et sert du français à un anglophone.
    for (const statut of STATUTS) {
      expect(formulerStatut(statut, 'fr', CHIFFRES[1]!)).not.toBe(formulerStatut(statut, 'en', CHIFFRES[1]!));
    }
    expect(LIBELLES_RAPPORT.fr.titre).not.toBe(LIBELLES_RAPPORT.en.titre);
    // Les phrases du mur couvrant (cahier P2-11 b) : traduites, pas recopiées.
    expect(LIBELLES_RAPPORT.fr.titreMurCouvrant).not.toBe(LIBELLES_RAPPORT.en.titreMurCouvrant);
    expect(LIBELLES_RAPPORT.fr.statutMurCouvrant).not.toBe(LIBELLES_RAPPORT.en.statutMurCouvrant);
    expect(LIBELLES_RAPPORT.fr.actionLabelMurCouvrant).not.toBe(LIBELLES_RAPPORT.en.actionLabelMurCouvrant);
    expect(LIBELLES_RAPPORT.fr.constatMurCouvrant(2, '/a')).not.toBe(LIBELLES_RAPPORT.en.constatMurCouvrant(2, '/a'));
  });
});
