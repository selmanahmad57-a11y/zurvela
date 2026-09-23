/**
 * Registre des sujets que le banc sait noter : le moteur réel et le scanner
 * factice (cahier §5.2 : le factice valide que le banc lui-même n'a pas
 * régressé — il doit produire 0 % de détection et 0 faux positif).
 */
import type { ClientIa } from '../../core/ia/index.js';
import { scanner, scannerFactice } from '../../core/index.js';
import type { Scanner } from '../../core/types.js';
import type { NomSujet } from '../types.js';

export const SUJETS: Record<NomSujet, Scanner> = { reel: scanner, factice: scannerFactice };

export const NOMS_SUJETS: NomSujet[] = Object.keys(SUJETS) as NomSujet[];

export function estNomSujet(nom: string): nom is NomSujet {
  return NOMS_SUJETS.includes(nom as NomSujet);
}

/**
 * Le sujet à noter, monté avec le client IA que le banc lui impose.
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
export async function creerSujet(nom: NomSujet, ia?: ClientIa): Promise<Scanner> {
  if (nom === 'factice' || ia === undefined) {
    return SUJETS[nom];
  }
  // Import différé : l'assemblage réel tire Playwright et la configuration,
  // dont le scanner factice n'a que faire.
  const { creerScannerParDefaut } = await import('../../core/scanner/defaut.js');
  return creerScannerParDefaut({ ia });
}
