/**
 * Mode rejouable : l'instrument de mesure doit rester déterministe.
 *
 * Un banc qui appelle un modèle à chaque run ne mesure plus le moteur, il
 * mesure l'humeur du modèle. Les cassettes figent la réponse ; le décorateur
 * garantit qu'un run NORMAL ne touche jamais le réseau — cassette absente
 * est une indisponibilité claire nommant la commande à lancer, jamais un
 * appel silencieux.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ConfigProfilage } from '../scanner/config.js';
import { VERSION } from '../../prompts/profilage/v1.js';
import { VERSION as VERSION_NAVIGATION } from '../../prompts/navigation/v2.js';
import { hacherEntree, normaliserUrlPourCle } from './cle.js';
import {
  DIVERGENCE_GLISSEMENT_ALIAS,
  DIVERGENCE_PROMPT_SANS_INCREMENT,
  RAISON_CASSETTE_ABSENTE,
  RAISON_CASSETTE_ILLISIBLE,
  type Cassette,
  type ClientIa,
  type ClientIaEnregistrable,
  type ContexteProfilage,
  type DecisionEstampillee,
  type DepotCassettes,
  type ModeIa,
  type ProfilPage,
  type ReponseBrute,
  type ResultatIa,
} from './index.js';
import type { EtatDecisionEnumere } from '../types.js';
import type { ConfigNavigation } from './config-navigation.js';
import { decisionDepuisReponse } from './decision.js';
import {
  empreinteContratNavigation,
  entreeCleDepuisEtat,
  identifiantsEnumeres,
  normaliserEtatDecision,
  type EtatNormalise,
} from './etat-decision.js';
import { empreinteContratProfilage, profilDepuisReponse } from './profilage.js';
import { creerValidateurDecision } from './schema-decision.js';
import { creerValidateurProfil } from './schema-profil.js';

export { normaliserUrlPourCle };

/**
 * SEUL chemin d'enregistrement, explicite. Le nom vit ici parce que c'est ici
 * qu'on doit le dire à l'utilisateur au moment précis où une cassette manque.
 */
export const COMMANDE_ENREGISTREMENT_IA = 'pnpm banc:enregistrer-ia';

/**
 * Clé de cassette : hash(version du prompt + ALIAS de modèle + entrée
 * normalisée).
 *
 * L'alias, et jamais le modèle servi : la clé doit être calculable AVANT
 * l'appel et rester stable. La forme résolue vit dans les métadonnées.
 *
 * La sérialisation est un TABLEAU à ordre fixe, pas un objet : l'ordre des
 * clés d'un objet est une propriété du code qui le construit, donc une source
 * de dérive silencieuse. Changer le prompt sans incrémenter `VERSION` ne
 * change pas la clé — et c'est exactement ce que la garde d'écriture attrape.
 *
 * `empreinteContrat` couvre l'autre moitié du prompt, celle qui vit en config
 * (`empreinteContratProfilage`) : sans elle, étendre `typesSite` changerait le
 * prompt ET le contrat de sortie sans changer la clé, et la garde d'écriture
 * ne verrait rien puisqu'un run normal rejoue AVANT tout appel.
 */
export function cleCassette(parametres: {
  versionPrompt: string;
  empreinteContrat: string;
  modele: string;
  contexte: ContexteProfilage;
}): string {
  const { versionPrompt, empreinteContrat, modele, contexte } = parametres;
  return hacherEntree([
    versionPrompt,
    empreinteContrat,
    modele,
    normaliserUrlPourCle(contexte.url),
    contexte.texte,
    contexte.langueDeclaree,
  ]);
}

/**
 * Clé d'une cassette de DÉCISION : hash(version du prompt de navigation +
 * empreinte de contrat + ALIAS de modèle + état énuméré NORMALISÉ).
 *
 * Une cassette PAR DÉCISION, et non par scan : c'est le prix du déterminisme
 * d'un instrument qui mesure désormais un chemin, pas un classement.
 *
 * Tout repose sur la normalisation (`normaliserEtatDecision`) : les pages du
 * banc sont déterministes, donc les états le sont, donc les clés doivent
 * l'être. Un état équivalent construit dans un autre ordre — actions
 * énumérées dans un ordre différent, repères écrits dans un autre ordre de
 * clés — donne la MÊME clé, parce que le prompt qu'il produit est le même
 * caractère pour caractère. Une énumération réellement différente en donne une
 * autre, et la cassette manquante est alors un échec BRUYANT, jamais un appel
 * réseau glissé dans une notation.
 */
