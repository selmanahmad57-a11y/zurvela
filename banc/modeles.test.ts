/**
 * TEST DE FORME des identifiants de modèle — APPRENTISSAGES n°5.
 *
 * `config/scanner.json` a porté `claude-haiku-4-5-20251001` pendant DEUX
 * briques entières. Cette forme datée existe bel et bien — c'est l'instantané
 * que le serveur SERT pour l'alias `claude-haiku-4-5` —, mais elle n'a rien à
 * faire en config : c'est l'alias qui entre dans la clé de cassette et doit
 * rester stable, l'instantané vivant dans `modeleServi`. Le banc était vert,
 * le typecheck aussi, et le schéma validait — il ne promet qu'une chaîne. Le
 * mode dégradé permanent protégeait le scan de l'absence d'IA et, ce faisant,
 * aveuglait la config : aucun chemin n'exécutait jamais cette valeur.
 *
 * La règle qui en découle : toute valeur de configuration qui ne s'active que
 * dans un mode futur porte un test de forme DÈS SA NAISSANCE. Celui-ci ne fait
 * AUCUN appel réseau — il n'en a pas besoin, et c'est tout l'intérêt : une
 * vérification qui coûte un euro ne tourne pas à chaque commit.
 *
 * Il vit dans le banc parce que le banc est l'instrument qui mesure, et qu'il
 * est le premier à dépendre de ces identifiants (clé de cassette, coût
 * enregistré). Le moteur porte le sien sur la même constante.
 */
import { describe, expect, it } from 'vitest';
import { FORMAT_IDENTIFIANT_MODELE } from '../core/ia/index.js';
import { chargerConfigScanner } from '../core/scanner/config.js';

describe('identifiants de modèle de config/scanner.json', () => {
  it('respecte tous le format attendu, sans le moindre appel réseau', async () => {
    const config = await chargerConfigScanner();
    const modeles = Object.entries(config.ia.modeles);

    // Le fichier doit vraiment déclarer des modèles : un objet vide passerait
    // la boucle suivante en silence, et le test ne garderait plus rien.
    expect(modeles.length).toBeGreaterThan(0);
    const malFormes = modeles.filter(([, identifiant]) => !FORMAT_IDENTIFIANT_MODELE.test(identifiant));
    expect(malFormes).toEqual([]);
  });

  it('le modèle de PROFILAGE — celui que les cassettes estampillent — est nommé et bien formé', async () => {
    const config = await chargerConfigScanner();
    // Il entre dans la clé de cassette : un identifiant faux ici ne casserait
    // rien visiblement, il ferait juste enregistrer et rejouer sous une clé
    // qui ne correspond à aucun modèle réel.
    expect(config.ia.modeles.profilage).toMatch(FORMAT_IDENTIFIANT_MODELE);
  });

  it('le modèle de NAVIGATION — celui qu’estampillent les cassettes de décision — est nommé et bien formé', async () => {
    const config = await chargerConfigScanner();
    // Même raison que le profilage, pour la brique 4b : l'alias de navigation
    // entre dans la clé d'une cassette PAR DÉCISION. Un identifiant faux ne
    // casserait rien visiblement — il ferait enregistrer et rejouer sous une
    // clé qui ne correspond à aucun modèle réel.
    expect(config.ia.modeles.navigation).toMatch(FORMAT_IDENTIFIANT_MODELE);
  });

  it('le format REFUSE une forme suffixée d’une date — le défaut réellement rencontré', () => {
    // La garde s'éprouve en construisant le cas qui la déclenche (METHODE §2) :
    // un motif qui accepterait tout serait vert sans rien garder.
    expect(FORMAT_IDENTIFIANT_MODELE.test('claude-haiku-4-5-20251001')).toBe(false);
    expect(FORMAT_IDENTIFIANT_MODELE.test('claude-opus-5-20260401')).toBe(false);
    expect(FORMAT_IDENTIFIANT_MODELE.test('')).toBe(false);
    expect(FORMAT_IDENTIFIANT_MODELE.test('gpt-4')).toBe(false);
    // Et il ACCEPTE les deux formes légitimes, alias court et alias à deux nombres.
    expect(FORMAT_IDENTIFIANT_MODELE.test('claude-opus-5')).toBe(true);
    expect(FORMAT_IDENTIFIANT_MODELE.test('claude-haiku-4-5')).toBe(true);
  });
});
