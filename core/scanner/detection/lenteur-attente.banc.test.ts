/**
 * Témoin du cahier de l'inversion de confiance de lenteur, sur le banc, avec
 * un VRAI navigateur contre le serveur du banc (garde C1).
 *
 * Le témoin est une VRAIE attente tronquée, jamais une valeur `attenteMs`
 * posée à la main (C1 ; n°48 — nommer ce que le gabarit fait au monde ; dette
 * n°26 — ne pas contrefaire un gabarit jusqu'au rouge). On le fabrique avec
 * R01 (api-lente), mais RETENUE AU-DELÀ de la fenêtre d'effet : la soumission
 * part, le serveur ne répond qu'après `delaiReponseMs` > fenêtre, donc à la
 * fermeture de la fenêtre la requête est encore EN VOL → signal
 * `requete-en-attente` dont l'attente est bornée par la fenêtre. Une
 * soumission ne re-navigue pas : la requête n'est pas avortée avant la
 * fermeture (contrairement à une sous-ressource de page), et elle ne reçoit
 * jamais sa réponse dans l'observation — seule la voie « en attente » existe.
 *
 * La fenêtre d'effet est élargie à 4000 ms (> seuil 3000) : une attente ≤ seuil
 * ne serait pas lente, et la démonstration n'aurait pas lieu.
 *
 * Trois états dans le temps (METHODE §10 étalé) : ROUGE sur le code non corrigé
 * (l'attente-sans-fin sort sous le palier haut, graduée par un artefact —
 * l'instant de départ dans la fenêtre), VERT après la voie A (confiance
 * dédiée), et une mutation le re-rougit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHEMIN_API_FORMULAIRE } from '../../../banc/gabarits/formulaire-contact/structure.js';
import { preparerBanc, signauxDe, type BancEssai } from '../exploration/aide-tests-banc.js';
import { creerDetecteurLenteur, DESCRIPTION_LENTE } from './d-lenteur.js';

const FENETRE_MS = 4000;
const SEUIL_MS = 3000; // config/scanner.json, detecteurs.lenteur.seuilMs
const DELAI_API_MS = 6000; // > fenêtre : la réponse n'arrive jamais dans l'observation

let banc: BancEssai;

beforeAll(async () => {
  banc = await preparerBanc({ attenteEffetMaxMs: FENETRE_MS });
}, 60_000);

afterAll(async () => {
  await banc?.fermer();
});

describe('inversion de confiance de lenteur : une requête en attente (témoin C1)', () => {
  it('le témoin produit une VRAIE attente tronquée par la fenêtre (garde C1)', async () => {
    const resultat = await banc.explorer(['R01'], { R01: { delaiReponseMs: DELAI_API_MS } });
    const attentes = signauxDe(resultat, 'requete-en-attente').filter((s) => new URL(s.urlRessource).pathname === CHEMIN_API_FORMULAIRE);
    expect(attentes.length, 'une requête au moins encore en vol à la fermeture').toBeGreaterThan(0);
    // Jamais reçue dans l'observation : AUCUN `reponse-reseau` ne vient masquer
    // l'attente par une durée complète (qui, elle, atteindrait les paliers).
    const recues = signauxDe(resultat, 'reponse-reseau').filter((s) => new URL(s.urlRessource).pathname === CHEMIN_API_FORMULAIRE);
    expect(recues, 'la réponse n’arrive jamais dans la fenêtre').toEqual([]);
    for (const a of attentes) {
      // Tronquée : l'attente mesurée est bornée par la fenêtre, loin sous le
      // vrai délai du serveur — c'est la mesure, pas une valeur posée.
      expect(a.attenteMs).toBeGreaterThan(SEUIL_MS);
      expect(a.attenteMs).toBeLessThan(DELAI_API_MS);
      expect(a.interne).toBe(true);
    }
  }, 40_000);

  it('une requête qui ne finit pas porte la confiance DÉDIÉE, pas un palier plafonné par la fenêtre', async () => {
    const resultat = await banc.explorer(['R01'], { R01: { delaiReponseMs: DELAI_API_MS } });
    const detecteur = creerDetecteurLenteur(banc.config.detecteurs.lenteur);
    const candidates = detecteur
      .detecter(resultat.signaux, { urlDepart: resultat.url, parcours: resultat.parcours, viewports: banc.config.viewports })
      .filter((c) => c.preuves.some((p) => 'urlRessource' in p && new URL(String(p.urlRessource)).pathname === CHEMIN_API_FORMULAIRE));
    expect(candidates.length, 'une candidate reponse-lente pour la requête retenue').toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.description).toBe(DESCRIPTION_LENTE);
      // LE CŒUR : la confiance ne doit PAS dépendre de l'attente plafonnée par
      // la fenêtre (ratio attente/seuil ≈ 1,34 → palier bas). Elle porte la
      // confiance dédiée. ROUGE sur le code non corrigé.
      expect(candidate.confiance).toBe(banc.config.detecteurs.lenteur.confianceEnAttente);
    }
  }, 40_000);
});