export function cleCassetteDecision(parametres: {
  versionPrompt: string;
  empreinteContrat: string;
  modele: string;
  etat: EtatNormalise;
}): string {
  const { versionPrompt, empreinteContrat, modele, etat } = parametres;
  return hacherEntree([versionPrompt, empreinteContrat, modele, ...entreeCleDepuisEtat(etat)]);
}

/** Dépôt sur disque : une cassette par fichier, JSON lisible, committé. */
export function depotCassettesFichiers(dossier: string): DepotCassettes {
  const fichier = (cle: string): string => path.join(dossier, `${cle}.json`);

  const lire = async (cle: string): Promise<Cassette | null> => {
    let contenu: string;
    try {
      contenu = await readFile(fichier(cle), 'utf8');
    } catch (erreur) {
      if (estAbsent(erreur)) return null;
      throw erreur;
    }
    const cassette = JSON.parse(contenu) as Cassette;
    if (cassette.cle !== cle || typeof cassette.reponse !== 'string') {
      throw new Error(`cassette ${cle} incohérente avec son nom de fichier`);
    }
    return cassette;
  };

  return {
    lire,

    async ecrire(cassette) {
      await mkdir(dossier, { recursive: true });
      const chemin = fichier(cassette.cle);
      const existante = await lire(cassette.cle);
      if (existante !== null) {
        if (existante.reponse === cassette.reponse) return; // Rien à réécrire : la cassette committée reste stable.
        throw new Error(diagnostiquerDivergence(existante, cassette));
      }
      await writeFile(chemin, `${JSON.stringify(cassette, null, 2)}\n`, 'utf8');
    },
  };
}

/**
 * Nomme la VRAIE cause d'une divergence de cassette.
 *
 * Le modèle SERVI sépare les deux familles de causes :
 *  - modèles servis DIFFÉRENTS : l'alias a glissé vers un autre instantané ;
 *    le parc est à renouveler, et le versionnement du prompt n'y est pour rien ;
 *  - modèles servis IDENTIQUES : le prompt a été modifié sans incrément de
 *    version (le défaut d'origine, constitution §6) — ou le même modèle a
 *    simplement répondu autrement, puisqu'un modèle n'est pas déterministe.
 *    Le message NOMME les deux : à ce stade, la garde ne peut pas trancher, et
 *    prétendre le contraire serait le défaut qu'elle existe pour éviter.
 *
 * Une garde qui accuse le mauvais coupable est pire qu'une garde absente :
 * elle envoie corriger ce qui fonctionne (APPRENTISSAGES n°6). D'où la
 * comparaison, et deux identifiants stables que le message porte tels quels.
 */
export function diagnostiquerDivergence(existante: Cassette, nouvelle: Cassette): string {
  const servieAvant = existante.metadonnees.modeleServi;
  const servieMaintenant = nouvelle.metadonnees.modeleServi;
  const entete =
    `cassette ${nouvelle.cle} : une réponse DIFFÉRENTE existe déjà ` +
    `(prompt ${existante.metadonnees.versionPrompt}, alias ${existante.metadonnees.modeleDemande}).`;
  if (servieAvant === servieMaintenant) {
    return (
      `${entete} ${DIVERGENCE_PROMPT_SANS_INCREMENT} : même modèle servi (${servieAvant}), ` +
      `donc l'alias n'a pas glissé. Deux causes restent possibles et la garde ne les départage pas : ` +
      `un prompt modifié sans incrément de version (incrémente-la), ou la variabilité propre du modèle ` +
      `(supprime alors la cassette sciemment pour la ré-enregistrer).`
    );
  }
  return (
    `${entete} ${DIVERGENCE_GLISSEMENT_ALIAS} : le modèle servi a changé ` +
    `(${servieAvant} → ${servieMaintenant}), donc l'alias pointe vers un autre instantané — ` +
    `le parc de cassettes est à renouveler, ce n'est PAS un défaut de versionnement.`
  );
}

function estAbsent(erreur: unknown): boolean {
  return typeof erreur === 'object' && erreur !== null && (erreur as { code?: unknown }).code === 'ENOENT';
}

/**
 * Ce que le rejeu d'une DÉCISION a besoin de savoir. Champ REQUIS de
 * `OptionsRejeu` — délibérément, pas par commodité.
 *
 * Le contrat de la brique est ADDITIF : rien n'obligeait le compilateur à
 * signaler qu'un client rejouable laissé tel quel ne rejouerait aucune
 * décision. Le rendre requis crée le trou que le typecheck suivra
 * (APPRENTISSAGES n°7) : impossible de câbler la politique IA en oubliant le
 * parc de cassettes qui la rend mesurable.
 */
