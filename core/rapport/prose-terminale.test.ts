/**
 * GARDE : LA PROSE EST TERMINALE.
 *
 * « Aucune logique ne lit le texte rédigé » est l'affirmation la plus forte de
 * la brique 5, et c'est la plus facile à rendre fausse par inadvertance : il
 * suffit qu'un jour une condition branche sur le contenu d'un `constat`, ou
 * qu'un appariement se fasse sur un `titre`, pour que la prose d'un modèle —
 * influençable par le site inspecté — se mette à décider quelque chose.
 *
 * La garde est écrite sur le modèle de celle du pont des vocabulaires : elle
 * parcourt le dépôt, et elle sait ACCUSER (le dernier test lui soumet un faux
 * coupable). Deux modules sont exemptés, et pour deux raisons différentes :
 * `index.ts` RECOPIE la prose depuis la réponse du modèle vers la structure,
 * `rendu.ts` l'AFFICHE. Afficher n'est pas lire au sens de la règle — rien de
 * ce qui est écrit dans ces deux fichiers ne branche sur le contenu d'une
 * phrase.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHAMPS_PROSE_GLOBAUX, CHAMPS_PROSE_SECTION } from '../ia/schema-redaction.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Périmètre gardé : tout le moteur et tout le banc. */
const DOSSIERS_GARDES = ['core', 'banc'];

/**
 * Les modules autorisés à TOUCHER la prose, et ce qu'ils en font.
 *
 * - `core/rapport/index.ts` : la recopie depuis la réponse du modèle.
 * - `core/rapport/rendu.ts` : l'affiche.
 * - `banc/correcteur/rapport.ts` : COMPTE les sections rédigées (`titre !==
 *   ''`), ce qui est une lecture de PRÉSENCE, pas de contenu.
 * - `banc/correcteur/langue-prose.ts` : MESURE LA LANGUE de la prose, et c'est
 *   bien une lecture de CONTENU — la seule du dépôt.
 *
 * ── POURQUOI LA DERNIÈRE EST LÉGITIME, ET CE QU'ELLE A COÛTÉ ────────────────
 *
 * La revue a trouvé la faille ici même : ce contenu était lu depuis
 * `banc/correcteur/rapport.ts`, exempté EN BLOC au motif qu'il ne faisait
 * qu'une lecture de présence. Le commentaire décrivait une seule des deux
 * lectures du fichier, et la garde le croyait — un contrat faux est cru
 * (APPRENTISSAGES n°6). L'exemption étant par FICHIER, tout branchement futur
 * sur une phrase y serait resté invisible.
 *
 * La lecture a donc été déplacée dans le module dont c'est le métier, et elle
 * y est permise pour trois raisons qui doivent tenir ENSEMBLE : c'est un
 * INSTRUMENT DE MESURE et non le produit (aucune décision de scan, aucun
 * contenu de rapport n'en dépend) ; elle ne lit pas le SENS mais compte des
 * mots-outils d'une classe fermée ; et son verdict ne sert qu'à faire rougir
 * le banc. Qu'une seule de ces trois tombe, et l'exemption doit tomber avec.
 */
const AUTORISES = [
  'core/rapport/index.ts',
  'core/rapport/rendu.ts',
  'banc/correcteur/rapport.ts',
  'banc/correcteur/langue-prose.ts',
];

/** Les six champs de prose, en une seule source : celle du contrat. */
const CHAMPS_PROSE: readonly string[] = [...CHAMPS_PROSE_SECTION, ...CHAMPS_PROSE_GLOBAUX];

async function fichiersSources(dossier: string): Promise<string[]> {
  const entrees = await readdir(path.join(RACINE, dossier), { withFileTypes: true });
  const fichiers = await Promise.all(
    entrees.map(async (entree) => {
      const relatif = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) {
        return fichiersSources(relatif);
      }
      return entree.name.endsWith('.ts') && !entree.name.endsWith('.test.ts') && !entree.name.startsWith('aide-tests')
        ? [relatif]
        : [];
    }),
  );
  return fichiers.flat();
}

/**
 * Les TYPES par lesquels la prose du rapport voyage. Un fichier qui n'en
 * nomme aucun ne peut pas lire la prose d'un rapport, quoi qu'il fasse de ses
 * propres champs.
 *
 * Cette seconde condition n'est pas une commodité, c'est ce qui rend la garde
 * JUSTE. « titre » et « constat » sont des mots ordinaires : le profileur lit
 * le `titre` d'une page, le validateur Ajv lit ses `constats` d'invalidité, un
 * gabarit déclare la clé i18n d'un `titre`. Une garde purement textuelle les
 * accuserait tous — et une garde qui accuse le mauvais coupable envoie
 * corriger ce qui fonctionne (APPRENTISSAGES n°6). C'est la même construction
 * à deux marqueurs que la garde d'unicité du pont des vocabulaires : c'est
 * leur RENCONTRE qui est suspecte.
 */
const TYPES_DU_RAPPORT = ['RapportBusiness', 'SectionRapport', 'ProseSection', 'RedactionEstampillee'];

