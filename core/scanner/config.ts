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
    };
    inerte: { confiance: number; gravite: Gravite };
    echecMuet: { confiance: number; gravite: Gravite; typesRequete: string[] };
    lenteur: { seuilMs: number; paliers: PalierConfiance[]; gravite: Gravite };
    image: { confianceSignalSimple: number; confianceSignalDouble: number; gravite: Gravite };
    recouvrement: { confianceGeometrie: number; confianceGeometrieEtClic: number; gravite: Gravite };
  };
  ia: { variableCle: string; modeles: { navigation: string; diagnostic: string; redaction: string } };
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

export const FICHIER_CONFIG_SCANNER = depuisRacine('config', 'scanner.json');
export const FICHIER_ACTIONS_INTERDITES = depuisRacine('config', 'actions-interdites.json');

async function chargerValide<T>(fichier: string, schema: string, nom: string): Promise<T> {
  const [schemaJson, contenu] = await Promise.all([chargerSchema(schema), readFile(fichier, 'utf8')]);
  return valider<T>(schemaJson, JSON.parse(contenu), nom);
}

export async function chargerConfigScanner(fichier: string = FICHIER_CONFIG_SCANNER): Promise<ConfigScanner> {
  return chargerValide<ConfigScanner>(fichier, depuisRacine('config', 'scanner.schema.json'), 'config/scanner.json');
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