export interface OptionsDecisionRejeu {
  /** ALIAS du modèle de navigation (`ia.modeles.navigation`) : il entre dans la clé. */
  modele: string;
  config: ConfigNavigation;
}

export interface OptionsRejeu {
  /** true UNIQUEMENT depuis la commande d'enregistrement : c'est le seul mode qui appelle le modèle. */
  enregistrement: boolean;
  /** Modèle attendu : il entre dans la clé, donc changer de modèle change de cassette. */
  modele: string;
  profilage: ConfigProfilage;
  /** Réglages du rejeu des décisions de navigation (brique 4b). */
  decision: OptionsDecisionRejeu;
  journaliser?: (type: string, details?: unknown) => void;
  /** Horloge injectable : la date d'enregistrement est une métadonnée, pas un comportement. */
  maintenant?: () => Date;
}

/**
 * Décorateur de `ClientIa`.
 *
 * Mode NORMAL : cassette présente → rejouée ; absente → indisponible, avec la
 * commande à lancer. Le client décoré n'est PAS appelé — c'est la garde
 * réseau, et elle est éprouvée par un test qui fait exploser la doublure si
 * elle est touchée.
 *
 * Mode ENREGISTREMENT : le modèle est appelé, sa réponse brute est écrite.
 * C'est le SEUL mode où `profiler` peut lever — une écriture divergente doit
 * arrêter la commande d'enregistrement, qui n'est pas un scan.
 */
