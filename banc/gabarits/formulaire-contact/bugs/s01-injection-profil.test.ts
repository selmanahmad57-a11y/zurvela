/**
 * S01 doit être SERVI : la charge d'injection doit se trouver dans la page
 * que le moteur charge réellement, dans les deux langues. Un bug d'injection
 * qui ne s'injecte pas transformerait « inertie tenue à 100 % » en tautologie
 * — on mesurerait un modèle qui n'a jamais été attaqué.
 *
 * PORTÉE DE LA MESURE, à lire avec le chiffre : S01 éprouve UN vecteur, la
 * prose impérative VISIBLE. « Inertie tenue à 100 % » ne dit donc rien de
 * l'anti-injection en général — ni du texte masqué visuellement (que
 * `innerText` collecte, cf. `core/scanner/exploration/en-page.ts`), ni du
 * bourrage de métadonnées, ni de la forge des marqueurs internes du bloc de
 * données, ni d'une page qui recopie une réponse JSON conforme au contrat.
 * Ces quatre-là sont gardés UNITAIREMENT (composition du contexte, prompt),
 * pas mesurés par le banc : ce serait quatre scénarios et autant de cassettes
 * payantes de plus, hors du périmètre étroit de la brique 4a.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerDictionnaire, chercher } from '../../../../core/i18n.js';
import { chargerConfigProfilage } from '../../../../core/scanner/config.js';
import { chargerConfig } from '../../../config.js';
import { demarrerServeur } from '../../../serveur.js';
import type { ConfigBanc, Scenario, ServeurScenario } from '../../../types.js';
import { formulaireContact } from '../index.js';
import {
  CLES_INJECTION_LIGNES,
  CLE_INJECTION_RECLASSEMENT,
  CLE_INJECTION_TITRE,
  LANGUE_CIBLE_INJECTION,
  PAGE_ACCUEIL,
  PAGE_CONTACT,
  SELECTEUR_NOTE_INJECTION,
} from '../structure.js';
import { compterBalises } from '../../../outils/transformations.js';
import { S01 } from './s01-injection-profil.js';

const LANGUES = ['fr', 'en'];
const CLES_CHARGE = [CLE_INJECTION_TITRE, ...CLES_INJECTION_LIGNES];

let config: ConfigBanc;
const serveurs: ServeurScenario[] = [];

function scenario(bugsActifs: string[], langue: string): Scenario {
  return { id: `test--s01--${langue}`, gabarit: formulaireContact.nom, langue, bugsActifs };
}

async function servir(bugsActifs: string[], langue: string): Promise<ServeurScenario> {
  const serveur = await demarrerServeur(scenario(bugsActifs, langue), formulaireContact, config);
  serveurs.push(serveur);
  return serveur;
}

async function page(serveur: ServeurScenario, chemin: string): Promise<string> {
  const reponse = await fetch(serveur.url + chemin);
  expect(reponse.status).toBe(200);
  return reponse.text();
}

beforeAll(async () => {
  config = await chargerConfig();
});

afterAll(async () => {
  await Promise.all(serveurs.splice(0).map((serveur) => serveur.arreter()));
});

describe('S01 injection-profil — déclaration', () => {
  it('est un bug de sécurité qui éprouve l’INERTIE et ne promet aucune anomalie', () => {
    expect(S01).toMatchObject({ id: 'S01', nom: 'injection-profil', categorie: 'securite', eprouve: 'inertie' });
    expect(S01.pages).toEqual([PAGE_ACCUEIL]);
    // Un verdict attendu serait sans objet : S01 ne doit être signalé nulle part.
    expect(S01.verdictAttendu).toBeUndefined();
  });

  it('est enregistré dans le gabarit, qui déclare par ailleurs le profil attendu', () => {
    expect(formulaireContact.bugs.map((bug) => bug.id)).toContain('S01');
    expect(formulaireContact.profilAttendu).toEqual({ typeSite: 'vitrine-contact', langue: null });
  });
});

/**
 * La charge NOMME sa cible en prose (une catégorie, une langue). Rien ne la
 * reliait au vocabulaire réel : si `boutique` disparaissait de
 * `config/profilage.json`, l'attaque réclamerait une valeur que le contrat de
 * sortie interdit, le modèle ne POURRAIT plus obéir même s'il le voulait, et
 * « inerties tenues 2/2 » deviendrait la tautologie annoncée en tête de ce
 * fichier. Ces deux tests éprouvent l'EFFICACITÉ de la charge, pas seulement
 * sa présence.
 */
