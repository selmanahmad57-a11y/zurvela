/**
 * Chargement de `config/scanner.json` et `config/actions-interdites.json`,
 * validés par leurs schémas. Aucun seuil du moteur ne vit ailleurs
 * (constitution §2).
 */
import { readFile } from 'node:fs/promises';
import type { Categorie, Gravite, Viewport } from '../types.js';
import { depuisRacine } from '../outils/racine.js';
import { chargerSchema, valider } from '../outils/schema.js';

export interface RegleRemplissage {
  types: string[];
  autocomplete: string[];
  valeur: string;
}

/** Palier de confiance d'un détecteur gradué : confiance appliquée à partir de `ratioMin`. */
export interface PalierConfiance {
  ratioMin: number;
  confiance: number;
}

export interface ConfigScanner {
  navigateur: { canal: string | null; sansTete: boolean };
  robot: { userAgent: string; enTete: string; valeurEnTete: string };
  viewports: Viewport[];
  exploration: {
    profondeurMax: number;
    pagesMax: number;
    chargementPageMs: number;
    attenteEffetMaxMs: number;
    stabilisationMs: number;
    clicMs: number;
    saisieMs: number;
    sondageMs: number;
    margeEcheanceMs: number;
    evaluationMs: number;
    mutationsMax: number;
    bruitFondRepetitions: number;
    elementsInteractifsMax: number;
    liensParPageMax: number;
  };
  remplissage: { regles: RegleRemplissage[]; valeurTexteParDefaut: string; typesIgnores: string[] };
  detecteurs: {
    http: {
      confiance5xx: number;
      confiance5xxSoumission: number;
      confiance404: number;
      gravite5xxSoumission: Gravite;
      gravite5xx: Gravite;
      gravite404: Gravite;
      categorieParTypeRessource: Record<string, Categorie>;
      categorieParDefaut: Categorie;
      confianceDocumentInjoignable: number;
      graviteDocumentInjoignable: Gravite;
      /** Codes d'erreur réseau qui ne disent rien du site (annulation côté client). */
      erreursReseauIgnorees: string[];
    };
    inerte: { confiance: number; gravite: Gravite };
    echecMuet: { confiance: number; gravite: Gravite; typesRequete: string[] };
    lenteur: { seuilMs: number; paliers: PalierConfiance[]; gravite: Gravite };
    image: { confianceSignalSimple: number; confianceSignalDouble: number; gravite: Gravite };
    recouvrement: { confianceGeometrie: number; confianceGeometrieEtClic: number; gravite: Gravite };
  };
  confirmation: ConfigConfirmation;
  ia: ConfigIa;
}

/**
 * Réglages de la couche IA. Les NOMS des variables d'environnement sont des
 * réglages (constitution §2) ; ce qu'on en fait — envoyer un en-tête, refuser
 * d'appeler un modèle sans tarif — est du code.
 */
export interface ConfigIa {
  variableCle: string;
  /**
   * Nom de la variable d'environnement portant l'identifiant de workspace.
   * Renseignée, l'en-tête de workspace accompagne chaque requête ; absente,
   * rien n'est envoyé — une clé déjà rattachée à un workspace ne doit pas
   * être gênée.
   */
  variableWorkspace: string;
  modeles: { profilage: string; navigation: string; diagnostic: string; redaction: string };
  /** Tarifs par identifiant de modèle. Un modèle sans tarif n'est pas appelé. */
  tarifs: Record<string, { entreeParMillion: number; sortieParMillion: number }>;
}

/** Politique du protocole anti-faux-positifs (brique 3). */
export interface ConfigConfirmation {
  politique: 'complet' | 'econome';
  seuilConfirmationDirecte: number;
  reExecutions: number;
  variations: string[];
  tauxReproduction: number;
  contreEpreuve: boolean;
  agregationMesures: 'mediane' | 'moyenne' | 'max';
  seuilRetenue: number;
  rejeu: { chargementPageMs: number; actionMs: number; margeEcheanceMs: number; budgetMinimalMs: number };
  calibration: {
    facteurVerdict: { confirmee: number; intermittente: number };
    poidsTauxReproduction: number;
    bonusContreEpreuve: number;
    malusSymetrieInattendue: number;
    confianceMin: number;
    confianceMax: number;
  };
}

/** Liste noire des actions destructives (constitution §3). Seul le filtre d'actions la consomme. */
export interface ActionsInterdites {
  /** Règles d'appariement du canal texte. */
  appariement: { seuilPrefixe: number };
  /** Canal TEXTE : catégorie de risque → langue → motifs (langage humain). */
  motifsTexte: Record<string, Record<string, string[]>>;
  /** Canal URL et IDENTIFIANT : verbes destructifs sans ambiguïté, appariés par token exact. */
  motifsUrl: string[];
  /** Catégories de `motifsTexte` qui restent interdites même en mode sandbox (usage futur). */
  exceptionsSandbox: string[];
  /** Attributs portant du langage humain, confrontés à `motifsTexte`. */
  attributsTexte: string[];
  /** Attributs de nommage lus sur les descendants du déclencheur (bouton-icône), confrontés à `motifsTexte`. */
  attributsDescendantsExamines: string[];
  /** Attributs portant une URL de destination, confrontés à `motifsUrl` par segment. */
  attributsUrl: string[];
  /** Attributs portant un identifiant technique, confrontés à `motifsUrl` par token. */
  attributsIdentifiants: string[];
  texteVisibleExamine: boolean;
}

/** Vocabulaire fermé du profil et réglages de l'appel (config/profilage.json). */
export interface ConfigProfilage {
  typesSite: string[];
  valeurEchappement: string;
  contexteMaxChars: number;
  /** Plafond de CHAQUE en-tête du bloc de données (titre, chaque métadonnée). */
  enTeteMaxChars: number;
  maxTokensReponse: number;
  relancesMax: number;
  facteurConfianceApresRelance: number;
  varianceAppels: number;
}

export const FICHIER_CONFIG_SCANNER = depuisRacine('config', 'scanner.json');
export const FICHIER_CONFIG_PROFILAGE = depuisRacine('config', 'profilage.json');
export const FICHIER_ACTIONS_INTERDITES = depuisRacine('config', 'actions-interdites.json');

async function chargerValide<T>(fichier: string, schema: string, nom: string): Promise<T> {
  const [schemaJson, contenu] = await Promise.all([chargerSchema(schema), readFile(fichier, 'utf8')]);
  return valider<T>(schemaJson, JSON.parse(contenu), nom);
}

export async function chargerConfigScanner(fichier: string = FICHIER_CONFIG_SCANNER): Promise<ConfigScanner> {
  return chargerValide<ConfigScanner>(fichier, depuisRacine('config', 'scanner.schema.json'), 'config/scanner.json');
}

export async function chargerConfigProfilage(fichier: string = FICHIER_CONFIG_PROFILAGE): Promise<ConfigProfilage> {
  return chargerValide<ConfigProfilage>(fichier, depuisRacine('config', 'profilage.schema.json'), 'config/profilage.json');
}

export async function chargerActionsInterdites(
  fichier: string = FICHIER_ACTIONS_INTERDITES,
): Promise<ActionsInterdites> {
  return chargerValide<ActionsInterdites>(
    fichier,
    depuisRacine('config', 'actions-interdites.schema.json'),
    'config/actions-interdites.json',
  );
}
