/**
 * Internationalisation minimale (constitution §2 : aucun texte utilisateur
 * dans le code).
 *
 * Un dictionnaire est un objet JSON imbriqué ; une clé est un chemin
 * `a.b.c`. Une clé absente est une erreur de programmation : on lève
 * immédiatement plutôt que d'afficher une clé brute à l'utilisateur.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type Dictionnaire = { [cle: string]: string | Dictionnaire };

export type Valeurs = Record<string, string | number>;

/** Motif structurel d'un emplacement `{{chemin.de.cle}}` — aucune langue naturelle. */
const MOTIF_EMPLACEMENT = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Charge `locales/<langue>.json` (ou tout autre dossier de dictionnaires). */
export async function chargerDictionnaire(dossier: string, langue: string): Promise<Dictionnaire> {
  const fichier = path.join(dossier, `${langue}.json`);
  const contenu = await readFile(fichier, 'utf8');
  return JSON.parse(contenu) as Dictionnaire;
}

/** Résout un chemin de clé dans un dictionnaire imbriqué. Lève si la clé manque ou n'est pas une feuille. */
export function chercher(dictionnaire: Dictionnaire, cle: string): string {
  let courant: string | Dictionnaire | undefined = dictionnaire;
  for (const segment of cle.split('.')) {
    if (courant === undefined || typeof courant === 'string') {
      throw new Error(`Clé i18n introuvable : ${cle}`);
    }
    courant = courant[segment];
  }
  if (typeof courant !== 'string') {
    throw new Error(`Clé i18n introuvable : ${cle}`);
  }
  return courant;
}

/** Remplace chaque `{{nom}}` par la valeur correspondante. Un nom absent est une erreur. */
export function interpoler(texte: string, valeurs: Valeurs = {}): string {
  return texte.replace(MOTIF_EMPLACEMENT, (_correspondance, nom: string) => {
    const valeur = valeurs[nom];
    if (valeur === undefined) {
      throw new Error(`Valeur d'interpolation manquante : ${nom}`);
    }
    return String(valeur);
  });
}

/** Traduit une clé et interpole ses valeurs. */
export function traduire(dictionnaire: Dictionnaire, cle: string, valeurs?: Valeurs): string {
  return interpoler(chercher(dictionnaire, cle), valeurs);
}

/**
 * Remplace chaque `{{chemin.de.cle}}` d'un gabarit de texte (ex. une page
 * HTML) par la traduction correspondante.
 */
export function rendreGabarit(gabarit: string, dictionnaire: Dictionnaire): string {
  return gabarit.replace(MOTIF_EMPLACEMENT, (_correspondance, cle: string) =>
    chercher(dictionnaire, cle),
  );
}
