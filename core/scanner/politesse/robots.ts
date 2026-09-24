/**
 * `robots.txt` — CE QUE LE ROBOT DOIT AU SITE QU'IL VISITE.
 *
 * Un site qui nous interdit un chemin est un site qu'on n'audite pas en douce.
 * C'est une règle de conduite avant d'être une règle technique, et elle ne
 * souffre pas d'exception : le moteur refuse le chemin, et il le journalise.
 *
 * ── LA LECTURE SE FAIT HORS DU CONTEXTE OBSERVÉ, ET C'EST STRUCTUREL ────────
 *
 * Le fichier est récupéré par une requête à part, jamais par la page en cours
 * d'observation. Passer par le navigateur observé ferait d'un `robots.txt`
 * ABSENT — le cas le plus courant du web — une réponse 404 interne, donc un
 * signal, donc une anomalie `ressource-interne-404` sur tout site qui n'en a
 * pas. Le moteur signalerait à chaque client un défaut que le moteur vient de
 * fabriquer.
 *
 * ── CE QUI EST IMPLÉMENTÉ, ET CE QUI NE L'EST PAS ───────────────────────────
 *
 * Les groupes `User-agent`, les règles `Allow` et `Disallow`, les jokers `*` et
 * `$`, et l'arbitrage standard : la règle au motif le plus LONG gagne, et à
 * longueur égale `Allow` l'emporte. Le groupe qui nomme notre agent l'emporte
 * sur le groupe `*` — et s'il existe, le groupe `*` est alors ignoré, comme la
 * norme l'exige.
 *
 * Non implémentés, délibérément : `Crawl-delay` (notre délai de politesse est
 * en configuration et ne doit pas être relevé par le site inspecté) et
 * `Sitemap` (une aide à la découverte, pas une permission).
 */

/** Verdict d'un `robots.txt` pour une origine donnée. */
export interface Robots {
  /** Le chemin (avec sa requête) est-il autorisé à notre agent ? */
  estAutorise(chemin: string): boolean;
  /** Vrai si un `robots.txt` a été trouvé et lu. Faux : rien ne nous interdit rien. */
  trouve: boolean;
}

/** Tout est permis : aucun `robots.txt`, ou un fichier illisible. */
export const ROBOTS_PERMISSIF: Robots = { estAutorise: () => true, trouve: false };

interface Regle {
  motif: string;
  autorise: boolean;
}

/** Le jeton produit d'un user-agent : `ZurvelaBot/0.1 (+…)` → `zurvelabot`. */
export function jetonAgent(userAgent: string): string {
  return (userAgent.split('/')[0] ?? userAgent).trim().toLowerCase();
}

/**
 * Le motif d'une règle, converti en expression régulière ancrée au début du
 * chemin. `*` vaut n'importe quelle suite, `$` ancre la fin ; tout le reste
 * est littéral.
 */
