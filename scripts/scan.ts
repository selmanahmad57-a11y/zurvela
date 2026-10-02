/**
 * `pnpm scan <url> [--config production] [--sortie <fichier>]`
 *
 * La commande qui scanne un site RÉEL. Elle existe pour deux raisons, et la
 * seconde compte autant que la première :
 *
 * 1. mener les scans du bestiaire (brique 6b) ;
 * 2. EXERCER `config/production.json`. Jusqu'ici ce fichier n'était lu par
 *    rien — c'est exactement la configuration dormante de l'apprentissage n°5,
 *    et une valeur que rien n'exécute n'est pas vérifiée. Elle naît exercée ou
 *    elle reste suspecte.
 *
 * ── CE QU'ELLE NE FAIT PAS ──────────────────────────────────────────────────
 *
 * Elle ne note rien, ne compare à aucun manifeste, n'écrit aucune scorecard :
 * il n'y a pas de vérité terrain sur un site réel. Elle scanne, elle rend le
 * rapport lisible, et elle publie les chiffres bruts du scan — durée, coût,
 * pages, candidates, retenues. C'est le bestiaire, pas le banc.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { rendreRapport } from '../core/rapport/index.js';
import { chargerConfigScanner, FICHIER_CONFIG_PRODUCTION, FICHIER_CONFIG_SCANNER } from '../core/scanner/config.js';
import { creerScannerParDefaut } from '../core/scanner/defaut.js';

/** Configurations que la commande accepte, et le fichier de chacune. */
export const FICHIERS_CONFIG = {
  production: FICHIER_CONFIG_PRODUCTION,
  instrument: FICHIER_CONFIG_SCANNER,
} as const;

export type NomConfig = keyof typeof FICHIERS_CONFIG;

export function estNomConfig(valeur: string): valeur is NomConfig {
  return Object.hasOwn(FICHIERS_CONFIG, valeur);
}

/** La rejouabilité vit dans le moteur depuis P2-1 (contrat 5) ; la commande la publie, le banc aussi. */
export { tauxRejouabilite } from '../core/scanner/confirmation/rejouabilite.js';
import { tauxRejouabilite } from '../core/scanner/confirmation/rejouabilite.js';

/**
 * Le TIMEOUT du scan, et d'où il vient.
 *
 * De `scan.timeoutMs` de la configuration choisie. Il est FACULTATIF dans le
 * schéma et absent de l'instrument : une configuration qui ne le porte pas ne
 * peut pas servir à scanner, et le dire ici vaut mieux que de replier en
 * silence sur une valeur inventée — un défaut caché dans le code serait
 * exactement le seuil en dur que la constitution §2 interdit.
 */
export function timeoutDe(config: { scan?: { timeoutMs: number } }, nomConfig: string): number {
  const timeoutMs = config.scan?.timeoutMs;
  if (timeoutMs === undefined) {
    throw new Error(
      `La configuration « ${nomConfig} » ne porte pas scan.timeoutMs : elle ne peut pas piloter un scan. Utilisez --config production.`,
    );
  }
  return timeoutMs;
}

interface Options {
  url?: string;
  config: NomConfig;
  sortie?: string;
  /**
   * Fichier où écrire le RAPPORT TECHNIQUE complet (journal, candidates,
   * écartées, anomalies) en JSON.
   *
   * OBLIGATOIRE, et c'est un INVARIANT, pas un confort. Sans lui, la
   * campagne ne pouvait citer aucune preuve (bestiaire, fiche 01) — et un
   * scan dont le résultat ne survit pas à l'affichage dépense sans rien
   * apprendre (APPRENTISSAGES n°31). La règle était écrite ; elle a cédé
   * deux fois en une soirée sous l'enchaînement des gestes. Elle n'est plus
   * une case mentale : un jeu d'options SANS journal n'existe pas
   * (n°34, et n°28 — un invariant imposé bat un invariant vérifié).
   */
  journal: string;
}

export function lireOptions(args?: string[]): Options | null {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { config: { type: 'string' }, sortie: { type: 'string' }, journal: { type: 'string' } },
      allowPositionals: true,
      strict: true,
    });
    const nomConfig = values.config ?? 'production';
    if (!estNomConfig(nomConfig)) {
      return null;
    }
    // PAS DE JOURNAL, PAS D'OPTIONS. Le refus vit ici, à la lecture, et non
    // dans une garde que l'appelant pourrait oublier d'appeler.
    if (values.journal === undefined || values.journal === '') {
      return null;
    }
    return {
      ...(positionals[0] === undefined ? {} : { url: positionals[0] }),
      config: nomConfig,
      ...(values.sortie === undefined ? {} : { sortie: values.sortie }),
      journal: values.journal,
    };
  } catch {
    return null;
  }
}

