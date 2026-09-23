/**
 * Le client IA que le BANC fournit au moteur.
 *
 * Le banc est un instrument de mesure : il doit rendre le même verdict à
 * chaque exécution, donc il ne laisse jamais le moteur appeler un modèle
 * pendant une notation. Trois régimes, et un seul d'entre eux touche le
 * réseau :
 *
 * | Régime          | Réseau | Qui le déclenche                      |
 * | --------------- | ------ | ------------------------------------- |
 * | `rejeu`         | non    | `pnpm banc` (défaut)                  |
 * | `sans-ia`       | non    | `pnpm banc --sans-ia`                 |
 * | `enregistrement`| OUI    | `pnpm banc:enregistrer-ia`, et lui seul |
 * | `direct`        | OUI    | `pnpm banc:variance-ia`, hors scorecard |
 *
 * En `rejeu`, le client décoré est un client SANS CAPACITÉ : même si le
 * décorateur se trompait, il n'y aurait rien à appeler. La garde réseau n'est
 * pas une promesse, c'est une absence de moyen.
 */
import { depuisRacine } from './outils/racine.js';
import {
  clientRejouable,
  creerClientAnthropic,
  creerClientSansCapacite,
  depotCassettesFichiers,
  type ClientIa,
  type ClientIaEnregistrable,
  type DepotCassettes,
  type TarifsIa,
} from '../core/ia/index.js';
import { chargerConfigNavigation } from '../core/ia/config-navigation.js';
import { chargerConfigProfilage, chargerConfigScanner, type ConfigScanner } from '../core/scanner/config.js';

/** Dossier des cassettes, COMMITÉES : une réponse figée a un auteur, une date et un hash. */
export const DOSSIER_CASSETTES = depuisRacine('banc', 'cassettes');

/** Raison technique stable : le banc a été lancé avec `--sans-ia`. */
export const RAISON_BANC_SANS_IA = 'banc-sans-ia';

/**
 * Raison technique stable : en notation, le banc n'a AUCUN moyen d'appeler un
 * modèle. Ce n'est pas une panne, c'est la garde réseau elle-même — elle
 * n'apparaît que si une cassette manque.
 */
export const RAISON_BANC_REJEU_SEUL = 'banc-rejeu-seul';

export type RegimeIa = 'rejeu' | 'sans-ia' | 'enregistrement' | 'direct';

export interface OptionsIaBanc {
  regime: RegimeIa;
  /** Dépôt de cassettes ; celui du dossier committé par défaut (les tests injectent le leur). */
  depot?: DepotCassettes;
  env?: NodeJS.ProcessEnv;
  journaliser?: (type: string, details?: unknown) => void;
}

/**
 * Tarifs des modèles, lus dans `config/scanner.json` (`ia.tarifs`).
 *
 * Un modèle sans tarif n'est pas appelé : `creerClientAnthropic` répond
 * « tarif absent » en mode dégradé BRUYANT plutôt que de dépenser un montant
 * qu'il ne saurait pas rapporter. Le coût est la jumelle de la qualité
 * (APPRENTISSAGES n°3), et une jumelle aveugle est un échec, pas un zéro.
 */
export function tarifsConfigures(ia: ConfigScanner['ia']): TarifsIa {
  return ia.tarifs;
}

/**
 * Construit le client IA du banc pour un régime donné, plus le modèle et le
 * dossier de cassettes qu'il utilise (les commandes les affichent : on doit
 * toujours savoir ce qu'on mesure).
 */
export async function creerClientIaBanc(options: OptionsIaBanc): Promise<{ client: ClientIa; modele: string }> {
  const { regime } = options;
  const [config, profilage] = await Promise.all([chargerConfigScanner(), chargerConfigProfilage()]);
  const modele = config.ia.modeles.profilage;
  // Les réglages de DÉCISION : le budget de l'appel (`config/navigation.json`)
  // assemblé avec les bornes de l'énumération (`exploration`). Le banc les
  // charge pour la même raison qu'il charge ceux du profilage — ils entrent
  // dans la clé de cassette, donc dans ce qui rend le rejeu déterministe.
  const navigation = await chargerConfigNavigation(config.exploration);
  const decision = { modele: config.ia.modeles.navigation, config: navigation };

  if (regime === 'sans-ia') {
    return { client: creerClientSansCapacite(RAISON_BANC_SANS_IA), modele };
  }

  const concret = (): ClientIaEnregistrable =>
    creerClientAnthropic({
      config: config.ia,
      profilage,
      navigation,
      tarifs: tarifsConfigures(config.ia),
      ...(options.env === undefined ? {} : { env: options.env }),
    });

  // Hors cassettes : la variance MESURE le modèle, elle ne mesure pas le
  // moteur. Elle vit donc en dehors de la scorecard, et c'est le seul autre
  // chemin du dépôt qui appelle le réseau.
  if (regime === 'direct') {
    return { client: concret(), modele };
  }

  const depot = options.depot ?? depotCassettesFichiers(DOSSIER_CASSETTES);
  const enregistrement = regime === 'enregistrement';
  return {
    client: clientRejouable(
      enregistrement ? concret() : creerClientSansCapacite(RAISON_BANC_REJEU_SEUL),
      depot,
      {
        enregistrement,
        modele,
        profilage,
        decision,
        ...(options.journaliser === undefined ? {} : { journaliser: options.journaliser }),
      },
    ),
    modele,
  };
}
