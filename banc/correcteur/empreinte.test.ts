/**
 * L'ORACLE D'ÉQUIVALENCE (cahier P2-4, contrat 1), éprouvé DANS LES DEUX
 * SENS : une optimisation neutre doit passer, une optimisation fautive doit
 * rougir. Un oracle qui ne peut pas rougir ne vérifie rien ; un oracle qui
 * rougit toujours ne sert à rien non plus — et c'est le vrai risque ici,
 * puisqu'une optimisation a précisément pour but de changer le coût.
 *
 * Ce que ce fichier garde par-dessus tout, c'est LA FRONTIÈRE
 * identité/effort. Elle n'est juste que si elle tient à un critère
 * structurel — « cette grandeur décrit-elle le site, ou nous ? » — et pas à
 * la commodité du moment. Sans ces contrôles, on pourrait un jour faire
 * glisser une grandeur gênante du côté effort pour faire taire l'oracle.
 */
import { describe, expect, it } from 'vitest';
import type { ResultatScenario } from '../types.js';
import {
  comparerEmpreintes,
  elementsEffort,
  elementsIdentite,
  empreinteIdentite,
  identitesApparues,
  identitesPerdues,
} from './empreinte.js';

/** Un résultat de scénario minimal, surchargeable. */
function scenario(surcharges: Partial<ResultatScenario> = {}): ResultatScenario {
  return {
    scenarioId: 's1',
    gabarit: 'g',
    langue: 'fr',
    politique: 'deterministe',
    dureeMs: 1000,
    statut: 'ok',
    attendus: [],
    profils: [],
    cibles: [],
    rapports: [],
    coutApi: 0.01,
    fauxPositifs: [],
    nbReplisDecision: 0,
    couverture: undefined,
    rapport: {
      url: 'http://x.invalid/',
      anomalies: [
        {
          description: 'clic-intercepte',
          categorie: 'fonctionnel',
          graviteEstimee: 'bloquant',
          verdict: 'confirmee',
          motif: 'reproduite',
          groupe: 'g1',
          localisations: [{ urlOuEtape: '/' }],
          observations: [{ viewport: 'desktop' }],
        },
      ],
      ecartees: [{ verdict: 'non-reproduite', raison: 'jamais-reproduite', cle: 'g2' }],
      coutApi: 0.01,
      dureeMs: 1000,
      journal: [],
    },
    ...surcharges,
  } as unknown as ResultatScenario;
}

/** La première anomalie du scénario de référence, typée sans doute possible. */
function premiereAnomalie(): { localisations: object[] } {
  return (scenario().rapport as { anomalies: { localisations: object[] }[] }).anomalies[0] as { localisations: object[] };
}

/** Remplace le rapport du scénario de référence. */
function avecRapport(surcharge: object): ResultatScenario {
  return scenario({ rapport: { ...(scenario().rapport as object), ...surcharge } as never });
}

