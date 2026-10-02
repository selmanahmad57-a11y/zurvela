/**
 * Client IA concret (API Anthropic). SEUL fichier du dépôt qui importe un SDK
 * de modèle (constitution §4) : tout le reste du moteur ne voit que
 * `ClientIa`.
 *
 * Règle absolue de ce module : il ne LÈVE jamais pour cause d'IA. Un quota,
 * une panne réseau, un refus du modèle, un tarif inconnu — tout se traduit en
 * `ResultatIa { disponible: false, raison }` et le scan continue avec ses
 * détecteurs techniques (constitution §4, mode dégradé obligatoire).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ConfigDiagnostic, ConfigProfilage, ConfigRapport, ConfigScanner } from '../scanner/config.js';
import type { EtatDecisionEnumere } from '../types.js';
import type { ConfigNavigation } from './config-navigation.js';
import { cleCassetteDecision } from './cassettes.js';

import { VERSION as VERSION_NAVIGATION } from '../../prompts/navigation/v2.js';
import { deciderBrutAvec, decisionDepuisReponse, type AppelDecision } from './decision.js';
import { diagnosticDepuisReponse, diagnostiquerBrutAvec, type AppelDiagnostic } from './diagnostic.js';
import { normaliserContexteDiagnostic, type ContexteDiagnosticNormalise } from './contexte-diagnostic.js';
import { creerValidateurDiagnostic } from './schema-diagnostic.js';
import { redactionDepuisReponse, redigerBrutAvec, type AppelRedaction } from './redaction.js';
import { bornerContexteRedaction, identifiantsSections } from './contexte-redaction.js';
import { creerValidateurRedaction } from './schema-redaction.js';
import { empreinteContratNavigation, identifiantsEnumeres, normaliserEtatDecision, type EtatNormalise } from './etat-decision.js';
import { creerValidateurDecision } from './schema-decision.js';
import {
  type OptionsRedaction,
  RAISON_APPEL_API,
  RAISON_APPEL_INATTENDU,
  RAISON_APPEL_LIMITE,
  RAISON_APPEL_RESEAU,
  RAISON_CLE_ABSENTE,
  RAISON_DIAGNOSTIC_INACTIF,
  RAISON_CONTEXTE_DEPASSE,
  RAISON_REFUS_MODELE,
  RAISON_REPONSE_TRONQUEE,
  RAISON_TARIF_ABSENT,
  creerClientSansCapacite,
  type ClientIaEnregistrable,
  type ContexteDiagnostic,
  type ContexteProfilage,
  type ContexteRedaction,
  type DecisionEstampillee,
  type DiagnosticEstampille,
  type ProfilPage,
  type RedactionEstampillee,
  type ReponseBrute,
  type ResultatIa,
} from './index.js';
import { profilDepuisReponse, profilerBrutAvec, type AppelModele, type ResultatAppel } from './profilage.js';
import { creerValidateurProfil } from './schema-profil.js';

/**
 * Forme d'un identifiant de modèle valide EN CONFIG : famille puis un ou deux
 * nombres courts — un ALIAS, jamais une forme datée.
 *
 * La forme datée EXISTE : `claude-haiku-4-5-20251001` est l'instantané que le
 * serveur SERT pour l'alias `claude-haiku-4-5` (annexe A du cahier), et le SDK
 * la déclare dans son union `Model`. Ce que le motif refuse n'est donc pas un
 * identifiant imaginaire, c'est un identifiant à la mauvaise PLACE : la config
 * ne porte que l'alias, parce que c'est lui qui entre dans la clé de cassette
 * et doit rester stable ; l'instantané servi vit dans `modeleServi`, extrait
 * de la réponse réelle.
 *
 * APPRENTISSAGES n°5 : une valeur de config que rien n'exécute n'est pas
 * vérifiée — ce motif est la vérification de forme, sans appel réseau.
 */
export const FORMAT_IDENTIFIANT_MODELE = /^claude-[a-z]+-\d{1,2}(-\d{1,2})?$/;

