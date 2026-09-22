/**
 * Registre des sujets que le banc sait noter : le moteur réel et le scanner
 * factice (cahier §5.2 : le factice valide que le banc lui-même n'a pas
 * régressé — il doit produire 0 % de détection et 0 faux positif).
 */
import { scanner, scannerFactice } from '../../core/index.js';
import type { Scanner } from '../../core/types.js';
import type { NomSujet } from '../types.js';

export const SUJETS: Record<NomSujet, Scanner> = { reel: scanner, factice: scannerFactice };

export const NOMS_SUJETS: NomSujet[] = Object.keys(SUJETS) as NomSujet[];

export function estNomSujet(nom: string): nom is NomSujet {
  return NOMS_SUJETS.includes(nom as NomSujet);
}
