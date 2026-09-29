/**
 * L'ÉNUMÉRATION est la PREMIÈRE couche de sécurité (cahier 4b §1). Ce qui se
 * vérifie ici n'est pas qu'elle « propose bien » : c'est qu'elle ne laisse
 * sortir AUCUN moyen d'agir — pas un sélecteur, pas une URL absolue, pas un
 * texte d'action. Un modèle qui ne dispose que d'identifiants opaques ne peut
 * pas inventer un acte : c'est une impossibilité structurelle, pas une
 * consigne de prompt.
 */
import { describe, expect, it } from 'vitest';
import type { ContexteDecision, DescriptionFormulaire, PageVisitee } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { CHEMIN_EXTERNE, cheminDe, composerEtat, enumererActions, libelleBorne } from './enumeration.js';
import { decisionDeterministe, RAISON_PLUS_RIEN } from './politique.js';

const ORIGINE = 'http://site.invalid';

const remplissage: ConfigScanner['remplissage'] = {
  regles: [{ types: ['email'], autocomplete: ['email'], valeur: 'test@zurvela-scan.invalid' }],
  valeurTexteParDefaut: 'Zurvela scan test',
  typesIgnores: ['hidden'],
};

const declencheur = { balise: 'button', selecteur: 'form > button[type="submit"]', attributs: { type: 'submit' } };

const CHAMP_EMAIL = { localisation: { balise: 'input', selecteur: '#email', attributs: {} }, type: 'email', autocomplete: null, requis: true };
const CHAMP_MESSAGE = { localisation: { balise: 'textarea', selecteur: '#message', attributs: {} }, type: 'textarea', autocomplete: null, requis: false };
/**
 * Deux formulaires DISTINCTS par leurs champs : depuis le cahier P2-1
 * (contrat 3), deux formulaires de même signature sur une page ne valent
 * qu'une action — les tests qui comptent deux `remplir` ont donc besoin de
 * deux formulaires différents, et le dédoublonnage a son propre test plus bas.
 */
function formulaire(selecteur: string, champs: DescriptionFormulaire['champs'] = [CHAMP_EMAIL]): DescriptionFormulaire {
  return {
    localisation: { balise: 'form', selecteur, attributs: { id: 'contact' } },
    methode: 'post',
    action: `${ORIGINE}/api/envoi`,
    champs,
    declencheur,
  };
}

function contexte(surcharges: Partial<ContexteDecision> = {}): ContexteDecision {
  const pageCourante: PageVisitee = {
    url: `${ORIGINE}/contact`,
    viewport: 'desktop',
    statutHttp: 200,
    liensInternes: [],
    formulaires: [formulaire('form:nth-of-type(1)'), formulaire('form:nth-of-type(2)', [CHAMP_EMAIL, CHAMP_MESSAGE])],
    horodatage: new Date(0).toISOString(),
  };
  return { pageCourante, formulairesRemplis: [], formulairesSoumis: [], urlsEnAttente: [], nbPagesVisitees: 1, ...surcharges };
}

const OPTIONS = {
  remplissage,
  libelleMaxChars: 20,
  origine: ORIGINE,
  libelles: new Map<string, string>(),
  // Le banc se sert lui-même : le site scanné nous appartient littéralement.
  soumission: 'site-possede' as const,
};

describe('cheminDe', () => {
  it('rend le chemin et la requête du site, et jamais un hôte', () => {
    expect(cheminDe(`${ORIGINE}/catalogue?page=2`, ORIGINE)).toBe('/catalogue?page=2');
    expect(cheminDe(`${ORIGINE}/`, ORIGINE)).toBe('/');
    expect(cheminDe('http://autre.invalid/x', ORIGINE)).toBe(CHEMIN_EXTERNE);
    expect(cheminDe('pas une url', ORIGINE)).toBe(CHEMIN_EXTERNE);
  });
});

