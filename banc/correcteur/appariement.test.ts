import { describe, expect, it } from 'vitest';
import type { Anomalie, Rapport } from '../../core/types.js';
import type { Manifeste } from '../types.js';
import { apparier, normaliserLocalisation } from './appariement.js';

const URL_BASE = 'http://127.0.0.1:4800';

function anomalie(surcharges: Partial<Anomalie>): Anomalie {
  return { categorie: 'fonctionnel', description: '', urlOuEtape: '/contact', graviteEstimee: 'bloquant', confiance: 1, ...surcharges };
}

function rapport(anomalies: Anomalie[]): Rapport {
  return { url: URL_BASE, anomalies, coutApi: 0, dureeMs: 0, journal: [] };
}

const manifeste: Manifeste = {
  scenarioId: 'formulaire-contact--f01-v01--fr',
  gabarit: 'formulaire-contact',
  langue: 'fr',
  attendus: [
    { bugId: 'F01', nom: 'bouton-mort', categorie: 'fonctionnel', pages: ['/contact'], gravite: 'bloquant' },
    { bugId: 'V01', nom: 'image-cassee', categorie: 'visuel', pages: ['/', '/contact', '/confirmation'], gravite: 'mineur' },
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
        { bugId: 'F01', nom: 'bouton-mort', categorie: 'fonctionnel', pages: ['/contact'], gravite: 'bloquant' },
        { bugId: 'F02', nom: 'echec-silencieux', categorie: 'fonctionnel', pages: ['/contact'], gravite: 'bloquant' },
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