describe('L’IDENTITÉ — ce que le rapport dit du site, égalité exigée', () => {
  it('une anomalie perdue est une identité PERDUE : c’est le sens grave', () => {
    // Un rejeu sélectionné qui saute la mauvaise candidate fait disparaître
    // une anomalie. Aucun verdict n'est faux pour autant — et c'est
    // exactement le défaut que l'oracle existe pour attraper.
    const [divergence] = comparerEmpreintes([scenario()], [avecRapport({ anomalies: [] })]);
    expect(divergence?.scenarioId).toBe('s1');
    expect(divergence?.identite.perdus.some((e) => e.startsWith('anomalie:clic-intercepte'))).toBe(true);
    expect(identitesPerdues(comparerEmpreintes([scenario()], [avecRapport({ anomalies: [] })]))).toBeGreaterThan(0);
  });

  it('une GRAVITÉ qui change est une divergence d’IDENTITÉ — la frontière, mutation-tuée', () => {
    // LE CONTRÔLE QUI DÉFEND LA FRONTIÈRE. Une gravité atteint le client :
    // elle décrit le site, donc elle est de l'identité, non négociable. La
    // mutation à tuer : quelqu'un la fait glisser du côté effort pour faire
    // taire l'oracle — alors l'identité ne bougerait plus et ce test
    // rougirait.
    const anomalies = [{ ...(scenario().rapport as { anomalies: object[] }).anomalies[0], graviteEstimee: 'mineur' }];
    const [d] = comparerEmpreintes([scenario()], [avecRapport({ anomalies })]);
    expect(d?.identite.perdus.filter((e) => e.startsWith('anomalie:'))).toHaveLength(1);
    expect(d?.identite.apparus.filter((e) => e.startsWith('anomalie:'))).toHaveLength(1);
    expect(empreinteIdentite(scenario())).not.toBe(empreinteIdentite(avecRapport({ anomalies })));
  });

  // CHAQUE CHAMP D'IDENTITÉ, un par un. Les mutations l'ont prouvé
  // nécessaire : un test par CAS laissait passer le retrait du verdict de
  // l'identité sans qu'aucun rouge n'apparaisse. Ce qui doit être gardé,
  // c'est la LISTE des champs, pas quelques exemples choisis.
  const CHAMPS_IDENTITE = [
    { champ: 'description', valeur: 'autre-chose' },
    { champ: 'categorie', valeur: 'securite' },
    { champ: 'graviteEstimee', valeur: 'mineur' },
    { champ: 'verdict', valeur: 'intermittente' },
    { champ: 'motif', valeur: 'double-signal' },
    { champ: 'groupe', valeur: 'g-autre' },
  ] as const;

  for (const { champ, valeur } of CHAMPS_IDENTITE) {
    it(`« ${champ} » décrit le site : le changer est une divergence d’IDENTITÉ`, () => {
      const anomalies = [{ ...(scenario().rapport as { anomalies: object[] }).anomalies[0], [champ]: valeur }];
      const [d] = comparerEmpreintes([scenario()], [avecRapport({ anomalies })]);
      expect(d?.identite.perdus.filter((e) => e.startsWith('anomalie:')), champ).toHaveLength(1);
      expect(d?.identite.apparus.filter((e) => e.startsWith('anomalie:')), champ).toHaveLength(1);
    });
  }

  it('les LOCALISATIONS sont ÉNUMÉRÉES : gagner une place est un APPARU, pas une perte suivie d’un gain', () => {
    // LE CAS RÉEL QUI L'A IMPOSÉ. Le correctif du coût de fermeture a rendu
    // au moteur de quoi vérifier le viewport mobile : le même défaut, à la
    // même adresse, gagne une place. Avec un COMPTE, « …|1 » disparaissait
    // au profit de « …|2 » et l'oracle criait à la perte d'identité.
    const base = premiereAnomalie();
    const anomalies = [{ ...base, localisations: [...base.localisations, { urlOuEtape: '/', viewport: 'mobile' }] }];
    const [d] = comparerEmpreintes([scenario()], [avecRapport({ anomalies })]);
    expect(d?.identite.perdus).toEqual([]);
    expect(d?.identite.apparus.filter((e) => e.startsWith('localisation:'))).toHaveLength(1);
  });

  it('un VIEWPORT qui change à nombre ÉGAL est une divergence — ce qu’un compte ne pouvait pas voir', () => {
    // LA MUTATION À TUER : revenir à un compte de localisations. Un défaut
    // qui passe de desktop à mobile ne change alors pas d'un caractère,
    // alors que le rapport du client, lui, change de page concernée.
    const base = premiereAnomalie();
    const anomalies = [{ ...base, localisations: [{ urlOuEtape: '/', viewport: 'mobile' }] }];
    const [d] = comparerEmpreintes([scenario()], [avecRapport({ anomalies })]);
    expect(d?.identite.perdus.some((e) => e.startsWith('localisation:'))).toBe(true);
    expect(d?.identite.apparus.some((e) => e.includes('|mobile|'))).toBe(true);
  });

  it('une localisation qui DISPARAÎT reste une perte : l’énumération n’affaiblit rien', () => {
    const base = premiereAnomalie();
    const deux = [{ ...base, localisations: [...base.localisations, { urlOuEtape: '/', viewport: 'mobile' }] }];
    const divergences = comparerEmpreintes([avecRapport({ anomalies: deux })], [scenario()]);
    expect(identitesPerdues(divergences)).toBe(1);
    expect(identitesApparues(divergences)).toBe(0);
  });

  it('une SECTION publiée décrit le site : c’est littéralement ce que le client lit', () => {
    const avec = scenario({ rapportBusiness: { sections: [{ categorie: 'fonctionnel', gravite: 'bloquant', statut: 'confirmee', groupe: 'g1' }], nbEcartes: 0, nbNonVerifies: 0, nbRecouvrementsEcartes: 0 } as never });
    const sans = scenario({ rapportBusiness: { sections: [], nbEcartes: 0, nbNonVerifies: 0, nbRecouvrementsEcartes: 0 } as never });
    const [d] = comparerEmpreintes([avec], [sans]);
    expect(d?.identite.perdus.some((e) => e.startsWith('section:'))).toBe(true);
  });

  it('une écartée qui JUGE le signal est de l’identité : son motif protège le différenciateur n°1', () => {
    // `non-reproduite` dit quelque chose DU SITE : ce signal n'était pas
    // reproductible. La mutation à tuer : classer toutes les écartées en
    // effort, et l'oracle cesserait de garder le jugement anti-faux-positif.
    const optimise = avecRapport({ ecartees: [{ verdict: 'non-reproduite', raison: 'echeance-atteinte', cle: 'g2' }] });
    const [d] = comparerEmpreintes([scenario()], [optimise]);
    expect(d?.identite.perdus.some((e) => e.startsWith('ecartee:non-reproduite'))).toBe(true);
  });

  it('une identité GAGNÉE se compte à part : perdre est une faute, gagner est une question', () => {
    const anomalies = [
      (scenario().rapport as { anomalies: object[] }).anomalies[0],
      { description: 'autre', categorie: 'visuel', graviteEstimee: 'mineur', verdict: 'confirmee', motif: 'm', groupe: 'g9', localisations: [], observations: [] },
    ];
    const divergences = comparerEmpreintes([scenario()], [avecRapport({ anomalies })]);
    expect(identitesPerdues(divergences)).toBe(0);
    expect(identitesApparues(divergences)).toBe(1);
  });
});

