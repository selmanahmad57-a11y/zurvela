/**
 * LE RENDU — la seule forme sous laquelle un humain lit la sortie du moteur.
 *
 * Ce qui est vérifié ici n'est pas une mise en page, c'est une garantie : que
 * tout chiffre affiché vienne de la STRUCTURE, et qu'un rapport sans prose
 * reste lisible.
 */
import { describe, expect, it } from 'vitest';
import type { RapportBusiness } from '../types.js';
import { rendreRapport } from './rendu.js';

function rapport(surcharges: Partial<RapportBusiness> = {}): RapportBusiness {
  // `nbSectionsRedigees` est DÉDUIT des sections, jamais posé à la main : une
  // doublure qui annonce trois rédactions sur deux sections vides éprouverait
  // un rapport qui n'existe pas. Une surcharge explicite reste possible pour
  // les cas où c'est justement l'incohérence qu'on veut soumettre au rendu.
  const construit: RapportBusiness = {
    langue: 'fr',
    synthese: 'Un défaut empêche vos visiteurs de vous écrire.',
    ligneMethode: 'Chaque signalement est re-vérifié avant d’être publié.',
    nbEcartes: 4,
    nbNonVerifies: 0,
    sansProse: false,
    sections: [
      {
        id: 's1',
        groupe: 'g1',
        categorie: 'fonctionnel',
        gravite: 'bloquant',
        statut: 'confirmee',
        statutFormule: 'Constaté, puis reproduit lors de 2 vérifications indépendantes.',
        localisations: [{ page: '/contact', viewports: ['mobile'] }],
        titre: 'Le bouton d’envoi ne répond pas',
        constat: 'Un clic ne déclenche rien.',
        impact: 'Aucune demande ne vous parvient.',
        actionSuggeree: 'Faire vérifier le script du formulaire.',
      },
    ],
    nbSectionsRedigees: 0,
    nbLocalisationsMasquees: 0,
    soumissionsTestees: true,
    ...surcharges,
  };
  return {
    ...construit,
    nbSectionsRedigees:
      surcharges.nbSectionsRedigees ?? construit.sections.filter((section) => section.titre !== '').length,
  };
}

describe('rendreRapport', () => {
  it('affiche les faits et la prose, chacun à sa place', () => {
    const texte = rendreRapport(rapport(), { url: 'https://exemple.invalid/' });
    expect(texte).toContain('Le bouton d’envoi ne répond pas');
    expect(texte).toContain('Bloquant');
    expect(texte).toContain('Fonctionnement');
    expect(texte).toContain('Constaté, puis reproduit lors de 2 vérifications indépendantes.');
    expect(texte).toContain('/contact — mobile');
    expect(texte).toContain('https://exemple.invalid/');
  });

  it('« mobile uniquement » arrive jusqu’à la phrase finale', () => {
    // Préservé depuis la détection, à travers la consolidation, le protocole
    // et la structure. Trois briques pour cette ligne-là.
    expect(rendreRapport(rapport())).toContain('mobile');
  });

  it('LE CHIFFRE des signalements écartés vient de la structure, jamais de la prose du modèle', () => {
    const texte = rendreRapport(rapport({ nbEcartes: 7 }));
    expect(texte).toContain('7 signalements ont été écartés par nos re-vérifications.');
    // La phrase du modèle est à CÔTÉ, pas à la place.
    expect(texte).toContain('Chaque signalement est re-vérifié avant d’être publié.');
  });

  it('un rapport SANS PROSE reste lisible : faits, statuts, localisations et compte', () => {
    const structurel = rapport({
      synthese: '',
      ligneMethode: '',
      sansProse: true,
      sections: [{ ...rapport().sections[0]!, titre: '', constat: '', impact: '', actionSuggeree: '' }],
    });
    const texte = rendreRapport(structurel);
    // Le titre retombe sur le libellé de catégorie : jamais une clé technique.
    expect(texte).toContain('Fonctionnement');
    expect(texte).toContain('Constaté, puis reproduit lors de 2 vérifications indépendantes.');
    expect(texte).toContain('4 signalements ont été écartés');
    // Et le rapport DIT qu'il est structurel : un lecteur doit savoir qu'il ne
    // lit pas un texte manquant par oubli.
    expect(texte).toContain('sous sa forme structurée');
  });

  it('un rapport SANS ANOMALIE le dit clairement, au lieu d’afficher un vide', () => {
    const texte = rendreRapport(rapport({ sections: [], nbEcartes: 0, sansProse: true, synthese: '', ligneMethode: '' }));
    expect(texte).toContain('Aucune anomalie n’a été retenue');
    expect(texte).toContain('Aucun signalement n’a été écarté');
  });

  it('rend en ANGLAIS quand le rapport est anglais, libellés compris', () => {
    const texte = rendreRapport(rapport({ langue: 'en', nbEcartes: 2 }));
    expect(texte).toContain('Verification report');
    expect(texte).toContain('Blocking');
    expect(texte).toContain('2 reports were discarded by our re-checks.');
    expect(texte).not.toContain('Bloquant');
  });

  it('une langue inconnue (rapport relu depuis un JSON ancien) ne casse pas le rendu', () => {
    expect(() => rendreRapport(rapport({ langue: 'de' }))).not.toThrow();
  });
});