function versExpression(motif: string): RegExp {
  const ancreFin = motif.endsWith('$');
  const corps = ancreFin ? motif.slice(0, -1) : motif;
  const echappe = corps.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${echappe}${ancreFin ? '$' : ''}`);
}

/**
 * Analyse un `robots.txt` pour NOTRE agent.
 *
 * Fonction pure : c'est elle qui porte toute la sémantique, et c'est elle
 * qu'on éprouve. La récupération réseau, elle, n'a rien à décider.
 */
export function analyserRobots(texte: string, userAgent: string): Robots {
  const nous = jetonAgent(userAgent);
  const groupes = new Map<string, Regle[]>();
  let agentsCourants: string[] = [];
  let dansRegles = false;

  for (const ligneBrute of texte.split(/\r?\n/)) {
    const ligne = ligneBrute.split('#')[0]?.trim() ?? '';
    if (ligne === '') continue;
    const separateur = ligne.indexOf(':');
    if (separateur === -1) continue;
    const champ = ligne.slice(0, separateur).trim().toLowerCase();
    const valeur = ligne.slice(separateur + 1).trim();

    if (champ === 'user-agent') {
      // Des `User-agent` consécutifs ouvrent UN groupe commun ; un `User-agent`
      // qui suit des règles en ouvre un nouveau.
      if (dansRegles) {
        agentsCourants = [];
        dansRegles = false;
      }
      agentsCourants.push(valeur.toLowerCase());
      continue;
    }
    if (champ !== 'allow' && champ !== 'disallow') continue;
    dansRegles = true;
    for (const agent of agentsCourants) {
      const regles = groupes.get(agent) ?? [];
      // `Disallow:` vide n'interdit rien — c'est la façon canonique de tout
      // autoriser, et la traiter comme un motif vide interdirait tout.
      if (valeur !== '') {
        regles.push({ motif: valeur, autorise: champ === 'allow' });
      }
      groupes.set(agent, regles);
    }
  }

  // Le groupe qui nous NOMME l'emporte, et éteint le groupe générique.
  const regles = groupes.get(nous) ?? groupes.get('*');
  if (regles === undefined) {
    return { estAutorise: () => true, trouve: true };
  }
  const compilees = regles.map((regle) => ({ ...regle, expression: versExpression(regle.motif) }));

  return {
    trouve: true,
    estAutorise(chemin) {
      let meilleure: { longueur: number; autorise: boolean } | null = null;
      for (const regle of compilees) {
        if (!regle.expression.test(chemin)) continue;
        const longueur = regle.motif.length;
        // Motif le plus long ; à longueur égale, `Allow` l'emporte.
        if (meilleure === null || longueur > meilleure.longueur || (longueur === meilleure.longueur && regle.autorise)) {
          meilleure = { longueur, autorise: regle.autorise };
        }
      }
      return meilleure === null ? true : meilleure.autorise;
    },
  };
}

/** Récupération d'un `robots.txt`, injectable : aucun test du dépôt n'appelle le réseau. */
export type RecupererRobots = (url: string) => Promise<{ statut: number; texte: string } | null>;

export const EVENEMENT_ROBOTS = 'politesse.robots';

/**
 * Charge et analyse le `robots.txt` d'une origine, HORS du contexte navigateur
 * observé. Toute issue autre qu'un fichier lu vaut « rien ne nous interdit » —
 * c'est la lecture standard, et c'est aussi la seule prudente : refuser un
 * site parce que son `robots.txt` est injoignable serait s'interdire un site
 * qui ne nous a rien interdit.
 */
export async function chargerRobots(
  origine: string,
  userAgent: string,
  recuperer: RecupererRobots,
  journaliser: (type: string, details?: unknown) => void,
): Promise<Robots> {
  const url = `${origine}/robots.txt`;
  let reponse: { statut: number; texte: string } | null = null;
  try {
    reponse = await recuperer(url);
  } catch {
    reponse = null;
  }
  if (reponse === null) {
    journaliser(EVENEMENT_ROBOTS, { url, issue: 'injoignable' });
    return ROBOTS_PERMISSIF;
  }
  if (reponse.statut !== 200) {
    journaliser(EVENEMENT_ROBOTS, { url, issue: 'absent', statut: reponse.statut });
    return ROBOTS_PERMISSIF;
  }
  const robots = analyserRobots(reponse.texte, userAgent);
  journaliser(EVENEMENT_ROBOTS, { url, issue: 'lu', octets: reponse.texte.length });
  return robots;
}

/**
 * Récupération réelle, par `fetch` — donc hors du navigateur observé, ce qui
 * est tout l'intérêt. Le robot se signale ici comme partout ailleurs.
 */
export function recupererParReseau(
  userAgent: string,
  enTete: { nom: string; valeur: string },
  delaiMs: number,
): RecupererRobots {
  return async (url) => {
    const reponse = await fetch(url, {
      headers: { 'user-agent': userAgent, [enTete.nom]: enTete.valeur },
      signal: AbortSignal.timeout(delaiMs),
      redirect: 'follow',
    });
    return { statut: reponse.status, texte: reponse.status === 200 ? await reponse.text() : '' };
  };
}