/**
 * En-tête qui rattache une requête à un workspace. Le NOM de la variable
 * d'environnement qui en porte la valeur est un réglage (`ia.variableWorkspace`) ;
 * le nom de l'en-tête, lui, est un jeton de protocole — du WEB, donc du code
 * (constitution §2).
 *
 * Une clé non rattachée à un workspace fait répondre l'API en 400 tant que cet
 * en-tête manque : c'est une forme de clé légitime, qui existera aussi en
 * production. L'en-tête part quand et SEULEMENT QUAND la variable est
 * renseignée — une clé déjà rattachée ne doit pas être gênée.
 */
export const ENTETE_WORKSPACE = 'anthropic-workspace-id';

/**
 * Tarif d'un modèle, dans l'unité monétaire du rapport. Il vit en
 * CONFIGURATION : les prix changent, et un prix en dur est une valeur qui
 * devra changer un jour (constitution §2).
 */
export interface TarifModele {
  entreeParMillion: number;
  sortieParMillion: number;
}

/** Tarifs par identifiant de modèle. Un modèle sans tarif est un modèle qu'on n'exécute pas. */
export type TarifsIa = Readonly<Record<string, TarifModele>>;

/**
 * La seule partie du SDK dont le profilage a besoin. Elle existe pour qu'un
 * test puisse fournir une doublure : aucun test du dépôt n'appelle le réseau.
 */
export interface PorteeSdk {
  messages: {
    /**
     * `options` porte le DÉLAI de la requête. Il est optionnel parce que seuls
     * les appels qui en ont besoin le passent — la rédaction, dont l'appel est
     * le plus long du scan et la dernière étape, donc celle qui peut faire
     * dépasser le `timeoutMs` sans que rien ne la borne.
     */
    create(params: Anthropic.MessageCreateParamsNonStreaming, options?: { timeout?: number }): Promise<Anthropic.Message>;
  };
}

export interface OptionsClientAnthropic {
  config: ConfigScanner['ia'];
  profilage: ConfigProfilage;
  /**
   * Réglages de la décision de navigation. REQUIS, et pas par confort : le
   * contrat de la brique 4b est additif, donc rien n'aurait signalé un client
   * concret incapable de décider. Le rendre obligatoire crée le trou que le
   * typecheck suit (APPRENTISSAGES n°7).
   */
  navigation: ConfigNavigation;
  /**
   * Réglages de l'auto-diagnostic. REQUIS, même raison qu'à la navigation : le
   * contrat de la brique 4c est additif, donc rien n'aurait signalé un client
   * concret incapable de diagnostiquer. Le rendre obligatoire crée le trou que
   * le typecheck suit (APPRENTISSAGES n°7).
   */
  diagnostic: ConfigDiagnostic;
  /**
   * Réglages de la RÉDACTION. REQUIS, même raison qu'à la navigation et au
   * diagnostic : le contrat de la brique 5 est additif, donc rien n'aurait
   * signalé un client concret incapable de rédiger. Le rendre obligatoire crée
   * le trou que le typecheck suit (APPRENTISSAGES n°7).
   */
  rapport: ConfigRapport;
  tarifs: TarifsIa;
  env?: NodeJS.ProcessEnv;
  /** Doublure de SDK (tests). En production, le SDK est construit depuis la clé. */
  sdk?: PorteeSdk;
}

/**
 * Construit le client concret, ou un client dégradé avec une raison STABLE si
 * quelque chose manque. Aucun de ces cas n'est une exception : ce sont des
 * états normaux du produit, journalisés et mesurés.
 */
