import { describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../scanner/config.js';
import { VERSION } from '../../prompts/navigation/v2.js';
import { construirePromptNavigation } from '../../prompts/navigation/v2.js';
import { actionDe, etatDeTest } from './aide-tests-decision.js';
import { chargerConfigNavigation } from './config-navigation.js';
import {
  cleCassetteDecision,
  empreinteContratNavigation,
  identifiantsEnumeres,
  normaliserEtatDecision,
} from './index.js';

const configScanner = await chargerConfigScanner();
const config = await chargerConfigNavigation(configScanner.exploration);
const MODELE = configScanner.ia.modeles.navigation;
const EMPREINTE = empreinteContratNavigation(config);

function cle(etat = etatDeTest(), reglages = config): string {
  return cleCassetteDecision({
    versionPrompt: VERSION,
    empreinteContrat: empreinteContratNavigation(reglages),
    modele: MODELE,
    etat: normaliserEtatDecision(etat, reglages),
  });
}

describe('normaliserEtatDecision', () => {
  it('range les actions par identifiant, quel que soit l’ordre reçu', () => {
    const ordre = etatDeTest({
      actions: [actionDe('c3', '/commande', 'Commander'), actionDe('c1', '/a', 'A'), actionDe('c2', '/b', 'B')],
    });
    expect(identifiantsEnumeres(normaliserEtatDecision(ordre, config))).toEqual(['c1', 'c2', 'c3']);
  });

  it('range les repères par clé : l’ordre d’écriture d’un objet ne doit rien décider', () => {
    const etat = normaliserEtatDecision(
      etatDeTest({ actions: [actionDe('c1', '/a', 'A', { zone: 'pied', titre: 'T' })] }),
      config,
    );
    expect(etat.actions[0]?.reperes.map(([cle]) => cle)).toEqual(['balise', 'chemin', 'titre', 'zone']);
  });

  it('ne transporte JAMAIS l’action réelle : le modèle élit, il ne désigne pas', () => {
    const etat = normaliserEtatDecision(etatDeTest(), config);
    expect(JSON.stringify(etat)).not.toContain('boutique.invalid');
  });

  it('tronque les libellés et garde les dernières actions de l’historique', () => {
    const historique = Array.from({ length: config.historiqueMaxActions + 3 }, (_, index) => ({
      type: 'naviguer' as const,
      page: `/p${index}`,
    }));
    const etat = normaliserEtatDecision(
      etatDeTest({ actions: [actionDe('c1', '/a', 'x'.repeat(config.libelleMaxChars + 50))], historique }),
      config,
    );
    expect(etat.actions[0]?.libelle).toHaveLength(config.libelleMaxChars);
    expect(etat.historique).toHaveLength(config.historiqueMaxActions);
    expect(etat.historique[0]?.page).toBe('/p3');
  });

  /**
   * `slice(-0)` vaut `slice(0)`, c'est-à-dire le tableau ENTIER : un réglage à
   * zéro aurait montré tout l'historique au lieu de rien. Le schéma autorise
   * zéro, la borne doit le respecter.
   */
  it('un historiqueMaxActions à zéro ne montre RIEN (et non pas tout)', () => {
    const etat = normaliserEtatDecision(etatDeTest(), { ...config, historiqueMaxActions: 0 });
    expect(etat.historique).toEqual([]);
  });

  /**
   * Un port est une propriété de l'hôte, pas du site : le banc démarre son
   * serveur sur le premier port libre, et une clé sensible au port ne
   * retrouverait aucune cassette du parc committé.
   */
  it('efface le port des URL, s’il y en a', () => {
    const etat = normaliserEtatDecision(etatDeTest({ page: 'http://127.0.0.1:47533/catalogue' }), config);
    expect(etat.page).toBe('http://127.0.0.1/catalogue');
  });
});

describe('cleCassetteDecision — stabilité et sensibilité', () => {
  it('est stable pour un même état', () => {
    expect(cle()).toBe(cle());
  });

  /**
   * L'exigence du cahier : les pages du banc sont déterministes, mais l'ORDRE
   * dans lequel l'énumérateur produit ses actions ne l'est pas nécessairement.
   * Un état équivalent construit autrement doit donner la MÊME clé — sans quoi
   * un run normal manquerait sa cassette et accuserait l'enregistrement.
   */
  it('est stable quand l’état est équivalent mais construit dans un autre ordre', () => {
    const reference = etatDeTest();
    const autrement = etatDeTest({
      actions: [...reference.actions].reverse().map((action) => ({
        ...action,
        // Mêmes repères, écrits dans l'ordre inverse.
        reperes: Object.fromEntries(Object.entries(action.reperes).reverse()),
      })),
    });
    expect(cle(autrement)).toBe(cle(reference));
  });

  it('CHANGE quand l’énumération change', () => {
    const reference = etatDeTest();
    const uneDeMoins = etatDeTest({ actions: reference.actions.slice(0, 2) });
    const identifiantAutre = etatDeTest({
      actions: [actionDe('c1', '/catalogue?page=2', 'Page suivante'), actionDe('c2', '/produit/12', 'Théière en fonte'), actionDe('c4', '/commande', 'Passer commande')],
    });
    const libelleAutre = etatDeTest({
      actions: [actionDe('c1', '/catalogue?page=2', 'Page suivante'), actionDe('c2', '/produit/12', 'Théière en fonte'), actionDe('c3', '/commande', 'Commander maintenant')],
    });

    expect(cle(uneDeMoins)).not.toBe(cle(reference));
    expect(cle(identifiantAutre)).not.toBe(cle(reference));
    expect(cle(libelleAutre)).not.toBe(cle(reference));
  });

  it('CHANGE quand le profil, le budget ou l’historique changent — tout ce que le modèle voit', () => {
    const reference = cle();
    expect(cle(etatDeTest({ profil: null }))).not.toBe(reference);
    expect(cle(etatDeTest({ pagesRestantes: 1 }))).not.toBe(reference);
    expect(cle(etatDeTest({ historique: [] }))).not.toBe(reference);
    expect(cle(etatDeTest({ viewport: 'mobile' }))).not.toBe(reference);
  });

  it('CHANGE quand un réglage qui compose le prompt change', () => {
    expect(cle(etatDeTest(), { ...config, historiqueMaxActions: 1 })).not.toBe(cle());
    expect(cle(etatDeTest(), { ...config, maxTokensReponse: config.maxTokensReponse + 1 })).not.toBe(cle());
  });

  /**
   * `relancesMax` ne compose ni le prompt ni l'appel : l'inclure périmerait
   * tout le parc au premier réglage d'une tolérance — une invalidation
   * gratuite à la place d'un mensonge silencieux.
   */
  it('ne change PAS quand on règle une tolérance qui n’entre pas dans le prompt', () => {
    expect(cle(etatDeTest(), { ...config, relancesMax: config.relancesMax + 3 })).toBe(cle());
  });

  it('CHANGE avec la version de prompt et avec l’alias de modèle', () => {
    const etat = normaliserEtatDecision(etatDeTest(), config);
    const base = { empreinteContrat: EMPREINTE, modele: MODELE, etat };
    expect(cleCassetteDecision({ ...base, versionPrompt: 'v99-inexistante' })).not.toBe(
      cleCassetteDecision({ ...base, versionPrompt: VERSION }),
    );
    expect(cleCassetteDecision({ ...base, versionPrompt: VERSION, modele: 'claude-opus-5' })).not.toBe(
      cleCassetteDecision({ ...base, versionPrompt: VERSION }),
    );
  });

  /**
   * Le lien entre la clé et le prompt : deux états de même clé doivent
   * produire le même prompt, caractère pour caractère. Sans cette propriété,
   * une cassette pourrait être rejouée sur un prompt voisin — la bonne réponse
   * du mauvais prompt.
   */
  it('même clé ⟹ même prompt, caractère pour caractère', () => {
    const reference = etatDeTest();
    const autrement = etatDeTest({ actions: [...reference.actions].reverse() });
    expect(cle(autrement)).toBe(cle(reference));
    expect(construirePromptNavigation(normaliserEtatDecision(autrement, config), config)).toEqual(
      construirePromptNavigation(normaliserEtatDecision(reference, config), config),
    );
  });
});
