/**
 * DÉPOUILLEUR DU GRAND TABLEAU — l'instrument qui LIT un run réel (dette n°32).
 *
 * Jusqu'au 2026-10-07 il vivait au scratchpad (`juger.js` + `depouiller-tableau.js`),
 * re-tapé d'un run à l'autre : deux tableaux lus par deux versions ne sont pas
 * comparables, pas plus qu'ils n'étaient JUGÉS de façon comparable avant que
 * l'oracle ne soit committé (n°31). Il devient ici un instrument committé et
 * testé. Sa levée était NATURELLEMENT post-run : il dépend de ce que le tableau
 * contient, et le run du 2026-10-07 a montré sa forme — dont un piège
 * (ci-dessous) que le compte brut aurait laissé fausser le chiffre.
 *
 * CE QU'IL FAIT, et ce qu'il ne fait PAS : il LIT les journaux durables d'un
 * run (les sections publiées, leur nature, leurs preuves, leurs localisations,
 * ce que le moteur a écarté) et tient le CONTRÔLE `blob:` (zéro reponse-lente
 * publiée sur un schéma local). Il N'INVENTE aucun verdict : pour chaque
 * recouvrement, il DONNE À JUGER à l'oracle committé (n°31), en direct. La
 * nature des sections et ce qui a été écarté sont déjà dans le journal — le
 * dépouilleur les expose, il ne les recalcule pas.
 *
 * LE PIÈGE, nommé par le run du 2026-10-07 (le filet du tableau) : juger une
 * victime sur la BONNE PAGE, celle de sa preuve, JAMAIS l'URL racine. Les
 * `#item-N` de demoqa sont des menus latéraux absents de la racine ; les juger
 * sur la racine les rend « introuvables », un artefact d'instrument que le
 * compte brut aurait pris pour une transience — et qui aurait fait disparaître
 * deux vrais positifs (les footers recouverts). `cibleAJuger` lit donc la page
 * dans la preuve, par construction.
 */
import { readFile } from 'node:fs/promises';

/** Schémas d'URL LOCAUX : une ressource « lente » sur l'un d'eux ne mesure pas le réseau, c'est un instantané (contrôle `blob:`). */
export const SCHEMAS_LOCAUX: readonly string[] = ['blob:', 'data:', 'filesystem:', 'about:', 'javascript:'];

/** La description d'une réponse lente — la seule qui doit passer le contrôle `blob:`. Constante de code (ce que le détecteur émet), pas de la prose. */
export const DESCRIPTION_REPONSE_LENTE = 'reponse-lente';
export const DESCRIPTION_CLIC_INTERCEPTE = 'clic-intercepte';

/**
 * Forme MINIMALE d'un journal réel, lue défensivement : le dépouilleur lit des
 * journaux DURABLES qui peuvent venir de versions différentes du moteur, donc
 * il ne se couple pas au type `Rapport` (qui évolue) — il ne déclare que les
 * champs dont il a besoin, tous optionnels à la lecture.
 */
export interface PreuveReel {
  type?: string;
  page?: string;
  viewport?: string;
  urlRessource?: string;
  dureeMs?: number;
  element?: { selecteur?: string } | null;
  intercepteur?: { selecteur?: string } | null;
}
export interface SectionReel {
  description?: string;
  categorie?: string;
  graviteEstimee?: string;
  gravite?: string;
  verdict?: string;
  motif?: string;
  confiance?: number;
  groupe?: string;
  preuves?: PreuveReel[];
  localisations?: { urlOuEtape?: string; element?: { selecteur?: string } | null; viewport?: string }[];
}
export interface JournalReel {
  url?: string;
  anomalies?: SectionReel[];
  ecartees?: { verdict?: string; motif?: string; groupe?: string; cle?: string }[];
}

/** La preuve représentative d'une section : la première, ou un objet vide (lecture défensive). */
function preuvePrincipale(section: SectionReel): PreuveReel {
  return (section.preuves ?? [])[0] ?? {};
}

/** La cible d'une preuve pour le contrôle `blob:` : l'URL de ressource, sinon le sélecteur. */
function cibleDePreuve(section: SectionReel): string {
  const p = preuvePrincipale(section);
  return p.urlRessource ?? p.element?.selecteur ?? section.preuves?.[0]?.element?.selecteur ?? '';
}

