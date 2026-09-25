/**
 * LA VOIX DE LA MARQUE — toutes les phrases que le PRODUIT adresse à un
 * humain, et elles vivent en code.
 *
 * ── LE RÉGIME DE CE FICHIER : TEXTES À GARANTIE SÉMANTIQUE ──────────────────
 *
 * C'est la TROISIÈME catégorie de la constitution §2, et l'unique exception au
 * Mur 1 (`core/mur-1.test.ts` la nomme et la commente). Elle n'est ni de la
 * prose utilitaire — qui vit en `locales/` —, ni un réglage — qui vit en
 * `config/`. Ces phrases ÉNONCENT une propriété que le moteur doit tenir :
 * « Constaté, puis reproduit lors de nos N vérifications indépendantes » n'est
 * pas une traduction, c'est une promesse.
 *
 * Son régime est celui des prompts, pas celui des locales :
 *  - par-langue, comme les locales ;
 *  - mais en CODE TYPÉ, la complétude imposée par `tsc` — toute langue × tout
 *    statut, sans trou possible. `voix.exhaustivite.test.ts` en est le jumeau
 *    d'exécution : il attrape l'entrée présente mais VIDE, qu'un type ne voit
 *    pas, et la table recopiée d'une langue à l'autre ;
 *  - modifiable sous REVUE seulement. Déplacée dans un fichier éditable, la
 *    frontière entre « détecté pendant la vérification, non re-testé » et
 *    « constaté et re-vérifié » se franchirait sans trace — et une formulation
 *    qui promet plus que son statut détruit le différenciateur n°1 sans
 *    qu'aucun test ne rougisse. Ici, elle se franchit dans un diff, et un test
 *    verrouille chaque phrase mot pour mot.
 *
 * ── LES LANGUES SONT UNE LISTE CLOSE, ET C'EST UNE PROMESSE AUSSI ───────────
 *
 * `LANGUES_RAPPORT` n'énumère pas ce que le modèle sait écrire — il sait en
 * écrire cent — mais les langues dont NOUS avons vérifié les formulations de
 * statut. Une langue absente de cette liste est refusée au chargement de la
 * configuration : servir un statut français à un lecteur anglophone, ou une
 * traduction que personne n'a relue, reviendrait à publier une promesse dont
 * on ne connaît pas la teneur.
 *
 * ── LE PLURIEL N'EST PAS FACTORISÉ, DÉLIBÉRÉMENT ────────────────────────────
 *
 * Chaque langue écrit ses propres phrases, avec sa propre morphologie. Une
 * fonction de pluralisation partagée serait une règle de langue naturelle
 * écrite en code (constitution §2) — juste pour deux langues, fausse dès la
 * troisième.
 */
import type { Categorie, Gravite, StatutSection } from '../types.js';
import type { ChiffresStatut } from './statuts.js';

/** Les langues dont les formulations ont été vérifiées. SEULE source de cette liste. */
export const LANGUES_RAPPORT = ['fr', 'en'] as const;

export type LangueRapport = (typeof LANGUES_RAPPORT)[number];

export function estLangueRapport(langue: string): langue is LangueRapport {
  return (LANGUES_RAPPORT as readonly string[]).includes(langue);
}

/**
 * Formulation d'un statut, par langue.
 *
 * Écrite en `Record<StatutSection, Record<LangueRapport, …>>` : un cinquième
 * statut, ou une troisième langue, casse la compilation ICI — à l'endroit où
 * il faut écrire sa phrase, et non en produisant en silence un rapport qui
 * affiche une clé technique à un commerçant.
 *
 * Les fonctions reçoivent les CHIFFRES du protocole et les écrivent telles
 * quelles. Aucune n'arrondit, n'estime ni ne complète : ce sont les comptes
 * du rapport technique, et c'est tout ce que la phrase a le droit de dire.
 */
export const FORMULATIONS: Readonly<
  Record<StatutSection, Readonly<Record<LangueRapport, (chiffres: ChiffresStatut) => string>>>
