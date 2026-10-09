/**
 * ÉTAT DURABLE EN JSON (publication, étape 4). Preuves, jetons et scans
 * survivent à un redémarrage (cohérent avec le quota). Écriture ATOMIQUE par
 * fichier temporaire + `rename` (POSIX) : jamais de fichier à moitié écrit. Un
 * seul processus serveur + file 1-à-la-fois → pas de course read-modify-write
 * concurrente ; le `rename` suffit ici (le jour d'une file parallèle, il
 * faudra un verrou — noté).
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { EntreeJeton, Preuve, StockVerification } from './verification-propriete.js';
import type { EntreeScan, StockScans } from './serveur-scan.js';

/** Table clé→valeur persistée en un JSON, écriture atomique. */
export class TableJson<T> {
  constructor(private readonly chemin: string) {}
  private lireTout(): Record<string, T> {
    try {
      return JSON.parse(readFileSync(this.chemin, 'utf8')) as Record<string, T>;
    } catch {
      return {}; // absent ou illisible = vide
    }
  }
  private ecrireTout(donnees: Record<string, T>): void {
    const tmp = `${this.chemin}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    writeFileSync(tmp, JSON.stringify(donnees), 'utf8');
    renameSync(tmp, this.chemin); // atomique : le lecteur voit l'ancien OU le nouveau, jamais un demi-fichier
  }
  lire(cle: string): T | undefined {
    return this.lireTout()[cle];
  }
  ecrire(cle: string, valeur: T): void {
    const d = this.lireTout();
    d[cle] = valeur;
    this.ecrireTout(d);
  }
  valeurs(): T[] {
    return Object.values(this.lireTout());
  }
}

/** Stock de vérification (jetons + preuves) adossé à deux fichiers JSON. */
export function stockVerificationFichier(cheminJetons: string, cheminPreuves: string): StockVerification {
  const jetons = new TableJson<EntreeJeton>(cheminJetons);
  const preuves = new TableJson<Preuve>(cheminPreuves);
  return {
    lireJeton: (o) => jetons.lire(o),
    ecrireJeton: (o, e) => jetons.ecrire(o, e),
    lirePreuve: (o) => preuves.lire(o),
    ecrirePreuve: (o, p) => preuves.ecrire(o, p),
  };
}

/** File des scans adossée à un fichier JSON ; `prochainEnAttente` = le plus ancien « en-attente ». */
export function stockScansFichier(chemin: string): StockScans {
  const table = new TableJson<EntreeScan>(chemin);
  return {
    lire: (id) => table.lire(id),
    ecrire: (id, e) => table.ecrire(id, e),
    prochainEnAttente: () =>
      table
        .valeurs()
        .filter((e) => e.etat === 'en-attente')
        .sort((a, b) => a.creeLe - b.creeLe)[0],
  };
}
