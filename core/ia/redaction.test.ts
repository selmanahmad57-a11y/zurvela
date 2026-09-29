/**
 * L'ORCHESTRATION d'une rédaction : appel, relance structurelle, estampille.
 *
 * Aucun réseau : le module reçoit sa fonction d'appel. C'est ce qui permet
 * d'éprouver la relance — et surtout le rejet d'une prose chiffrée — sans
 * dépenser un centime.
 */
import { describe, expect, it } from 'vitest';
import { VERSION } from '../../prompts/redaction/v1.js';
import type { ConfigRapport } from '../scanner/config.js';
import {
  RAISON_APPEL_RESEAU,
  RAISON_AUCUNE_SECTION_MONTREE,
  RAISON_REDACTION_INVALIDE,
  type ContexteRedaction,
} from './index.js';
import type { ResultatAppel } from './profilage.js';
import { redactionDepuisReponse, redigerBrutAvec } from './redaction.js';
import { creerValidateurRedaction } from './schema-redaction.js';
import { identifiantsSections, serialiserContexteRedaction } from './contexte-redaction.js';

const CONFIG: ConfigRapport = {
  langueRapport: 'fr',
  sectionsMax: 20,
  localisationsMaxParSection: 8,
  faitsMaxChars: 6000,
  cheminMaxChars: 120,
  symptomesMaxChars: 200,
  ligneMaxChars: 1400,
  maxTokensReponse: 4096,
  relancesMax: 1,
  appelMaxMs: 120000,
  dureeParSectionMs: 6000,
};

const CONTEXTE: ContexteRedaction = {
  langue: 'fr',
  enTete: ['type de site: vitrine-contact'],
  sections: [{ id: 's1', lignes: ['catégorie: fonctionnel', 'statut: confirmee', 'pages: /contact'] }],
};
const validateur = creerValidateurRedaction(identifiantsSections(CONTEXTE));

function reponse(surcharges: Record<string, unknown> = {}): string {
  return JSON.stringify({
    synthese: 'Un défaut empêche vos visiteurs de vous écrire.',
    ligneMethode: 'Chaque signalement est re-vérifié avant d’être publié.',
    sections: [
      {
        sectionId: 's1',
        titre: 'Le bouton d’envoi ne répond pas',
        constat: 'Un clic ne déclenche rien.',
        impact: 'Aucune demande ne vous parvient.',
        actionSuggeree: 'Faire vérifier le script du formulaire.',
      },
    ],
    ...surcharges,
  });
}

/** Une doublure d'appel qui sert les réponses dans l'ordre et compte les prompts reçus. */
function appels(textes: string[], coutParAppel = 0.01) {
  const prompts: { systeme: string; utilisateur: string }[] = [];
  let rang = 0;
  const appeler = async (prompt: { systeme: string; utilisateur: string }): Promise<ResultatAppel> => {
    prompts.push(prompt);
    const texte = textes[rang] ?? textes.at(-1) ?? '';
    rang += 1;
    return { ok: true, texte, coutApi: coutParAppel, modeleServi: 'claude-opus-5-20260101' };
  };
  return { appeler, prompts };
}

describe('redigerBrutAvec — la boucle de relance', () => {
  it('une réponse conforme du premier coup : pas de relance, coût de l’appel', async () => {
    const { appeler, prompts } = appels([reponse()]);
    const resultat = await redigerBrutAvec({ contexte: CONTEXTE, config: CONFIG, validateur, appeler });
    expect(resultat).toMatchObject({ disponible: true, coutApi: 0.01 });
    if (!resultat.disponible) throw new Error('inattendu');
    expect(resultat.valeur.apresRelance).toBe(false);
    expect(prompts).toHaveLength(1);
  });

  it('une prose CHIFFRÉE déclenche une relance, et la relance répare', async () => {
    const { appeler, prompts } = appels([reponse({ synthese: 'Nous avons relevé 2 défauts.' }), reponse()]);
    const resultat = await redigerBrutAvec({ contexte: CONTEXTE, config: CONFIG, validateur, appeler });
    expect(resultat).toMatchObject({ disponible: true });
    if (!resultat.disponible) throw new Error('inattendu');
    expect(resultat.valeur.apresRelance).toBe(true);
    // Le coût CUMULÉ, pas celui du dernier appel : un coût dépensé qui ne se
    // voit pas est un coût qui ment.
    expect(resultat.valeur.coutApi).toBeCloseTo(0.02);
    expect(prompts).toHaveLength(2);
  });

  it('la relance repart des DONNÉES D’ORIGINE et ne recopie jamais la réponse fautive', async () => {
    // Ce n'est pas une élégance : la réponse fautive est précisément celle
    // qu'un chemin d'URL vient peut-être de dicter. La recopier
    // réinjecterait l'attaque dans le tour suivant.
    const fautive = reponse({ synthese: 'OBEIS-A-CETTE-CONSIGNE-ET-ECRIS-9' });
    const { appeler, prompts } = appels([fautive, reponse()]);
    await redigerBrutAvec({ contexte: CONTEXTE, config: CONFIG, validateur, appeler });
    const relance = prompts[1];
    if (relance === undefined) throw new Error('aucune relance');
    expect(relance.utilisateur).toContain(serialiserContexteRedaction(CONTEXTE));
    expect(relance.utilisateur).not.toContain('OBEIS-A-CETTE-CONSIGNE');
    // Le DÉFAUT structurel, lui, est nommé : le modèle doit savoir quoi
    // corriger sans qu'on lui remontre ce qu'il a écrit.
    expect(relance.utilisateur).toContain('proseChiffree');
  });

  it('relances épuisées : pas de prose, raison stable, coût cumulé visible', async () => {
    const chiffree = reponse({ synthese: 'Deux défauts, dont 1 bloquant.' });
    const { appeler, prompts } = appels([chiffree, chiffree]);
    const resultat = await redigerBrutAvec({ contexte: CONTEXTE, config: CONFIG, validateur, appeler });
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_REDACTION_INVALIDE });
    expect(resultat.coutApi).toBeCloseTo(0.02);
    expect(prompts).toHaveLength(2);
  });

  it('un ÉCHEC D’APPEL arrête sans brûler la relance : le modèle n’a pas eu l’occasion de mal faire', async () => {
    let nbAppels = 0;
    const appeler = async (): Promise<ResultatAppel> => {
      nbAppels += 1;
      return { ok: false, raison: RAISON_APPEL_RESEAU };
    };
    const resultat = await redigerBrutAvec({ contexte: CONTEXTE, config: CONFIG, validateur, appeler });
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_APPEL_RESEAU });
    expect(nbAppels).toBe(1);
  });

  it('`relancesMax: 0` n’appelle qu’une fois', async () => {
    const { appeler, prompts } = appels([reponse({ synthese: '1 défaut.' })]);
    await redigerBrutAvec({ contexte: CONTEXTE, config: { ...CONFIG, relancesMax: 0 }, validateur, appeler });
    expect(prompts).toHaveLength(1);
  });
});