export function creerClientAnthropic(options: OptionsClientAnthropic): ClientIaEnregistrable {
  const { config, profilage, tarifs } = options;
  const env = options.env ?? process.env;
  const modele = config.modeles.profilage;

  const cle = env[config.variableCle];
  if (options.sdk === undefined && (cle === undefined || cle === '')) {
    return creerClientSansCapacite(RAISON_CLE_ABSENTE, `variable d'environnement ${config.variableCle} absente`);
  }
  const tarif = tarifs[modele];
  if (tarif === undefined) {
    // On refuse d'appeler un modèle dont on ne sait pas facturer l'appel :
    // le coût est la jumelle de la qualité (APPRENTISSAGES n°3), et une
    // jumelle aveugle doit être un échec bruyant, pas un zéro silencieux.
    return creerClientSansCapacite(RAISON_TARIF_ABSENT, `aucun tarif configuré pour le modèle ${modele}`);
  }

  const sdk: PorteeSdk = options.sdk ?? new Anthropic(parametresSdk(config, cle ?? '', env));
  const validateur = creerValidateurProfil(profilage);

  const appelerProfilage: AppelModele = (prompt) =>
    appeler(
      {
        sdk,
        modele,
        tarif,
        maxTokens: profilage.maxTokensReponse,
        nomPlafond: 'profilage.maxTokensReponse',
        detailEntree: `profilage.contexteMaxChars ${profilage.contexteMaxChars}`,
      },
      prompt,
      validateur.schemaContratModele,
    );

  // ---------------------------------------------------------------------
  // Décision de navigation (brique 4b)
  // ---------------------------------------------------------------------
  const { navigation } = options;
  const modeleNavigation = config.modeles.navigation;
  const tarifNavigation = tarifs[modeleNavigation];

  /**
   * Le tarif manquant est traité PAR CAPACITÉ, pas pour le client entier : un
   * modèle de navigation sans tarif ne doit pas éteindre le profilage, qui a
   * le sien. La raison reste la même et reste bruyante — on n'appelle pas un
   * modèle dont on ne sait pas facturer l'appel (APPRENTISSAGES n°3).
   */
  const tarifNavigationAbsent = async <T>(): Promise<ResultatIa<T>> => ({
    disponible: false,
    raison: RAISON_TARIF_ABSENT,
    message: `aucun tarif configuré pour le modèle ${modeleNavigation}`,
  });

  const deciderBrut = (etat: EtatNormalise): Promise<ResultatIa<ReponseBrute>> => {
    if (tarifNavigation === undefined) return tarifNavigationAbsent<ReponseBrute>();
    const appelerNavigation: AppelDecision = (prompt, schemaContratModele) =>
      appeler(
        {
          sdk,
          modele: modeleNavigation,
          tarif: tarifNavigation,
          maxTokens: navigation.maxTokensReponse,
          nomPlafond: 'navigation.maxTokensReponse',
          detailEntree: `exploration.libelleMaxChars ${navigation.libelleMaxChars}`,
        },
        prompt,
        schemaContratModele,
      );
    return deciderBrutAvec({
      etat,
      config: navigation,
      // Le contrat de sortie est DÉRIVÉ de l'énumération reçue : le modèle
      // n'a littéralement aucune valeur admissible en dehors du menu.
      validateur: creerValidateurDecision(identifiantsEnumeres(etat)),
      appeler: appelerNavigation,
    });
  };

  // ---------------------------------------------------------------------
  // Auto-diagnostic (brique 4c)
  // ---------------------------------------------------------------------
  const { diagnostic } = options;
  const modeleDiagnostic = config.modeles.diagnostic;
  const tarifDiagnostic = tarifs[modeleDiagnostic];
  const validateurDiagnostic = creerValidateurDiagnostic();

  /**
   * Le chemin qui DÉPENSE, et donc le chemin où la porte se referme une
   * seconde fois.
   *
   * Le déclenchement est filtré en amont par le protocole — c'est là que la
   * porte `actif` doit vivre, parce que c'est là qu'on sait quels groupes sont
   * concernés. La serrure posée ici ne la remplace pas : elle garantit qu'une
   * porte fermée ne peut pas laisser partir un appel réseau, même si un
   * appelant oublie de la lire. Le cahier exige qu'un diagnostic coupé rende
   * un comportement STRICTEMENT identique à la brique 4b, et une exigence de
   * cette nature ne se garde pas à un seul endroit.
   *
   * Comme le tarif manquant, l'indisponibilité est PAR CAPACITÉ : un
   * diagnostic éteint n'éteint ni le profilage ni la navigation.
   */
  const diagnostiquerBrut = (contexte: ContexteDiagnosticNormalise): Promise<ResultatIa<ReponseBrute>> => {
    if (!diagnostic.actif) {
      return Promise.resolve({
        disponible: false,
        raison: RAISON_DIAGNOSTIC_INACTIF,
        message: 'diagnostic.actif est faux : aucun appel',
      });
    }
    if (tarifDiagnostic === undefined) {
      return Promise.resolve({
        disponible: false,
        raison: RAISON_TARIF_ABSENT,
        message: `aucun tarif configuré pour le modèle ${modeleDiagnostic}`,
      });
    }
    const appelerDiagnostic: AppelDiagnostic = (prompt, schemaContratModele) =>
      appeler(
        {
          sdk,
          modele: modeleDiagnostic,
          tarif: tarifDiagnostic,
          maxTokens: diagnostic.maxTokensReponse,
          nomPlafond: 'diagnostic.maxTokensReponse',
          detailEntree: `diagnostic.extraitsMaxChars ${diagnostic.extraitsMaxChars}`,
        },
        prompt,
        schemaContratModele,
      );
    return diagnostiquerBrutAvec({
      contexte,
      config: diagnostic,
      validateur: validateurDiagnostic,
      appeler: appelerDiagnostic,
    });
  };

  // ---------------------------------------------------------------------
  // Rédaction du rapport business (brique 5)
  // ---------------------------------------------------------------------
  const { rapport } = options;
  const modeleRedaction = config.modeles.redaction;
  const tarifRedaction = tarifs[modeleRedaction];

  /**
   * Le chemin qui DÉPENSE pour la rédaction. Comme ailleurs,
   * l'indisponibilité est PAR CAPACITÉ : un modèle de rédaction sans tarif
   * n'éteint ni le profilage, ni la navigation, ni le diagnostic — il rend un
   * rapport STRUCTUREL, qui reste un rapport.
   */
  const redigerBrut = (contexteRecu: ContexteRedaction, options: OptionsRedaction = {}): Promise<ResultatIa<ReponseBrute>> => {
    // LA BORNE EST REFAITE ICI, au seuil de `core/ia`, et pas seulement sur le
    // chemin rejouable. Une borne de sécurité ne doit pas dépendre de la
    // discipline de son appelant — c'est la règle écrite dans
    // `contexte-redaction.ts`, et elle était FAUSSE : seul `cassettes.ts`
    // l'appliquait, donc un client concret appelé directement (hors banc)
    // envoyait le contexte brut, sans troncature ni neutralisation des
    // séparateurs de ligne d'Unicode. Un contrat faux est cru comme un
    // diagnostic faux (APPRENTISSAGES n°6).
    //
    // La borne est IDEMPOTENTE : l'appliquer deux fois — ici après
    // `cassettes.ts` — ne change rien, donc la clé de cassette reste la même.
    const contexte = bornerContexteRedaction(contexteRecu, rapport);
    if (tarifRedaction === undefined) {
      return Promise.resolve({
        disponible: false,
        raison: RAISON_TARIF_ABSENT,
        message: `aucun tarif configuré pour le modèle ${modeleRedaction}`,
      });
    }
    const appelerRedaction: AppelRedaction = (prompt, schemaContratModele) =>
      appeler(
        {
          sdk,
          modele: modeleRedaction,
          tarif: tarifRedaction,
          maxTokens: rapport.maxTokensReponse,
          nomPlafond: 'rapport.maxTokensReponse',
          detailEntree: `rapport.faitsMaxChars ${rapport.faitsMaxChars}`,
          // Le plus serré des deux plafonds : celui du client (config) et celui
          // que l'échéance du scan impose (P2-1, contrat 2).
          delaiMs: options.delaiMs === undefined ? rapport.appelMaxMs : Math.max(1, Math.min(rapport.appelMaxMs, options.delaiMs)),
        },
        prompt,
        schemaContratModele,
      );
    return redigerBrutAvec({
      contexte,
      config: rapport,
      // Le contrat de sortie est DÉRIVÉ de l'énumération des sections : le
      // modèle n'a littéralement aucun identifiant admissible en dehors.
      validateur: creerValidateurRedaction(identifiantsSections(contexte)),
      appeler: appelerRedaction,
    });
  };

  const profilerBrut = (contexte: ContexteProfilage): Promise<ResultatIa<ReponseBrute>> =>
    profilerBrutAvec({ contexte, config: profilage, validateur, appeler: appelerProfilage });

  // Plus aucune capacité « non implémentée » : la brique 5 était la dernière,
  // et le client concret sait désormais les quatre.

  return {
    mode: 'actif',
    raisonDegrade: null,
    profilerBrut,
    deciderBrut,
    diagnostiquerBrut,
    redigerBrut,
    async profiler(contexte): Promise<ResultatIa<ProfilPage>> {
      const brut = await profilerBrut(contexte);
      if (!brut.disponible) return brut;
      return profilDepuisReponse({
        texte: brut.valeur.texte,
        validateur,
        config: profilage,
        modeleDemande: modele,
        modeleServi: brut.valeur.modeleServi,
        apresRelance: brut.valeur.apresRelance,
        coutApi: brut.valeur.coutApi,
      });
    },
    /**
     * Le modèle ÉLIT : il reçoit une énumération d'identifiants opaques et
     * rend l'un d'eux. La normalisation de l'état a lieu ICI, une fois, et
     * sert à la fois au prompt et au validateur — l'ordre dans lequel
     * l'énumérateur a produit ses actions ne doit pas pouvoir changer ce que
     * le modèle voit.
     */
    /**
     * La clé que porterait une décision mise en cache. MESURE SEULE : rien
     * n'est mis en cache aujourd'hui, et ce chemin ne décide rien (cahier
     * P2-4, contrat 2). Elle appelle `cleCassetteDecision`, la même
     * fonction que le rejeu du banc, sur la même normalisation.
     */
    cleDecision(etat: EtatDecisionEnumere): string {
      return cleCassetteDecision({
        versionPrompt: VERSION_NAVIGATION,
        empreinteContrat: empreinteContratNavigation(navigation),
        modele: modeleNavigation,
        etat: normaliserEtatDecision(etat, navigation),
      });
    },
    async decider(etat: EtatDecisionEnumere): Promise<ResultatIa<DecisionEstampillee>> {
      const etatNormalise = normaliserEtatDecision(etat, navigation);
      const brut = await deciderBrut(etatNormalise);
      if (!brut.disponible) return brut;
      return decisionDepuisReponse({
        texte: brut.valeur.texte,
        validateur: creerValidateurDecision(identifiantsEnumeres(etatNormalise)),
        modeleDemande: modeleNavigation,
        modeleServi: brut.valeur.modeleServi,
        apresRelance: brut.valeur.apresRelance,
        coutApi: brut.valeur.coutApi,
      });
    },
    /**
     * Le modèle rend un AVIS sur le résidu que la mécanique n'a pas tranché.
     * La normalisation du contexte a lieu ICI, une fois, et sert à la fois au
     * prompt et à la clé de cassette — la discipline de l'appelant à borner
     * son journal ne doit pas pouvoir changer ce que le modèle voit.
     *
     * Les trois avis sont traités à l'identique : `indetermine` remonte comme
     * une valeur disponible, jamais comme une erreur.
     */
    async diagnostiquer(contexte: ContexteDiagnostic): Promise<ResultatIa<DiagnosticEstampille>> {
      const brut = await diagnostiquerBrut(normaliserContexteDiagnostic(contexte, diagnostic));
      if (!brut.disponible) return brut;
      return diagnosticDepuisReponse({
        texte: brut.valeur.texte,
        validateur: validateurDiagnostic,
        modeleDemande: modeleDiagnostic,
        modeleServi: brut.valeur.modeleServi,
        apresRelance: brut.valeur.apresRelance,
        coutApi: brut.valeur.coutApi,
      });
    },
    /**
     * Le modèle MET EN PHRASES des faits déjà posés. Le contexte lui arrive
     * déjà normalisé — c'est `core/rapport/faits.ts` qui le construit, une
     * fois, pour le prompt comme pour la clé de cassette.
     */
    async rediger(contexteRecu: ContexteRedaction, options: OptionsRedaction = {}): Promise<ResultatIa<RedactionEstampillee>> {
      // Le validateur est construit sur le contexte BORNÉ, celui-là même qui a
      // été envoyé : construire l'énumération sur le contexte reçu accepterait
      // des identifiants que le modèle n'a jamais vus.
      const contexte = bornerContexteRedaction(contexteRecu, rapport);
      const brut = await redigerBrut(contexte, options);
      if (!brut.disponible) return brut;
      return redactionDepuisReponse({
        texte: brut.valeur.texte,
        validateur: creerValidateurRedaction(identifiantsSections(contexte)),
        modeleDemande: modeleRedaction,
        modeleServi: brut.valeur.modeleServi,
        apresRelance: brut.valeur.apresRelance,
        coutApi: brut.valeur.coutApi,
      });
    },
  };
}

