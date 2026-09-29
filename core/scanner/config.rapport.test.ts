/**
 * `config/rapport.json` — et la vérification que son schéma ne peut PAS faire.
 *
 * La liste des langues dont les formulations de statut ont été vérifiées vit
 * en CODE, parce qu'une formulation qui promet plus que son statut est un
 * mensonge au client et pas un réglage. Le schéma JSON ne peut donc rien en
 * dire : il vérifie « une chaîne d'au moins deux caractères », ce qui accepte
 * `xx` aussi bien que `fr`.
 *
 * C'est exactement la forme de l'apprentissage n°5 — « un schéma JSON qui dit
 * “c'est une chaîne” ne dit rien de la validité de la chaîne » — et la réponse
 * est la même : un test de forme dès la naissance de la valeur, au chargement,
 * sans le moindre appel réseau.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LANGUES_RAPPORT, estLangueRapport } from '../rapport/voix.js';
import { chargerConfigRapport } from './config.js';
import { symptomesLisibles } from '../rapport/faits.js';

const dossiers: string[] = [];
afterAll(async () => {
  await Promise.all(dossiers.map((dossier) => rm(dossier, { recursive: true, force: true })));
});

/** Écrit une config de rapport sur disque et rend son chemin. */
async function configSur(surcharges: Record<string, unknown>): Promise<string> {
  const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-config-rapport-'));
  dossiers.push(dossier);
  const fichier = path.join(dossier, 'rapport.json');
  await writeFile(
    fichier,
    JSON.stringify({
      langueRapport: 'fr',
      sectionsMax: 20,
      localisationsMaxParSection: 8,
      faitsMaxChars: 6000,
      cheminMaxChars: 120,
      symptomesMaxChars: 200,
      ligneMaxChars: 1400,
      maxTokensReponse: 8192,
      relancesMax: 1,
      appelMaxMs: 120000,
      dureeParSectionMs: 6000,
      ...surcharges,
    }),
    'utf8',
  );
  return fichier;
}

describe('chargerConfigRapport', () => {
  it('charge la configuration RÉELLE du dépôt, et sa langue est une langue vérifiée', async () => {
    const config = await chargerConfigRapport();
    expect(estLangueRapport(config.langueRapport)).toBe(true);
    expect(config.sectionsMax).toBeGreaterThan(0);
    expect(config.relancesMax).toBeGreaterThanOrEqual(0);
  });

  it('LÈVE sur une langue sans formulations vérifiées, en nommant celles qui existent', async () => {
    // Le modèle sait écrire l'allemand ; nous n'avons pas relu les
    // formulations de statut en allemand. Servir un statut français à un
    // lecteur allemand serait une promesse dont on ne connaît pas la teneur.
    await expect(chargerConfigRapport(await configSur({ langueRapport: 'de' }))).rejects.toThrow(
      LANGUES_RAPPORT.join(', '),
    );
  });

  it('la garde a du grain à moudre : le SCHÉMA, lui, accepte cette même langue', async () => {
    // Sans ce contre-cas, on ne saurait pas si la garde sert à quelque chose
    // ou si le schéma faisait déjà le travail. Il ne le fait pas : `de` est
    // une chaîne d'au moins deux caractères, et c'est tout ce qu'il exige.
    const fichier = await configSur({ langueRapport: 'de' });
    const erreur = await chargerConfigRapport(fichier).catch((cause: unknown) => cause);
    expect(String(erreur)).toContain('langueRapport');
    // Le message d'erreur du schéma parlerait de `minLength` ou de `type` ;
    // celui-ci parle de formulations vérifiées.
    expect(String(erreur)).toContain('formulations de statut vérifiées');
  });

  it('refuse toujours ce que le SCHÉMA refuse : la garde s’ajoute, elle ne remplace pas', async () => {
    await expect(chargerConfigRapport(await configSur({ sectionsMax: 0 }))).rejects.toThrow();
    await expect(chargerConfigRapport(await configSur({ relancesMax: -1 }))).rejects.toThrow();
  });
});

