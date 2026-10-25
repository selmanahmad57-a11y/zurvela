/**
 * WEBHOOKS RESEND (étape 7, délivrabilité) — la boucle de retour : livré, bounce,
 * plainte, retard. Resend signe ses webhooks au format SVIX.
 *
 * GARDE D'AUTHENTICITÉ (ce fichier) : vérifier la signature AVANT de croire un
 * événement. Sans elle, le contenu d'un POST est une DONNÉE NON FIABLE (§3) — un
 * tiers pourrait fabriquer une fausse plainte ou un faux bounce et empoisonner nos
 * métriques et nos alertes. HMAC-SHA256, `node:crypto`, zéro dépendance npm (comme
 * l'envoi : Resend est une dépendance de SERVICE, pas de code).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface EnTetesSvix {
  /** `svix-id` */
  readonly id: string;
  /** `svix-timestamp` (secondes Unix) */
  readonly timestamp: string;
  /** `svix-signature` : liste « v1,<base64> » séparée par des espaces */
  readonly signature: string;
}

/**
 * La signature Svix est-elle valide pour ce corps ? HMAC-SHA256 de
 * `${id}.${timestamp}.${corps}` avec la clé du secret (`whsec_<base64>`), comparé
 * en TEMPS CONSTANT à chaque signature `v1,...` de l'en-tête. Fail-closed : tout
 * ce qui n'est pas une correspondance exacte rend `false`.
 */
export function signatureSvixValide(secret: string, en: EnTetesSvix, corps: string): boolean {
  // Secret Resend/Svix : « whsec_<base64> ». On retire le préfixe, on décode la clé.
  const brut = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const cle = Buffer.from(brut, 'base64');
  if (cle.length === 0 || en.id === '' || en.timestamp === '') {
    return false;
  }
  const contenu = `${en.id}.${en.timestamp}.${corps}`;
  const attendue = createHmac('sha256', cle).update(contenu).digest();
  // L'en-tête peut porter plusieurs signatures (rotation de clé), séparées par un espace.
  for (const partie of en.signature.split(' ')) {
    const virgule = partie.indexOf(',');
    if (virgule < 0) {
      continue; // pas au format « vN,<base64> »
    }
    const recue = Buffer.from(partie.slice(virgule + 1), 'base64');
    if (recue.length === attendue.length && timingSafeEqual(recue, attendue)) {
      return true;
    }
  }
  return false;
}

// ─────────────────────── Événements (la boucle de retour) ───────────────────────

/**
 * Les 4 types d'événements Resend que nous traitons. Ce sont des constantes de
 * PROTOCOLE de notre service de mail — au même régime que l'URL de l'API ou les
 * noms de champs `from`/`to` déjà en dur dans `courriel.ts` : « LE WEB » que le
 * code peut connaître, pas « LE MONDE » (ni langue, ni site, ni secteur). Un type
 * hors de cette liste est ACQUITTÉ (200) puis ignoré.
 */
export type TypeEvenementResend = 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.delivery_delayed';
const EVENEMENTS_GERES: ReadonlySet<string> = new Set<TypeEvenementResend>([
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.delivery_delayed',
]);

export interface EvenementResend {
  readonly type: TypeEvenementResend;
  /** `data.email_id` — l'id OPAQUE Resend de l'e-mail envoyé. PAS l'adresse du marchand (§3). */
  readonly emailId: string;
}

/**
 * Parse le corps (DÉJÀ authentifié par la signature) en événement connu, ou `null`
 * (JSON invalide, type non géré, `email_id` absent). On n'extrait QUE le type et
 * l'`email_id` : jamais `data.to` (l'adresse du marchand — minimisation, §3).
 */
