import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chargerConfigProfilage, chargerConfigScanner } from '../scanner/config.js';
import { VERSION } from '../../prompts/profilage/v1.js';
import { empreinteContratProfilage } from './profilage.js';
import {
  COMMANDE_ENREGISTREMENT_IA,
  chargerConfigNavigation,
  DIVERGENCE_GLISSEMENT_ALIAS,
  DIVERGENCE_PROMPT_SANS_INCREMENT,
  RAISON_CASSETTE_ABSENTE,
  RAISON_CASSETTE_ILLISIBLE,
  RAISON_PROFIL_INVALIDE,
  cleCassette,
  clientRejouable,
  creerClientSansCapacite,
  depotCassettesFichiers,
  normaliserUrlPourCle,
  type Cassette,
  type ClientIaEnregistrable,
  type ContexteProfilage,
  type ReponseBrute,
  type ResultatIa,
} from './index.js';

const profilage = await chargerConfigProfilage();
const configScanner = await chargerConfigScanner();
/** Réglages de décision : requis par `clientRejouable`, sans effet sur le profilage. */
const DECISION = {
  modele: configScanner.ia.modeles.navigation,
  config: await chargerConfigNavigation(configScanner.exploration),
};
const MODELE = 'claude-haiku-4-5';
/**
 * Forme RÉSOLUE servie pour cet alias. Volontairement distincte de l'alias :
 * c'est le cas normal, et deux champs identiques ne distingueraient pas une
 * extraction d'une recopie (APPRENTISSAGES n°6).
 */
const MODELE_SERVI = 'claude-haiku-4-5-20251001';
/** Empreinte des réglages de config qui composent l'appel : elle entre dans la clé. */
const EMPREINTE = empreinteContratProfilage(profilage);

const contexte: ContexteProfilage = {
  url: 'https://exemple.invalid/',
  texte: 'Cabinet Martin — formulaire de contact.',
  langueDeclaree: 'fr',
};

const VALIDE = JSON.stringify({ typeSite: 'vitrine-contact', natureLibre: null, langue: 'fr', confiance: 0.9 });

const dossiers: string[] = [];
async function dossierNeuf(): Promise<string> {
  const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-cassettes-'));
  dossiers.push(dossier);
  return dossier;
}
afterAll(async () => {
  await Promise.all(dossiers.map((dossier) => rm(dossier, { recursive: true, force: true })));
});

function cassetteDe(cle: string, reponse: string, apresRelance = false, modeleServi = MODELE_SERVI): Cassette {
  return {
    cle,
    metadonnees: {
      date: '2026-09-23T00:00:00.000Z',
      modeleDemande: MODELE,
      modeleServi,
      versionPrompt: VERSION,
      coutApi: 0.0042,
      apresRelance,
    },
    reponse,
  };
}

/**
 * Client qui EXPLOSE si on l'appelle. C'est la façon d'éprouver la garde
 * réseau : une garde ne se relit pas, elle se déclenche.
 */
function clientQuiExplose(): ClientIaEnregistrable {
  const client = creerClientSansCapacite('doublure');
  return {
    ...client,
    profilerBrut: async (): Promise<ResultatIa<ReponseBrute>> => {
      throw new Error('le réseau a été touché depuis un run normal');
    },
  };
}

function clientQuiEnregistre(texte: string, apresRelance = false): ClientIaEnregistrable {
  const client = creerClientSansCapacite('doublure');
  return {
    ...client,
    mode: 'actif',
    raisonDegrade: null,
    profilerBrut: async (): Promise<ResultatIa<ReponseBrute>> => ({
      disponible: true,
      valeur: { texte, coutApi: 0.0042, apresRelance, modeleServi: MODELE_SERVI },
      coutApi: 0.0042,
    }),
  };
}

