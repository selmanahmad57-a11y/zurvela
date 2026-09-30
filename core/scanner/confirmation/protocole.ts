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
import { EVENEMENT_FUSION_VIEWPORTS, fusionnerParContreEpreuve } from './fusion-viewports.js';
import { detailsGroupe, TYPE_JOURNAL_GROUPE } from './extraits-journal.js';
import { confianceMinoree } from './pont-vocabulaires.js';
import { reexecuterGroupe, viewportDuGroupe } from './reexecution.js';
import { juger, MOTIF_CONFIANCE_SUFFISANTE, MOTIF_ECHEANCE_ATTEINTE, MOTIF_TIERS_SANS_EFFET } from './verdict.js';

/** Journal : un groupe de tiers sans effet visible, écarté d'office (P2-2, contrat 1). */
export const EVENEMENT_TIERS_SANS_EFFET = 'tiers.sans-effet';

export const NOM_PROTOCOLE_ANTI_FAUX_POSITIFS = 'protocole-anti-faux-positifs';

export interface DependancesProtocole {
  config: ConfigConfirmation;
  autoDiagnostic: AutoDiagnostic;
}

/** Le groupe n'a pas été rejoué : ni tentative, ni taux, ni mesure. */
/** L'hôte d'une URL de ressource, ou une chaîne vide si elle ne se lit pas. */
function hoteDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

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
 * LA DOCTRINE NE JUGE PAS CE QUI NE SE VOIT PAS (P2-2, contrat 1).
 *
 * Un groupe fait SEULEMENT de tiers sans effet visible n'est ni rejoué ni
 * publié ; un seul membre à effet visible suffit à le faire juger
 * normalement.
 *
 * UNE SEULE FONCTION POUR LES DEUX PORTES. Un groupe atteint le rapport par
 * deux chemins — les candidates du scan, et les découvertes du rejeu — et la
 * première écriture de cette doctrine ne gardait que le premier. Le réel l'a
 * dit : automationexercise a publié vingt-deux sections de consentement
 * publicitaire, et expandtesting treize, toutes entrées par la seconde
 * porte. Une doctrine recopiée à deux endroits est une doctrine qui dérive ;
 * celle-ci n'existe qu'ici.
 */
export function tiersSansEffetVisible(groupe: GroupeCause): boolean {
  return groupe.membres.every((membre) => membre.sansEffetVisible === true);
}

/**
 * Le silence se COMPTE : un silence qui ne se journalise pas est un angle
 * mort (APPRENTISSAGES n°4). L'hôte et le type de ressource disent DE QUOI
 * le moteur s'est tu, sans quoi la revue ne pourrait pas contrôler la
 * doctrine sur le réel.
 */
