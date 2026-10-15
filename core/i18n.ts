/**
 * Internationalisation minimale (constitution §2 : aucun texte utilisateur
 * dans le code).
 *
 * Les traitements PURS — `chercher` / `interpoler` / `traduire` / `rendreGabarit`
 * et les types — vivent dans `deploiement/ui/i18n.js` : SOURCE UNIQUE partagée avec
 * le NAVIGATEUR (qui ne peut importer que ce qui lui est servi dans le webroot). Ce
 * module les RÉ-EXPORTE et n'ajoute que le seul morceau serveur, `chargerDictionnaire`
 * (lecture de fichier). Les importeurs existants de `core/i18n.js` ne changent pas :
 * mêmes symboles, et `chercher` ici EST le `chercher` que le navigateur exécute.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Dictionnaire } from '../deploiement/ui/i18n.js';

export { chercher, interpoler, traduire, rendreGabarit } from '../deploiement/ui/i18n.js';
export type { Dictionnaire, Valeurs } from '../deploiement/ui/i18n.js';

/** Charge `locales/<langue>.json` (ou tout autre dossier de dictionnaires). */
export async function chargerDictionnaire(dossier: string, langue: string): Promise<Dictionnaire> {
  const fichier = path.join(dossier, `${langue}.json`);
  const contenu = await readFile(fichier, 'utf8');
  return JSON.parse(contenu) as Dictionnaire;
}