describe('L’EFFORT — ce que le rapport dit de nous, affiché mais non bloquant', () => {
  it('OBSERVER DEUX FOIS AU LIEU D’UNE ne touche pas l’identité : c’est tout l’objet de la scission', () => {
    // LE CAS QUI A FAIT NAÎTRE LA SCISSION. Le correctif du coût de
    // fermeture au rejeu a rendu au moteur le temps de re-vérifier : le même
    // défaut passe de 1 à 2 observations. L'empreinte d'avant rougissait, ce
    // qui interdisait toute optimisation de budget — donc tout P2-4.
    const anomalies = [{ ...(scenario().rapport as { anomalies: object[] }).anomalies[0], observations: [{ viewport: 'desktop' }, { viewport: 'desktop' }] }];
    const [d] = comparerEmpreintes([scenario()], [avecRapport({ anomalies })]);
    expect(d?.identite).toEqual({ perdus: [], apparus: [] });
    expect(d?.effort.perdus.some((e) => e.endsWith('=1'))).toBe(true);
    expect(d?.effort.apparus.some((e) => e.endsWith('=2'))).toBe(true);
  });

  it('une écartée pour LIMITE D’AUTOMATISATION est de l’effort : elle ne dit rien du site, elle dit que nous n’avons pas pu', () => {
    const optimise = avecRapport({ ecartees: [] });
    const reference = avecRapport({ ecartees: [{ verdict: 'limite-automatisation', raison: 'echeance-atteinte', cle: 'g3' }] });
    const [d] = comparerEmpreintes([reference], [optimise]);
    expect(d?.identite.perdus).toEqual([]);
    expect(d?.effort.perdus.some((e) => e.startsWith('non-verifiee:limite-automatisation'))).toBe(true);
  });

  it('et l’effort ne REPREND PAS les écartées de jugement : chaque grandeur d’un seul côté', () => {
    // Sans ce contrôle, on pourrait recopier les écartées des deux côtés :
    // l'oracle resterait juste, mais le second tableau cesserait de dire ce
    // qu'il prétend dire — et la frontière deviendrait illisible.
    expect(elementsEffort(scenario()).join('\n')).not.toContain('non-reproduite');
  });

  it('les comptes DÉCLARÉS décrivent notre travail, pas le site : écartés, non-vérifiés, recouvrements poussés', () => {
    const avec = scenario({ rapportBusiness: { sections: [], nbEcartes: 3, nbNonVerifies: 2, nbRecouvrementsEcartes: 1 } as never });
    const sans = scenario({ rapportBusiness: { sections: [], nbEcartes: 0, nbNonVerifies: 0, nbRecouvrementsEcartes: 0 } as never });
    const [d] = comparerEmpreintes([avec], [sans]);
    expect(d?.identite).toEqual({ perdus: [], apparus: [] });
    expect(d?.effort.perdus).toHaveLength(3);
  });

  it('une optimisation NEUTRE ne divergent en RIEN : durée et coût n’entrent dans aucun des deux tableaux', () => {
    // LE SENS QUI PEUT ÉCHOUER DE L'AUTRE CÔTÉ. Un oracle qui inclurait la
    // durée rougirait à chaque optimisation, donc n'autoriserait rien.
    expect(comparerEmpreintes([scenario({ dureeMs: 10_000, coutApi: 0.5 })], [scenario({ dureeMs: 1_000, coutApi: 0.05 })])).toEqual([]);
  });

  it('la NOTE DU BANC est de l’effort : le banc la fait déjà respecter, l’oracle n’a pas à la juger deux fois', () => {
    const [d] = comparerEmpreintes([scenario({ statut: 'erreur' })], [scenario({ statut: 'ok' })]);
    expect(d?.identite).toEqual({ perdus: [], apparus: [] });
    expect(d?.effort.perdus).toContain('statut=erreur');
  });
});