/** Ce qui distingue un appel de modèle d'un autre : tout le reste est commun. */
interface ParametresAppel {
  sdk: PorteeSdk;
  modele: string;
  tarif: TarifModele;
  maxTokens: number;
  /**
   * Délai maximal de la requête, en millisecondes. Absent : celui du SDK.
   *
   * Une PORTE d'entrée qui vérifie l'échéance avant d'appeler ne borne pas la
   * DURÉE de l'appel une fois engagé : c'est un « check-then-act », et il
   * laisse un scan dépasser son budget sans limite si le fournisseur tarde.
   * Seule une borne sur l'opération elle-même le referme.
   */
  delaiMs?: number;
  /** Réglage de config qui porte le plafond de génération : sert à nommer la VRAIE cause. */
  nomPlafond: string;
  /** Réglage de config qui borne l'entrée, même raison. */
  detailEntree: string;
}

/**
 * Un appel de modèle, quel que soit l'usage. Factorisé parce que les gardes
 * qu'il porte — refus, génération coupée, fenêtre dépassée, chaîne
 * d'exceptions typées — ne doivent exister qu'en UN exemplaire : une seconde
 * copie dériverait, et c'est celle qui porterait la garde manquante le jour
 * où elle compte.
 *
 * Les deux détails de config (`nomPlafond`, `detailEntree`) sont passés plutôt
 * que devinés : un message qui accuse « la forme de la réponse » quand la
 * cause est un plafond envoie corriger ce qui fonctionne (APPRENTISSAGES n°6).
 */
