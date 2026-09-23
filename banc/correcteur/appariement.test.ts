import { describe, expect, it } from 'vitest';
import type {
  Anomalie,
  AnomalieCandidate,
  CandidateEcartee,
  Rapport,
  ResultatGroupe,
  VerdictConfirmation,
} from '../../core/types.js';
import type { AttenduBug, ComptesProtocole, Manifeste } from '../types.js';
import {
  ErreurRapportInexploitable,
  RAISON_ECARTEES_SANS_GROUPES,
  apparier,
  calculerComptesProtocole,
  comptesProtocoleZero,
  noterProfils,
  normaliserLocalisation,
  profilsNonMesures,
  statutSelonPertes,
  verifierRapportExploitable,
} from './appariement.js';

const URL_BASE = 'http://127.0.0.1:4800';
const VIEWPORT = { nom: 'bureau', largeur: 1280, hauteur: 800, mobile: false };

function anomalie(surcharges: Partial<Anomalie>): Anomalie {
  return { categorie: 'fonctionnel', description: '', urlOuEtape: '/contact', graviteEstimee: 'bloquant', confiance: 1, ...surcharges };
}

function rapport(anomalies: Anomalie[], ecartees?: CandidateEcartee[]): Rapport {
  return { url: URL_BASE, anomalies, coutApi: 0, dureeMs: 0, journal: [], ...(ecartees ? { ecartees } : {}) };
}

/** Candidate minimale : seules la catégorie et la localisation comptent pour l'appariement. */
function candidate(surcharges: Partial<Anomalie>): AnomalieCandidate {
  return {
    ...anomalie(surcharges),
    detecteur: 'd-test',
    reproduction: { url: `${URL_BASE}/contact`, viewport: VIEWPORT, actionsPrealables: [], action: null },
    preuves: [],
  };
}

/** Candidate écartée minimale : seuls la catégorie, la localisation et le verdict comptent pour l'appariement. */
function ecartee(surcharges: Partial<Anomalie>, verdict: CandidateEcartee['verdict'], raison = 'jamais-reproduite'): CandidateEcartee {
  return { candidate: candidate(surcharges), raison, ...(verdict === undefined ? {} : { verdict }) };
}

const manifeste: Manifeste = {
  scenarioId: 'formulaire-contact--f01-v01--fr',
  gabarit: 'formulaire-contact',
  langue: 'fr',
  attendus: [
    { nature: 'bug', bugId: 'F01', nom: 'bouton-mort', categorie: 'fonctionnel', pages: ['/contact'], gravite: 'bloquant', verdictAttendu: 'confirmee' },
    { nature: 'bug', bugId: 'V01', nom: 'image-cassee', categorie: 'visuel', pages: ['/', '/contact', '/confirmation'], gravite: 'mineur', verdictAttendu: 'confirmee' },
  ],
};

