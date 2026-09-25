/**
 * LE MODE D'ÉQUIVALENCE : le banc qui sait ne RIEN fournir.
 *
 * Le banc ne peut pas révéler l'absence d'une pièce qu'il fournit lui-même
 * (APPRENTISSAGES n°15). Ce mode monte le moteur par `creerScannerParDefaut`
 * sans client injecté — comme en production — et c'est ce que ces contrôles
 * tiennent : le sujet n'injecte rien, l'option se lit, les deux modes
 * contradictoires se refusent, et le résultat porte son étiquette.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { chargerConfigScanner } from '../../core/scanner/config.js';
import { chargerConfig } from '../config.js';
import { POLITIQUE_DETERMINISTE, type Scenario } from '../types.js';
import { lireOptions } from './index.js';
import { calculerScorecard } from './scorecard.js';
import { creerSujet } from './sujets.js';

const SCENARIO: Scenario = { id: 'x--fr', gabarit: 'formulaire-contact', langue: 'fr', bugsActifs: [] };

describe('lireOptions — --assemblage-production', () => {
  it('se lit, et vaut faux par défaut : le mode ordinaire reste le rejeu', () => {
    expect(lireOptions(['--tous', '--assemblage-production'])?.assemblageProduction).toBe(true);
    expect(lireOptions(['--tous'])?.assemblageProduction).toBe(false);
  });

  it('refuse d’être combiné à --sans-ia : l’un retire toute IA, l’autre exige la vraie', () => {
    expect(lireOptions(['--tous', '--sans-ia', '--assemblage-production'])).toBeNull();
  });
});

describe('creerSujet — assemblage de production', () => {
  it('monte le moteur SANS client injecté : celui qu’il porte est le sien, jamais « non implémenté »', async () => {
    // Le sujet est créé sans client. Sur `file:///`, le moteur journalise
    // `ia.mode` puis refuse l'URL avant tout navigateur et tout appel : on lit
    // donc le client que l'assemblage a construit, sans réseau. Selon que le
    // poste porte une clé ou non, il est actif ou dégradé « clé absente » — et
    // dans aucun cas « non implémenté », l'état que le cahier correctif n°1 a
    // fait disparaître.
    const config = await chargerConfigScanner();
    const sujet = await creerSujet('reel', undefined, { politique: POLITIQUE_DETERMINISTE, assemblageProduction: true });
    const scanner = await sujet.pour(SCENARIO);
    const rapport = await scanner('file:///nulle-part', { timeoutMs: 1_000 });
    const mode = rapport.journal.find((e) => e.type === 'ia.mode')?.details as { mode: string; raison: string | null };
    const cle = process.env[config.ia.variableCle];
    expect(mode.mode).toBe(cle === undefined || cle === '' ? 'degrade' : 'actif');
    expect(mode.raison).not.toBe('non-implemente');
    if (mode.mode === 'degrade') expect(mode.raison).toBe('cle-absente');
  });

  it('sans le drapeau, un sujet sans client reste le sujet constant historique', async () => {
    // Le contrôle précédent doit pouvoir échouer : c'est le DRAPEAU qui change
    // l'assemblage, pas l'absence de client.
    const sujet = await creerSujet('reel', undefined, { politique: POLITIQUE_DETERMINISTE });
    expect(sujet.nom).toBe('reel');
  });
});

describe('la scorecard d’un run d’équivalence porte son étiquette', () => {
  it('« production » quand on le lui dit, rien sinon : un run payant ne se confond pas avec un rejeu', async () => {
    const config = await chargerConfig();
    expect(calculerScorecard([], config, '2026-09-25T00:00:00.000Z', POLITIQUE_DETERMINISTE, 'production').assemblage).toBe('production');
    expect(calculerScorecard([], config, '2026-09-25T00:00:00.000Z', POLITIQUE_DETERMINISTE).assemblage).toBeUndefined();
  });
});

describe('la commande npm charge la clé et passe le drapeau', () => {
  it('« pnpm banc:equivalence » lit docs/.env.local et impose --assemblage-production', async () => {
    const paquet = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(paquet.scripts['banc:equivalence']).toContain('--env-file-if-exists=docs/.env.local');
    expect(paquet.scripts['banc:equivalence']).toContain('--assemblage-production');
  });
});
