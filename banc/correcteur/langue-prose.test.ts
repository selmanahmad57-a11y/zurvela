/**
 * LA DÉTECTION DE LANGUE — et la démonstration qu'elle peut ÉCHOUER.
 *
 * Elle n'existe que pour une raison : sans elle, le critère « rapport
 * intégralement dans la langue demandée » était signé par une comparaison
 * d'étiquettes, c'est-à-dire par une vérification incapable de voir l'échec
 * pour lequel elle existe. Le premier bloc prouve donc qu'elle distingue
 * réellement deux langues ; le second, qu'elle sait refuser de se prononcer
 * plutôt que de deviner.
 */
import { describe, expect, it } from 'vitest';
import {
  RAISON_LANGUES_EX_AEQUO,
  RAISON_PROSE_TROP_COURTE,
  chargerDetectionLangue,
  detecterLangue,
  type ConfigDetectionLangue,
} from './langue-prose.js';

const config = await chargerDetectionLangue();

/** Deux proses réelles, tirées de rapports effectivement produits par le moteur. */
const PROSE_FR =
  'Sur la page de contact, un élément sur lequel le visiteur est censé agir ne déclenche rien lorsqu’il est activé. ' +
  'Tant que ce défaut persiste, une personne qui souhaite vous joindre depuis cette page ne peut pas aller au bout de sa démarche, ' +
  'et elle repart sans savoir si sa demande est partie. Demandez à la personne qui entretient le site de vérifier ce qui se passe.';
const PROSE_EN =
  'On the contact page viewed from a computer, we found an element that visitors would naturally click, but clicking it produces no visible result. ' +
  'As long as this lasts, someone who wants to reach you from a computer reaches a dead end on the very page meant to collect their message. ' +
  'Ask whoever maintains the site to check the interactive element on the contact page.';

describe('detecterLangue — elle distingue réellement deux langues', () => {
  it('reconnaît une prose française', () => {
    expect(detecterLangue(PROSE_FR, config).langue).toBe('fr');
  });

  it('reconnaît une prose anglaise', () => {
    expect(detecterLangue(PROSE_EN, config).langue).toBe('en');
  });

  it('LA GARDE PEUT ÉCHOUER : une prose anglaise sous une demande française est vue', () => {
    // C'est le scénario exact que l'ancien contrôle ne pouvait pas voir — le
    // modèle rédige en anglais sur un bloc factuel anglais, le rapport porte
    // l'étiquette `fr`, et tout passait au vert.
    expect(detecterLangue(PROSE_EN, config).langue).not.toBe('fr');
  });

  it('les accents ne cassent pas le découpage : « été » n’est pas « t »', () => {
    const resultat = detecterLangue(PROSE_FR, config);
    expect(resultat.scores['fr']).toBeGreaterThan(resultat.scores['en'] ?? 0);
  });
});

describe('detecterLangue — elle a le droit de NE PAS SAVOIR, et elle l’exerce', () => {
  it('refuse de se prononcer sur une prose trop courte', () => {
    const resultat = detecterLangue('Bouton mort.', config);
    expect(resultat.langue).toBeNull();
    expect(resultat.raison).toBe(RAISON_PROSE_TROP_COURTE);
  });

  it('refuse de trancher entre deux langues trop proches', () => {
    // Une table volontairement ambiguë : les mêmes mots-outils des deux côtés.
    const ambigue: ConfigDetectionLangue = {
      tokensMin: 2,
      margeMin: 3,
      motsOutils: { fr: ['le', 'la', 'de'], en: ['le', 'la', 'de'] },
    };
    const resultat = detecterLangue('le la de le la de', ambigue);
    expect(resultat.langue).toBeNull();
    expect(resultat.raison).toBe(RAISON_LANGUES_EX_AEQUO);
  });

  it('un texte sans aucun mot-outil connu ne désigne personne', () => {
    expect(detecterLangue('xyzzy plugh frotz quux blorple', config).langue).toBeNull();
  });
});

describe('la table elle-même', () => {
  it('couvre au moins les deux langues du banc, avec des listes disjointes en pratique', () => {
    expect(Object.keys(config.motsOutils).sort()).toEqual(['en', 'fr']);
    const fr = new Set(config.motsOutils['fr']);
    const communs = (config.motsOutils['en'] ?? []).filter((mot) => fr.has(mot));
    // Quelques mots appartiennent aux deux (« a », « on », « son »…) : c'est
    // la MARGE qui décide, pas la pureté des listes. Mais un recouvrement
    // massif rendrait la détection incapable de trancher.
    expect(communs.length).toBeLessThan(10);
  });

  it('ne contient que des MOTS-OUTILS : aucun mot du domaine', () => {
    // On mesure une langue, jamais un sujet. Un mot comme « formulaire » ou
    // « bouton » ferait de la détection une mesure du CONTENU du rapport.
    const domaine = ['formulaire', 'bouton', 'page', 'erreur', 'site', 'form', 'button', 'error', 'report'];
    for (const outils of Object.values(config.motsOutils)) {
      for (const mot of domaine) {
        expect(outils).not.toContain(mot);
      }
    }
  });
});