> = {
  /**
   * DEUX phrases pour un seul statut, et c'est une correction d'honnêteté, pas
   * une élégance. Un groupe peut être `confirmee` SANS aucune re-exécution —
   * politique économe, confiance suffisante — et « re-vérifié 0 fois » aurait
   * été une affirmation fausse écrite par le code lui-même, au cœur de la
   * brique qui interdit au modèle d'en écrire une.
   *
   * LES DEUX NOMBRES, et pas un seul. C'est la correction d'une correction :
   * une première version n'annonçait que les TENTATIVES, ce qui aurait
   * sur-promis avec `confirmation.tauxReproduction` abaissé ; la deuxième
   * n'annonçait que les REPRODUCTIONS, ce qui effaçait le dénominateur —
   * « reproduit lors d'une vérification indépendante » disait la même chose
   * d'un groupe reproduit 1 fois sur 1 et d'un groupe reproduit 1 fois sur 2.
   * Le client ne pouvait plus distinguer « toutes nos vérifications l'ont
   * retrouvé » de « la moitié ». Et la branche à zéro décidait « nous ne
   * l'avons pas rejoué » sur le compte des REPRODUCTIONS, donc l'affirmait
   * à tort d'un groupe rejoué deux fois sans succès.
   *
   * La formulation décide désormais sur `nbVerifications` — « l'avons-nous
   * rejoué ? » — et publie le rapport des deux dès qu'ils diffèrent. Elle est
   * vraie quelle que soit la valeur de `tauxReproduction` : une formulation de
   * la voix de la marque ne doit pas devenir fausse quand quelqu'un change un
   * seuil de configuration (constitution §2).
   */
  confirmee: {
    fr: ({ nbVerifications, nbReproductions }) =>
      nbVerifications === 0
        ? 'Constaté pendant le scan ; nous ne l’avons pas rejoué.'
        : nbReproductions < nbVerifications
          ? `Constaté, puis reproduit lors de ${nbReproductions} de nos ${nbVerifications} vérifications indépendantes.`
          : nbVerifications === 1
            ? 'Constaté, puis reproduit lors d’une vérification indépendante.'
            : `Constaté, puis reproduit lors de nos ${nbVerifications} vérifications indépendantes.`,
    en: ({ nbVerifications, nbReproductions }) =>
      nbVerifications === 0
        ? 'Observed during the scan; we did not replay it.'
        : nbReproductions < nbVerifications
          ? `Observed, then reproduced in ${nbReproductions} of our ${nbVerifications} independent re-checks.`
          : nbVerifications === 1
            ? 'Observed, then reproduced in one independent re-check.'
            : `Observed, then reproduced in each of our ${nbVerifications} independent re-checks.`,
  },
  intermittente: {
    fr: ({ nbReproductions, nbVerifications }) =>
      nbReproductions === 1
        ? `Se produit par intermittence : reproduit une fois sur ${nbVerifications} vérifications.`
        : `Se produit par intermittence : reproduit ${nbReproductions} fois sur ${nbVerifications} vérifications.`,
    en: ({ nbReproductions, nbVerifications }) =>
      nbReproductions === 1
        ? `Happens intermittently: reproduced once out of ${nbVerifications} re-checks.`
        : `Happens intermittently: reproduced ${nbReproductions} times out of ${nbVerifications} re-checks.`,
  },
  'constatee-au-rejeu': {
    fr: () => 'Détecté pendant nos vérifications ; non re-testé.',
    en: () => 'Detected during our verification pass; not re-tested.',
  },
  'diagnostic-site': {
    fr: () =>
      'Constaté une fois ; nos vérifications n’ont pas pu le reproduire. Notre analyse suspecte une cause côté site — non re-confirmé.',
    en: () =>
      'Observed once; our re-checks could not reproduce it. Our analysis suspects a cause on the site side — not re-confirmed.',
  },
};

/** La formulation du statut, dans la langue du rapport. Jamais rédigée librement. */
export function formulerStatut(statut: StatutSection, langue: LangueRapport, chiffres: ChiffresStatut): string {
  return FORMULATIONS[statut][langue](chiffres);
}

