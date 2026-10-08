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
      /**
       * TEXTE À GARANTIE SÉMANTIQUE (cahier P2-2, contrat 3) : l'étiquette de
       * l'hôte en cause. Elle dit l'hôte ET l'imputation — c'est le SITE qui
       * appelle ce service, donc c'est à lui que la correction revient
       * (APPRENTISSAGES n°19). « Un service extérieur » sans nom envoyait
       * chercher au mauvais endroit (C-03).
       */
      serviceExterieur: string;
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
      /**
       * TEXTE À GARANTIE SÉMANTIQUE (cahier P2-1, contrat 8) : combien de
       * constats PUBLIÉS n'ont jamais été re-testés. Chaque section le dit
       * dans son statut ; la méthode en donne le compte, pour qu'un rapport
       * fait surtout de découvertes ne se lise pas comme un rapport vérifié.
       */
      ligneDecouvertes: (nbDecouvertes: number) => string;
      /**
       * CE QUE LE MOTEUR A FAIT, et non ce qu'il a vu. Texte à garantie
       * sémantique : il énonce un ACTE sur la page du client, et une
       * formulation qui l'adoucirait — « certains éléments ont été
       * ignorés » — cacherait que nous avons cliqué. En code typé, sous
       * revue (constitution §2).
       */
      ligneEcartements: (nbEcartements: number) => string;
      /** TEXTE À GARANTIE SÉMANTIQUE : quand aucun groupe n'a pu être rejoué, le rapport ne peut pas se lire comme « le site va bien ». */
      rienVerifie: (nbNonVerifies: number) => string;
      /**
       * TEXTES À GARANTIE SÉMANTIQUE (cahier P2-11, C3-b) : un MUR COUVRANT —
       * une occlusion qui recouvre l'interface et masque des éléments
       * interactifs. Le moteur ne sait PAS sa nature (consentement voulu, ou
       * vrai piège) : il nomme ce qu'il OBSERVE, jamais la conséquence (pas
       * d'impact), et l'action INVITE à juger sans prescrire — nommant les deux
       * possibilités. C'est l'honnêteté stricte : rien qu'on ne mesure pas.
       */
      titreMurCouvrant: string;
      constatMurCouvrant: (nbElements: number, pages: string) => string;
      actionMurCouvrant: string;
      /**
       * STATUT propre au mur couvrant : il dit la REPRODUCTIBILITÉ (vu à chaque
       * passage, donc pas un hasard de rendu) SANS la promesse « défaut vérifié »
       * de la phrase `confirmee`. « Constaté, puis reproduit lors de nos
       * vérifications » est la garantie du différenciateur n°1 (un défaut
       * re-testé) ; sur un mur qu'on ne juge pas, elle mentirait par
       * juxtaposition (cahier P2-11, C3-b, Q4).
       */
      statutMurCouvrant: string;
      /**
       * LIBELLÉ d'action propre au mur : « Ce qu'il faut vérifier », pas « Ce
       * qu'il faut faire corriger » — qui présumerait un défaut sous une action
       * qui dit « c'est peut-être normal » (cahier P2-11, C3-b, Q4, 2ᵉ source).
       */
      actionLabelMurCouvrant: string;
      /**
       * RECOUVREMENT À PREUVE FAIBLE (voie A). Un recouvrement DÉCOUVERT au
       * rejeu (`decouverte`/`constatee-au-rejeu`), jamais passé par le test de
       * persistance : le moteur l'a vu une fois, pas reproduit. Même régime que
       * le mur (garantie sémantique, hors rédaction IA, gravité `mineur`) :
       * le STATUT dit exactement la preuve faible — « observé une fois, non
       * reproduit » — SANS la promesse « défaut vérifié » de `confirmee` ; le
       * constat décrit ce qu'on a observé ; l'action INVITE à vérifier l'effet
       * (« s'il gêne l'usage ») sans conclure qu'un élément revu = défaut — le
       * moteur ne le sait pas. Minorer ≠ taire : la section reste publiée.
       */
      titrePreuveFaible: string;
      constatPreuveFaible: string;
      statutPreuveFaible: string;
      actionPreuveFaible: string;
      actionLabelPreuveFaible: string;
    }
  >
