/**
 * Fabriques de contextes de diagnostic pour les tests de `core/ia`.
 *
 * Elles vivent dans un module ordinaire — et non dans un fichier de test —
 * parce que plusieurs suites en dépendent (prompt, clé de cassette, rejeu) et
 * qu'un contexte recopié partout dériverait : les suites cesseraient de parler
 * du même objet.
 *
 * ── SUR LA FORME DES EXTRAITS ───────────────────────────────────────────────
 *
 * Les extraits écrits ici imitent la forme d'une `TentativeReexecution`
 * sérialisée (numéro, viewport, reproduction, échec d'outillage, cause,
 * identifiant d'erreur, durée) : c'est ce que le protocole possède au moment
 * où il appelle le diagnostic. Ce sont néanmoins des fixtures de TEST UNITAIRE,
 * pas le corpus de mesure — le corpus, lui, doit être dérivé d'un journal réel
 * du banc, et c'est le flux qui possède le journal qui le construit. Rien de ce
 * qui est mesuré ne dépend de ces chaînes : elles ne servent qu'à éprouver la
 * validation, la relance et la neutralisation.
 */
import type { ContexteDiagnostic } from './index.js';

/**
 * Extraits d'un résidu type : deux tentatives qui n'ont rien reproduit et dont
 * la cause d'échec est elle-même `indetermine` — exactement le résidu dont le
 * diagnostic est le client.
 */
export const EXTRAITS_RESIDU: readonly string[] = [
  'tentative 1 viewport=bureau reproduite=false echecOutillage=true causeEchec=indetermine erreur=navigation-interrompue dureeMs=15043',
  'tentative 2 viewport=mobile reproduite=false echecOutillage=true causeEchec=indetermine erreur=navigation-interrompue dureeMs=15011',
  'contre-epreuve viewport=bureau reproduite=false echecOutillage=true attendue=false',
];

/** Un contexte de diagnostic complet, que chaque test ajuste par `modifications`. */
export function contexteDeTest(modifications: Partial<ContexteDiagnostic> = {}): ContexteDiagnostic {
  return {
    groupe: 'g-formulaire-commande',
    description: 'F03:soumission-sans-retour',
    extraits: [...EXTRAITS_RESIDU],
    ...modifications,
  };
}
