/**
 * Orchestration d'une décision de navigation : appel, validation de
 * l'élection, relance structurelle, estampille de provenance.
 *
 * Ce module ne connaît ni le SDK ni les cassettes : il reçoit une fonction
 * d'appel. C'est ce qui permet d'éprouver la relance — et le cas « identifiant
 * hors menu », qui est le point de sécurité de la brique — sans le moindre
 * réseau.
 *
 * Ce que la brique 4a apporte tel quel, et qui n'est pas réécrit ici : la
 * validation Ajv (`schema-decision.ts`), la relance qui repart des données
 * d'origine sans jamais recopier la réponse fautive, le dépôt de cassettes et
 * sa garde à deux diagnostics, le client rejouable (`cassettes.ts`).
 *
 * Ce que 4a apporte et qui N'A PAS D'OBJET ici : le plafonnement de confiance.
 * Une élection n'a pas de degré — le contrat de sortie d'une décision ne porte
 * aucune confiance, et en inventer une serait fabriquer un chiffre que rien ne
 * mesure. Le doute d'une réponse obtenue après relance reste néanmoins VISIBLE,
 * par `apresRelance` dans la provenance : il voyage jusqu'au rapport au lieu
 * d'être absorbé dans un nombre.
 */
import type { PromptNavigation } from '../../prompts/navigation/v2.js';
import { VERSION, construirePromptNavigation } from '../../prompts/navigation/v2.js';
import type { ConfigNavigation } from './config-navigation.js';
import type { EtatNormalise } from './etat-decision.js';
import type { DecisionEstampillee, ReponseBrute, ResultatIa } from './index.js';
import type { ResultatAppel } from './profilage.js';
import { raisonInvaliditeDecision, type ValidateurDecision } from './schema-decision.js';
import { resumerConstats, type ConstatInvalidite } from './schema-profil.js';

/**
 * Un appel de décision. Le schéma de contrat est passé à chaque appel, et non
 * capturé une fois pour toutes comme au profilage : il est DÉRIVÉ de
 * l'énumération, donc il change à chaque point de décision.
 */
export type AppelDecision = (
  prompt: PromptNavigation,
  schemaContratModele: Record<string, unknown>,
) => Promise<ResultatAppel>;

export interface ParametresDecision {
  /** État déjà NORMALISÉ : le même que celui qui entre dans la clé de cassette. */
  etat: EtatNormalise;
  config: ConfigNavigation;
  validateur: ValidateurDecision;
  appeler: AppelDecision;
}

/**
 * Produit la réponse BRUTE retenue (celle qui valide le contrat), son coût
 * cumulé et le fait qu'une relance ait été nécessaire.
 *
 * Boucle : 1 appel + au plus `relancesMax` relances. Chaque relance repart des
 * DONNÉES D'ORIGINE plus un constat d'invalidité structurel ; la réponse
 * fautive n'entre jamais dans le prompt suivant. Ce n'est pas une élégance :
 * sur cette brique, la réponse fautive est précisément celle qu'un libellé de
 * page vient peut-être de dicter (S03), et la recopier réinjecterait l'attaque
 * dans le tour suivant.
 *
 * Un échec d'appel (réseau, quota, refus, plafond) n'est PAS une invalidité de
 * contrat : il arrête immédiatement, sans brûler la relance à réessayer ce que
 * le modèle n'a pas eu l'occasion de mal faire.
 */
export async function deciderBrutAvec(parametres: ParametresDecision): Promise<ResultatIa<ReponseBrute>> {
  const { etat, config, validateur, appeler } = parametres;
  let constats: ConstatInvalidite[] = [];
  let coutCumule = 0;

  for (let tentative = 0; tentative <= config.relancesMax; tentative += 1) {
    const prompt = construirePromptNavigation(etat, config, constats);
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

  // Relances épuisées : indisponibilité journalisée, jamais une exception qui
  // tue le scan — le repli PAR DÉCISION prend le relais et l'exploration
  // continue. Le coût dépensé reste visible : un coût invisible ment.
  return {
    disponible: false,
    raison: raisonInvaliditeDecision(constats),
    message: resumerConstats(VERSION, constats),
    coutApi: coutCumule,
  };
}

/**
 * Transforme une réponse brute (fraîche ou rejouée depuis une cassette) en
 * décision ESTAMPILLÉE.
 *
 * Le validateur est construit sur l'énumération du moment : une cassette dont
 * l'identifiant élu n'appartient plus au menu est donc rejetée ici, comme une
 * réponse fraîche l'aurait été. C'est la même règle des deux côtés du rejeu —
 * l'instrument de mesure ne s'accorde aucune tolérance que la production n'a
 * pas.
 *
 * `raison` est TERMINALE : elle est recopiée dans la décision et dans la
 * provenance pour être journalisée, et aucune logique de ce dépôt ne la lit.
 */
export function decisionDepuisReponse(parametres: {
  texte: string;
  validateur: ValidateurDecision;
  /** Alias demandé (config) : connu avant l'appel, donc stable. */
  modeleDemande: string;
  /** Forme résolue extraite de la réponse réelle, ou rejouée depuis la cassette. */
  modeleServi: string;
  apresRelance: boolean;
  coutApi: number;
}): ResultatIa<DecisionEstampillee> {
  const { texte, validateur, modeleDemande, modeleServi, apresRelance, coutApi } = parametres;
  const validation = validateur.valider(texte);
  if (!validation.valide) {
    return {
      disponible: false,
      raison: raisonInvaliditeDecision(validation.constats),
      message: resumerConstats(VERSION, validation.constats),
      coutApi,
    };
  }
  const { actionId, raison } = validation.valeur;
  return {
    disponible: true,
    valeur: {
      actionId,
      raison,
      // Provenance TROIS CHAMPS, apposée en code et jamais demandée au modèle :
      // version de prompt, modèle demandé, modèle servi. Plus la prose
      // journalisée, le fait d'une relance, et l'identifiant élu.
      provenance: { versionPrompt: VERSION, modeleDemande, modeleServi, raison, apresRelance, actionId },
    },
    coutApi,
  };
}
