/**
 * `node --import tsx scripts/servir-public.ts` — POINT D'ENTRÉE DE PRODUCTION du
 * serveur de scan public (étape 7, l'hébergement).
 *
 * Démarre tout l'assemblage prouvé aux étapes 3-6 via `demarrerServeurPublic` :
 * proxy filtrant d'egress (garde cardinale SSRF), scanner DERRIÈRE le proxy,
 * file 1-à-la-fois, quota dur, livraison e-mail Resend. Écoute sur le port FIXE
 * de `config/publication.json` (toujours sur 127.0.0.1 — derrière le
 * reverse-proxy qui termine le HTTPS). S'arrête proprement sur SIGINT/SIGTERM
 * (pour systemd `Restart=on-failure`).
 *
 * Les secrets viennent de l'ENVIRONNEMENT (ANTHROPIC_API_KEY, RESEND_API_KEY) —
 * jamais du dépôt. Sans clé Resend : mode dégradé (scans OK, livraison par id).
 * Le dossier d'état durable (jetons/preuves/scans/quota) : $ZURVELA_ETAT.
 */
import path from 'node:path';
import { demarrerServeurPublic } from '../core/publication/demarrer-serveur.js';

const dossierEtat = process.env['ZURVELA_ETAT'] ?? path.resolve('etat');
const serveur = await demarrerServeurPublic({ dossierEtat });
console.log(JSON.stringify({ evenement: 'demarre', port: serveur.serveur.port, etat: dossierEtat, pid: process.pid }));

let enArret = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (enArret) return;
    enArret = true;
    console.log(JSON.stringify({ evenement: 'arret', signal }));
    serveur
      .fermer()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}
