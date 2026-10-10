/**
 * QUOTA DUR (publication, étape 5) — le FILET ANTI-FACTURE. Même avec preuve de
 * propriété (étape 3) et proxy filtrant (étape 4), un visiteur (ou plusieurs)
 * pourrait lancer assez de scans pour vider le budget. Le quota est le plafond
 * qui garantit que ça ne peut pas arriver.
 *
 * DOUBLE PLAFOND, car le NOMBRE ne borne pas la DÉPENSE (un scan de site lourd
 * coûte plus qu'un scan léger) :
 *  - plafond de NOMBRE, vérifié AVANT d'enfiler : global/jour + par origine/jour.
 *    Barre avant.
 *  - plafond de DÉPENSE cumulée, vérifié AVANT d'enfiler sur le cumul du jour,
 *    alimenté APRÈS chaque scan par son coût réel. Barre après : c'est le vrai
 *    filet (un pic de sites lourds ne surprend pas le budget).
 *
 * État : `TableJson<number>` de l'étape 4 (écriture atomique). Clé `jourUTC|
 * portée` → RESET QUOTIDIEN IMPLICITE (les clés d'hier sont mortes).
 *
 * ORDRE : contrôler → réserver (incrémenter le nombre) → enfiler, le tout dans
 * UN bloc SYNCHRONE (aucun `await` au milieu). Le serveur est mono-processus et
 * les lectures/écritures du stock sont synchrones : la réservation est donc
 * atomique vis-à-vis des autres requêtes — deux requêtes quasi-simultanées ne
 * peuvent pas passer toutes les deux le contrôle avant qu'aucune n'incrémente.
 * (Multi-processus = verrou à ajouter, noté.)
 */

export interface ConfigQuota {
  /** Plafond global de scans par jour (tous demandeurs). */
  readonly global: number;
  /** Plafond de scans par jour et par origine prouvée. */
  readonly parOrigine: number;
  /** Plafond de dépense cumulée par jour, en USD. */
  readonly depenseMaxUsd: number;
  /** Plafond de scans par jour et par destinataire e-mail (réputation du domaine, étape 6). */
  readonly parDestinataire: number;
}

/** Compteurs persistés (clé → nombre). File JSON en prod (TableJson), mémoire au témoin. */
export interface StockQuota {
  lire(cle: string): number | undefined;
  ecrire(cle: string, valeur: number): void;
}

export type RaisonQuota = 'global' | 'origine' | 'depense' | 'destinataire';
export type ResultatQuota = { ok: true } | { ok: false; raison: RaisonQuota; retryApresMs: number };

/** Le jour UTC `AAAA-MM-JJ` (sans ambiguïté de fuseau) — DANS la clé → reset implicite. */
export function jourUtc(maintenant: number): string {
  return new Date(maintenant).toISOString().slice(0, 10);
}

/** Millisecondes jusqu'au prochain minuit UTC (pour `Retry-After`). */
export function msJusquaResetUtc(maintenant: number): number {
  const d = new Date(maintenant);
  const prochain = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return prochain - maintenant;
}

const cleGlobal = (jour: string): string => `${jour}|global`;
const cleOrigine = (jour: string, origine: string): string => `${jour}|origine:${origine}`;
const cleDepense = (jour: string): string => `${jour}|depense`;
const cleDestinataire = (jour: string, email: string): string => `${jour}|destinataire:${email}`;

/**
 * CONTRÔLER + RÉSERVER, synchrone. Vérifie les trois plafonds ; si tous
 * passent, INCRÉMENTE le nombre (global + origine) — la réservation — et rend
 * `ok`. Sinon rend un refus avec sa raison et le délai jusqu'au reset. Le
 * plafond de DÉPENSE barre en premier (le vrai filet). Appeler dans un bloc
 * sans `await` : c'est ce qui rend la réservation atomique (fenêtre de course).
 *
 * Si un `email` est fourni (étape 6), le PLAFOND PAR DESTINATAIRE est vérifié ET
 * incrémenté dans la même réservation atomique (tout-ou-rien) — mitigation du
 * destinataire non vérifié, protège la réputation du domaine.
 */
export function reserverScan(opts: { stock: StockQuota; maintenant: number; origine: string; config: ConfigQuota; email?: string }): ResultatQuota {
  const jour = jourUtc(opts.maintenant);
  const refus = (raison: RaisonQuota): ResultatQuota => ({ ok: false, raison, retryApresMs: msJusquaResetUtc(opts.maintenant) });

  if ((opts.stock.lire(cleDepense(jour)) ?? 0) >= opts.config.depenseMaxUsd) {
    return refus('depense');
  }
  const glob = opts.stock.lire(cleGlobal(jour)) ?? 0;
  if (glob >= opts.config.global) {
    return refus('global');
  }
  const orig = opts.stock.lire(cleOrigine(jour, opts.origine)) ?? 0;
  if (orig >= opts.config.parOrigine) {
    return refus('origine');
  }
  let dest = 0;
  if (opts.email !== undefined) {
    dest = opts.stock.lire(cleDestinataire(jour, opts.email)) ?? 0;
    if (dest >= opts.config.parDestinataire) {
      return refus('destinataire');
    }
  }
  // RÉSERVER avant d'enfiler : incrémente le nombre. Synchrone → atomique (tout-ou-rien).
  opts.stock.ecrire(cleGlobal(jour), glob + 1);
  opts.stock.ecrire(cleOrigine(jour, opts.origine), orig + 1);
  if (opts.email !== undefined) {
    opts.stock.ecrire(cleDestinataire(jour, opts.email), dest + 1);
  }
  return { ok: true };
}

/** APRÈS un scan : ajoute son coût réel au cumul de dépense du jour (alimente le plafond de dépense). */
export function enregistrerDepense(opts: { stock: StockQuota; maintenant: number; cout: number }): void {
  const cle = cleDepense(jourUtc(opts.maintenant));
  opts.stock.ecrire(cle, (opts.stock.lire(cle) ?? 0) + opts.cout);
}
