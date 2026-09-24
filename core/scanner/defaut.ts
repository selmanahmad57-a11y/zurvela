/**
 * Assemblage par défaut du scanner réel : config + liste noire chargées,
 * politique déterministe, filtre d'actions, six détecteurs, protocole
 * anti-faux-positifs (consolidation, re-exécution, verdict, calibration)
 * avec son auto-diagnostic — mécanique d'abord, IA sur le seul résidu
 * (brique 4c) —, client IA (mode dégradé sans clé, constitution §4) et
 * profilage IA de la page de départ (brique 4a).
 *
 * Seul module du moteur qui relie le pipeline aux modules concrets
 * (navigateur, exploration, observation, détection, re-exécution).
 */
import { creerClientIa, RAISON_REPLI_DETERMINISTE, type ClientIa } from '../ia/index.js';
import type { Browser } from 'playwright';
import type { ContexteExploration, PolitiqueDecision, Scanner } from '../types.js';
import {
  chargerActionsInterdites,
  chargerConfigDiagnostic,
  chargerConfigProfilage,
  chargerConfigRapport,
  chargerConfigScanner,
  type ActionsInterdites,
  type ConfigScanner,
} from './config.js';
import { autoDiagnosticMecanique } from './confirmation/auto-diagnostic.js';
import { creerAutoDiagnosticIa } from './confirmation/auto-diagnostic-ia.js';
import { creerProtocole } from './confirmation/protocole.js';
import { creerDetecteurs } from './detection/index.js';
import { creerExplorateur } from './exploration/explorateur.js';
import { creerFiltre } from './exploration/filtre-actions.js';
import { politiqueDeterministe } from './exploration/politique.js';
import { politiqueIa } from './exploration/politique-ia.js';
import { creerScanner, type SessionRejeu } from './index.js';
import { lancerNavigateur } from './navigateur.js';
import { creerObservateur } from './observation/observateur.js';
import type { CompteurCoutIa, ExplorateurProfilant } from './profilage.js';
import { creerReexecuteur } from './reexecuteur.js';

export const NOM_EXPLORATEUR_NAVIGATEUR = 'explorateur-navigateur';

/**
 * Choisit la politique de décision du scan (cahier 4b §1) : `config.exploration.politique`.
 *
 * Le scan ENTIER ne bascule en déterministe que dans deux cas — la config le
 * demande, ou l'IA est indisponible d'emblée (cohérent avec la brique 4a).
 * Toute autre panne est un repli PAR DÉCISION, à l'intérieur de la politique
 * IA : un appel qui échoue ne fait pas basculer le reste du scan.
 */
function choisirPolitique(
  config: ConfigScanner,
  ia: ClientIa,
  contexte: ContexteExploration,
  deterministe: PolitiqueDecision,
  cout?: CompteurCoutIa,
): PolitiqueDecision {
  const demandee = config.exploration.politique;
  if (demandee !== 'ia') {
    contexte.journaliser('exploration.politique', { demandee, appliquee: deterministe.nom });
    return deterministe;
  }
  if (ia.mode === 'degrade') {
    // Indisponible D'EMBLÉE : le scan entier est déterministe, et il le dit.
    // Ce n'est pas un repli par décision — il n'y a aucune décision à replier.
    contexte.journaliser('exploration.politique', {
      demandee,
      appliquee: deterministe.nom,
      repli: RAISON_REPLI_DETERMINISTE,
      raison: ia.raisonDegrade,
    });
    return deterministe;
  }
  const politique = politiqueIa({
    ia,
    deterministe,
    journaliser: contexte.journaliser,
    ...(cout === undefined ? {} : { cout: (montant: number) => cout.ajouter(montant) }),
  });
  contexte.journaliser('exploration.politique', { demandee, appliquee: politique.nom, modele: config.ia.modeles.navigation });
  return politique;
}

/**
 * Un navigateur PAR SCAN, fermé dans tous les cas : l'explorateur réel est
 * créé autour du navigateur au moment d'explorer. Un échec de lancement est
 * ainsi une exception d'exploration, capturée par le pipeline en rapport
 * partiel plutôt que remontée au banc.
 *
 * Filet de sécurité : à l'échéance, le navigateur est fermé même si
 * l'exploration n'a pas rendu la main (page qui ne répond plus) ; les
 * attentes en cours échouent alors et le rapport partiel est rendu.
 */
function explorateurAvecNavigateur(config: ConfigScanner, actionsInterdites: ActionsInterdites, ia: ClientIa): ExplorateurProfilant {
  const filtre = creerFiltre(actionsInterdites);
  const deterministe = politiqueDeterministe(config.remplissage);
  return {
    nom: NOM_EXPLORATEUR_NAVIGATEUR,
    async explorer(contexte, observateur, collecte, cout) {
      const politique = choisirPolitique(config, ia, contexte, deterministe, cout);
      const navigateur = await lancerNavigateur(config);
      const garde = setTimeout(() => {
        contexte.journaliser('exploration.echeance.fermeture', { echeance: new Date(contexte.echeance).toISOString() });
        navigateur.close().catch(() => undefined);
      }, Math.max(0, contexte.echeance - Date.now()));
      garde.unref();
      try {
        // `secours` est TOUJOURS la déterministe, même quand c'est elle qui
        // décide : la couche 1 doit pouvoir reprendre la main sans dépendre de
        // la politique qu'elle vient d'écarter.
        const explorateur = creerExplorateur({ config, politique, secours: deterministe, filtre, navigateur });
        return await explorateur.explorer(contexte, observateur, collecte);
      } finally {
        clearTimeout(garde);
        await navigateur.close();
      }
    },
  };
}