export function clientRejouable(
  client: ClientIaEnregistrable,
  depot: DepotCassettes,
  options: OptionsRejeu,
): ClientIa {
  const { enregistrement, modele, profilage, decision } = options;
  const journaliser = options.journaliser ?? (() => undefined);
  const maintenant = options.maintenant ?? (() => new Date());
  const validateur = creerValidateurProfil(profilage);
  const empreinteContrat = empreinteContratProfilage(profilage);
  const empreinteNavigation = empreinteContratNavigation(decision.config);

  const enProfil = (cassette: Cassette): ResultatIa<ProfilPage> =>
    profilDepuisReponse({
      texte: cassette.reponse,
      validateur,
      config: profilage,
      // Les DEUX modèles sont rejoués depuis la cassette : un profil rejoué
      // doit dire quel modèle a réellement produit la réponse, pas celui que
      // la config demande aujourd'hui.
      modeleDemande: cassette.metadonnees.modeleDemande,
      modeleServi: cassette.metadonnees.modeleServi,
      apresRelance: cassette.metadonnees.apresRelance,
      coutApi: cassette.metadonnees.coutApi,
    });

  /**
   * Rejeu générique d'une sortie IA : lecture de cassette, rejeu, absence,
   * enregistrement. Le profilage (4a) et la décision (4b) le partagent — même
   * garde réseau, même garde d'écriture, mêmes événements de journal. Les
   * mécaniques de 4a sont RÉUTILISÉES, pas réécrites : une seconde copie
   * dériverait, et c'est la première qui porte la garde réseau.
   */
  async function rejouer<T>(parametres: {
    cle: string;
    modele: string;
    versionPrompt: string;
    /** Transforme une cassette (rejouée ou fraîche) en valeur métier estampillée. */
    enValeur: (cassette: Cassette) => ResultatIa<T>;
    /** N'est appelé QUE par le mode enregistrement : c'est le seul chemin réseau. */
    appelerBrut: () => Promise<ResultatIa<ReponseBrute>>;
  }): Promise<ResultatIa<T>> {
    const { cle, modele: alias, versionPrompt, enValeur, appelerBrut } = parametres;
    let cassette: Cassette | null;
    try {
      cassette = await depot.lire(cle);
    } catch (erreur) {
      // Une cassette corrompue doit être BRUYANTE au journal, mais ne tue
      // jamais un scan : le moteur continue sans IA.
      journaliser('ia.cassette.illisible', { cle, erreur: String(erreur) });
      return { disponible: false, raison: RAISON_CASSETTE_ILLISIBLE, message: `cassette ${cle} illisible` };
    }

    if (cassette !== null) {
      journaliser('ia.cassette.rejouee', {
        cle,
        modeleDemande: cassette.metadonnees.modeleDemande,
        modeleServi: cassette.metadonnees.modeleServi,
        versionPrompt,
      });
      return enValeur(cassette);
    }

    if (!enregistrement) {
      journaliser('ia.cassette.absente', { cle, commande: COMMANDE_ENREGISTREMENT_IA });
      return {
        disponible: false,
        raison: RAISON_CASSETTE_ABSENTE,
        message: `aucune cassette ${cle} (prompt ${versionPrompt}, modèle ${alias}) ; lance ${COMMANDE_ENREGISTREMENT_IA}`,
      };
    }

    const brut = await appelerBrut();
    if (!brut.disponible) {
      journaliser('ia.enregistrement.echec', { cle, raison: brut.raison, message: brut.message });
      return brut;
    }
    const enregistree: Cassette = {
      cle,
      metadonnees: {
        date: maintenant().toISOString(),
        modeleDemande: alias,
        modeleServi: brut.valeur.modeleServi,
        versionPrompt,
        coutApi: brut.valeur.coutApi,
        apresRelance: brut.valeur.apresRelance,
      },
      reponse: brut.valeur.texte,
    };
    await depot.ecrire(enregistree);
    journaliser('ia.cassette.enregistree', {
      cle,
      coutApi: brut.valeur.coutApi,
      modeleDemande: alias,
      modeleServi: brut.valeur.modeleServi,
    });
    return enValeur(enregistree);
  }

  // Le MODE d'un client rejouable est celui de ce qu'il peut RÉELLEMENT
  // servir, et non celui du client qu'il décore.
  //
  // En REJEU pur (`enregistrement: false`), la capacité, c'est le DÉPÔT : le
  // client décoré n'est jamais appelé pour `profiler` ni `decider`, et une
  // cassette manquante devient une indisponibilité PAR APPEL — bruyante,
  // nommée, et rattrapée par le repli. Recopier ici le mode du client décoré
  // ferait dire au moteur « l'IA est indisponible d'emblée » alors que tout le
  // parc est là. Sans conséquence tant que personne ne lisait `mode` ; depuis
  // la brique 4b, c'est lui qui décide de la politique de navigation, et un
  // scan entier basculerait en déterministe sans qu'aucune cassette n'ait
  // manqué : une mesure verte du comportement par défaut publiée sous
  // l'étiquette de l'autre politique — le diagnostic faux de
  // l'apprentissage n°6, exactement.
  //
  // En ENREGISTREMENT, le réseau est le chemin nominal : le mode reste celui
  // du client concret (pas de clé, pas d'enregistrement possible).
  const mode: ModeIa = enregistrement ? client.mode : 'actif';
  const raisonDegrade = enregistrement ? client.raisonDegrade : null;

  return {
    mode,
    raisonDegrade,
    diagnostiquer: client.diagnostiquer.bind(client),
    rediger: client.rediger.bind(client),

    profiler: (contexte) =>
      rejouer({
        cle: cleCassette({ versionPrompt: VERSION, empreinteContrat, modele, contexte }),
        modele,
        versionPrompt: VERSION,
        enValeur: enProfil,
        appelerBrut: () => client.profilerBrut(contexte),
      }),

    /**
     * Une cassette PAR DÉCISION.
     *
     * Deux choses se jouent ici. D'abord la clé : elle est calculée sur l'état
     * NORMALISÉ, celui-là même qui sera affiché au modèle — une cassette ne
     * peut donc pas être rejouée sur un prompt voisin.
     *
     * Ensuite le validateur, construit sur l'énumération DU MOMENT et non sur
     * celle qui régnait à l'enregistrement : une réponse figée dont
     * l'identifiant n'appartient plus au menu est rejetée au rejeu comme elle
     * l'aurait été à chaud. Le rejeu ne s'accorde aucune tolérance que la
     * production n'a pas — sans quoi l'instrument mesurerait un moteur plus
     * permissif que le vrai.
     */
    decider: (etat: EtatDecisionEnumere) => {
      const etatNormalise = normaliserEtatDecision(etat, decision.config);
      const validateurDecision = creerValidateurDecision(identifiantsEnumeres(etatNormalise));
      return rejouer<DecisionEstampillee>({
        cle: cleCassetteDecision({
          versionPrompt: VERSION_NAVIGATION,
          empreinteContrat: empreinteNavigation,
          modele: decision.modele,
          etat: etatNormalise,
        }),
        modele: decision.modele,
        versionPrompt: VERSION_NAVIGATION,
        enValeur: (cassette) =>
          decisionDepuisReponse({
            texte: cassette.reponse,
            validateur: validateurDecision,
            // Les DEUX modèles sont rejoués depuis la cassette : une décision
            // rejouée doit dire quel modèle a réellement produit la réponse,
            // pas celui que la config demande aujourd'hui.
            modeleDemande: cassette.metadonnees.modeleDemande,
            modeleServi: cassette.metadonnees.modeleServi,
            apresRelance: cassette.metadonnees.apresRelance,
            coutApi: cassette.metadonnees.coutApi,
          }),
        appelerBrut: () => client.deciderBrut(etatNormalise),
      });
    },
  };
}
