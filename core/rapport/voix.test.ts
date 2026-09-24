/**
 * LE VERROU DE LA VOIX — chaque phrase que le produit adresse à un humain est
 * recopiée ici, mot pour mot.
 *
 * Ce n'est pas un test de non-régression ordinaire, et il ne faut pas le lire
 * comme tel. Une formulation de statut est la LIMITE EXACTE de ce que le
 * produit a le droit de promettre : la changer doit obliger à modifier le
 * fichier qui dit que c'est la promesse, et à le faire dans un diff qu'un
 * relecteur verra. Un test qui se contenterait de vérifier « la chaîne n'est
 * pas vide » laisserait passer le remplacement de « détecté pendant nos
 * vérifications » par « confirmé » sans un mot.
 *
 * Le second bloc éprouve ce qu'aucune recopie ne peut éprouver : que les
 * quatre statuts se DISTINGUENT, dans chaque langue, et que le cas à zéro
 * vérification ne prétende jamais en avoir eu.
 */
import { describe, expect, it } from 'vitest';
import type { StatutSection } from '../types.js';
import { AUCUNE_VERIFICATION } from './statuts.js';
import { FORMULATIONS, LANGUES_RAPPORT, LIBELLES_CATEGORIE, LIBELLES_GRAVITE, LIBELLES_RAPPORT, estLangueRapport, formulerStatut } from './voix.js';

const STATUTS: StatutSection[] = ['confirmee', 'intermittente', 'constatee-au-rejeu', 'diagnostic-site'];

describe('les formulations, mot pour mot', () => {
  it('français', () => {
    expect(formulerStatut('confirmee', 'fr', { nbVerifications: 2, nbReproductions: 2 })).toBe(
      'Constaté, puis reproduit lors de nos 2 vérifications indépendantes.',
    );
    expect(formulerStatut('confirmee', 'fr', { nbVerifications: 1, nbReproductions: 1 })).toBe(
      'Constaté, puis reproduit lors d’une vérification indépendante.',
    );
    expect(formulerStatut('confirmee', 'fr', AUCUNE_VERIFICATION)).toBe('Constaté pendant le scan ; nous ne l’avons pas rejoué.');
    expect(formulerStatut('intermittente', 'fr', { nbVerifications: 2, nbReproductions: 1 })).toBe(
      'Se produit par intermittence : reproduit une fois sur 2 vérifications.',
    );
    expect(formulerStatut('intermittente', 'fr', { nbVerifications: 3, nbReproductions: 2 })).toBe(
      'Se produit par intermittence : reproduit 2 fois sur 3 vérifications.',
    );
    expect(formulerStatut('constatee-au-rejeu', 'fr', AUCUNE_VERIFICATION)).toBe(
      'Détecté pendant nos vérifications ; non re-testé.',
    );
    expect(formulerStatut('diagnostic-site', 'fr', AUCUNE_VERIFICATION)).toBe(
      'Constaté une fois ; nos vérifications n’ont pas pu le reproduire. Notre analyse suspecte une cause côté site — non re-confirmé.',
    );
  });

  it('anglais', () => {
    expect(formulerStatut('confirmee', 'en', { nbVerifications: 2, nbReproductions: 2 })).toBe(
      'Observed, then reproduced in each of our 2 independent re-checks.',
    );
    expect(formulerStatut('confirmee', 'en', { nbVerifications: 1, nbReproductions: 1 })).toBe(
      'Observed, then reproduced in one independent re-check.',
    );
    expect(formulerStatut('confirmee', 'en', AUCUNE_VERIFICATION)).toBe('Observed during the scan; we did not replay it.');
    // « reproduced 1 times » était une faute d'accord verrouillée par ce test
    // même : un test qui recopie la sortie la sanctuarise, faute comprise.
    expect(formulerStatut('intermittente', 'en', { nbVerifications: 2, nbReproductions: 1 })).toBe(
      'Happens intermittently: reproduced once out of 2 re-checks.',
    );
    expect(formulerStatut('intermittente', 'en', { nbVerifications: 3, nbReproductions: 2 })).toBe(
      'Happens intermittently: reproduced 2 times out of 3 re-checks.',
    );
    expect(formulerStatut('constatee-au-rejeu', 'en', AUCUNE_VERIFICATION)).toBe(
      'Detected during our verification pass; not re-tested.',
    );
    expect(formulerStatut('diagnostic-site', 'en', AUCUNE_VERIFICATION)).toBe(
      'Observed once; our re-checks could not reproduce it. Our analysis suspects a cause on the site side — not re-confirmed.',
    );
  });
});

describe('« confirmee » annonce les REPRODUCTIONS, jamais les tentatives', () => {
  it('un « confirmee » à une reproduction sur deux PUBLIE le dénominateur', () => {
    // `confirmation.tauxReproduction` vaut 1 aujourd'hui, donc les deux
    // nombres coïncident — mais c'est un RÉGLAGE, et le schéma en autorise
    // 0,5. Une phrase qui n'annonce que les reproductions dit alors la même
    // chose d'un groupe reproduit 1 fois sur 1 et d'un groupe reproduit 1 fois
    // sur 2 : le client ne peut plus distinguer « toutes nos vérifications
    // l'ont retrouvé » de « la moitié ».
    expect(formulerStatut('confirmee', 'fr', { nbVerifications: 2, nbReproductions: 1 })).toBe(
      'Constaté, puis reproduit lors de 1 de nos 2 vérifications indépendantes.',
    );
    expect(formulerStatut('confirmee', 'en', { nbVerifications: 2, nbReproductions: 1 })).toBe(
      'Observed, then reproduced in 1 of our 2 independent re-checks.',
    );
    // Et une reproduction sur une ne se confond pas avec une sur deux.
    expect(formulerStatut('confirmee', 'fr', { nbVerifications: 1, nbReproductions: 1 })).toBe(
      'Constaté, puis reproduit lors d’une vérification indépendante.',
    );
  });

  it('« nous ne l’avons pas rejoué » se décide sur les REJEUX, jamais sur les reproductions', () => {
    // La branche décidait sur `nbReproductions` : elle affirmait donc « nous
    // ne l'avons pas rejoué » d'un groupe rejoué deux fois sans succès. Une
    // affirmation plate et fausse, sur la question même que la phrase pose.
    expect(formulerStatut('confirmee', 'fr', AUCUNE_VERIFICATION)).toBe(
      'Constaté pendant le scan ; nous ne l’avons pas rejoué.',
    );
    expect(formulerStatut('confirmee', 'fr', { nbVerifications: 2, nbReproductions: 0 })).not.toContain(
      'pas rejoué',
    );
  });
});