async function appeler(
  parametres: ParametresAppel,
  prompt: { systeme: string; utilisateur: string },
  schemaContratModele: Record<string, unknown>,
): Promise<ResultatAppel> {
  const { sdk, modele, tarif, maxTokens, nomPlafond, detailEntree, delaiMs } = parametres;
  try {
    const reponse = await sdk.messages.create({
      model: modele,
      max_tokens: maxTokens,
      system: prompt.systeme,
      messages: [{ role: 'user', content: prompt.utilisateur }],
      // Sortie structurée : `output_config.format`, jamais le paramètre
      // `output_format` déprécié, et jamais de préremplissage de message
      // assistant (rejeté par les modèles courants).
      // Le schéma envoyé est le CONTRAT RESTREINT, pas le schéma de
      // validation : pour le profilage, `pattern`, `minimum` et `maximum` ne
      // font pas partie du sous-ensemble accepté par les sorties structurées,
      // et les envoyer vaut soit un refus, soit un contrat qui ne ferme rien.
      output_config: { format: { type: 'json_schema', schema: schemaContratModele } },
    }, delaiMs === undefined ? undefined : { timeout: delaiMs });
    const coutApi = coutAppel(reponse.usage, tarif);
    if (reponse.stop_reason === 'refusal') {
      return { ok: false, raison: RAISON_REFUS_MODELE, coutApi };
    }
    // Une réponse COUPÉE par un plafond n'est pas une réponse mal formée.
    // Sans ces deux branches, son JSON incomplet ressortait en
    // « reponseNonJson », une relance brûlait un appel payant sous le MÊME
    // plafond, et le message accusait la forme de la réponse du modèle alors
    // que la cause est un réglage de config — le mauvais coupable, au pire
    // moment (APPRENTISSAGES n°6). Comme un échec d'appel, elles arrêtent
    // sans brûler la relance : les boucles de relance traitent déjà
    // `ok: false` ainsi.
    if (reponse.stop_reason === 'max_tokens') {
      return {
        ok: false,
        raison: RAISON_REPONSE_TRONQUEE,
        coutApi,
        message: `génération coupée à ${nomPlafond} (${maxTokens})`,
      };
    }
    if (reponse.stop_reason === 'model_context_window_exceeded') {
      return {
        ok: false,
        raison: RAISON_CONTEXTE_DEPASSE,
        coutApi,
        message: `entrée au-delà de la fenêtre du modèle ${modele} (${detailEntree})`,
      };
    }
    // `modeleServi` est EXTRAIT de la réponse, jamais recopié depuis l'alias
    // demandé : c'est toute la différence entre une estampille et une
    // décoration (APPRENTISSAGES n°6).
    return { ok: true, texte: texteDe(reponse), coutApi, modeleServi: reponse.model };
  } catch (erreur) {
    return echecAppel(erreur);
  }
}

