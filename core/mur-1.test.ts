/**
 * MUR 1 — AUCUN TEXTE UTILISATEUR DANS LE CODE.
 *
 * La constitution §2 l'exige depuis le premier jour, et jusqu'ici seuls le
 * lint et la relecture humaine le tenaient. Une règle que rien ne mesure finit
 * par être crue plutôt que vérifiée : cette garde la rend mécanique.
 *
 * ── LE CRITÈRE EST STRUCTUREL, ET IL LE DOIT ────────────────────────────────
 *
 * Une garde qui chercherait des MOTS français ou anglais violerait elle-même
 * le mur qu'elle défend. Elle ne lit donc aucun vocabulaire : est suspecte une
 * chaîne littérale qui a la FORME d'une phrase — au moins quatre groupes
 * séparés d'espaces, terminée par une ponctuation de fin. C'est une propriété
 * typographique, universelle, vraie d'un texte japonais comme d'un texte
 * français.
 *
 * Ce que le critère laisse passer, assumé : un libellé d'un ou deux mots
 * (« Envoyer »), qui serait un texte utilisateur sans en avoir la forme. Ce
 * que la relecture doit continuer de chercher.
 *
 * ── CE QUI N'EST PAS DANS LE PÉRIMÈTRE, ET POURQUOI ─────────────────────────
 *
 * - les fichiers de test : ils CITENT le texte attendu, c'est leur métier ;
 * - `prompts/` : ce sont des instructions adressées à un MODÈLE, pas à un
 *   utilisateur. Elles sont en prose par nature, et leur régime de protection
 *   est le versionnement (constitution §6), pas le mur 1 ;
 * - `locales/` et `config/` : des JSON, c'est-à-dire précisément la bonne
 *   destination.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIERS_GARDES = ['core', 'banc'];

/**
 * L'UNIQUE exception, et son régime.
 *
 * `core/rapport/voix.ts` porte les TEXTES À GARANTIE SÉMANTIQUE (constitution
 * §2) : des phrases qui n'énoncent pas une traduction mais une PROMESSE — ce
 * que le produit a le droit d'affirmer sous chaque statut épistémique. Les
 * mettre en `locales/` les rendrait modifiables sans revue, et une formulation
 * qui promet plus que son statut détruirait le différenciateur n°1 sans
 * qu'aucun test ne rougisse.
 *
 * Leur régime n'est donc pas celui des locales mais celui des prompts :
 * complétude imposée par le typage (toute langue × tout statut), et
 * modification sous revue. Ce que ce fichier gagne en exception, il le paie en
 * garanties — c'est `voix.exhaustivite.test.ts` qui les tient.
 */
const EXCEPTIONS = ['core/rapport/voix.ts'];

/** Au moins quatre groupes séparés d'espaces, terminés par une ponctuation de fin. */
const FORME_DE_PHRASE = /^\S+(?: \S+){3,}[.!?…]$/u;
const LITTERAL = /(?<![\w$])'((?:[^'\\\n]|\\.){12,})'|"((?:[^"\\\n]|\\.){12,})"/gu;
const COMMENTAIRE_BLOC = /\/\*[\s\S]*?\*\//g;
const COMMENTAIRE_LIGNE = /\/\/[^\n]*/g;

/** Les phrases littérales d'un source, commentaires retirés. */
export function phrasesLitterales(source: string): string[] {
  const sansCommentaires = source.replace(COMMENTAIRE_BLOC, '').replace(COMMENTAIRE_LIGNE, '');
  const trouvees: string[] = [];
  for (const occurrence of sansCommentaires.matchAll(LITTERAL)) {
    const texte = occurrence[1] ?? occurrence[2] ?? '';
    if (FORME_DE_PHRASE.test(texte)) {
      trouvees.push(texte);
    }
  }
  return trouvees;
}

async function fichiersSources(dossier: string): Promise<string[]> {
  const entrees = await readdir(path.join(RACINE, dossier), { withFileTypes: true });
  const fichiers = await Promise.all(
    entrees.map(async (entree) => {
      const relatif = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) return fichiersSources(relatif);
      return entree.name.endsWith('.ts') && !entree.name.endsWith('.test.ts') && !entree.name.startsWith('aide-tests')
        ? [relatif]
        : [];
    }),
  );
  return fichiers.flat();
}

describe('mur 1 : aucun texte utilisateur dans le code', () => {
  it('aucun module du moteur ni du banc ne porte de phrase, hors l’exception nommée', async () => {
    const dossiers = await Promise.all(DOSSIERS_GARDES.map(fichiersSources));
    const coupables: string[] = [];
    for (const fichier of dossiers.flat()) {
      if (EXCEPTIONS.includes(fichier)) continue;
      const phrases = phrasesLitterales(await readFile(path.join(RACINE, fichier), 'utf8'));
      if (phrases.length > 0) coupables.push(`${fichier} : ${phrases[0]}`);
    }
    expect(coupables).toEqual([]);
  });

  it('la garde sait ACCUSER : un module fabriqué qui porterait une phrase serait relevé', () => {
    // Sans ce contre-cas, la garde passerait aussi si son détecteur ne
    // détectait plus rien du tout.
    expect(phrasesLitterales("const message = 'Votre formulaire ne fonctionne plus.';")).toHaveLength(1);
    // Et dans une autre langue : le critère est typographique, pas lexical.
    expect(phrasesLitterales('const m = "Your contact form is no longer working.";')).toHaveLength(1);
  });

  it('elle n’accuse PAS ce qui n’est pas une phrase : un contrôle qui accuse à tort envoie corriger ce qui marche', () => {
    expect(phrasesLitterales("const type = 'rapport.sans-prose';")).toEqual([]);
    expect(phrasesLitterales("const selecteur = 'body > main > form';")).toEqual([]);
    expect(phrasesLitterales("// Une phrase entière dans un commentaire ne compte pas.")).toEqual([]);
  });

  it('AUCUNE exception morte : une exception qui ne sert plus doit disparaître', async () => {
    // Une liste blanche non confrontée à son détecteur pourrit, et couvre un
    // jour autre chose que ce pour quoi elle a été écrite (APPRENTISSAGES n°13).
    const inutiles: string[] = [];
    for (const fichier of EXCEPTIONS) {
      const phrases = phrasesLitterales(await readFile(path.join(RACINE, fichier), 'utf8'));
      if (phrases.length === 0) inutiles.push(fichier);
    }
    expect(inutiles).toEqual([]);
  });
});
