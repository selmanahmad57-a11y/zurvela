/**
 * NON-RÉGRESSION EXPLICITE de la migration `Politique` → `PolitiqueDecision`.
 *
 * Le contrat a changé de forme (synchrone → asynchrone, `Action` →
 * `DecisionPrise`) ; le COMPORTEMENT ne doit pas avoir bougé d'un iota. Cinq
 * exemples ne le prouveraient pas : un oracle le prouve. On garde donc ici une
 * COPIE FIGÉE de l'implémentation d'avant la bascule, et on la confronte à la
 * politique migrée sur un espace d'états engendré exhaustivement.
 *
 * Cette copie n'a pas vocation à vivre : elle est le témoin d'une migration.
 * Elle disparaîtra quand la politique déterministe changera volontairement de
 * comportement — et ce jour-là, c'est ce test qui l'exigera à voix haute.
 */
import { describe, expect, it } from 'vitest';
import type { Action, ContexteDecision, DescriptionFormulaire, EtatDecisionEnumere, PageVisitee } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { politiqueDeterministe, RAISON_PLUS_RIEN } from './politique.js';
import { choisirValeurs } from './remplissage.js';

const remplissage: ConfigScanner['remplissage'] = {
  regles: [
    { types: ['email'], autocomplete: ['email'], valeur: 'test@zurvela-scan.invalid' },
    { types: ['tel'], autocomplete: ['tel'], valeur: '+33000000000' },
  ],
  valeurTexteParDefaut: 'Zurvela scan test',
  typesIgnores: ['hidden'],
};

/** COPIE FIGÉE de `Politique.decider` d'avant la brique 4b — ne pas « améliorer ». */
function deciderAvantMigration(contexte: ContexteDecision): Action {
  const { pageCourante, formulairesRemplis, formulairesSoumis, urlsEnAttente } = contexte;
  const aRemplir = pageCourante.formulaires.find((f) => !formulairesRemplis.includes(f.localisation.selecteur));
  if (aRemplir !== undefined) {
    return { type: 'remplir', formulaire: aRemplir.localisation, valeurs: choisirValeurs(aRemplir, remplissage) };
  }
  const aSoumettre = pageCourante.formulaires.find((f) => !formulairesSoumis.includes(f.localisation.selecteur));
  if (aSoumettre !== undefined) {
    return { type: 'soumettre', formulaire: aSoumettre.localisation, declencheur: aSoumettre.declencheur };
  }
  const url = urlsEnAttente[0];
  if (url !== undefined) {
    return { type: 'naviguer', url };
  }
  return { type: 'terminer', raison: RAISON_PLUS_RIEN };
}

function formulaire(rang: number, avecDeclencheur: boolean): DescriptionFormulaire {
  return {
    localisation: { balise: 'form', selecteur: `form:nth-of-type(${rang})`, attributs: { id: `f${rang}` } },
    methode: rang % 2 === 0 ? 'get' : 'post',
    action: `http://site.invalid/api/${rang}`,
    champs: [
      { localisation: { balise: 'input', selecteur: `#email${rang}`, attributs: {} }, type: 'email', autocomplete: null, requis: true },
      { localisation: { balise: 'input', selecteur: `#tel${rang}`, attributs: {} }, type: 'tel', autocomplete: 'tel', requis: false },
      { localisation: { balise: 'textarea', selecteur: `#msg${rang}`, attributs: {} }, type: 'textarea', autocomplete: null, requis: false },
    ],
    ...(avecDeclencheur
      ? { declencheur: { balise: 'button', selecteur: `form:nth-of-type(${rang}) > button`, attributs: { type: 'submit' } } }
      : { declencheur: null }),
  };
}

const ETAT_VIDE: EtatDecisionEnumere = {
  page: '/x',
  viewport: 'desktop',
  profil: null,
  actions: [],
  historique: [],
  nbPagesVisitees: 0,
  pagesRestantes: 0,
};

/** Tous les états de décision engendrés par 0 à 3 formulaires × leurs états × 0 à 2 URL. */
function tousLesContextes(): ContexteDecision[] {
  const contextes: ContexteDecision[] = [];
  const filesUrl = [[], ['http://site.invalid/a'], ['http://site.invalid/a', 'http://site.invalid/b']];
  for (const nbFormulaires of [0, 1, 2, 3]) {
    for (const avecDeclencheur of [true, false]) {
      const formulaires = Array.from({ length: nbFormulaires }, (_, rang) => formulaire(rang + 1, avecDeclencheur));
      const selecteurs = formulaires.map((f) => f.localisation.selecteur);
      // Tous les sous-ensembles de « remplis » et de « soumis ».
      for (let remplis = 0; remplis < 2 ** nbFormulaires; remplis += 1) {
        for (let soumis = 0; soumis < 2 ** nbFormulaires; soumis += 1) {
          for (const urlsEnAttente of filesUrl) {
            contextes.push({
              pageCourante: {
                url: 'http://site.invalid/page',
                viewport: 'desktop',
                statutHttp: 200,
                liensInternes: [],
                formulaires,
                horodatage: new Date(0).toISOString(),
              } satisfies PageVisitee,
              formulairesRemplis: selecteurs.filter((_, i) => (remplis >> i) % 2 === 1),
              formulairesSoumis: selecteurs.filter((_, i) => (soumis >> i) % 2 === 1),
              urlsEnAttente: [...urlsEnAttente],
              nbPagesVisitees: 1,
            });
          }
        }
      }
    }
  }
  return contextes;
}

describe('migration vers PolitiqueDecision — non-régression', () => {
  it('rend EXACTEMENT les mêmes décisions qu’avant la migration, sur tout l’espace d’états', async () => {
    const politique = politiqueDeterministe(remplissage);
    const contextes = tousLesContextes();
    expect(contextes.length).toBeGreaterThan(200);
    for (const contexte of contextes) {
      const { action, politique: appliquee, provenance, raisonRepli } = await politique.decider(contexte, ETAT_VIDE);
      expect(action).toEqual(deciderAvantMigration(contexte));
      // La forme neuve n'ajoute rien de son cru : pas d'IA, pas de repli.
      expect(appliquee).toBe('deterministe');
      expect(provenance).toBeUndefined();
      expect(raisonRepli).toBeUndefined();
    }
  });

  it('l’oracle est bien capable de diverger : il n’est pas un miroir de l’implémentation', () => {
    // Garde du test lui-même (METHODE §2) : un oracle qui ne peut pas être
    // mis en défaut ne prouve rien. On lui donne un état où la règle diffère.
    const contexte = tousLesContextes()[0];
    if (contexte === undefined) {
      throw new Error('espace d’états vide');
    }
    const divergent: ContexteDecision = { ...contexte, urlsEnAttente: ['http://site.invalid/z'] };
    expect(deciderAvantMigration(divergent)).toEqual({ type: 'naviguer', url: 'http://site.invalid/z' });
    expect(deciderAvantMigration(contexte)).toEqual({ type: 'terminer', raison: RAISON_PLUS_RIEN });
  });
});