describe('normaliserLocalisation', () => {
  it('ramène une URL absolue à son chemin', () => {
    expect(normaliserLocalisation(`${URL_BASE}/contact`)).toBe('/contact');
    expect(normaliserLocalisation(`${URL_BASE}/contact?x=1#y`)).toBe('/contact');
    expect(normaliserLocalisation(URL_BASE)).toBe('/');
  });

  it('garde un chemin tel quel, sans slash final sauf pour la racine', () => {
    expect(normaliserLocalisation('/contact')).toBe('/contact');
    expect(normaliserLocalisation('/contact/')).toBe('/contact');
    expect(normaliserLocalisation(`${URL_BASE}/contact/`)).toBe('/contact');
    expect(normaliserLocalisation('/')).toBe('/');
    expect(normaliserLocalisation(`${URL_BASE}/`)).toBe('/');
  });

  it('garde un libellé d’étape tel quel', () => {
    expect(normaliserLocalisation('soumission du formulaire')).toBe('soumission du formulaire');
    expect(normaliserLocalisation('etape:envoi')).toBe('etape:envoi');
  });

  it('décode le chemin d’une URL absolue : les pages du manifeste sont déclarées en clair', () => {
    expect(normaliserLocalisation(`${URL_BASE}/%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B`)).toBe('/お問い合わせ');
    expect(normaliserLocalisation(`${URL_BASE}/お問い合わせ/`)).toBe('/お問い合わせ');
    expect(normaliserLocalisation('/お問い合わせ')).toBe('/お問い合わせ');
  });

  it('ne lève jamais : une pseudo-URL invalide est traitée comme un libellé d’étape', () => {
    for (const invalide of ['http://[', 'http://exa mple.com/contact', `${URL_BASE}/%E0%A4%A`]) {
      expect(normaliserLocalisation(invalide)).toBe(invalide);
    }
    // Un schéma seul : gardé comme libellé (le `/` final est retiré comme pour tout libellé), jamais levé.
    expect(() => normaliserLocalisation('http://')).not.toThrow();
    expect(normaliserLocalisation('http://')).not.toMatch(/^\//);
  });
});

describe('apparier', () => {
  it('détecte un attendu par catégorie + localisation, en URL absolue comme en chemin', () => {
    const { attendus, fauxPositifs } = apparier(
      rapport([
        anomalie({ categorie: 'fonctionnel', urlOuEtape: `${URL_BASE}/contact` }),
        anomalie({ categorie: 'visuel', urlOuEtape: '/confirmation/' }),
      ]),
      manifeste,
    );
    expect(attendus.map((resultat) => resultat.verdict)).toEqual(['detecte', 'detecte']);
    expect(attendus[0]?.anomaliesAppariees).toHaveLength(1);
    expect(attendus[1]?.anomaliesAppariees).toHaveLength(1);
    expect(fauxPositifs).toEqual([]);
  });

  it('marque raté tout attendu sans anomalie appariée', () => {
    const { attendus, fauxPositifs } = apparier(rapport([]), manifeste);
    expect(attendus.map((resultat) => resultat.verdict)).toEqual(['rate', 'rate']);
    expect(attendus.every((resultat) => resultat.anomaliesAppariees.length === 0)).toBe(true);
    expect(fauxPositifs).toEqual([]);
  });

  it('compte les doublons comme appariés au même attendu, jamais comme faux positifs', () => {
    const { attendus, fauxPositifs } = apparier(
      rapport([
        anomalie({ categorie: 'fonctionnel', urlOuEtape: '/contact' }),
        anomalie({ categorie: 'fonctionnel', urlOuEtape: `${URL_BASE}/contact/`, description: 'autre formulation' }),
        anomalie({ categorie: 'fonctionnel', urlOuEtape: '/contact', graviteEstimee: 'mineur', confiance: 0.2 }),
      ]),
      manifeste,
    );
    expect(attendus[0]?.verdict).toBe('detecte');
    expect(attendus[0]?.anomaliesAppariees).toHaveLength(3);
    expect(fauxPositifs).toEqual([]);
  });

  it('classe en faux positif une anomalie de catégorie différente sur une page attendue', () => {
    const intruse = anomalie({ categorie: 'performance', urlOuEtape: '/contact' });
    const { attendus, fauxPositifs } = apparier(rapport([intruse]), manifeste);
    expect(attendus[0]?.verdict).toBe('rate');
    expect(fauxPositifs).toEqual([intruse]);
  });

  it('classe en faux positif une anomalie de bonne catégorie sur une page non attendue', () => {
    const intruse = anomalie({ categorie: 'fonctionnel', urlOuEtape: '/' });
    const { attendus, fauxPositifs } = apparier(rapport([intruse]), manifeste);
    expect(attendus[0]?.verdict).toBe('rate');
    expect(fauxPositifs).toEqual([intruse]);
  });

  it('ignore totalement la description et la gravité : seule la structure apparie', () => {
    const { attendus, fauxPositifs } = apparier(
      rapport([
        // Description qui « parle » du bon bug mais au mauvais endroit : faux positif.
        anomalie({ categorie: 'fonctionnel', urlOuEtape: '/confirmation', description: 'bouton-mort F01 sur /contact' }),
        // Description vide, gravité différente de l’attendu, au bon endroit : détecté.
        anomalie({ categorie: 'visuel', urlOuEtape: '/', description: '', graviteEstimee: 'bloquant' }),
      ]),
      manifeste,
    );
    expect(attendus.map((resultat) => resultat.verdict)).toEqual(['rate', 'detecte']);
    expect(fauxPositifs).toHaveLength(1);
    expect(fauxPositifs[0]?.urlOuEtape).toBe('/confirmation');
  });

  it('apparie chaque anomalie à au plus un attendu : le premier qui correspond', () => {
    const doublon: Manifeste = {
      ...manifeste,
      attendus: [
        { nature: 'bug', bugId: 'F01', nom: 'bouton-mort', categorie: 'fonctionnel', pages: ['/contact'], gravite: 'bloquant', verdictAttendu: 'confirmee' },
        { nature: 'bug', bugId: 'F02', nom: 'echec-silencieux', categorie: 'fonctionnel', pages: ['/contact'], gravite: 'bloquant', verdictAttendu: 'confirmee' },
      ],
    };
    const { attendus, fauxPositifs } = apparier(rapport([anomalie({ urlOuEtape: '/contact' })]), doublon);
    expect(attendus.map((resultat) => resultat.verdict)).toEqual(['detecte', 'rate']);
    expect(fauxPositifs).toEqual([]);
  });

  it('compte en faux positif une anomalie dont la localisation est une pseudo-URL invalide, sans interrompre l’appariement', () => {
    const invalide = anomalie({ categorie: 'fonctionnel', urlOuEtape: 'http://' });
    const { attendus, fauxPositifs } = apparier(rapport([invalide, anomalie({ urlOuEtape: '/contact' })]), manifeste);
    expect(attendus[0]?.verdict).toBe('detecte');
    expect(fauxPositifs).toEqual([invalide]);
  });

  it('conserve l’ordre des attendus du manifeste et retourne un résultat par attendu', () => {
    const { attendus } = apparier(rapport([]), manifeste);
    expect(attendus.map((resultat) => resultat.attendu.bugId)).toEqual(['F01', 'V01']);
  });
});

describe('apparier — verdicts de confirmation', () => {
  /** T01/L01 : le manifeste attend que le protocole ÉCARTE l'anomalie. */
  const T01_ECARTE: AttenduBug = {
    nature: 'bug',
    bugId: 'T01',
    nom: 'echec-transitoire',
    categorie: 'fonctionnel',
    pages: ['/contact'],
    gravite: 'bloquant',
    verdictAttendu: 'non-reproduite',
  };
  const manifesteEcarte: Manifeste = { ...manifeste, attendus: [T01_ECARTE] };

  it('détecte un attendu apparié parmi les écartées : détecter puis écarter à raison est une réussite', () => {
    const { attendus, fauxPositifs } = apparier(
      rapport([], [ecartee({ categorie: 'fonctionnel', urlOuEtape: `${URL_BASE}/contact` }, 'non-reproduite')]),
      manifesteEcarte,
    );
    expect(attendus[0]).toMatchObject({ verdict: 'detecte', verdictRendu: 'non-reproduite', bienJuge: true });
    // L'écartée n'est pas un signalement : elle ne rejoint pas les anomalies appariées.
    expect(attendus[0]?.anomaliesAppariees).toEqual([]);
    expect(fauxPositifs).toEqual([]);
  });

  it('détecté mais mal jugé : le verdict rendu n’est pas celui du manifeste', () => {
    const retenue = anomalie({ categorie: 'fonctionnel', urlOuEtape: '/contact', verdict: 'confirmee' });
    const { attendus } = apparier(rapport([retenue]), manifesteEcarte);
    expect(attendus[0]).toMatchObject({ verdict: 'detecte', verdictRendu: 'confirmee', bienJuge: false });
    expect(attendus[0]?.anomaliesAppariees).toEqual([retenue]);
  });

  it('raté : ni retenue ni écartée, verdict rendu null et mal jugé', () => {
    const { attendus } = apparier(rapport([], [ecartee({ categorie: 'visuel', urlOuEtape: '/' }, 'non-reproduite')]), manifesteEcarte);
    expect(attendus[0]).toMatchObject({ verdict: 'rate', verdictRendu: null, bienJuge: false });
  });

  it('ne compte JAMAIS une candidate écartée en faux positif, même sans attendu correspondant', () => {
    const { attendus, fauxPositifs } = apparier(
      rapport(
        [],
        [
          ecartee({ categorie: 'seo', urlOuEtape: '/' }, 'non-reproduite'),
          ecartee({ categorie: 'performance', urlOuEtape: '/confirmation' }, 'limite-automatisation', 'rejeu-impossible'),
        ],
      ),
      manifesteEcarte,
    );
    expect(fauxPositifs).toEqual([]);
    expect(attendus[0]?.verdict).toBe('rate');
  });

  it('compte en faux positif une anomalie RETENUE sans attendu, écartées présentes ou non', () => {
    const intruse = anomalie({ categorie: 'seo', urlOuEtape: '/', verdict: 'confirmee' });
    const { fauxPositifs } = apparier(rapport([intruse], [ecartee({ categorie: 'seo', urlOuEtape: '/' }, 'non-reproduite')]), manifesteEcarte);
    expect(fauxPositifs).toEqual([intruse]);
  });

  it('privilégie le verdict de la retenue sur celui de l’écartée quand les deux apparient', () => {
    const { attendus } = apparier(
      rapport(
        [anomalie({ categorie: 'fonctionnel', urlOuEtape: '/contact', verdict: 'intermittente' })],
        [ecartee({ categorie: 'fonctionnel', urlOuEtape: '/contact' }, 'non-reproduite')],
      ),
      { ...manifesteEcarte, attendus: [{ ...T01_ECARTE, bugId: 'I01', verdictAttendu: 'intermittente' }] },
    );
    expect(attendus[0]).toMatchObject({ verdict: 'detecte', verdictRendu: 'intermittente', bienJuge: true });
  });

  it('rend verdictRendu null quand le protocole n’a rendu aucun verdict (passe-plat)', () => {
    const { attendus } = apparier(rapport([anomalie({ categorie: 'fonctionnel', urlOuEtape: '/contact' })]), manifeste);
    expect(attendus[0]).toMatchObject({ verdict: 'detecte', verdictRendu: null, bienJuge: false });
  });

  it('n’apparie chaque attendu qu’à une seule écartée, et respecte l’ordre du manifeste', () => {
    const { attendus } = apparier(
      rapport(
        [],
        [
          ecartee({ categorie: 'fonctionnel', urlOuEtape: '/contact' }, 'non-reproduite'),
          ecartee({ categorie: 'fonctionnel', urlOuEtape: '/contact' }, 'limite-automatisation', 'rejeu-impossible'),
          ecartee({ categorie: 'visuel', urlOuEtape: '/confirmation' }, 'basse-confiance', 'sous-seuil-retenue'),
        ],
      ),
      manifeste,
    );
    expect(attendus.map((resultat) => [resultat.attendu.bugId, resultat.verdict, resultat.verdictRendu])).toEqual([
      ['F01', 'detecte', 'non-reproduite'],
      ['V01', 'detecte', 'basse-confiance'],
    ]);
    expect(attendus.every((resultat) => resultat.bienJuge === false)).toBe(true);
  });
});

describe('calculerComptesProtocole', () => {
  /** Résultat de groupe minimal : seuls le verdict et les membres comptent pour la mesure. */
  function resultatGroupe(verdict: VerdictConfirmation, membres: Partial<Anomalie>[], cle = ''): ResultatGroupe {
    const candidates = membres.map(candidate);
    const representant = candidates[0]!;
    return {
      groupe: {
        cle: cle || `d-test|${verdict}|${membres.map((membre) => membre.urlOuEtape ?? '').join(',')}`,
        representant,
        membres: candidates,
        localisations: candidates.map((membre) => ({ urlOuEtape: membre.urlOuEtape })),
        observations: [{ viewport: VIEWPORT.nom }],
        confiance: 1,
        descriptions: [],
      },
      verdict,
      motif: 'motif-de-test',
      tentatives: [],
      tauxReproduction: null,
      confianceInitiale: 1,
      confianceFinale: 1,
      coutApi: 0,
    };
  }

  function rapportProtocole(groupes: ResultatGroupe[], nbCandidates = 0, anomalies: Anomalie[] = []): Rapport {
    return {
      ...rapport(anomalies),
      candidates: Array.from({ length: nbCandidates }, () => candidate({})),
      groupes,
    };
  }

  /**
   * Les deux mesures se lisent ENSEMBLE, comme dans `noterScenario` : les
   * comptes du protocole sont dérivés de l'appariement du même rapport.
   */
  function comptesDe(rapportMesure: Rapport, manifesteMesure: Manifeste): ComptesProtocole {
    return calculerComptesProtocole(rapportMesure, manifesteMesure, apparier(rapportMesure, manifesteMesure).attendus);
  }

  /** T01 : le manifeste attend que le protocole écarte ce bug — c'est le faux positif simulé. */
  const T01: AttenduBug = {
    nature: 'bug',
    bugId: 'T01',
    nom: 'echec-transitoire',
    categorie: 'fonctionnel',
    pages: ['/contact'],
    gravite: 'bloquant',
    verdictAttendu: 'non-reproduite',
  };
  const manifesteT01: Manifeste = { ...manifeste, attendus: [T01] };
  /** T01 (à écarter) et V01 (à retenir) : deux camps opposés, deux catégories distinctes. */
  const manifesteMixte: Manifeste = { ...manifeste, attendus: [T01, manifeste.attendus[1]!] };

  it('compte les candidates, les groupes retenus et les groupes écartés, et n’écarte rien quand tous les verdicts sont retenus', () => {
    const comptes = comptesDe(
      rapportProtocole([resultatGroupe('confirmee', [{ urlOuEtape: '/contact' }]), resultatGroupe('intermittente', [{ urlOuEtape: '/contact' }])], 6),
      manifeste,
    );
    expect(comptes).toEqual({
      nbCandidates: 6,
      nbGroupes: 2,
      nbGroupesRetenus: 2,
      nbGroupesEcartes: 0,
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 0,
      nbEcartesNonApparies: 0,
    });
  });

  it('écarté + attendu non retenu → fausse alerte ÉVITÉE (T01 : le protocole a raison de se taire)', () => {
    const comptes = comptesDe(rapportProtocole([resultatGroupe('non-reproduite', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }])], 1), manifesteT01);
    expect(comptes).toMatchObject({ nbGroupesEcartes: 1, nbFaussesAlertesEvitees: 1, nbPertesProtocole: 0, nbEcartesNonApparies: 0 });
  });

  it('écarté + attendu RETENU → anomalie PERDUE, jamais comptée en réussite', () => {
    // F01 doit être confirmée : l'écarter est une perte, pas une fausse alerte évitée.
    const comptes = comptesDe(rapportProtocole([resultatGroupe('non-reproduite', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }])], 1), manifeste);
    expect(comptes).toMatchObject({ nbGroupesEcartes: 1, nbFaussesAlertesEvitees: 0, nbPertesProtocole: 1, nbEcartesNonApparies: 0 });
  });

  it('classe aussi `basse-confiance` en écarté : tout verdict hors VERDICTS_RETENUS tait une alerte', () => {
    const comptes = comptesDe(rapportProtocole([resultatGroupe('basse-confiance', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }])], 1), manifesteT01);
    expect(comptes).toMatchObject({ nbGroupesEcartes: 1, nbFaussesAlertesEvitees: 1 });
  });

  it('apparie un groupe consolidé par N’IMPORTE LEQUEL de ses membres, pas par son seul représentant', () => {
    // Représentant sur une page hors manifeste (V01 ne déclare pas /mentions),
    // membre sur une page attendue : le groupe correspond bien à V01, à retenir.
    const groupe = resultatGroupe('non-reproduite', [
      { categorie: 'visuel', urlOuEtape: '/mentions' },
      { categorie: 'visuel', urlOuEtape: `${URL_BASE}/confirmation/` },
    ]);
    expect(comptesDe(rapportProtocole([groupe], 2), manifeste)).toMatchObject({
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 1,
      nbEcartesNonApparies: 0,
    });
    // Le même groupe réduit à son représentant ne correspond à aucun attendu :
    // il n'est ni crédité, ni imputé — il va dans sa propre colonne.
    const seulRepresentant = resultatGroupe('non-reproduite', [{ categorie: 'visuel', urlOuEtape: '/mentions' }]);
    expect(comptesDe(rapportProtocole([seulRepresentant], 1), manifeste)).toMatchObject({
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 0,
      nbEcartesNonApparies: 1,
    });
  });

  it('additionne évitées, perdues et non appariés sur un rapport mêlant les trois', () => {
    const comptes = comptesDe(
      rapportProtocole(
        [
          resultatGroupe('confirmee', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }]),
          resultatGroupe('non-reproduite', [{ categorie: 'seo', urlOuEtape: '/' }]),
          resultatGroupe('non-reproduite', [{ categorie: 'visuel', urlOuEtape: '/' }]),
          resultatGroupe('limite-automatisation', [{ categorie: 'performance', urlOuEtape: '/contact' }]),
        ],
        9,
      ),
      manifeste,
    );
    // seo et performance n'apparient aucun attendu ; visuel apparie V01, à retenir.
    expect(comptes).toEqual({
      nbCandidates: 9,
      nbGroupes: 4,
      nbGroupesRetenus: 1,
      nbGroupesEcartes: 3,
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 1,
      nbEcartesNonApparies: 2,
    });
  });

  it('rend des zéros pour un sujet sans protocole : aucune valeur undefined', () => {
    expect(comptesDe(rapport([anomalie({})]), manifeste)).toEqual(comptesProtocoleZero());
    expect(Object.values(comptesProtocoleZero()).every((valeur) => valeur === 0)).toBe(true);
  });

  it('rend des comptes indépendants à chaque appel : comptesProtocoleZero n’est pas un objet partagé', () => {
    const premier = comptesProtocoleZero();
    premier.nbCandidates = 7;
    expect(comptesProtocoleZero().nbCandidates).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Défauts prouvés en conditions réelles : chaque test échoue sur le code d'avant.
  // -------------------------------------------------------------------------

  it('D1 — refuse de noter un rapport qui porte des écartées SANS groupes : le protocole est tombé', () => {
    const tombe: Rapport = rapport([], [ecartee({ categorie: 'fonctionnel', urlOuEtape: '/contact' }, undefined, 'confirmation-en-erreur')]);
    expect(() => verifierRapportExploitable(tombe)).toThrow(ErreurRapportInexploitable);
    expect(() => verifierRapportExploitable(tombe)).toThrow(RAISON_ECARTEES_SANS_GROUPES);
    expect(() => comptesDe(tombe, manifeste)).toThrow(RAISON_ECARTEES_SANS_GROUPES);
    // Lu sans l'invariant, ce rapport affichait « détecté » sur toute la ligne
    // et des comptes de protocole tout à zéro : 100 % de détection, 0 perte.
    expect(apparier(tombe, manifeste).attendus[0]?.verdict).toBe('detecte');
  });

  it('D1 — n’alarme PAS le passe-plat (écartées vides) ni le scanner factice (ni écartées ni groupes)', () => {
    const passePlat: Rapport = { ...rapport([anomalie({ urlOuEtape: '/contact' })]), candidates: [candidate({})], ecartees: [] };
    expect(() => verifierRapportExploitable(passePlat)).not.toThrow();
    expect(comptesDe(passePlat, manifeste)).toMatchObject({ nbCandidates: 1, nbGroupes: 0, nbGroupesEcartes: 0 });
    const factice: Rapport = rapport([]);
    expect(() => verifierRapportExploitable(factice)).not.toThrow();
    expect(comptesDe(factice, manifeste)).toEqual(comptesProtocoleZero());
  });

  it('D2 — un groupe écarté qui n’apparie AUCUN attendu n’est pas une fausse alerte évitée', () => {
    // Bruit légitime ou vrai bug que l'appariement structurel n'a pas su
    // rattacher : le banc ne sait pas, donc il ne crédite pas.
    const comptes = comptesDe(
      rapportProtocole(
        [
          resultatGroupe('limite-automatisation', [{ categorie: 'seo', urlOuEtape: '/mentions' }]),
          // Localisation en libellé d'étape : le cas le plus fréquent en réel.
          resultatGroupe('non-reproduite', [{ categorie: 'fonctionnel', urlOuEtape: 'soumission du formulaire' }]),
          // Groupe à membres vide : rien à apparier du tout.
          resultatGroupe('non-reproduite', []),
        ],
        3,
      ),
      manifesteT01,
    );
    expect(comptes).toMatchObject({ nbGroupesEcartes: 3, nbFaussesAlertesEvitees: 0, nbPertesProtocole: 0, nbEcartesNonApparies: 3 });
  });

  it('D3 — l’ordre des membres d’un groupe ne change plus le verdict : la règle est PESSIMISTE', () => {
    // Un seul groupe écarté dont un membre apparie T01 (à écarter) et l'autre
    // V01 (à retenir). Avant : le PREMIER membre décidait — « évitée » dans un
    // ordre, « perdue » dans l'autre, pour le même fait physique.
    const membreT01 = { categorie: 'fonctionnel' as const, urlOuEtape: '/contact' };
    const membreV01 = { categorie: 'visuel' as const, urlOuEtape: '/confirmation' };
    const attendu = { nbGroupesEcartes: 1, nbFaussesAlertesEvitees: 0, nbPertesProtocole: 1, nbEcartesNonApparies: 0 };
    expect(comptesDe(rapportProtocole([resultatGroupe('non-reproduite', [membreT01, membreV01])], 2), manifesteMixte)).toMatchObject(attendu);
    expect(comptesDe(rapportProtocole([resultatGroupe('non-reproduite', [membreV01, membreT01])], 2), manifesteMixte)).toMatchObject(attendu);
  });

  it('D6 — un groupe écarté doublon d’un attendu DÉJÀ retenu n’est pas une perte, et n’est pas crédité non plus', () => {
    // F01 est signalé par une anomalie retenue ; un second groupe portant la
    // même cause a été écarté. Rien n'a été détruit : pas de perte, pas
    // d'alarme — et pas de fausse alerte évitée à afficher pour autant.
    const comptes = comptesDe(
      rapportProtocole(
        [resultatGroupe('confirmee', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }]), resultatGroupe('non-reproduite', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }])],
        2,
        [anomalie({ categorie: 'fonctionnel', urlOuEtape: '/contact', verdict: 'confirmee' })],
      ),
      manifeste,
    );
    expect(comptes).toMatchObject({ nbGroupesEcartes: 1, nbFaussesAlertesEvitees: 0, nbPertesProtocole: 0, nbEcartesNonApparies: 0 });
  });

  it('D7 — trois groupes écartés sur le MÊME attendu valent une seule fausse alerte évitée', () => {
    // Dégrader la consolidation ne doit pas améliorer le chiffre de vente :
    // on compte des attendus distincts, pas des groupes.
    const troisGroupes = [
      resultatGroupe('non-reproduite', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }], 'g1'),
      resultatGroupe('non-reproduite', [{ categorie: 'fonctionnel', urlOuEtape: `${URL_BASE}/contact` }], 'g2'),
      resultatGroupe('basse-confiance', [{ categorie: 'fonctionnel', urlOuEtape: '/contact/' }], 'g3'),
    ];
    expect(comptesDe(rapportProtocole(troisGroupes, 3), manifesteT01)).toMatchObject({
      nbGroupesEcartes: 3,
      nbFaussesAlertesEvitees: 1,
      nbPertesProtocole: 0,
      nbEcartesNonApparies: 0,
    });
    // Symétrie : trois groupes écartés sur un même attendu à RETENIR = 1 perte.
    expect(comptesDe(rapportProtocole(troisGroupes, 3), manifeste)).toMatchObject({
      nbGroupesEcartes: 3,
      nbFaussesAlertesEvitees: 0,
      nbPertesProtocole: 1,
    });
  });

  it('D4/D5 — l’invariant du tableau tient sur un scénario : nbGroupes === nbGroupesRetenus + nbGroupesEcartes', () => {
    const comptes = comptesDe(
      rapportProtocole(
        [
          resultatGroupe('confirmee', [{ categorie: 'fonctionnel', urlOuEtape: '/contact' }]),
          resultatGroupe('intermittente', [{ categorie: 'visuel', urlOuEtape: '/' }]),
          resultatGroupe('non-reproduite', [{ categorie: 'seo', urlOuEtape: '/' }]),
          resultatGroupe('limite-automatisation', [{ categorie: 'performance', urlOuEtape: '/contact' }]),
        ],
        7,
      ),
      manifeste,
    );
    expect(comptes.nbGroupesRetenus).toBe(2);
    expect(comptes.nbGroupesEcartes).toBe(2);
    expect(comptes.nbGroupes).toBe(comptes.nbGroupesRetenus + comptes.nbGroupesEcartes);
  });
});


