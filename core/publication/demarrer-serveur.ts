/**
 * ASSEMBLAGE DU SERVEUR DE SCAN PUBLIC (publication, étape 4) — la production.
 * Démarre le PROXY FILTRANT (garde cardinale), câble le scan DERRIÈRE lui
 * (`creerScannerParDefaut({ proxy })`, transit prouvé), l'état durable en JSON,
 * la file 1-à-la-fois, et les routes. Le GET de vérification réutilise
 * l'épinglage de l'étape 3. Aucun seuil en dur : tout vient de
 * `config/publication.json`.
 *
 * Ce module n'est exercé qu'à la validation réelle de bout en bout (le seul
 * dollar, ~0,05 $, annoncé avant) et au déploiement — les gardes, elles, sont
 * prouvées au banc (proxy, transit, serveur, file, IDOR).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerConfigScanner, FICHIER_CONFIG_PRODUCTION } from '../scanner/config.js';
import { chargerSchema, valider } from '../outils/schema.js';
import { rendreRapportHtml } from '../rapport/rendu-html.js';
import { creerProxyFiltrant, type ProxyFiltrant } from './proxy-filtrant.js';
import { lookupPublicSeulement, recupererDirect, resolveurSysteme, type Recuperer } from './verification-propriete.js';
import { stockQuotaFichier, stockScansFichier, stockVerificationFichier } from './stock-fichier.js';
import { creerOrdonnanceur, creerServeurScan, type ExecuterScan, type ServeurScan } from './serveur-scan.js';
import { enregistrerDepense, type ConfigQuota } from './quota.js';
import { envoyerCourriel, posterHttpsReel } from './courriel.js';
import { chargerDictionnaire, traduire } from '../i18n.js';
import { creerScannerParDefaut } from '../scanner/defaut.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Langue de livraison par défaut — alignée sur le défaut du rendu de rapport (rendu-html). */
const LANGUE_LIVRAISON = 'fr';
/** Variable d'environnement portant la clé Resend (chargée par --env-file-if-exists=docs/.env.local). */
const VARIABLE_CLE_RESEND = 'RESEND_API_KEY';

export interface ConfigPublicationComplete {
  octetsJeton: number;
  expirationJetonMs: number;
  fenetreValiditeMs: number;
  prefixeFichier: string;
  octetsScanId: number;
  tailleCorpsMax: number;
  port: number;
  verificationGet: { delaiMs: number; maxOctets: number };
  proxy: { delaiMs: number };
  scan: { timeoutMs: number };
  quota: ConfigQuota;
  courriel: { expediteur: string; delaiMs: number };
}

export async function chargerConfigPublication(fichier: string = path.join(RACINE, 'config', 'publication.json')): Promise<ConfigPublicationComplete> {
  const [schema, contenu] = await Promise.all([
    chargerSchema(path.join(RACINE, 'config', 'publication.schema.json')),
    (await import('node:fs/promises')).readFile(fichier, 'utf8'),
  ]);
  return valider<ConfigPublicationComplete>(schema, JSON.parse(contenu), 'config/publication.json');
}

/**
 * L'EXÉCUTEUR RÉEL : scanne DERRIÈRE le proxy (le `proxy` injecté dans la config
 * du navigateur, transit prouvé) et rend le rapport HTML (rendu de l'étape 1).
 */
export function creerExecuterReel(proxyUrl: string, timeoutMs: number, fichierConfig: string = FICHIER_CONFIG_PRODUCTION): ExecuterScan {
  return async (origine) => {
    const scanner = await creerScannerParDefaut({ fichierConfig, proxy: proxyUrl });
    const rapport = await scanner(origine, { timeoutMs });
    const cout = rapport.coutApi ?? 0;
    if (rapport.rapportBusiness === undefined) {
      return { ok: false, erreur: 'aucun-rapport', cout };
    }
    return { ok: true, rapportHtml: rendreRapportHtml(rapport.rapportBusiness, { url: rapport.url }), cout };
  };
}

export interface ServeurPublic {
  readonly serveur: ServeurScan;
  readonly proxy: ProxyFiltrant;
  fermer(): Promise<void>;
}

