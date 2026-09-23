/**
 * Réglages de la décision de navigation, en DEUX sources qu'il ne faut pas
 * confondre — et c'est pour cela qu'elles sont assemblées ici, explicitement :
 *
 *  - ce que le modèle VOIT est borné par l'exploration (`config/scanner.json`,
 *    `exploration.libelleMaxChars` et `exploration.historiqueMaxActions`) :
 *    ces bornes décrivent l'énumération que le moteur produit, elles existent
 *    même quand aucune IA n'est branchée ;
 *  - ce que l'APPEL coûte et tolère vit dans `config/navigation.json`
 *    (`maxTokensReponse`, `relancesMax`), sur le modèle exact de
 *    `config/profilage.json`.
 *
 * Aucun seuil ne vit en code (constitution §2), et aucune valeur d'action ne
 * vit en configuration : le contrat de sortie est dérivé de l'énumération
 * reçue à chaque décision.
 */
import { readFile } from 'node:fs/promises';
import { depuisRacine } from '../outils/racine.js';
import { chargerSchema, valider } from '../outils/schema.js';
import type { ConfigScanner } from '../scanner/config.js';

/** Ce que `config/navigation.json` porte : le budget de l'appel, rien d'autre. */
export interface ConfigAppelNavigation {
  /** Plafond de génération d'une décision (une élection, pas une rédaction). */
  maxTokensReponse: number;
  /** Relances autorisées sur une réponse hors contrat ; au-delà, repli par décision. */
  relancesMax: number;
}

/**
 * Les bornes de l'énumération, lues dans la config d'exploration. Un `Pick`
 * plutôt qu'une redéclaration : si le contrat d'exploration change, le
 * compilateur le dira ici.
 */
export type BornesEnumeration = Pick<ConfigScanner['exploration'], 'libelleMaxChars' | 'historiqueMaxActions'>;

/** Les deux sources assemblées : tout ce dont le prompt et l'appel ont besoin. */
export interface ConfigNavigation extends ConfigAppelNavigation, BornesEnumeration {}

export const FICHIER_CONFIG_NAVIGATION = depuisRacine('config', 'navigation.json');
const SCHEMA_CONFIG_NAVIGATION = depuisRacine('config', 'navigation.schema.json');

export async function chargerConfigAppelNavigation(
  fichier: string = FICHIER_CONFIG_NAVIGATION,
): Promise<ConfigAppelNavigation> {
  const [schema, contenu] = await Promise.all([chargerSchema(SCHEMA_CONFIG_NAVIGATION), readFile(fichier, 'utf8')]);
  return valider<ConfigAppelNavigation>(schema, JSON.parse(contenu), 'config/navigation.json');
}

/**
 * Assemble les deux sources. Les champs sont repris UN À UN, jamais par
 * étalement de la config d'exploration entière : l'empreinte de contrat qui
 * entre dans la clé de cassette (`empreinteContratNavigation`) doit couvrir
 * exactement ce qui compose le prompt et l'appel, ni plus — sinon régler un
 * délai de stabilisation périmerait tout le parc de cassettes.
 */
export function assemblerConfigNavigation(
  appel: ConfigAppelNavigation,
  bornes: BornesEnumeration,
): ConfigNavigation {
  return {
    libelleMaxChars: bornes.libelleMaxChars,
    historiqueMaxActions: bornes.historiqueMaxActions,
    maxTokensReponse: appel.maxTokensReponse,
    relancesMax: appel.relancesMax,
  };
}

/** Raccourci d'assemblage pour les appelants qui ont déjà la config d'exploration. */
export async function chargerConfigNavigation(
  bornes: BornesEnumeration,
  fichier: string = FICHIER_CONFIG_NAVIGATION,
): Promise<ConfigNavigation> {
  return assemblerConfigNavigation(await chargerConfigAppelNavigation(fichier), bornes);
}
