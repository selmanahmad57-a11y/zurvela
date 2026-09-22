import { describe, expect, it } from 'vitest';
import type { ChampFormulaire, DescriptionFormulaire } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { choisirValeurs } from './remplissage.js';

const remplissage: ConfigScanner['remplissage'] = {
  regles: [
    { types: ['email'], autocomplete: ['email'], valeur: 'test@zurvela-scan.invalid' },
    { types: ['tel'], autocomplete: ['tel', 'tel-national'], valeur: '+33000000000' },
    { types: [], autocomplete: ['given-name', 'name'], valeur: 'Zurvela Scan Test' },
  ],
  valeurTexteParDefaut: 'Zurvela scan test',
  typesIgnores: ['hidden', 'submit', 'checkbox', 'file'],
};

function champ(type: string, extra: Partial<ChampFormulaire> = {}, selecteur = `#${type}`): ChampFormulaire {
  return { localisation: { balise: type === 'select' ? 'select' : 'input', selecteur, attributs: {} }, type, autocomplete: null, requis: false, ...extra };
}

function formulaire(champs: ChampFormulaire[]): DescriptionFormulaire {
  return { localisation: { balise: 'form', selecteur: 'form', attributs: {} }, methode: 'post', action: 'http://x/', champs, declencheur: null };
}

describe('choisirValeurs', () => {
  it('attribue la valeur marquée selon le type technique du champ', () => {
    const valeurs = choisirValeurs(formulaire([champ('email'), champ('tel')]), remplissage);
    expect(valeurs.map((v) => v.valeur)).toEqual(['test@zurvela-scan.invalid', '+33000000000']);
  });

  it('attribue selon un jeton autocomplete quand le type est générique', () => {
    const valeurs = choisirValeurs(formulaire([champ('text', { autocomplete: 'shipping given-name' })]), remplissage);
    expect(valeurs[0]?.valeur).toBe('Zurvela Scan Test');
  });

  it('donne la valeur texte par défaut aux champs texte sans règle, et rien aux autres types', () => {
    const valeurs = choisirValeurs(formulaire([champ('text'), champ('textarea'), champ('search'), champ('color')]), remplissage);
    expect(valeurs.map((v) => v.champ.selecteur)).toEqual(['#text', '#textarea', '#search']);
    expect(valeurs.every((v) => v.valeur === 'Zurvela scan test')).toBe(true);
  });

  it('ignore les types listés en config', () => {
    expect(choisirValeurs(formulaire([champ('hidden'), champ('checkbox'), champ('file')]), remplissage)).toEqual([]);
  });

  it('choisit la première option non vide d’un select, ou rien', () => {
    const avec = choisirValeurs(formulaire([champ('select', { options: ['', 'fr', 'en'] })]), remplissage);
    expect(avec[0]?.valeur).toBe('fr');
    expect(choisirValeurs(formulaire([champ('select', { options: [''] })]), remplissage)).toEqual([]);
  });

  it('ne dépend jamais du libellé : deux champs identiques hors attributs reçoivent la même valeur', () => {
    const a = choisirValeurs(formulaire([champ('email', {}, '#a')]), remplissage);
    const b = choisirValeurs(formulaire([champ('email', {}, '#b')]), remplissage);
    expect(a[0]?.valeur).toBe(b[0]?.valeur);
  });
});