> = {
  fr: {
    titre: 'Rapport de vérification',
    sansAnomalie: 'Aucune anomalie n’a été retenue à l’issue de nos vérifications.',
    pagesConcernees: 'Pages concernées',
    serviceExterieur: 'Service extérieur appelé par le site',
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
    ligneDecouvertes: (nbDecouvertes) =>
      nbDecouvertes === 1
        ? '1 constat de ce rapport a été vu pendant nos vérifications sans pouvoir être re-testé : il est présenté comme une observation, pas comme un défaut établi.'
        : `${nbDecouvertes} constats de ce rapport ont été vus pendant nos vérifications sans pouvoir être re-testés : ils sont présentés comme des observations, pas comme des défauts établis.`,
    ligneEcartements: (nbEcartements) =>
      nbEcartements === 1
        ? '1 élément recouvrait l’interface : nous l’avons écarté comme l’aurait fait un visiteur, afin de poursuivre la vérification.'
        : `${nbEcartements} éléments recouvraient l’interface : nous les avons écartés comme l’aurait fait un visiteur, afin de poursuivre la vérification.`,
    rienVerifie: (nbNonVerifies) =>
      nbNonVerifies === 1
        ? 'Rien n’a pu être vérifié sur ce site : notre seul signalement n’a pas pu être rejoué, et aucun n’est publié. Ce rapport ne dit pas que le site va bien ; il dit que nous n’avons pas pu le vérifier.'
        : `Rien n’a pu être vérifié sur ce site : aucun de nos ${nbNonVerifies} signalements n’a pu être rejoué, et aucun n’est publié. Ce rapport ne dit pas que le site va bien ; il dit que nous n’avons pas pu le vérifier.`,
    titreMurCouvrant: 'Élément recouvrant l’interface',
    constatMurCouvrant: (nbElements, pages) =>
      nbElements === 1
        ? `Un élément recouvre l’interface et masque 1 élément interactif sur ${pages}.`
        : `Un élément recouvre l’interface et masque ${nbElements} éléments interactifs sur ${pages}.`,
    actionMurCouvrant:
      'Vérifiez si ce recouvrement est intentionnel : s’il s’agit d’un bandeau de consentement ou d’une fenêtre que vous avez placée, ce constat est normal ; sinon, un élément masque une partie de votre interface.',
    statutMurCouvrant: 'Observé de façon constante lors de nos passages.',
    actionLabelMurCouvrant: 'Ce qu’il faut vérifier',
    titrePreuveFaible: 'Recouvrement observé une seule fois',
    constatPreuveFaible: 'Lors d’un seul de nos passages, un élément a reçu le clic à la place de ce contrôle ; nous ne l’avons pas revu ensuite.',
    statutPreuveFaible: 'Observé une fois, non reproduit lors de nos vérifications.',
    actionPreuveFaible: 'Si vous le constatez sur votre site, vérifiez s’il gêne l’usage de ce contrôle.',
    actionLabelPreuveFaible: 'Ce qu’il faut vérifier',
  },
  en: {
    titre: 'Verification report',
    sansAnomalie: 'No issue was retained after our verification pass.',
    pagesConcernees: 'Pages affected',
    serviceExterieur: 'External service called by the site',
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
    ligneDecouvertes: (nbDecouvertes) =>
      nbDecouvertes === 1
        ? '1 finding in this report was seen during our verification pass and could not be re-tested: it is presented as an observation, not as an established defect.'
        : `${nbDecouvertes} findings in this report were seen during our verification pass and could not be re-tested: they are presented as observations, not as established defects.`,
    ligneEcartements: (nbEcartements) =>
      nbEcartements === 1
        ? '1 element was covering the interface: we dismissed it as a visitor would have, in order to continue the check.'
        : `${nbEcartements} elements were covering the interface: we dismissed them as a visitor would have, in order to continue the check.`,
    rienVerifie: (nbNonVerifies) =>
      nbNonVerifies === 1
        ? 'Nothing could be verified on this site: our 1 report could not be replayed, and none is published. This report does not say the site is fine; it says we could not check it.'
        : `Nothing could be verified on this site: none of our ${nbNonVerifies} reports could be replayed, and none is published. This report does not say the site is fine; it says we could not check it.`,
    titreMurCouvrant: 'Overlay covering the interface',
    constatMurCouvrant: (nbElements, pages) =>
      nbElements === 1
        ? `An element covers the interface and hides 1 interactive element on ${pages}.`
        : `An element covers the interface and hides ${nbElements} interactive elements on ${pages}.`,
    actionMurCouvrant:
      'Check whether this overlay is intentional: if it is a consent banner or a window you placed, this finding is expected; otherwise, an element is hiding part of your interface.',
    statutMurCouvrant: 'Consistently observed across our passes.',
    actionLabelMurCouvrant: 'What to check',
    titrePreuveFaible: 'Overlay observed only once',
    constatPreuveFaible: 'On a single one of our passes, an element received the click in place of this control; we did not see it again afterwards.',
    statutPreuveFaible: 'Observed once, not reproduced across our checks.',
    actionPreuveFaible: 'If you observe it on your site, check whether it hinders the use of this control.',
    actionLabelPreuveFaible: 'What to check',
  },
};
