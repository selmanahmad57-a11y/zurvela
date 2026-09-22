/**
 * Choix des valeurs de test pour un formulaire, à partir des attributs
 * TECHNIQUES des champs (type, autocomplete) et des règles de
 * config/scanner.json — jamais d'un libellé (Mur 1). Les valeurs sont
 * marquées (constitution §3) et vivent en config.
 */
import type { DescriptionFormulaire, ValeurChamp } from '../../types.js';
import type { ConfigScanner } from '../config.js';

/** Types d'entrée qui reçoivent la valeur texte par défaut faute de règle. */
const TYPES_TEXTE = ['text', 'search', 'textarea', ''];

/** Jetons d'un attribut `autocomplete` (liste d'espaces, standard HTML). */
function jetonsAutocomplete(autocomplete: string | null): string[] {
  return (autocomplete ?? '').split(/\s+/).filter((jeton) => jeton !== '');
}

export function choisirValeurs(formulaire: DescriptionFormulaire, config: ConfigScanner['remplissage']): ValeurChamp[] {
  const valeurs: ValeurChamp[] = [];
  for (const champ of formulaire.champs) {
    if (config.typesIgnores.includes(champ.type)) {
      continue;
    }
    if (champ.type === 'select') {
      // Première option à valeur technique non vide ; un select sans option utile est laissé tel quel.
      const option = (champ.options ?? []).find((valeur) => valeur !== '');
      if (option !== undefined) {
        valeurs.push({ champ: champ.localisation, valeur: option });
      }
      continue;
    }
    const jetons = jetonsAutocomplete(champ.autocomplete);
    const regle = config.regles.find(
      (candidate) => candidate.types.includes(champ.type) || jetons.some((jeton) => candidate.autocomplete.includes(jeton)),
    );
    if (regle !== undefined) {
      valeurs.push({ champ: champ.localisation, valeur: regle.valeur });
    } else if (TYPES_TEXTE.includes(champ.type)) {
      valeurs.push({ champ: champ.localisation, valeur: config.valeurTexteParDefaut });
    }
  }
  return valeurs;
}
