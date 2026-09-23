/**
 * La GARDE RÉSEAU du banc. Un run de notation ne doit jamais appeler un
 * modèle : sinon l'instrument mesure l'humeur du jour, et deux exécutions du
 * même scénario ne sont plus comparables.
 *
 * Ces tests n'ouvrent aucune connexion — et c'est précisément ce qu'ils
 * vérifient : le dépôt de cassettes injecté ici lève si on lui demande
 * d'écrire, et le client décoré en mode rejeu n'a aucune capacité d'appel.
 */
import { describe, expect, it } from 'vitest';
import { COMMANDE_ENREGISTREMENT_IA, RAISON_CASSETTE_ABSENTE, type DepotCassettes } from '../core/ia/index.js';
import { chargerConfigScanner } from '../core/scanner/config.js';
import { RAISON_BANC_REJEU_SEUL, RAISON_BANC_SANS_IA, creerClientIaBanc, tarifsConfigures } from './ia.js';

const CONTEXTE = { url: 'http://127.0.0.1:4800/', texte: 'contenu de page', langueDeclaree: 'fr' };

/** Dépôt VIDE qui refuse d'écrire : toute tentative d'enregistrement échoue bruyamment dans un test. */
const depotVide: DepotCassettes = {
  lire: async () => null,
  ecrire: async () => {
    throw new Error('écriture de cassette interdite dans un run de notation');
  },
};

describe('creerClientIaBanc — régime rejeu (le défaut de `pnpm banc`)', () => {
  it('décore un client SANS CAPACITÉ : la garde réseau est une absence de moyen, pas une promesse', async () => {
    const { client } = await creerClientIaBanc({ regime: 'rejeu', depot: depotVide });
    expect(client.mode).toBe('degrade');
    expect(client.raisonDegrade).toBe(RAISON_BANC_REJEU_SEUL);
  });

  it('rend une indisponibilité CLAIRE quand la cassette manque, en nommant la commande à lancer', async () => {
    const journal: { type: string; details?: unknown }[] = [];
    const { client, modele } = await creerClientIaBanc({
      regime: 'rejeu',
      depot: depotVide,
      journaliser: (type, details) => journal.push({ type, details }),
    });

    const resultat = await client.profiler(CONTEXTE);

    expect(resultat.disponible).toBe(false);
    if (resultat.disponible) {
      return;
    }
    expect(resultat.raison).toBe(RAISON_CASSETTE_ABSENTE);
    // Le message porte le détail opérationnel : sans la commande, l'absence de
    // cassette est un mur ; avec elle, c'est une étape.
    expect(resultat.message).toContain(COMMANDE_ENREGISTREMENT_IA);
    expect(resultat.message).toContain(modele);
    expect(journal.map((entree) => entree.type)).toContain('ia.cassette.absente');
  });

  it('ne fait AUCUNE écriture : un run de notation ne produit pas de cassette', async () => {
    // `depotVide.ecrire` lève ; si le décorateur tentait d'enregistrer en mode
    // normal, l'appel rejetterait au lieu de rendre une indisponibilité.
    const { client } = await creerClientIaBanc({ regime: 'rejeu', depot: depotVide });
    await expect(client.profiler(CONTEXTE)).resolves.toMatchObject({ disponible: false });
  });
});

describe('creerClientIaBanc — régime sans-ia (`pnpm banc --sans-ia`)', () => {
  it('rend un client sans capacité, avec une raison technique stable, et sans jamais lever', async () => {
    const { client } = await creerClientIaBanc({ regime: 'sans-ia' });
    expect(client.mode).toBe('degrade');
    expect(client.raisonDegrade).toBe(RAISON_BANC_SANS_IA);
    // Mode dégradé : une indisponibilité, jamais une exception qui tuerait un
    // scan pour cause d'IA (constitution §4).
    await expect(client.profiler(CONTEXTE)).resolves.toMatchObject({ disponible: false, raison: RAISON_BANC_SANS_IA });
  });

  it('ne touche pas au dépôt de cassettes : `--sans-ia` ne rejoue rien non plus', async () => {
    let lectures = 0;
    const depotEspion: DepotCassettes = { lire: async () => ((lectures += 1), null), ecrire: async () => undefined };
    const { client } = await creerClientIaBanc({ regime: 'sans-ia', depot: depotEspion });
    await client.profiler(CONTEXTE);
    expect(lectures).toBe(0);
  });
});

describe('tarifsConfigures — la jumelle du coût doit pouvoir s’allumer', () => {
  it('donne un tarif NON NUL au modèle de profilage : sans lui, le banc afficherait un coût de zéro', async () => {
    const config = await chargerConfigScanner();
    const tarifs = tarifsConfigures(config.ia);
    const tarif = tarifs[config.ia.modeles.profilage];

    // Une configuration que rien n'exécute n'est pas vérifiée
    // (APPRENTISSAGES n°5) : ce test EXÉCUTE la valeur. Sans tarif, le client
    // concret part en mode dégradé « tarif absent » et la colonne coût du
    // banc reste vide — un zéro qui passerait pour une bonne nouvelle.
    expect(tarif).toBeDefined();
    expect(tarif?.entreeParMillion).toBeGreaterThan(0);
    expect(tarif?.sortieParMillion).toBeGreaterThan(0);
  });

  it('tarife TOUS les modèles déclarés, pas seulement celui du profilage', async () => {
    const config = await chargerConfigScanner();
    const tarifs = tarifsConfigures(config.ia);
    const sansTarif = Object.entries(config.ia.modeles).filter(([, identifiant]) => tarifs[identifiant] === undefined);
    // 4b et 4c appelleront les autres modèles : un tarif manquant se verrait
    // alors en production, pas ici.
    expect(sansTarif).toEqual([]);
  });
});
