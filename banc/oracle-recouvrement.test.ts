/**
 * TÉMOIN de l'oracle de jugement du recouvrement (dette n°31).
 *
 * Sept gabarits à réponse CONNUE D'AVANCE prouvent l'oracle 7/7. Deux d'entre
 * eux (cas 1 et 6) sont des TÉMOINS DE DISCRIMINATION : on y relance la variante
 * BIAISÉE (défilement-vers-le-centre, l'ancien bug n°48) et on EXIGE qu'elle
 * BASCULE — un gabarit ne prouve que l'oracle a raison POUR LA BONNE RAISON que
 * si un oracle faux, lui, s'y trompe.
 *
 * C'est cette re-preuve, re-lancée après l'extraction du scratchpad, qui
 * garantit que la logique de jugement n'a pas dérivé en devenant un instrument
 * committé — la condition de levée de la dette n°31.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { scriptOracle, type VerdictOracle } from './oracle-recouvrement.js';

const page = (corps: string, style = ''): string => `<!doctype html><html><head><meta charset="utf8"><style>
  body{margin:0;font-family:sans-serif}
  a,button{display:inline-block}
  ${style}
</style></head><body>${corps}</body></html>`;

interface Cas {
  nom: string;
  viewport: { width: number; height: number };
  sel: string;
  attendu: VerdictOracle['verdict'];
  attenduCoins?: number;
  /** true : témoin de discrimination — la variante biaisée DOIT basculer. */
  demoBiais?: boolean;
  html: string;
}

const CAS: Cas[] = [
  {
    nom: '1. fixed couvrant (le bug n°48 : demoqa #root>footer)',
    viewport: { width: 1280, height: 720 },
    sel: '#cible',
    attendu: 'recouvert',
    demoBiais: true,
    html: page(
      `<a id="cible" href="#">Cible</a><div id="barre">barre fixe</div>`,
      `body{height:2000px}
       #cible{position:absolute;top:650px;left:100px;width:140px;height:40px;background:#cde;line-height:40px;text-align:center}
       #barre{position:fixed;left:0;right:0;bottom:0;height:120px;background:#333;color:#fff;z-index:10;line-height:120px;text-align:center}`,
    ),
  },
  {
    nom: '2a. calque MOBILE au viewport mobile',
    viewport: { width: 375, height: 667 },
    sel: '#cible',
    attendu: 'recouvert',
    html: page(
      `<a id="cible" href="#">Cible</a><div id="drawer">menu mobile</div>`,
      `#cible{position:absolute;top:40px;left:20px;width:160px;height:40px;background:#cde;line-height:40px;text-align:center}
       #drawer{display:none}
       @media (max-width:767px){#drawer{display:block;position:fixed;top:0;left:0;right:0;height:200px;background:#700;color:#fff;z-index:10}}`,
    ),
  },
  {
    nom: '2b. MÊME calque au viewport desktop (ne doit PAS accuser)',
    viewport: { width: 1280, height: 720 },
    sel: '#cible',
    attendu: 'cliquable',
    html: page(
      `<a id="cible" href="#">Cible</a><div id="drawer">menu mobile</div>`,
      `#cible{position:absolute;top:40px;left:20px;width:160px;height:40px;background:#cde;line-height:40px;text-align:center}
       #drawer{display:none}
       @media (max-width:767px){#drawer{display:block;position:fixed;top:0;left:0;right:0;height:200px;background:#700;color:#fff;z-index:10}}`,
    ),
  },
  {
    nom: '3. couverture PARTIELLE, centre libre (doctrine : cliquable + coin observé)',
    viewport: { width: 1280, height: 720 },
    sel: '#cible',
    attendu: 'cliquable',
    attenduCoins: 1,
    html: page(
      `<a id="cible" href="#">Cible</a><div id="coin">x</div>`,
      `#cible{position:absolute;top:100px;left:100px;width:200px;height:80px;background:#cde}
       #coin{position:absolute;top:100px;left:100px;width:60px;height:30px;background:#700;z-index:10}`,
    ),
  },
  {
    nom: '4. vraiment cliquable, rien dessus (ne doit PAS sur-accuser)',
    viewport: { width: 1280, height: 720 },
    sel: '#cible',
    attendu: 'cliquable',
    attenduCoins: 0,
    html: page(
      `<a id="cible" href="#">Cible</a>`,
      `#cible{position:absolute;top:100px;left:100px;width:200px;height:80px;background:#cde}`,
    ),
  },
  {
    nom: '5. surface de survol DANS la même ancre (motif des 1428 faux positifs)',
    viewport: { width: 1280, height: 720 },
    sel: '#cible',
    attendu: 'cliquable',
    html: page(
      `<a id="carte" href="#"><span id="cible">Titre</span><div id="surface"></div></a>`,
      `#carte{position:absolute;top:100px;left:100px;width:200px;height:120px;display:block}
       #cible{position:absolute;top:10px;left:10px}
       #surface{position:absolute;inset:0;z-index:5}`,
    ),
  },
  {
    nom: '6. victime SOUS LA LIGNE DE FLOTTAISON, barre fixe en haut (passe défilement-naturel)',
    viewport: { width: 1280, height: 720 },
    sel: '#cible',
    attendu: 'recouvert',
    demoBiais: true,
    html: page(
      `<div id="entete">en-tête fixe</div><a id="cible" href="#">Cible</a>`,
      `body{height:2000px}
       #entete{position:fixed;top:0;left:0;right:0;height:150px;background:#333;color:#fff;z-index:10;line-height:150px;text-align:center}
       #cible{position:absolute;top:1000px;left:100px;width:160px;height:40px;background:#cde;line-height:40px;text-align:center}`,
    ),
  },
];

let navigateur: Browser;
beforeAll(async () => {
  navigateur = await chromium.launch();
});
afterAll(async () => {
  await navigateur.close();
});

async function juger(cas: Cas, biaise: boolean): Promise<VerdictOracle> {
  const p = await navigateur.newPage();
  try {
    await p.setViewportSize(cas.viewport);
    await p.setContent(cas.html, { waitUntil: 'load' });
    return (await p.evaluate(scriptOracle(cas.sel, biaise))) as VerdictOracle;
  } finally {
    await p.close();
  }
}

describe('dette n°31 — l’oracle de jugement du recouvrement, éprouvé contre son biais (n°48)', () => {
  for (const cas of CAS) {
    it(`${cas.nom} → ${cas.attendu}`, async () => {
      const r = await juger(cas, false);
      expect(r.verdict, `reçu au centre : ${r.recuAuCentre ?? '—'}`).toBe(cas.attendu);
      if (cas.attenduCoins !== undefined) {
        expect(r.coinsInterceptes).toBe(cas.attenduCoins);
      }
    }, 30_000);

    if (cas.demoBiais === true) {
      it(`${cas.nom} → DISCRIMINE : la variante biaisée (défilement-centre) bascule`, async () => {
        const r = await juger(cas, true);
        // La preuve que le gabarit discrimine : un oracle qui centre se trompe
        // ICI. S'il ne basculait pas, le gabarit ne prouverait pas que le bon
        // verdict vient de la BONNE raison.
        expect(r.verdict).not.toBe(cas.attendu);
      }, 30_000);
    }
  }
});
