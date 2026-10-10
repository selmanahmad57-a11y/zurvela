/**
 * TÉMOIN de l'e-mail de livraison (étape 6). Resend DOUBLÉ par un `poster`
 * injecté → zéro mail réel, gratuit, déterministe. Prouve : la validation
 * anti-injection du `to` (les deux bords), et l'envoi structuré vers Resend.
 */
import { describe, expect, it, vi } from 'vitest';
import { emailValide, envoyerCourriel, type PosterHttps } from './courriel.js';

// ─────────── (anti-injection) validation du `to` ───────────
describe('emailValide — la garde anti-injection', () => {
  it('accepte une adresse ordinaire', () => {
    expect(emailValide('client@example.com')).toBe(true);
    expect(emailValide('a.b+tag@sous.domaine.fr')).toBe(true);
  });
  it('REJETTE tout caractère de contrôle (CR/LF/TAB/NUL) — le cœur de la garde', () => {
    expect(emailValide('victime@example.com\r\nBcc: evil@x.com')).toBe(false);
    expect(emailValide('victime@example.com\n')).toBe(false);
    expect(emailValide('a\tb@example.com')).toBe(false);
    expect(emailValide('a\u0000b@example.com')).toBe(false);
  });
  it('rejette l’espace, le vide, l’absence de @ ou de domaine pointé', () => {
    expect(emailValide('a b@example.com')).toBe(false);
    expect(emailValide('')).toBe(false);
    expect(emailValide('sansarobase')).toBe(false);
    expect(emailValide('a@b')).toBe(false); // domaine sans point
    expect(emailValide('a@@b.com')).toBe(false);
    expect(emailValide('@example.com')).toBe(false);
    expect(emailValide('a@example.com.')).toBe(false);
  });
  it('rejette une adresse déraisonnablement longue (RFC 5321 : 254)', () => {
    const longue = `${'x'.repeat(250)}@a.com`;
    expect(emailValide(longue)).toBe(false);
  });
});

// ─────────── envoyerCourriel — POST HTTPS structuré vers Resend ───────────
const OPTS = { cleApi: 'cle-de-test', expediteur: 'rapport@zurvela.com', delaiMs: 5000 };

describe('envoyerCourriel', () => {
  it('poste un JSON STRUCTURÉ {from,to,subject,html} avec le Bearer, et rend ok sur 2xx', async () => {
    const poster = vi.fn<PosterHttps>(async () => ({ statut: 200, corps: '{"id":"abc"}' }));
    const r = await envoyerCourriel(
      { destinataire: 'client@example.com', sujet: 'Votre rapport', html: '<html>R</html>' },
      { ...OPTS, poster },
    );
    expect(r.ok).toBe(true);
    expect(poster).toHaveBeenCalledTimes(1);
    const appel = poster.mock.calls[0]![0];
    expect(appel.url).toBe('https://api.resend.com/emails');
    expect(appel.enTetes['authorization']).toBe('Bearer cle-de-test');
    const corps = JSON.parse(appel.corps) as Record<string, string>;
    expect(corps).toEqual({ from: 'rapport@zurvela.com', to: 'client@example.com', subject: 'Votre rapport', html: '<html>R</html>' });
  });

  it('rend échec sur un statut non-2xx', async () => {
    const poster = vi.fn<PosterHttps>(async () => ({ statut: 422, corps: '{"error":"x"}' }));
    const r = await envoyerCourriel({ destinataire: 'client@example.com', sujet: 'S', html: '<p>h</p>' }, { ...OPTS, poster });
    expect(r.ok).toBe(false);
  });

  it('rend échec (sans jeter) si le transport jette — l’échec ne remonte pas', async () => {
    const poster = vi.fn<PosterHttps>(async () => {
      throw new Error('réseau coupé');
    });
    const r = await envoyerCourriel({ destinataire: 'client@example.com', sujet: 'S', html: '<p>h</p>' }, { ...OPTS, poster });
    expect(r.ok).toBe(false);
  });

  it('GARDE DE SORTIE : un `to` à CR/LF n’est JAMAIS posté', async () => {
    const poster = vi.fn<PosterHttps>(async () => ({ statut: 200, corps: '{}' }));
    const r = await envoyerCourriel(
      { destinataire: 'victime@example.com\r\nBcc: evil@x.com', sujet: 'S', html: '<p>h</p>' },
      { ...OPTS, poster },
    );
    expect(r.ok).toBe(false);
    expect(poster).not.toHaveBeenCalled(); // le transport n’a jamais vu l’adresse empoisonnée
  });
});