describe('le rendu ne laisse pas la page écrire du BALISAGE', () => {
  it('échappe le Markdown d’un chemin d’URL choisi par le site', () => {
    // La chaîne de méfiance jusqu'au dernier maillon : sans échappement, une
    // adresse `[cliquez ici](http://ailleurs)` deviendrait un LIEN dans le
    // document remis au propriétaire du site.
    const hostile = rapport({
      sections: [
        {
          ...rapport().sections[0]!,
          localisations: [{ page: '/[cliquez ici](http://ailleurs.invalid)', viewports: [] }],
        },
      ],
    });
    const texte = rendreRapport(hostile);
    expect(texte).not.toContain('[cliquez ici](http://ailleurs.invalid)');
    expect(texte).toContain('\\[cliquez ici\\]');
  });

  it('neutralise aussi le gras, les titres et les tableaux', () => {
    const hostile = rapport({
      sections: [{ ...rapport().sections[0]!, localisations: [{ page: '/**urgent**#titre|colonne', viewports: [] }] }],
    });
    const texte = rendreRapport(hostile);
    expect(texte).not.toContain('**urgent**');
    expect(texte).toContain('\\*\\*urgent\\*\\*');
  });
});

describe('un site SAIN n’est pas un rapport dégradé', () => {
  it('sans anomalie ET sans prose, le rapport ne prétend PAS que la rédaction a échoué', () => {
    // Un site sans anomalie n'a pas de prose parce qu'il n'y a rien à écrire,
    // pas parce que la rédaction a échoué : le lui annoncer serait un
    // diagnostic faux sur un scan parfaitement réussi.
    const sain = rapport({ sections: [], nbEcartes: 0, sansProse: true, synthese: '', ligneMethode: '' });
    const texte = rendreRapport(sain);
    expect(texte).not.toContain('sous sa forme structurée');
    expect(texte).toContain('Aucune anomalie n’a été retenue');
  });

  it('avec des anomalies et sans prose, l’avertissement reste : là, quelque chose a bien manqué', () => {
    const degrade = rapport({
      sansProse: true,
      synthese: '',
      ligneMethode: '',
      sections: [{ ...rapport().sections[0]!, titre: '', constat: '', impact: '', actionSuggeree: '' }],
    });
    expect(rendreRapport(degrade)).toContain('sous sa forme structurée');
  });
});

describe('quand la confirmation n’a pas eu lieu, le rapport le DIT', () => {
  it('nbEcartes null : aucun COMPTE, et une phrase qui assume l’ignorance', () => {
    // Le cas arrive quand le protocole de confirmation est TOMBÉ. Publier le
    // nombre de candidates sous « écartés par nos re-vérifications » serait
    // faux deux fois : mauvaise unité, et mauvais verbe.
    const sansProtocole = rapport({ nbEcartes: null, ligneMethode: '' });
    const texte = rendreRapport(sansProtocole);
    const methode = texte.slice(texte.indexOf('## Notre méthode'));
    expect(methode).toContain('nous ne pouvons pas dire combien');
    // Et surtout : AUCUN chiffre dans le bloc de méthode.
    expect(methode).not.toMatch(/\p{Nd}/u);
  });

  it('en anglais aussi', () => {
    expect(rendreRapport(rapport({ langue: 'en', nbEcartes: null }))).toContain('could not be completed');
  });
});

