/**
 * Orchestration d'un profilage : appel, validation, relance unique,
 * plafonnement de la confiance.
 *
 * Ce module ne connaît ni le SDK ni les cassettes : il reçoit une fonction
 * d'appel. C'est ce qui permet d'éprouver la relance — le point le plus
 * sensible de la brique — sans le moindre réseau.
 */
import { createHash } from 'node:crypto';
import type { ConfigProfilage } from '../scanner/config.js';
import { construirePromptProfilage, VERSION, type PromptProfilage } from '../../prompts/profilage/v1.js';
import type { ContexteProfilage, ProfilPage, ReponseBrute, ResultatIa } from './index.js';
import { RAISON_PROFIL_INVALIDE } from './index.js';
import { resumerConstats as resumerConstatsAvecVersion } from './schema-profil.js';
import type { ConstatInvalidite, ValidateurProfil } from './schema-profil.js';

/**
 * Empreinte des réglages de config qui composent l'APPEL — le texte du prompt,
 * le contrat de sortie, le budget de génération.
 *
 * `VERSION` ne protège que le fichier du prompt. Or la moitié de ce prompt vit
 * en config : `config/profilage.json` invite explicitement à étendre le
 * vocabulaire (« ajouter un type de site ici suffit »), et cela change les
 * instructions système, l'énumération du contrat de sortie ET le schéma envoyé
 * au modèle — sans changer une ligne de `prompts/profilage/v1.ts`. Une clé
 * aveugle à ces valeurs rejouerait une réponse produite sous un AUTRE contrat :
 * la bonne réponse du mauvais prompt, le fantôme de seconde espèce de
 * l'annexe A, pris par l'autre bout.
 *
 * La liste est VOLONTAIREMENT courte. `relancesMax`,
 * `facteurConfianceApresRelance` et `varianceAppels` n'entrent ni dans le
 * prompt ni dans l'appel : les inclure périmerait tout le parc au premier
 * réglage d'un facteur de confiance — on remplacerait un mensonge silencieux
 * par une invalidation gratuite. `enTeteMaxChars` en est absent pour une autre
 * raison : il borne le contexte AVANT cette couche, et le contexte assemblé
 * entre déjà dans la clé.
 */
export function empreinteContratProfilage(config: ConfigProfilage): string {
  const entree = JSON.stringify([
    [...config.typesSite],
    config.valeurEchappement,
    config.contexteMaxChars,
    config.maxTokensReponse,
  ]);
  return createHash('sha256').update(entree, 'utf8').digest('hex');
}

/** Un appel au modèle : rend le TEXTE brut de la réponse et ce qu'il a coûté. */
export type AppelModele = (prompt: PromptProfilage) => Promise<ResultatAppel>;

export type ResultatAppel =
  | { ok: true; texte: string; coutApi: number; modeleServi: string }
  | { ok: false; raison: string; message?: string; coutApi?: number };

export interface ParametresProfilage {
  contexte: ContexteProfilage;
  config: ConfigProfilage;
  validateur: ValidateurProfil;
  appeler: AppelModele;
}

/**
 * Produit la réponse BRUTE retenue (celle qui valide le contrat), son coût
 * cumulé et le fait qu'une relance ait été nécessaire.
 *
 * Boucle : 1 appel + au plus `relancesMax` relances. Chaque relance repart
 * des DONNÉES D'ORIGINE plus un constat d'invalidité structurel ; la réponse
 * fautive n'entre jamais dans le prompt suivant (voir `blocRelance` dans
 * `prompts/profilage/v1.ts`).
 *
 * Un échec d'appel (réseau, quota, refus) n'est PAS une invalidité de
 * schéma : il arrête immédiatement, sans brûler la relance à réessayer ce
 * que le modèle n'a pas eu l'occasion de mal faire.
 */
export async function profilerBrutAvec(parametres: ParametresProfilage): Promise<ResultatIa<ReponseBrute>> {
  const { contexte, config, validateur, appeler } = parametres;
  let constats: ConstatInvalidite[] = [];
  let coutCumule = 0;

  for (let tentative = 0; tentative <= config.relancesMax; tentative += 1) {
    const prompt = construirePromptProfilage(contexte, config, constats);
    const appel = await appeler(prompt);
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
        valeur: { texte: appel.texte, coutApi: coutCumule, apresRelance: tentative > 0, modeleServi: appel.modeleServi },
        coutApi: coutCumule,
      };
    }
    constats = validation.constats;
  }

  // Relances épuisées : mode dégradé journalisé, jamais une exception qui
  // tue le scan. Le coût dépensé reste visible — un coût invisible ment.
  return {
    disponible: false,
    raison: RAISON_PROFIL_INVALIDE,
    message: resumerConstatsAvecVersion(VERSION, constats),
    coutApi: coutCumule,
  };
}

/**
 * Transforme une réponse brute (fraîche ou rejouée depuis une cassette) en
 * `ProfilPage` estampillé.
 *
 * Deux invariants s'appliquent ici, et nulle part ailleurs :
 *  - la confiance reste dans [0, 1] — borne que le produit ne franchit
 *    jamais, donc en code et non en config ;
 *  - une confiance obtenue APRÈS relance est multipliée par
 *    `facteurConfianceApresRelance` (< 1, garanti par le schéma de config) :
 *    le doute ne monte jamais la confiance.
 */
export function profilDepuisReponse(parametres: {
  texte: string;
  validateur: ValidateurProfil;
  config: ConfigProfilage;
  /** Alias demandé (config) : connu avant l'appel, donc stable. */
  modeleDemande: string;
  /** Forme résolue extraite de la réponse réelle, ou rejouée depuis la cassette. */
  modeleServi: string;
  apresRelance: boolean;
  coutApi: number;
}): ResultatIa<ProfilPage> {
  const { texte, validateur, config, modeleDemande, modeleServi, apresRelance, coutApi } = parametres;
  const validation = validateur.valider(texte);
  if (!validation.valide) {
    return {
      disponible: false,
      raison: RAISON_PROFIL_INVALIDE,
      message: resumerConstatsAvecVersion(VERSION, validation.constats),
      coutApi,
    };
  }
  const brute = borner(validation.valeur.confiance);
  const confiance = apresRelance ? borner(brute * config.facteurConfianceApresRelance) : brute;
  return {
    disponible: true,
    valeur: { ...validation.valeur, confiance, versionPrompt: VERSION, modeleDemande, modeleServi, apresRelance },
    coutApi,
  };
}

/** Invariant : une confiance vit dans [0, 1], quoi qu'en dise le modèle. */
function borner(valeur: number): number {
  return Math.min(1, Math.max(0, valeur));
}