describe('ce que les deux tableaux ignorent ensemble', () => {
  it('l’ORDRE des anomalies n’est pas le résultat : deux ordres, une empreinte', () => {
    const a = { description: 'a', categorie: 'fonctionnel', graviteEstimee: 'mineur', verdict: 'confirmee', motif: 'm', groupe: 'g1', localisations: [], observations: [] };
    const b = { description: 'b', categorie: 'visuel', graviteEstimee: 'mineur', verdict: 'confirmee', motif: 'm', groupe: 'g2', localisations: [], observations: [] };
    expect(empreinteIdentite(avecRapport({ anomalies: [a, b] }))).toBe(empreinteIdentite(avecRapport({ anomalies: [b, a] })));
  });

  it('la PROSE n’entre pas : elle vient d’un modèle et varie sans que le moteur ait changé', () => {
    const tout = [...elementsIdentite(scenario()), ...elementsEffort(scenario())].join('\n');
    expect(tout).not.toContain('synthese');
    expect(tout).not.toContain('constat');
  });
});

describe('ce qu’une divergence DIT', () => {
  it('un scénario qui DISPARAÎT d’une exécution est une divergence, jamais un silence', () => {
    expect(comparerEmpreintes([scenario()], [])).toHaveLength(1);
    expect(comparerEmpreintes([], [scenario()])).toHaveLength(1);
  });

  it('un scénario disparu emporte son IDENTITÉ avec lui : c’est une perte, pas un simple écart d’effort', () => {
    expect(identitesPerdues(comparerEmpreintes([scenario()], []))).toBeGreaterThan(0);
  });

  it('deux exécutions identiques ne divergent pas', () => {
    expect(comparerEmpreintes([scenario()], [scenario()])).toEqual([]);
  });
});
