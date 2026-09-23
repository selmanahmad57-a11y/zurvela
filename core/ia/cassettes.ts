/**
 * Mode rejouable : l'instrument de mesure doit rester déterministe.
 *
 * Un banc qui appelle un modèle à chaque run ne mesure plus le moteur, il
 * mesure l'humeur du modèle. Les cassettes figent la réponse ; le décorateur
 * garantit qu'un run NORMAL ne touche jamais le réseau — cassette absente
 * est une indisponibilité claire nommant la commande à lancer, jamais un
 * appel silencieux.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ConfigProfilage } from '../scanner/config.js';
import { VERSION } from '../../prompts/profilage/v1.js';
import {
  DIVERGENCE_GLISSEMENT_ALIAS,
  DIVERGENCE_PROMPT_SANS_INCREMENT,
  RAISON_CASSETTE_ABSENTE,
  RAISON_CASSETTE_ILLISIBLE,
  type Cassette,
  type ClientIa,
  type ClientIaEnregistrable,
  type ContexteProfilage,
  type DepotCassettes,
  type ProfilPage,
  type ResultatIa,
} from './index.js';
import { empreinteContratProfilage, profilDepuisReponse } from './profilage.js';
import { creerValidateurProfil } from './schema-profil.js';

/**
 * SEUL chemin d'enregistrement, explicite. Le nom vit ici parce que c'est ici
 * qu'on doit le dire à l'utilisateur au moment précis où une cassette manque.
 */
export const COMMANDE_ENREGISTREMENT_IA = 'pnpm banc:enregistrer-ia';

/**
 * Un port n'identifie pas un site : c'est une propriété de l'hôte qui le sert.
 * Le banc démarre son serveur de scénario sur le premier port libre à partir
 * d'une base ; si le port entrait dans la clé, un poste où ce port est occupé
 * ne retrouverait AUCUNE cassette du parc committé — et le message d'erreur
 * dirait « lance la commande d'enregistrement », c'est-à-dire accuserait le
 * mauvais coupable (APPRENTISSAGES n°6).
 *
 * Le reste de l'URL est conservé : protocole, hôte, chemin et paramètres
 * distinguent bel et bien deux sites. Une URL que Node ne sait pas analyser
 * est laissée telle quelle — on ne normalise que ce qu'on comprend.
 */
export function normaliserUrlPourCle(url: string): string {
  try {
    const analysee = new URL(url);
    analysee.port = '';
    return analysee.toString();
  } catch {
    return url;
  }
}

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
  const entree = JSON.stringify([
    versionPrompt,
    empreinteContrat,
    modele,
    normaliserUrlPourCle(contexte.url),
    contexte.texte,
    contexte.langueDeclaree,
  ]);
  return createHash('sha256').update(entree, 'utf8').digest('hex');
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

export interface OptionsRejeu {
  /** true UNIQUEMENT depuis la commande d'enregistrement : c'est le seul mode qui appelle le modèle. */
  enregistrement: boolean;
  /** Modèle attendu : il entre dans la clé, donc changer de modèle change de cassette. */
  modele: string;
  profilage: ConfigProfilage;
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
  const { enregistrement, modele, profilage } = options;
  const journaliser = options.journaliser ?? (() => undefined);
  const maintenant = options.maintenant ?? (() => new Date());
  const validateur = creerValidateurProfil(profilage);
  const empreinteContrat = empreinteContratProfilage(profilage);

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

  return {
    mode: client.mode,
    raisonDegrade: client.raisonDegrade,
    decider: client.decider.bind(client),
    diagnostiquer: client.diagnostiquer.bind(client),
    rediger: client.rediger.bind(client),

    async profiler(contexte): Promise<ResultatIa<ProfilPage>> {
      const cle = cleCassette({ versionPrompt: VERSION, empreinteContrat, modele, contexte });
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
          versionPrompt: VERSION,
        });
        return enProfil(cassette);
      }

      if (!enregistrement) {
        journaliser('ia.cassette.absente', { cle, commande: COMMANDE_ENREGISTREMENT_IA });
        return {
          disponible: false,
          raison: RAISON_CASSETTE_ABSENTE,
          message: `aucune cassette ${cle} (prompt ${VERSION}, modèle ${modele}) ; lance ${COMMANDE_ENREGISTREMENT_IA}`,
        };
      }

      const brut = await client.profilerBrut(contexte);
      if (!brut.disponible) {
        journaliser('ia.enregistrement.echec', { cle, raison: brut.raison, message: brut.message });
        return brut;
      }
      const enregistree: Cassette = {
        cle,
        metadonnees: {
          date: maintenant().toISOString(),
          modeleDemande: modele,
          modeleServi: brut.valeur.modeleServi,
          versionPrompt: VERSION,
          coutApi: brut.valeur.coutApi,
          apresRelance: brut.valeur.apresRelance,
        },
        reponse: brut.valeur.texte,
      };
      await depot.ecrire(enregistree);
      journaliser('ia.cassette.enregistree', {
        cle,
        coutApi: brut.valeur.coutApi,
        modeleDemande: modele,
        modeleServi: brut.valeur.modeleServi,
      });
      return enProfil(enregistree);
    },
  };
}
