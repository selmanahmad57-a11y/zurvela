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
import type { ContexteRedaction } from '../core/ia/index.js';
import { etatDeTest } from '../core/ia/aide-tests-decision.js';
import { contexteDeTest } from '../core/ia/aide-tests-diagnostic.js';
import { RAISON_BANC_REJEU_SEUL, RAISON_BANC_SANS_IA, creerClientIaBanc, tarifsConfigures } from './ia.js';

const CONTEXTE = { url: 'http://127.0.0.1:4800/', texte: 'contenu de page', langueDeclaree: 'fr' };

/** Contexte de rédaction minimal : le décorateur le rejoue désormais comme les trois autres. */
const CONTEXTE_REDACTION: ContexteRedaction = {
  langue: 'fr',
  enTete: ['type de site: vitrine-contact'],
  sections: [{ id: 's1', lignes: ['catégorie: fonctionnel', 'statut: confirmee', 'pages: /contact'] }],
};

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
    // Le mode annonce ce que le client PEUT SERVIR — ici le dépôt de
    // cassettes, pas le réseau —, et c'est lui que le moteur lit pour choisir
    // sa politique de navigation (brique 4b) : un run de rejeu doit pouvoir
    // mesurer la politique IA, sinon il mesurerait la déterministe sous
    // l'étiquette de l'autre. L'absence de moyen d'appeler, elle, se prouve
    // par les deux tests suivants : cassette manquante = indisponibilité
    // nommée, et jamais la moindre écriture.
    expect(client.mode).toBe('actif');
    expect(client.raisonDegrade).toBeNull();
    // LES QUATRE capacités passent désormais par le dépôt, rédaction comprise.
    // Avant la brique 5, `rediger` était un passe-plat vers le client décoré
    // et tombait donc sur « rejeu seul » : sans conséquence tant qu'aucun
    // client ne savait rédiger, et chemin d'appel RÉSEAU depuis un run de
    // notation le jour où l'un d'eux a su. C'est le trou que la brique 4c
    // avait trouvé sur `diagnostiquer`, au même endroit, à un nom près.
    await expect(client.rediger(CONTEXTE_REDACTION)).resolves.toMatchObject({
      disponible: false,
      raison: RAISON_CASSETTE_ABSENTE,
    });
  });

  it('AUCUNE capacité ne contourne plus le dépôt : « rejeu seul » n’est plus jamais rendu', async () => {
    // La garde d'unicité du chemin réseau, prise par l'autre bout. Le client
    // DÉCORÉ est sans capacité et sa raison est `banc-rejeu-seul` ; tant
    // qu'une capacité était un passe-plat, cette raison remontait jusqu'à
    // l'appelant — et c'était le signe visible d'un appel qui, le jour où le
    // client concret saurait faire, partirait sur le réseau depuis un run de
    // notation. Depuis la brique 5, les QUATRE passent par le dépôt : une
    // cassette manque, on le dit ; on ne tombe jamais sur le client décoré.
    //
    // Ce test échoue donc si une cinquième capacité est ajoutée en passe-plat,
    // ce qui est exactement ce qu'on veut qu'il attrape.
    const { client } = await creerClientIaBanc({ regime: 'rejeu', depot: depotVide });
    const resultats = await Promise.all([
      client.profiler(CONTEXTE),
      client.decider(etatDeTest()),
      client.diagnostiquer(contexteDeTest()),
      client.rediger(CONTEXTE_REDACTION),
    ]);
    for (const resultat of resultats) {
      expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
      expect(resultat).not.toMatchObject({ raison: RAISON_BANC_REJEU_SEUL });
    }
  });

  it('la rédaction ne peut pas contourner les cassettes : aucune écriture, aucun appel', async () => {
    // `depotVide` LÈVE à l'écriture : si le décorateur laissait passer un
    // enregistrement, ce test exploserait au lieu de rendre une
    // indisponibilité. C'est la garde qui peut échouer, pas la promesse qu'on
    // se fait.
    const journal: { type: string; details?: unknown }[] = [];
    const { client } = await creerClientIaBanc({
      regime: 'rejeu',
      depot: depotVide,
      journaliser: (type, details) => journal.push({ type, details }),
    });
    const resultat = await client.rediger(CONTEXTE_REDACTION);
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
    expect(journal.map((entree) => entree.type)).toContain('ia.cassette.absente');
    expect(journal.map((entree) => entree.type)).not.toContain('ia.cassette.enregistree');
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