/**
 * LE PLAFOND D'UNE LIGNE DOIT TENIR LA PIRE LIGNE LÉGITIME.
 *
 * `ligneMaxChars` est un filet de sécurité contre un appelant indiscipliné, au
 * seuil de `core/ia`. S'il est trop bas, il tronque du contenu que la
 * configuration autorise pleinement — et la ligne des pages, qui peut porter
 * `localisationsMaxParSection` chemins entiers, est de loin la plus longue.
 * Emprunter une somme improvisée (`cheminMaxChars + symptomesMaxChars`) faisait
 * disparaître des pages où le défaut se manifeste, en silence.
 *
 * Ce test CALCULE la pire ligne que la configuration livrée autorise et échoue
 * si elle ne tient pas. Relever `localisationsMaxParSection` sans relever
 * `ligneMaxChars` devient donc un échec, pas une perte muette.
 */
describe('ligneMaxChars — confronté à la pire ligne que la config autorise', () => {
  it('tient la ligne des pages la plus longue possible', async () => {
    const config = await chargerConfigRapport();
    // `pages: ` + N × (chemin + ` (desktop, mobile)`) + (N−1) × ` | `
    const VIEWPORTS_MAX = ' (desktop, mobile)'.length;
    const pireLigne =
      'pages: '.length +
      config.localisationsMaxParSection * (config.cheminMaxChars + VIEWPORTS_MAX) +
      (config.localisationsMaxParSection - 1) * ' | '.length;
    expect(config.ligneMaxChars).toBeGreaterThanOrEqual(pireLigne);
  });

  it('tient aussi la ligne des symptômes la plus longue possible', async () => {
    // La pire ligne vaut le préfixe plus `symptomesMaxChars`, et cela n'est
    // vrai que parce que `symptomesDe` borne la LIGNE ENTIÈRE et pas seulement
    // chaque description. Rien ne borne le nombre de descriptions d'un groupe :
    // quand le plafond ne portait que sur chacune, la pire ligne valait
    // N × symptomesMaxChars et ce contrôle ne pouvait pas échouer pour la
    // configuration qu'il prétendait couvrir.
    const config = await chargerConfigRapport();
    expect(config.ligneMaxChars).toBeGreaterThanOrEqual('symptôme technique: '.length + config.symptomesMaxChars);
  });

  it('la ligne des symptômes tient son plafond même avec BEAUCOUP de descriptions', async () => {
    // Le contrôle qui rend le précédent honnête : il éprouve la fonction, pas
    // l'arithmétique du commentaire.
    const config = await chargerConfigRapport();
    const anomalie = {
      categorie: 'fonctionnel' as const,
      description: 'x'.repeat(config.symptomesMaxChars * 2),
      urlOuEtape: '/contact',
      graviteEstimee: 'bloquant' as const,
      confiance: 0.9,
      detecteur: 'D-TEST',
      groupe: 'g1',
    };
    const descriptions = Array.from({ length: 12 }, (_, rang) => `description-${rang} `.repeat(40));
    const ligne = symptomesLisibles(anomalie, descriptions, config.symptomesMaxChars);
    expect(ligne.length).toBeLessThanOrEqual(config.symptomesMaxChars);
  });

  it('la garde a du grain à moudre : elle échoue si le plafond descend sous la pire ligne', async () => {
    // Sans ce contre-cas, on ne saurait pas si la garde sert à quelque chose.
    const config = await chargerConfigRapport();
    const VIEWPORTS_MAX = ' (desktop, mobile)'.length;
    const pireLigne =
      'pages: '.length +
      config.localisationsMaxParSection * (config.cheminMaxChars + VIEWPORTS_MAX) +
      (config.localisationsMaxParSection - 1) * ' | '.length;
    expect(config.cheminMaxChars + config.symptomesMaxChars).toBeLessThan(pireLigne);
  });
});