describe('libelleBorne', () => {
  it('aplatit les séparateurs de ligne et tronque : un libellé ne fabrique pas de ligne dans le bloc de données', () => {
    expect(libelleBorne('a\nb\r\nc\u2028d', 100)).toBe('a b c d');
    expect(libelleBorne('0123456789'.repeat(3), 12)).toBe('012345678901');
    expect(libelleBorne('   ', 10)).toBeNull();
    expect(libelleBorne(undefined, 10)).toBeNull();
  });
});

describe('enumererActions — la SOUMISSION est gatée à l’énumération', () => {
  it('en mode « aucune », l’action de soumettre n’existe pas : le modèle ne peut pas la choisir', () => {
    // Première couche, et non un filtre après coup. La différence compte : un
    // filtre laisse toujours la question « et si quelque chose le
    // contournait ». Ici l'action n'est jamais construite.
    const actions = enumererActions(contexte({ urlsEnAttente: [`${ORIGINE}/a`] }), { ...OPTIONS, soumission: 'aucune' });
    expect(actions.map((a) => a.type)).not.toContain('soumettre');
    // Tout le reste subsiste : un premier scan n'a pas besoin de soumettre
    // pour être utile — navigation, remplissage, arrêt.
    expect(actions.map((a) => a.type)).toEqual(['remplir', 'remplir', 'naviguer', 'terminer']);
  });

  it('en mode « site-possede », elle est énumérée : le contrôle précédent distingue, il n’éteint pas', () => {
    const actions = enumererActions(contexte({ urlsEnAttente: [`${ORIGINE}/a`] }), { ...OPTIONS, soumission: 'site-possede' });
    expect(actions.filter((a) => a.type === 'soumettre')).toHaveLength(2);
  });
});

