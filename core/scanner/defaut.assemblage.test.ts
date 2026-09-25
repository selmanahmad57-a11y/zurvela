/**
 * L'ASSEMBLAGE DE PRODUCTION, EXERCÉ PAR UN CHEMIN QUI N'INJECTE RIEN.
 *
 * Pendant quatre briques, chaque mesure d'IA est passée par le client que le
 * banc injectait dans le moteur. L'assemblage de production, lui, montait un
 * client sans capacité — et rien ne pouvait le voir, puisque tout ce qui
 * testait FOURNISSAIT la pièce manquante (APPRENTISSAGES n°15).
 *
 * Ces contrôles montent `creerScannerParDefaut` SANS `options.ia`. Le seul
 * moyen de ne pas toucher au réseau est de doubler le SDK — ce qui n'est pas
 * injecter un client : le client, c'est le moteur qui le construit, avec les
 * configurations chargées depuis `config/`, comme en production.
 *
 * Pourquoi un scan sur `file:///` : le moteur journalise `ia.mode` AVANT de
 * refuser une URL non web, et le refus arrive avant tout navigateur. On lit
 * donc le mode du client assemblé sans lancer Chromium ni appeler personne.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { PorteeSdk } from '../ia/anthropic.js';
import { chargerConfigScanner } from './config.js';
import { creerScannerParDefaut } from './defaut.js';

/** SDK doublé : s'il était appelé, ce test aurait échoué à son intention — rien ici ne doit atteindre le réseau. */
const sdkMuet: PorteeSdk = {
  messages: {
    create: () => Promise.reject(new Error('le SDK ne doit pas être appelé par ce test')),
  },
};

async function modeIaDuScanAssemble(env: NodeJS.ProcessEnv, avecSdk: boolean): Promise<{ mode?: string; raison?: string | null }> {
  // Le SDK doublé n'est fourni QU'AVEC une clé : `creerClientAnthropic` n'exige
  // pas de clé quand on lui donne un SDK (c'est ce qui permet de le tester),
  // donc le doubler sans clé fabriquerait un client actif de toutes pièces.
  // Sans clé et sans SDK, aucun réseau n'est possible : le client dégradé est
  // rendu avant qu'un SDK existe.
  const scanner = await creerScannerParDefaut({ env, ...(avecSdk ? { sdk: sdkMuet } : {}) });
  const rapport = await scanner('file:///nulle-part', { timeoutMs: 1_000 });
  const entree = rapport.journal.find((e) => e.type === 'ia.mode');
  return (entree?.details ?? {}) as { mode?: string; raison?: string | null };
}

describe('creerScannerParDefaut — le client IA de production', () => {
  it('AVEC clé, le moteur assemblé est ACTIF : c’est le contrôle qui manquait depuis la brique 2', async () => {
    const config = await chargerConfigScanner();
    expect(await modeIaDuScanAssemble({ [config.ia.variableCle]: 'cle-de-test' }, true)).toMatchObject({ mode: 'actif', raison: null });
  });

  it('SANS clé, il est dégradé pour la seule raison qui a le droit d’exister : la clé absente', async () => {
    // Le contrôle précédent doit pouvoir échouer : sans clé, le même chemin
    // rend un client dégradé — et jamais plus « non implémenté ».
    expect(await modeIaDuScanAssemble({}, false)).toMatchObject({ mode: 'degrade', raison: 'cle-absente' });
  });

  it('la raison « non implémenté » n’existe plus dans le moteur : un état qui ne doit pas exister n’a pas de nom', async () => {
    const sources = ['core/ia/index.ts', 'core/scanner/defaut.ts'];
    for (const fichier of sources) {
      const texte = await readFile(new URL(`../../${fichier}`, import.meta.url), 'utf8');
      expect(texte, fichier).not.toContain('non-implemente');
      expect(texte, fichier).not.toContain('creerClientIa(');
    }
  });
});
