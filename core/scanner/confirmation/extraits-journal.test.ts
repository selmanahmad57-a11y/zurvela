/**
 * Les extraits sont-ils écrits dans la LANGUE du journal réel ?
 *
 * C'est la question de forme la plus lourde de la brique : un corpus dont le
 * format s'éloigne du réel mesurerait le diagnostic sur une langue qu'il ne
 * parlera jamais en production — la bonne réponse au mauvais document. Ces
 * tests tiennent le lien par le seul moyen mécanique disponible : les mêmes
 * fonctions construisent les entrées du journal ET les extraits, donc les
 * deux ne peuvent pas diverger sans qu'un test tombe.
 */
import { describe, expect, it } from 'vitest';
import type { ContreEpreuve, ResultatGroupe, TentativeReexecution } from '../../types.js';
import { consolider } from './consolidation.js';
import {
  bornerExtraits,
  detailsContreEpreuve,
  detailsGroupe,
  detailsTentative,
  extraitsDuGroupe,
  formaterExtrait,
  MARQUE_TRONCATURE,
  TYPE_JOURNAL_CONTRE_EPREUVE,
  TYPE_JOURNAL_GROUPE,
  TYPE_JOURNAL_TENTATIVE,
} from './extraits-journal.js';
import { candidateSimulee } from './fabriques-test.js';

const BORNES = { extraitsMaxParGroupe: 12, extraitsMaxChars: 4000 };
/** Les plafonds de `CONFIG_CONFIRMATION_TEST.rejeu` : une durée sans son budget ne veut rien dire. */
const BUDGETS = { chargementPageMs: 15000, actionMs: 10000 };

function groupeSimule(): ResultatGroupe['groupe'] {
  const groupe = consolider([candidateSimulee()])[0];
  if (groupe === undefined) {
    throw new Error('groupe-absent');
  }
  return groupe;
}

function tentative(surcharges: Partial<TentativeReexecution> = {}): TentativeReexecution {
  return { numero: 1, viewport: 'desktop', reproduite: false, echecOutillage: false, dureeMs: 2033, ...surcharges };
}

function resultatSimule(tentatives: TentativeReexecution[], contreEpreuve?: ContreEpreuve): ResultatGroupe {
  const groupe = groupeSimule();
  return {
    groupe,
    verdict: 'limite-automatisation',
    motif: 'rejeu-impossible',
    tentatives,
    ...(contreEpreuve === undefined ? {} : { contreEpreuve }),
    tauxReproduction: null,
    confianceInitiale: groupe.confiance,
    confianceFinale: groupe.confiance,
    coutApi: 0,
  };
}

describe('detailsGroupe / detailsTentative — les détails d’une entrée de journal', () => {
  it('le groupe porte ce qu’il EST et ce qui a été rejoué : sans l’URL ni l’action, le diagnostic verrait des échecs sans objet', () => {
    const groupe = groupeSimule();
    expect(detailsGroupe(groupe, 'desktop', BUDGETS)).toEqual({
      cle: groupe.cle,
      confiance: 0.8,
      nbMembres: 1,
      viewports: ['desktop'],
      detecteur: 'd-http',
      viewportRejeu: 'desktop',
      urlOuEtape: groupe.representant.urlOuEtape,
      description: 'reponse-5xx',
      action: 'soumettre',
      nbPrealables: 0,
      budgetChargementMs: 15000,
      budgetActionMs: 10000,
    });
  });

  it('une tentative sans échec n’invente ni cause ni erreur : les clés optionnelles restent ABSENTES', () => {
    expect(detailsTentative('cle', tentative())).toEqual({
      cle: 'cle',
      numero: 1,
      viewport: 'desktop',
      reproduite: false,
      echecOutillage: false,
      dureeMs: 2033,
    });
  });

  it('une tentative en échec porte sa cause et son identifiant technique', () => {
    expect(detailsTentative('cle', tentative({ echecOutillage: true, causeEchec: 'indetermine', erreur: 'delai-depasse', dureeMs: 10_412 }))).toEqual({
      cle: 'cle',
      numero: 1,
      viewport: 'desktop',
      reproduite: false,
      echecOutillage: true,
      causeEchec: 'indetermine',
      erreur: 'delai-depasse',
      dureeMs: 10_412,
    });
  });

  it('la contre-épreuve garde sa forme d’origine, clé en tête', () => {
    const contreEpreuve: ContreEpreuve = { viewport: 'mobile', reproduite: false, echecOutillage: true, attendue: false };
    expect(detailsContreEpreuve('cle', contreEpreuve)).toEqual({ cle: 'cle', ...contreEpreuve });
  });
});

