/**
 * PROTOCOLE ANTI-FAUX-POSITIFS — l'étape CONFIRMATION du pipeline, cœur
 * défendable du produit (constitution §1, différenciateur n°1).
 *
 *   CANDIDATES → CONSOLIDATION → RE-EXÉCUTION → VERDICT → CALIBRATION
 *                groupes par      reproduction   statut    confiance
 *                cause racine     isolée         motivé    finale
 *
 * Ce module n'est qu'un ENCHAÎNEMENT : chaque étape vit dans son module, la
 * politique vit en config, le pilotage du navigateur vit dans le
 * `Reexecuteur` injecté. Le protocole, lui, garantit trois choses :
 * l'ordre, l'échéance (au-delà, les groupes restants sont déclarés limite
 * d'automatisation plutôt que jugés sans preuve) et la journalisation
 * complète (constitution §5 : chaque candidate porte un verdict motivé).
 *
 * Le rapport final sépare les anomalies RETENUES (confirmées,
 * intermittentes) des ÉCARTÉES — ces dernières restent au journal avec
 * leurs preuves d'origine : savoir se taire est la moitié du métier.
 *
 * Et ce que les rejeux constatent EN PLUS (un site qui tombe pendant la
 * confirmation) n'est ni confirmé ni écarté : c'est une DÉCOUVERTE, retenue
 * telle quelle (voir `decouvertes.ts`).
 */
import {
  VERDICTS_RETENUS,
  type Anomalie,
  type AnomalieCandidate,
  type AutoDiagnostic,
  type CandidateEcartee,
  type ContexteConfirmation,
  type Detecteur,
  type GroupeCause,
  type ProtocoleConfirmation,
  type ResultatGroupe,
} from '../../types.js';
import type { ConfigConfirmation } from '../config.js';
import { calibrer } from './calibration.js';
import { consolider } from './consolidation.js';
import { anomalieDecouverte, collecterDecouvertes, MOTIF_CONSTATEE_AU_REJEU } from './decouvertes.js';
import { reexecuterGroupe, viewportDuGroupe } from './reexecution.js';
import { juger, MOTIF_CONFIANCE_SUFFISANTE, MOTIF_ECHEANCE_ATTEINTE } from './verdict.js';

export const NOM_PROTOCOLE_ANTI_FAUX_POSITIFS = 'protocole-anti-faux-positifs';

export interface DependancesProtocole {
  config: ConfigConfirmation;
  autoDiagnostic: AutoDiagnostic;
}

/** Le groupe n'a pas été rejoué : ni tentative, ni taux, ni mesure. */
function sansRejeu(groupe: GroupeCause, verdict: ResultatGroupe['verdict'], motif: string): ResultatGroupe {
  return {
    groupe,
    verdict,
    motif,
    tentatives: [],
    tauxReproduction: null,
    confianceInitiale: groupe.confiance,
    confianceFinale: groupe.confiance,
    coutApi: 0,
  };
}

/**
 * L'anomalie retenue : le représentant, enrichi de ce que le groupe et le
 * protocole ont établi.
 *
 * Elle porte son POURQUOI (`motif`) et la clé de son groupe : sans eux, un
 * lecteur du rapport devrait re-parser le journal pour savoir ce qui a valu
 * ce verdict et ce que le groupe contenait d'autre. La clé est le lien avec
 * `Rapport.groupes` — c'est elle qui rend la traçabilité navigable.
 */
function anomalieRetenue(resultat: ResultatGroupe): Anomalie {
  return {
    ...resultat.groupe.representant,
    confiance: resultat.confianceFinale,
    verdict: resultat.verdict,
    motif: resultat.motif,
    groupe: resultat.groupe.cle,
    localisations: resultat.groupe.localisations,
    observations: resultat.groupe.observations,
  };
}

function candidatesEcartees(resultat: ResultatGroupe): CandidateEcartee[] {
  return resultat.groupe.membres.map((candidate: AnomalieCandidate) => ({
    candidate,
    raison: resultat.motif,
    verdict: resultat.verdict,
    resultat,
  }));
}

