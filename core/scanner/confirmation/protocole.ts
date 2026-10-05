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
import { EVENEMENT_PALIER_PERSISTANCE, palierPersistance, victimesDe } from './persistance.js';

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
 * Une lenteur ENCORE EN ATTENTE : son évidence est une requête qui n'a pas
 * fini dans la fenêtre d'effet. Sa confiance (haute) dit la GRAVITÉ — « ne
 * finit pas » est un signal fort —, pas une preuve de REPRODUCTION : on ne
 * sait pas si elle pend à chaque fois ou une fois par congestion. Seul le
 * rejeu le dit. Elle est donc EXCLUE du court-circuit `confiance-suffisante`,
 * quelle que soit la politique : confiance et preuve sont deux choses, et une
 * confiance haute ne dispense pas de la preuve (le pendant, dans l'autre sens,
 * de « le doute ne monte jamais la confiance »). Sans cela, une congestion
 * transitoire vue une fois serait publiée sans rejeu sous `econome` — le faux
 * positif que la correction de l'échelle de confiance vient d'éviter.
 */
export function lenteurSansPreuveDeReproduction(groupe: GroupeCause): boolean {
  return groupe.representant.preuves.some((signal) => signal.type === 'requete-en-attente');
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

/**
 * L'ORDRE DES GROUPES ALTERNE LES VIEWPORTS (contrat du budget réparti, R4).
 *
 * Le budget se consomme dans l'ordre de la liste : une liste qui range tous
 * les groupes desktop avant tous les groupes mobile sacrifie le mobile dès
 * qu'elle sature. Ce n'est pas un confort — en référence, le défaut de
 * `/panier` existait sur les deux viewports, le mobile tombait en
 * `echeance-atteinte`, et le client lisait « desktop » seul (n°36).
 *
 * L'ordre relatif à l'intérieur d'un viewport est PRÉSERVÉ : on alterne, on
 * ne trie pas.
 */
export const EVENEMENT_QUOTA_REJEUX = 'confirmation.quota';
/** Re-mesure d'une découverte de détecteur gradué avant publication (cahier P2-9). */
export const EVENEMENT_REMESURE_DECOUVERTE = 'confirmation.remesure-decouverte';

export function ordonnerParViewport(groupes: readonly GroupeCause[]): GroupeCause[] {
  const files = new Map<string, GroupeCause[]>();
  for (const groupe of groupes) {
    const nom = viewportDuGroupe(groupe).nom;
    const file = files.get(nom);
    if (file === undefined) {
      files.set(nom, [groupe]);
    } else {
      file.push(groupe);
    }
  }
  const ordonnes: GroupeCause[] = [];
  while (ordonnes.length < groupes.length) {
    for (const file of files.values()) {
      const suivant = file.shift();
      if (suivant !== undefined) {
        ordonnes.push(suivant);
      }
    }
  }
  return ordonnes;
}

/**
 * LE QUOTA DE REJEUX D'UN GROUPE (contrat du budget réparti, R1 et R3).
 *
 * L'allocation se fait en REJEUX, jamais en millisecondes : sur
 * `recouvrement--q10`, 34 302 ms restaient pour six groupes, soit 5 717 ms
 * chacun — moins qu'un seul rejeu (8 680 ms mesurés). Une part égale en
 * temps n'affame pas un groupe, elle les affame TOUS.
 *
 * UN TOUR AVANT DEUX : le reste de la division est distribué à raison d'un
 * rejeu par groupe, donc personne n'obtient sa deuxième re-exécution avant
 * que tous aient eu la première. C'est fondé sur une mesure et non sur une
 * esthétique : `juger` conclut sur les tentatives EXPLOITABLES, donc une
 * seule re-exécution reproduite suffit déjà à `confirmee` — le deuxième
 * rejeu achète de la PREUVE, pas la conclusion.
 */
export function quotaRejeux(options: {
  budgetMs: number;
  coutRejeuMs: number;
  groupesRestants: number;
  maxParGroupe: number;
}): number {
  const { budgetMs, coutRejeuMs, groupesRestants, maxParGroupe } = options;
  if (groupesRestants <= 0 || coutRejeuMs <= 0) {
    return 0;
  }
  const payables = Math.floor(budgetMs / coutRejeuMs);
  if (payables <= 0) {
    return 0;
  }
  const base = Math.floor(payables / groupesRestants);
  const reste = payables % groupesRestants > 0 ? 1 : 0;
  return Math.min(base + reste, maxParGroupe);
}

/**
 * Le coût d'un rejeu se MESURE (R2). 8,7 s au banc, 29 s sur
 * expandtesting : une constante ne vaudrait que pour le site qui l'a
 * inspirée. La médiane des rejeux DÉJÀ exécutés dans ce scan est la seule
 * estimation qui suive la cible.
 *
 * Le plancher est `budgetMinimalMs`, qui dit déjà « un rejeu a besoin d'au
 * moins ceci » : sans lui, un rejeu anormalement rapide ferait promettre
 * des rejeux impayables. C'est aussi la valeur d'amorçage, avant toute
 * observation — elle surestime le nombre de rejeux payables, ce qui est
 * sans danger puisque `tempsRestant()` reste la garde dure.
 */
export function coutRejeuEstime(dureesMs: readonly number[], plancherMs: number): number {
  if (dureesMs.length === 0) {
    return plancherMs;
  }
  const triees = [...dureesMs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const mediane =
    triees.length % 2 === 1 ? (triees[milieu] as number) : ((triees[milieu - 1] as number) + (triees[milieu] as number)) / 2;
  return Math.max(mediane, plancherMs);
}

export function creerProtocole(dependances: DependancesProtocole): ProtocoleConfirmation {
  const { config, autoDiagnostic } = dependances;

  return {
    nom: NOM_PROTOCOLE_ANTI_FAUX_POSITIFS,

    async confirmer(candidates, contexte: ContexteConfirmation) {
      const debut = Date.now();
      const groupes = ordonnerParViewport(consolider(candidates));
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

      /**
       * La part de CE groupe, recalculée à chaque fois : le coût d'un rejeu
       * s'affine à mesure qu'on en observe, et le temps restant diminue. Une
       * allocation posée une fois au départ se tromperait sur les deux.
       */
      const quotaDuGroupe = (): number =>
        quotaRejeux({
          budgetMs: contexte.echeance - config.rejeu.margeEcheanceMs - Date.now(),
          coutRejeuMs: coutRejeuEstime(dureesRejeuMs, config.rejeu.budgetMinimalMs),
          groupesRestants,
          maxParGroupe: maxRejeuxParGroupe,
        });

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
      /**
       * LE BUDGET RÉPARTI (contrat du budget réparti). Trois grandeurs
       * suffisent : ce que coûte un rejeu (mesuré), combien de groupes
       * restent à servir, et combien de rejeux chacun a le droit de
       * prendre. L'échéance reste la garde dure par-dessus.
       */
      const dureesRejeuMs: number[] = [];
      const maxRejeuxParGroupe = config.reExecutions + (config.contreEpreuve ? 1 : 0);
      /** Les groupes qui PEUVENT consommer un rejeu : les autres ne pèsent pas sur le partage. */
      let groupesRestants = groupes.filter(
        (candidat) =>
          !tiersSansEffetVisible(candidat) &&
          !(
            config.politique === 'econome' &&
            candidat.confiance >= config.seuilConfirmationDirecte &&
            !lenteurSansPreuveDeReproduction(candidat)
          ),
      ).length;

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
        } else if (
          config.politique === 'econome' &&
          groupe.confiance >= config.seuilConfirmationDirecte &&
          !lenteurSansPreuveDeReproduction(groupe)
        ) {
          // Politique d'échelle : un constat déjà très sûr ne paie pas de rejeu.
          // SAUF une lenteur en attente — confiance = gravité, pas preuve de
          // reproduction : elle est toujours rejouée (C3bis).
          resultat = sansRejeu(groupe, 'confirmee', MOTIF_CONFIANCE_SUFFISANTE);
        } else if (!tempsRestant() || quotaDuGroupe() === 0) {
          // Sans rejeu, on ne CONCLUT pas : on dit que l'automatisation n'a pas pu trancher.
          groupesRestants -= 1;
          resultat = sansRejeu(groupe, 'limite-automatisation', MOTIF_ECHEANCE_ATTEINTE);
        } else {
          const rejeuxMax = quotaDuGroupe();
          groupesRestants -= 1;
          contexte.journaliser(EVENEMENT_QUOTA_REJEUX, {
            cle: groupe.cle,
            rejeuxMax,
            groupesRestants: groupesRestants + 1,
            coutRejeuEstimeMs: coutRejeuEstime(dureesRejeuMs, config.rejeu.budgetMinimalMs),
          });
          const reexecution = await reexecuterGroupe({ groupe, contexte, config, detecteur, tempsRestant, rejeuxMax });
          dureesRejeuMs.push(...reexecution.tentatives.map((tentative) => tentative.dureeMs));
          const { tentatives, contreEpreuve } = reexecution;
          candidatesRejeu.push(...reexecution.candidates);
          const jugement = juger(tentatives, {
            tauxRequis: config.tauxReproduction,
            agregation: config.agregationMesures,
            ...(detecteur?.seuilMesure === undefined ? {} : { seuilMesure: detecteur.seuilMesure }),
          });
          // LE PALIER DE PERSISTANCE (cahier P2-6). Calculé et JOURNALISÉ,
          // sans agir encore sur ce qui est publié : on mesure ce que le
          // mécanisme ferait avant de le laisser faire. Reparaître au même
          // endroit n'est pas reparaître sur la même chose.
          const victimesOrigine = victimesDe(groupe.representant);
          const palier = palierPersistance({
            victimesOrigine,
            tentatives,
            observationsMin: config.observationsMinPersistance,
          });
          if (palier !== 'sans-objet') {
            contexte.journaliser(EVENEMENT_PALIER_PERSISTANCE, {
              cle: groupe.cle,
              palier,
              verdict: jugement.verdict,
              nbVictimesOrigine: victimesOrigine.length,
              nbTentativesExploitables: tentatives.filter((tentative) => !tentative.echecOutillage).length,
              observationsMin: config.observationsMinPersistance,
            });
          }
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
      const fusion = fusionnerParContreEpreuve(resultats, contexte.viewports.map((viewport) => viewport.nom));
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
        // CAHIER P2-9 — une découverte d'un détecteur GRADUÉ ne se publie pas sur
        // une observation unique : une mesure vue une fois peut être un
        // transitoire (le faux positif getlumavo). On la RE-MESURE par le même
        // chemin qu'une candidate (`reexecuterGroupe` + `juger`). Binaire : rien
        // à re-mesurer, publiée telle quelle. Anti-récursion : les candidates
        // des rejeux de re-mesure ne sont PAS collectées — on vérifie une
        // lenteur précise, on ne cherche pas de nouvelles découvertes (un
        // niveau, pas N). Re-mesure impossible (plus de temps) : on garde la
        // découverte, statut faible « constatée une fois » (asymétrie : le doute
        // n'écarte pas un défaut possible, seule une re-mesure SOUS le seuil le fait).
        const detecteurDecouverte = contexte.detecteurs.find((candidat) => candidat.nom === groupe.representant.detecteur);
        if (detecteurDecouverte?.mesureDe !== undefined && detecteurDecouverte.seuilMesure !== undefined && tempsRestant()) {
          const reexecution = await reexecuterGroupe({ groupe, contexte, config, detecteur: detecteurDecouverte, tempsRestant, rejeuxMax: config.reExecutions });
          const jugement = juger(reexecution.tentatives, {
            tauxRequis: config.tauxReproduction,
            agregation: config.agregationMesures,
            seuilMesure: detecteurDecouverte.seuilMesure,
          });
          contexte.journaliser(EVENEMENT_REMESURE_DECOUVERTE, {
            cle: groupe.cle,
            verdict: jugement.verdict,
            motif: jugement.motif,
            ...(jugement.mesureAgregee === undefined ? {} : { mesureAgregee: jugement.mesureAgregee }),
          });
          if (jugement.verdict === 'non-reproduite') {
            // Transitoire : re-mesuré sous le seuil → ÉCARTÉ, jamais publié.
            const resultatEcarte: ResultatGroupe = {
              groupe,
              verdict: jugement.verdict,
              motif: jugement.motif,
              tentatives: reexecution.tentatives,
              tauxReproduction: jugement.tauxReproduction,
              ...(jugement.mesureAgregee === undefined ? {} : { mesureAgregee: jugement.mesureAgregee }),
              confianceInitiale: groupe.confiance,
              confianceFinale: groupe.confiance,
              coutApi: 0,
            };
            resultats.push(resultatEcarte);
            ecartees.push(...candidatesEcartees(resultatEcarte));
            continue;
          }
          // Reproduite (ou re-mesure inconclusive) : la découverte survit, publiée ci-dessous.
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
