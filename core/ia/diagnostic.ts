/**
 * Orchestration d'un auto-diagnostic : appel, validation de l'avis, relance
 * structurelle, estampille de provenance.
 *
 * Ce module ne connaît ni le SDK ni les cassettes : il reçoit une fonction
 * d'appel. C'est ce qui permet d'éprouver la relance — et le cas « avis hors
 * énumération » — sans le moindre réseau.
 *
 * ── CE QUE 4a ET 4b APPORTENT TEL QUEL, ET QUI N'EST PAS RÉÉCRIT ICI ────────
 *
 * La validation Ajv (`schema-diagnostic.ts`), la relance qui repart des
 * données d'origine sans jamais recopier la réponse fautive, le dépôt de
 * cassettes et sa garde à deux diagnostics, le client rejouable
 * (`cassettes.ts`). Une seconde copie de ces mécaniques dériverait, et c'est
 * la première qui porte la garde réseau.
 *
 * ── CE QUE LES BRIQUES PRÉCÉDENTES APPORTENT ET QUI N'A PAS D'OBJET ICI ─────
 *
 * Le plafonnement de confiance. Le contrat d'un diagnostic ne porte AUCUNE
 * confiance : on ne demande pas au modèle de chiffrer sa propre certitude,
 * parce que ce serait fabriquer un nombre que rien ne mesure. La minoration
 * existe bel et bien pour cette brique — `facteurConfianceDecouverte` —, mais
 * elle s'applique à la confiance du DÉTECTEUR, pas à une confiance du modèle,
 * et elle vit donc dans la table de traduction, en aval. Ici, le doute reste
 * visible par `apresRelance` dans la provenance : il voyage jusqu'au journal
 * au lieu d'être absorbé dans un nombre.
 *
 * ── `indetermine` N'EST TRAITÉ NULLE PART COMME UNE ERREUR ──────────────────
 *
 * Aucune ligne de ce module ne nomme un avis. Le résultat d'un `indetermine`
 * valide est, caractère pour caractère, de la même forme que celui d'un
 * `outil` ou d'un `site` valide : `disponible: true`, avec sa provenance et sa
 * justification. L'aveu est une réponse, pas une panne.
 */
import { VERSION, construirePromptDiagnostic, type PromptDiagnostic } from '../../prompts/diagnostic/v1.js';
import type { ConfigDiagnostic } from '../scanner/config.js';
import type { ContexteDiagnosticNormalise } from './contexte-diagnostic.js';
import { RAISON_DIAGNOSTIC_INVALIDE, type DiagnosticEstampille, type ReponseBrute, type ResultatIa } from './index.js';
import type { ResultatAppel } from './profilage.js';
import type { ValidateurDiagnostic } from './schema-diagnostic.js';
import { resumerConstats, type ConstatInvalidite } from './schema-profil.js';

/**
 * Un appel de diagnostic. Le schéma de contrat est fixe (il ne dépend d'aucune
 * énumération du moment, contrairement à la navigation), mais il est passé à
 * l'appel comme ailleurs : c'est la couche SDK qui décide de ce qu'elle en
 * fait, et elle n'a pas à aller le chercher.
 */
export type AppelDiagnostic = (
  prompt: PromptDiagnostic,
  schemaContratModele: Record<string, unknown>,
) => Promise<ResultatAppel>;

export interface ParametresDiagnostic {
  /** Contexte déjà NORMALISÉ : le même que celui qui entre dans la clé de cassette. */
  contexte: ContexteDiagnosticNormalise;
  config: ConfigDiagnostic;
  validateur: ValidateurDiagnostic;
  appeler: AppelDiagnostic;
}

/**
 * Produit la réponse BRUTE retenue (celle qui valide le contrat), son coût
 * cumulé et le fait qu'une relance ait été nécessaire.
 *
 * Boucle : 1 appel + au plus `relancesMax` relances. Chaque relance repart des
 * DONNÉES D'ORIGINE plus un constat d'invalidité structurel ; la réponse
 * fautive n'entre jamais dans le prompt suivant. Ce n'est pas une élégance :
 * le bloc de données est un journal qui transporte des chaînes de la page, et
 * la réponse fautive est précisément celle qu'un extrait vient peut-être de
 * dicter — la recopier réinjecterait l'attaque dans le tour suivant.
 *
 * Un échec d'appel (réseau, quota, refus, plafond) n'est PAS une invalidité de
 * contrat : il arrête immédiatement, sans brûler la relance à réessayer ce que
 * le modèle n'a pas eu l'occasion de mal faire.
 */
export async function diagnostiquerBrutAvec(parametres: ParametresDiagnostic): Promise<ResultatIa<ReponseBrute>> {
  const { contexte, config, validateur, appeler } = parametres;
  let constats: ConstatInvalidite[] = [];
  let coutCumule = 0;

  for (let tentative = 0; tentative <= config.relancesMax; tentative += 1) {
    const prompt = construirePromptDiagnostic(contexte, constats);
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

  // Relances épuisées : pas d'avis, journalisé, jamais une exception qui tue le
  // scan — le moteur retombe sur le SILENCE d'avant la brique, qui est son
  // comportement nominal en l'absence de diagnostic. Le coût dépensé reste
  // visible : un coût invisible ment.
  return {
    disponible: false,
    raison: RAISON_DIAGNOSTIC_INVALIDE,
    message: resumerConstats(VERSION, constats),
    coutApi: coutCumule,
  };
}

/**
 * Transforme une réponse brute (fraîche ou rejouée depuis une cassette) en
 * diagnostic ESTAMPILLÉ.
 *
 * La validation est refaite des DEUX côtés du rejeu : une cassette dont l'avis
 * ne fait plus partie du contrat est rejetée ici, comme une réponse fraîche
 * l'aurait été. L'instrument de mesure ne s'accorde aucune tolérance que la
 * production n'a pas.
 *
 * `justification` est TERMINALE : elle est recopiée dans le diagnostic pour
 * être journalisée, et aucune logique de ce dépôt ne la lit — ni ici, ni dans
 * la table de traduction, ni dans le rapport.
 */
export function diagnosticDepuisReponse(parametres: {
  texte: string;
  validateur: ValidateurDiagnostic;
  /** Alias demandé (config) : connu avant l'appel, donc stable. */
  modeleDemande: string;
  /** Forme résolue extraite de la réponse réelle, ou rejouée depuis la cassette. */
  modeleServi: string;
  apresRelance: boolean;
  coutApi: number;
}): ResultatIa<DiagnosticEstampille> {
  const { texte, validateur, modeleDemande, modeleServi, apresRelance, coutApi } = parametres;
  const validation = validateur.valider(texte);
  if (!validation.valide) {
    return {
      disponible: false,
      raison: RAISON_DIAGNOSTIC_INVALIDE,
      message: resumerConstats(VERSION, validation.constats),
      coutApi,
    };
  }
  const { avis, justification } = validation.valeur;
  return {
    disponible: true,
    valeur: {
      avis,
      justification,
      // Provenance TROIS CHAMPS, apposée en code et jamais demandée au modèle :
      // version de prompt, modèle demandé, modèle servi. Plus le drapeau de
      // relance. Elle hérite structurellement du patron (`ProvenanceSortieIa`)
      // au lieu de le répéter : la règle ne peut plus être oubliée, seulement
      // violée en connaissance de cause.
      provenance: { versionPrompt: VERSION, modeleDemande, modeleServi, apresRelance },
    },
    coutApi,
  };
}
