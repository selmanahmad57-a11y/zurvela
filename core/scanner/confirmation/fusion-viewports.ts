/**
 * UN DÉFAUT, UNE SECTION — la contre-épreuve FUSIONNE au lieu de minorer
 * (cahier P2-3, contrat 5 — carnet C-11).
 *
 * Les groupes d'un détecteur qui dépend du viewport sont clés PAR viewport :
 * le même calque sur desktop et sur mobile fait deux groupes, donc deux
 * sections. La contre-épreuve PROUVE pourtant qu'il s'agit du même défaut —
 * elle est allée le rejouer dans l'autre viewport et l'y a retrouvé
 * (`attendue: false, reproduite: true`). Jusqu'ici, le protocole n'en tirait
 * qu'une baisse de confiance (0,8 → 0,63) : le rapport disait deux fois la
 * même chose, la rédaction payait deux sections, et le lecteur cherchait
 * deux défauts là où il y en avait un.
 *
 * Une preuve ne doit pas se solder par un escompte. Ici elle se solde par
 * une FUSION : un groupe, deux observations, et le malus tombe parce que le
 * doute qu'il payait n'existe plus (`symetrieResolue`).
 *
 * CE QUI NE FUSIONNE PAS, et c'est délibéré : sans jumeau retrouvé — parce
 * que l'autre groupe a été écarté, ou n'a jamais existé —, le malus reste
 * entier. La contre-épreuve a bien constaté une symétrie inattendue, et
 * aucune fusion ne vient la résoudre : le doute demeure, donc son prix.
 *
 * ## LA SECONDE PREUVE (cahier P2-4, contrat du budget réparti)
 *
 * Le budget réparti a révélé que la contre-épreuve ne faisait pas QUE
 * prouver : c'est elle qui fusionnait. Dès qu'un groupe n'a plus les moyens
 * de se la payer, le jumeau de l'autre viewport est rejoué pour son propre
 * compte, et le rapport publie DEUX sections pour un seul défaut — ce que
 * ce module existe précisément pour empêcher. Mesuré sur
 * `recouvrement--q10` : `li:nth-of-type(1)` publié en desktop ET en mobile.
 *
 * La réponse n'est pas de rendre la contre-épreuve obligatoire — ce serait
 * augmenter le budget au lieu de le répartir. C'est de reconnaître la
 * SECONDE forme de la même preuve : deux jumeaux CHACUN rejoué dans son
 * viewport et CHACUN confirmé établissent la symétrie plus solidement
 * qu'une contre-épreuve, qui n'est qu'un rejeu unique dans l'autre
 * viewport. On ne desserre pas la règle « on ne fond que sur preuve » : on
 * admet une preuve plus forte que celle qu'on exigeait.
 *
 * ## QUI SURVIT, et pourquoi ce n'est PAS une question d'ordre
 *
 * Par la contre-épreuve, le survivant s'impose : c'est celui qui porte la
 * preuve. Par la seconde preuve, les deux la portent — il faut donc choisir,
 * et ce choix atteint le client : la catégorie d'un `clic-intercepte` vaut
 * `mobile` ou `fonctionnel` SELON LE VIEWPORT (`d-recouvrement`). Prendre le
 * premier venu, c'est laisser l'ordre de dépense du budget décider de ce que
 * le rapport dit — mesuré sur `recouvrement--q05` : l'anomatie passait de
 * `fonctionnel` à `mobile` et devenait un faux positif.
 *
 * Le survivant est donc celui dont le viewport vient en tête de la liste
 * CONFIGURÉE. L'ordre dans lequel on choisit de dépenser le budget est de
 * l'EFFORT ; il ne décide jamais de l'identité livrée.
 */
import type { ResultatGroupe } from '../../types.js';
import { identiteHorsViewport } from './consolidation.js';

/** Journal : deux groupes de viewport réunis par leur contre-épreuve. */
export const EVENEMENT_FUSION_VIEWPORTS = 'confirmation.fusion-viewports';

export interface Fusion {
  /** Celui qui porte la preuve de symétrie, et qui reste. */
  survivant: ResultatGroupe;
  /** Les clés qu'il a absorbées : ce que le rapport ne publiera plus. */
  absorbees: string[];
}