describe('enumererActions', () => {
  it('attribue des identifiants opaques du moteur, dans l’ordre de la priorité déterministe', () => {
    const actions = enumererActions(contexte({ urlsEnAttente: [`${ORIGINE}/a`] }), OPTIONS);
    expect(actions.map((a) => a.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(actions.map((a) => a.type)).toEqual(['remplir', 'remplir', 'soumettre', 'soumettre', 'naviguer', 'terminer']);
  });

  it('énumère TOUJOURS `terminer`, en dernier : une politique doit toujours pouvoir s’arrêter', () => {
    const remplis = ['form:nth-of-type(1)', 'form:nth-of-type(2)'];
    const actions = enumererActions(contexte({ formulairesRemplis: remplis, formulairesSoumis: remplis }), OPTIONS);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toEqual({ type: 'terminer', raison: RAISON_PLUS_RIEN });
  });

  it('ne transmet AUCUN sélecteur ni AUCUNE URL absolue : des repères techniques et un chemin, rien d’autre', () => {
    const actions = enumererActions(contexte({ urlsEnAttente: [`${ORIGINE}/catalogue`, 'http://ailleurs.invalid/x'] }), OPTIONS);
    const visible = JSON.stringify(actions.map((a) => ({ id: a.id, type: a.type, reperes: a.reperes, libelle: a.libelle })));
    expect(visible).not.toContain('nth-of-type');
    expect(visible).not.toContain('#email');
    expect(visible).not.toContain(ORIGINE);
    expect(visible).not.toContain('ailleurs.invalid');
    const navigations = actions.filter((a) => a.type === 'naviguer');
    expect(navigations.map((a) => a.reperes['chemin'])).toEqual(['/catalogue', CHEMIN_EXTERNE]);
    // Les repères d'un formulaire sont des comptes et des jetons HTML.
    expect(actions[0]?.reperes).toEqual({ balise: 'form', methode: 'post', cible: '/api/envoi', champs: '1', champsRequis: '1' });
  });

  it('porte le libellé du lien, tronqué : c’est par lui que la page parle au modèle', () => {
    const libelles = new Map([[`${ORIGINE}/a`, 'Un libellé beaucoup trop long pour tenir']]);
    const [navigation] = enumererActions(
      contexte({ formulairesRemplis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'], formulairesSoumis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'], urlsEnAttente: [`${ORIGINE}/a`] }),
      { ...OPTIONS, libelleMaxChars: 10, libelles },
    );
    expect(navigation?.libelle).toBe('Un libellé');
  });

  it('garde l’acte réel HORS de la vue du modèle, mais complet pour le moteur', () => {
    const [remplir] = enumererActions(contexte(), OPTIONS);
    expect(remplir?.action).toEqual({
      type: 'remplir',
      formulaire: { balise: 'form', selecteur: 'form:nth-of-type(1)', attributs: { id: 'contact' } },
      valeurs: [{ champ: { balise: 'input', selecteur: '#email', attributs: {} }, valeur: 'test@zurvela-scan.invalid' }],
    });
  });

  /**
   * INVARIANT de comparabilité : l'ordre d'énumération est celui de la
   * priorité déterministe, donc la décision GRATUITE est toujours la première
   * proposition. Sans lui, les deux politiques ne seraient pas comparables
   * sur le même état — et la jumelle coût/efficacité du banc mesurerait deux
   * choses différentes.
   */
  it('la décision déterministe est TOUJOURS la première action énumérée', () => {
    const cas: Partial<ContexteDecision>[] = [
      {},
      { formulairesRemplis: ['form:nth-of-type(1)'] },
      { formulairesRemplis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'] },
      { formulairesRemplis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'], formulairesSoumis: ['form:nth-of-type(1)'] },
      {
        formulairesRemplis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'],
        formulairesSoumis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'],
        urlsEnAttente: [`${ORIGINE}/a`, `${ORIGINE}/b`],
      },
      {
        formulairesRemplis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'],
        formulairesSoumis: ['form:nth-of-type(1)', 'form:nth-of-type(2)'],
      },
      { pageCourante: { url: `${ORIGINE}/x`, viewport: 'desktop', statutHttp: 200, liensInternes: [], formulaires: [], horodatage: '' }, urlsEnAttente: [`${ORIGINE}/z`] },
    ];
    for (const surcharges of cas) {
      const etat = contexte(surcharges);
      expect(enumererActions(etat, OPTIONS)[0]?.action).toEqual(decisionDeterministe(etat, remplissage));
    }
  });
});

describe('composerEtat', () => {
  const base = {
    url: `${ORIGINE}/catalogue?page=3`,
    origine: ORIGINE,
    viewport: 'desktop',
    profil: null,
    actions: [],
    historique: [
      { type: 'naviguer' as const, page: '/a' },
      { type: 'naviguer' as const, page: '/b' },
      { type: 'naviguer' as const, page: '/c' },
    ],
    historiqueMaxActions: 2,
    nbPagesVisitees: 3,
    pagesRestantes: 2,
  };

  it('réduit la page courante à son chemin et ne garde que les actions les plus récentes', () => {
    const etat = composerEtat(base);
    expect(etat.page).toBe('/catalogue?page=3');
    expect(etat.historique).toEqual([{ type: 'naviguer', page: '/b' }, { type: 'naviguer', page: '/c' }]);
  });

  it('ne rend jamais un budget de pages négatif : le doute ne fabrique pas du budget', () => {
    expect(composerEtat({ ...base, pagesRestantes: -4 }).pagesRestantes).toBe(0);
  });
});

describe('la frontière du prompt', () => {
  it('rien de ce que le modèle peut voir ne porte de sélecteur, d’hôte ou de valeur saisie — l’acte, lui, reste complet côté moteur', () => {
    const actions = enumererActions(contexte({ urlsEnAttente: [`${ORIGINE}/a`] }), OPTIONS);
    const etat = composerEtat({
      url: `${ORIGINE}/contact`,
      origine: ORIGINE,
      viewport: 'desktop',
      profil: null,
      actions,
      historique: [],
      historiqueMaxActions: 10,
      nbPagesVisitees: 1,
      pagesRestantes: 5,
    });
    // Ce que le prompt a le droit de montrer d'une action : id, type, repères, libellé.
    const montrable = JSON.stringify(etat.actions.map((a) => [a.id, a.type, a.reperes, a.libelle]));
    expect(montrable).not.toContain('nth-of-type');
    expect(montrable).not.toContain('#email');
    expect(montrable).not.toContain(ORIGINE);
    expect(montrable).not.toContain('test@zurvela-scan.invalid');
    expect(etat.page).toBe('/contact');
    // Et l'état complet porte bien l'acte : c'est le moteur qui l'exécute.
    expect(JSON.stringify(etat.actions.map((a) => a.action))).toContain('nth-of-type');
  });
});

describe('enumererActions — le menu n’énumère que ce qui se remplit (cahier P2-1, contrat 3)', () => {
  it('un formulaire SANS champ remplissable (un bouton seul) n’a pas d’action « remplir » : c’est le web, pas le monde', () => {
    // books.toscrape : vingt cartes à formulaire-bouton par page, 237
    // remplissages vides, l'échéance entière (C-10).
    const bouton = formulaire('form:nth-of-type(1)', []);
    const actions = enumererActions(contexte({ pageCourante: { ...contexte().pageCourante, formulaires: [bouton] } }), OPTIONS);
    expect(actions.filter((action) => action.type === 'remplir')).toEqual([]);
    // La spécification déterministe dit la même chose.
    expect(decisionDeterministe(contexte({ pageCourante: { ...contexte().pageCourante, formulaires: [bouton] } }), remplissage).type).not.toBe('remplir');
  });

  it('un formulaire dont tous les champs sont IGNORÉS par la config n’est pas remplissable non plus', () => {
    const cache = formulaire('form:nth-of-type(1)', [{ ...CHAMP_EMAIL, type: 'hidden' }]);
    const actions = enumererActions(contexte({ pageCourante: { ...contexte().pageCourante, formulaires: [cache] } }), OPTIONS);
    expect(actions.filter((action) => action.type === 'remplir')).toEqual([]);
  });

  it('vingt formulaires de MÊME signature ne valent qu’une action ; le premier est retenu', () => {
    const cartes = Array.from({ length: 20 }, (_, i) => formulaire(`form:nth-of-type(${i + 1})`));
    const ctx = contexte({ pageCourante: { ...contexte().pageCourante, formulaires: cartes } });
    const remplir = enumererActions(ctx, OPTIONS).filter((action) => action.type === 'remplir');
    expect(remplir).toHaveLength(1);
    expect(remplir[0]?.action).toMatchObject({ type: 'remplir', formulaire: cartes[0]?.localisation });
    expect(decisionDeterministe(ctx, remplissage)).toMatchObject({ type: 'remplir', formulaire: cartes[0]?.localisation });
  });

  it('deux formulaires de signatures DIFFÉRENTES restent deux actions : le dédoublonnage ne confond pas', () => {
    const remplir = enumererActions(contexte(), OPTIONS).filter((action) => action.type === 'remplir');
    expect(remplir).toHaveLength(2);
  });

  it('le formulaire dédoublonné mais DÉJÀ rempli laisse la place au suivant de même signature', () => {
    // Le contrôle qui peut échouer : si le dédoublonnage se faisait avant le
    // filtre « déjà rempli », un second formulaire identique ne serait jamais
    // proposé une fois le premier rempli — ce qui est le comportement voulu
    // ici (le même formulaire répété n'apprend rien), et ce test le fige.
    const cartes = [formulaire('form:nth-of-type(1)'), formulaire('form:nth-of-type(2)')];
    const ctx = contexte({ pageCourante: { ...contexte().pageCourante, formulaires: cartes }, formulairesRemplis: ['form:nth-of-type(1)'] });
    const remplir = enumererActions(ctx, OPTIONS).filter((action) => action.type === 'remplir');
    expect(remplir).toHaveLength(1);
    expect(remplir[0]?.action).toMatchObject({ formulaire: cartes[1]?.localisation });
  });
});
