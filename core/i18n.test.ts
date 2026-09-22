import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chargerDictionnaire, chercher, interpoler, rendreGabarit, traduire, type Dictionnaire } from './i18n.js';

const dico: Dictionnaire = {
  langue: 'fr',
  site: { nom: 'Exemple', slogan: 'Un {{adjectif}} slogan' },
  compte: { resume: '{{nombre}} élément(s) sur {{total}}' },
};

describe('chercher', () => {
  it('résout un chemin de clé jusqu’à une feuille', () => {
    expect(chercher(dico, 'langue')).toBe('fr');
    expect(chercher(dico, 'site.nom')).toBe('Exemple');
  });

  it('lève pour une clé absente, une clé qui désigne un sous-objet, ou une clé qui traverse une feuille', () => {
    expect(() => chercher(dico, 'inconnue')).toThrow(/Clé i18n introuvable : inconnue/);
    expect(() => chercher(dico, 'site.inconnue')).toThrow(/Clé i18n introuvable : site\.inconnue/);
    expect(() => chercher(dico, 'site')).toThrow(/Clé i18n introuvable : site/);
    expect(() => chercher(dico, 'site.nom.plus')).toThrow(/Clé i18n introuvable : site\.nom\.plus/);
  });
});

describe('interpoler', () => {
  it('remplace chaque emplacement par sa valeur, chaînes et nombres (0 compris)', () => {
    expect(interpoler('{{a}} et {{b}}', { a: 'x', b: 'y' })).toBe('x et y');
    expect(interpoler('{{ nombre }} sur {{total}}', { nombre: 0, total: 3 })).toBe('0 sur 3');
    expect(interpoler('{{a}}{{a}}', { a: 1 })).toBe('11');
  });

  it('rend un texte sans emplacement tel quel, même sans valeurs', () => {
    expect(interpoler('aucun emplacement')).toBe('aucun emplacement');
  });

  it('lève pour un emplacement sans valeur', () => {
    expect(() => interpoler('{{x}}')).toThrow(/manquante : x/);
    expect(() => interpoler('{{x}} {{y}}', { x: 'ok' })).toThrow(/manquante : y/);
  });
});

describe('traduire', () => {
  it('traduit puis interpole', () => {
    expect(traduire(dico, 'site.nom')).toBe('Exemple');
    expect(traduire(dico, 'site.slogan', { adjectif: 'bon' })).toBe('Un bon slogan');
    expect(traduire(dico, 'compte.resume', { nombre: 0, total: 2 })).toBe('0 élément(s) sur 2');
  });

  it('lève si la clé manque ou si une valeur d’interpolation manque', () => {
    expect(() => traduire(dico, 'site.absent')).toThrow(/Clé i18n introuvable/);
    expect(() => traduire(dico, 'site.slogan')).toThrow(/manquante : adjectif/);
  });
});

describe('rendreGabarit', () => {
  it('remplace tous les emplacements `{{a.b}}` d’un gabarit, espaces tolérés', () => {
    const gabarit = '<html lang="{{langue}}"><title>{{ site.nom }}</title><p>{{site.nom}}</p></html>';
    expect(rendreGabarit(gabarit, dico)).toBe('<html lang="fr"><title>Exemple</title><p>Exemple</p></html>');
  });

  it('lève sur une clé absente', () => {
    expect(() => rendreGabarit('<p>{{site.absente}}</p>', dico)).toThrow(/Clé i18n introuvable : site\.absente/);
  });
});

describe('chargerDictionnaire', () => {
  it('lit <dossier>/<langue>.json', async () => {
    const dossier = await mkdtemp(path.join(tmpdir(), 'zurvela-i18n-'));
    try {
      await writeFile(path.join(dossier, 'ja.json'), JSON.stringify({ langue: 'ja', site: { nom: '例' } }), 'utf8');
      const charge = await chargerDictionnaire(dossier, 'ja');
      expect(chercher(charge, 'site.nom')).toBe('例');
      await expect(chargerDictionnaire(dossier, 'xx')).rejects.toThrow();
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });
});