describe('les deux comptes de la méthode se disent séparément', () => {
  it('affiche la phrase des NON RE-VÉRIFIÉS à côté de celle des écartés', () => {
    const texte = rendreRapport(rapport({ nbEcartes: 2, nbNonVerifies: 3 }));
    expect(texte).toContain('2 signalements ont été écartés par nos re-vérifications.');
    expect(texte).toContain('3 autres signalements n’ont pas pu être re-vérifiés');
  });

  it('se tait sur les non re-vérifiés quand il n’y en a aucun', () => {
    expect(rendreRapport(rapport({ nbEcartes: 2, nbNonVerifies: 0 }))).not.toContain('n’ont pas pu être re-vérifiés');
  });

  it('en anglais aussi', () => {
    const texte = rendreRapport(rapport({ langue: 'en', nbEcartes: 1, nbNonVerifies: 1 }));
    expect(texte).toContain('1 report was discarded by our re-checks.');
    expect(texte).toContain('1 further report could not be re-checked');
  });
});

describe('le balisage est neutralisé sur TOUS les canaux, pas seulement le premier', () => {
  it('un chemin recopié par le modèle dans la PROSE est échappé comme dans les localisations', () => {
    // La garde par l'autre bout : le modèle VOIT les chemins dans son bloc
    // factuel, donc il peut les recopier dans un titre ou un constat — par
    // obéissance imparfaite, ou parce qu'une charge l'y pousse, ce qui est
    // exactement S05. Neutraliser un canal en laissant l'autre ouvert ne garde
    // rien.
    const hostile = rapport({
      synthese: 'Le site expose une page [cliquez ici](http://ailleurs.invalid).',
      sections: [
        {
          ...rapport().sections[0]!,
          titre: 'Page **urgente** <script>',
          constat: 'Adresse concernée : /[piège](http://ailleurs.invalid)',
          impact: 'Une ligne de |tableau| et un # titre.',
          actionSuggeree: 'Vérifier `le script` du formulaire.',
        },
      ],
      ligneMethode: 'Méthode [avec un lien](http://ailleurs.invalid).',
    });
    const texte = rendreRapport(hostile);
    expect(texte).not.toContain('[cliquez ici]');
    expect(texte).not.toContain('**urgente**');
    expect(texte).not.toContain('<script>');
    expect(texte).not.toContain('[piège]');
    expect(texte).not.toContain('|tableau|');
    expect(texte).not.toContain('`le script`');
    expect(texte).not.toContain('[avec un lien]');
  });

  it('les PARENTHÈSES d’une phrase restent intactes : on neutralise le dangereux, pas ce qui y ressemble', () => {
    // Une parenthèse ne fabrique un lien que précédée d'un `](` — or `[` et
    // `]` sont échappés, donc la construction ne peut pas se former. Les
    // échapper abîmerait le texte français pour rien.
    const texte = rendreRapport(rapport({ synthese: 'Un défaut bloquant (sur mobile) empêche l’envoi.' }));
    expect(texte).toContain('(sur mobile)');
  });

  it('la formulation de STATUT n’est pas échappée : elle vient de notre propre table', () => {
    expect(rendreRapport(rapport())).toContain('Constaté, puis reproduit lors de 2 vérifications indépendantes.');
  });

  it('une CATÉGORIE ou une GRAVITÉ inconnue dégrade la section, jamais le rapport entier', () => {
    // Même hypothèse que le repli de langue : un rapport peut être relu depuis
    // un JSON écrit par une version antérieure. La garde protégeait le champ
    // dont l'écart est cosmétique et laissait nus les deux dont l'écart est
    // fatal — `LIBELLES_CATEGORIE[inconnue]` vaut `undefined`, et l'accès
    // `[langue]` faisait disparaître le rapport ENTIER.
    const ancien = rapport({
      sections: [
        {
          ...rapport().sections[0]!,
          categorie: 'conformite' as never,
          gravite: 'catastrophique' as never,
        },
      ],
    });
    const texte = rendreRapport(ancien);
    expect(texte).toContain('conformite');
    expect(texte).toContain('catastrophique');
    // Le reste du rapport est intact : la méthode, la synthèse, les pages.
    expect(texte).toContain('Notre méthode');
    expect(texte).toContain('/contact');
  });

  it('une ADRESSE NUE est enfermée dans un span de code : échapper le balisage ne la rendrait pas inoffensive', () => {
    // GFM et les moteurs à `linkify` transforment `http://…` et `www.…` en
    // lien cliquable SANS aucun caractère de balisage. Le chemin vient du site
    // inspecté, et le rédacteur peut le recopier : sans cette garde, le
    // propriétaire du site reçoit sous notre marque un lien vers un domaine
    // que le site inspecté a choisi.
    const texte = rendreRapport(
      rapport({
        synthese: 'Voir https://audit-conforme.invalid/suite pour la suite.',
        sections: [
          {
            id: 's1',
            groupe: 'g1',
            categorie: 'fonctionnel',
            gravite: 'bloquant',
            statut: 'confirmee',
            statutFormule: 'Constaté.',
            localisations: [{ page: '/aller-sur-www.ailleurs.invalid/page', viewports: [] }],
            titre: 'Titre',
            constat: 'Adresse citée : www.ailleurs.invalid/piege',
            impact: 'Impact.',
            actionSuggeree: 'Action.',
          },
        ],
      }),
    );
    expect(texte).toContain('`https://audit-conforme.invalid/suite`');
    expect(texte).toContain('`www.ailleurs.invalid/piege`');
    // Enfermée, mais pas amputée : le lecteur voit l'adresse en entier.
    expect(texte).toContain('audit-conforme.invalid/suite');
    // Et aucune adresse ne subsiste hors d'un span de code.
    for (const ligne of texte.split('\n')) {
      const horsCode = ligne.replace(/`[^`]*`/g, '');
      expect(horsCode).not.toMatch(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i);
    }
  });

  it('un rapport PARTIEL le dit, et nomme chaque section qu’il n’a pas rédigée', () => {
    // La rédaction se fait en un appel sur un bloc de faits BORNÉ : des
    // sections entières peuvent en sortir. Elles restent publiées avec leurs
    // faits, et sans un mot le lecteur ne peut pas distinguer « nous n'avons
    // rien à en dire » de « la rédaction s'est arrêtée là ».
    const muette = {
      id: 's2',
      groupe: 'g2',
      categorie: 'visuel' as const,
      gravite: 'mineur' as const,
      statut: 'confirmee' as const,
      statutFormule: 'Constaté.',
      localisations: [{ page: '/accueil', viewports: [] }],
      titre: '',
      constat: '',
      impact: '',
      actionSuggeree: '',
    };
    const complet = rendreRapport(rapport());
    const partiel = rendreRapport(rapport({ sections: [...rapport().sections, muette] }));
    expect(partiel).toContain('Sur les 2 constats de ce rapport, 1 n’a pas été rédigé');
    expect(partiel).toContain('Ce constat n’a pas été rédigé');
    // Le contrôle doit pouvoir échouer : un rapport entièrement rédigé se tait.
    expect(complet).not.toContain('n’a pas été rédigé');
  });

  it('un rapport STRUCTUREL ne se dit pas partiel : il a déjà son avertissement, et deux en diraient un de trop', () => {
    const structurel = rendreRapport(
      rapport({
        sansProse: true,
        synthese: '',
        ligneMethode: '',
        sections: rapport().sections.map((section) => ({ ...section, titre: '', constat: '', impact: '', actionSuggeree: '' })),
      }),
    );
    expect(structurel).toContain('sous sa forme structurée');
    expect(structurel).not.toContain('Sur les 1 constats');
    expect(structurel).not.toContain('Ce constat n’a pas été rédigé');
  });
});

describe('ce que le scan n’a PAS essayé', () => {
  it('sous interaction restreinte, le rapport DIT qu’aucun formulaire n’a été envoyé', () => {
    // Sans cette phrase, « aucune anomalie retenue » se lirait « votre
    // formulaire fonctionne », alors que personne ne l'a essayé. C'est une
    // limite de ce que NOUS avons fait, donc sa place est dans la méthode.
    const texte = rendreRapport(rapport({ soumissionsTestees: false }));
    expect(texte).toContain('Nous n’avons envoyé aucun formulaire');
    expect(texte.indexOf('Nous n’avons envoyé aucun formulaire')).toBeGreaterThan(texte.indexOf('Notre méthode'));
  });

  it('quand ils ONT été envoyés, le rapport se tait : le contrôle peut échouer', () => {
    expect(rendreRapport(rapport({ soumissionsTestees: true }))).not.toContain('Nous n’avons envoyé aucun formulaire');
  });

  it('en anglais aussi : une limite tue par traduction serait une limite tue', () => {
    const texte = rendreRapport(rapport({ langue: 'en', soumissionsTestees: false }));
    expect(texte).toContain('We did not send any of this site’s forms');
  });
});
