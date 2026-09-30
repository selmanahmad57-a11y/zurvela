/**
 * LE CHIFFRE QUI MANQUAIT PARTOUT (APPRENTISSAGES n°18, cahier P2-1 contrat 5) :
 * quelle fraction des candidates le protocole a PHYSIQUEMENT réussi à re-tester.
 *
 * Dix scans du bestiaire, trois causes (rejeu ouvert sur la mauvaise page,
 * échéance mangée par l'exploration, rejeux sans mesure), un seul effet : le
 * protocole ne confirme rien — et des rapports qui disent « aucune anomalie ».
 * Mesuré sur la campagne : 0/0, 3/3, 3/3, 0/8, 0/13, 24/24, 0/187, 1/22
 * groupes, 38/38, 4/410 groupes. Bimodal : le protocole marche ou il est
 * empêché.
 *
 * Une candidate est REJOUÉE si son groupe a au moins une tentative qui n'a pas
 * échoué par l'outillage (`echecOutillage: false`) — qu'elle ait ensuite été
 * reproduite ou non. Une tentative qui a tourné sans rien mesurer compte comme
 * rejouée : c'est un autre défaut (C-04, contrat 4), qui se lit à côté.
 *
 * Les DEUX comptes se publient : par candidates et par groupes. Ils divergent
 * quand un seul gros groupe est rejoué (demoqa : 20/62 candidates mais 1/22
 * groupes), et c'est le second qui dit la vérité du protocole.
 *
 * Les groupes de DÉCOUVERTE n'entrent dans aucun des deux comptes : ce ne
 * sont pas des candidates du scan que le protocole devait re-tester, ce sont
 * des constats que ses rejeux ont faits en passant, et ils ne sont jamais
 * rejoués par construction (re-confirmation récursive hors périmètre). Les
 * compter « non rejoués » faisait dépendre la métrique du nombre de choses
 * qu'un rejeu RÉUSSI voit — le gabarit « calque-au-rejeu » l'a montré : un
 * protocole qui avait tout rejoué sortait à 25 %. Elles se lisent ailleurs :
 * verdict `decouverte`, et leur compte dans la méthode du rapport. Reconnues
 * au verdict (moteur P2-1) ou au motif (tout moteur, pour que l'« avant » de
 * `banc:reel` se compte de la même façon).
 *
 * Le type est STRUCTUREL, volontairement : la fonction ne dépend que de ce
 * qu'elle lit, et le typecheck rougit si le rapport technique change de forme.
 */
import type { VerdictConfirmation } from '../../types.js';
import { MOTIF_CONSTATEE_AU_REJEU } from './decouvertes.js';

const VERDICT_DECOUVERTE: VerdictConfirmation = 'decouverte';
const VERDICT_SANS_EFFET: VerdictConfirmation = 'sans-effet';

export interface Rejouabilite {
  candidates: number;
  candidatesRejouees: number;
  groupes: number;
  groupesRejoues: number;
}

export interface RapportPourRejouabilite {
  groupes?: readonly {
    groupe: { membres: readonly unknown[] };
    tentatives: readonly { echecOutillage: boolean }[];
    verdict?: string;
    motif?: string;
  }[];
}

/** Un groupe de découverte : ni candidate du scan, ni rejouable (voir l'en-tête). */
function estGroupeDecouverte(resultat: { verdict?: string; motif?: string }): boolean {
  return resultat.verdict === VERDICT_DECOUVERTE || resultat.motif === MOTIF_CONSTATEE_AU_REJEU;
}

/**
 * Un groupe de tiers sans effet (P2-2, contrat 1) : écarté d'office, jamais
 * destiné au rejeu. Le compter « non rejoué » ferait payer au protocole un
 * rejeu que la doctrine lui interdit.
 */
function estGroupeSansEffet(resultat: { verdict?: string }): boolean {
  return resultat.verdict === VERDICT_SANS_EFFET;
}

export function tauxRejouabilite(rapport: RapportPourRejouabilite): Rejouabilite {
  let candidates = 0;
  let candidatesRejouees = 0;
  let groupesRejoues = 0;
  const groupes = (rapport.groupes ?? []).filter((resultat) => !estGroupeDecouverte(resultat) && !estGroupeSansEffet(resultat));
  for (const resultat of groupes) {
    const membres = resultat.groupe.membres.length;
    candidates += membres;
    if (resultat.tentatives.some((tentative) => !tentative.echecOutillage)) {
      candidatesRejouees += membres;
      groupesRejoues += 1;
    }
  }
  return { candidates, candidatesRejouees, groupes: groupes.length, groupesRejoues };
}
