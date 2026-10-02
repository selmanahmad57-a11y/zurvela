/**
 * Politique de décision par le modèle (cahier 4b §1) : le moteur énumère, le
 * modèle ÉLIT. Ce module ne fait que trois choses, et rien d'autre :
 *  - il demande au client IA une élection sur l'état énuméré ;
 *  - il refuse toute élection qui ne désigne pas un identifiant énuméré ;
 *  - il fait trancher CETTE décision par la politique déterministe dès que
 *    l'appel n'aboutit pas.
 *
 * Aucun appel de SDK ici (constitution §4) : le client IA est injecté. Aucune
 * exception ne remonte : une panne d'IA n'a jamais le droit de tuer un scan,
 * elle devient un repli journalisé et le scan continue.
 *
 * Le REPLI EST PAR DÉCISION, pas par scan. `DecisionPrise.politique` porte
 * alors la politique RÉELLEMENT appliquée (`deterministe`) et `raisonRepli`
 * dit pourquoi. Sans ces deux champs, le jour où un scan se comporterait
 * bizarrement, rien ne distinguerait « l'IA a mal choisi » de « le repli a
 * choisi à sa place » — deux diagnostics opposés sous un même symptôme
 * (APPRENTISSAGES n°6).
 */
import type { ClientIa } from '../../ia/index.js';
import { RAISON_ACTION_INCONNUE } from '../../ia/index.js';
import type { ContexteDecision, DecisionPrise, EtatDecisionEnumere, PolitiqueDecision } from '../../types.js';

/** Nom (identifiant technique stable) de la politique IA : il voyage jusqu'au rapport. */
export const NOM_POLITIQUE_IA = 'ia';

/** Le client a levé au lieu de rendre un résultat : la décision se replie quand même. */
export const RAISON_DECISION_EN_ERREUR = 'decision-en-erreur';

/** Types d'entrée de journal propres à la politique IA. */
export const EVENEMENT_ELECTION = 'decision.ia.election';
/** Journal : la clé qu'une décision mise en cache porterait (P2-4, contrat 2). MESURE, jamais décision. */
export const EVENEMENT_CLE_DECISION = 'decision.cle';

export const EVENEMENT_REPLI = 'decision.repli';

export type Journaliser = (type: string, details?: unknown) => void;

export interface DependancesPolitiqueIa {
  ia: ClientIa;
  /** Le repli PAR DÉCISION. Gratuit et sans dépendance : il ne doit jamais échouer à son tour. */
  deterministe: PolitiqueDecision;
  journaliser: Journaliser;
  /** Reçoit le coût de CHAQUE appel, y compris celui d'un appel qui a échoué après avoir dépensé. */
  cout?: (montant: number) => void;
}

/**
 * Fabrique la politique IA. Elle rend TOUJOURS une `DecisionPrise` : jamais
 * une exception, jamais une absence de décision.
 */
export function politiqueIa(dependances: DependancesPolitiqueIa): PolitiqueDecision {
  const { ia, deterministe, journaliser, cout } = dependances;

  async function replier(
    contexte: ContexteDecision,
    etat: EtatDecisionEnumere,
    raisonRepli: string,
    details?: Record<string, unknown>,
  ): Promise<DecisionPrise> {
    journaliser(EVENEMENT_REPLI, { raison: raisonRepli, page: etat.page, viewport: etat.viewport, ...details });
    const secours = await deterministe.decider(contexte, etat);
    // `politique` porte la politique RÉELLEMENT appliquée : celle du repli.
    return { ...secours, raisonRepli };
  }

  return {
    nom: NOM_POLITIQUE_IA,
    async decider(contexte: ContexteDecision, etat: EtatDecisionEnumere): Promise<DecisionPrise> {
      // LA CLÉ QUE PORTERAIT UNE DÉCISION MISE EN CACHE — mesure seule
      // (cahier P2-4, contrat 2). Rien n'est mis en cache aujourd'hui : ce
      // hash sert uniquement à mesurer la RÉPÉTABILITÉ des états énumérés,
      // intra-scan et inter-scans, avant de décider si un cache vaut son
      // code. Le facteur 14 dit où est le coût, pas si le cache le réduira.
      //
      // Un HASH, jamais l'état en clair : le journal d'un scan réel ne
      // recopie pas la page d'autrui. Et la clé vient de `cleDecision`, qui
      // appelle `cleCassetteDecision` — la même fonction que le rejeu du
      // banc, sur la même normalisation : deux chemins qui la calculeraient
      // chacun de leur côté divergeraient en silence.
      const cle = ia.cleDecision(etat);
      if (cle !== null) {
        journaliser(EVENEMENT_CLE_DECISION, { cle, page: etat.page, viewport: etat.viewport });
      }
      let resultat;
      try {
        resultat = await ia.decider(etat);
      } catch (cause: unknown) {
        return replier(contexte, etat, RAISON_DECISION_EN_ERREUR, { message: cause instanceof Error ? cause.message : String(cause) });
      }
      if (!resultat.disponible) {
        // Un appel peut échouer APRÈS avoir dépensé : le coût se compte quand même.
        cout?.(resultat.coutApi ?? 0);
        return replier(contexte, etat, resultat.raison, resultat.message === undefined ? undefined : { message: resultat.message });
      }
      cout?.(resultat.coutApi);

      const { actionId, raison } = resultat.valeur;
      const elue = etat.actions.find((proposee) => proposee.id === actionId);
      if (elue === undefined) {
        // COUCHE 1. Le modèle a nommé un identifiant qui n'était pas au menu :
        // la relance du patron 4a a déjà eu lieu dans la couche IA, il ne
        // reste que le repli. L'acte nommé n'existe pas : il n'est pas
        // « refusé », il est INATTEIGNABLE.
        return replier(contexte, etat, RAISON_ACTION_INCONNUE, { actionId });
      }

      // Provenance TROIS CHAMPS, apposée par la couche IA : elle seule sait ce
      // qu'elle a réellement appelé (le modèle SERVI est extrait de la
      // réponse, jamais déduit de l'alias). Le scanner la recopie sans jamais
      // la fabriquer — une estampille reconstituée ici serait une décoration.
      const { provenance } = resultat.valeur;
      journaliser(EVENEMENT_ELECTION, {
        page: etat.page,
        viewport: etat.viewport,
        actionId,
        type: elue.type,
        coutApi: resultat.coutApi,
        versionPrompt: provenance.versionPrompt,
        modeleDemande: provenance.modeleDemande,
        modeleServi: provenance.modeleServi,
        apresRelance: provenance.apresRelance,
        // Prose du modèle : TERMINALE. Journalisée, lue par rien.
        raison,
      });
      return {
        // L'action exécutée reste celle du MOTEUR (`elue.action`) : le modèle
        // n'a désigné qu'un identifiant.
        action: elue.action,
        politique: NOM_POLITIQUE_IA,
        provenance,
      };
    },
  };
}