function journaliserTiersSansEffet(contexte: ContexteConfirmation, groupe: GroupeCause): void {
  const preuve = groupe.representant.preuves.find((signal) => signal.type === 'reponse-reseau' || signal.type === 'requete-echouee');
  contexte.journaliser(EVENEMENT_TIERS_SANS_EFFET, {
    cle: groupe.cle,
    nbMembres: groupe.membres.length,
    ...(preuve !== undefined && (preuve.type === 'reponse-reseau' || preuve.type === 'requete-echouee')
      ? { hote: hoteDe(preuve.urlRessource), typeRessource: preuve.typeRessource }
      : {}),
  });
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
    cle: resultat.groupe.cle,
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

      let resultats: ResultatGroupe[] = [];
      /** Tout ce que les rejeux ont relevé, groupes d'origine compris : le tri vient après. */
      const candidatesRejeu: AnomalieCandidate[] = [];
      /**
       * Découvertes à émettre SUR AVIS du diagnostic (cause site), indexées
       * par le résultat de leur groupe.
       *
       * Elles ne sont PAS publiées ici : elles le sont dans la branche
       * « écartée » du tri final, et nulle part ailleurs. C'est la forme
       * structurelle de l'invariant — une découverte sur avis ne peut pas
       * exister pour un groupe retenu, non parce qu'on y a pensé, mais parce
       * que le code qui la fabrique ne s'exécute que dans l'autre branche.
       */
      const decouvertesSurAvis = new Map<ResultatGroupe, { facteurConfiance: number; motif: string }>();
      let coutApi = 0;

      for (const groupe of groupes) {
        const detecteur: Detecteur | undefined = contexte.detecteurs.find(
          (candidat) => candidat.nom === groupe.representant.detecteur,
        );
        contexte.journaliser(TYPE_JOURNAL_GROUPE, detailsGroupe(groupe, viewportDuGroupe(groupe).nom, config.rejeu));

        let resultat: ResultatGroupe;
        if (tiersSansEffetVisible(groupe)) {
          // PREMIÈRE PORTE : les candidates du scan. Écarté d'office — ni
          // rejoué, ni publié — mais journalisé et compté.
          resultat = sansRejeu(groupe, 'sans-effet', MOTIF_TIERS_SANS_EFFET);
          journaliserTiersSansEffet(contexte, groupe);
        } else if (config.politique === 'econome' && groupe.confiance >= config.seuilConfirmationDirecte) {
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
        //
        // UNE EXCEPTION, et une seule : un avis qui porte une PROVENANCE vient
        // d'un modèle, et son motif est tout ce que l'appel a acheté. « Le
        // silence demeure, mais il est désormais MOTIVÉ » — c'est la
        // différence entre se taire et n'avoir rien à dire, et elle ne vit
        // que dans le motif. Le jeter parce que le verdict n'a pas bougé
        // reviendrait à payer un diagnostic pour l'oublier.
        const avis = await autoDiagnostic.diagnostiquer(resultat, contexte);
        if (avis !== null) {
          resultat.coutApi += avis.coutApi;
          // L'UNIQUE effet d'un avis « cause site ». Le groupe n'est pas
          // touché : il reste écarté, son verdict n'est pas promu, sa
          // confiance n'est pas remontée — une opinion ne remonte jamais un
          // verdict (A5). Ce qui est publié est une DÉCOUVERTE, dans le
          // troisième état épistémique (« constatée, non re-confirmée »),
          // avec une confiance MINORÉE : un avis n'est pas une preuve.
          if (avis.decouverte !== undefined) {
            decouvertesSurAvis.set(resultat, avis.decouverte);
          }
          if (avis.verdict !== resultat.verdict || avis.provenance !== undefined) {
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

      // UN DÉFAUT, UNE SECTION (P2-3, contrat 5). La contre-épreuve a prouvé
      // que le même défaut vit dans les deux viewports : les deux groupes
      // n'en font plus qu'un, et le malus de symétrie inattendue tombe — une
      // preuve ne se solde pas par un escompte. La fusion vient APRÈS le
      // jugement (elle ne change aucun verdict) et AVANT le tri : ce qui est
      // absorbé ne doit jamais atteindre le rapport.
      const fusion = fusionnerParContreEpreuve(resultats);
      for (const { survivant, absorbees } of fusion.fusions) {
        contexte.journaliser(EVENEMENT_FUSION_VIEWPORTS, { cle: survivant.groupe.cle, absorbees });
        const recalibre = calibrer(
          {
            confianceInitiale: survivant.confianceInitiale,
            verdict: survivant.verdict,
            motif: survivant.motif,
            tauxReproduction: survivant.tauxReproduction,
            ...(survivant.contreEpreuve === undefined ? {} : { contreEpreuve: survivant.contreEpreuve }),
            symetrieResolue: true,
          },
          config,
        );
        survivant.verdict = recalibre.verdict;
        survivant.motif = recalibre.motif;
        survivant.confianceFinale = recalibre.confianceFinale;
      }
      resultats = fusion.resultats;

      const retenues: Anomalie[] = [];
      const ecartees: CandidateEcartee[] = [];
      const decouvertes: Anomalie[] = [];
      for (const resultat of resultats) {
        if (VERDICTS_RETENUS.includes(resultat.verdict)) {
          retenues.push(anomalieRetenue(resultat));
          continue;
        }
        ecartees.push(...candidatesEcartees(resultat));
        // Le groupe est écarté — et c'est DANS cette branche, et seulement
        // ici, qu'un avis « cause site » peut publier sa découverte. Confiance
        // d'ORIGINE minorée, jamais la confiance calibrée : la découverte
        // n'est pas le groupe, elle n'a pas été re-confirmée, et le facteur
        // dit qu'un avis n'est pas une preuve.
        const surAvis = decouvertesSurAvis.get(resultat);
        if (surAvis === undefined) {
          continue;
        }
        const anomalie: Anomalie = {
          ...anomalieDecouverte(resultat.groupe),
          confiance: confianceMinoree(resultat.confianceInitiale, surAvis.facteurConfiance),
          motif: surAvis.motif,
        };
        contexte.journaliser('confirmation.decouverte', {
          cle: resultat.groupe.cle,
          detecteur: resultat.groupe.representant.detecteur,
          description: resultat.groupe.representant.description,
          urlOuEtape: anomalie.urlOuEtape,
          motif: surAvis.motif,
          confiance: anomalie.confiance,
          confianceOrigine: resultat.confianceInitiale,
          gravite: anomalie.graviteEstimee,
          graviteDetecteur: resultat.groupe.representant.graviteEstimee,
          nbMembres: resultat.groupe.membres.length,
          verdictGroupe: resultat.verdict,
        });
        decouvertes.push(anomalie);
        retenues.push(anomalie);
      }

      // DÉCOUVERTES : ce que les rejeux ont vu sans être venus le chercher.
      // Retenues sans calibration (elles n'ont pas été re-confirmées) et
      // journalisées à part : leur statut est « constatée une fois ».
      for (const groupe of collecterDecouvertes(candidatesRejeu, groupes)) {
        if (tiersSansEffetVisible(groupe)) {
          // SECONDE PORTE : la même doctrine, au même endroit du code. Une
          // découverte tierce sans effet visible est tue, comptée et
          // journalisée exactement comme une candidate — jusqu'à sa trace
          // d'écartée. Sans elle, le silence n'aurait pas de PREUVE : ni le
          // banc ni une revue ne pourraient dire de quoi le moteur s'est tu,
          // et une doctrine dont on ne peut pas contrôler les silences n'est
          // pas contrôlable du tout.
          const resultatTu = sansRejeu(groupe, 'sans-effet', MOTIF_TIERS_SANS_EFFET);
          journaliserTiersSansEffet(contexte, groupe);
          resultats.push(resultatTu);
          ecartees.push(...candidatesEcartees(resultatTu));
          continue;
        }
        const anomalie = anomalieDecouverte(groupe);
        contexte.journaliser('confirmation.decouverte', {
          cle: groupe.cle,
          detecteur: groupe.representant.detecteur,
          description: groupe.representant.description,
          urlOuEtape: anomalie.urlOuEtape,
          motif: MOTIF_CONSTATEE_AU_REJEU,
          confiance: anomalie.confiance,
          gravite: anomalie.graviteEstimee,
          graviteDetecteur: groupe.representant.graviteEstimee,
          nbMembres: groupe.membres.length,
        });
        decouvertes.push(anomalie);
        retenues.push(anomalie);
        resultats.push({
          groupe,
          verdict: 'decouverte',
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
