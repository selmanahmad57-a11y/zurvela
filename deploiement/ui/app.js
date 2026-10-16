/*
 * app.js — CÂBLAGE (glue) de l'interface marchande. NON testé unitairement (DOM +
 * réseau) : son seul filet est l'e2e réel. Toute la LOGIQUE à enjeu est ailleurs,
 * extraite et gardée sous le gate — ce module ne fait que l'orchestrer :
 *   dispatcherReponseScanner (router /scanner), actionReessai (réessai + garde CDN),
 *   cleMessageEchec (clé du message), traduire (texte, via le chercher partagé).
 *
 * INVARIANT CDN tenu STRUCTURELLEMENT (le dernier fil du chantier). Ce module ne
 * `fetch` QUE l'API Zurvela (/verifier, /scanner, /statut) — JAMAIS l'URL du jeton
 * (origine+chemin) du marchand. Le seul GET sur cette URL est celui que le SERVEUR
 * fait pendant /scanner, déclenché par le clic « c'est déposé ». L'écran `depot` est
 * donc INERTE vis-à-vis de l'URL du jeton : il AFFICHE (texte + téléchargement Blob
 * LOCAL) et attend le clic. Aucun aperçu, aucune vérif auto. Vrai à CHAQUE passage —
 * premier dépôt ET re-dépôt après `reverifier` (c'est un invariant de l'écran, pas du
 * premier affichage). Sans ça, un GET prématuré figerait un 404 au cache CDN.
 *
 * Ordre déposer-puis-scanner rendu STRUCTUREL : un écran à la fois, et l'action
 * « scanner » n'EXISTE que sur l'écran `depot` (atteint après /verifier). Pas de garde
 * dans un handler (violable par un remaniement DOM) — une affordance absente.
 */
import { dispatcherReponseScanner } from './dispatch-scanner.js';
import { actionReessai } from './reessai.js';
import { cleMessageEchec } from './message-echec.js';
import { cleMessageQuota } from './message-quota.js';
import { traduire } from './i18n.js';

const app = document.getElementById('app');

/** Dictionnaire client (chargé au démarrage) et raccourci de traduction. */
let dict = null;
const t = (cle, valeurs) => traduire(dict, cle, valeurs);

/** État : saisie du marchand + jeton courant (null avant /verifier). */
let urlSite = '';
let email = '';
/** @type {{origine:string, jeton:string, chemin:string, expireLe:number} | null} */
let jeton = null;

// ───────── petits assembleurs DOM (textContent partout : zéro injection) ─────────
function el(tag, props = {}, enfants = []) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const c of [].concat(enfants)) if (c != null) n.append(c);
  return n;
}
// Même règle que `el` : un nœud `null`/`undefined` (ex. `condition ? el(...) : null`) ne
// devient JAMAIS un enfant — sinon le DOM le coerce en un nœud texte « null » bien visible.
function montrer(...noeuds) { app.replaceChildren(...noeuds.filter((n) => n != null)); }

