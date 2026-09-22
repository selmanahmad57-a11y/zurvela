import { beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import type { Action } from '../../types.js';
import { chargerActionsInterdites, type ActionsInterdites } from '../config.js';
import {
  apparier,
  attributsLus,
  creerFiltre,
  motifIdentifiantPresent,
  motifTextePresent,
  motifUrlPresent,
  normaliser,
  RAISON_LECTURE_IMPOSSIBLE,
  tokens,
  tokensIdentifiant,
  tokensUrl,
  type ValeursExaminees,
} from './filtre-actions.js';

/**
 * Motifs de test ARBITRAIRES : le filtre ne connaît aucun mot, seuls ceux-ci
 * comptent ici. Les cas de la liste réelle sont regroupés plus bas.
 */
const factice: ActionsInterdites = {
  appariement: { seuilPrefixe: 5 },
  motifsTexte: {
    alpha: {
      xa: ['motifa', 'zéta'],
      xb: ['deux mots'],
    },
    beta: { xa: ['abcde'] },
  },
  motifsUrl: ['jetonx', 'jetony'],
  exceptionsSandbox: [],
  attributsTexte: ['aria-label', 'alt', 'title', 'value'],
  attributsDescendantsExamines: ['alt', 'aria-label'],
  attributsUrl: ['href', 'action', 'formaction'],
  attributsIdentifiants: ['name', 'id', 'data-action'],
  texteVisibleExamine: true,
};

/** Valeurs vides sur les canaux non concernés par un cas. */
function valeurs(partiel: Partial<ValeursExaminees>): ValeursExaminees {
  return { texte: [], url: [], identifiant: [], ...partiel };
}

interface ElementFactice {
  texte?: string;
  attributs?: Record<string, string>;
}

/**
 * Doublure de page : rend ce que `lireDeclencheur` rendrait, en respectant le
 * contrat (seuls les attributs DEMANDÉS sont rendus, texte seulement si
 * demandé). `parDefaut` sert le sélecteur composite du bouton implicite.
 */
function pageFactice(elements: Record<string, ElementFactice>, parDefaut: ElementFactice | null = null): Page {
  return {
    evaluate: async (_fn: unknown, arg: { selecteur: string; attributs: string[]; texteVisible: boolean }) => {
      const element = elements[arg.selecteur] ?? parDefaut;
      if (element === null || element === undefined) {
        return null;
      }
      const attributs: Record<string, string> = {};
      for (const nom of arg.attributs) {
        const valeur = element.attributs?.[nom];
        if (valeur !== undefined) {
          attributs[nom] = valeur;
        }
      }
      return { texte: arg.texteVisible ? (element.texte ?? '') : null, attributs };
    },
  } as unknown as Page;
}

/** Le filtre ne touche pas la page pour `naviguer`, `remplir` et `terminer`. */
const pageJamaisUtilisee = new Proxy(
  {},
  {
    get: () => {
      throw new Error('page utilisée');
    },
  },
) as unknown as Page;

const FORMULAIRE = { balise: 'form', selecteur: 'form', attributs: {} };
const DECLENCHEUR = { balise: 'button', selecteur: 'form > button', attributs: {} };

function soumettre(declencheur: typeof DECLENCHEUR | null = DECLENCHEUR): Action {
  return { type: 'soumettre', formulaire: FORMULAIRE, declencheur };
}

describe('normaliser', () => {
  it('passe en minuscules et retire les marques combinantes', () => {
    expect(normaliser('ZÉTA Ça')).toBe('zeta ca');
  });

  it('replie la pleine chasse et retire les caractères de format invisibles', () => {
    // Un libellé coupé par un tiret conditionnel ou une espace sans chasse, ou
    // écrit en pleine chasse, reste confrontable aux motifs.
    expect(normaliser('mo­tifa')).toBe('motifa');
    expect(normaliser('mo​tifa')).toBe('motifa');
    expect(normaliser('ＭOTIFA')).toBe('motifa');
  });

  it('replie toute suite de blancs en une espace simple et rogne les bords', () => {
    // Le texte rendu d'un bouton dont les enfants sont mis en page en bloc
    // (flex, grid) porte un saut de ligne : sans repli, un motif multi-mots
    // dépendrait de la mise en page du site, pas du sens.
    expect(normaliser('Motifa\nmotifb')).toBe('motifa motifb');
    expect(normaliser('Motifa\t  motifb')).toBe('motifa motifb');
    // Espace insécable : un blanc, donc replié lui aussi.
    expect(normaliser('Motifa\u00a0motifb')).toBe('motifa motifb');
    expect(normaliser('  motifa  ')).toBe('motifa');
  });
});

describe('tokenisation', () => {
  it('découpe une valeur texte sur tout ce qui n’est ni lettre ni chiffre', () => {
    expect(tokens('Supprimer  mon compte !')).toEqual(['supprimer', 'mon', 'compte']);
    expect(tokens('Zêta-42_bis')).toEqual(['zeta', '42', 'bis']);
    expect(tokens('   ')).toEqual([]);
    expect(tokens('')).toEqual([]);
  });

  it('découpe un identifiant sur -, _ et les frontières camelCase', () => {
    expect(tokensIdentifiant('deleteAccountBtn')).toEqual(['delete', 'account', 'btn']);
    expect(tokensIdentifiant('post-42')).toEqual(['post', '42']);
    expect(tokensIdentifiant('delete_account')).toEqual(['delete', 'account']);
    expect(tokensIdentifiant('HTTPDeleteURL')).toEqual(['http', 'delete', 'url']);
    expect(tokensIdentifiant('')).toEqual([]);
  });

  it('découpe une URL en segments de chemin, valeurs de paramètres et fragment, jamais l’hôte', () => {
    expect(tokensUrl('https://jetonx.example.com/blog/post/42')).toEqual(['blog', 'post', '42']);
    expect(tokensUrl('/compte/delete-account?id=7')).toEqual(['compte', 'delete', 'account', '7']);
    // Un paramètre encodé est décodé avant tokenisation.
    expect(tokensUrl('/compte?action=delete%20now')).toEqual(['compte', 'delete', 'now']);
    expect(tokensUrl('/articles/r%C3%A9silier')).toEqual(['articles', 'resilier']);
    // Route d'application monopage : le fragment est un chemin.
    expect(tokensUrl('/app#/compte/supprimer')).toEqual(['app', 'compte', 'supprimer']);
    // URL relative, sans schéma ni barre initiale.
    expect(tokensUrl('compte/supprimer')).toEqual(['compte', 'supprimer']);
    expect(tokensUrl('')).toEqual([]);
    // Valeur qui n'est pas une URL http(s) : traitée comme un chemin.
    expect(tokensUrl('mailto:contact@site.invalid')).toEqual(['mailto', 'contact', 'site', 'invalid']);
    // Le nom de l'hôte n'est jamais une action, même seul.
    expect(tokensUrl('https://delete.example.com')).toEqual([]);
  });
});

describe('motifTextePresent (canal texte)', () => {
  const seuil = factice.appariement.seuilPrefixe;

  it('apparie un motif multi-mots en sous-chaîne normalisée, blancs repliés', () => {
    expect(motifTextePresent(['Les DEUX mots ici'], ['deux mots'], seuil)).toBe('deux mots');
    // Le repli des blancs rend le motif insensible à la mise en page : espaces
    // multiples, saut de ligne du texte rendu, tabulation.
    expect(motifTextePresent(['Les DEUX   mots'], ['deux mots'], seuil)).toBe('deux mots');
    expect(motifTextePresent(['DEUX\nmots'], ['deux mots'], seuil)).toBe('deux mots');
    expect(motifTextePresent(['DEUX\tmots'], ['deux mots'], seuil)).toBe('deux mots');
    // Les mots doivent rester contigus : un mot intercalé ne correspond pas.
    expect(motifTextePresent(['deux autres mots'], ['deux mots'], seuil)).toBeUndefined();
  });

  it('apparie un motif long comme préfixe de token, pas en sous-chaîne', () => {
    expect(motifTextePresent(['Supprimer'], ['supprim'], seuil)).toBe('supprim');
    expect(motifTextePresent(['Suppression du compte'], ['suppr'], seuil)).toBe('suppr');
    // Le motif est un PRÉFIXE, pas une racine : « supprim » ne couvre pas
    // « suppression » (c'est au motif de config d'être assez court).
    expect(motifTextePresent(['Suppression du compte'], ['supprim'], seuil)).toBeUndefined();
    // Préfixe de TOKEN : un motif au milieu d'un mot ne compte pas.
    expect(motifTextePresent(['resupprimer'], ['supprim'], seuil)).toBeUndefined();
  });

  it('apparie un motif court par token exact uniquement', () => {
    expect(motifTextePresent(['Postuler'], ['post'], seuil)).toBeUndefined();
    expect(motifTextePresent(['Post du jour'], ['post'], seuil)).toBe('post');
    // Cas de la doctrine : « paie » ne doit pas attraper « paiement ».
    expect(motifTextePresent(['Paiement'], ['paie'], seuil)).toBeUndefined();
    expect(motifTextePresent(['La paie'], ['paie'], seuil)).toBe('paie');
  });

  it('ignore casse et accents dans les deux sens, et les motifs vides', () => {
    expect(motifTextePresent(['xxZETAxx zéta'], ['zéta'], seuil)).toBe('zéta');
    // Motif accentué / valeur sans accent.
    expect(motifTextePresent(['Resilier mon contrat'], ['résili'], seuil)).toBe('résili');
    // Motif sans accent / valeur accentuée.
    expect(motifTextePresent(['Résiliation immédiate'], ['resili'], seuil)).toBe('resili');
    expect(motifTextePresent(['rien ici'], [''], seuil)).toBeUndefined();
    expect(motifTextePresent([''], ['abcde'], seuil)).toBeUndefined();
  });

  it('rend le PREMIER motif de la liste qui s’applique', () => {
    expect(motifTextePresent(['abcde motifa'], ['motifa', 'abcde'], seuil)).toBe('motifa');
  });
});

describe('motifUrlPresent / motifIdentifiantPresent (token exact)', () => {
  it('apparie un segment de chemin ou une valeur de paramètre, jamais une sous-chaîne', () => {
    expect(motifUrlPresent(['/compte/supprimer'], ['supprimer'])).toBe('supprimer');
    expect(motifUrlPresent(['/compte?action=delete'], ['delete'])).toBe('delete');
    expect(motifUrlPresent(['/blog/post/42'], ['post'])).toBe('post');
    // « delete » en sous-chaîne d'un segment ne suffit pas : le segment est tokenisé.
    expect(motifUrlPresent(['/undeleteable/42'], ['delete'])).toBeUndefined();
    expect(motifUrlPresent(['/compte/delete-account'], ['delete'])).toBe('delete');
    expect(motifUrlPresent(['https://delete.example.com/articles/42'], ['delete'])).toBeUndefined();
    expect(motifUrlPresent([''], ['delete'])).toBeUndefined();
  });

  it('apparie un token d’identifiant, y compris camelCase', () => {
    expect(motifIdentifiantPresent(['deleteAccountBtn'], ['delete'])).toBe('delete');
    expect(motifIdentifiantPresent(['post-42'], ['delete', 'post'])).toBe('post');
    expect(motifIdentifiantPresent(['undeleteable'], ['delete'])).toBeUndefined();
    expect(motifIdentifiantPresent([''], ['delete'])).toBeUndefined();
  });

  it('exige des tokens CONSÉCUTIFS pour un motif qui en compte plusieurs', () => {
    expect(motifUrlPresent(['/compte/delete-account'], ['delete account'])).toBe('delete account');
    expect(motifUrlPresent(['/delete/x/account'], ['delete account'])).toBeUndefined();
    expect(motifIdentifiantPresent(['deleteAccountBtn'], ['delete-account'])).toBe('delete-account');
  });
});

describe('apparier (ordre des canaux)', () => {
  it('rend le canal, la catégorie et la langue du motif texte', () => {
    expect(apparier(valeurs({ texte: ['Un MOTIFA ici'] }), factice)).toEqual({
      autorisee: false,
      canal: 'texte',
      categorie: 'alpha',
      langue: 'xa',
      motif: 'motifa',
    });
    expect(apparier(valeurs({ texte: ['abcdef'] }), factice)).toEqual({
      autorisee: false,
      canal: 'texte',
      categorie: 'beta',
      langue: 'xa',
      motif: 'abcde',
    });
  });

  it('ne renseigne ni catégorie ni langue pour les canaux url et identifiant', () => {
    expect(apparier(valeurs({ url: ['/a/jetonx'] }), factice)).toEqual({ autorisee: false, canal: 'url', motif: 'jetonx' });
    expect(apparier(valeurs({ identifiant: ['jetonyBtn'] }), factice)).toEqual({
      autorisee: false,
      canal: 'identifiant',
      motif: 'jetony',
    });
  });

  it('examine texte, puis url, puis identifiant', () => {
    const tous = valeurs({ texte: ['motifa'], url: ['/a/jetonx'], identifiant: ['jetony'] });
    expect(apparier(tous, factice)).toMatchObject({ canal: 'texte' });
    expect(apparier(valeurs({ url: ['/a/jetonx'], identifiant: ['jetony'] }), factice)).toMatchObject({ canal: 'url' });
  });

  it('autorise quand rien ne correspond, y compris sur des valeurs vides', () => {
    expect(apparier(valeurs({}), factice)).toEqual({ autorisee: true });
    expect(apparier(valeurs({ texte: [''], url: [''], identifiant: [''] }), factice)).toEqual({ autorisee: true });
    // Chaque canal ignore les motifs de l'autre liste.
    expect(apparier(valeurs({ texte: ['jetonx'] }), factice)).toEqual({ autorisee: true });
    expect(apparier(valeurs({ url: ['/motifa'] }), factice)).toEqual({ autorisee: true });
  });
});

describe('attributsLus', () => {
  it('rend l’union des trois classes d’attributs, sans doublon', () => {
    expect(attributsLus(factice)).toEqual(['aria-label', 'alt', 'title', 'value', 'href', 'action', 'formaction', 'name', 'id', 'data-action']);
    // Un attribut revendiqué par deux canaux n'est lu qu'une fois.
    expect(attributsLus({ ...factice, attributsUrl: ['href', 'value'] })).toEqual([
      'aria-label',
      'alt',
      'title',
      'value',
      'href',
      'name',
      'id',
      'data-action',
    ]);
  });
});

describe('creerFiltre', () => {
  const filtre = creerFiltre(factice);

  it('autorise remplir et terminer sans consulter la page', async () => {
    const remplir: Action = { type: 'remplir', formulaire: FORMULAIRE, valeurs: [] };
    await expect(filtre(remplir, pageJamaisUtilisee)).resolves.toEqual({ autorisee: true });
    await expect(filtre({ type: 'terminer', raison: 'x' }, pageJamaisUtilisee)).resolves.toEqual({ autorisee: true });
  });

  it('examine une navigation sur le canal url : chemin et paramètres, jamais l’hôte', async () => {
    await expect(filtre({ type: 'naviguer', url: 'http://site.invalid/compte/jetonx' }, pageJamaisUtilisee)).resolves.toEqual({
      autorisee: false,
      canal: 'url',
      motif: 'jetonx',
    });
    await expect(filtre({ type: 'naviguer', url: 'http://site.invalid/a?action=jetonx' }, pageJamaisUtilisee)).resolves.toEqual({
      autorisee: false,
      canal: 'url',
      motif: 'jetonx',
    });
    await expect(filtre({ type: 'naviguer', url: 'http://jetonx.invalid/page' }, pageJamaisUtilisee)).resolves.toEqual({
      autorisee: true,
    });
    // Le texte de la liste texte n'a pas cours sur une URL.
    await expect(filtre({ type: 'naviguer', url: 'http://site.invalid/motifa' }, pageJamaisUtilisee)).resolves.toEqual({
      autorisee: true,
    });
  });

  it('interdit une soumission d’après l’URL de soumission du formulaire', async () => {
    const page = pageFactice({
      form: { attributs: { action: 'http://site.invalid/api/jetonx' } },
      'form > button': { texte: 'Envoyer' },
    });
    await expect(filtre(soumettre(), page)).resolves.toEqual({ autorisee: false, canal: 'url', motif: 'jetonx' });
  });

  it('interdit une soumission d’après le texte visible du déclencheur', async () => {
    const page = pageFactice({ form: { attributs: { action: '/api/contact' } }, 'form > button': { texte: 'Zêta' } });
    await expect(filtre(soumettre(), page)).resolves.toEqual({
      autorisee: false,
      canal: 'texte',
      categorie: 'alpha',
      langue: 'xa',
      motif: 'zéta',
    });
  });

  it('interdit une soumission d’après un attribut TEXTE du déclencheur', async () => {
    const page = pageFactice({
      form: {},
      'form > button': { texte: '', attributs: { 'aria-label': 'Motifa maintenant' } },
    });
    await expect(filtre(soumettre(), page)).resolves.toMatchObject({ canal: 'texte', motif: 'motifa' });
  });

  it('interdit une soumission d’après un attribut IDENTIFIANT du déclencheur', async () => {
    const page = pageFactice({ form: {}, 'form > button': { texte: 'Envoyer', attributs: { id: 'jetonxBtn' } } });
    await expect(filtre(soumettre(), page)).resolves.toEqual({ autorisee: false, canal: 'identifiant', motif: 'jetonx' });
  });

  it('autorise une soumission saine, y compris avec des attributs vides', async () => {
    const page = pageFactice({
      form: { attributs: { action: '' } },
      'form > button': { texte: 'Envoyer', attributs: { name: '', id: '', 'aria-label': '', formaction: '' } },
    });
    await expect(filtre(soumettre(), page)).resolves.toEqual({ autorisee: true });
  });

  it('autorise une soumission dont le déclencheur a disparu de la page', async () => {
    const page = pageFactice({ form: {} });
    await expect(filtre(soumettre(null), page)).resolves.toEqual({ autorisee: true });
  });

  it('sans déclencheur extrait, examine le bouton par défaut du formulaire (formaction relatif ou absolu)', async () => {
    // Le navigateur activerait ce bouton à la soumission implicite : ses
    // attributs doivent être confrontés aux motifs comme ceux d'un bouton.
    const relatif = pageFactice({ form: {} }, { attributs: { formaction: 'compte/jetonx' } });
    await expect(filtre(soumettre(null), relatif)).resolves.toEqual({ autorisee: false, canal: 'url', motif: 'jetonx' });
    const absolu = pageFactice({ form: {} }, { attributs: { formaction: 'https://site.invalid/compte/jetonx' } });
    await expect(filtre(soumettre(null), absolu)).resolves.toEqual({ autorisee: false, canal: 'url', motif: 'jetonx' });
  });

  it('interdit d’après un attribut de nommage d’un DESCENDANT du déclencheur (bouton-icône)', async () => {
    // `nomPercu` agrège en page ; ici la doublure rend directement le texte agrégé.
    const page = pageFactice({ form: {}, 'form > button': { texte: 'Motifa' } });
    await expect(filtre(soumettre(), page)).resolves.toMatchObject({ canal: 'texte', motif: 'motifa' });
  });

  it('interdit un motif multi-mots que la mise en page du site a coupé d’un saut de ligne', async () => {
    // `nomPercu` rend le texte rendu du déclencheur : un bouton en `display:flex`
    // sépare ses enfants par un saut de ligne. Le verdict doit être le même
    // qu'en une seule ligne, sinon la page choisit si le filtre s'applique.
    const surUneLigne = pageFactice({ form: {}, 'form > button': { texte: 'Deux mots' } });
    const coupe = pageFactice({ form: {}, 'form > button': { texte: 'Deux\nmots' } });
    const attendu = { autorisee: false, canal: 'texte', categorie: 'alpha', langue: 'xb', motif: 'deux mots' };
    await expect(filtre(soumettre(), surUneLigne)).resolves.toEqual(attendu);
    await expect(filtre(soumettre(), coupe)).resolves.toEqual(attendu);
  });

  it('n’examine pas le texte visible si la config l’interdit', async () => {
    const sansTexte = creerFiltre({ ...factice, texteVisibleExamine: false });
    const page = pageFactice({ form: {}, 'form > button': { texte: 'Motifa' } });
    await expect(sansTexte(soumettre(), page)).resolves.toEqual({ autorisee: true });
  });

  it('FERMÉ : une soumission que le filtre ne peut pas examiner n’est pas autorisée', async () => {
    const page = {
      evaluate: async () => {
        throw new Error('page injoignable');
      },
    } as unknown as Page;
    await expect(filtre(soumettre(null), page)).resolves.toEqual({ autorisee: false, raison: RAISON_LECTURE_IMPOSSIBLE });
  });
});

/**
 * Cas de la DOCTRINE, confrontés à la vraie liste noire : ils décrivent ce que
 * le robot doit refuser et surtout ce qu'il doit continuer d'explorer.
 */
describe('liste noire réelle', () => {
  let reelle: ActionsInterdites;

  beforeAll(async () => {
    reelle = await chargerActionsInterdites();
  });

  it('refuse « Supprimer mon compte » et autorise « Postuler »', () => {
    expect(apparier(valeurs({ texte: ['Supprimer mon compte'] }), reelle)).toEqual({
      autorisee: false,
      canal: 'texte',
      categorie: 'destruction',
      langue: 'fr',
      motif: 'suppr',
    });
    // Le préfixe ne s'élargit jamais : « suppr » couvre aussi « Suppression ».
    expect(apparier(valeurs({ texte: ['Suppression de mon compte'] }), reelle)).toMatchObject({ motif: 'suppr' });
    expect(apparier(valeurs({ texte: ['Postuler'] }), reelle)).toEqual({ autorisee: true });
  });

  it('refuse un chemin destructif et autorise /blog/post/42', () => {
    expect(apparier(valeurs({ url: ['/compte/supprimer'] }), reelle)).toEqual({
      autorisee: false,
      canal: 'url',
      motif: 'supprimer',
    });
    expect(apparier(valeurs({ url: ['/blog/post/42'] }), reelle)).toEqual({ autorisee: true });
    // URL relative, sans barre initiale.
    expect(apparier(valeurs({ url: ['compte/supprimer'] }), reelle)).toMatchObject({ canal: 'url', motif: 'supprimer' });
  });

  it('refuse ?action=delete, y compris encodé, et autorise l’hôte delete.example.com', () => {
    expect(apparier(valeurs({ url: ['/compte?action=delete'] }), reelle)).toEqual({
      autorisee: false,
      canal: 'url',
      motif: 'delete',
    });
    expect(apparier(valeurs({ url: ['/compte?action=delete%20now'] }), reelle)).toMatchObject({ motif: 'delete' });
    expect(apparier(valeurs({ url: ['https://delete.example.com/articles/42'] }), reelle)).toEqual({ autorisee: true });
  });

  it('refuse id="delete-account-btn" et autorise id="post-42"', () => {
    expect(apparier(valeurs({ identifiant: ['delete-account-btn'] }), reelle)).toEqual({
      autorisee: false,
      canal: 'identifiant',
      motif: 'delete',
    });
    expect(apparier(valeurs({ identifiant: ['deleteAccountBtn'] }), reelle)).toMatchObject({ motif: 'delete' });
    expect(apparier(valeurs({ identifiant: ['post-42'] }), reelle)).toEqual({ autorisee: true });
  });

  it('refuse aria-label="Löschen" (de, destruction)', () => {
    expect(apparier(valeurs({ texte: ['Löschen'] }), reelle)).toEqual({
      autorisee: false,
      canal: 'texte',
      categorie: 'destruction',
      langue: 'de',
      motif: 'löschen',
    });
    expect(apparier(valeurs({ texte: ['KONTO LÖSCHEN'] }), reelle)).toMatchObject({ langue: 'de' });
  });

  it('COMPORTEMENT RÉEL : la normalisation replie les accents, jamais la transcription allemande oe', () => {
    // NFKD ramène « ö » à « o », mais « loeschen » reste une autre chaîne pour
    // le code : la transcription n'est pas une connaissance de langue du
    // moteur (constitution §2). Ce sont les DEUX graphies listées en config
    // qui la couvrent, sur le canal texte comme sur le canal URL.
    expect(motifTextePresent(['Loeschen'], ['löschen'], reelle.appariement.seuilPrefixe)).toBeUndefined();
    expect(apparier(valeurs({ texte: ['Loeschen'] }), reelle)).toMatchObject({ canal: 'texte', langue: 'de', motif: 'loeschen' });
    expect(apparier(valeurs({ url: ['/konto/loeschen'] }), reelle)).toMatchObject({ canal: 'url', motif: 'loeschen' });
    expect(apparier(valeurs({ url: ['/konto/löschen'] }), reelle)).toMatchObject({ canal: 'url', motif: 'loschen' });
    expect(apparier(valeurs({ url: ['/konto/l%C3%B6schen'] }), reelle)).toMatchObject({ canal: 'url', motif: 'loschen' });
  });

  it('refuse un texte accentué comme sa graphie sans accents', () => {
    const attendu = { autorisee: false, canal: 'texte', categorie: 'engagement', langue: 'fr', motif: 'résil' };
    expect(apparier(valeurs({ texte: ['Résilier mon abonnement'] }), reelle)).toEqual(attendu);
    expect(apparier(valeurs({ texte: ['Resilier mon abonnement'] }), reelle)).toEqual(attendu);
  });

  it('« paie » n’attrape pas « paiement », mais « paiement » et « payer » sont des motifs pleins', () => {
    const motifsFr = reelle.motifsTexte['paiement']?.['fr'] ?? [];
    expect(motifsFr).toContain('paie');
    expect(motifTextePresent(['paiement'], ['paie'], reelle.appariement.seuilPrefixe)).toBeUndefined();
    expect(apparier(valeurs({ texte: ['Valider le paiement'] }), reelle)).toMatchObject({
      categorie: 'paiement',
      langue: 'fr',
      motif: 'paiement',
    });
    expect(apparier(valeurs({ texte: ['Payer maintenant'] }), reelle)).toMatchObject({ categorie: 'paiement', motif: 'payer' });
  });

  it('autorise les valeurs vides et le vocabulaire du gabarit du banc', () => {
    expect(apparier(valeurs({ texte: [''], url: [''], identifiant: [''] }), reelle)).toEqual({ autorisee: true });
    // Les libellés et chemins du banc (fr et en) : aucun ne doit être bloqué.
    expect(apparier(valeurs({ texte: ['Envoyer', 'Send'] }), reelle)).toEqual({ autorisee: true });
    expect(apparier(valeurs({ url: ['/', '/contact', '/confirmation', '/api/contact'] }), reelle)).toEqual({ autorisee: true });
  });

  it('refuse un formaction absolu destructif lu sur le bouton par défaut', async () => {
    const filtre = creerFiltre(reelle);
    const page = pageFactice({ form: {} }, { attributs: { formaction: 'https://site.invalid/compte/supprimer' } });
    await expect(filtre(soumettre(null), page)).resolves.toEqual({ autorisee: false, canal: 'url', motif: 'supprimer' });
  });
});
