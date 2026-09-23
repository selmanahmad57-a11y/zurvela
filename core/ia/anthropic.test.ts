import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { chargerConfigProfilage, chargerConfigScanner } from '../scanner/config.js';
import {
  ENTETE_WORKSPACE,
  FORMAT_IDENTIFIANT_MODELE,
  RAISON_APPEL_API,
  RAISON_APPEL_LIMITE,
  RAISON_APPEL_RESEAU,
  RAISON_CLE_ABSENTE,
  RAISON_CONTEXTE_DEPASSE,
  RAISON_NON_IMPLEMENTE,
  RAISON_PROFIL_INVALIDE,
  RAISON_REFUS_MODELE,
  RAISON_REPONSE_TRONQUEE,
  RAISON_TARIF_ABSENT,
  creerClientAnthropic,
  enTetesWorkspace,
  type ContexteProfilage,
  type PorteeSdk,
  type TarifsIa,
} from './index.js';
import { coutAppel } from './anthropic.js';
import { schemaContratModele } from './schema-profil.js';

const configScanner = await chargerConfigScanner();
const profilage = await chargerConfigProfilage();
const MODELE = configScanner.ia.modeles.profilage;
/**
 * Forme RÉSOLUE que le serveur sert pour cet alias — volontairement distincte
 * de l'alias. Un alias est un pointeur : c'est le cas NORMAL, et une doublure
 * qui renverrait l'alias ne distinguerait pas une extraction d'une recopie
 * (APPRENTISSAGES n°6, et ADDENDUM B4 du document de conception).
 */
const MODELE_SERVI = `${MODELE}-20251001`;
const TARIFS: TarifsIa = { [MODELE]: { entreeParMillion: 1, sortieParMillion: 5 } };

const contexte: ContexteProfilage = {
  url: 'https://exemple.invalid/',
  texte: 'Cabinet Martin — formulaire de contact.',
  langueDeclaree: 'fr',
};

const VALIDE = JSON.stringify({ typeSite: 'vitrine-contact', natureLibre: null, langue: 'fr', confiance: 0.8 });

function usage(entree: number, sortie: number): Anthropic.Usage {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    input_tokens: entree,
    output_tokens: sortie,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  };
}

function message(
  texte: string,
  stop: Anthropic.Message['stop_reason'] = 'end_turn',
  modeleServi: string = MODELE_SERVI,
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    // Le serveur répond avec la forme RÉSOLUE, pas avec l'alias demandé.
    model: modeleServi,
    content: [{ type: 'text', text: texte, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    stop_details: null,
    container: null,
    usage: usage(1000, 100),
  };
}

/** Doublure du SDK : aucun test du dépôt ne touche le réseau réel. */
function sdkQuiRepond(reponses: readonly Anthropic.Message[]): {
  sdk: PorteeSdk;
  appels: Anthropic.MessageCreateParamsNonStreaming[];
} {
  const appels: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    appels,
    sdk: {
      messages: {
        create: async (params) => {
          appels.push(params);
          const reponse = reponses[Math.min(appels.length - 1, reponses.length - 1)];
          if (reponse === undefined) throw new Error('doublure sans réponse');
          return reponse;
        },
      },
    },
  };
}

function sdkQuiLeve(erreur: unknown): PorteeSdk {
  return {
    messages: {
      create: async () => {
        throw erreur;
      },
    },
  };
}

describe('identifiants de modèle (APPRENTISSAGES n°5)', () => {
  it('tous les modèles de config respectent le format attendu — vérification de forme, sans réseau', () => {
    const fautifs = Object.entries(configScanner.ia.modeles).filter(
      ([, identifiant]) => !FORMAT_IDENTIFIANT_MODELE.test(identifiant),
    );
    expect(fautifs).toEqual([]);
  });

  /** Si la garde ne peut pas mentir, il faut que quelqu'un ait essayé de la faire mentir. */
  it('le format REFUSE une forme suffixée d’une date — celle qui avait survécu deux briques', () => {
    expect(FORMAT_IDENTIFIANT_MODELE.test('claude-haiku-4-5-20251001')).toBe(false);
    expect(FORMAT_IDENTIFIANT_MODELE.test('claude-opus-5-20260401')).toBe(false);
  });
});

