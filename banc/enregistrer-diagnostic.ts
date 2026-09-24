/**
 * `pnpm banc:enregistrer-diagnostic` — enregistre les cassettes du CORPUS de
 * diagnostic, et publie la mesure. Avec `banc:enregistrer-ia` et
 * `banc:variance-ia`, c'est l'un des seuls chemins du dépôt qui appellent un
 * modèle.
 *
 * Pourquoi une commande à part de `banc:enregistrer-ia`. Celle-là enregistre
 * par un SCAN RÉEL, parce que la clé d'une cassette de profil ou de décision
 * est un hash d'un contexte que seul le pipeline sait produire. Le corpus,
 * lui, ne vient d'aucun scan : ses journaux sont dérivés puis ÉDITÉS, et
 * aucun scénario du banc ne les reproduirait. Le faire passer par la même
 * commande obligerait à inventer un scénario qui déclenche le diagnostic —
 * c'est-à-dire un sabotage au registre du banc, que l'annexe A6 interdit.
 *
 * AUCUNE cassette de diagnostic n'entre au banc : les scénarios ne
 * déclenchent jamais le diagnostic, donc le déterminisme de l'instrument ne
 * dépend pas de cette brique. Ces cassettes ne servent qu'au corpus.
 *
 * Usage : pnpm banc:enregistrer-diagnostic [--cas <id>]…
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chargerDictionnaire, traduire } from '../core/i18n.js';
import { chargerConfigScanner } from '../core/scanner/config.js';
import { chargerConfig } from './config.js';
import { chargerCorpus, mesurerCorpus } from './corpus-diagnostic/index.js';
import { creerClientIaBanc, DOSSIER_CASSETTES } from './ia.js';
import { depuisRacine } from './outils/racine.js';

/** Nommée pour que l'échec du corpus puisse la citer : une absence nommée est une étape, pas un mur. */
export const COMMANDE_ENREGISTREMENT_DIAGNOSTIC = 'pnpm banc:enregistrer-diagnostic';

interface Options {
  cas: string[];
}

export function lireOptions(args?: string[]): Options | null {
  try {
    const { values } = parseArgs({ args, options: { cas: { type: 'string', multiple: true } }, strict: true });
    return { cas: values.cas ?? [] };
  } catch {
    return null;
  }
}

async function principal(): Promise<void> {
  const config = await chargerConfig();
  const dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
  const montant = new Intl.NumberFormat(config.langueConsole, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  const options = lireOptions();
  if (options === null) {
    console.error(traduire(dico, 'enregistrerDiagnostic.usage'));
    process.exitCode = 2;
    return;
  }

  const tous = await chargerCorpus();
  const corpus = options.cas.length === 0 ? tous : tous.filter((cas) => options.cas.includes(cas.id));
  if (corpus.length === 0) {
    console.error(traduire(dico, 'enregistrerDiagnostic.aucunCas', { cas: options.cas.join(', ') }));
    process.exitCode = 1;
    return;
  }

  const configScanner = await chargerConfigScanner();
  const { client } = await creerClientIaBanc({
    regime: 'enregistrement',
    journaliser: (type, details) => {
      console.log(`  ${type} ${JSON.stringify(details ?? {})}`);
    },
  });
  // Un enregistrement SANS CAPACITÉ n'enregistre rien, et le dire après coup
  // serait le dire trop tard (même garde que `banc:enregistrer-ia`).
  if (client.mode === 'degrade') {
    console.error(traduire(dico, 'enregistrerIa.sansCapacite', { raison: client.raisonDegrade ?? '' }));
    process.exitCode = 1;
    return;
  }
  console.log(
    traduire(dico, 'enregistrerDiagnostic.demarrage', {
      nombre: corpus.length,
      modele: configScanner.ia.modeles.diagnostic,
      dossier: DOSSIER_CASSETTES,
    }),
  );

  const mesure = await mesurerCorpus(client, corpus);
  for (const resultat of mesure.resultats) {
    console.log(
      traduire(dico, 'enregistrerDiagnostic.cas', {
        id: resultat.id,
        attendu: resultat.avisAttendu,
        rendu: resultat.avisRendu ?? (resultat.raison ?? ''),
        verdict: resultat.correct ? 'ok' : 'ko',
        cout: montant.format(resultat.coutApi),
      }),
    );
  }
  console.log(
    traduire(dico, 'enregistrerDiagnostic.termine', {
      corrects: mesure.nbCorrects,
      total: corpus.length,
      mesures: mesure.nbMesures,
      cout: montant.format(mesure.coutApi),
    }),
  );

  // Deux échecs DISTINCTS, parce qu'ils n'appellent pas la même correction :
  // un cas muet est un parc incomplet (on relance), un cas faux est un
  // désaccord du modèle (on regarde le prompt, ou l'attendu). Une garde qui
  // accuse le mauvais coupable est pire qu'une garde absente.
  if (mesure.nbNonMesures > 0) {
    console.error(traduire(dico, 'enregistrerDiagnostic.incomplet', { nombre: mesure.nbNonMesures, total: corpus.length }));
    process.exitCode = 1;
    return;
  }
  if (mesure.nbCorrects < corpus.length) {
    console.error(
      traduire(dico, 'enregistrerDiagnostic.desaccord', {
        nombre: corpus.length - mesure.nbCorrects,
        cas: mesure.resultats
          .filter((resultat) => !resultat.correct)
          .map((resultat) => `${resultat.id} (attendu ${resultat.avisAttendu}, rendu ${resultat.avisRendu ?? ''})`)
          .join(', '),
      }),
    );
    process.exitCode = 1;
  }
}

// Exécuté seulement en ligne de commande : un import de test ne doit jamais
// lancer la commande (ni ses appels réseau payants).
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await principal();
}
