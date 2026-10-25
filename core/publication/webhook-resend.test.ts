/**
 * TÉMOIN des webhooks Resend (format Svix).
 *
 * Deux étages, deux gardes :
 *  1. AUTHENTICITÉ (signatureSvixValide) — sans elle, n'importe qui POSTerait de
 *     faux événements (fausse plainte, faux bounce) et empoisonnerait nos
 *     métriques/alertes. Prouvée par le VECTEUR OFFICIEL Svix (accord exact avec
 *     l'implémentation réelle) et un ROUND-TRIP.
 *  2. TRAITEMENT (analyser / alertes / traiter) — fail-closed sans secret ou sur
 *     signature invalide, idempotence par svix-id, seuils de bounce avec PLANCHER
 *     absolu, plaintes toujours alertées. Le corps est DONNÉE NON FIABLE jusqu'à la
 *     vérif : on ne parse qu'APRÈS.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  alertesWebhook,
  analyserEvenementResend,
  signatureSvixValide,
  traiterWebhookResend,
  type EvenementHorodate,
  type SeuilsWebhook,
  type StockWebhook,
} from './webhook-resend.js';

// Vecteur de test officiel de Svix (documentation Svix / Resend).
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const TS = '1614265330';
const CORPS = '{"test": 2432232314}';
const SIG = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';

describe('signatureSvixValide — garde d’authenticité des webhooks', () => {
  it('ACCEPTE le vecteur de test officiel Svix (accord avec l’implémentation réelle)', () => {
    expect(signatureSvixValide(SECRET, { id: ID, timestamp: TS, signature: SIG }, CORPS)).toBe(true);
  });

  it('REJETTE un corps falsifié — le cœur de la garde', () => {
    expect(signatureSvixValide(SECRET, { id: ID, timestamp: TS, signature: SIG }, '{"test": 999}')).toBe(false);
  });

  it('REJETTE un id ou un timestamp falsifié (ils sont SIGNÉS avec le corps)', () => {
    expect(signatureSvixValide(SECRET, { id: 'msg_autre', timestamp: TS, signature: SIG }, CORPS)).toBe(false);
    expect(signatureSvixValide(SECRET, { id: ID, timestamp: '0', signature: SIG }, CORPS)).toBe(false);
  });

  it('REJETTE un mauvais secret', () => {
    expect(signatureSvixValide('whsec_bWF1dmFpc3NlY3JldA==', { id: ID, timestamp: TS, signature: SIG }, CORPS)).toBe(false);
  });

  it('REJETTE une signature vide ou malformée (fail-closed)', () => {
    expect(signatureSvixValide(SECRET, { id: ID, timestamp: TS, signature: '' }, CORPS)).toBe(false);
    expect(signatureSvixValide(SECRET, { id: ID, timestamp: TS, signature: 'pas-de-virgule' }, CORPS)).toBe(false);
  });

  it('ACCEPTE si UNE des signatures de la liste (séparées par espace) correspond — rotation de clé', () => {
    expect(signatureSvixValide(SECRET, { id: ID, timestamp: TS, signature: `v1,ZmF1eA== ${SIG}` }, CORPS)).toBe(true);
  });

  it('round-trip : une signature que NOUS calculons est acceptée, une altérée non (indépendant du vecteur externe)', () => {
    const secret = 'whsec_dGVzdHNlY3JldDEyMw=='; // base64 d'une clé quelconque
    const id = 'msg_x', ts = '1700000000', corps = '{"type":"email.delivered"}';
    const cle = Buffer.from('dGVzdHNlY3JldDEyMw==', 'base64');
    const sig = 'v1,' + createHmac('sha256', cle).update(`${id}.${ts}.${corps}`).digest('base64');
    expect(signatureSvixValide(secret, { id, timestamp: ts, signature: sig }, corps)).toBe(true);
    expect(signatureSvixValide(secret, { id, timestamp: ts, signature: sig }, corps + 'x')).toBe(false);
  });
});

// ─────────────── outils de signature pour les témoins de traitement ───────────────
const SECRET_T = 'whsec_dGVzdHNlY3JldDEyMw==';
const CLE_T = Buffer.from('dGVzdHNlY3JldDEyMw==', 'base64');
function signer(id: string, ts: string, corps: string): string {
  return 'v1,' + createHmac('sha256', CLE_T).update(`${id}.${ts}.${corps}`).digest('base64');
}
const SEUILS: SeuilsWebhook = { fenetreMs: 604_800_000, tauxBounceMax: 0.02, bounceMinAbsolu: 3 };
function corpsEvt(type: string, emailId = 'eid_1'): string {
  return JSON.stringify({ type, created_at: '2026-01-01T00:00:00Z', data: { email_id: emailId, to: ['secret@ne-doit-pas-fuir.test'] } });
}
function stockMemoire(): { stock: StockWebhook; enregistres: EvenementHorodate[] } {
  const vus = new Set<string>();
  const evts: EvenementHorodate[] = [];
  const enregistres: EvenementHorodate[] = [];
  return {
    enregistres,
    stock: {
      dejaVu: (id) => vus.has(id),
      enregistrer: (id, evt) => {
        vus.add(id);
        evts.push(evt);
        enregistres.push(evt);
      },
      fenetre: (now, fenetreMs) => evts.filter((e) => e.creeLe >= now - fenetreMs),
    },
  };
}

describe('analyserEvenementResend — parse APRÈS vérif, extrait type + email_id, JAMAIS l’adresse', () => {
  it('parse chacun des 4 types gérés → { type, emailId }', () => {
    for (const type of ['email.delivered', 'email.bounced', 'email.complained', 'email.delivery_delayed'] as const) {
      expect(analyserEvenementResend(corpsEvt(type, 'eid_42'))).toEqual({ type, emailId: 'eid_42' });
    }
  });
  it('null sur JSON invalide', () => {
    expect(analyserEvenementResend('pas du json')).toBeNull();
  });
  it('null sur type NON géré (on ne fabrique rien hors du menu fermé)', () => {
    expect(analyserEvenementResend(corpsEvt('email.opened'))).toBeNull();
  });
  it('null si data.email_id absent ou vide', () => {
    expect(analyserEvenementResend(JSON.stringify({ type: 'email.delivered', data: {} }))).toBeNull();
    expect(analyserEvenementResend(JSON.stringify({ type: 'email.delivered', data: { email_id: '' } }))).toBeNull();
  });
});

describe('alertesWebhook — plaintes toujours, bounces seulement au-dessus du PLANCHER', () => {
  it('une plainte alerte TOUJOURS (grave + sous-rapportée)', () => {
    const a = alertesWebhook({ type: 'email.complained', emailId: 'eid_c' }, [{ type: 'email.complained', creeLe: 1 }], SEUILS);
    expect(a).toHaveLength(1);
    expect(a[0]?.genre).toBe('plainte');
    expect(a[0]?.emailId).toBe('eid_c');
  });
  it('un bounce SOUS le plancher absolu N’ALERTE PAS (1 faute de frappe = 100 % mais 1 seul)', () => {
    const fenetre: EvenementHorodate[] = [{ type: 'email.bounced', creeLe: 1 }];
    expect(alertesWebhook({ type: 'email.bounced', emailId: 'eid_b' }, fenetre, SEUILS)).toEqual([]);
  });
  it('bounces ≥ plancher ET taux > seuil → alerte taux-bounce', () => {
    // 3 bounces, 3 verdicts → 100 % > 2 %, et 3 ≥ 3.
    const fenetre: EvenementHorodate[] = [
      { type: 'email.bounced', creeLe: 1 },
      { type: 'email.bounced', creeLe: 2 },
      { type: 'email.bounced', creeLe: 3 },
    ];
    const a = alertesWebhook({ type: 'email.bounced', emailId: 'eid_b' }, fenetre, SEUILS);
    expect(a).toHaveLength(1);
    expect(a[0]?.genre).toBe('taux-bounce');
  });
  it('bounces ≥ plancher MAIS taux ≤ seuil → PAS d’alerte (le taux est porteur, pas que le plancher)', () => {
    // 3 bounces noyés dans 300 livrés → ~1 % ≤ 2 %.
    const fenetre: EvenementHorodate[] = [
      ...Array.from({ length: 3 }, (_, i): EvenementHorodate => ({ type: 'email.bounced', creeLe: i })),
      ...Array.from({ length: 300 }, (_, i): EvenementHorodate => ({ type: 'email.delivered', creeLe: 1000 + i })),
    ];
    expect(alertesWebhook({ type: 'email.bounced', emailId: 'eid_b' }, fenetre, SEUILS)).toEqual([]);
  });
  it('un succès (delivered) n’alerte jamais', () => {
    expect(alertesWebhook({ type: 'email.delivered', emailId: 'eid_d' }, [], SEUILS)).toEqual([]);
  });
});

describe('traiterWebhookResend — fail-closed, parse-après-vérif, idempotence', () => {
  const base = (id: string, corps: string) => ({ enTetes: { id, timestamp: '1700000000', signature: signer(id, '1700000000', corps) }, corps });

  it('SANS secret → 401, RIEN enregistré (dégradé = fermé, pas ouvert)', () => {
    const { stock, enregistres } = stockMemoire();
    const { enTetes, corps } = base('m1', corpsEvt('email.delivered'));
    const r = traiterWebhookResend({ secret: undefined, enTetes, corps, stock, maintenant: 1700000000000, seuils: SEUILS });
    expect(r.statut).toBe(401);
    expect(enregistres).toEqual([]);
  });

  it('secret vide → 401 (même régime)', () => {
    const { stock } = stockMemoire();
    const { enTetes, corps } = base('m1', corpsEvt('email.delivered'));
    expect(traiterWebhookResend({ secret: '', enTetes, corps, stock, maintenant: 1, seuils: SEUILS }).statut).toBe(401);
  });

  it('signature INVALIDE → 401, store NON touché (le corps n’est pas parsé avant la vérif)', () => {
    const { stock, enregistres } = stockMemoire();
    const corps = corpsEvt('email.delivered');
    const r = traiterWebhookResend({ secret: SECRET_T, enTetes: { id: 'm1', timestamp: '1700000000', signature: 'v1,ZmF1eA==' }, corps, stock, maintenant: 1, seuils: SEUILS });
    expect(r.statut).toBe(401);
    expect(enregistres).toEqual([]);
  });

  it('signature valide + delivered → 200, enregistré une fois, aucune alerte', () => {
    const { stock, enregistres } = stockMemoire();
    const { enTetes, corps } = base('m1', corpsEvt('email.delivered'));
    const r = traiterWebhookResend({ secret: SECRET_T, enTetes, corps, stock, maintenant: 1700000000000, seuils: SEUILS });
    expect(r.statut).toBe(200);
    expect(r.alertes).toEqual([]);
    expect(enregistres).toEqual([{ type: 'email.delivered', creeLe: 1700000000000 }]);
  });

  it('REDELIVERY (même svix-id) → 200 mais PAS recompté (idempotence)', () => {
    const { stock, enregistres } = stockMemoire();
    const { enTetes, corps } = base('m1', corpsEvt('email.delivered'));
    traiterWebhookResend({ secret: SECRET_T, enTetes, corps, stock, maintenant: 1, seuils: SEUILS });
    const r2 = traiterWebhookResend({ secret: SECRET_T, enTetes, corps, stock, maintenant: 2, seuils: SEUILS });
    expect(r2.statut).toBe(200);
    expect(enregistres).toHaveLength(1); // une seule fois, malgré deux POST
  });

  it('plainte → 200 + alerte, email_id remonté (jamais l’adresse)', () => {
    const { stock } = stockMemoire();
    const { enTetes, corps } = base('m1', corpsEvt('email.complained', 'eid_plainte'));
    const r = traiterWebhookResend({ secret: SECRET_T, enTetes, corps, stock, maintenant: 1, seuils: SEUILS });
    expect(r.statut).toBe(200);
    expect(r.alertes).toHaveLength(1);
    expect(r.alertes[0]?.genre).toBe('plainte');
    expect(r.alertes[0]?.emailId).toBe('eid_plainte');
    // Garde §3 : l'alerte ne porte QUE l'id Resend, pas l'adresse `to`.
    expect(JSON.stringify(r.alertes[0])).not.toContain('ne-doit-pas-fuir');
  });

  it('type non géré, signé valide → 200, rien enregistré, rien alerté', () => {
    const { stock, enregistres } = stockMemoire();
    const { enTetes, corps } = base('m1', corpsEvt('email.opened'));
    const r = traiterWebhookResend({ secret: SECRET_T, enTetes, corps, stock, maintenant: 1, seuils: SEUILS });
    expect(r.statut).toBe(200);
    expect(enregistres).toEqual([]);
    expect(r.alertes).toEqual([]);
  });
});