// ───────── API Zurvela, MÊME ORIGINE. Jamais l'URL du jeton du marchand. ─────────
async function apiPost(chemin, corps) {
  const r = await fetch(chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  const txt = await r.text();
  return { statut: r.status, corps: txt ? JSON.parse(txt) : {} };
}
async function apiGet(chemin) {
  const r = await fetch(chemin);
  const txt = await r.text();
  return { statut: r.status, corps: txt ? JSON.parse(txt) : {} };
}

// ───────── écran SAISIE ─────────
function montrerSaisie(messageErreur) {
  const champUrl = el('input', { type: 'url', id: 'url', value: urlSite, placeholder: t('interface.saisie.placeholderUrl') });
  const champEmail = el('input', { type: 'email', id: 'email', value: email, placeholder: t('interface.saisie.placeholderEmail') });
  const continuer = () => {
    urlSite = champUrl.value.trim();
    email = champEmail.value.trim();
    if (urlSite === '') return montrerSaisie(t('interface.saisie.vide'));
    verifier();
  };
  montrer(
    el('h1', { textContent: t('interface.titre') }),
    el('p', { className: 'intro', textContent: t('interface.saisie.intro') }),
    el('label', { htmlFor: 'url', textContent: t('interface.saisie.labelUrl') }),
    champUrl,
    el('label', { htmlFor: 'email', textContent: t('interface.saisie.labelEmail') }),
    champEmail,
    messageErreur ? el('p', { className: 'erreur-saisie', textContent: messageErreur }) : null,
    el('button', { className: 'bouton', textContent: t('interface.saisie.bouton'), onclick: continuer }),
  );
}

async function verifier() {
  let r;
  try { r = await apiPost('/verifier', { url: urlSite }); } catch { return montrerSaisie(t('interface.reseau')); }
  if (r.statut === 200) { jeton = r.corps; return montrerDepot(); }
  // 400 : l'adresse est le problème (vide / invalide / schéma…). Un seul message marchand.
  return montrerSaisie(t('interface.saisie.invalide'));
}

// ───────── écran DEPOT — INERTE vis-à-vis de l'URL du jeton ─────────
function montrerDepot() {
  const urlAttendue = jeton.origine + jeton.chemin; // AFFICHÉ (texte), jamais fetché ici
  const etape = (num, contenu) =>
    el('li', {}, [el('span', { className: 'num', textContent: String(num) }), ' ', contenu].flat());
  montrer(
    el('h2', { textContent: t('interface.depot.titre') }),
    el('ul', { className: 'etapes' }, [
      etape(1, [t('interface.depot.etape1'), el('div', {}, el('button', { className: 'bouton-secondaire', textContent: t('interface.depot.telecharger'), onclick: telecharger }))]),
      etape(2, [t('interface.depot.etape2'), el('div', { className: 'url-boite', textContent: urlAttendue })]),
      etape(3, t('interface.depot.etape3')),
    ]),
    el('p', { className: 'aide', textContent: t('interface.depot.aide') }),
    // Le SEUL déclencheur d'un GET sur l'URL du jeton : ce clic → /scanner (côté serveur).
    el('button', { className: 'bouton', textContent: t('interface.depot.bouton'), onclick: lancerScan }),
  );
}

function telecharger() {
  // Blob LOCAL (objet blob:), PAS l'URL du jeton — zéro réseau vers le site du marchand.
  const nom = jeton.chemin.split('/').filter(Boolean).pop() || 'zurvela-verification.txt';
  const href = URL.createObjectURL(new Blob([jeton.jeton], { type: 'text/plain' }));
  el('a', { href, download: nom }).click();
  URL.revokeObjectURL(href);
}

async function lancerScan() {
  let r;
  try { r = await apiPost('/scanner', { url: urlSite, ...(email ? { email } : {}) }); }
  catch { return montrerSimple(t('interface.reseau'), montrerDepot); }
  rendreReponseScanner(r.statut, r.corps);
}

// ───────── dispatch (par STATUT) → rendu de la branche ─────────
function rendreReponseScanner(statut, corps) {
  const r = dispatcherReponseScanner(statut, corps);
  switch (r.type) {
    case 'scan-lance':         return montrerSuivi(r.scanId);
    case 'echec-verification': return montrerEchec(r.echec);
    case 'quota':              return montrerSimple(t(cleMessageQuota(r.portee)), null);
    case 'saisie-invalide':    return montrerSaisie(r.champ === 'email-invalide' ? t('interface.saisie.emailInvalide') : t('interface.saisie.invalide'));
    case 'incoherence-serveur': return montrerSimple(t('interface.incoherence'), montrerDepot);
  }
}

// ───────── écran ÉCHEC (l'exigence centrale : discriminé + auto-diagnostic) ─────────
function montrerEchec(echec) {
  const action = actionReessai(echec); // 'corriger-url' | 'reverifier' | 'resoumettre'
  const bloc = el('div', { className: 'echec' }, [
    el('h2', { textContent: t('interface.echec.titre') }),
    el('p', { textContent: t(cleMessageEchec(echec.categorie)) }),
  ]);
  if (echec.urlVerifiee) {
    // Auto-diagnostic des seaux absent/contenu-inattendu : l'URL EXACTE testée, cliquable.
    bloc.append(
      el('p', { textContent: t('interface.echec.urlVerifiee') }),
      el('div', { className: 'url-boite' }, el('a', { href: echec.urlVerifiee, textContent: echec.urlVerifiee, target: '_blank', rel: 'noopener noreferrer' })),
      el('p', { className: 'aide' }, el('a', { href: echec.urlVerifiee, textContent: t('interface.echec.ouvrir'), target: '_blank', rel: 'noopener noreferrer' })),
    );
  }
  const libelle = action === 'corriger-url' ? t('interface.echec.corrigerUrl') : t('interface.echec.reessayer');
  bloc.append(el('button', { className: 'bouton', textContent: libelle, onclick: () => executerReessai(action) }));
  montrer(bloc);
}

function executerReessai(action) {
  if (action === 'corriger-url') return montrerSaisie();   // re-saisir l'adresse (url-invalide)
  if (action === 'reverifier')  return verifier();          // jeton FRAIS (re-/verifier → depot) : nouvelle URL, échappe au 404 CDN
  if (action === 'resoumettre') return lancerScan();        // re-/scanner, jeton courant (rien de cachable n'avait été servi)
}

// ───────── écran SUIVI + poll ─────────
function montrerSuivi(scanId) {
  montrer(
    el('h2', { textContent: t('interface.suivi.enCours') }),
    el('p', { className: 'silencieux', textContent: email ? t('interface.suivi.avecEmail') : t('interface.suivi.sansEmail') }),
  );
  sonder(scanId);
}
function sonder(scanId) {
  apiGet('/statut/' + encodeURIComponent(scanId)).then(({ statut, corps }) => {
    if (statut === 200 && corps.etat === 'termine' && corps.rapportHtml) return montrerRapport(corps.rapportHtml);
    if (statut === 200 && corps.etat === 'echoue') return montrerSimple(t('interface.incoherence'), null);
    setTimeout(() => sonder(scanId), 2000); // en-attente / en-cours → re-sonder
  }).catch(() => setTimeout(() => sonder(scanId), 2000));
}
function montrerRapport(rapportHtml) {
  // Le rapport est un document HTML complet : on l'ouvre isolé (Blob, nouvel onglet),
  // jamais inliné dans la page (pas de mélange de styles ni de surface).
  const href = URL.createObjectURL(new Blob([rapportHtml], { type: 'text/html' }));
  montrer(
    el('h2', { textContent: t('interface.suivi.voir') }),
    el('a', { className: 'bouton', href, target: '_blank', rel: 'noopener', textContent: t('interface.suivi.voir') }),
  );
}

// ───────── écran message simple (quota / incohérence / réseau) ─────────
function montrerSimple(message, reprise) {
  const bloc = el('div', { className: 'echec' }, el('p', { textContent: message }));
  if (reprise) bloc.append(el('button', { className: 'bouton', textContent: t('interface.echec.reessayer'), onclick: reprise }));
  montrer(bloc);
}

// ───────── démarrage : charge la locale CLIENTE, puis la saisie ─────────
async function demarrer() {
  try {
    const r = await fetch('locales/fr.json'); // le MÊME fichier servi (deploiement/ui/locales/), pas le fr.json racine serveur
    if (!r.ok) throw new Error('locale ' + r.status);
    dict = await r.json();
    montrerSaisie();
  } catch {
    // BOOTSTRAP FALLBACK — la SEULE exception à §2 : ce message ne peut pas venir des
    // locales, puisqu'il s'affiche précisément quand les locales n'ont pas pu charger.
    // Hardcodé, minimal, assumé — sans lui, un déploiement où `locales/` manque laisserait
    // une page morte sans explication. L'e2e teste d'abord « la page s'initialise ».
    app.replaceChildren(el('p', { className: 'echec', textContent: 'Interface momentanément indisponible. Réessayez dans un instant.' }));
  }
}
demarrer();
