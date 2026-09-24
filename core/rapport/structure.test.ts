/**
 * LA STRUCTURE FACTUELLE — tout ce que le modèle n'a pas le droit d'écrire.
 *
 * Ces tests éprouvent les quatre endroits où la structure pourrait mentir
 * sans que personne ne le voie : l'ordre des sections, les localisations
 * (« mobile uniquement » doit survivre), le compte des signalements écartés,
 * et le logement monétaire — qui doit rester VIDE.
 */
import { describe, expect, it } from 'vitest';
import { MOTIF_CONSTATEE_AU_REJEU } from '../scanner/confirmation/decouvertes.js';
import { MOTIF_DECOUVERTE_DIAGNOSTIC_SITE } from '../scanner/confirmation/pont-vocabulaires.js';
import { anomalie, rapportTechnique, resultatGroupe, tentative } from './aide-tests.js';
import { compterEcartes, compterNonVerifies, construireStructure, localisationsLisibles } from './structure.js';

describe('construireStructure — l’ordre de lecture d’un rapport', () => {
  it('range par GRAVITÉ puis par CERTITUDE : le lecteur pressé lit ce qui l’empêche de vendre', () => {
    const rapport = rapportTechnique({
      anomalies: [
        anomalie('g1', { gravite: 'mineur', verdict: 'confirmee' }),
        anomalie('g2', { gravite: 'bloquant', motif: MOTIF_CONSTATEE_AU_REJEU }),
        anomalie('g3', { gravite: 'bloquant', verdict: 'confirmee' }),
        anomalie('g4', { gravite: 'important', verdict: 'intermittente' }),
      ],
      groupes: [],
    });
    const { rapportBusiness } = construireStructure(rapport, 'fr');
    expect(rapportBusiness.sections.map((section) => section.groupe)).toEqual(['g3', 'g2', 'g4', 'g1']);
    // Les identifiants sont attribués APRÈS le tri : `s1` est bien la première
    // section lue, et c'est cet ordre-là que le modèle voit.
    expect(rapportBusiness.sections.map((section) => section.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('le tri est TOTAL : à gravité et statut égaux, l’ordre du rapport technique tranche', () => {
    // Sans ce troisième critère, deux anomalies équivalentes pourraient
    // permuter d'un run à l'autre — et la clé de cassette de la rédaction avec
    // elles. L'instrument cesserait d'être déterministe sans qu'une ligne du
    // moteur ne change.
    const rapport = rapportTechnique({
      anomalies: [anomalie('gA', { pages: ['/a'] }), anomalie('gB', { pages: ['/b'] }), anomalie('gC', { pages: ['/c'] })],
      groupes: [],
    });
    const premier = construireStructure(rapport, 'fr').rapportBusiness;
    const second = construireStructure(rapport, 'fr').rapportBusiness;
    expect(premier.sections.map((s) => s.groupe)).toEqual(['gA', 'gB', 'gC']);
    expect(second.sections.map((s) => s.groupe)).toEqual(premier.sections.map((s) => s.groupe));
  });

  it('la prose naît VIDE et le rapport se déclare sans prose : c’est le mode dégradé par défaut', () => {
    const { rapportBusiness } = construireStructure(rapportTechnique(), 'fr');
    expect(rapportBusiness.sansProse).toBe(true);
    expect(rapportBusiness.synthese).toBe('');
    expect(rapportBusiness.ligneMethode).toBe('');
    for (const section of rapportBusiness.sections) {
      expect([section.titre, section.constat, section.impact, section.actionSuggeree]).toEqual(['', '', '', '']);
      // Les FAITS, eux, sont là dès la construction.
      expect(section.statutFormule).not.toBe('');
      expect(section.gravite).toBe('bloquant');
    }
  });

  it('une anomalie SANS statut publiable n’est ni publiée ni perdue : elle remonte', () => {
    // Elle ne reçoit pas la formulation du voisin, et elle ne disparaît pas en
    // silence — l'appelant la journalise.
    const orpheline = { ...anomalie('g9'), verdict: undefined };
    const rapport = rapportTechnique({ anomalies: [anomalie('g1'), orpheline], groupes: [] });
    const { rapportBusiness, nonSituees } = construireStructure(rapport, 'fr');
    expect(rapportBusiness.sections).toHaveLength(1);
    expect(nonSituees).toHaveLength(1);
    expect(nonSituees[0]?.groupe).toBe('g9');
  });

  it('le LOGEMENT MONÉTAIRE reste vide, sur toutes les sections et en toutes circonstances', () => {
    // Le moteur ne connaît ni le panier moyen ni le trafic. Un logement vide
    // que rien ne garde finit par se remplir tout seul : ce test est la garde.
    const rapport = rapportTechnique({
      anomalies: [anomalie('g1', { gravite: 'bloquant' }), anomalie('g2', { gravite: 'mineur' })],
      groupes: [],
      typeSite: 'boutique',
    });
    const { rapportBusiness } = construireStructure(rapport, 'fr');
    for (const section of rapportBusiness.sections) {
      expect(section.impactChiffre).toBeUndefined();
    }
  });

  it('les CHIFFRES du statut viennent du résultat de groupe, jamais d’une valeur par défaut', () => {
    const rapport = rapportTechnique({
      anomalies: [anomalie('g1', { verdict: 'intermittente' })],
      groupes: [resultatGroupe('g1', [tentative(1, true), tentative(2, false)], 'intermittente')],
    });
    const { rapportBusiness } = construireStructure(rapport, 'fr');
    expect(rapportBusiness.sections[0]?.statutFormule).toBe(
      'Se produit par intermittence : reproduit une fois sur 2 vérifications.',
    );
  });
});

describe('localisationsLisibles — « mobile uniquement » doit survivre trois briques', () => {
  it('garde le viewport quand l’anomalie en DÉPEND', () => {
    const mobile = anomalie('g1', { pages: ['/contact'], viewportLocalisation: 'mobile', viewports: ['mobile'] });
    expect(localisationsLisibles(mobile)).toEqual([{ page: '/contact', viewports: ['mobile'] }]);
  });

  it('sans dépendance au viewport, affiche ceux où le groupe a été OBSERVÉ : un constat, pas une extrapolation', () => {
    const partout = anomalie('g1', { pages: ['/contact'], viewports: ['desktop', 'mobile'] });
    expect(localisationsLisibles(partout)).toEqual([
      { page: '/contact', viewports: ['desktop', 'mobile'] },
    ]);
  });

  it('regroupe les manifestations PAR PAGE : une cause sur cinq pages se lit sur cinq lignes, pas une par occurrence', () => {
    const multiple = anomalie('g1', { pages: ['/', '/contact', '/contact'], viewports: ['desktop'] });
    expect(localisationsLisibles(multiple).map((l) => l.page)).toEqual(['/', '/contact']);
  });

  it('réduit une URL absolue à son CHEMIN : une adresse complète n’apprend rien à un lecteur', () => {
    const absolue = { ...anomalie('g1'), localisations: [{ urlOuEtape: 'http://127.0.0.1:4800/devis?page=2' }] };
    expect(localisationsLisibles(absolue)[0]?.page).toBe('/devis');
  });

  it('ne TRONQUE PAS le chemin du rapport publié : c’est l’adresse du site du client', () => {
    // `cheminMaxChars` borne ce que le MODÈLE voit, pas ce que le CLIENT lit —
    // exactement comme `localisationsMaxParSection`, son jumeau à deux lignes
    // de distance. Tronquer ici donnait au propriétaire du site une URL
    // amputée de la page qu'il doit aller réparer. Le rendu l'échappe ; il ne
    // la coupe pas.
    const longue = { ...anomalie('g1'), localisations: [{ urlOuEtape: `/${'x'.repeat(500)}` }] };
    expect(localisationsLisibles(longue)[0]?.page).toHaveLength(501);
  });

  it('ne borne PAS le nombre de localisations du rapport PUBLIÉ', () => {
    // `localisationsMaxParSection` borne ce que le MODÈLE voit, pas ce que le
    // CLIENT lit : sa description le dit. L'appliquer ici faisait disparaître
    // du rapport des pages où le défaut se manifeste — un plafond de dépense
    // qui ampute un constat. La troncature vit dans `normaliserFaits`, et son
    // test y est.
    const pages = Array.from({ length: 12 }, (_valeur, rang) => `/page-${rang}`);
    const etalee = anomalie('g1', { pages });
    expect(localisationsLisibles(etalee)).toHaveLength(12);
  });
});

describe('compterEcartes — le chiffre NEUTRE de la brique 3', () => {
  it('compte des GROUPES DE CAUSE RACINE, jamais des candidates', () => {
    // Trois candidates issues d'une même ressource en échec ne sont pas trois
    // fausses alertes évitées : les compter ainsi ferait grossir notre mérite
    // en dégradant la consolidation.
    const rapport = rapportTechnique({
      anomalies: [],
      groupes: [
        resultatGroupe('g1', [tentative(1, false), tentative(2, false)], 'non-reproduite'),
        resultatGroupe('g2', [tentative(1, false)], 'non-reproduite'),
        resultatGroupe('g3', [tentative(1, true)], 'confirmee'),
      ],
    });
    expect(compterEcartes(rapport, new Set())).toBe(2);
  });

  it('ne compte comme « écarté par nos re-vérifications » QUE ce qui a été re-vérifié', () => {
    // Le défaut trouvé en revue : le refus de compter était conditionné à
    // l'ABSENCE du tableau `groupes`, c'est-à-dire au seul cas où le protocole
    // avait LEVÉ. Or deux chemins écartent un groupe SANS l'éprouver, avec
    // `groupes` plein : l'échéance atteinte avant son tour (`tentatives: []`)
    // et tous les rejeux en échec d'outillage. Le rapport annonçait alors
    // « N signalements écartés par nos re-vérifications » sans qu'aucune
    // re-vérification n'ait eu lieu.
    const rapport = rapportTechnique({
      anomalies: [],
      groupes: [
        // Éprouvé : deux rejeux exploitables, aucun ne reproduit.
        resultatGroupe('g1', [tentative(1, false), tentative(2, false)], 'non-reproduite'),
        // Échéance atteinte : aucune tentative.
        resultatGroupe('g2', [], 'limite-automatisation'),
        // Rejeu impossible : la seule tentative n'est pas exploitable.
        resultatGroupe('g3', [tentative(1, false, false)], 'limite-automatisation'),
      ],
    });
    expect(compterEcartes(rapport, new Set())).toBe(1);
    expect(compterNonVerifies(rapport, new Set())).toBe(2);
  });

  it('ne compte PAS deux fois un groupe écarté qui a publié une découverte', () => {
    // Un avis « cause site » laisse le groupe écarté ET publie une découverte.
    // L'annoncer écarté alors qu'il a produit une section le compterait deux
    // fois, dans les deux sens opposés.
    const rapport = rapportTechnique({
      anomalies: [anomalie('g1', { motif: MOTIF_DECOUVERTE_DIAGNOSTIC_SITE })],
      groupes: [
        resultatGroupe('g1', [tentative(1, false)], 'limite-automatisation'),
        resultatGroupe('g2', [tentative(1, false)], 'non-reproduite'),
      ],
    });
    const { rapportBusiness } = construireStructure(rapport, 'fr');
    expect(rapportBusiness.nbEcartes).toBe(1);
    expect(rapportBusiness.nbNonVerifies).toBe(0);
  });

  it('sans groupes publiés, REFUSE de compter : pas de re-vérification, pas de chiffre', () => {
    // Le cas arrive quand le protocole est TOMBÉ — au moment précis où un
    // chiffre flatteur serait le plus trompeur. `ecartees` ne contient alors
    // que des candidates, et les publier sous la phrase « écartés par nos
    // re-vérifications » serait faux deux fois : mauvaise unité, mauvais verbe.
    const rapport = { ...rapportTechnique({ anomalies: [], groupes: [] }), groupes: undefined, ecartees: [{}, {}] as never };
    expect(compterEcartes(rapport, new Set())).toBeNull();
  });
});