describe('cleCassette', () => {
  it('est stable pour une même entrée', () => {
    const parametres = { versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte };
    expect(cleCassette(parametres)).toBe(cleCassette({ ...parametres, contexte: { ...contexte } }));
  });

  it('change avec la version de prompt, avec le modèle et avec chaque champ du contexte', () => {
    const base = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte });
    expect(cleCassette({ versionPrompt: 'v2', empreinteContrat: EMPREINTE, modele: MODELE, contexte })).not.toBe(base);
    expect(cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: 'claude-opus-5', contexte })).not.toBe(base);
    expect(cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: { ...contexte, url: 'x' } })).not.toBe(base);
    expect(cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: { ...contexte, texte: 'x' } })).not.toBe(base);
    expect(
      cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: { ...contexte, langueDeclaree: null } }),
    ).not.toBe(base);
  });

  /**
   * La moitié du prompt vit en CONFIG : `typesSite` compose les instructions,
   * le contrat de sortie et le schéma envoyé au modèle. Sans cette sensibilité,
   * étendre le vocabulaire rejouerait une réponse produite sous un autre
   * contrat — la bonne réponse du mauvais prompt.
   */
  it('change avec les réglages de config qui composent l’appel', () => {
    const base = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte });
    const avecUnTypeDePlus = empreinteContratProfilage({ ...profilage, typesSite: [...profilage.typesSite, 'portfolio-artiste'] });
    const autreEchappement = empreinteContratProfilage({ ...profilage, valeurEchappement: 'inclassable' });
    const autreBudget = empreinteContratProfilage({ ...profilage, maxTokensReponse: profilage.maxTokensReponse + 1 });
    const autreContexteMax = empreinteContratProfilage({ ...profilage, contexteMaxChars: profilage.contexteMaxChars + 1 });
    for (const empreinte of [avecUnTypeDePlus, autreEchappement, autreBudget, autreContexteMax]) {
      expect(cleCassette({ versionPrompt: VERSION, empreinteContrat: empreinte, modele: MODELE, contexte })).not.toBe(base);
    }
  });

  /**
   * L'autre sens, tout aussi important : ces trois réglages n'entrent ni dans
   * le prompt ni dans l'appel. Les inclure périmerait TOUT le parc committé au
   * premier ajustement d'un facteur de confiance — on remplacerait un mensonge
   * silencieux par une invalidation gratuite.
   */
  it('ne change PAS avec les réglages qui ne composent pas l’appel', () => {
    expect(empreinteContratProfilage({ ...profilage, relancesMax: profilage.relancesMax + 1 })).toBe(EMPREINTE);
    expect(empreinteContratProfilage({ ...profilage, facteurConfianceApresRelance: 0.5 })).toBe(EMPREINTE);
    expect(empreinteContratProfilage({ ...profilage, varianceAppels: profilage.varianceAppels + 1 })).toBe(EMPREINTE);
    expect(empreinteContratProfilage({ ...profilage, enTeteMaxChars: profilage.enTeteMaxChars + 1 })).toBe(EMPREINTE);
  });

  it('ne confond pas deux contextes dont les champs se décalent', () => {
    const a = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: { url: 'ab', texte: 'c', langueDeclaree: 'fr' } });
    const b = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: { url: 'a', texte: 'bc', langueDeclaree: 'fr' } });
    expect(a).not.toBe(b);
  });
});

/** Le message du refus, ou un échec explicite si l'écriture a été acceptée. */
async function messageDuRefus(action: () => Promise<void>): Promise<string> {
  try {
    await action();
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message : String(erreur);
  }
  throw new Error('l’écriture divergente a été ACCEPTÉE : la garde ne garde rien');
}

