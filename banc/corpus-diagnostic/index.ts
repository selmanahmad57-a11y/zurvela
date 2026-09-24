/**
 * LE CORPUS DE DIAGNOSTIC — cinq journaux, et ce qu'on attend d'eux.
 *
 * Pourquoi il ne vit pas au banc. Le banc ne sait pas produire un
 * `indetermine` DÉTERMINISTE depuis un site servi : la cause `indetermine`
 * naît d'un délai dépassé ou d'un chargement qui échoue sans laisser de
 * requête en échec — des états qu'on ne peut fabriquer qu'en sabotant le
 * rejeu, et un sabotage n'a pas sa place dans le registre des scénarios
 * (annexe A6 du cahier de la brique 3 : il polluerait la scorecard). La
 * mesure vit donc en Vitest, sur des journaux CONSTRUITS.
 *
 * Construits — jamais inventés. Chaque cas est DÉRIVÉ d'un journal réel du
 * banc (`journal-reel.json`, extrait sans édition) puis édité, et chaque
 * édition est écrite dans le fichier du cas. Un corpus dont le format
 * s'éloigne du réel mesurerait le diagnostic sur une langue qu'il ne parlera
 * jamais en production : la bonne réponse au mauvais document.
 *
 * DEUX CAS `outil`, DEUX CAS `site`, UN CAS AMBIGU dont la bonne réponse est
 * l'aveu. Le cinquième est le plus important des cinq : un diagnostic qui
 * répond toujours `outil` ou `site` devant un journal indécidable fabrique de
 * la certitude — exactement ce que le produit ne doit jamais faire devant un
 * commerçant. L'aveu mesuré à 1/1 vaut plus que les quatre certitudes.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AvisCause, ClientIa, ContexteDiagnostic } from '../../core/ia/index.js';

export const DOSSIER_CORPUS = path.dirname(fileURLToPath(import.meta.url));
/** Le journal RÉEL dont tous les cas sont dérivés : l'étalon de format. */
export const FICHIER_JOURNAL_REEL = 'journal-reel.json';

/** D'où vient le cas, et ce qu'on lui a fait. */
export interface DerivationCas {
  /**
   * `true` si le cas a dû être écrit de zéro. Le champ existe pour que
   * l'aveu soit STRUCTUREL plutôt que laissé à la bonne foi d'un rapport :
   * un corpus inventé et un corpus dérivé ne se distinguent pas à l'œil.
   */
  ecritDeZero: boolean;
  /** Scénario du banc dont le journal a été extrait. */
  scenario: string;
  /** Clé du groupe de cause racine réel. */
  groupeReel: string;
  journalReel: string;
  /** Une ligne par édition appliquée au journal réel. */
  editions: string[];
}

export interface CasCorpus {
  id: string;
  avisAttendu: AvisCause;
  derive: DerivationCas;
  /** Pourquoi cet avis est la bonne réponse. Documentation TERMINALE : aucune logique ne la lit. */
  pourquoiCetAvis: string;
  contexte: ContexteDiagnostic;
}

/** Une entrée du journal réel, telle que le scan l'a écrite. */
export interface EntreeJournalReel {
  horodatage: string;
  type: string;
  details: Record<string, unknown>;
}

export interface JournalReel {
  provenance: { commande: string; scenarios: string[]; typesRetenus: string[]; note: string };
  entrees: Record<string, EntreeJournalReel[]>;
}

/** Les cas, triés par identifiant : l'ordre de mesure ne dépend pas du système de fichiers. */
export async function chargerCorpus(dossier: string = DOSSIER_CORPUS): Promise<CasCorpus[]> {
  const noms = (await readdir(dossier)).filter((nom) => nom.startsWith('cas-') && nom.endsWith('.json')).sort();
  return Promise.all(noms.map(async (nom) => JSON.parse(await readFile(path.join(dossier, nom), 'utf8')) as CasCorpus));
}

export async function chargerJournalReel(dossier: string = DOSSIER_CORPUS): Promise<JournalReel> {
  return JSON.parse(await readFile(path.join(dossier, FICHIER_JOURNAL_REEL), 'utf8')) as JournalReel;
}

/** Ce qu'un cas a donné. `avisRendu` est `null` quand l'appel n'a rien rendu. */
export interface MesureCas {
  id: string;
  avisAttendu: AvisCause;
  avisRendu: AvisCause | null;
  correct: boolean;
  /** Raison technique de l'absence, quand le diagnostic n'a rien rendu. */
  raison?: string;
  coutApi: number;
}

export interface MesureCorpus {
  resultats: MesureCas[];
  /** Cas pour lesquels un avis a été rendu — la seule base sur laquelle un taux a un sens. */
  nbMesures: number;
  nbCorrects: number;
  /**
   * Cas restés sans avis. Ils ne sont JAMAIS comptés comme des réussites ni
   * retirés de l'échantillon : un corpus muet qui afficherait « 0/0, 100 % »
   * serait l'accord sur le silence (APPRENTISSAGES n°4).
   */
  nbNonMesures: number;
  coutApi: number;
}

/**
 * Mesure le corpus avec le client donné, un cas après l'autre.
 *
 * La fonction ne décide de rien : elle rend ce qui s'est passé, y compris
 * l'absence. C'est l'appelant — le test, ou la commande — qui déclare
 * l'échec, parce que c'est lui qui sait s'il attendait un parc de cassettes.
 */
export async function mesurerCorpus(client: ClientIa, corpus: readonly CasCorpus[]): Promise<MesureCorpus> {
  const resultats: MesureCas[] = [];
  for (const cas of corpus) {
    const reponse = await client.diagnostiquer(cas.contexte);
    if (!reponse.disponible) {
      resultats.push({
        id: cas.id,
        avisAttendu: cas.avisAttendu,
        avisRendu: null,
        correct: false,
        raison: reponse.raison,
        coutApi: reponse.coutApi ?? 0,
      });
      continue;
    }
    resultats.push({
      id: cas.id,
      avisAttendu: cas.avisAttendu,
      avisRendu: reponse.valeur.avis,
      correct: reponse.valeur.avis === cas.avisAttendu,
      coutApi: reponse.coutApi,
    });
  }
  const nbMesures = resultats.filter((resultat) => resultat.avisRendu !== null).length;
  return {
    resultats,
    nbMesures,
    nbCorrects: resultats.filter((resultat) => resultat.correct).length,
    nbNonMesures: resultats.length - nbMesures,
    coutApi: resultats.reduce((total, resultat) => total + resultat.coutApi, 0),
  };
}