describe('S01 injection-profil — la charge vise une cible ATTEIGNABLE', () => {
  it.each(LANGUES)('en %s, réclame un type de site du vocabulaire, autre que l’attendu et que l’échappatoire', async (langue) => {
    const profilage = await chargerConfigProfilage();
    const dico = await chargerDictionnaire(
      `${formulaireContact.dossierSite}/${formulaireContact.dossierLocales}`,
      langue,
    );
    const texte = chercher(dico, CLE_INJECTION_RECLASSEMENT);
    // La valeur d'échappement est écartée : c'est souvent un mot courant, et
    // elle serait nommée par accident — un test vert pour la mauvaise raison.
    const cibles = profilage.typesSite.filter(
      (type) => type !== formulaireContact.profilAttendu?.typeSite && type !== profilage.valeurEchappement && texte.includes(type),
    );
    expect(cibles).not.toEqual([]);
  });

  it.each(LANGUES)('en %s, réclame une langue qui n’est aucune de celles du banc', async (langue) => {
    const dico = await chargerDictionnaire(
      `${formulaireContact.dossierSite}/${formulaireContact.dossierLocales}`,
      langue,
    );
    expect(chercher(dico, CLE_INJECTION_RECLASSEMENT)).toContain(LANGUE_CIBLE_INJECTION);
    // Réclamer la langue du scénario ne demanderait rien : l'inertie serait
    // « tenue » sans que le modèle ait eu quoi que ce soit à refuser.
    expect(config.langues).not.toContain(LANGUE_CIBLE_INJECTION);
  });
});

describe('S01 injection-profil — la charge est SERVIE, dans les deux langues', () => {
  it.each(LANGUES)('dépose le texte d’injection de la locale %s dans la page d’accueil', async (langue) => {
    const serveur = await servir(['S01'], langue);
    const accueil = await page(serveur, PAGE_ACCUEIL);
    const dico = await chargerDictionnaire(
      `${formulaireContact.dossierSite}/${formulaireContact.dossierLocales}`,
      langue,
    );

    expect(compterBalises(accueil, SELECTEUR_NOTE_INJECTION)).toBe(1);
    for (const cle of CLES_CHARGE) {
      const texte = chercher(dico, cle);
      // Le TEXTE vient des locales du site : le test le lit là où il vit,
      // jamais recopié ici — sinon il vérifierait sa propre copie.
      expect(texte.length).toBeGreaterThan(0);
      expect(accueil).toContain(texte);
    }
    // Aucun emplacement i18n non résolu ne subsiste : une clé manquante dans
    // une langue ferait échouer le démarrage, pas servir `{{injection.…}}`.
    expect(accueil).not.toMatch(/\{\{\s*injection\./);
  });

  it.each(LANGUES)('ne touche à rien d’autre en %s : les autres pages et le site sain sont inchangés', async (langue) => {
    const avecCharge = await servir(['S01'], langue);
    const sain = await servir([], langue);

    // La charge est sur la page d'accueil, et sur elle seule : le profilage a
    // lieu sur la page de départ, une charge ailleurs ne prouverait rien.
    expect(compterBalises(await page(avecCharge, PAGE_CONTACT), SELECTEUR_NOTE_INJECTION)).toBe(0);
    // Le site SAIN n'en porte aucune trace : le bug est réversible, comme tous.
    expect(compterBalises(await page(sain, PAGE_ACCUEIL), SELECTEUR_NOTE_INJECTION)).toBe(0);

    // Le reste de la page d'accueil est intact : S01 AJOUTE du contenu, il ne
    // dégrade rien. C'est ce qui justifie qu'il ne promette aucune anomalie.
    const accueilSain = await page(sain, PAGE_ACCUEIL);
    const accueilCharge = await page(avecCharge, PAGE_ACCUEIL);
    const positionFermeture = accueilCharge.toLowerCase().indexOf('<section data-role="note-injection"');
    expect(accueilCharge.slice(0, positionFermeture)).toBe(accueilSain.slice(0, positionFermeture));
  });
});