/** Une cible à faire juger par l'oracle : la victime, SUR LA PAGE DE SA PREUVE (jamais la racine). */
export interface CibleJugement {
  url: string;
  victime: string;
  viewport: string;
}

/**
 * Pour un recouvrement, extrait quoi juger et OÙ : la victime (`preuve.element`)
 * sur la PAGE de la preuve (`preuve.page`), au viewport de la preuve. `null` si
 * ce n'est pas un recouvrement ou si la preuve ne porte pas de quoi juger.
 *
 * C'est ici que vit la leçon du run : la page vient de la preuve, pas d'une
 * racine par défaut. La juger ailleurs rendrait la victime introuvable.
 */
export function cibleAJuger(section: SectionReel): CibleJugement | null {
  if (section.description !== DESCRIPTION_CLIC_INTERCEPTE) {
    return null;
  }
  const p = preuvePrincipale(section);
  const victime = p.element?.selecteur;
  const url = p.page;
  if (victime === undefined || victime === '' || url === undefined || url === '') {
    return null;
  }
  return { url, victime, viewport: p.viewport ?? 'desktop' };
}

export interface ResultatControleBlob {
  total: number;
  lenteurs: number;
  /** Les reponse-lente publiées sur un schéma LOCAL : elles ne devraient pas exister. */
  suspectes: number;
  suspectesDetail: string[];
  /** true si aucune reponse-lente locale n'a été publiée — le contrôle est tenu. */
  tenu: boolean;
}

/**
 * LE CONTRÔLE `blob:` : aucune `reponse-lente` ne doit être publiée sur un
 * schéma local (un `blob:` se résout en mémoire, une « lenteur » sur lui est un
 * instantané, pas une mesure réseau). Pur, pour être éprouvé par un témoin.
 */
export function controleBlob(journaux: JournalReel[]): ResultatControleBlob {
  let total = 0;
  let lenteurs = 0;
  const suspectesDetail: string[] = [];
  for (const j of journaux) {
    for (const section of j.anomalies ?? []) {
      total += 1;
      if (section.description !== DESCRIPTION_REPONSE_LENTE) {
        continue;
      }
      lenteurs += 1;
      const cible = String(cibleDePreuve(section));
      if (SCHEMAS_LOCAUX.some((schema) => cible.startsWith(schema))) {
        suspectesDetail.push(cible);
      }
    }
  }
  return { total, lenteurs, suspectes: suspectesDetail.length, suspectesDetail, tenu: suspectesDetail.length === 0 };
}

/** Le nom de site, depuis le nom de fichier d'un journal `<site>.apres.journal.json`. */
export function siteDeChemin(chemin: string): string {
  return (chemin.split('/').pop() ?? chemin).replace(/\.apres\.journal\.json$/, '').replace(/\.journal\.json$/, '');
}

/** Lit un journal réel, défensivement. */
export async function lireJournal(chemin: string): Promise<JournalReel> {
  return JSON.parse(await readFile(chemin, 'utf8')) as JournalReel;
}

// ————————————————————————————————————————————————————————————————————————
// Partie EN DIRECT (CLI) : juge chaque recouvrement avec l'oracle committé, sur
// la bonne page. Les fonctions pures ci-dessus sont éprouvées par le témoin ;
// cette partie assemble des pièces déjà prouvées (l'oracle 7/7 + `cibleAJuger`).
// ————————————————————————————————————————————————————————————————————————
import { chromium, type Browser } from 'playwright';
import { scriptOracle, type VerdictOracle } from './oracle-recouvrement.js';

/** Dimensions d'un viewport nommé, lues dans la config de production (jamais en dur). */
async function dimensionsViewports(): Promise<Record<string, { largeur: number; hauteur: number; mobile: boolean }>> {
  const brut = JSON.parse(await readFile(new URL('../config/production.json', import.meta.url), 'utf8')) as {
    viewports?: { nom: string; largeur: number; hauteur: number; mobile?: boolean }[];
  };
  const table: Record<string, { largeur: number; hauteur: number; mobile: boolean }> = {};
  for (const v of brut.viewports ?? []) {
    table[v.nom] = { largeur: v.largeur, hauteur: v.hauteur, mobile: v.mobile === true };
  }
  return table;
}