/**
 * Libellés de CATÉGORIE. Le rapport transporte la valeur de code
 * (`Categorie`) ; c'est le rendu qui la met en mots — un rapport doit rester
 * machinable, et un libellé n'est pas une donnée.
 */
export const LIBELLES_CATEGORIE: Readonly<Record<Categorie, Readonly<Record<LangueRapport, string>>>> = {
  fonctionnel: { fr: 'Fonctionnement', en: 'Functionality' },
  performance: { fr: 'Performance', en: 'Performance' },
  accessibilite: { fr: 'Accessibilité', en: 'Accessibility' },
  seo: { fr: 'Référencement', en: 'Search visibility' },
  securite: { fr: 'Sécurité', en: 'Security' },
  visuel: { fr: 'Affichage', en: 'Display' },
  mobile: { fr: 'Mobile', en: 'Mobile' },
};

/** Libellés de GRAVITÉ, même principe. */
export const LIBELLES_GRAVITE: Readonly<Record<Gravite, Readonly<Record<LangueRapport, string>>>> = {
  bloquant: { fr: 'Bloquant', en: 'Blocking' },
  important: { fr: 'Important', en: 'Important' },
  mineur: { fr: 'Mineur', en: 'Minor' },
};

/**
 * Les en-têtes du rendu, et LA LIGNE DE MÉTHODE STRUCTURELLE.
 *
 * Cette dernière porte le chiffre des signalements écartés. Elle est écrite en
 * CODE et non par le modèle, pour la raison qui fonde toute la brique : le
 * modèle n'a pas le droit d'écrire un chiffre. Sa phrase de méthode à lui
 * explique la démarche ; le NOMBRE, lui, vient de la structure et se pose à
 * côté d'elle.
 */
export const LIBELLES_RAPPORT: Readonly<
  Record<
    LangueRapport,
    {
      titre: string;
      sansAnomalie: string;
      pagesConcernees: string;
      constat: string;
      impact: string;
      action: string;
      methode: string;
      statut: string;
      gravite: string;
      sansProse: string;
      /**
       * Le rapport est PARTIEL : une partie de ses sections n'a pas pu être
       * rédigée. Le taire laisserait le lecteur devant des constats muets sans
       * pouvoir distinguer « nous n'avons rien à en dire » de « la rédaction
       * s'est arrêtée là ». La phrase dit aussi que la synthèse n'a pas vu ces
       * sections-là : elle est rédigée sur ce que la rédaction a reçu.
       */
      partiellementRedige: (nbMuettes: number, nbSections: number) => string;
      /** Marque, sur la section elle-même, celle que la rédaction n'a pas couverte. */
      sectionNonRedigee: string;
      /**
       * Ce que le scan n'a PAS essayé : aucun formulaire n'a été soumis. Le
       * taire laisserait lire « aucune anomalie » comme « votre formulaire
       * fonctionne », alors que personne ne l'a essayé.
       */
      soumissionsNonTestees: string;
      methodeIndisponible: string;
      ligneEcartes: (nbEcartes: number) => string;
      ligneNonVerifies: (nbNonVerifies: number) => string;
    }
  >
