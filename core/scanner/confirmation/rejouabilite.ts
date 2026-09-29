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
 * Le type est STRUCTUREL, volontairement : la fonction ne dépend que de ce
 * qu'elle lit, et le typecheck rougit si le rapport technique change de forme.
 */
export interface Rejouabilite {
  candidates: number;
  candidatesRejouees: number;
  groupes: number;
  groupesRejoues: number;
}

export interface RapportPourRejouabilite {
  groupes?: readonly { groupe: { membres: readonly unknown[] }; tentatives: readonly { echecOutillage: boolean }[] }[];
}

export function tauxRejouabilite(rapport: RapportPourRejouabilite): Rejouabilite {
  let candidates = 0;
  let candidatesRejouees = 0;
  let groupesRejoues = 0;
  const groupes = rapport.groupes ?? [];
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