export interface IssueFusion {
  resultats: ResultatGroupe[];
  fusions: Fusion[];
}

/** Le résultat a-t-il constaté la symétrie inattendue ? */
function aVuLaSymetrie(resultat: ResultatGroupe): boolean {
  const contreEpreuve = resultat.contreEpreuve;
  return contreEpreuve !== undefined && !contreEpreuve.echecOutillage && contreEpreuve.reproduite;
}

/**
 * Le groupe a-t-il été CONFIRMÉ PAR SON PROPRE REJEU ? Un verdict
 * `confirmee` ne suffit pas : la politique `econome` et le seuil de
 * confirmation directe en rendent sans aucune tentative, et un défaut
 * jamais rejoué ne prouve pas la symétrie de quoi que ce soit.
 */
function confirmeParSonRejeu(resultat: ResultatGroupe): boolean {
  return resultat.verdict === 'confirmee' && resultat.tentatives.some((tentative) => !tentative.echecOutillage && tentative.reproduite);
}

/** Le rang du viewport d'un groupe dans la liste configurée ; inconnu = dernier. */
function rangViewport(resultat: ResultatGroupe, ordreViewports: readonly string[]): number {
  const rang = ordreViewports.indexOf(resultat.groupe.representant.reproduction.viewport.nom);
  return rang === -1 ? ordreViewports.length : rang;
}

/**
 * Fusionne les paires que leur contre-épreuve réunit.
 *
 * Le SURVIVANT est le résultat dont la contre-épreuve a prouvé la symétrie —
 * c'est lui qui porte la preuve. L'absorbé lui cède ses membres, ses
 * localisations et ses observations ; ses preuves ne disparaissent donc pas,
 * elles changent de dossier.
 */
export function fusionnerParContreEpreuve(
  resultats: readonly ResultatGroupe[],
  /** Les viewports dans l'ordre de la CONFIG : il décide qui survit, pas l'ordre d'arrivée. */
  ordreViewports: readonly string[],
): IssueFusion {
  const parIdentite = new Map<string, ResultatGroupe[]>();
  for (const resultat of resultats) {
    const identite = identiteHorsViewport(resultat.groupe.representant);
    parIdentite.set(identite, [...(parIdentite.get(identite) ?? []), resultat]);
  }

  const absorbes = new Set<ResultatGroupe>();
  const fusions: Fusion[] = [];
  for (const famille of parIdentite.values()) {
    if (famille.length < 2) {
      continue;
    }
    // LA PREUVE — première route : une contre-épreuve est allée le
    // retrouver ailleurs. Seconde route : CHACUN a été rejoué chez lui et
    // confirmé, ce qui est la même épreuve faite deux fois, donc plus fort.
    const prouvee = famille.some(aVuLaSymetrie) || famille.every(confirmeParSonRejeu);
    // QUI SURVIT — jamais le porteur de la preuve, toujours le viewport de
    // tête : la preuve dit qu'il faut fondre, la config dit sous quelle
    // identité le rapport publie.
    const survivant = prouvee
      ? [...famille].sort((a, b) => rangViewport(a, ordreViewports) - rangViewport(b, ordreViewports))[0]
      : undefined;
    if (survivant === undefined) {
      // Personne n'a PROUVÉ que c'était le même défaut : deux groupes qui se
      // ressemblent ne sont pas un groupe. On ne fond que sur preuve.
      continue;
    }
    const absorbees: string[] = [];
    for (const autre of famille) {
      if (autre === survivant || absorbes.has(autre)) {
        continue;
      }
      absorbes.add(autre);
      absorbees.push(autre.groupe.cle);
      survivant.groupe = {
        ...survivant.groupe,
        membres: [...survivant.groupe.membres, ...autre.groupe.membres],
        localisations: [...survivant.groupe.localisations, ...autre.groupe.localisations],
        observations: [...survivant.groupe.observations, ...autre.groupe.observations],
      };
    }
    if (absorbees.length > 0) {
      fusions.push({ survivant, absorbees });
    }
  }

  return { resultats: resultats.filter((resultat) => !absorbes.has(resultat)), fusions };
}