/**
 * Session de rejeu PARESSEUSE : le navigateur de confirmation n'est lancé
 * qu'au premier rejeu réellement demandé (un site sans candidate n'en paie
 * aucun), il est partagé par toutes les tentatives du scan — chacune ouvre
 * son propre CONTEXTE neuf — et il est fermé avec la session.
 *
 * Même filet de sécurité que l'exploration : à l'échéance, le navigateur est
 * fermé même si un rejeu n'a pas rendu la main (page qui ne répond plus) ;
 * la tentative échoue alors et le protocole rend son résultat à l'heure.
 */
function sessionRejeu(
  config: ConfigScanner,
  journaliser: (type: string, details?: unknown) => void,
  echeance: number,
): SessionRejeu {
  let navigateur: Browser | undefined;
  let garde: NodeJS.Timeout | undefined;
  return {
    reexecuteur: {
      async rejouer(reproduction, viewport) {
        if (navigateur === undefined) {
          navigateur = await lancerNavigateur(config);
          const ouvert = navigateur;
          garde = setTimeout(() => {
            journaliser('rejeu.echeance.fermeture', { echeance: new Date(echeance).toISOString() });
            ouvert.close().catch(() => undefined);
          }, Math.max(0, echeance - Date.now()));
          garde.unref();
        }
        return creerReexecuteur({ navigateur, config, journaliser, echeance }).rejouer(reproduction, viewport);
      },
    },
    async fermer() {
      clearTimeout(garde);
      const ouvert = navigateur;
      navigateur = undefined;
      await ouvert?.close();
    },
  };
}

/** Ce que l'appelant peut substituer dans l'assemblage réel. */
export interface OptionsAssemblage {
  /**
   * Client IA à utiliser. Par défaut, celui de `core/ia` — dégradé tant
   * qu'aucune capacité n'est installée. Le banc injecte ici son client
   * REJOUABLE : l'instrument de mesure ne doit dépendre d'aucun réseau.
   */
  ia?: ClientIa;
  /**
   * Surcharges PARTIELLES de `config/scanner.json` → `exploration`, pour un
   * appelant qui pilote le scan plutôt que de le subir : le banc mesure UNE
   * politique par run, et c'est le scénario — lui seul — qui sait sous quel
   * budget de pages il doit être noté.
   *
   * Ce ne sont pas de nouveaux réglages : les valeurs par défaut restent
   * celles de la config, et ce qui n'est pas nommé n'est pas touché. Aucun
   * seuil ne naît ici (constitution §2).
   */
  exploration?: { politique?: ConfigScanner['exploration']['politique']; pagesMax?: number };
}

/**
 * Applique les surcharges d'exploration à la config chargée.
 *
 * Écrit à part, et non par étalement à l'appel, parce qu'un étalement d'objet
 * portant des clés `undefined` ÉCRASERAIT la valeur de config par `undefined` :
 * une surcharge absente doit laisser la config intacte, pas la trouer.
 */
function appliquerSurcharges(config: ConfigScanner, surcharges: OptionsAssemblage['exploration']): ConfigScanner {
  if (surcharges === undefined) return config;
  return {
    ...config,
    exploration: {
      ...config.exploration,
      ...(surcharges.politique === undefined ? {} : { politique: surcharges.politique }),
      ...(surcharges.pagesMax === undefined ? {} : { pagesMax: surcharges.pagesMax }),
    },
  };
}

export async function creerScannerParDefaut(options: OptionsAssemblage = {}): Promise<Scanner> {
  const [configChargee, actionsInterdites, configProfilage, configDiagnostic, configRapport] = await Promise.all([
    chargerConfigScanner(),
    chargerActionsInterdites(),
    chargerConfigProfilage(),
    chargerConfigDiagnostic(),
    chargerConfigRapport(),
  ]);
  const config = appliquerSurcharges(configChargee, options.exploration);
  const ia = options.ia ?? creerClientIa(config.ia);
  return creerScanner({
    config,
    explorateur: explorateurAvecNavigateur(config, actionsInterdites, ia),
    observateur: creerObservateur,
    detecteurs: creerDetecteurs(config.detecteurs),
    // L'auto-diagnostic IA DÉCORE le mécanique : la règle gratuite reste la
    // première consultée, le modèle n'est appelé que sur ce qu'elle laisse
    // dans le silence, et le point de montage reste unique. Le monter ici est
    // sans risque pour le déterminisme du banc : celui-ci injecte un client
    // REJOUABLE, qui n'appelle aucun réseau — une cassette absente est une
    // indisponibilité, donc exactement le comportement d'avant la brique.
    protocole: creerProtocole({
      config: config.confirmation,
      autoDiagnostic: creerAutoDiagnosticIa({
        mecanique: autoDiagnosticMecanique,
        client: ia,
        config: configDiagnostic,
        budgetsRejeu: config.confirmation.rejeu,
      }),
    }),
    ouvrirRejeu: (journaliser, echeance) => sessionRejeu(config, journaliser, echeance),
    ia,
    // Le profilage est TOUJOURS assemblé : c'est le client IA, et lui seul,
    // qui décide s'il peut répondre. Un scan sans clé n'a donc pas de profil,
    // mais il a une raison au journal (constitution §4, cahier §1).
    profilage: { config: configProfilage, modele: config.ia.modeles.profilage },
    // Le rapport business est TOUJOURS assemblé, comme le profilage : c'est le
    // client IA, et lui seul, qui décide si la prose peut être écrite. Un scan
    // sans clé rend donc un rapport STRUCTUREL, et le journal dit pourquoi.
    rapport: configRapport,
  });
}
