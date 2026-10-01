/**
 * LA GRAVITÉ SE LIT SUR CE QUI EST MASQUÉ (cahier P2-3, contrat 2).
 *
 * Ce que ces tests protègent n'est pas un classement, c'est une PROMESSE :
 * « Bloquant » veut dire « le parcours s'arrête là ». Cinq sites de la
 * campagne l'ont reçue pour un lien de mot-clé recouvert par un pied de
 * page.
 */
import { describe, expect, it } from 'vitest';
import type { Gravite, LocalisationElement } from '../../types.js';
import {
  GRAVITE_MAX_NATURE_INDETERMINEE,
  graviteRecouvrement,
  natureMasquee,
  naturePlusGrave,
  type ConfigGraviteRecouvrement,
} from './nature-masquee.js';

const CONFIG: ConfigGraviteRecouvrement = {
  gravite: 'important',
  graviteParNature: { actionCritique: 'bloquant', controleOrdinaire: 'important', contenuSecondaire: 'mineur' },
};

function element(balise: string, selecteur: string, attributs: Record<string, string> = {}): LocalisationElement {
  return { balise, selecteur, attributs };
}

describe('natureMasquee — des signaux du WEB, jamais du monde', () => {
  it('la soumission d’un formulaire est une ACTION CRITIQUE, sans qu’aucun libellé soit lu', () => {
    // Un bouton d'achat n'est pas reconnu comme tel : il est la soumission
    // d'un formulaire, et c'est par là qu'il compte. Aucune langue ici.
    expect(natureMasquee(element('button', 'form > button', { type: 'submit' }))).toBe('actionCritique');
    // `type` absent sur un `button` vaut `submit` : le défaut du standard.
    expect(natureMasquee(element('button', 'body > div > button'))).toBe('actionCritique');
    expect(natureMasquee(element('input', 'form > input', { type: 'image' }))).toBe('actionCritique');
    // Un contrôle QUELCONQUE dans un formulaire en dépend aussi.
    expect(natureMasquee(element('input', 'body > form > input', { type: 'text' }))).toBe('actionCritique');
  });

  it('un lien de la navigation principale est une ACTION CRITIQUE (landmark `nav`, pas un nom de classe)', () => {
    expect(natureMasquee(element('a', 'body > nav > ul > li > a', { href: '/panier' }))).toBe('actionCritique');
  });

  it('un lien du PIED DE PAGE est du CONTENU SECONDAIRE : c’est le landmark qui décide, pas la balise', () => {
    // Le cas exact de la fiche 09 : un lien de mot-clé recouvert par le pied
    // de page, publié « Bloquant · les clics n'aboutissent pas ».
    expect(natureMasquee(element('a', 'body > footer > p > a', { href: '/mot-cle' }))).toBe('contenuSecondaire');
    expect(natureMasquee(element('a', 'body > aside > a', { href: '/promo' }))).toBe('contenuSecondaire');
  });

  it('… mais un lien du CORPS de la page ne l’est PAS : c’est par lui que le visiteur avance', () => {
    // Le contrôle qui peut échouer, et que le témoin d'intersection a
    // trouvé : trois liens d'offre recouverts par un calque valent plus
    // qu'un lien de mot-clé en pied de page. Sans landmark, on ne descend
    // pas au plus bas — supposer « secondaire » enterrerait un vrai défaut.
    expect(natureMasquee(element('a', 'body > main > section > a', { href: '/offre/1' }))).toBe('controleOrdinaire');
    expect(natureMasquee(element('a', 'body > div > a', { href: '/produit' }))).toBe('controleOrdinaire');
  });

  it('un contrôle interactif ordinaire n’est ni l’un ni l’autre', () => {
    expect(natureMasquee(element('button', 'body > div > button', { type: 'button' }))).toBe('controleOrdinaire');
    expect(natureMasquee(element('select', 'body > div > select'))).toBe('controleOrdinaire');
    expect(natureMasquee(element('div', 'body > div > div', { role: 'button' }))).toBe('controleOrdinaire');
  });

  it('ce que le code ne sait pas situer reste INDÉTERMINÉ : le refus d’affirmer n’est pas un échec', () => {
    expect(natureMasquee(element('div', 'body > div > div'))).toBe('indeterminee');
    expect(natureMasquee(element('span', '#entete > span'))).toBe('indeterminee');
  });
});

describe('graviteRecouvrement — la promesse de « Bloquant »', () => {
  it('rend la gravité de la nature, telle que la config la fixe', () => {
    expect(graviteRecouvrement('actionCritique', CONFIG)).toBe('bloquant');
    expect(graviteRecouvrement('controleOrdinaire', CONFIG)).toBe('important');
    expect(graviteRecouvrement('contenuSecondaire', CONFIG)).toBe('mineur');
  });

  it('PLAFONNE une nature indéterminée sous « bloquant », même si la config dit l’inverse', () => {
    // LE CONTRÔLE QUI PEUT ÉCHOUER : le plafond est un INVARIANT, pas un
    // réglage. Une config qui voudrait « bloquant » par défaut ne doit pas
    // pouvoir rouvrir l'affirmation « le parcours s'arrête là ».
    const permissive: ConfigGraviteRecouvrement = { ...CONFIG, gravite: 'bloquant' };
    expect(graviteRecouvrement('indeterminee', permissive)).toBe(GRAVITE_MAX_NATURE_INDETERMINEE);
    expect(graviteRecouvrement('indeterminee', permissive)).not.toBe('bloquant');
  });

  it('une gravité de repli PLUS BASSE que le plafond est respectée : le plafond borne, il n’impose pas', () => {
    const prudente: ConfigGraviteRecouvrement = { ...CONFIG, gravite: 'mineur' as Gravite };
    expect(graviteRecouvrement('indeterminee', prudente)).toBe('mineur');
  });
});

describe('naturePlusGrave — une cause vaut le pire de ce qu’elle masque', () => {
  it('un calque qui couvre un lien secondaire ET une soumission est BLOQUANT', () => {
    expect(naturePlusGrave(['contenuSecondaire', 'actionCritique', 'indeterminee'])).toBe('actionCritique');
  });

  it('sans aucune cible lisible, la cause reste indéterminée', () => {
    expect(naturePlusGrave([])).toBe('indeterminee');
    expect(naturePlusGrave(['indeterminee', 'indeterminee'])).toBe('indeterminee');
  });
});