describe('extraitsDuGroupe', () => {
  it('rend une ligne par entrée, dans l’ordre du journal : groupe, tentatives, contre-épreuve', () => {
    const resultat = resultatSimule(
      [tentative({ numero: 1 }), tentative({ numero: 2 })],
      { viewport: 'mobile', reproduite: false, echecOutillage: false, attendue: true },
    );
    const extraits = extraitsDuGroupe(resultat, BORNES, BUDGETS);
    expect(extraits.map((ligne) => ligne.split(' ')[0])).toEqual([
      TYPE_JOURNAL_GROUPE,
      TYPE_JOURNAL_TENTATIVE,
      TYPE_JOURNAL_TENTATIVE,
      TYPE_JOURNAL_CONTRE_EPREUVE,
    ]);
  });

  it('chaque ligne se relit : type puis détails JSON — c’est la forme même du journal', () => {
    const resultat = resultatSimule([tentative()]);
    const [premiere] = extraitsDuGroupe(resultat, BORNES, BUDGETS);
    const separateur = (premiere ?? '').indexOf(' ');
    expect((premiere ?? '').slice(0, separateur)).toBe(TYPE_JOURNAL_GROUPE);
    expect(JSON.parse((premiere ?? '').slice(separateur + 1))).toMatchObject({ cle: resultat.groupe.cle });
  });

  it('sans contre-épreuve, aucune ligne de contre-épreuve n’est inventée', () => {
    const extraits = extraitsDuGroupe(resultatSimule([tentative()]), BORNES, BUDGETS);
    expect(extraits.some((ligne) => ligne.startsWith(TYPE_JOURNAL_CONTRE_EPREUVE))).toBe(false);
  });

  it('`extraitsMaxParGroupe` borne le NOMBRE d’entrées', () => {
    const tentatives = Array.from({ length: 20 }, (_valeur, index) => tentative({ numero: index + 1 }));
    expect(extraitsDuGroupe(resultatSimule(tentatives), { ...BORNES, extraitsMaxParGroupe: 3 }, BUDGETS)).toHaveLength(3);
  });

  it('`extraitsMaxChars` borne la TAILLE du bloc non fiable, et la troncature est MARQUÉE', () => {
    const extraits = extraitsDuGroupe(resultatSimule([tentative()]), { ...BORNES, extraitsMaxChars: 40 }, BUDGETS);
    // La MARQUE COMPTE DANS LE BUDGET : une borne qui déborde de sa propre
    // marque n'est pas une borne, et la borne posée en aval (`core/ia`) la
    // rognerait — coupant en silence ce qui existe pour signaler la coupe.
    expect(extraits.join('')).toHaveLength(40);
    expect(extraits.at(-1)).toContain(MARQUE_TRONCATURE);
  });
});

describe('bornerExtraits', () => {
  it('laisse intact ce qui tient dans le budget', () => {
    expect(bornerExtraits(['abc', 'de'], 10)).toEqual(['abc', 'de']);
  });

  it('coupe la ligne qui déborde et abandonne les suivantes : un extrait coupé en silence ferait conclure sur ce qu’il ne montre pas', () => {
    expect(bornerExtraits(['abcdefghijklmnop', 'ghi'], 4 + MARQUE_TRONCATURE.length)).toEqual([`abcd${MARQUE_TRONCATURE}`]);
  });

  it('le TOTAL rendu ne dépasse jamais le budget, marque comprise', () => {
    // Le défaut que ce test attrape est silencieux et coûte exactement la
    // longueur de la marque : la borne suivante, en aval, la rognerait.
    for (const budget of [10, 11, 20, 37]) {
      expect(bornerExtraits(['abcdefghijklmnopqrstuvwxyz', 'ghi'], budget).join('').length).toBeLessThanOrEqual(budget);
    }
  });

  it('un budget trop court pour la marque abandonne la ligne plutôt que de la couper sans le dire', () => {
    expect(bornerExtraits(['abcdefghijklmnop'], MARQUE_TRONCATURE.length)).toEqual([]);
  });

  it('un budget nul ne rend rien plutôt qu’une ligne vide', () => {
    expect(bornerExtraits(['abc'], 0)).toEqual([]);
  });
});

describe('formaterExtrait', () => {
  it('sépare le type des détails par une espace, et rien d’autre', () => {
    expect(formaterExtrait('confirmation.tentative', { a: 1 })).toBe('confirmation.tentative {"a":1}');
  });
});
