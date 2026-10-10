/**
 * TÉMOIN du quota dur (étape 5). Compteurs SIMULÉS (mémoire) — banc, gratuit,
 * zéro scan. Prouve : double plafond (nombre + DÉPENSE), reset quotidien,
 * réservation atomique (la fenêtre de course), incrément à l'ok.
 */
import { describe, expect, it } from 'vitest';
import { enregistrerDepense, jourUtc, reserverScan, type ConfigQuota, type StockQuota } from './quota.js';

function stockMemoire(initial: Record<string, number> = {}): StockQuota & { tout: () => Record<string, number> } {
  const m = new Map<string, number>(Object.entries(initial));
  return { lire: (c) => m.get(c), ecrire: (c, n) => void m.set(c, n), tout: () => Object.fromEntries(m) };
}
const CFG: ConfigQuota = { global: 50, parOrigine: 3, depenseMaxUsd: 5 };
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0); // 2026-10-10 12:00 UTC
const J = jourUtc(T0); // '2026-10-10'
const A = 'https://a.test';
const B = 'https://b.test';

describe('quota — plafond de NOMBRE (avant le scan)', () => {
  it('global atteint → refus « global », même avec une origine neuve', () => {
    const stock = stockMemoire({ [`${J}|global`]: 50 });
    expect(reserverScan({ stock, maintenant: T0, origine: A, config: CFG })).toEqual({ ok: false, raison: 'global', retryApresMs: expect.any(Number) });
  });
  it('par origine atteint → refus pour CETTE origine, une AUTRE passe', () => {
    const stock = stockMemoire({ [`${J}|origine:${A}`]: 3 });
    expect(reserverScan({ stock, maintenant: T0, origine: A, config: CFG }).ok).toBe(false);
    expect(reserverScan({ stock, maintenant: T0, origine: B, config: CFG }).ok).toBe(true);
  });
});

describe('quota — plafond de DÉPENSE (le vrai filet, alimenté après)', () => {
  it('dépense atteinte → refus « depense » quel que soit le nombre (global/origine à 0)', () => {
    const stock = stockMemoire({ [`${J}|depense`]: 5 });
    expect(reserverScan({ stock, maintenant: T0, origine: A, config: CFG })).toEqual({ ok: false, raison: 'depense', retryApresMs: expect.any(Number) });
  });
  it('enregistrerDepense cumule le coût réel du jour', () => {
    const stock = stockMemoire();
    enregistrerDepense({ stock, maintenant: T0, cout: 0.15 });
    enregistrerDepense({ stock, maintenant: T0, cout: 0.2 });
    expect(stock.lire(`${J}|depense`)).toBeCloseTo(0.35, 6);
  });
  it('un scan lourd pousse le cumul au plafond → le scan SUIVANT est refusé', () => {
    const stock = stockMemoire();
    expect(reserverScan({ stock, maintenant: T0, origine: A, config: CFG }).ok).toBe(true); // 1er passe
    enregistrerDepense({ stock, maintenant: T0, cout: 6 }); // site lourd : 6 $ > plafond 5
    expect(reserverScan({ stock, maintenant: T0, origine: B, config: CFG })).toEqual({ ok: false, raison: 'depense', retryApresMs: expect.any(Number) });
  });
});

describe('quota — réservation ATOMIQUE (fenêtre de course)', () => {
  it('deux réservations au compteur-1-avant-le-cap : la 1re passe, la 2de est refusée', () => {
    // global à 49 (cap 50) : une seule place reste.
    const stock = stockMemoire({ [`${J}|global`]: 49 });
    const r1 = reserverScan({ stock, maintenant: T0, origine: A, config: CFG });
    const r2 = reserverScan({ stock, maintenant: T0, origine: B, config: CFG });
    expect(r1.ok).toBe(true);
    expect(r2).toEqual({ ok: false, raison: 'global', retryApresMs: expect.any(Number) });
    expect(stock.lire(`${J}|global`)).toBe(50); // une seule place consommée, pas deux
  });
  it('par origine aussi : à 2 (cap 3), deux réservations de la même origine → une seule passe', () => {
    const stock = stockMemoire({ [`${J}|origine:${A}`]: 2 });
    expect(reserverScan({ stock, maintenant: T0, origine: A, config: CFG }).ok).toBe(true);
    expect(reserverScan({ stock, maintenant: T0, origine: A, config: CFG }).ok).toBe(false);
  });
  it('une réservation réussie INCRÉMENTE nombre global ET origine', () => {
    const stock = stockMemoire();
    reserverScan({ stock, maintenant: T0, origine: A, config: CFG });
    expect(stock.lire(`${J}|global`)).toBe(1);
    expect(stock.lire(`${J}|origine:${A}`)).toBe(1);
  });
});

describe('quota — reset quotidien implicite (jour dans la clé)', () => {
  it('le jour d’après, les compteurs repartent à zéro', () => {
    const stock = stockMemoire({ [`${J}|global`]: 50, [`${J}|depense`]: 5 });
    const demain = T0 + 24 * 3600 * 1000;
    expect(jourUtc(demain)).not.toBe(J);
    // atteint aujourd'hui, libre demain
    expect(reserverScan({ stock, maintenant: T0, origine: A, config: CFG }).ok).toBe(false);
    expect(reserverScan({ stock, maintenant: demain, origine: A, config: CFG }).ok).toBe(true);
  });
});