function nommeLeRapport(source: string): boolean {
  return TYPES_DU_RAPPORT.some((type) => new RegExp(String.raw`\b${type}\b`).test(source));
}

/**
 * Un fichier LIT la prose s'il accède à l'un des six champs par un accesseur
 * de propriété. La déclaration d'une interface (`titre: string;`) n'en est pas
 * une : c'est un contrat, pas une lecture. Le garde-fou `(?![A-Za-z0-9_])`
 * distingue `.constat` de `.constats`, deux choses sans rapport.
 */
function litLaProse(source: string): string[] {
  return CHAMPS_PROSE.filter((champ) => {
    // L'accès par POINT (`section.constat`) et l'accès par CROCHETS
    // (`section['constat']`) sont la même lecture. Ne garder que le premier
    // laissait à la garde un contournement d'un caractère — et une garde
    // qu'on contourne sans le vouloir est une garde absente.
    const parPoint = new RegExp(String.raw`\.${champ}(?![A-Za-z0-9_])`);
    const parCrochets = new RegExp(String.raw`\[\s*['"\`]${champ}['"\`]\s*\]`);
    return parPoint.test(source) || parCrochets.test(source);
  });
}

/** Suspect = il NOMME un type du rapport ET il lit un champ de prose. */
function toucheLaProse(source: string): string[] {
  return nommeLeRapport(source) ? litLaProse(source) : [];
}

describe('garde : la prose du rapport est terminale', () => {
  it('aucun module du moteur ni du banc ne lit un champ de prose, hors les modules autorisés', async () => {
    const dossiers = await Promise.all(DOSSIERS_GARDES.map(fichiersSources));
    const coupables: string[] = [];
    for (const fichier of dossiers.flat()) {
      if (AUTORISES.includes(fichier)) {
        continue;
      }
      const source = await readFile(path.join(RACINE, fichier), 'utf8');
      if (toucheLaProse(source).length > 0) {
        coupables.push(`${fichier} (${toucheLaProse(source).join(', ')})`);
      }
    }
    expect(coupables).toEqual([]);
  });

  it('la garde a du grain à moudre : les modules autorisés, EUX, y touchent bien', async () => {
    // Sans ce contre-cas, la garde passerait aussi si son détecteur ne
    // détectait plus rien du tout.
    const rendu = await readFile(path.join(RACINE, 'core/rapport/rendu.ts'), 'utf8');
    expect(toucheLaProse(rendu).length).toBeGreaterThan(0);
  });

  it('AUCUNE exemption morte : un module qui ne touche plus la prose n’a plus à être exempté', async () => {
    // Une liste d'exemptions n'est jamais confrontée à son propre détecteur,
    // et c'est ainsi qu'elle pourrit : le jour où un module cesse de toucher
    // la prose, son laissez-passer reste, prêt à couvrir autre chose. Chaque
    // ligne de la liste doit donc justifier sa présence à chaque exécution.
    const inutiles: string[] = [];
    for (const fichier of AUTORISES) {
      const source = await readFile(path.join(RACINE, fichier), 'utf8');
      if (toucheLaProse(source).length === 0) {
        inutiles.push(fichier);
      }
    }
    expect(inutiles).toEqual([]);
  });

  it('la garde sait ACCUSER : un module fabriqué qui brancherait sur une phrase serait relevé', () => {
    const fauxModule =
      "function classer(section: SectionRapport) { if (section.constat.includes('formulaire')) return 'fonctionnel'; }";
    expect(toucheLaProse(fauxModule)).toContain('constat');
  });

  it('la garde voit l’accès par CROCHETS autant que l’accès par point', () => {
    const parCrochets = "function f(s: SectionRapport) { return s['constat'].length; }";
    expect(toucheLaProse(parCrochets)).toContain('constat');
    const parPoint = 'function f(s: SectionRapport) { return s.constat.length; }';
    expect(toucheLaProse(parPoint)).toContain('constat');
  });

  it('une DÉCLARATION de champ n’est pas une lecture', () => {
    expect(toucheLaProse('export interface ProseSection { titre: string; constat: string; }')).toEqual([]);
  });

  it('les homonymes NE SONT PAS accusés : le titre d’une page, les constats d’Ajv', () => {
    // C'est la moitié qui manquait à une garde purement textuelle, et elle est
    // éprouvée plutôt que promise.
    expect(toucheLaProse("const titre = metadonnees.titre ?? '';")).toEqual([]);
    expect(toucheLaProse('return { valide: false, constats: validation.constats };')).toEqual([]);
    // Même dans un module qui parle du rapport, `.constats` reste `.constats`.
    expect(toucheLaProse('function f(r: RapportBusiness) { return validation.constats; }')).toEqual([]);
  });

  it('les six champs gardés sont ceux du contrat, en une seule source', () => {
    expect(CHAMPS_PROSE).toEqual(['titre', 'constat', 'impact', 'actionSuggeree', 'synthese', 'ligneMethode']);
  });
});