/**
 * En-têtes supplémentaires du client : l'en-tête de workspace si et seulement
 * si la variable nommée par la config est renseignée. Une variable absente
 * n'est jamais une exception — c'est le cas courant.
 *
 * EXPORTÉE pour être éprouvée directement : les tests injectent une doublure
 * de SDK, donc la construction réelle du client n'est exécutée par aucun test.
 * Laisser cette fonction privée en ferait exactement ce que l'apprentissage
 * n°5 interdit — une configuration que rien n'exécute.
 */
/**
 * Les paramètres du client SDK, rassemblés pour qu'un test puisse les lire.
 *
 * `maxRetries` y figure EXPLICITEMENT. Laissé au défaut du SDK il vaut 2, et
 * le délai passé à `messages.create` s'applique PAR TENTATIVE : la borne de
 * durée annoncée pour un appel était donc fausse d'un facteur trois, et avec
 * elle la promesse publique de `OptionsScan.timeoutMs`. Un réglage qui
 * fabrique une borne ne peut pas être tacite.
 */
export function parametresSdk(
  config: ConfigScanner['ia'],
  cle: string,
  env: NodeJS.ProcessEnv,
): { apiKey: string; maxRetries: number; defaultHeaders?: Record<string, string> } {
  return { apiKey: cle, maxRetries: config.reessaisReseauMax, ...enTetesWorkspace(config, env) };
}