// ---------------------------------------------------------------------------
// INVARIANT : pertes > 0 ⟹ statut ≠ ok
// ---------------------------------------------------------------------------

describe('statutSelonPertes — l’invariant, posé directement', () => {
  const comptes = (nbPertesProtocole: number): ComptesProtocole => ({ ...comptesProtocoleZero(), nbPertesProtocole });

  it('interdit le statut ok dès qu’une anomalie réelle a été perdue', () => {
    expect(statutSelonPertes(comptes(1))).toBe('erreur');
    expect(statutSelonPertes(comptes(7))).toBe('erreur');
  });

  it('laisse ok quand aucune anomalie n’a été perdue', () => {
    expect(statutSelonPertes(comptes(0))).toBe('ok');
    expect(statutSelonPertes(comptesProtocoleZero())).toBe('ok');
  });

  it('ne dépend d’AUCUN autre compteur : seule la perte décide', () => {
    // Un scénario par ailleurs flatteur — beaucoup de fausses alertes évitées,
    // tout retenu — ne rachète pas une anomalie détruite. C'est exactement le
    // mensonge que l'invariant existe pour empêcher (APPRENTISSAGES n°3).
    const flatteur: ComptesProtocole = {
      nbCandidates: 40,
      nbGroupes: 10,
      nbGroupesRetenus: 9,
      nbGroupesEcartes: 1,
      nbFaussesAlertesEvitees: 8,
      nbPertesProtocole: 1,
      nbEcartesNonApparies: 0,
    };
    expect(statutSelonPertes(flatteur)).toBe('erreur');
    expect(statutSelonPertes({ ...flatteur, nbPertesProtocole: 0 })).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Notation des attendus de PROFIL
// ---------------------------------------------------------------------------

describe('noterProfils', () => {
  const ATTENDU_PROFIL = { nature: 'profil', typeSite: 'vitrine-contact', langue: null } as const;

  function manifesteProfil(inertieEprouvee: boolean, langue: string | null = null, langueScenario = 'fr'): Manifeste {
    return {
      ...manifeste,
      langue: langueScenario,
      attendus: [...manifeste.attendus, { ...ATTENDU_PROFIL, langue, inertieEprouvee }],
    };
  }

  function rapportAvecProfil(surcharges: Partial<NonNullable<Rapport['profil']>> = {}): Rapport {
    return {
      ...rapport([]),
      profil: {
        typeSite: 'vitrine-contact',
        natureLibre: null,
        langue: 'fr',
        confiance: 0.9,
        versionPrompt: 'v1',
        modeleDemande: 'modele-de-test',
        modeleServi: 'modele-de-test-20260101',
        apresRelance: false,
        ...surcharges,
      },
    };
  }

  it('ne note QUE les attendus de nature profil, et un par attendu', () => {
    const resultats = noterProfils(rapportAvecProfil(), manifesteProfil(false));
    expect(resultats).toHaveLength(1);
    expect(resultats[0]?.attendu.nature).toBe('profil');
    // Les attendus de bug du même manifeste ne sont pas passés par ici.
    expect(noterProfils(rapportAvecProfil(), manifeste)).toEqual([]);
  });

  it('satisfait l’attendu quand typeSite ET langue sont conformes', () => {
    expect(noterProfils(rapportAvecProfil(), manifesteProfil(false))[0]).toMatchObject({
      satisfait: true,
      nonMesure: false,
      langueAttendue: 'fr',
    });
  });

  it('résout `langue: null` en langue du SCÉNARIO, et respecte une langue explicite', () => {
    // Servi en `en` : le profil doit dire `en`, pas la langue d'un autre run.
    const enAnglais = manifesteProfil(false, null, 'en');
    expect(noterProfils(rapportAvecProfil({ langue: 'en' }), enAnglais)[0]).toMatchObject({ langueAttendue: 'en', satisfait: true });
    expect(noterProfils(rapportAvecProfil({ langue: 'fr' }), enAnglais)[0]).toMatchObject({ langueAttendue: 'en', satisfait: false });
    // Langue explicite : c'est elle qui décide, pas celle du scénario.
    const langueForcee = manifesteProfil(false, 'de', 'en');
    expect(noterProfils(rapportAvecProfil({ langue: 'de' }), langueForcee)[0]).toMatchObject({ langueAttendue: 'de', satisfait: true });
  });

  it('refuse l’attendu si l’un des deux champs objectifs diverge', () => {
    expect(noterProfils(rapportAvecProfil({ typeSite: 'boutique' }), manifesteProfil(false))[0]?.satisfait).toBe(false);
    expect(noterProfils(rapportAvecProfil({ langue: 'de' }), manifesteProfil(false))[0]?.satisfait).toBe(false);
    // Égalité STRICTE des codes de langue : le banc n'invente aucune
    // équivalence, un `fr-FR` là où `fr` est attendu doit se voir.
    expect(noterProfils(rapportAvecProfil({ langue: 'fr-FR' }), manifesteProfil(false))[0]?.satisfait).toBe(false);
  });

  it('ne note NI la description libre NI la confiance déclarée', () => {
    // Deux champs qu'une page sous injection peut influencer mot à mot :
    // les noter reviendrait à laisser la page se noter elle-même.
    const bavard = rapportAvecProfil({ natureLibre: 'texte produit par le modèle', confiance: 0 });
    expect(noterProfils(bavard, manifesteProfil(false))[0]?.satisfait).toBe(true);
  });

  it('déclare NON MESURÉ, jamais en échec, un rapport sans profil', () => {
    const sansProfil = noterProfils(rapport([]), manifesteProfil(false))[0];
    expect(sansProfil).toMatchObject({ nonMesure: true, satisfait: false });
    expect(sansProfil?.profil).toBeUndefined();
    // Même chose pour un scénario dont aucun rapport n'est sorti.
    expect(profilsNonMesures(manifesteProfil(true))[0]).toMatchObject({ nonMesure: true, satisfait: false });
  });

  it('transporte `inertieEprouvee` sans le réinterpréter : c’est le drapeau de routage des familles', () => {
    expect(noterProfils(rapportAvecProfil(), manifesteProfil(true))[0]?.attendu.inertieEprouvee).toBe(true);
    expect(noterProfils(rapportAvecProfil(), manifesteProfil(false))[0]?.attendu.inertieEprouvee).toBe(false);
  });

  it('un attendu de profil NON SATISFAIT n’est jamais un faux positif ni un raté de détection', () => {
    const manifesteMixte = manifesteProfil(true);
    const rapportFaux: Rapport = {
      ...rapportAvecProfil({ typeSite: 'boutique' }),
      anomalies: [anomalie({ categorie: 'fonctionnel', urlOuEtape: '/contact' })],
    };
    const { attendus, fauxPositifs } = apparier(rapportFaux, manifesteMixte);
    // Familles DISTINCTES : l'échec du profil ne touche ni l'un ni l'autre.
    expect(fauxPositifs).toEqual([]);
    expect(attendus).toHaveLength(2);
    expect(attendus[0]?.verdict).toBe('detecte');
    expect(noterProfils(rapportFaux, manifesteMixte)[0]?.satisfait).toBe(false);
  });
});
