/**
 * Orchestration d'une RÉDACTION : appel, validation, relance structurelle,
 * estampille de provenance.
 *
 * Ce module ne connaît ni le SDK ni les cassettes : il reçoit une fonction
 * d'appel. C'est ce qui permet d'éprouver la relance — et le rejet d'une prose
 * chiffrée — sans le moindre réseau.
 *
 * ── CE QUE LES BRIQUES PRÉCÉDENTES APPORTENT TEL QUEL ───────────────────────
 *
 * La validation Ajv (`schema-redaction.ts`), la relance qui repart des données
 * d'origine sans jamais recopier la réponse fautive, le dépôt de cassettes et
 * sa garde à deux diagnostics, le client rejouable (`cassettes.ts`). Une
 * seconde copie de ces mécaniques dériverait, et c'est la première qui porte
 * la garde réseau.
 *
 * ── CE QUI EST PROPRE À CETTE BRIQUE ────────────────────────────────────────
 *
 * L'échec n'y est pas une panne : relances épuisées, le rapport est
 * STRUCTUREL. Il garde ses sections, ses statuts, ses localisations et son
 * compte de signalements écartés — il perd ses phrases. C'est le mode dégradé
 * de la constitution §4 appliqué à la dernière étape : le moteur reste utile
 * sans IA, et c'est le seul endroit du produit où l'absence de modèle se voit
 * à l'œil nu.
 */
import { VERSION, construirePromptRedaction, type PromptRedaction } from '../../prompts/redaction/v1.js';
import type { ConfigRapport } from '../scanner/config.js';
import type { ContexteRedaction } from './index.js';
import {
  RAISON_AUCUNE_SECTION_MONTREE,
  RAISON_REDACTION_INVALIDE,
  type RedactionEstampillee,
  type ReponseBrute,
  type ResultatIa,
} from './index.js';
import type { ResultatAppel } from './profilage.js';
import type { ValidateurRedaction } from './schema-redaction.js';
import { resumerConstats, type ConstatInvalidite } from './schema-profil.js';

/**
 * Un appel de rédaction. Le schéma de contrat est DÉRIVÉ de l'énumération des
 * sections, comme celui d'une décision : il est donc passé à l'appel plutôt
 * qu'allé chercher par la couche SDK.
 */
export type AppelRedaction = (
  prompt: PromptRedaction,
  schemaContratModele: Record<string, unknown>,
) => Promise<ResultatAppel>;

export interface ParametresRedaction {
  /** Contexte déjà NORMALISÉ : le même que celui qui entre dans la clé de cassette. */
  contexte: ContexteRedaction;
  config: ConfigRapport;
  validateur: ValidateurRedaction;
  appeler: AppelRedaction;
}

/**
 * Produit la réponse BRUTE retenue (celle qui valide le contrat), son coût
 * cumulé et le fait qu'une relance ait été nécessaire.
 *
 * Boucle : 1 appel + au plus `relancesMax` relances. Chaque relance repart des
 * DONNÉES D'ORIGINE plus un constat d'invalidité structurel ; la réponse
 * fautive n'entre jamais dans le prompt suivant — elle est précisément celle
 * qu'un chemin d'URL vient peut-être de dicter.
 *
 * Un échec d'appel (réseau, quota, refus, plafond) n'est PAS une invalidité de
 * contrat : il arrête immédiatement, sans brûler la relance à réessayer ce que
 * le modèle n'a pas eu l'occasion de mal faire.
 */
export async function redigerBrutAvec(parametres: ParametresRedaction): Promise<ResultatIa<ReponseBrute>> {
  const { contexte, config, validateur, appeler } = parametres;

  // RIEN À MONTRER, RIEN À PAYER. Quand aucune section ne tient dans le
  // plafond du bloc factuel, l'énumération est vide et le contrat n'admet
  // aucun identifiant : l'appel ne peut QUE échouer. Le faire quand même
  // dépenserait pour un résultat impossible — et un coût engagé pour rien se
  // présente comme une tentative (APPRENTISSAGES n°3).
  if (contexte.sections.length === 0) {
    return { disponible: false, raison: RAISON_AUCUNE_SECTION_MONTREE, coutApi: 0 };
  }

  let constats: ConstatInvalidite[] = [];
  let coutCumule = 0;

  for (let tentative = 0; tentative <= config.relancesMax; tentative += 1) {
    const prompt = construirePromptRedaction(contexte, constats);
    const appel = await appeler(prompt, validateur.schemaContratModele);
    coutCumule += appel.coutApi ?? 0;
    if (!appel.ok) {
      return { disponible: false, raison: appel.raison, message: appel.message, coutApi: coutCumule };
    }
    const validation = validateur.valider(appel.texte);
    if (validation.valide) {
      return {
        disponible: true,
        // Le modèle servi est celui de l'appel RETENU : si une relance a eu
        // lieu, c'est elle qui a produit la réponse qu'on garde.
        valeur: {
          texte: appel.texte,
          coutApi: coutCumule,
          apresRelance: tentative > 0,
          modeleServi: appel.modeleServi,
        },
        coutApi: coutCumule,
      };
    }
    constats = validation.constats;
  }

  // Relances épuisées : pas de prose, journalisé, jamais une exception qui tue
  // le scan. Le rapport structurel reste publié. Le coût dépensé reste
  // visible : un coût invisible ment (APPRENTISSAGES n°3).
  return {
    disponible: false,
    raison: RAISON_REDACTION_INVALIDE,
    message: resumerConstats(VERSION, constats),
    coutApi: coutCumule,
  };
}

/**
 * Transforme une réponse brute (fraîche ou rejouée depuis une cassette) en
 * rédaction ESTAMPILLÉE.
 *
 * La validation est refaite des DEUX côtés du rejeu, et le validateur est
 * construit sur l'énumération DU MOMENT : une cassette dont les identifiants
 * de section ne correspondent plus au rapport courant est rejetée au rejeu
 * comme elle l'aurait été à chaud. L'instrument de mesure ne s'accorde aucune
 * tolérance que la production n'a pas.
 */
export function redactionDepuisReponse(parametres: {
  texte: string;
  validateur: ValidateurRedaction;
  /** Alias demandé (config) : connu avant l'appel, donc stable. */
  modeleDemande: string;
  /** Forme résolue extraite de la réponse réelle, ou rejouée depuis la cassette. */
  modeleServi: string;
  apresRelance: boolean;
  coutApi: number;
}): ResultatIa<RedactionEstampillee> {
  const { texte, validateur, modeleDemande, modeleServi, apresRelance, coutApi } = parametres;
  const validation = validateur.valider(texte);
  if (!validation.valide) {
    return {
      disponible: false,
      raison: RAISON_REDACTION_INVALIDE,
      message: resumerConstats(VERSION, validation.constats),
      coutApi,
    };
  }
  return {
    disponible: true,
    valeur: {
      ...validation.valeur,
      // Provenance TROIS CHAMPS, apposée en code et jamais demandée au modèle.
      provenance: { versionPrompt: VERSION, modeleDemande, modeleServi, apresRelance },
    },
    coutApi,
  };
}