> = {
  fr: {
    titre: 'Rapport de vérification',
    sansAnomalie: 'Aucune anomalie n’a été retenue à l’issue de nos vérifications.',
    pagesConcernees: 'Pages concernées',
    constat: 'Ce que nous avons constaté',
    impact: 'Conséquence',
    action: 'Ce qu’il faut faire corriger',
    methode: 'Notre méthode',
    statut: 'Statut',
    gravite: 'Gravité',
    sansProse:
      'Ce rapport est présenté sous sa forme structurée : la rédaction n’a pas pu être produite. Les constats, leurs statuts et leurs localisations sont complets.',
    sectionNonRedigee: 'Ce constat n’a pas été rédigé : les faits ci-dessus sont complets, l’explication manque.',
    soumissionsNonTestees:
      'Nous n’avons envoyé aucun formulaire de ce site : nos robots consultent vos pages sans rien y soumettre. Ce qui ne se constate qu’en envoyant un message — la réception d’une demande, la confirmation affichée — n’a donc pas été vérifié.',
    partiellementRedige: (nbMuettes, nbSections) =>
      nbMuettes === 1
        ? `Sur les ${nbSections} constats de ce rapport, 1 n’a pas été rédigé : il est signalé ci-dessous et présenté sous sa forme structurée, et la synthèse ci-dessus ne le prend pas en compte.`
        : `Sur les ${nbSections} constats de ce rapport, ${nbMuettes} n’ont pas été rédigés : ils sont signalés ci-dessous et présentés sous leur forme structurée, et la synthèse ci-dessus ne les prend pas en compte.`,
    /**
     * Quand la confirmation n'a pas consolidé, il n'existe aucun compte de
     * signalements écartés PAR DES RE-VÉRIFICATIONS. On le dit, plutôt que de
     * publier un nombre de candidates sous une phrase qui parle de rejeux.
     */
    methodeIndisponible:
      'Nos re-vérifications n’ont pas pu être menées à leur terme sur ce scan : nous ne pouvons pas dire combien de signalements ont été écartés.',
    ligneEcartes: (nbEcartes) =>
      nbEcartes === 0
        ? 'Aucun signalement n’a été écarté par nos re-vérifications.'
        : nbEcartes === 1
          ? '1 signalement a été écarté par nos re-vérifications.'
          : `${nbEcartes} signalements ont été écartés par nos re-vérifications.`,
    /**
     * Le pendant honnête de la ligne ci-dessus. Le protocole écarte aussi des
     * signalements qu'il n'a pas pu éprouver — échéance atteinte, rejeu
     * impossible. Les compter avec les autres ferait dire au rapport que nos
     * re-vérifications ont tranché ce qu'elles n'ont jamais examiné ; les
     * taire ferait croire que tout ce qui a été vu a été jugé.
     */
    ligneNonVerifies: (nbNonVerifies) =>
      nbNonVerifies === 1
        ? '1 autre signalement n’a pas pu être re-vérifié et ne figure pas dans ce rapport.'
        : `${nbNonVerifies} autres signalements n’ont pas pu être re-vérifiés et ne figurent pas dans ce rapport.`,
  },
  en: {
    titre: 'Verification report',
    sansAnomalie: 'No issue was retained after our verification pass.',
    pagesConcernees: 'Pages affected',
    constat: 'What we observed',
    impact: 'Consequence',
    action: 'What to have fixed',
    methode: 'Our method',
    statut: 'Status',
    gravite: 'Severity',
    sansProse:
      'This report is shown in its structured form: the written narrative could not be produced. The findings, their statuses and their locations are complete.',
    sectionNonRedigee: 'This finding was not written up: the facts above are complete, the explanation is missing.',
    soumissionsNonTestees:
      'We did not send any of this site’s forms: our robots read your pages without submitting anything. Whatever can only be observed by sending a message — a request being received, a confirmation being shown — was therefore not checked.',
    partiellementRedige: (nbMuettes, nbSections) =>
      nbMuettes === 1
        ? `Of the ${nbSections} findings in this report, 1 was not written up: it is flagged below and shown in its structured form, and the summary above does not take it into account.`
        : `Of the ${nbSections} findings in this report, ${nbMuettes} were not written up: they are flagged below and shown in their structured form, and the summary above does not take them into account.`,
    methodeIndisponible:
      'Our re-checks could not be completed on this scan: we cannot say how many reports were discarded.',
    ligneEcartes: (nbEcartes) =>
      nbEcartes === 0
        ? 'No report was discarded by our re-checks.'
        : nbEcartes === 1
          ? '1 report was discarded by our re-checks.'
          : `${nbEcartes} reports were discarded by our re-checks.`,
    ligneNonVerifies: (nbNonVerifies) =>
      nbNonVerifies === 1
        ? '1 further report could not be re-checked and does not appear here.'
        : `${nbNonVerifies} further reports could not be re-checked and do not appear here.`,
  },
};
