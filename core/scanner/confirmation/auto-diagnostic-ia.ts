/**
 * AUTO-DIAGNOSTIC IA (brique 4c) : le modèle examine ce que les heuristiques
 * mécaniques ont RENONCÉ à trancher — le résidu des tentatives dont la cause
 * d'échec est `indetermine` — et rend un avis de cause.
 *
 * Sa raison d'être est l'apprentissage n°6 : aujourd'hui ce résidu s'effondre
 * en limite d'automatisation, c'est-à-dire en SILENCE, et certains de ces
 * silences sont des pannes réelles. Le diagnostic existe pour réduire le
 * silence INJUSTIFIÉ — jamais pour promouvoir une opinion en preuve.
 *
 * C'est un DÉCORATEUR du diagnostic mécanique, pas son remplaçant : la règle
 * mécanique reste la première consultée, et elle ne coûte rien. Le modèle
 * n'est appelé que sur ce qu'elle laisse dans le silence. Ainsi le point de
 * montage du protocole (`DependancesProtocole.autoDiagnostic`) reste unique,
 * et le mode dégradé consiste exactement à ne pas mettre ce décorateur.
 *
 * TROIS BORNES, dans cet ordre : la porte (`actif`), la nature du résidu (des
 * tentatives `indetermine`, pas les deux autres causes — elles ont déjà leur
 * circuit), et le plafond de groupes par scan (`groupesMax`). Un appel par
 * groupe, jamais deux.
 *
 * MODE DÉGRADÉ : porte fermée, client sans capacité, appel en échec ou avis
 * refusé → le comportement est STRICTEMENT celui d'avant la brique 4c, et
 * l'absence est journalisée, DÉCLARÉE ou SUBIE selon le patron de la 4a. Le
 * diagnostic est un affineur, jamais un prérequis.
 */
import type { ClientIa, DiagnosticEstampille, ResultatIa } from '../../ia/index.js';
import {
  VERDICTS_RETENUS,
  type AutoDiagnostic,
  type AvisDiagnostic,
  type ContexteConfirmation,
  type ResultatGroupe,
} from '../../types.js';
import type { ConfigDiagnostic } from '../config.js';
import { extraitsDuGroupe, type BudgetsRejeu } from './extraits-journal.js';
import { traduireAvis, VERDICT_DU_PONT } from './pont-vocabulaires.js';

export const NOM_AUTO_DIAGNOSTIC_IA = 'auto-diagnostic-ia';

/** Types d'entrées de journal propres au diagnostic IA (identifiants stables). */
export const TYPE_JOURNAL_DIAGNOSTIC = 'confirmation.diagnostic-ia';
export const TYPE_JOURNAL_DIAGNOSTIC_ABSENT = 'confirmation.diagnostic-ia.absent';

/** Raison technique stable : la porte `diagnostic.actif` est fermée — absence DÉCLARÉE. */
export const RAISON_DIAGNOSTIC_INACTIF = 'diagnostic-inactif';
/** Raison technique stable : le plafond `diagnostic.groupesMax` est atteint pour ce scan — absence DÉCLARÉE. */
export const RAISON_PLAFOND_GROUPES = 'plafond-groupes-atteint';
/**
 * Raison technique stable : l'appel a LEVÉ au lieu de rendre une
 * indisponibilité — absence SUBIE. Distincte des raisons du client : elle dit
 * que le contrat lui-même a été rompu, et une garde qui accuse le mauvais
 * coupable est pire qu'une garde absente (APPRENTISSAGES n°6).
 */
export const RAISON_APPEL_LEVE = 'appel-diagnostic-leve';

export interface DependancesDiagnosticIa {
  /** La règle MÉCANIQUE, consultée d'abord : elle ne coûte rien et tranche déjà l'essentiel. */
  mecanique: AutoDiagnostic;
  client: ClientIa;
  config: ConfigDiagnostic;
  /**
   * Les plafonds de temps du rejeu. Ils ne servent pas à décider : ils
   * ENTRENT DANS LES EXTRAITS, parce qu'une durée sans son budget ne veut
   * rien dire — et un journal qu'on ne peut pas interpréter ne se diagnostique
   * pas. Ils viennent de `config/scanner.json` (`confirmation.rejeu`), donc du
   * même endroit que les plafonds réellement appliqués : recopier la valeur
   * ailleurs la ferait mentir le jour d'un réglage.
   */
  budgetsRejeu: BudgetsRejeu;
}

/**
 * Le groupe est-il le RÉSIDU que le diagnostic existe pour examiner ?
 *
 * Deux conditions, et les deux comptent :
 * - le verdict courant est `limite-automatisation`, c'est-à-dire le SILENCE.
 *   Un groupe retenu (confirmée, intermittente) n'est jamais touché — pas par
 *   prudence, mais parce qu'il n'y a rien à affiner : le constat a eu lieu ;
 * - au moins une tentative a échoué pour une cause `indetermine`. Les deux
 *   autres causes ont déjà leur circuit : `outil` mène à la limite
 *   d'automatisation par la règle mécanique, `reseau-site` rend la tentative
 *   EXPLOITABLE et remonte par les découvertes du rejeu. Les diagnostiquer
 *   serait payer un modèle pour reformuler ce que le code sait déjà.
 */
export function estResidu(resultat: ResultatGroupe, verdictCourant: ResultatGroupe['verdict']): boolean {
  if (VERDICTS_RETENUS.includes(verdictCourant) || verdictCourant !== VERDICT_DU_PONT) {
    return false;
  }
  return resultat.tentatives.some((tentative) => tentative.echecOutillage && tentative.causeEchec === 'indetermine');
}