describe('creerClientAnthropic — mode dégradé', () => {
  it('sans clé : dégradé, indisponible, sans réseau et sans exception', async () => {
    const client = creerClientAnthropic({ config: configScanner.ia, profilage, tarifs: TARIFS, env: {} });
    expect(client.mode).toBe('degrade');
    expect(client.raisonDegrade).toBe(RAISON_CLE_ABSENTE);
    await expect(client.profiler(contexte)).resolves.toMatchObject({ disponible: false, raison: RAISON_CLE_ABSENTE });
    await expect(client.profilerBrut(contexte)).resolves.toMatchObject({ disponible: false });
  });

  it('sans tarif pour le modèle : dégradé bruyant plutôt qu’un coût à zéro silencieux', async () => {
    const client = creerClientAnthropic({
      config: configScanner.ia,
      profilage,
      tarifs: {},
      env: { [configScanner.ia.variableCle]: 'cle-factice' },
    });
    expect(client.raisonDegrade).toBe(RAISON_TARIF_ABSENT);
    await expect(client.profiler(contexte)).resolves.toMatchObject({ disponible: false, raison: RAISON_TARIF_ABSENT });
  });
});

describe('creerClientAnthropic — appel réel (doublure de SDK)', () => {
  function client(sdk: PorteeSdk) {
    return creerClientAnthropic({ config: configScanner.ia, profilage, tarifs: TARIFS, env: {}, sdk });
  }

  it('envoie le modèle de config, le plafond de génération et le schéma dérivé', async () => {
    const { sdk, appels } = sdkQuiRepond([message(VALIDE)]);
    const resultat = await client(sdk).profiler(contexte);
    expect(resultat.disponible).toBe(true);

    const appel = appels[0];
    if (appel === undefined) throw new Error('aucun appel');
    expect(appel.model).toBe(MODELE);
    expect(appel.max_tokens).toBe(profilage.maxTokensReponse);
    // Le schéma envoyé est le CONTRAT RESTREINT — celui du sous-ensemble
    // accepté par les sorties structurées —, pas le schéma de validation Ajv.
    expect(appel.output_config?.format).toEqual({
      type: 'json_schema',
      schema: schemaContratModele(profilage),
    });
    const envoye = JSON.stringify(appel.output_config?.format);
    for (const interdit of ['pattern', 'minimum', 'maximum']) {
      expect(envoye).not.toContain(interdit);
    }
    // Instructions dans le canal système, contenu de page dans le canal données.
    expect(appel.system).toContain('NON FIABLE');
    expect(String(appel.system)).not.toContain(contexte.texte);
    expect(JSON.stringify(appel.messages)).toContain(contexte.texte);
    // Pas de préremplissage de message assistant.
    expect(appel.messages.every((tour) => tour.role === 'user')).toBe(true);
  });

  it('estampille le profil et chiffre le coût depuis l’usage', async () => {
    const { sdk } = sdkQuiRepond([message(VALIDE)]);
    const resultat = await client(sdk).profiler(contexte);
    expect(resultat.disponible).toBe(true);
    if (!resultat.disponible) return;
    expect(resultat.valeur).toMatchObject({
      typeSite: 'vitrine-contact',
      langue: 'fr',
      modeleDemande: MODELE,
      modeleServi: MODELE_SERVI,
      apresRelance: false,
    });
    expect(resultat.coutApi).toBeGreaterThan(0);
    expect(resultat.coutApi).toBeCloseTo((1000 / 1e6) * 1 + (100 / 1e6) * 5);
  });

  it('un refus du modèle est une indisponibilité, pas une exception', async () => {
    const { sdk } = sdkQuiRepond([message('', 'refusal')]);
    await expect(client(sdk).profiler(contexte)).resolves.toMatchObject({
      disponible: false,
      raison: RAISON_REFUS_MODELE,
    });
  });

  /**
   * Une réponse COUPÉE par le plafond n'est pas une réponse mal formée. Sans
   * cette branche, son JSON incomplet ressortait en « profil invalide » : le
   * message accusait la forme de la réponse du modèle alors que la cause est
   * `profilage.maxTokensReponse`, et une relance brûlait un appel payant sous
   * le MÊME plafond, donc pour retronquer. Une garde qui accuse le mauvais
   * coupable envoie corriger ce qui fonctionne (APPRENTISSAGES n°6).
   */
  it('une génération coupée par le plafond nomme le PLAFOND, pas la forme de la réponse', async () => {
    const tronquee = VALIDE.slice(0, VALIDE.length - 12);
    const { sdk, appels } = sdkQuiRepond([message(tronquee, 'max_tokens')]);
    const resultat = await client(sdk).profiler(contexte);

    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_REPONSE_TRONQUEE });
    if (resultat.disponible) return;
    expect(resultat.raison).not.toBe(RAISON_PROFIL_INVALIDE);
    expect(resultat.message).toContain('maxTokensReponse');
    // Le coût déjà dépensé reste visible, et la relance n'est PAS brûlée.
    expect(resultat.coutApi).toBeGreaterThan(0);
    expect(appels).toHaveLength(1);
  });

  it('une entrée au-delà de la fenêtre du modèle est de la même famille : un budget, pas une forme', async () => {
    const { sdk, appels } = sdkQuiRepond([message('', 'model_context_window_exceeded')]);
    await expect(client(sdk).profiler(contexte)).resolves.toMatchObject({
      disponible: false,
      raison: RAISON_CONTEXTE_DEPASSE,
    });
    expect(appels).toHaveLength(1);
  });

  it('décide, diagnostique et rédige restent non implémentés : aucun autre chemin réseau en 4a', async () => {
    const { sdk, appels } = sdkQuiRepond([message(VALIDE)]);
    const decore = client(sdk);
    await expect(decore.diagnostiquer({} as never)).resolves.toEqual({
      disponible: false,
      raison: RAISON_NON_IMPLEMENTE,
    });
    await expect(decore.rediger({} as never, 'fr')).resolves.toEqual({
      disponible: false,
      raison: RAISON_NON_IMPLEMENTE,
    });
    expect(appels).toHaveLength(0);
  });
});