export interface OptionsServeurPublic {
  /** Dossier où vit l'état durable (jetons, preuves, scans). */
  readonly dossierEtat: string;
}

export async function demarrerServeurPublic(opts: OptionsServeurPublic): Promise<ServeurPublic> {
  const cfg = await chargerConfigPublication();
  const robot = (await chargerConfigScanner(FICHIER_CONFIG_PRODUCTION)).robot;

  // 1. La garde cardinale : le proxy filtrant d'egress.
  const proxy = await creerProxyFiltrant({ delaiMs: cfg.proxy.delaiMs });
  const proxyUrl = `http://127.0.0.1:${proxy.port}`;

  // 2. État durable.
  const stockVerif = stockVerificationFichier(path.join(opts.dossierEtat, 'jetons.json'), path.join(opts.dossierEtat, 'preuves.json'));
  const stockScans = stockScansFichier(path.join(opts.dossierEtat, 'scans.json'));
  const stockQuota = stockQuotaFichier(path.join(opts.dossierEtat, 'quota.json'));

  // 3. Le GET de vérification, épinglé (étape 3), sous l'identité ZurvelaBot.
  const lookup = lookupPublicSeulement(resolveurSysteme());
  const recuperer: Recuperer = (origine, chemin) =>
    recupererDirect(origine, chemin, {
      userAgent: robot.userAgent,
      enTete: { nom: robot.enTete, valeur: robot.valeurEnTete },
      delaiMs: cfg.verificationGet.delaiMs,
      maxOctets: cfg.verificationGet.maxOctets,
      lookup,
    });

  // 4. L'exécuteur réel DERRIÈRE le proxy + la file 1-à-la-fois.
  //    Le coût réel de chaque scan alimente le plafond de DÉPENSE (étape 5).
  const executer = creerExecuterReel(proxyUrl, cfg.scan.timeoutMs);

  // 4bis. Livraison e-mail (étape 6). Mode dégradé (§4) : sans RESEND_API_KEY,
  //       aucun `envoyer` n'est câblé — les scans tournent, la livraison retombe
  //       sur l'id (/statut/:id). La clé n'est jamais journalisée ni affichée.
  const cleResend = process.env[VARIABLE_CLE_RESEND];
  const dict = await chargerDictionnaire(path.join(RACINE, 'locales'), LANGUE_LIVRAISON);
  const poster = posterHttpsReel();
  const envoyer =
    cleResend === undefined || cleResend === ''
      ? undefined
      : async ({ destinataire, origine, rapportHtml }: { destinataire: string; origine: string; rapportHtml: string }): Promise<{ ok: boolean }> =>
          envoyerCourriel(
            { destinataire, sujet: traduire(dict, 'courriel.sujet', { origine }), html: rapportHtml },
            { cleApi: cleResend, expediteur: cfg.courriel.expediteur, delaiMs: cfg.courriel.delaiMs, poster },
          );

  const ordonnanceur = creerOrdonnanceur({
    stockScans,
    executer,
    maintenant: () => Date.now(),
    surCout: (cout) => enregistrerDepense({ stock: stockQuota, maintenant: Date.now(), cout }),
    ...(envoyer === undefined ? {} : { envoyer }),
  });
  // Reprise après redémarrage : un scan resté « en-attente » repart.
  ordonnanceur.declencher();

  // 5. Le serveur + ses routes.
  const serveur = await creerServeurScan({
    stockVerif,
    stockScans,
    stockQuota,
    configQuota: cfg.quota,
    ordonnanceur,
    recuperer,
    maintenant: () => Date.now(),
    config: {
      octetsJeton: cfg.octetsJeton,
      expirationJetonMs: cfg.expirationJetonMs,
      fenetreValiditeMs: cfg.fenetreValiditeMs,
      prefixeFichier: cfg.prefixeFichier,
      octetsScanId: cfg.octetsScanId,
      tailleCorpsMax: cfg.tailleCorpsMax,
      port: cfg.port,
    },
  });

  return {
    serveur,
    proxy,
    fermer: async () => {
      await serveur.fermer();
      await proxy.fermer();
    },
  };
}