export function analyserEvenementResend(corps: string): EvenementResend | null {
  let v: unknown;
  try {
    v = JSON.parse(corps);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const type = (v as Record<string, unknown>)['type'];
  if (typeof type !== 'string' || !EVENEMENTS_GERES.has(type)) return null;
  const data = (v as Record<string, unknown>)['data'];
  const emailId = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['email_id'] : undefined;
  if (typeof emailId !== 'string' || emailId === '') return null;
  return { type: type as TypeEvenementResend, emailId };
}

// ─────────────────────── Fenêtre, seuils, alertes ───────────────────────

export interface EvenementHorodate {
  readonly type: TypeEvenementResend;
  readonly creeLe: number;
}

export interface SeuilsWebhook {
  /**
   * Fenêtre glissante des stats ET de l'idempotence (ms). Elle doit rester ≥
   * l'horizon de retry de Svix, sinon une redelivery tardive serait recomptée ;
   * ce plancher est IMPOSÉ par le schéma de config (invariant en config, pas en
   * code). Défaut documenté : 7 jours.
   */
  readonly fenetreMs: number;
  /** Taux de bounce au-delà duquel on alerte (ex. 0,02 = 2 %). */
  readonly tauxBounceMax: number;
  /**
   * Plancher ABSOLU de bounces sous lequel le taux est du bruit : un marchand qui
   * tape mal son e-mail = 100 % sur 1 envoi. À bas volume, le pourcentage seul est
   * inutilisable — d'où « bounces ≥ plancher ET taux > seuil ».
   */
  readonly bounceMinAbsolu: number;
}

export type GenreAlerte = 'plainte' | 'taux-bounce';
export interface AlerteWebhook {
  readonly genre: GenreAlerte;
  /** id Resend de l'e-mail déclencheur — JAMAIS l'adresse (§3). */
  readonly emailId: string;
  readonly detail: Readonly<Record<string, number>>;
}

/**
 * Quelles alertes l'événement COURANT déclenche, vu l'état de la fenêtre (qui
 * l'inclut déjà). Deux signaux :
 *  - PLAINTE : toute plainte alerte. Une plainte est grave EN SOI et SOUS-RAPPORTÉE
 *    — des fournisseurs (p. ex. Gmail) ne renvoient PAS de `complained` à Resend.
 *    Donc une qui ARRIVE est un signal fort, et « zéro plainte » au compteur ne veut
 *    PAS dire zéro plainte dans la réalité, seulement zéro chez les fournisseurs qui
 *    les remontent. NE JAMAIS lire un compteur de plaintes à zéro comme une absence
 *    de problème.
 *  - TAUX DE BOUNCE : alerte si bounces ≥ plancher absolu ET taux > seuil.
 * Rappel : ces compteurs mesurent des ÉVÉNEMENTS REÇUS, pas la réalité complète.
 */
export function alertesWebhook(evenement: EvenementResend, fenetre: readonly EvenementHorodate[], seuils: SeuilsWebhook): AlerteWebhook[] {
  if (evenement.type === 'email.complained') {
    return [{ genre: 'plainte', emailId: evenement.emailId, detail: { plaintesFenetre: fenetre.filter((e) => e.type === 'email.complained').length } }];
  }
  if (evenement.type === 'email.bounced') {
    const bounces = fenetre.filter((e) => e.type === 'email.bounced').length;
    const verdicts = fenetre.filter((e) => e.type === 'email.bounced' || e.type === 'email.delivered').length;
    const taux = verdicts === 0 ? 0 : bounces / verdicts;
    if (bounces >= seuils.bounceMinAbsolu && taux > seuils.tauxBounceMax) {
      return [{ genre: 'taux-bounce', emailId: evenement.emailId, detail: { bounces, verdicts, tauxPourMille: Math.round(taux * 1000) } }];
    }
  }
  return [];
}

// ─────────────────────── Idempotence + traitement ───────────────────────

/** Journal DURABLE des webhooks : idempotence (svix-id vus) + fenêtre d'événements (stats). */
export interface StockWebhook {
  /** Ce svix-id a-t-il déjà été traité ? (idempotence contre les redeliveries Svix) */
  dejaVu(svixId: string): boolean;
  /** Marque le svix-id vu ET ajoute l'événement à la fenêtre ; élague au-delà de `fenetreMs`. */
  enregistrer(svixId: string, evenement: EvenementHorodate, maintenant: number, fenetreMs: number): void;
  /** Les événements dans la fenêtre `[maintenant - fenetreMs, maintenant]`. */
  fenetre(maintenant: number, fenetreMs: number): readonly EvenementHorodate[];
}

export interface ResultatWebhook {
  readonly statut: number;
  readonly alertes: readonly AlerteWebhook[];
}

/**
 * LE TRAITEMENT (pur, I/O injecté). Ordre IMPÉRATIF :
 *   secret présent → signature vérifiée → PUIS parser → idempotence → enregistrer → alertes.
 * Le corps est DONNÉE NON FIABLE jusqu'à la vérif (§3) : on ne parse rien avant.
 *
 * Fail-closed partout : SANS secret ou sur signature invalide → 401, RIEN enregistré.
 * C'est l'INVERSE du mode dégradé d'un client (où dégradé = « on n'appelle pas le
 * service ») : ici accepter sans vérifier rouvrirait le trou que Svix ferme (un tiers
 * fabriquerait de fausses plaintes). Absence de config = fermé, comme le proxy d'egress.
 *
 * Le `stock` peut lancer (I/O) : on laisse propager → la coquille du serveur fait un
 * 500 propre → Svix retente (non-2xx) → l'idempotence absorbe la redelivery.
 */
export function traiterWebhookResend(opts: {
  readonly secret: string | undefined;
  readonly enTetes: EnTetesSvix;
  readonly corps: string;
  readonly stock: StockWebhook;
  readonly maintenant: number;
  readonly seuils: SeuilsWebhook;
}): ResultatWebhook {
  if (opts.secret === undefined || opts.secret === '') return { statut: 401, alertes: [] };
  if (!signatureSvixValide(opts.secret, opts.enTetes, opts.corps)) return { statut: 401, alertes: [] };
  const evt = analyserEvenementResend(opts.corps);
  if (evt === null) return { statut: 200, alertes: [] }; // type non géré / corps hors-forme : ACK, rien à faire
  if (opts.stock.dejaVu(opts.enTetes.id)) return { statut: 200, alertes: [] };
  opts.stock.enregistrer(opts.enTetes.id, { type: evt.type, creeLe: opts.maintenant }, opts.maintenant, opts.seuils.fenetreMs);
  return { statut: 200, alertes: alertesWebhook(evt, opts.stock.fenetre(opts.maintenant, opts.seuils.fenetreMs), opts.seuils) };
}
