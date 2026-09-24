/**
 * La commande d'enregistrement du corpus : sa ligne de commande, et le fait
 * qu'un IMPORT ne la lance pas.
 *
 * Ce second point n'est pas décoratif : la commande appelle un modèle
 * payant, et un module qui s'exécuterait à l'import ferait dépenser un test.
 */
import { describe, expect, it } from 'vitest';
import { COMMANDE_ENREGISTREMENT_DIAGNOSTIC, lireOptions } from './enregistrer-diagnostic.js';

describe('pnpm banc:enregistrer-diagnostic — ligne de commande', () => {
  it('sans argument : tout le corpus', () => {
    expect(lireOptions([])).toEqual({ cas: [] });
  });

  it('accepte plusieurs `--cas`', () => {
    expect(lireOptions(['--cas', 'cas-01', '--cas', 'cas-05'])).toEqual({ cas: ['cas-01', 'cas-05'] });
  });

  it('refuse une option inconnue plutôt que de l’ignorer en silence', () => {
    expect(lireOptions(['--scenario', 'formulaire-contact--f01--fr'])).toBeNull();
  });

  it('publie le nom de la commande, pour que l’échec du corpus puisse la citer', () => {
    // Une absence nommée est une étape ; une absence anonyme est un mur.
    expect(COMMANDE_ENREGISTREMENT_DIAGNOSTIC).toContain('banc:enregistrer-diagnostic');
  });
});