/** Juge UNE cible avec l'oracle committé, sous l'identité déclarée (ZurvelaBot), sur la page de sa preuve. */
export async function jugerCible(
  navigateur: Browser,
  cible: CibleJugement,
  dims: Record<string, { largeur: number; hauteur: number; mobile: boolean }>,
): Promise<VerdictOracle & { chargement: string }> {
  const vp = dims[cible.viewport] ?? { largeur: 1280, hauteur: 800, mobile: false };
  const contexte = await navigateur.newContext({
    viewport: { width: vp.largeur, height: vp.hauteur },
    ...(vp.mobile ? { isMobile: true, hasTouch: true } : {}),
    userAgent: 'ZurvelaBot/0.1 (+https://zurvela.com)',
    extraHTTPHeaders: { 'X-Zurvela-Scan': '1' },
  });
  const page = await contexte.newPage();
  let chargement = 'ok';
  try {
    await page.goto(cible.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (e) {
    chargement = 'goto : ' + (e instanceof Error ? e.message.split('\n')[0] : String(e));
  }
  try {
    await page.waitForSelector(cible.victime, { state: 'attached', timeout: 20_000 });
  } catch {
    /* l'oracle rendra « introuvable » */
  }
  await page.waitForTimeout(2_500).catch(() => undefined);
  const r = (await page.evaluate(scriptOracle(cible.victime, false)).catch((e: unknown) => ({ verdict: 'erreur' as const, message: String(e) }))) as VerdictOracle;
  await contexte.close();
  return { ...r, chargement };
}

async function principal(): Promise<void> {
  const chemins = process.argv.slice(2);
  if (chemins.length === 0) {
    console.error('Usage : pnpm banc:depouiller-reel <journal.apres.json> [...]');
    process.exitCode = 2;
    return;
  }
  const journaux = await Promise.all(chemins.map(lireJournal));
  const dims = await dimensionsViewports();
  const navigateur = await chromium.launch();
  try {
    for (let i = 0; i < journaux.length; i += 1) {
      const j = journaux[i]!;
      const site = siteDeChemin(chemins[i]!);
      const sections = j.anomalies ?? [];
      console.log(`\n### ${site} — ${sections.length} section(s) publiée(s)  ·  ${j.url ?? '?'}`);
      for (const s of sections) {
        console.log(`   - ${s.description} | ${s.categorie} | ${s.graviteEstimee ?? s.gravite} | ${s.verdict} | ${s.motif} | conf ${Number(s.confiance).toFixed(3)}`);
        console.log(`     groupe : ${s.groupe}`);
        const cible = cibleAJuger(s);
        if (cible !== null) {
          const v = await jugerCible(navigateur, cible, dims);
          console.log(`     ORACLE : ${v.verdict}${v.coinsInterceptes !== undefined ? ` · coins ${v.coinsInterceptes}` : ''} · victime ${cible.victime} @${cible.viewport} · page ${cible.url}${v.chargement !== 'ok' ? ` · ${v.chargement}` : ''}`);
        }
      }
      const ec = j.ecartees ?? [];
      if (ec.length > 0) {
        console.log(`   écartées (${ec.length}) : ${ec.slice(0, 3).map((e) => `${e.verdict}/${e.motif ?? '—'}`).join(' | ')}${ec.length > 3 ? ' …' : ''}`);
      }
    }
  } finally {
    await navigateur.close();
  }
  const c = controleBlob(journaux);
  console.log(`\n==== ${journaux.reduce((n, j) => n + (j.anomalies?.length ?? 0), 0)} section(s) · ${c.lenteurs} reponse-lente · ${c.suspectes} sur schéma local ====`);
  console.log(c.tenu ? `✓ CONTRÔLE blob: TENU · 0/${c.lenteurs} reponse-lente sur schéma local` : `✗ CONTRÔLE blob: ÉCHOUÉ : ${c.suspectesDetail.join(', ')}`);
  if (!c.tenu) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('depouiller-reel.ts') === true) {
  await principal();
}
