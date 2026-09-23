/**
 * Registre des sujets que le banc sait noter : le moteur réel et le scanner
 * factice (cahier §5.2 : le factice valide que le banc lui-même n'a pas
 * régressé — il doit produire 0 % de détection et 0 faux positif).
 */
import type { ClientIa } from '../../core/ia/index.js';
import { scanner, scannerFactice } from '../../core/index.js';
import type { Scanner } from '../../core/types.js';
import { sujetConstant, type NomPolitique, type NomSujet, type Scenario, type SujetNote } from '../types.js';

export const SUJETS: Record<NomSujet, Scanner> = { reel: scanner, factice: scannerFactice };

export const NOMS_SUJETS: NomSujet[] = Object.keys(SUJETS) as NomSujet[];

export function estNomSujet(nom: string): nom is NomSujet {
  return NOMS_SUJETS.includes(nom as NomSujet);
}

/**
 * Ce que le banc IMPOSE au moteur pour un scénario donné, en plus du client IA.
 *
 * Ces deux réglages appartiennent au moteur (`config/scanner.json`,
 * `exploration`) mais c'est l'INSTRUMENT qui décide de leur valeur pendant une
 * notation : la politique parce qu'un run mesure une politique à la fois, le
 * budget parce que c'est le scénario — et lui seul — qui sait sous quelle
 * contrainte il doit être noté.
 *
 * FRONTIÈRE AVEC LE MOTEUR : ces surcharges sont passées à
 * `creerScannerParDefaut`. Le banc ne les suppose pas appliquées — il
 * VÉRIFIE, après le scan, que le rapport porte bien la politique demandée et
 * respecte le budget (`correcteur/navigation.ts`). Un canal muet fait donc
 * échouer le scénario bruyamment, il ne produit jamais une mesure verte du
 * comportement par défaut.
 */
export interface SurchargesExploration {
  /** Surcharges PARTIELLES de `config/scanner.json` → `exploration` ; ce qui n'est pas nommé garde sa valeur de config. */
  exploration: { politique?: NomPolitique; pagesMax?: number };
}

/**
 * Le sujet à noter, monté avec le client IA que le banc lui impose et les
 * contraintes du scénario.
 *
 * Le moteur réel assemblé par `core/index.js` construit SON client (dégradé
 * sans clé). Le banc, lui, doit imposer le sien : rejeu sur cassettes, ou
 * aucune capacité du tout. Sans cette injection, un poste portant une clé
 * d'API ferait appeler le réseau au milieu d'une notation, et l'instrument
 * cesserait d'être déterministe — exactement ce que les cassettes existent
 * pour empêcher.
 *
 * `ia` absent = comportement historique (le moteur monte son propre client) :
 * c'est ce dont les tests qui ne parlent pas d'IA ont besoin.
 */
export async function creerSujet(
  nom: NomSujet,
  ia?: ClientIa,
  options: { politique?: NomPolitique } = {},
): Promise<SujetNote> {
  if (nom === 'factice' || ia === undefined) {
    return sujetConstant(nom, SUJETS[nom]);
  }
  // Import différé : l'assemblage réel tire Playwright et la configuration,
  // dont le scanner factice n'a que faire.
  const { creerScannerParDefaut } = await import('../../core/scanner/defaut.js');
  const politique = options.politique;
  return {
    nom,
    async pour(scenario: Scenario): Promise<Scanner> {
      const pagesMax = scenario.contraintes?.pagesMax;
      if (politique === undefined && pagesMax === undefined) {
        return creerScannerParDefaut({ ia });
      }
      const exploration: SurchargesExploration['exploration'] = {
        ...(politique === undefined ? {} : { politique }),
        ...(pagesMax === undefined ? {} : { pagesMax }),
      };
      const assemblage: { ia: ClientIa } & SurchargesExploration = { ia, exploration };
      return creerScannerParDefaut(assemblage);
    },
  };
}
