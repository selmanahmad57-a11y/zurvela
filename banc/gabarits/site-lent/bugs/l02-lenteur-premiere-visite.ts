/**
 * L02 lenteur-premiere-visite : chaque page du site répond après
 * `delaiPageMs`, et la PREMIÈRE visite de `PAGE_LENTE` après
 * `delaiPremiereVisiteMs` — au-delà du seuil de lenteur ; les visites
 * suivantes reviennent au retard commun. Déterministe (compteur par
 * scénario), aucun aléa.
 *
 * Deux choses sont éprouvées à la fois. (1) L'ÉCHÉANCE (contrat 2) : à
 * `delaiPageMs` par page, l'exploration ne finit pas dans sa part ; elle doit
 * rendre la main (`reserve-confirmation`) et laisser au protocole de quoi
 * rejouer — sans la réserve, la confirmation tombait à l'échéance et la
 * lenteur restait « non vérifiée ». (2) LA MESURE AU REJEU (contrat 4) : le
 * rejeu recharge la page lente, désormais rapide, et MESURE cette rapidité
 * au lieu d'écarter par absence de mesure (C-04) — verdict attendu
 * `non-reproduite`, par re-mesure.
 */
import type { BugInjectable } from '../../../types.js';
import { PAGE_LENTE } from '../structure.js';

function lireEntier(parametres: Record<string, unknown>, nom: string, minimum: number): number {
  const valeur = parametres[nom];
  if (typeof valeur !== 'number' || !Number.isInteger(valeur) || valeur < minimum) {
    throw new Error(`L02 : le paramètre ${nom} doit être un entier ≥ ${minimum} (reçu : ${String(valeur)})`);
  }
  return valeur;
}

function lireParametres(parametres: Record<string, unknown>): { delaiPageMs: number; delaiPremiereVisiteMs: number } {
  return {
    delaiPageMs: lireEntier(parametres, 'delaiPageMs', 0),
    delaiPremiereVisiteMs: lireEntier(parametres, 'delaiPremiereVisiteMs', 0),
  };
}

const CLE_VISITES = 'l02.visitesPageLente';

export const L02: BugInjectable = {
  id: 'L02',
  nom: 'lenteur-premiere-visite',
  categorie: 'performance',
  gravite: 'important',
  pages: [PAGE_LENTE],
  verdictAttendu: 'non-reproduite',
  validerParametres(parametres) {
    lireParametres(parametres);
  },
  async retarderPage(chemin, contexte) {
    const { delaiPageMs, delaiPremiereVisiteMs } = lireParametres(contexte.parametres);
    if (chemin === PAGE_LENTE) {
      const visites = Number(contexte.etat[CLE_VISITES] ?? 0) + 1;
      contexte.etat[CLE_VISITES] = visites;
      if (visites === 1) {
        await contexte.attendre(delaiPremiereVisiteMs);
        return;
      }
    }
    await contexte.attendre(delaiPageMs);
  },
};