async function principal(): Promise<void> {
  const options = lireOptions();
  if (options?.url === undefined) {
    console.error(
      [
        'Usage : pnpm scan <url> --journal <fichier.json> [--config production|instrument] [--sortie <fichier>]',
        '  --journal est OBLIGATOIRE : un scan dont le résultat ne survit pas à l’affichage dépense',
        '  sans rien apprendre, et aucune question posée après coup n’a de réponse (APPRENTISSAGES n°31).',
      ].join('\n'),
    );
    process.exitCode = 2;
    return;
  }

  const config = await chargerConfigScanner(FICHIERS_CONFIG[options.config]);
  const timeoutMs = timeoutDe(config, options.config);

  // CE QUE LA COMMANDE ANNONCE AVANT DE PARTIR. Un scan réel engage notre
  // responsabilité envers un site qui ne nous a rien demandé : ce qu'il va
  // faire, et ce qu'il s'interdit, se lit avant, pas après.
  console.log(
    [
      `Scan de ${options.url}`,
      `  configuration      : ${options.config}`,
      `  soumission         : ${config.interaction.soumission}`,
      `  robots.txt         : ${config.politesse.respecterRobotsTxt ? 'respecté' : 'IGNORÉ'}`,
      `  délai entre pages  : ${config.politesse.delaiEntrePagesMs} ms`,
      `  budget             : ${config.budget.maxUsdParScan === null ? 'aucun' : `${config.budget.maxUsdParScan} USD`}`,
      `  échéance           : ${timeoutMs} ms`,
      `  agent              : ${config.robot.userAgent}`,
      // LA POLITIQUE SE LIT, ELLE NE SE SUPPOSE PAS (n°30). Deux scans ont
      // été payés en croyant mesurer la politique IA, alors que la
      // production tourne en déterministe : l'information était dans un
      // fichier de config que personne n'avait ouvert.
      `  politique          : ${config.exploration.politique}`,
    ].join('\n'),
  );

  const scanner = await creerScannerParDefaut({ fichierConfig: FICHIERS_CONFIG[options.config] });
  const rapport = await scanner(options.url, { timeoutMs });
  const texte =
    rapport.rapportBusiness === undefined
      ? '(aucun rapport business : le moteur n’a pas été assemblé avec ses réglages de rapport)'
      : rendreRapport(rapport.rapportBusiness, { url: rapport.url });

  if (options.sortie === undefined) {
    console.log(`\n${texte}`);
  } else {
    await writeFile(options.sortie, `${texte}\n`, 'utf8');
    console.log(`\nRapport écrit : ${options.sortie}`);
  }
  {
    // JSON COMPACT : le journal du scan n°5 du bestiaire pesait 4,3 Mo indenté ;
    // vingt scans à ce rythme alourdissent le dépôt de dizaines de Mo pour une
    // campagne. La preuve n'a pas besoin d'être lisible à l'œil, elle a besoin
    // d'être là (outillage de campagne, règle d'or respectée).
    await writeFile(options.journal, `${JSON.stringify(rapport)}\n`, 'utf8');
    console.log(`Journal écrit : ${options.journal} (${rapport.journal.length} entrées)`);
  }

  // LE MODE IA, DIT À VOIX HAUTE. Le scan n°2 du bestiaire a tourné en mode
  // dégradé avec la clé chargée, et rien dans la sortie ne le disait : « coût
  // 0 » se lisait comme une économie. Un silence doit se lire comme un
  // silence.
  const modeIa = rapport.journal.find((entree) => entree.type === 'ia.mode')?.details as { mode?: string; raison?: string | null } | undefined;
  const rejouabilite = tauxRejouabilite(rapport);
  const ligneIa = modeIa === undefined ? 'inconnu' : modeIa.mode === 'actif' ? 'actif' : `DÉGRADÉ (${modeIa.raison ?? 'raison inconnue'})`;

  console.log(
    [
      '',
      `mode IA      : ${ligneIa}`,
      `durée        : ${rapport.dureeMs} ms`,
      `coût API     : ${rapport.coutApi}`,
      `pages        : ${rapport.parcours?.pages.length ?? 0}`,
      `candidates   : ${rapport.candidates?.length ?? 0}`,
      `retenues     : ${rapport.anomalies.length}`,
      `rejouables   : ${rejouabilite.candidatesRejouees}/${rejouabilite.candidates} candidates (${rejouabilite.groupesRejoues}/${rejouabilite.groupes} groupes)`,
      `sans effet   : ${(rapport.groupes ?? []).filter((groupe) => groupe.verdict === 'sans-effet').length} groupe(s) tiers écarté(s) d’office`,
    ].join('\n'),
  );
}

if (process.argv[1]?.endsWith('scan.ts') === true) {
  await principal();
}