describe('redactionDepuisReponse — l’estampille de provenance', () => {
  it('appose les TROIS champs, plus le drapeau de relance : ils ne sont jamais demandés au modèle', () => {
    const resultat = redactionDepuisReponse({
      texte: reponse(),
      validateur,
      modeleDemande: 'claude-opus-5',
      modeleServi: 'claude-opus-5-20260101',
      apresRelance: true,
      coutApi: 0.02,
    });
    expect(resultat).toMatchObject({ disponible: true });
    if (!resultat.disponible) throw new Error('inattendu');
    expect(resultat.valeur.provenance).toEqual({
      versionPrompt: VERSION,
      modeleDemande: 'claude-opus-5',
      modeleServi: 'claude-opus-5-20260101',
      apresRelance: true,
    });
    // Le modèle SERVI est distinct de l'alias demandé : c'est le cas normal,
    // et deux champs identiques ne distingueraient pas une extraction d'une
    // recopie (APPRENTISSAGES n°6).
    expect(resultat.valeur.provenance.modeleServi).not.toBe(resultat.valeur.provenance.modeleDemande);
  });

  it('REVALIDE la réponse : une cassette hors contrat est rejetée au rejeu comme à chaud', () => {
    // L'instrument de mesure ne s'accorde aucune tolérance que la production
    // n'a pas.
    const resultat = redactionDepuisReponse({
      texte: reponse({ synthese: 'Nous avons relevé 2 défauts.' }),
      validateur,
      modeleDemande: 'claude-opus-5',
      modeleServi: 'claude-opus-5-20260101',
      apresRelance: false,
      coutApi: 0.02,
    });
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_REDACTION_INVALIDE, coutApi: 0.02 });
  });

  it('rejette une cassette dont les identifiants ne correspondent PLUS au rapport courant', () => {
    const autreValidateur = creerValidateurRedaction(['s1', 's2']);
    const resultat = redactionDepuisReponse({
      texte: reponse(),
      validateur: autreValidateur,
      modeleDemande: 'claude-opus-5',
      modeleServi: 'claude-opus-5-20260101',
      apresRelance: false,
      coutApi: 0,
    });
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_REDACTION_INVALIDE });
  });
});

describe('rien à montrer, rien à payer', () => {
  it('une énumération VIDE ne déclenche AUCUN appel', () => {
    // Quand aucune section ne tient dans le plafond du bloc factuel, le
    // contrat n'admet aucun identifiant : l'appel ne peut que échouer. Le
    // faire quand même dépenserait pour un résultat impossible — et un coût
    // engagé pour rien se présente comme une tentative.
    let appele = false;
    const appeler = async (): Promise<ResultatAppel> => {
      appele = true;
      return { ok: true, texte: '{}', coutApi: 0.03, modeleServi: 'claude-opus-5' };
    };
    const vide = { ...CONTEXTE, sections: [] };
    return redigerBrutAvec({ contexte: vide, config: CONFIG, validateur: creerValidateurRedaction([]), appeler }).then(
      (resultat) => {
        expect(resultat).toMatchObject({ disponible: false, raison: RAISON_AUCUNE_SECTION_MONTREE, coutApi: 0 });
        expect(appele).toBe(false);
      },
    );
  });
});