/**
 * Compteur de groupes diagnostiqués, PAR SCAN.
 *
 * Il est attaché au `ContexteConfirmation`, pas au décorateur : un même
 * scanner assemblé une fois peut servir plusieurs scans, et un plafond porté
 * par le décorateur épuiserait le budget du premier scan pour tous les
 * suivants — un plafond « par scan » qui n'en serait pas un.
 */
const groupesDiagnostiques = new WeakMap<ContexteConfirmation, number>();

function consommerPlafond(contexte: ContexteConfirmation, groupesMax: number): boolean {
  const deja = groupesDiagnostiques.get(contexte) ?? 0;
  if (deja >= groupesMax) {
    return false;
  }
  groupesDiagnostiques.set(contexte, deja + 1);
  return true;
}

/**
 * Le diagnostic IA, monté sur le diagnostic mécanique.
 *
 * L'ordre est le contrat : la mécanique d'abord (gratuite, déterministe),
 * l'IA ensuite et seulement sur le résidu. L'avis rendu remplace celui de la
 * mécanique — même verdict (`limite-automatisation` dans les trois cas de la
 * table), mais un motif plus précis, une provenance, une justification, et
 * la découverte quand le modèle impute le site.
 */
export function creerAutoDiagnosticIa(dependances: DependancesDiagnosticIa): AutoDiagnostic {
  const { mecanique, client, config, budgetsRejeu } = dependances;

  return {
    nom: NOM_AUTO_DIAGNOSTIC_IA,

    async diagnostiquer(resultat: ResultatGroupe, contexte: ContexteConfirmation): Promise<AvisDiagnostic | null> {
      const avisMecanique = await mecanique.diagnostiquer(resultat, contexte);
      // Le verdict que le protocole appliquerait SANS l'IA : c'est sur lui
      // que le déclenchement se décide, pas sur le verdict brut. Sinon un
      // groupe passé en limite d'automatisation par la règle mécanique —
      // exactement le résidu visé — ne serait jamais examiné.
      const verdictCourant = avisMecanique?.verdict ?? resultat.verdict;
      const cle = resultat.groupe.cle;

      if (!estResidu(resultat, verdictCourant)) {
        return avisMecanique;
      }
      // L'absence est journalisée DÉCLARÉE : on a dit au moteur de se taire.
      if (!config.actif) {
        contexte.journaliser(TYPE_JOURNAL_DIAGNOSTIC_ABSENT, { cle, raison: RAISON_DIAGNOSTIC_INACTIF, declaree: true });
        return avisMecanique;
      }
      if (!consommerPlafond(contexte, config.groupesMax)) {
        contexte.journaliser(TYPE_JOURNAL_DIAGNOSTIC_ABSENT, {
          cle,
          raison: RAISON_PLAFOND_GROUPES,
          declaree: true,
          groupesMax: config.groupesMax,
        });
        return avisMecanique;
      }

      const extraits = extraitsDuGroupe(resultat, config, budgetsRejeu);
      let reponse: ResultatIa<DiagnosticEstampille>;
      try {
        reponse = await client.diagnostiquer({
          groupe: cle,
          description: resultat.groupe.representant.description,
          extraits,
        });
      } catch {
        // Le contrat de `ClientIa` promet une indisponibilité, pas une
        // exception — mais une promesse n'est pas une garantie, et JAMAIS une
        // exception ne doit tuer un scan pour cause d'IA (constitution §4).
        // Le filet est ici, au point de montage, parce que c'est le dernier
        // endroit qui connaît encore le verdict à préserver.
        reponse = { disponible: false, raison: RAISON_APPEL_LEVE };
      }

      if (!reponse.disponible) {
        // Absence SUBIE : on a demandé, on n'a pas obtenu. Le coût éventuel
        // d'un appel échoué APRÈS dépense est reporté — un coût dépensé qui
        // ne se voit pas est un coût qui ment (APPRENTISSAGES n°3).
        contexte.journaliser(TYPE_JOURNAL_DIAGNOSTIC_ABSENT, {
          cle,
          raison: reponse.raison,
          declaree: false,
          ...(reponse.message === undefined ? {} : { message: reponse.message }),
          coutApi: reponse.coutApi ?? 0,
        });
        if (reponse.coutApi === undefined || reponse.coutApi === 0) {
          return avisMecanique;
        }
        // Le verdict ne change pas, mais la dépense doit remonter : un avis
        // qui ne porte QUE le coût est la seule façon honnête de le dire.
        return {
          verdict: verdictCourant,
          motif: avisMecanique?.motif ?? resultat.motif,
          coutApi: reponse.coutApi,
        };
      }

      const { avis, justification, provenance } = reponse.valeur;
      const traduction = traduireAvis(avis, config);
      contexte.journaliser(TYPE_JOURNAL_DIAGNOSTIC, {
        cle,
        avis,
        verdict: traduction.verdict,
        motif: traduction.motif,
        ...(traduction.decouverte === undefined ? {} : { decouverte: traduction.decouverte }),
        provenance,
        // La justification est TERMINALE : journalisée, lue par aucune
        // logique (même statut que `natureLibre`). Elle est ici, et nulle
        // part ailleurs.
        justification,
        coutApi: reponse.coutApi,
        nbExtraits: extraits.length,
      });

      return {
        verdict: traduction.verdict,
        motif: traduction.motif,
        coutApi: reponse.coutApi,
        ...(traduction.decouverte === undefined ? {} : { decouverte: traduction.decouverte }),
        provenance,
        justification,
      };
    },
  };
}
