import { beforeAll, describe, expect, it } from 'vitest';
import { chargerDictionnaire, traduire, type Dictionnaire } from '../../core/i18n.js';
import { scanner, scannerFactice } from '../../core/index.js';
import { chargerConfig } from '../config.js';
import { obtenirGabarit } from '../gabarits/index.js';
import { formulaireContact } from '../gabarits/formulaire-contact/index.js';
import { depuisRacine } from '../outils/racine.js';
import { POLITIQUE_DETERMINISTE, POLITIQUE_IA, sujetConstant, type ConfigBanc, type Scenario } from '../types.js';
import { executerBanc, lireOptions } from './index.js';
import { estNomSujet, NOMS_SUJETS, SUJETS } from './sujets.js';

let config: ConfigBanc;
let dico: Dictionnaire;

beforeAll(async () => {
  config = await chargerConfig();
  dico = await chargerDictionnaire(depuisRacine('locales'), config.langueConsole);
});

describe('registre des sujets', () => {
  it('expose le moteur réel et le scanner factice de core/index sous les noms reel et factice', () => {
    expect(SUJETS).toEqual({ reel: scanner, factice: scannerFactice });
    expect(NOMS_SUJETS).toEqual(['reel', 'factice']);
    expect(estNomSujet('reel')).toBe(true);
    expect(estNomSujet('factice')).toBe(true);
    expect(estNomSujet('inconnu')).toBe(false);
    expect(estNomSujet('')).toBe(false);
  });

  it('la config désigne un sujet par défaut connu du registre', () => {
    expect(estNomSujet(config.scan.sujetParDefaut)).toBe(true);
  });
});

describe('lireOptions', () => {
  it('accepte --sujet avec --scenario ou --tous, et le laisse absent sinon', () => {
    expect(lireOptions(['--sujet', 'factice', '--scenario', 'x'])).toEqual({ scenario: 'x', tous: false, sujet: 'factice', sansIa: false, assemblageProduction: false, politique: undefined });
    expect(lireOptions(['--tous', '--sujet', 'reel'])).toEqual({ scenario: undefined, tous: true, sujet: 'reel', sansIa: false, assemblageProduction: false, politique: undefined });
    expect(lireOptions(['--tous'])).toEqual({ scenario: undefined, tous: true, sujet: undefined, sansIa: false, assemblageProduction: false, politique: undefined });
  });

  it('accepte --sans-ia, qui est un drapeau et vaut faux par défaut', () => {
    expect(lireOptions(['--tous', '--sans-ia'])).toEqual({ scenario: undefined, tous: true, sujet: undefined, sansIa: true, assemblageProduction: false, politique: undefined });
    expect(lireOptions(['--scenario', 'x', '--sans-ia'])?.sansIa).toBe(true);
    // Le drapeau ne prend pas de valeur : `--sans-ia faux` est une ligne mal formée.
    expect(lireOptions(['--tous', '--sans-ia=faux'])).toBeNull();
  });

  it('accepte --politique et la laisse absente sinon : le défaut vient de la config du MOTEUR, pas du banc', () => {
    expect(lireOptions(['--tous', '--politique', POLITIQUE_IA])?.politique).toBe(POLITIQUE_IA);
    expect(lireOptions(['--tous', '--politique', POLITIQUE_DETERMINISTE])?.politique).toBe(POLITIQUE_DETERMINISTE);
    expect(lireOptions(['--tous'])?.politique).toBeUndefined();
    // La valeur est vérifiée plus tard (`estNomPolitique`) : `lireOptions` ne
    // fait que lire la ligne de commande.
    expect(lireOptions(['--politique'])).toBeNull();
  });

  it('rejette une ligne de commande mal formée', () => {
    expect(lireOptions(['--sujet'])).toBeNull();
    expect(lireOptions(['--inconnu'])).toBeNull();
  });
});

describe('sujet factice', () => {
  it('produit 0 % de détection et 0 faux positif sur de vrais scénarios : le banc lui-même n’a pas régressé', async () => {
    const scenarios: Scenario[] = [
      { id: 'test--f01-m01--fr', gabarit: formulaireContact.nom, langue: 'fr', bugsActifs: ['F01', 'M01'] },
      { id: 'test--sain--en', gabarit: formulaireContact.nom, langue: 'en', bugsActifs: [] },
    ];
    const lignes: string[] = [];

    const scorecard = await executerBanc({ scenarios, sujet: sujetConstant('factice', SUJETS.factice), politique: POLITIQUE_DETERMINISTE, config, dico, obtenirGabarit, iaDeclareeAbsente: true, sujetSansRapport: true, detectionLangue: null, journal: (ligne) => lignes.push(ligne) });

    expect(lignes[0]).toBe(traduire(dico, 'banc.demarrage', { nombre: 2, scanner: 'factice', politique: POLITIQUE_DETERMINISTE }));
    expect(scorecard.global).toMatchObject({
      nbScenarios: 2,
      nbErreurs: 0,
      nbAttendus: 2,
      nbDetectes: 0,
      nbSignalements: 0,
      nbFauxPositifs: 0,
      tauxDetection: 0,
      tauxFauxPositifs: null,
      coutApi: 0,
    });
  });
});