describe('provenance : modeleServi est EXTRAIT, jamais déduit (APPRENTISSAGES n°6)', () => {
  function client(sdk: PorteeSdk) {
    return creerClientAnthropic({ config: configScanner.ia, profilage, tarifs: TARIFS, env: {}, sdk });
  }

  it('recopie le champ `model` de la RÉPONSE, quel qu’il soit — pas l’alias demandé', async () => {
    // Le cas qui fait mentir une recopie : le serveur sert un tout autre
    // instantané que celui qu'on croit demander.
    const { sdk } = sdkQuiRepond([message(VALIDE, 'end_turn', 'claude-haiku-4-5-20260401')]);
    const resultat = await client(sdk).profiler(contexte);
    expect(resultat.disponible).toBe(true);
    if (!resultat.disponible) return;
    expect(resultat.valeur.modeleServi).toBe('claude-haiku-4-5-20260401');
    expect(resultat.valeur.modeleDemande).toBe(MODELE);
    expect(resultat.valeur.modeleServi).not.toBe(resultat.valeur.modeleDemande);
  });

  it('la réponse BRUTE porte elle aussi le modèle servi : la cassette en a besoin', async () => {
    const { sdk } = sdkQuiRepond([message(VALIDE)]);
    const brut = await client(sdk).profilerBrut(contexte);
    expect(brut.disponible).toBe(true);
    if (!brut.disponible) return;
    expect(brut.valeur.modeleServi).toBe(MODELE_SERVI);
  });
});