export function creerProtocole(dependances: DependancesProtocole): ProtocoleConfirmation {
  const { config, autoDiagnostic } = dependances;

  return {
    nom: NOM_PROTOCOLE_ANTI_FAUX_POSITIFS,

    async confirmer(candidates, contexte: ContexteConfirmation) {
      const debut = Date.now();
      const groupes = consolider(candidates);
      contexte.journaliser('confirmation.debut', {
        nbCandidates: candidates.length,
        nbGroupes: groupes.length,
        politique: config.politique,
        reExecutions: config.reExecutions,
        variations: config.variations,
      });

      /**
       * Une tentative ne se LANCE que si le budget la couvre entièrement.
       * Une tentative écourtée par l'échéance ne se distingue pas d'un rejeu
       * complet qui n'aurait rien reproduit : la compter ferait dépendre le
       * verdict d'un défaut déterministe du temps qui reste. Faute de place,
       * le groupe est déclaré limite d'automatisation — un verdict honnête.
       */
      const tempsRestant = (): boolean =>
        Date.now() + config.rejeu.margeEcheanceMs + config.rejeu.budgetMinimalMs < contexte.echeance;

      const resultats: ResultatGroupe[] = [];
      /** Tout ce que les rejeux ont relevé, groupes d'origine compris : le tri vient après. */
      const candidatesRejeu: AnomalieCandidate[] = [];
      let coutApi = 0;

      for (const groupe of groupes) {
        const detecteur: Detecteur | undefined = contexte.detecteurs.find(
          (candidat) => candidat.nom === groupe.representant.detecteur,
        );
        contexte.journaliser('confirmation.groupe', {
          cle: groupe.cle,
          confiance: groupe.confiance,
          nbMembres: groupe.membres.length,
          viewports: groupe.observations.map((observation) => observation.viewport),
          detecteur: groupe.representant.detecteur,
          viewportRejeu: viewportDuGroupe(groupe).nom,
        });

        let resultat: ResultatGroupe;
        if (config.politique === 'econome' && groupe.confiance >= config.seuilConfirmationDirecte) {
          // Politique d'échelle : un constat déjà très sûr ne paie pas de rejeu.
          resultat = sansRejeu(groupe, 'confirmee', MOTIF_CONFIANCE_SUFFISANTE);
        } else if (!tempsRestant()) {
          // Sans rejeu, on ne CONCLUT pas : on dit que l'automatisation n'a pas pu trancher.
          resultat = sansRejeu(groupe, 'limite-automatisation', MOTIF_ECHEANCE_ATTEINTE);
        } else {
          const reexecution = await reexecuterGroupe({ groupe, contexte, config, detecteur, tempsRestant });
          const { tentatives, contreEpreuve } = reexecution;
          candidatesRejeu.push(...reexecution.candidates);
          const jugement = juger(tentatives, {
            tauxRequis: config.tauxReproduction,
            agregation: config.agregationMesures,
            ...(detecteur?.seuilMesure === undefined ? {} : { seuilMesure: detecteur.seuilMesure }),
          });
          resultat = {
            groupe,
            verdict: jugement.verdict,
            motif: jugement.motif,
            tentatives,
            ...(contreEpreuve === undefined ? {} : { contreEpreuve }),
            tauxReproduction: jugement.tauxReproduction,
            ...(jugement.mesureAgregee === undefined ? {} : { mesureAgregee: jugement.mesureAgregee }),
            confianceInitiale: groupe.confiance,
            confianceFinale: groupe.confiance,
            coutApi: 0,
          };
        }

        // Auto-diagnostic : consulté APRÈS le verdict brut, AVANT la
        // calibration. Son avis ne remplace le verdict que s'il en diffère —
        // sinon le motif d'origine, plus précis, est conservé.
        const avis = await autoDiagnostic.diagnostiquer(resultat, contexte);
        if (avis !== null) {
          resultat.coutApi += avis.coutApi;
          if (avis.verdict !== resultat.verdict) {
            contexte.journaliser('confirmation.auto-diagnostic', {
              cle: groupe.cle,
              diagnostic: autoDiagnostic.nom,
              verdictBrut: resultat.verdict,
              verdict: avis.verdict,
              motif: avis.motif,
            });
            resultat.verdict = avis.verdict;
            resultat.motif = avis.motif;
          }
        }
        coutApi += resultat.coutApi;

        const calibration = calibrer(
          {
            confianceInitiale: resultat.confianceInitiale,
            verdict: resultat.verdict,
            motif: resultat.motif,
            tauxReproduction: resultat.tauxReproduction,
            ...(resultat.contreEpreuve === undefined ? {} : { contreEpreuve: resultat.contreEpreuve }),
          },
          config,
        );
        resultat.verdict = calibration.verdict;
        resultat.motif = calibration.motif;
        resultat.confianceFinale = calibration.confianceFinale;

        contexte.journaliser('confirmation.verdict', {
          cle: groupe.cle,
          verdict: resultat.verdict,
          motif: resultat.motif,
          taux: resultat.tauxReproduction,
          ...(resultat.mesureAgregee === undefined ? {} : { mesureAgregee: resultat.mesureAgregee }),
          confianceInitiale: resultat.confianceInitiale,
          confianceFinale: resultat.confianceFinale,
          nbTentatives: resultat.tentatives.length,
        });
        resultats.push(resultat);
      }

      const retenues: Anomalie[] = [];
      const ecartees: CandidateEcartee[] = [];
      for (const resultat of resultats) {
        if (VERDICTS_RETENUS.includes(resultat.verdict)) {
          retenues.push(anomalieRetenue(resultat));
        } else {
          ecartees.push(...candidatesEcartees(resultat));
        }
      }

      // DÉCOUVERTES : ce que les rejeux ont vu sans être venus le chercher.
      // Retenues sans calibration (elles n'ont pas été re-confirmées) et
      // journalisées à part : leur statut est « constatée une fois ».
      const decouvertes: Anomalie[] = [];
      for (const groupe of collecterDecouvertes(candidatesRejeu, groupes)) {
        const anomalie = anomalieDecouverte(groupe);
        contexte.journaliser('confirmation.decouverte', {
          cle: groupe.cle,
          detecteur: groupe.representant.detecteur,
          description: groupe.representant.description,
          urlOuEtape: anomalie.urlOuEtape,
          motif: MOTIF_CONSTATEE_AU_REJEU,
          confiance: anomalie.confiance,
          nbMembres: groupe.membres.length,
        });
        decouvertes.push(anomalie);
        retenues.push(anomalie);
        resultats.push({
          groupe,
          verdict: 'confirmee',
          motif: MOTIF_CONSTATEE_AU_REJEU,
          tentatives: [],
          tauxReproduction: null,
          confianceInitiale: groupe.confiance,
          confianceFinale: groupe.confiance,
          coutApi: 0,
        });
      }

      const dureeMs = Date.now() - debut;
      contexte.journaliser('confirmation.fin', {
        nbRetenues: retenues.length,
        nbEcartees: ecartees.length,
        nbDecouvertes: decouvertes.length,
        coutApi,
        dureeMs,
      });
      return { retenues, ecartees, coutApi, groupes: resultats, decouvertes };
    },
  };
}