describe('depotCassettesFichiers', () => {
  it('écrit puis relit une cassette', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const cassette = cassetteDe('abc', VALIDE);
    await depot.ecrire(cassette);
    await expect(depot.lire('abc')).resolves.toEqual(cassette);
  });

  it('rend null sur une cassette absente', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await expect(depot.lire('inconnue')).resolves.toBeNull();
  });

  it('réécrire la MÊME réponse ne touche pas le fichier committé', async () => {
    const dossier = await dossierNeuf();
    const depot = depotCassettesFichiers(dossier);
    await depot.ecrire(cassetteDe('abc', VALIDE));
    await depot.ecrire({ ...cassetteDe('abc', VALIDE), metadonnees: { ...cassetteDe('abc', VALIDE).metadonnees, date: '2030-01-01T00:00:00.000Z' } });
    const relue = await depot.lire('abc');
    expect(relue?.metadonnees.date).toBe('2026-09-23T00:00:00.000Z');
    expect(await readdir(dossier)).toEqual(['abc.json']);
  });

  /**
   * ÉPREUVE de la garde : une réponse DIFFÉRENTE sous une clé existante est
   * un échec bruyant, jamais un écrasement silencieux.
   *
   * Et elle doit nommer la BONNE cause : à modèle servi identique, c'est le
   * prompt qui a changé sans incrément de version.
   */
  it('REFUSE une réponse différente sous une clé existante, et accuse le prompt quand le modèle servi n’a pas bougé', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe('abc', VALIDE));
    const autre = JSON.stringify({ typeSite: 'boutique', natureLibre: null, langue: 'fr', confiance: 0.5 });
    const message = await messageDuRefus(() => depot.ecrire(cassetteDe('abc', autre)));
    expect(message).toContain('DIFFÉRENTE');
    expect(message).toContain(DIVERGENCE_PROMPT_SANS_INCREMENT);
    expect(message).not.toContain(DIVERGENCE_GLISSEMENT_ALIAS);
    expect((await depot.lire('abc'))?.reponse).toBe(VALIDE);
  });

  /**
   * L'AUTRE branche du diagnostic, et la raison d'être de la comparaison :
   * quand l'alias a glissé vers un autre instantané, accuser le versionnement
   * enverrait corriger ce qui fonctionne (APPRENTISSAGES n°6). Une garde qui
   * accuse le mauvais coupable est pire qu'une garde absente.
   */
  it('accuse le GLISSEMENT D’ALIAS quand le modèle servi a changé, pas le versionnement du prompt', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    await depot.ecrire(cassetteDe('abc', VALIDE));
    const autre = JSON.stringify({ typeSite: 'boutique', natureLibre: null, langue: 'fr', confiance: 0.5 });
    const demain = cassetteDe('abc', autre, false, 'claude-haiku-4-5-20260401');

    const message = await messageDuRefus(() => depot.ecrire(demain));
    expect(message).toContain(DIVERGENCE_GLISSEMENT_ALIAS);
    // La vraie cause est nommée — les deux modèles servis, dans l'ordre — et
    // la fausse est explicitement écartée.
    expect(message).toContain('claude-haiku-4-5-20251001');
    expect(message).toContain('claude-haiku-4-5-20260401');
    expect(message).not.toContain(DIVERGENCE_PROMPT_SANS_INCREMENT);
    expect((await depot.lire('abc'))?.reponse).toBe(VALIDE);
  });
});

/**
 * La clé doit survivre au PORT du serveur de scénario. Le banc démarre son
 * serveur sur le premier port libre : si le port entrait dans la clé, tout le
 * parc committé deviendrait introuvable sur un poste où ce port est occupé —
 * et le message d'erreur enverrait ré-enregistrer, c'est-à-dire accuserait le
 * mauvais coupable.
 */
describe('normaliserUrlPourCle', () => {
  it('retire le port et laisse le reste de l’URL intact', () => {
    expect(normaliserUrlPourCle('http://127.0.0.1:4800/')).toBe('http://127.0.0.1/');
    expect(normaliserUrlPourCle('http://127.0.0.1:4813/page?a=1')).toBe('http://127.0.0.1/page?a=1');
  });

  it('rend telle quelle une URL qu’elle ne sait pas analyser — on ne normalise que ce qu’on comprend', () => {
    expect(normaliserUrlPourCle('pas une url')).toBe('pas une url');
  });

  it('DEUX ports du même site donnent la MÊME clé de cassette', () => {
    const surUnPort = { ...contexte, url: 'http://127.0.0.1:4800/' };
    const surUnAutre = { ...contexte, url: 'http://127.0.0.1:4813/' };
    expect(cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: surUnPort })).toBe(
      cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: surUnAutre }),
    );
  });

  it('mais deux HÔTES restent deux sites : la clé diffère', () => {
    const ici = { ...contexte, url: 'http://127.0.0.1:4800/' };
    const ailleurs = { ...contexte, url: 'http://exemple.invalid:4800/' };
    expect(cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: ici })).not.toBe(
      cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte: ailleurs }),
    );
  });
});

