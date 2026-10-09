/**
 * TÉMOIN de l'état durable JSON : ce qui est écrit survit à un « redémarrage »
 * (une nouvelle instance de stock sur le même fichier), et `prochainEnAttente`
 * rend le plus ancien. Vrai chemin : de vrais fichiers temporaires.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stockScansFichier, stockVerificationFichier } from './stock-fichier.js';

const dossiers: string[] = [];
function dossierTmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'zurvela-stock-'));
  dossiers.push(d);
  return d;
}
afterEach(() => {
  while (dossiers.length > 0) rmSync(dossiers.pop()!, { recursive: true, force: true });
});

describe('état durable JSON', () => {
  it('une preuve écrite survit à un redémarrage (nouvelle instance, même fichier)', () => {
    const d = dossierTmp();
    const fj = path.join(d, 'jetons.json');
    const fp = path.join(d, 'preuves.json');
    stockVerificationFichier(fj, fp).ecrirePreuve('https://ok.test', { origine: 'https://ok.test', prouveeLe: 1, valideJusqua: 2 });
    // « redémarrage » : une instance neuve sur les mêmes fichiers
    const apres = stockVerificationFichier(fj, fp);
    expect(apres.lirePreuve('https://ok.test')).toEqual({ origine: 'https://ok.test', prouveeLe: 1, valideJusqua: 2 });
    expect(apres.lirePreuve('https://autre.test')).toBeUndefined();
  });

  it('un scan enfilé survit, et prochainEnAttente rend le plus ancien', () => {
    const f = path.join(dossierTmp(), 'scans.json');
    const s = stockScansFichier(f);
    s.ecrire('a', { scanId: 'a', origine: 'https://a.test', etat: 'en-attente', creeLe: 20 });
    s.ecrire('b', { scanId: 'b', origine: 'https://b.test', etat: 'en-attente', creeLe: 10 });
    const apres = stockScansFichier(f); // redémarrage
    expect(apres.prochainEnAttente()?.scanId).toBe('b'); // le plus ancien (creeLe 10)
    apres.ecrire('b', { scanId: 'b', origine: 'https://b.test', etat: 'termine', creeLe: 10 });
    expect(apres.prochainEnAttente()?.scanId).toBe('a'); // b n'est plus en attente
  });
});