export function enTetesWorkspace(
  config: ConfigScanner['ia'],
  env: NodeJS.ProcessEnv,
): { defaultHeaders?: Record<string, string> } {
  const workspace = env[config.variableWorkspace];
  if (workspace === undefined || workspace === '') return {};
  return { defaultHeaders: { [ENTETE_WORKSPACE]: workspace } };
}

/** Concatène les blocs texte ; tout autre type de bloc est ignoré. */
function texteDe(reponse: Anthropic.Message): string {
  return reponse.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === 'text')
    .map((bloc) => bloc.text)
    .join('');
}

/**
 * Coût d'un appel. Les jetons de cache sont comptés au plein tarif d'entrée :
 * une métrique de garde prend toujours la lecture la MOINS flatteuse
 * (APPRENTISSAGES n°4). Le profilage n'utilise pas le cache, donc ces champs
 * sont nuls en pratique — la règle est là pour le jour où ils ne le seront
 * plus.
 */
export function coutAppel(usage: Anthropic.Usage, tarif: TarifModele): number {
  const entree = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  return (entree / 1_000_000) * tarif.entreeParMillion + (usage.output_tokens / 1_000_000) * tarif.sortieParMillion;
}

/**
 * Chaîne d'exceptions typées du SDK, du plus précis au plus général. Jamais
 * de comparaison de chaînes sur un message d'erreur : un message change, une
 * classe non.
 */
function echecAppel(erreur: unknown): ResultatAppel {
  if (erreur instanceof Anthropic.RateLimitError) {
    return { ok: false, raison: RAISON_APPEL_LIMITE, message: `statut ${erreur.status}` };
  }
  if (erreur instanceof Anthropic.APIConnectionError) {
    return { ok: false, raison: RAISON_APPEL_RESEAU };
  }
  if (erreur instanceof Anthropic.APIError) {
    return { ok: false, raison: RAISON_APPEL_API, message: `statut ${erreur.status ?? 'inconnu'}` };
  }
  return { ok: false, raison: RAISON_APPEL_INATTENDU };
}
