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
 * Fusionne les paires que leur contre-épreuve réunit.
 *
 * Le SURVIVANT est le résultat dont la contre-épreuve a prouvé la symétrie —
 * c'est lui qui porte la preuve. L'absorbé lui cède ses membres, ses
 * localisations et ses observations ; ses preuves ne disparaissent donc pas,
 * elles changent de dossier.
 */
export function fusionnerParContreEpreuve(resultats: readonly ResultatGroupe[]): IssueFusion {
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
    const survivant = famille.find(aVuLaSymetrie);
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
