/**
 * ÉNUMÉRATION des actions possibles à un point de décision (cahier 4b §1).
 *
 * RÈGLE CENTRALE : le moteur énumère, le modèle élit. Chaque acte possible
 * reçoit ici un identifiant OPAQUE attribué par le moteur (`c1`, `c2`…) ;
 * c'est le seul mot que le modèle a le droit de prononcer. Il ne reçoit ni
 * sélecteur, ni URL absolue, ni texte d'action : des repères techniques et
 * un libellé tronqué, rien d'autre. Il n'a donc physiquement pas les moyens
 * d'inventer un acte — seulement d'en élire un que le moteur a déjà jugé
 * légitime. C'est la PREMIÈRE couche de sécurité, avant le menu fermé et
 * avant le filtre d'actions destructives (voir `couches.ts`).
 *
 * L'ordre d'énumération est celui de la PRIORITÉ DÉTERMINISTE (remplir,
 * soumettre, naviguer, terminer) : la décision gratuite est donc toujours la
 * première proposition de la liste. Ce n'est pas une coïncidence qu'on
 * exploite en silence — `enumeration.test.ts` en fait un invariant testé, et
 * c'est lui qui rend comparables les deux politiques sur le même état.
 *
 * Tout ce qui vient de la page (les libellés) est une DONNÉE NON FIABLE
 * (constitution §3) : transportée, aplatie sur une ligne et tronquée, jamais
 * interprétée, jamais exécutée. C'est par elle que la page parle au modèle :
 * c'est la surface d'injection première de cette brique.
 */
import type { Action, ActionProposee, ContexteDecision, DescriptionFormulaire, EtatDecisionEnumere, ProfilSiteRapporte, TypeAction } from '../../types.js';
import type { ConfigScanner } from '../config.js';
import { RAISON_PLUS_RIEN } from './politique.js';
import { choisirValeurs, signatureFormulaire } from './remplissage.js';

/** Préfixe des identifiants opaques. Leur seule propriété utile : le moteur seul les attribue. */
export const PREFIXE_ACTION_PROPOSEE = 'c';

/**
 * Jeton technique qui remplace une destination hors origine. Le modèle
 * n'apprend jamais un hôte : ni le sien, ni un autre.
 */
export const CHEMIN_EXTERNE = 'externe';

/**
 * Séparateurs de ligne, aplatis dans les libellés. Même raison qu'au
 * profilage : le bloc de données du prompt est une structure LIGNE À LIGNE,
 * et un libellé qui ouvre une ligne fabriquerait une ligne que la page ne
 * possède pas. On borne la FORME, on ne censure aucun contenu.
 */
const SEPARATEURS_DE_LIGNE = /[\r\n\u2028\u2029]+/g;

/**
 * CHEMIN d'une URL du site (chemin + requête), ou `CHEMIN_EXTERNE` si elle
 * sort de l'origine ou n'est pas analysable. Jamais d'URL absolue : un hôte
 * transmis au modèle serait un acte qu'il pourrait désigner.
 */
export function cheminDe(url: string, origine: string): string {
  let analysee: URL;
  try {
    analysee = new URL(url);
  } catch {
    return CHEMIN_EXTERNE;
  }
  return analysee.origin === origine ? `${analysee.pathname}${analysee.search}` : CHEMIN_EXTERNE;
}

/** Libellé de page borné : aplati sur une ligne, puis tronqué à `maxChars`. Vide → `null`. */
export function libelleBorne(libelle: string | undefined, maxChars: number): string | null {
  if (libelle === undefined) {
    return null;
  }
  const plat = libelle.replace(SEPARATEURS_DE_LIGNE, ' ').trim();
  if (plat === '') {
    return null;
  }
  return plat.slice(0, Math.max(0, maxChars));
}

export interface OptionsEnumeration {
  remplissage: ConfigScanner['remplissage'];
  /** Troncature des libellés montrés au modèle (`exploration.libelleMaxChars`). */
  libelleMaxChars: number;
  /** Origine du site scanné : sert à ne montrer que des chemins. */
  origine: string;
  /** Libellés visibles des liens, par URL normalisée. CONTENU DE PAGE, donc donnée non fiable. */
  libelles: ReadonlyMap<string, string>;
  /**
   * Ce que le robot a le droit de FAIRE sur ce site (`interaction.soumission`).
   *
   * En mode `aucune`, l'action de soumettre n'est PAS ÉNUMÉRÉE : elle n'existe
   * pas, donc aucune couche en aval n'a à la refuser, et le modèle ne peut pas
   * la choisir puisqu'elle ne lui est jamais montrée. C'est une première
   * couche, pas un filtre après coup — la différence compte, parce qu'un filtre
   * après coup laisse toujours la question « et si quelque chose le
   * contournait ».
   *
   * Ce que cela protège : sur un site réel, chaque soumission a une
   * conséquence — un email au propriétaire, une entrée en base, une tentative
   * de connexion échouée qui verrouille un compte. Le mode par défaut de la
   * production est donc `aucune`, et `site-possede` est une DÉCLARATION de
   * propriété, pas une option de confort.
   */
  soumission: ConfigScanner['interaction']['soumission'];
}

