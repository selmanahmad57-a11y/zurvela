/**
 * LA MESURE du diagnostic — et, avant elle, la vérification que le corpus
 * parle bien la langue du journal réel.
 *
 * L'ordre des trois blocs est celui de leur dépendance : un corpus mal formé
 * rendrait la mesure sans objet, donc la forme se vérifie d'abord, contre un
 * journal RÉEL extrait sans édition. Vient ensuite la mesure elle-même, sur
 * cassettes — aucun appel réseau n'est possible depuis ce fichier.
 */
import { describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../../core/scanner/config.js';
import { creerDetecteurs } from '../../core/scanner/detection/index.js';
import { estExploitable } from '../../core/scanner/confirmation/verdict.js';
import { detailsContreEpreuve, detailsTentative, formaterExtrait } from '../../core/scanner/confirmation/extraits-journal.js';
import type { CauseEchecRejeu, ContreEpreuve, ObservationsRejeu, TentativeReexecution } from '../../core/types.js';
import { COMMANDE_ENREGISTREMENT_DIAGNOSTIC } from '../enregistrer-diagnostic.js';
import { creerClientIaBanc } from '../ia.js';
import { chargerCorpus, chargerJournalReel, mesurerCorpus, type CasCorpus, type MesureCorpus } from './index.js';

const corpus = await chargerCorpus();
const journalReel = await chargerJournalReel();
const configScanner = await chargerConfigScanner();

/** Découpe une ligne d'extrait en (type, détails) — l'inverse exact de `formaterExtrait`. */
function relire(extrait: string): { type: string; details: Record<string, unknown> } {
  const separateur = extrait.indexOf(' ');
  return { type: extrait.slice(0, separateur), details: JSON.parse(extrait.slice(separateur + 1)) as Record<string, unknown> };
}

/** Toutes les entrées réelles d'un type, tous scénarios confondus. */
function entreesReelles(type: string): Record<string, unknown>[] {
  return Object.values(journalReel.entrees)
    .flat()
    .filter((entree) => entree.type === type)
    .map((entree) => entree.details);
}

/** Les `dureeMs` des tentatives réelles d'UN scénario, dans l'ordre du journal. */
function dureesReellesDuScenario(scenario: string): number[] {
  return (journalReel.entrees[scenario] ?? [])
    .filter((entree) => entree.type === 'confirmation.tentative')
    .map((entree) => entree.details['dureeMs'] as number);
}

/**
 * Les `dureeMs` d'ORIGINE que les éditions citent. Une citation en porte une
 * (« porté de 893 à … ») ou deux (« porté de 1962/1865 à … »).
 *
 * La piste d'audit d'un corpus dérivé est la seule chose qui le distingue d'un
 * corpus inventé, au-delà du drapeau `ecritDeZero` — et une piste d'audit qui
 * ne se rejoue plus sur son étalon n'est plus une piste. Le défaut réel qui a
 * fait naître cette garde : le journal de référence a été ré-extrait APRÈS la
 * dérivation, et les dix valeurs citées sont restées celles de l'ancien
 * étalon. Tous les autres champs concordaient — seul le champ non
 * déterministe avait dérivé, donc rien ne le voyait.
 */
const CITATION_DUREE_ORIGINE = /`dureeMs` porté de (\d+(?:\/\d+)*) à/g;
function originesCitees(editions: readonly string[]): number[] {
  return editions.flatMap((edition) =>
    [...edition.matchAll(CITATION_DUREE_ORIGINE)].flatMap((trouve) => (trouve[1] ?? '').split('/').map(Number)),
  );
}

describe('le corpus — composition', () => {
  it('compte cinq cas : deux `outil`, deux `site`, et UN aveu attendu', () => {
    expect(corpus).toHaveLength(5);
    const parAvis = corpus.reduce<Record<string, number>>((comptes, cas) => {
      comptes[cas.avisAttendu] = (comptes[cas.avisAttendu] ?? 0) + 1;
      return comptes;
    }, {});
    expect(parAvis).toEqual({ outil: 2, site: 2, indetermine: 1 });
  });

  it('chaque cas porte un identifiant unique et un contexte complet', () => {
    expect(new Set(corpus.map((cas) => cas.id)).size).toBe(corpus.length);
    for (const cas of corpus) {
      expect(cas.contexte.groupe.length).toBeGreaterThan(0);
      expect(cas.contexte.description.length).toBeGreaterThan(0);
      expect(cas.contexte.extraits.length).toBeGreaterThan(0);
      expect(cas.pourquoiCetAvis.length).toBeGreaterThan(0);
    }
  });

  it('chaque cas dit de QUEL scénario il est dérivé, et ce qu’on lui a fait', () => {
    for (const cas of corpus) {
      expect(journalReel.provenance.scenarios).toContain(cas.derive.scenario);
      expect(cas.derive.groupeReel).toBe(cas.contexte.groupe);
      expect(cas.derive.editions.length).toBeGreaterThan(0);
    }
  });

  it('les `dureeMs` d’origine citées par les éditions se rejouent sur le journal RÉEL livré', () => {
    for (const cas of corpus) {
      const citees = originesCitees(cas.derive.editions);
      const nbTentatives = cas.contexte.extraits.filter((ligne) => ligne.startsWith('confirmation.tentative')).length;
      // Le compte est lié aux tentatives éditées : si une reformulation casse
      // l'extraction, la garde tombe au lieu de se taire. Une vérification qui
      // ne peut plus échouer ne vérifie plus rien (APPRENTISSAGES n°9).
      expect(citees.length, `${cas.id} : citations d’origine illisibles ou incomplètes`).toBe(nbTentatives);
      expect(citees, `${cas.id} : valeurs d’origine absentes du journal réel livré`).toEqual(
        dureesReellesDuScenario(cas.derive.scenario).slice(0, citees.length),
      );
    }
  });

  it('la garde des citations sait LIRE et sait ACCUSER', () => {
    // Sans ce contre-cas, la garde passerait aussi si son extracteur ne
    // trouvait plus rien du tout.
    expect(originesCitees(['`dureeMs` porté de 893 à 15112'])).toEqual([893]);
    expect(originesCitees(['`dureeMs` porté de 1962/1865 à 10437/10419 (le budget d’action)'])).toEqual([1962, 1865]);
    expect(originesCitees(['aucune contre-épreuve : rien à citer ici'])).toEqual([]);
    const inventee = originesCitees(['`dureeMs` porté de 1 à 2']);
    expect(inventee).not.toEqual(dureesReellesDuScenario(journalReel.provenance.scenarios[0] ?? '').slice(0, 1));
  });

  it('aucun cas n’a été écrit de zéro — et si un jour l’un l’est, ce test le dira', () => {
    // L'aveu est STRUCTUREL, pas laissé à la bonne foi d'un rapport : un
    // corpus inventé et un corpus dérivé ne se distinguent pas à l'œil.
    expect(corpus.filter((cas) => cas.derive.ecritDeZero).map((cas) => cas.id)).toEqual([]);
  });

  it('TOUS les cas sont bien le RÉSIDU : au moins une tentative de cause `indetermine`', () => {
    // Sans cette garde, un cas pourrait mesurer le diagnostic sur un journal
    // qui, en production, ne le déclencherait jamais.
    for (const cas of corpus) {
      const tentatives = cas.contexte.extraits
        .map(relire)
        .filter((ligne) => ligne.type === 'confirmation.tentative');
      expect(tentatives.length).toBeGreaterThan(0);
      expect(tentatives.some((ligne) => ligne.details['causeEchec'] === 'indetermine')).toBe(true);
    }
  });

  it('le cas ambigu est le plus PAUVRE en preuves : le moins de tentatives, et aucune contre-épreuve', () => {
    // Un aveu obtenu sur un journal riche ne prouverait rien : il faut que le
    // cas soit réellement indécidable, pas seulement étiqueté ainsi.
    const ambigu = corpus.find((cas) => cas.avisAttendu === 'indetermine');
    const compter = (cas: CasCorpus, type: string): number => cas.contexte.extraits.filter((ligne) => ligne.startsWith(type)).length;
    const tranches = corpus.filter((cas) => cas.avisAttendu !== 'indetermine');
    expect(ambigu).toBeDefined();
    expect(compter(ambigu as CasCorpus, 'confirmation.contre-epreuve')).toBe(0);
    for (const cas of tranches) {
      expect(compter(ambigu as CasCorpus, 'confirmation.tentative')).toBeLessThan(compter(cas, 'confirmation.tentative') + 1);
    }
  });
});

describe('le corpus — PLAUSIBILITÉ de format, champ à champ contre un journal réel', () => {
  it('le journal de référence est bien réel : il porte sa provenance et des entrées de plusieurs scénarios', () => {
    expect(journalReel.provenance.scenarios.length).toBeGreaterThan(1);
    expect(entreesReelles('confirmation.groupe').length).toBeGreaterThan(1);
    expect(entreesReelles('confirmation.tentative').length).toBeGreaterThan(1);
  });

  it('chaque extrait se relit exactement : `formaterExtrait` le reconstruit à l’identique', () => {
    for (const cas of corpus) {
      for (const extrait of cas.contexte.extraits) {
        const { type, details } = relire(extrait);
        expect(formaterExtrait(type, details)).toBe(extrait);
      }
    }
  });

  it('aucun extrait ne porte un type d’entrée que le journal réel ne produit pas', () => {
    const typesReels = new Set(
      Object.values(journalReel.entrees)
        .flat()
        .map((entree) => entree.type),
    );
    for (const cas of corpus) {
      for (const extrait of cas.contexte.extraits) {
        expect(typesReels).toContain(relire(extrait).type);
      }
    }
  });

  it('les entrées `confirmation.groupe` ont EXACTEMENT les clés du journal réel, dans le même ordre', () => {
    const [reference] = entreesReelles('confirmation.groupe');
    expect(reference).toBeDefined();
    const attendues = Object.keys(reference as Record<string, unknown>);
    for (const cas of corpus) {
      for (const extrait of cas.contexte.extraits.filter((ligne) => ligne.startsWith('confirmation.groupe'))) {
        expect(Object.keys(relire(extrait).details)).toEqual(attendues);
      }
    }
  });

  it('les entrées `confirmation.tentative` sont EXACTEMENT ce que la production écrirait pour la même tentative', () => {
    // La vérification la plus forte disponible : on reconstruit la tentative
    // depuis les détails de l'extrait, on la repasse par le constructeur de
    // PRODUCTION, et on exige la même ligne — clés, ordre et valeurs.
    for (const cas of corpus) {
      for (const extrait of cas.contexte.extraits.filter((ligne) => ligne.startsWith('confirmation.tentative'))) {
        const { details } = relire(extrait);
        const tentative: TentativeReexecution = {
          numero: details['numero'] as number,
          viewport: details['viewport'] as string,
          reproduite: details['reproduite'] as boolean,
          echecOutillage: details['echecOutillage'] as boolean,
          ...(details['causeEchec'] === undefined ? {} : { causeEchec: details['causeEchec'] as CauseEchecRejeu }),
          ...(details['erreur'] === undefined ? {} : { erreur: details['erreur'] as string }),
          ...(details['mesureMs'] === undefined ? {} : { mesureMs: details['mesureMs'] as number }),
          dureeMs: details['dureeMs'] as number,
          ...(details['observations'] === undefined ? {} : { observations: details['observations'] as ObservationsRejeu }),
        };
        expect(formaterExtrait('confirmation.tentative', detailsTentative(details['cle'] as string, tentative))).toBe(extrait);
      }
    }
  });

  it('les entrées `confirmation.contre-epreuve` aussi', () => {
    for (const cas of corpus) {
      for (const extrait of cas.contexte.extraits.filter((ligne) => ligne.startsWith('confirmation.contre-epreuve'))) {
        const { details } = relire(extrait);
        const contreEpreuve: ContreEpreuve = {
          viewport: details['viewport'] as string,
          reproduite: details['reproduite'] as boolean,
          echecOutillage: details['echecOutillage'] as boolean,
          attendue: details['attendue'] as boolean,
          ...(details['observations'] === undefined ? {} : { observations: details['observations'] as ObservationsRejeu }),
        };
        expect(formaterExtrait('confirmation.contre-epreuve', detailsContreEpreuve(details['cle'] as string, contreEpreuve))).toBe(extrait);
      }
    }
  });

  it('les constructeurs de PRODUCTION reconstruisent aussi les entrées du journal réel, y compris la contre-épreuve', () => {
    // Le corpus ne porte AUCUNE contre-épreuve, et il ne le peut pas : seul
    // `d-recouvrement` dépend du viewport, et un groupe dont toutes les
    // tentatives sont inexploitables n'en obtient jamais. Ce type d'entrée
    // resterait donc sans couverture de format. On le couvre sur le journal
    // RÉEL, qui en contient une.
    const contreEpreuves = entreesReelles('confirmation.contre-epreuve');
    expect(contreEpreuves.length).toBeGreaterThan(0);
    for (const details of contreEpreuves) {
      const contreEpreuve: ContreEpreuve = {
        viewport: details['viewport'] as string,
        reproduite: details['reproduite'] as boolean,
        echecOutillage: details['echecOutillage'] as boolean,
        attendue: details['attendue'] as boolean,
        ...(details['observations'] === undefined ? {} : { observations: details['observations'] as ObservationsRejeu }),
      };
      expect(detailsContreEpreuve(details['cle'] as string, contreEpreuve)).toEqual(details);
    }
  });

  it('le corpus ne reprend AUCUNE entrée réelle telle quelle sur ses tentatives en échec : il est bien ÉDITÉ', () => {
    // Le miroir du test précédent. Celui-là garde la forme ; celui-ci garde
    // le fond : un corpus qui recopierait le journal réel ne mesurerait que
    // des rejeux réussis, où le diagnostic n'a rien à faire.
    const reelles = new Set(entreesReelles('confirmation.tentative').map((details) => JSON.stringify(details)));
    const enEchec = corpus
      .flatMap((cas) => cas.contexte.extraits)
      .filter((ligne) => ligne.startsWith('confirmation.tentative'))
      .map(relire)
      .filter((ligne) => ligne.details['echecOutillage'] === true);
    expect(enEchec.length).toBeGreaterThan(0);
    for (const ligne of enEchec) {
      expect(reelles.has(JSON.stringify(ligne.details))).toBe(false);
    }
  });
});

describe('le corpus — PLAUSIBILITÉ de MÉCANISME : ce journal, le pipeline peut-il l’écrire ?', () => {
  // La plausibilité de FORMAT (clés, ordre, valeurs) ne suffit pas : un journal
  // peut être parfaitement bien formé et décrire une séquence que le moteur ne
  // produit jamais. Ces trois gardes sont nées de trois défauts RÉELS trouvés
  // dans la première version du corpus — un cas portait une contre-épreuve sur
  // un détecteur indépendant du viewport, un autre en portait une alors que
  // toutes ses tentatives étaient inexploitables, et trois cas comptaient plus
  // de tentatives que le moteur n'en lance. Chacune est la garde de son défaut.

  /** Les extraits d'un cas, relus et regroupés par type. */
  function lignes(cas: CasCorpus, type: string): Record<string, unknown>[] {
    return cas.contexte.extraits.filter((extrait) => extrait.startsWith(type)).map((extrait) => relire(extrait).details);
  }

  it('aucun cas ne compte plus de tentatives que `confirmation.reExecutions` n’en lance', () => {
    for (const cas of corpus) {
      expect(lignes(cas, 'confirmation.tentative').length).toBeLessThanOrEqual(configScanner.confirmation.reExecutions);
    }
  });

  it('une contre-épreuve n’existe QUE là où la production en produirait une', () => {
    // Deux conditions, toutes deux dans `reexecuterGroupe` : le détecteur du
    // représentant dépend du viewport, ET au moins une tentative est
    // EXPLOITABLE — contredire un rejeu qui n'a pas eu lieu n'apprend rien.
    const detecteurs = creerDetecteurs(configScanner.detecteurs);
    for (const cas of corpus) {
      const contreEpreuves = lignes(cas, 'confirmation.contre-epreuve');
      if (contreEpreuves.length === 0) continue;
      const [groupe] = lignes(cas, 'confirmation.groupe');
      const detecteur = detecteurs.find((candidat) => candidat.nom === groupe?.['detecteur']);
      expect(detecteur?.dependDuViewport, `${cas.id} : contre-épreuve sur un détecteur indépendant du viewport`).toBe(true);
      const exploitables = lignes(cas, 'confirmation.tentative').filter((details) =>
        estExploitable({
          echecOutillage: details['echecOutillage'] as boolean,
          ...(details['causeEchec'] === undefined ? {} : { causeEchec: details['causeEchec'] as CauseEchecRejeu }),
        }),
      );
      expect(exploitables.length, `${cas.id} : contre-épreuve sans aucune tentative exploitable`).toBeGreaterThan(0);
    }
  });

  it('chaque tentative et chaque contre-épreuve porte ses `observations` : un rejeu réel en porte toujours', () => {
    for (const cas of corpus) {
      for (const details of [...lignes(cas, 'confirmation.tentative'), ...lignes(cas, 'confirmation.contre-epreuve')]) {
        expect(details['observations'], cas.id).toMatchObject({
          nbPages: expect.any(Number),
          nbActions: expect.any(Number),
          nbActionsPrevues: expect.any(Number),
          nbSignaux: expect.any(Number),
          statuts: expect.any(Array),
          reponsesHors2xx: expect.any(Array),
          echecsReseau: expect.any(Array),
          requetesEnAttente: expect.any(Array),
        });
      }
    }
  });

  it('les trois listes de ressources ont la FORME que la production leur donne', () => {
    // Défaut réel attrapé par ce test avant qu'il n'existe : une entrée de
    // `reponsesHors2xx` sans son code de statut. Bien formée pour le schéma,
    // impossible pour le moteur — et LISIBLE par le modèle, qui l'a prise
    // pour une réponse. Les trois listes sont construites par `observerRejeu`
    // et n'ont chacune qu'une forme possible.
    const statutMethodeUrl = /^[1-9]\d\d [A-Z]+ https?:\/\/\S+$/;
    const methodeUrl = /^[A-Z]+ https?:\/\/\S+$/;
    const codeMethodeUrl = /^\S+ [A-Z]+ https?:\/\/\S+$/;
    for (const cas of corpus) {
      for (const details of [...lignes(cas, 'confirmation.tentative'), ...lignes(cas, 'confirmation.contre-epreuve')]) {
        const observations = details['observations'] as Record<string, string[]>;
        for (const entree of observations['reponsesHors2xx'] ?? []) expect(entree, cas.id).toMatch(statutMethodeUrl);
        for (const entree of observations['requetesEnAttente'] ?? []) expect(entree, cas.id).toMatch(methodeUrl);
        for (const entree of observations['echecsReseau'] ?? []) expect(entree, cas.id).toMatch(codeMethodeUrl);
      }
    }
  });

  it('un statut hors 2xx est NOMMÉ dès qu’il est compté : les deux champs ne peuvent pas se contredire', () => {
    for (const cas of corpus) {
      for (const details of [...lignes(cas, 'confirmation.tentative'), ...lignes(cas, 'confirmation.contre-epreuve')]) {
        const observations = details['observations'] as { statuts: number[]; reponsesHors2xx: string[] };
        const hors2xx = observations.statuts.filter((statut) => statut < 200 || statut > 299);
        expect(observations.reponsesHors2xx, cas.id).toHaveLength(hors2xx.length);
        for (const statut of hors2xx) {
          expect(observations.reponsesHors2xx.some((entree) => entree.startsWith(`${statut} `)), cas.id).toBe(true);
        }
      }
    }
  });

  it('`nbActionsPrevues` découle du groupe : chargement + préalables + action déclenchante', () => {
    // Le lien entre l'en-tête du groupe et le détail des tentatives : sans
    // lui, un cas pourrait annoncer trois actions prévues sur un groupe qui
    // n'en a qu'une, et « 2 actions sur 3 » ne voudrait plus rien dire.
    for (const cas of corpus) {
      const [groupe] = lignes(cas, 'confirmation.groupe');
      const attendu = 1 + (groupe?.['nbPrealables'] as number) + (groupe?.['action'] === null ? 0 : 1);
      for (const details of [...lignes(cas, 'confirmation.tentative'), ...lignes(cas, 'confirmation.contre-epreuve')]) {
        expect((details['observations'] as Record<string, unknown>)['nbActionsPrevues'], cas.id).toBe(attendu);
      }
    }
  });
});

/** Ce qui s'est passé, cas par cas : le message d'échec doit se lire sans relancer la mesure. */
function detailler(mesure: MesureCorpus): string {
  return mesure.resultats
    .map((resultat) => `${resultat.id} attendu=${resultat.avisAttendu} rendu=${resultat.avisRendu ?? resultat.raison ?? '—'}`)
    .join(' | ');
}

describe('le corpus — MESURE sur cassettes', () => {
  it('PARC COMPLET : chacun des cinq cas produit un avis (sinon : pnpm banc:enregistrer-diagnostic)', async () => {
    const { client } = await creerClientIaBanc({ regime: 'rejeu' });

    const mesure = await mesurerCorpus(client, corpus);

    // L'absence de cassette ne se lit PAS « 0 mesure, donc 100 % » : le corpus
    // est la mesure de la brique, et une mesure qui n'a rien mesuré échoue.
    // La commande à lancer est nommée : sans elle, l'absence est un mur ;
    // avec elle, c'est une étape.
    expect(
      { nbNonMesures: mesure.nbNonMesures, detail: detailler(mesure) },
      `parc de cassettes incomplet — lancer : ${COMMANDE_ENREGISTREMENT_DIAGNOSTIC}`,
    ).toMatchObject({ nbNonMesures: 0 });
  });

  it('5/5, L’AVEU COMPRIS — un écart ici est un DÉSACCORD DU MODÈLE, pas un parc incomplet', async () => {
    // Les deux causes sont séparées en deux tests parce qu'elles n'appellent
    // pas la même correction : l'une se corrige en enregistrant, l'autre en
    // regardant le prompt, les extraits montrés, ou l'attendu du corpus. Une
    // garde qui accuse le mauvais coupable est pire qu'une garde absente
    // (APPRENTISSAGES n°6).
    const { client } = await creerClientIaBanc({ regime: 'rejeu' });

    const mesure = await mesurerCorpus(client, corpus);

    expect({ nbCorrects: mesure.nbCorrects, detail: detailler(mesure) }).toMatchObject({ nbCorrects: corpus.length });
  });

  it('la mesure ne compte jamais un cas muet comme une réussite', async () => {
    // Le compteur mis à l'épreuve (METHODE §2) : un client qui ne rend rien
    // doit produire 0 correct et 5 non mesurés, pas un silence à 100 %.
    const { client } = await creerClientIaBanc({ regime: 'sans-ia' });

    const mesure = await mesurerCorpus(client, corpus);

    expect(mesure).toMatchObject({ nbCorrects: 0, nbMesures: 0, nbNonMesures: corpus.length, coutApi: 0 });
    expect(mesure.resultats.every((resultat) => resultat.avisRendu === null && resultat.correct === false)).toBe(true);
  });
});