describe('clientRejouable — mode normal', () => {
  const options = { enregistrement: false, modele: MODELE, profilage, decision: DECISION };

  it('cassette présente : rejouée, estampillée, SANS toucher le réseau', async () => {
    const dossier = await dossierNeuf();
    const depot = depotCassettesFichiers(dossier);
    const cle = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte });
    await depot.ecrire(cassetteDe(cle, VALIDE));

    const resultat = await clientRejouable(clientQuiExplose(), depot, options).profiler(contexte);
    expect(resultat.disponible).toBe(true);
    if (!resultat.disponible) return;
    expect(resultat.valeur).toMatchObject({
      typeSite: 'vitrine-contact',
      versionPrompt: VERSION,
      modeleDemande: MODELE,
      // Le modèle SERVI est rejoué depuis la cassette : un profil rejoué doit
      // nommer le modèle qui a réellement produit la réponse.
      modeleServi: MODELE_SERVI,
    });
    expect(resultat.coutApi).toBe(0.0042);
  });

  it('une cassette enregistrée APRÈS relance rejoue la confiance plafonnée', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const cle = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte });
    await depot.ecrire(cassetteDe(cle, VALIDE, true));
    const resultat = await clientRejouable(clientQuiExplose(), depot, options).profiler(contexte);
    expect(resultat.disponible).toBe(true);
    if (!resultat.disponible) return;
    expect(resultat.valeur.confiance).toBeCloseTo(0.9 * profilage.facteurConfianceApresRelance);
    expect(resultat.valeur.apresRelance).toBe(true);
  });

  it('cassette absente : indisponible, message nommant la commande, SANS réseau', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const journal: { type: string; details?: unknown }[] = [];
    const resultat = await clientRejouable(clientQuiExplose(), depot, {
      ...options,
      journaliser: (type, details) => journal.push({ type, details }),
    }).profiler(contexte);

    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ABSENTE });
    if (resultat.disponible) return;
    expect(resultat.message).toContain(COMMANDE_ENREGISTREMENT_IA);
    expect(journal).toContainEqual({
      type: 'ia.cassette.absente',
      details: { cle: cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte }), commande: COMMANDE_ENREGISTREMENT_IA },
    });
  });

  it('cassette corrompue : indisponible bruyant au journal, jamais une exception qui tue le scan', async () => {
    const dossier = await dossierNeuf();
    const cle = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte });
    await writeFile(path.join(dossier, `${cle}.json`), '{ ceci n’est pas du JSON', 'utf8');
    const resultat = await clientRejouable(clientQuiExplose(), depotCassettesFichiers(dossier), options).profiler(contexte);
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_CASSETTE_ILLISIBLE });
  });

  it('cassette dont la réponse ne valide plus le contrat : profil invalide, pas un profil faux', async () => {
    const depot = depotCassettesFichiers(await dossierNeuf());
    const cle = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte });
    await depot.ecrire(cassetteDe(cle, JSON.stringify({ typeSite: 'inconnu-du-vocabulaire' })));
    const resultat = await clientRejouable(clientQuiExplose(), depot, options).profiler(contexte);
    expect(resultat).toMatchObject({ disponible: false, raison: RAISON_PROFIL_INVALIDE });
  });
});

describe('clientRejouable — mode enregistrement', () => {
  it('appelle le client, écrit la cassette avec ses métadonnées et rend le profil', async () => {
    const dossier = await dossierNeuf();
    const depot = depotCassettesFichiers(dossier);
    const decore = clientRejouable(clientQuiEnregistre(VALIDE), depot, {
      enregistrement: true,
      modele: MODELE,
      profilage,
      decision: DECISION,
      maintenant: () => new Date('2026-09-23T12:00:00.000Z'),
    });

    const resultat = await decore.profiler(contexte);
    expect(resultat.disponible).toBe(true);

    const cle = cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte });
    const cassette = await depot.lire(cle);
    expect(cassette).toEqual({
      cle,
      metadonnees: {
        date: '2026-09-23T12:00:00.000Z',
        modeleDemande: MODELE,
        modeleServi: MODELE_SERVI,
        versionPrompt: VERSION,
        coutApi: 0.0042,
        apresRelance: false,
      },
      reponse: VALIDE,
    });
  });

  it('enregistre la réponse BRUTE, pas notre relecture : la cassette mesure le modèle', async () => {
    const dossier = await dossierNeuf();
    const depot = depotCassettesFichiers(dossier);
    const brut = `${VALIDE}`;
    await clientRejouable(clientQuiEnregistre(brut, true), depot, {
      enregistrement: true,
      modele: MODELE,
      profilage,
      decision: DECISION,
    }).profiler(contexte);
    const cassette = await depot.lire(cleCassette({ versionPrompt: VERSION, empreinteContrat: EMPREINTE, modele: MODELE, contexte }));
    expect(cassette?.reponse).toBe(brut);
    expect(cassette?.metadonnees.apresRelance).toBe(true);
  });
});
