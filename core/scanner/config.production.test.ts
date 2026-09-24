/**
 * LES DEUX JEUX DE CONFIGURATION, ET CE QUI LES SÉPARE.
 *
 * `config/scanner.json` est l'INSTRUMENT : le banc le lit, et il est gelé pour
 * toute raison de production — le faire dériver rendrait incomparables toutes
 * les mesures passées. `config/production.json` est le moteur face au web réel,
 * et il naît vide de certitudes : chaque écart est une hypothèse datée que le
 * bestiaire confirmera ou corrigera.
 *
 * Deux fichiers séparés, c'est deux fichiers qui dérivent. Ces contrôles sont
 * le prix de la séparation :
 *  - les deux valident le MÊME schéma, donc une section ajoutée à l'un est
 *    exigée de l'autre ;
 *  - ils portent les MÊMES CLÉS, donc un réglage nouveau ne peut pas exister
 *    d'un seul côté par oubli ;
 *  - et les écarts sont ÉNUMÉRÉS ici. Un écart non listé fait échouer le test :
 *    la production ne diverge pas de l'instrument par accident, mais par une
 *    décision qu'on a écrite quelque part.
 */
import { describe, expect, it } from 'vitest';
import { chargerConfigScanner, FICHIER_CONFIG_PRODUCTION, FICHIER_CONFIG_SCANNER } from './config.js';

/** Chaque écart, et la raison qui l'autorise (docs/INVENTAIRE-PRODUCTION.md). */
const ECARTS_AUTORISES: Record<string, string> = {
  'exploration.chargementPageMs': 'B — étalonné contre 127.0.0.1',
  'exploration.attenteEffetMaxMs': 'B — étalonné contre 127.0.0.1',
  'exploration.clicMs': 'B — pages sans animation ni hydratation',
  'exploration.saisieMs': 'B — pages sans animation ni hydratation',
  'exploration.stabilisationMs': 'B — pages sans animation ni hydratation',
  'detecteurs.lenteur.seuilMs': 'B — le banc sert en 0 ms et injecte 5 s',
  'confirmation.rejeu.chargementPageMs': 'B — mêmes étalons, payés trois fois',
  'confirmation.rejeu.actionMs': 'B — mêmes étalons, payés trois fois',
  'confirmation.rejeu.budgetMinimalMs': 'B — mêmes étalons, payés trois fois',
  'interaction.soumission': 'A/D — chaque soumission réelle a une conséquence',
  'politesse.delaiEntrePagesMs': 'A — une rafale depuis une IP est un profil d’attaque',
  'budget.maxUsdParScan': 'A — aucun plafond de dépense n’existait',
};

/** Clés présentes d’un seul côté, et pourquoi c’est voulu. */
const ABSENCES_AUTORISEES: Record<string, string> = {
  'scan.timeoutMs': 'le banc impose le sien depuis config/banc.json : deux sources de vérité seraient une de trop',
};

function aplatir(valeur: unknown, prefixe = ''): Record<string, unknown> {
  const plat: Record<string, unknown> = {};
  for (const [cle, sousValeur] of Object.entries(valeur as Record<string, unknown>)) {
    if (cle.startsWith('$')) continue;
    const chemin = `${prefixe}${cle}`;
    if (sousValeur !== null && typeof sousValeur === 'object' && !Array.isArray(sousValeur)) {
      Object.assign(plat, aplatir(sousValeur, `${chemin}.`));
    } else {
      plat[chemin] = sousValeur;
    }
  }
  return plat;
}

describe('config/production.json face à config/scanner.json', () => {
  it('valide le même schéma que l’instrument', async () => {
    // Le contrôle qui rend les autres possibles : une section ajoutée d'un
    // côté devient obligatoire de l'autre, et le chargement échoue bruyamment.
    await expect(chargerConfigScanner(FICHIER_CONFIG_PRODUCTION)).resolves.toMatchObject({
      interaction: { soumission: 'aucune' },
      politesse: { delaiEntrePagesMs: 1000, respecterRobotsTxt: true },
      budget: { maxUsdParScan: 0.5 },
    });
  });

  it('l’INSTRUMENT ne porte AUCUN réglage de production : il dit la vérité sur lui-même', async () => {
    const banc = await chargerConfigScanner(FICHIER_CONFIG_SCANNER);
    // Le banc se sert lui-même en local : la politesse envers soi n'a pas de
    // sens, et le site servi nous appartient littéralement.
    expect(banc.politesse.delaiEntrePagesMs).toBe(0);
    expect(banc.interaction.soumission).toBe('site-possede');
    // Son coût est MESURÉ, jamais borné : un plafond fausserait la mesure.
    expect(banc.budget.maxUsdParScan).toBeNull();
    // Mais il respecte robots.txt comme la production : ainsi les 38 scénarios
    // exercent ce chemin, au lieu d'un seul gabarit dédié.
    expect(banc.politesse.respecterRobotsTxt).toBe(true);
  });

  it('les deux fichiers portent les MÊMES CLÉS, aux absences déclarées près', async () => {
    const [banc, production] = await Promise.all([
      chargerConfigScanner(FICHIER_CONFIG_SCANNER),
      chargerConfigScanner(FICHIER_CONFIG_PRODUCTION),
    ]);
    const clesBanc = new Set(Object.keys(aplatir(banc)));
    const clesProduction = new Set(Object.keys(aplatir(production)));
    const seulementProduction = [...clesProduction].filter((cle) => !clesBanc.has(cle));
    const seulementBanc = [...clesBanc].filter((cle) => !clesProduction.has(cle));
    expect(seulementProduction.filter((cle) => ABSENCES_AUTORISEES[cle] === undefined)).toEqual([]);
    expect(seulementBanc.filter((cle) => ABSENCES_AUTORISEES[cle] === undefined)).toEqual([]);
  });

  it('AUCUN écart qui ne soit écrit quelque part : la production ne diverge pas par accident', async () => {
    const [banc, production] = await Promise.all([
      chargerConfigScanner(FICHIER_CONFIG_SCANNER),
      chargerConfigScanner(FICHIER_CONFIG_PRODUCTION),
    ]);
    const platBanc = aplatir(banc);
    const platProduction = aplatir(production);
    const ecarts = Object.keys(platBanc).filter(
      (cle) => cle in platProduction && JSON.stringify(platBanc[cle]) !== JSON.stringify(platProduction[cle]),
    );
    expect(ecarts.filter((cle) => ECARTS_AUTORISES[cle] === undefined)).toEqual([]);
  });

  it('la liste des écarts n’a AUCUNE ligne morte : un écart supprimé doit quitter la liste', async () => {
    // Une liste blanche non confrontée à son objet pourrit (APPRENTISSAGES n°13).
    const [banc, production] = await Promise.all([
      chargerConfigScanner(FICHIER_CONFIG_SCANNER),
      chargerConfigScanner(FICHIER_CONFIG_PRODUCTION),
    ]);
    const platBanc = aplatir(banc);
    const platProduction = aplatir(production);
    const inutiles = Object.keys(ECARTS_AUTORISES).filter(
      (cle) => JSON.stringify(platBanc[cle]) === JSON.stringify(platProduction[cle]),
    );
    expect(inutiles).toEqual([]);
  });
});
