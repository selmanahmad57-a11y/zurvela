/**
 * Le script en page doit rester sérialisable sous `tsx` (conditions de
 * `pnpm banc`), pas seulement sous Vitest : la sonde `en-page.sonde.ts`
 * est lancée dans un processus tsx et son JSON est vérifié ici.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { depuisRacine } from '../../outils/racine.js';

const executer = promisify(execFile);

/** Point d'entrée JavaScript de tsx (devDependency), lancé avec le Node courant. */
const CLI_TSX = depuisRacine('node_modules', 'tsx', 'dist', 'cli.mjs');
const SONDE = depuisRacine('core', 'scanner', 'exploration', 'en-page.sonde.ts');

interface ResultatSonde {
  page: { liens: string[]; formulaires: { champs: { type: string }[]; declencheur: { balise: string; selecteur: string; attributs: Record<string, string> } | null }[] };
  texte: { titre: string; langueDeclaree: string | null; metadonnees: Record<string, string>; texteVisible: string; tronque: boolean };
  images: { complete: boolean; largeurNaturelle: number }[];
  recouvrements: { element: { attributs: Record<string, string> }; intercepteur: { attributs: Record<string, string> } | null }[];
  mutations: { enZone: boolean }[];
  declencheur: { attributs: Record<string, string> } | null;
  validite: { validationActive: boolean; champsInvalides: string[] };
}

describe('script en page sous tsx', () => {
  it('toutes les commandes s’exécutent dans la page (aucun helper de bundler manquant)', async () => {
    const { stdout, stderr } = await executer(process.execPath, [CLI_TSX, SONDE], { timeout: 25_000 });
    expect(stderr).toBe('');
    const resultat = JSON.parse(stdout) as ResultatSonde;
    expect(resultat.page.liens.map((lien) => new URL(lien).pathname)).toEqual(['/suite', '/produit']);
    expect(resultat.page.formulaires).toHaveLength(2);
    expect(resultat.page.formulaires[0]?.champs.map((champ) => champ.type)).toEqual(['email']);
    expect(resultat.page.formulaires[0]?.declencheur?.balise).toBe('button');
    // Un `input[type=image]` (exclu de `form.elements` par le standard) est bien le déclencheur du second formulaire.
    expect(resultat.page.formulaires[1]?.declencheur?.balise).toBe('input');
    expect(resultat.page.formulaires[1]?.declencheur?.attributs['name']).toBe('d');
    expect(resultat.images).toHaveLength(1);
    expect(resultat.images[0]?.complete).toBe(true);
    expect(resultat.images[0]?.largeurNaturelle).toBeGreaterThan(0);
    // LE CALQUE DE SURVOL N'EST PAS UN RECOUVREMENT SUBI, et le contrôle est
    // posé DANS LES DEUX SENS (cahier P2-3, contrat 3) : la page de sonde
    // porte une carte marchande (calque DANS le lien de la carte : le clic
    // aboutit, rien à signaler) et une bannière venue du dehors (le clic est
    // vraiment barré). Un critère qui ne peut rater que d'un côté ne
    // prouverait que la moitié.
    expect(resultat.recouvrements.map((r) => r.element.attributs['id'])).toEqual(['barre']);
    expect(resultat.recouvrements[0]?.intercepteur?.attributs['id']).toBe('banniere');
    expect(resultat.mutations.some((mutation) => mutation.enZone)).toBe(true);
    expect(resultat.declencheur?.attributs['name']).toBe('b');
    expect(resultat.validite.validationActive).toBe(true);
    expect(resultat.validite.champsInvalides).toEqual([]);
    // Commande de profilage : du texte, jamais de balisage ni de style ni d'élément masqué.
    expect(resultat.texte.titre).toBe('Sonde');
    expect(resultat.texte.langueDeclaree).toBe('fr');
    expect(resultat.texte.metadonnees['description']).toBe('Metadonnee de sonde');
    expect(resultat.texte.texteVisible).toContain('Paragraphe visible.');
    expect(resultat.texte.texteVisible).not.toContain('Masque');
    expect(resultat.texte.texteVisible).not.toContain('<');
    expect(resultat.texte.texteVisible).not.toContain('color: red');
    expect(resultat.texte.tronque).toBe(false);
  }, 30_000);
});