describe('ce que la recopie ne peut pas prouver', () => {
  it('« confirmee » sans aucune vérification n’annonce PAS de vérification', () => {
    // Un groupe peut être confirmé SANS re-exécution (politique économe,
    // confiance suffisante). « re-vérifié 0 fois » aurait été une affirmation
    // fausse écrite par le code lui-même, au cœur de la brique qui interdit au
    // modèle d'en écrire une. Le contrôle : la phrase à zéro vérification ne
    // partage AUCUN mot de comptage avec celle qui en annonce.
    for (const langue of LANGUES_RAPPORT) {
      const sans = formulerStatut('confirmee', langue, AUCUNE_VERIFICATION);
      const avec = formulerStatut('confirmee', langue, { nbVerifications: 3, nbReproductions: 3 });
      expect(sans).not.toBe(avec);
      expect(sans).not.toMatch(/\p{Nd}/u);
      expect(avec).toMatch(/\p{Nd}/u);
    }
  });

  it('les quatre statuts se DISTINGUENT dans chaque langue : aucun n’emprunte la phrase d’un autre', () => {
    // Deux statuts qui rendraient la même phrase seraient deux promesses
    // confondues — et ce serait toujours la plus forte qui gagnerait à la
    // lecture.
    for (const langue of LANGUES_RAPPORT) {
      const phrases = STATUTS.map((statut) => formulerStatut(statut, langue, { nbVerifications: 2, nbReproductions: 1 }));
      expect(new Set(phrases).size).toBe(STATUTS.length);
    }
  });

  it('les deux langues ne se confondent pas : aucune formulation n’est partagée', () => {
    // Le croisé du banc (site anglais, rapport français) ne mesurerait rien si
    // les deux tables rendaient les mêmes chaînes.
    for (const statut of STATUTS) {
      const fr = formulerStatut(statut, 'fr', { nbVerifications: 2, nbReproductions: 1 });
      const en = formulerStatut(statut, 'en', { nbVerifications: 2, nbReproductions: 1 });
      expect(fr).not.toBe(en);
    }
  });

  it('chaque statut a une entrée dans CHAQUE langue connue', () => {
    for (const statut of STATUTS) {
      for (const langue of LANGUES_RAPPORT) {
        expect(FORMULATIONS[statut][langue](AUCUNE_VERIFICATION).trim()).not.toBe('');
      }
    }
  });
});

describe('les langues sont une liste CLOSE', () => {
  it('reconnaît les langues vérifiées et refuse les autres', () => {
    expect(estLangueRapport('fr')).toBe(true);
    expect(estLangueRapport('en')).toBe(true);
    // Le modèle sait écrire l'allemand ; nous n'avons pas relu les
    // formulations de statut en allemand. La liste dit ce que NOUS avons
    // vérifié, pas ce qu'il sait faire.
    expect(estLangueRapport('de')).toBe(false);
    expect(estLangueRapport('')).toBe(false);
  });

  it('les libellés de catégorie et de gravité couvrent toutes les valeurs, dans toutes les langues', () => {
    // Un libellé manquant afficherait une clé technique (`accessibilite`) à un
    // commerçant. Les `Record` exhaustifs le rendent impossible à la
    // compilation ; ce test le rend visible.
    for (const langue of LANGUES_RAPPORT) {
      for (const libelles of Object.values(LIBELLES_CATEGORIE)) {
        expect(libelles[langue].trim()).not.toBe('');
      }
      for (const libelles of Object.values(LIBELLES_GRAVITE)) {
        expect(libelles[langue].trim()).not.toBe('');
      }
    }
  });
});

describe('la ligne de méthode structurelle — le chiffre vient du CODE', () => {
  it('accorde sa phrase sur le nombre, et n’écrit jamais « 0 signalements »', () => {
    expect(LIBELLES_RAPPORT.fr.ligneEcartes(0)).toBe('Aucun signalement n’a été écarté par nos re-vérifications.');
    expect(LIBELLES_RAPPORT.fr.ligneEcartes(1)).toBe('1 signalement a été écarté par nos re-vérifications.');
    expect(LIBELLES_RAPPORT.fr.ligneEcartes(4)).toBe('4 signalements ont été écartés par nos re-vérifications.');
    expect(LIBELLES_RAPPORT.en.ligneEcartes(0)).toBe('No report was discarded by our re-checks.');
    expect(LIBELLES_RAPPORT.en.ligneEcartes(1)).toBe('1 report was discarded by our re-checks.');
    expect(LIBELLES_RAPPORT.en.ligneEcartes(3)).toBe('3 reports were discarded by our re-checks.');
  });
});
