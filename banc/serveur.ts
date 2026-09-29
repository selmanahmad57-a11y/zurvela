/**
 * Serveur de scénario : sert un gabarit en local, dans la langue du
 * scénario, avec ses bugs actifs et eux seuls.
 *
 * Trois pipelines : pages (HTML → bugs → i18n), ressources statiques
 * (fichiers du site, JS/CSS transformables par les bugs) et API du
 * formulaire (backend sain → bugs). Tout est servi sans cache pour que
 * chaque requête reflète exactement le scénario.
 *
 * Mode CLI : `pnpm banc:servir --scenario <id>`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, rendreGabarit, traduire, type Dictionnaire } from '../core/i18n.js';
import { chargerConfig } from './config.js';
import { obtenirGabarit } from './gabarits/index.js';
import { depuisRacine } from './outils/racine.js';
import { attendreReellement } from './types.js';
import type { BugInjectable, ConfigBanc, ContexteBug, Gabarit, ReponseHttp, RequeteApi, Scenario, ServeurScenario } from './types.js';

const HOTE = '127.0.0.1';

const TYPE_HTML = 'text/html; charset=utf-8';

/** Types MIME par extension (standard technique universel). */
const TYPES_MIME: Record<string, string> = {
  '.html': TYPE_HTML,
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Extensions servies en texte et soumises à `transformerRessourceTexte`. */
const EXTENSIONS_TEXTE = new Set(['.js', '.css']);

const METHODES_LECTURE = ['GET', 'HEAD'];

/** Codes d'erreur de lecture qui signifient « pas de tel fichier » (→ 404). */
const CODES_INTROUVABLE = new Set(['ENOENT', 'ENOTDIR', 'EISDIR', 'ERR_INVALID_ARG_VALUE']);

interface BugActif {
  bug: BugInjectable;
  contexte: ContexteBug;
}

/**
 * Résout les bugs actifs du scénario dans son ordre, avec leurs paramètres
 * effectifs validés. Lève si un bug est inconnu du gabarit ou si ses
 * paramètres sont invalides : une faute de fixture échoue au démarrage.
 */
function resoudreBugsActifs(
  scenario: Scenario,
  gabarit: Gabarit,
  config: ConfigBanc,
  attendre: (delaiMs: number) => Promise<void>,
  /** Origine du serveur tiers, déjà démarré ; `null` si aucun bug actif n'en demandait. */
  origineTierce: string | null,
): BugActif[] {
  return scenario.bugsActifs.map((id) => {
    const bug = gabarit.bugs.find((candidat) => candidat.id === id);
    if (bug === undefined) {
      throw new Error(`Bug inconnu du gabarit ${gabarit.nom} : ${id}`);
    }
    const parametres = { ...config.bugs[id], ...scenario.parametres?.[id] };
    bug.validerParametres?.(parametres);
    return { bug, contexte: { parametres, langue: scenario.langue, etat: {}, attendre, origineTierce } };
  });
}

/**
 * Les bugs du scénario qui réclament une SECONDE ORIGINE.
 *
 * Résolu AVANT les contextes, et c'est un ordre contraint : le port du serveur
 * tiers n'existe qu'une fois celui-ci démarré, et un bug doit connaître cette
 * origine au moment où il transforme la page. On lit donc la déclaration des
 * bugs d'abord, on démarre ensuite, on construit les contextes en dernier.
 */
function demandeUneOrigineTierce(scenario: Scenario, gabarit: Gabarit): boolean {
  return scenario.bugsActifs.some((id) => gabarit.bugs.find((bug) => bug.id === id)?.besoinOrigineTierce === true);
}

/**
 * Le serveur TIERS : une seconde origine, délibérément pauvre.
 *
 * Il ne sert aucune page et ne rend qu'une seule chose — l'échec que le
 * scénario a choisi. Son rôle n'est pas de simuler un site, c'est d'être
 * AILLEURS : ce que le moteur doit distinguer, c'est l'origine d'une requête,
 * pas la richesse de ce qu'elle renvoie.
 */
const STATUT_TIERS_EN_PANNE = 503;

function gestionnaireTiers() {
  return (req: IncomingMessage, res: ServerResponse): void => {
    // Toute ressource de ce serveur est en panne, quelle qu'elle soit : c'est
    // la dépendance tierce cassée que le gabarit vient chercher ici.
    envoyer(res, STATUT_TIERS_EN_PANNE, { 'content-type': 'text/plain; charset=utf-8' }, 'tiers en panne', req.method === 'HEAD');
  };
}

function envoyer(
  res: ServerResponse,
  statut: number,
  entetes: Record<string, string>,
  corps: string | Buffer = '',
  sansCorps = false,
): void {
  res.writeHead(statut, { ...entetes, 'cache-control': 'no-store' });
  res.end(sansCorps ? undefined : corps);
}

async function lireCorps(req: IncomingMessage): Promise<string> {
  const morceaux: Buffer[] = [];
  for await (const morceau of req) {
    morceaux.push(morceau as Buffer);
  }
  return Buffer.concat(morceaux).toString('utf8');
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Décode le corps selon son content-type ; null si absent, illisible ou d'un type non géré. */
function decoderCorps(typeContenu: string | undefined, brut: string): Record<string, unknown> | null {
  const type = (typeContenu ?? '').split(';')[0]?.trim().toLowerCase();
  if (type === 'application/json') {
    try {
      const valeur: unknown = JSON.parse(brut);
      return estObjet(valeur) ? valeur : null;
    } catch {
      return null;
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(brut));
  }
  return null;
}

/** Résout un chemin d'URL statique en fichier, ou null s'il sortirait du dossier statique. */
function resoudreFichierStatique(dossierStatique: string, cheminRelatif: string): string | null {
  const base = path.resolve(dossierStatique);
  const resolu = path.resolve(base, cheminRelatif.replace(/^\/+/, ''));
  if (resolu === base || !resolu.startsWith(base + path.sep) || resolu.includes('\0')) {
    return null;
  }
  return resolu;
}

interface Pipelines {
  /**
   * Passage à blanc : rend chaque page et transforme chaque ressource texte
   * sans rien servir, pour qu'une transformation qui lève (repère absent,
   * clé i18n manquante) fasse échouer le DÉMARRAGE plutôt que de répondre
   * 500 à la requête, invisible du correcteur.
   */
  verifier(): Promise<void>;
  page(chemin: string, fichier: string, sansCorps: boolean, res: ServerResponse): Promise<void>;
  statique(chemin: string, sansCorps: boolean, res: ServerResponse): Promise<void>;
  api(req: IncomingMessage, chemin: string, res: ServerResponse): Promise<void>;
}

/** Chemin d'URL canonique d'un fichier du dossier statique (indépendant de l'orthographe de la requête). */
function cheminStatiqueCanonique(gabarit: Gabarit, dossierStatique: string, fichier: string): string {
  return `${gabarit.prefixeStatique}/${path.relative(dossierStatique, fichier).split(path.sep).join('/')}`;
}

function construirePipelines(scenario: Scenario, gabarit: Gabarit, config: ConfigBanc, dicoSite: Dictionnaire, bugsActifs: BugActif[]): Pipelines {
  const dossierStatique = path.resolve(gabarit.dossierSite, gabarit.dossierStatique);

  async function rendrePage(chemin: string, fichier: string): Promise<string> {
    let html = await readFile(path.join(gabarit.dossierSite, fichier), 'utf8');
    for (const { bug, contexte } of bugsActifs) {
      if (bug.transformerHtml) {
        html = bug.transformerHtml(html, chemin, contexte);
      }
    }
    return rendreGabarit(html, dicoSite);
  }

  function transformerTexte(fichier: string, contenu: string): string {
    const chemin = cheminStatiqueCanonique(gabarit, dossierStatique, fichier);
    for (const { bug, contexte } of bugsActifs) {
      if (bug.transformerRessourceTexte) {
        contenu = bug.transformerRessourceTexte(chemin, contenu, contexte);
      }
    }
    return contenu;
  }

  return {
    async verifier() {
      for (const [chemin, fichier] of Object.entries(gabarit.routesPages)) {
        await rendrePage(chemin, fichier);
      }
      const entrees = await readdir(dossierStatique, { recursive: true, withFileTypes: true });
      for (const entree of entrees) {
        const fichier = path.join(entree.parentPath, entree.name);
        if (entree.isFile() && EXTENSIONS_TEXTE.has(path.extname(fichier).toLowerCase())) {
          transformerTexte(fichier, await readFile(fichier, 'utf8'));
        }
      }
    },

    async page(chemin, fichier, sansCorps, res) {
      // Le retard d'une page se paie ICI, sur la requête, et pas dans `rendrePage`
      // que `verifier()` appelle au démarrage : à ce moment-là rien n'écoute
      // encore, et un délai dont le minuteur est `unref()` laisserait le
      // processus s'éteindre en silence (cahier P2-1, gabarit site-lent).
      for (const { bug, contexte } of bugsActifs) {
        // La visite se compte ICI, sur la requête : `verifier()` rend chaque
        // page au démarrage, et un compteur tenu au rendu y perdrait une visite.
        bug.noterVisite?.(chemin, contexte);
        if (bug.retarderPage) {
          await bug.retarderPage(chemin, contexte);
        }
      }
      envoyer(res, 200, { 'content-type': TYPE_HTML }, await rendrePage(chemin, fichier), sansCorps);
    },

    async statique(chemin, sansCorps, res) {
      const fichier = resoudreFichierStatique(dossierStatique, chemin.slice(gabarit.prefixeStatique.length));
      if (fichier === null) {
        envoyer(res, 404, {});
        return;
      }
      const extension = path.extname(fichier).toLowerCase();
      const entetes = { 'content-type': TYPES_MIME[extension] ?? 'application/octet-stream' };
      let contenu: string | Buffer;
      try {
        contenu = await readFile(fichier, EXTENSIONS_TEXTE.has(extension) ? 'utf8' : null);
      } catch (erreur) {
        const code = (erreur as NodeJS.ErrnoException).code ?? '';
        if (CODES_INTROUVABLE.has(code)) {
          envoyer(res, 404, {});
          return;
        }
        throw erreur;
      }
      if (typeof contenu === 'string') {
        contenu = transformerTexte(fichier, contenu);
      }
      envoyer(res, 200, entetes, contenu, sansCorps);
    },

    async api(req, chemin, res) {
      const requete: RequeteApi = {
        methode: req.method ?? '',
        chemin,
        corps: decoderCorps(req.headers['content-type'], await lireCorps(req)),
      };
      let reponse: ReponseHttp = await gabarit.traiterApi(requete, {
        langue: scenario.langue,
        delaiReponseMs: config.site.delaiReponseApiMs,
      });
      for (const { bug, contexte } of bugsActifs) {
        if (bug.transformerReponseApi) {
          reponse = await bug.transformerReponseApi(reponse, requete, contexte);
        }
      }
      envoyer(res, reponse.statut, reponse.entetes, reponse.corps);
    },
  };
}

function construireGestionnaire(gabarit: Gabarit, pipelines: Pipelines) {
  async function traiter(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const methode = req.method ?? '';
    const sansCorps = methode === 'HEAD';

    // Un seul décodage, avant tout routage : les routes du gabarit sont déclarées
    // en clair (elles peuvent être non-ASCII) alors que `URL.pathname` est
    // percent-encodé. Cible absolue ou encodage invalides = faute du client → 400.
    let chemin: string;
    try {
      chemin = decodeURIComponent(new URL(req.url ?? '/', `http://${HOTE}`).pathname);
    } catch {
      envoyer(res, 400, {});
      return;
    }

    const fichierPage = gabarit.routesPages[chemin];
    if (fichierPage !== undefined) {
      if (!METHODES_LECTURE.includes(methode)) {
        envoyer(res, 405, { allow: METHODES_LECTURE.join(', ') });
        return;
      }
      await pipelines.page(chemin, fichierPage, sansCorps, res);
      return;
    }

    if (chemin === gabarit.cheminApiFormulaire) {
      if (methode !== 'POST') {
        envoyer(res, 405, { allow: 'POST' });
        return;
      }
      await pipelines.api(req, chemin, res);
      return;
    }

    // `/robots.txt` : servi comme n'importe quelle route, et c'est tout ce que
    // le banc en sait. Il ignore qui le lit ; le moteur, de son côté, le lit
    // HORS de son contexte navigateur observé. Les deux chemins ne se croisent
    // que sur le réseau — c'est ce qui garantit qu'un robots.txt absent reste
    // un 404 que personne n'observe, et non une anomalie fabriquée par le
    // moteur sur tout site qui n'en a pas.
    if (chemin === '/robots.txt') {
      if (!METHODES_LECTURE.includes(methode)) {
        envoyer(res, 405, { allow: METHODES_LECTURE.join(', ') });
        return;
      }
      if (gabarit.robotsTxt === undefined) {
        envoyer(res, 404, {});
        return;
      }
      envoyer(res, 200, { 'content-type': 'text/plain; charset=utf-8' }, gabarit.robotsTxt, sansCorps);
      return;
    }

    if (chemin.startsWith(`${gabarit.prefixeStatique}/`)) {
      if (!METHODES_LECTURE.includes(methode)) {
        envoyer(res, 405, { allow: METHODES_LECTURE.join(', ') });
        return;
      }
      await pipelines.statique(chemin, sansCorps, res);
      return;
    }

    envoyer(res, 404, {});
  }

  return (req: IncomingMessage, res: ServerResponse): void => {
    traiter(req, res).catch((erreur: unknown) => {
      console.error(erreur);
      if (res.headersSent) {
        res.destroy();
      } else {
        envoyer(res, 500, {});
      }
    });
  };
}

/** Tente d'écouter sur un port ; false si le port est déjà pris. */
function ecouter(serveur: Server, port: number): Promise<boolean> {
  return new Promise((resoudre, rejeter) => {
    const surErreur = (erreur: NodeJS.ErrnoException): void => {
      serveur.off('listening', surEcoute);
      if (erreur.code === 'EADDRINUSE') {
        resoudre(false);
      } else {
        rejeter(erreur);
      }
    };
    const surEcoute = (): void => {
      serveur.off('error', surErreur);
      resoudre(true);
    };
    serveur.once('error', surErreur);
    serveur.once('listening', surEcoute);
    serveur.listen(port, HOTE);
  });
}

/**
 * Démarre le serveur du scénario. Lève AVANT d'écouter si le scénario est
 * incohérent (bug inconnu, paramètre invalide) ou si une transformation ne
 * s'applique pas au site : le banc ne doit jamais noter un site mal servi.
 */
export async function demarrerServeur(
  scenario: Scenario,
  gabarit: Gabarit,
  config: ConfigBanc,
  /** Temporisation des bugs de lenteur ; les tests l'injectent pour observer l'attente au lieu de la chronométrer. */
  options: { attendre?: (delaiMs: number) => Promise<void> } = {},
): Promise<ServeurScenario> {
  // L'ORDRE EST CONTRAINT : le tiers d'abord (son port n'existe qu'une fois
  // écouté), les contextes de bug ensuite (ils ont besoin de son origine).
  const tiers = demandeUneOrigineTierce(scenario, gabarit) ? await ecouterSurUnPortLibre(gestionnaireTiers(), config) : null;
  const bugsActifs = resoudreBugsActifs(scenario, gabarit, config, options.attendre ?? attendreReellement, tiers?.url ?? null);
  const dicoSite = await chargerDictionnaire(path.join(gabarit.dossierSite, gabarit.dossierLocales), scenario.langue);
  const pipelines = construirePipelines(scenario, gabarit, config, dicoSite, bugsActifs);
  await pipelines.verifier();
  const gestionnaire = construireGestionnaire(gabarit, pipelines);

  const site = await ecouterSurUnPortLibre(gestionnaire, config).catch(async (erreur: unknown) => {
    // Le tiers est déjà en écoute : le laisser derrière soi fuiterait un port
    // à chaque scénario qui échoue à démarrer.
    await tiers?.arreter();
    throw erreur;
  });

  return {
    url: site.url,
    port: site.port,
    origineTierce: tiers?.url ?? null,
    async arreter() {
      await Promise.all([site.arreter(), tiers?.arreter() ?? Promise.resolve()]);
    },
  };
}

/** Écoute sur le premier port libre de la plage configurée, ou lève. */
async function ecouterSurUnPortLibre(
  gestionnaire: (req: IncomingMessage, res: ServerResponse) => void,
  config: ConfigBanc,
): Promise<{ url: string; port: number; arreter(): Promise<void> }> {
  const premier = config.serveur.portDeBase;
  const dernier = premier + config.serveur.nombrePortsEssayes - 1;
  for (let port = premier; port <= dernier; port += 1) {
    const serveur = createServer(gestionnaire);
    if (await ecouter(serveur, port)) {
      return {
        url: `http://${HOTE}:${port}`,
        port,
        async arreter() {
          await new Promise<void>((resoudre, rejeter) => {
            serveur.close((erreur) => (erreur ? rejeter(erreur) : resoudre()));
            serveur.closeAllConnections();
          });
        },
      };
    }
  }
  const dicoConsole = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
  throw new Error(traduire(dicoConsole, 'serveur.aucunPortLibre', { premier, dernier }));
}

// ---------------------------------------------------------------------------
// Mode CLI : pnpm banc:servir --scenario <id>
// ---------------------------------------------------------------------------

async function principal(): Promise<void> {
  const config = await chargerConfig();
  const dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);

  let id: string | undefined;
  try {
    id = parseArgs({ options: { scenario: { type: 'string' } }, strict: true }).values.scenario;
  } catch {
    id = undefined;
  }
  if (id === undefined) {
    console.error(traduire(dico, 'serveur.usage'));
    process.exitCode = 2;
    return;
  }

  // Import différé : le chargement des scénarios (flux B) n'est nécessaire qu'en mode CLI.
  const { chargerScenario, ErreurScenarioIntrouvable } = await import('./scenarios/charger.js');
  let scenario: Scenario;
  try {
    scenario = await chargerScenario(depuisRacine(config.scenarios.dossier), id);
  } catch (erreur: unknown) {
    if (erreur instanceof ErreurScenarioIntrouvable) {
      console.error(traduire(dico, 'banc.scenarioIntrouvable', { id: erreur.id }));
      process.exitCode = 1;
      return;
    }
    throw erreur;
  }
  const serveur = await demarrerServeur(scenario, obtenirGabarit(scenario.gabarit), config);
  console.log(
    traduire(dico, 'serveur.demarre', {
      id: scenario.id,
      url: serveur.url,
      langue: scenario.langue,
      bugs: scenario.bugsActifs.length > 0 ? scenario.bugsActifs.join(', ') : traduire(dico, 'serveur.aucunBug'),
    }),
  );

  process.once('SIGINT', () => {
    serveur
      .arreter()
      .then(() => {
        console.log(traduire(dico, 'serveur.arrete'));
      })
      .catch((erreur: unknown) => {
        console.error(erreur);
        process.exitCode = 1;
      });
  });
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  principal().catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  });
}
