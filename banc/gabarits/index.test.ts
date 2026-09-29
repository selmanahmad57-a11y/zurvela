/**
 * TEST DE FORME des `profilAttendu` du registre — APPRENTISSAGES n°5.
 *
 * `typeSite` est une valeur du vocabulaire de `config/profilage.json`, recopiée
 * dans le gabarit. Rien ne confrontait la copie à sa source : le type du champ
 * est `string`, le schéma du manifeste n'exige qu'une chaîne non vide, et la
 * seule assertion existante comparait la constante à sa propre copie littérale.
 *
 * Le jour où `typesSite` serait renommé — ce que `config/profilage.json` invite
 * explicitement à faire (« étendre le vocabulaire se fait ICI ») —, la valeur
 * attendue deviendrait INATTEIGNABLE : le schéma de sortie l'interdirait au
 * modèle, les cassettes committées rejoueraient une réponse que la validation
 * rejette, et la scorecard afficherait des profils non mesurés sans qu'aucun
 * message ne désigne la config. Le banc accuserait le modèle ou les cassettes.
 *
 * Ce test vit sur le REGISTRE et non sur un gabarit : la règle vaut pour tout
 * gabarit futur portant un `profilAttendu`. Aucun appel réseau.
 */
import { describe, expect, it } from 'vitest';
import { chargerConfigProfilage } from '../../core/scanner/config.js';
import { chargerConfig } from '../config.js';
import { gabarits } from './index.js';

const profilage = await chargerConfigProfilage();
const avecProfil = Object.values(gabarits).filter((gabarit) => gabarit.profilAttendu !== undefined);

describe('profilAttendu des gabarits du registre', () => {
  it('au moins un gabarit en déclare un : sinon les deux tests suivants ne garderaient rien', () => {
    expect(avecProfil.length).toBeGreaterThan(0);
  });

  it('chaque typeSite attendu appartient au vocabulaire de config/profilage.json', () => {
    const horsVocabulaire = avecProfil
      .map((gabarit) => [gabarit.nom, gabarit.profilAttendu?.typeSite] as const)
      .filter(([, typeSite]) => typeSite === undefined || !profilage.typesSite.includes(typeSite));
    expect(horsVocabulaire).toEqual([]);
  });

  it('aucun n’attend la valeur d’échappement : un attendu « autre » ne mesurerait plus de discernement', () => {
    const echappatoires = avecProfil
      .filter((gabarit) => gabarit.profilAttendu?.typeSite === profilage.valeurEchappement)
      .map((gabarit) => gabarit.nom);
    expect(echappatoires).toEqual([]);
  });

  /** Si la garde ne peut pas mentir, il faut que quelqu'un ait essayé de la faire mentir (METHODE §2). */
  it('la vérification DÉTECTE une valeur hors vocabulaire — la garde s’éprouve en la déclenchant', () => {
    expect(profilage.typesSite.includes('vitrine-de-cristal')).toBe(false);
    expect(profilage.typesSite.includes(profilage.valeurEchappement)).toBe(true);
  });
});

describe('paramètres des bugs : une seule table, indexée par identifiant', () => {
  // La config range les paramètres de bug par IDENTIFIANT, et un identifiant
  // peut servir à plusieurs gabarits (F01 : le même bouton mort ici et là).
  // Deux bugs de même identifiant partagent donc leurs paramètres — et si
  // leurs besoins divergent, l'un des deux ne démarre plus. C'est arrivé à la
  // clôture de P2-1 : le R01 d'un gabarit neuf a écrasé celui de
  // « formulaire-contact », et seul le banc complet, à son vingtième
  // scénario, l'a dit. Ce test le dit tout de suite.
  it('chaque bug de chaque gabarit accepte les paramètres que la config lui donne', async () => {
    const config = await chargerConfig();
    for (const gabarit of Object.values(gabarits)) {
      for (const bug of gabarit.bugs) {
        expect(() => bug.validerParametres?.(config.bugs[bug.id] ?? {}), `${gabarit.nom} / ${bug.id}`).not.toThrow();
      }
    }
  });

  it('la garde DÉTECTE une collision — elle s’éprouve en la déclenchant', async () => {
    const config = await chargerConfig();
    const bugsFautifs: Record<string, Record<string, unknown>> = { ...config.bugs, R01: { ...config.bugs['D01'] } };
    const refus = Object.values(gabarits).flatMap((gabarit) =>
      gabarit.bugs.filter((bug) => {
        try {
          bug.validerParametres?.(bugsFautifs[bug.id] ?? {});
          return false;
        } catch {
          return true;
        }
      }),
    );
    expect(refus.map((bug) => bug.id)).toContain('R01');
  });
});