/**
 * ADDENDUM B1 : une clé non rattachée à un workspace fait répondre l'API en
 * 400 tant que cet en-tête manque. Le NOM de la variable est un réglage, le
 * comportement est du code — et il est éprouvé DIRECTEMENT, parce que les
 * autres tests injectent une doublure de SDK et n'exécuteraient donc jamais
 * cette ligne (APPRENTISSAGES n°5).
 */
describe('enTetesWorkspace', () => {
  it('ajoute l’en-tête quand la variable est renseignée', () => {
    const entetes = enTetesWorkspace(configScanner.ia, { [configScanner.ia.variableWorkspace]: 'wrkspc_123' });
    expect(entetes).toEqual({ defaultHeaders: { [ENTETE_WORKSPACE]: 'wrkspc_123' } });
  });

  it('n’ajoute RIEN quand elle est absente ou vide : une clé déjà rattachée ne doit pas être gênée', () => {
    expect(enTetesWorkspace(configScanner.ia, {})).toEqual({});
    expect(enTetesWorkspace(configScanner.ia, { [configScanner.ia.variableWorkspace]: '' })).toEqual({});
  });

  it('lit la variable NOMMÉE PAR LA CONFIG, pas un nom en dur', () => {
    const config = { ...configScanner.ia, variableWorkspace: 'UN_AUTRE_NOM' };
    expect(enTetesWorkspace(config, { UN_AUTRE_NOM: 'wrkspc_456' })).toEqual({
      defaultHeaders: { [ENTETE_WORKSPACE]: 'wrkspc_456' },
    });
    // L'ancien nom ne doit plus rien déclencher.
    expect(enTetesWorkspace(config, { [configScanner.ia.variableWorkspace]: 'wrkspc_123' })).toEqual({});
  });
});

describe('creerClientAnthropic — erreurs du SDK', () => {
  function clientQuiLeve(erreur: unknown) {
    return creerClientAnthropic({
      config: configScanner.ia,
      profilage,
      tarifs: TARIFS,
      env: {},
      sdk: sdkQuiLeve(erreur),
    });
  }

  /**
   * Les raisons sont tirées de la CLASSE de l'exception, jamais d'une
   * comparaison de chaînes sur son message : un message change, une classe
   * non. Les instances sont fabriquées via le SDK lui-même.
   */
  it.each([
    ['RateLimitError', 429, RAISON_APPEL_LIMITE],
    ['BadRequestError', 400, RAISON_APPEL_API],
    ['InternalServerError', 503, RAISON_APPEL_API],
  ] as const)('%s → %s', async (_nom, statut, raison) => {
    const { default: Sdk } = await import('@anthropic-ai/sdk');
    const corps = { type: 'error', error: { type: 'erreur_test', message: 'test' } };
    const erreur = Sdk.APIError.generate(statut, corps, 'test', new Headers());
    await expect(clientQuiLeve(erreur).profiler(contexte)).resolves.toMatchObject({ disponible: false, raison });
  });

  it('panne réseau → raison stable, jamais d’exception qui tue le scan', async () => {
    const { default: Sdk } = await import('@anthropic-ai/sdk');
    const erreur = new Sdk.APIConnectionError({ message: 'socket' });
    await expect(clientQuiLeve(erreur).profiler(contexte)).resolves.toMatchObject({
      disponible: false,
      raison: RAISON_APPEL_RESEAU,
    });
  });

  it('exception non typée → raison stable, jamais de propagation', async () => {
    await expect(clientQuiLeve(new Error('inattendue')).profiler(contexte)).resolves.toMatchObject({
      disponible: false,
    });
  });
});

describe('coutAppel', () => {
  it('compte les jetons de cache au plein tarif d’entrée : la lecture la moins flatteuse', () => {
    const avecCache: Anthropic.Usage = { ...usage(100, 0), cache_read_input_tokens: 900 };
    expect(coutAppel(avecCache, { entreeParMillion: 1, sortieParMillion: 5 })).toBeCloseTo((1000 / 1e6) * 1);
  });
});