/** Repères techniques d'un formulaire : des comptes et des jetons HTML, jamais un sélecteur. */
function reperesFormulaire(formulaire: DescriptionFormulaire, origine: string): Record<string, string> {
  return {
    balise: formulaire.localisation.balise,
    methode: formulaire.methode,
    cible: cheminDe(formulaire.action, origine),
    champs: String(formulaire.champs.length),
    champsRequis: String(formulaire.champs.filter((champ) => champ.requis).length),
  };
}

/**
 * Énumère les actes possibles au point de décision décrit par `contexte`.
 *
 * L'ordre est celui de la priorité déterministe. `terminer` est TOUJOURS
 * énuméré, en dernier : une politique doit toujours pouvoir s'arrêter, et le
 * moteur doit toujours avoir une action légitime de repli.
 */
export function enumererActions(contexte: ContexteDecision, options: OptionsEnumeration): ActionProposee[] {
  const { pageCourante, formulairesRemplis, formulairesSoumis, urlsEnAttente } = contexte;
  const { remplissage, libelleMaxChars, origine, libelles, soumission } = options;
  const proposees: ActionProposee[] = [];
  const ajouter = (type: TypeAction, action: Action, reperes: Record<string, string>, libelle: string | null): void => {
    proposees.push({ id: `${PREFIXE_ACTION_PROPOSEE}${proposees.length + 1}`, type, action, reperes, libelle });
  };

  // LE MENU N'ÉNUMÈRE QUE CE QUI SE REMPLIT (cahier P2-1, contrat 3). Un
  // formulaire sans champ remplissable — un bouton seul, la construction
  // standard d'une carte produit — n'a pas d'action `remplir` : c'est le web,
  // pas le monde. Et vingt formulaires identiques (même méthode, même cible,
  // mêmes champs) sur une page ne valent qu'une action : books.toscrape a coûté
  // 237 remplissages vides et toute l'échéance à la campagne 6b (C-10).
  const signaturesVues = new Set<string>();
  for (const formulaire of pageCourante.formulaires) {
    if (formulairesRemplis.includes(formulaire.localisation.selecteur)) {
      continue;
    }
    const valeurs = choisirValeurs(formulaire, remplissage);
    if (valeurs.length === 0) {
      continue;
    }
    const signature = signatureFormulaire(formulaire);
    if (signaturesVues.has(signature)) {
      continue;
    }
    signaturesVues.add(signature);
    const action: Action = { type: 'remplir', formulaire: formulaire.localisation, valeurs };
    ajouter('remplir', action, reperesFormulaire(formulaire, origine), null);
  }
  for (const formulaire of soumission === 'aucune' ? [] : pageCourante.formulaires) {
    if (!formulairesSoumis.includes(formulaire.localisation.selecteur)) {
      const action: Action = { type: 'soumettre', formulaire: formulaire.localisation, declencheur: formulaire.declencheur };
      const reperes = {
        ...reperesFormulaire(formulaire, origine),
        declencheur: formulaire.declencheur?.balise ?? '',
      };
      ajouter('soumettre', action, reperes, null);
    }
  }
  for (const url of urlsEnAttente) {
    ajouter('naviguer', { type: 'naviguer', url }, { chemin: cheminDe(url, origine) }, libelleBorne(libelles.get(url), libelleMaxChars));
  }
  ajouter('terminer', { type: 'terminer', raison: RAISON_PLUS_RIEN }, {}, null);
  return proposees;
}

export interface EntreeEtatEnumere {
  /** URL courante ; elle est réduite à son CHEMIN avant d'entrer dans l'état. */
  url: string;
  origine: string;
  viewport: string;
  profil: ProfilSiteRapporte | null;
  actions: ActionProposee[];
  /** Historique complet des actions du viewport ; il est tronqué ici aux plus récentes. */
  historique: { type: TypeAction; page: string }[];
  historiqueMaxActions: number;
  nbPagesVisitees: number;
  pagesRestantes: number;
}

/**
 * Compose l'état énuméré remis à la politique. Le profil y entre comme
 * DONNÉE NON FIABLE bien qu'il sorte de notre propre IA : une sortie de
 * modèle reste du contenu dérivé de la page — la chaîne de méfiance ne se
 * rompt pas parce qu'on s'est parlé à soi-même (cahier 4b, note 2).
 */
export function composerEtat(entree: EntreeEtatEnumere): EtatDecisionEnumere {
  const debut = Math.max(0, entree.historique.length - Math.max(0, entree.historiqueMaxActions));
  return {
    page: cheminDe(entree.url, entree.origine),
    viewport: entree.viewport,
    profil: entree.profil,
    actions: entree.actions,
    historique: entree.historique.slice(debut),
    nbPagesVisitees: entree.nbPagesVisitees,
    pagesRestantes: Math.max(0, entree.pagesRestantes),
  };
}
