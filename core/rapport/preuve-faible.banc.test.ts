/**
 * TÉMOIN de la voie A — minorer les recouvrements à PREUVE FAIBLE (cahier de
 * voix), sur le banc, vrai navigateur, vrai chemin épistémique.
 *
 * LE PIÈGE ÉVITÉ (n°30/dette n°26) : la preuve faible NAÎT par le vrai chemin,
 * pas injectée à la main. Le gabarit `calque-au-rejeu` (D01 + D02) fait
 * apparaître un calque SEULEMENT au rejeu d'un autre défaut — donc une
 * DÉCOUVERTE de recouvrement (`decouverte` / `constatee-au-rejeu`), jamais
 * passée par le test de persistance. C'est la miniature déterministe de la pub
 * transitoire du grand tableau (`#aswift_N`). Mesuré : ce calque sort
 * aujourd'hui en `gravite: important` — la fausse alarme qu'un commerçant
 * verrait sur sa propre pub.
 *
 * ATTENDU APRÈS la voie A : la section reste PUBLIÉE (le doute ne se tait pas),
 * mais MINORÉE — `gravite: mineur` + voix honnête (« observé une fois, non
 * reproduit »). ROUGE AUJOURD'HUI : `important`, voix générique.
 *
 * La minoration est AU NIVEAU DU RAPPORT : l'anomalie garde `important` au
 * journal (empreinte inchangée, équivalence additive) ; seule la présentation
 * change. Le gabarit `calque-au-rejeu` garde donc son attendu d'origine
 * (découverte / important au niveau anomalie) — vérifié vert à part.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../../banc/config.js';
import { calqueAuRejeu } from '../../banc/gabarits/calque-au-rejeu/index.js';
import { demarrerServeur } from '../../banc/serveur.js';
import type { ServeurScenario } from '../../banc/types.js';
import type { RapportBusiness, SectionRapport } from '../types.js';
import { STATUTS_SANS_RETEST } from './statuts.js';
import { LIBELLES_RAPPORT } from './voix.js';
import { creerScannerParDefaut } from '../scanner/defaut.js';

const ECHEANCE_MS = 120_000;
let configBanc: Awaited<ReturnType<typeof chargerConfig>>;
const serveurs: ServeurScenario[] = [];

beforeAll(async () => { configBanc = await chargerConfig(); });
afterAll(async () => { await Promise.all(serveurs.map((s) => s.arreter())); });

async function rapportDe(bugsActifs: string[]): Promise<RapportBusiness> {
  const scanner = await creerScannerParDefaut();
  const serveur = await demarrerServeur({ id: `pf--${bugsActifs.join('-')}`, gabarit: calqueAuRejeu.nom, langue: 'fr', bugsActifs }, calqueAuRejeu, configBanc);
  serveurs.push(serveur);
  const rapport = (await scanner(serveur.url, { timeoutMs: configBanc.scan.timeoutMs })) as unknown as { rapportBusiness: RapportBusiness };
  return rapport.rapportBusiness;
}

/** La section de recouvrement à preuve faible : un clic-intercepte dont le statut est « sans re-test » (découverte). */
function recouvrementPreuveFaible(rb: RapportBusiness): SectionRapport | undefined {
  return rb.sections.find((s) => (s.groupe ?? '').startsWith('d-recouvrement:') && STATUTS_SANS_RETEST.includes(s.statut) && s.murCouvrant !== true);
}

describe('voie A — un recouvrement à preuve faible est MINORÉ, jamais tu', () => {
  it('le calque découvert au rejeu (D01+D02) sort MINORÉ (mineur) et PRÉSENT (ROUGE aujourd’hui : important)', async () => {
    const rb = await rapportDe(['D01', 'D02']);
    const section = recouvrementPreuveFaible(rb);
    // PRÉSENT — le doute publie, ne se tait jamais (sens 3, collision).
    expect(section, 'la section de recouvrement à preuve faible doit être publiée').toBeDefined();
    // MINORÉ — gravité la plus basse (sens 1).
    expect(section?.gravite, `gravité du recouvrement preuve-faible : ${section?.gravite} (attendu mineur)`).toBe('mineur');
    // VOIX honnête à garantie sémantique (sens 1), posée hors IA.
    const libelles = LIBELLES_RAPPORT.fr;
    expect(section?.preuveFaible).toBe(true);
    expect(section?.titre).toBe(libelles.titrePreuveFaible);
    expect(section?.statutFormule).toBe(libelles.statutPreuveFaible);
    expect(section?.constat).toBe(libelles.constatPreuveFaible);
    expect(section?.actionSuggeree).toBe(libelles.actionPreuveFaible);
    // PAS de conséquence prétendue (on ne juge pas à la place du commerçant).
    expect(section?.impact).toBe('');
  }, ECHEANCE_MS);
});
