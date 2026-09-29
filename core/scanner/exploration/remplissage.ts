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

/**
 * Signature STRUCTURELLE d'un formulaire : méthode, cible et la liste ordonnée
 * de ses champs (type, autocomplete, requis) — jamais un sélecteur ni un
 * texte. Deux formulaires de même signature sur une page sont le même
 * formulaire répété (une carte produit par article) ; le remplir deux fois
 * n'apprend rien.
 */
export function signatureFormulaire(formulaire: DescriptionFormulaire): string {
  const champs = formulaire.champs.map((champ) => `${champ.type}:${champ.autocomplete ?? ''}:${champ.requis ? '1' : '0'}`);
  return [formulaire.methode, formulaire.action, ...champs].join('|');
}
