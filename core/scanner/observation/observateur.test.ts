import { describe, expect, it } from 'vitest';
import type { MutationLue } from '../exploration/en-page.js';
import { attendreStabilisation, creerObservateur, regrouperParInstant, type EtatFenetre, type Horloge } from './observateur.js';

/** Horloge simulée : `dormir` avance le temps, aucune attente réelle. */
function horlogeSimulee(): Horloge & { t: number } {
  const horloge = {
    t: 1_000_000,
    maintenant: () => horloge.t,
    dormir: async (ms: number) => {
      horloge.t += ms;
    },
  };
  return horloge;
}

function etatSimule(surcharges: Partial<EtatFenetre> = {}): EtatFenetre {
  return {
    requetesEnVol: () => 0,
    derniereActivite: () => 0,
    navigationEnCours: () => false,
    attendreChargement: async () => undefined,
    pageFermee: () => false,
    ...surcharges,
  };
}

const options = { stabilisationMs: 500, plafondMs: 8000, sondageMs: 50 };

describe('creerObservateur', () => {
  it('conserve les signaux dans l’ordre et rend une copie', () => {
    const observateur = creerObservateur();
    observateur.emettre({ type: 'erreur-js', horodatage: 'h', page: 'p', viewport: 'v', message: 'm' });
    const copie = observateur.signaux();
    copie.length = 0;
    expect(observateur.signaux()).toHaveLength(1);
  });
});

describe('regrouperParInstant', () => {
  it('fait un lot par horodatage ; la zone ne compte que les mutations hors bruit de fond', () => {
    const mutations: MutationLue[] = [
      { t: 10, enZone: true, fond: false },
      { t: 10, enZone: false, fond: true },
      // Bruit de fond DANS la zone (compteur animé) : ce n'est pas une réaction.
      { t: 20, enZone: true, fond: true },
      { t: 20, enZone: false, fond: false },
    ];
    expect(regrouperParInstant(mutations)).toEqual([
      { t: 10, nb: 2, nbZone: 1 },
      { t: 20, nb: 2, nbZone: 0 },
    ]);
  });
});

describe('attendreStabilisation', () => {
  it('attend au moins la durée de stabilisation après la dernière activité', async () => {
    const horloge = horlogeSimulee();
    const debut = horloge.t;
    const etat = etatSimule({ derniereActivite: () => debut });
    const attente = await attendreStabilisation(etat, options, async () => null, horloge);
    expect(attente).toBeGreaterThanOrEqual(500);
    expect(attente).toBeLessThan(500 + 2 * options.sondageMs);
  });

  it('attend tant qu’une requête est en vol, puis la stabilisation', async () => {
    const horloge = horlogeSimulee();
    const debut = horloge.t;
    let finRequete = debut + 1000;
    const etat = etatSimule({
      requetesEnVol: () => (horloge.t < finRequete ? 1 : 0),
      derniereActivite: () => (horloge.t < finRequete ? debut : finRequete),
    });
    const attente = await attendreStabilisation(etat, options, async () => null, horloge);
    expect(attente).toBeGreaterThanOrEqual(1500);
    finRequete = 0;
  });

  it('prend en compte la dernière mutation de la page', async () => {
    const horloge = horlogeSimulee();
    const debut = horloge.t;
    const derniereMutation = async (): Promise<number | null> => (horloge.t < debut + 700 ? horloge.t : debut + 700);
    const attente = await attendreStabilisation(etatSimule(), options, derniereMutation, horloge);
    expect(attente).toBeGreaterThanOrEqual(1200);
  });

  it('attend le chargement pendant une navigation', async () => {
    const horloge = horlogeSimulee();
    let charge = false;
    let activiteChargement = 0;
    const etat = etatSimule({
      navigationEnCours: () => !charge,
      derniereActivite: () => activiteChargement,
      attendreChargement: async () => {
        horloge.t += 300;
        charge = true;
        activiteChargement = horloge.t;
      },
    });
    const attente = await attendreStabilisation(etat, options, async () => null, horloge);
    expect(attente).toBeGreaterThanOrEqual(800);
  });

  it('s’arrête au plafond si la page ne se stabilise jamais', async () => {
    const horloge = horlogeSimulee();
    const etat = etatSimule({ requetesEnVol: () => 1, derniereActivite: () => horloge.t });
    const attente = await attendreStabilisation(etat, options, async () => null, horloge);
    expect(attente).toBeGreaterThanOrEqual(8000);
    expect(attente).toBeLessThan(8000 + options.sondageMs);
  });

  it('une page FERMÉE arrête la boucle aussitôt, sans attendre le plafond', async () => {
    const horloge = horlogeSimulee();
    const etat = etatSimule({ requetesEnVol: () => 1, derniereActivite: () => horloge.t, pageFermee: () => true });
    expect(await attendreStabilisation(etat, options, async () => null, horloge)).toBe(0);
  });

  it('une page fermée EN COURS de boucle interrompt l’attente au premier échec de lecture', async () => {
    const horloge = horlogeSimulee();
    let fermee = false;
    const etat = etatSimule({ requetesEnVol: () => 1, derniereActivite: () => horloge.t, pageFermee: () => fermee });
    const derniereMutation = async (): Promise<number | null> => {
      fermee = true;
      throw new Error('Target page, context or browser has been closed');
    };
    const attente = await attendreStabilisation(etat, options, derniereMutation, horloge);
    expect(attente).toBeLessThan(options.plafondMs);
  });

  it('n’évalue JAMAIS la page pendant une navigation du cadre principal (évaluation qui resterait pendante)', async () => {
    const horloge = horlogeSimulee();
    let appels = 0;
    const etat = etatSimule({ navigationEnCours: () => true, attendreChargement: async () => undefined });
    await attendreStabilisation(etat, options, async () => { appels += 1; return null; }, horloge);
    expect(appels).toBe(0);
  });

  it('traite une lecture de mutation impossible (contexte détruit) comme de l’activité, sans lever', async () => {
    const horloge = horlogeSimulee();
    let appels = 0;
    const derniereMutation = async (): Promise<number | null> => {
      appels += 1;
      if (appels === 1) {
        throw new Error('Execution context was destroyed');
      }
      return null;
    };
    const attente = await attendreStabilisation(etatSimule(), options, derniereMutation, horloge);
    expect(attente).toBeGreaterThanOrEqual(500);
  });
});
