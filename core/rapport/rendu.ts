/**
 * RENDU du rapport business en texte lisible (Markdown).
 *
 * C'est la seule forme sous laquelle un humain lit aujourd'hui la sortie du
 * moteur : la Phase 1 n'a pas d'interface, et un rapport qu'on ne peut pas
 * lire n'est pas un rapport. Le rendu est DÉLIBÉRÉMENT pauvre — pas de
 * couleurs, pas de mise en page conditionnelle, pas de logique : il met bout à
 * bout ce que la structure porte déjà.
 *
 * ── CE MODULE EST L'UN DES DEUX SEULS À LIRE LA PROSE ───────────────────────
 *
 * La prose du rapport est TERMINALE : aucune logique du dépôt ne la lit, aucun
 * calcul n'en dépend, aucune mesure ne la note. Deux modules la touchent, et
 * une garde qui parcourt le dépôt le vérifie : `index.ts`, qui la RECOPIE
 * depuis la réponse du modèle, et celui-ci, qui l'AFFICHE. Afficher n'est pas
 * lire au sens de la règle : rien de ce qui est écrit ici ne branche sur le
 * contenu d'une phrase.
 *
 * ── LES CHIFFRES AFFICHÉS NE VIENNENT JAMAIS DE LA PROSE ────────────────────
 *
 * Le nombre de signalements écartés est écrit par une fonction de la table des
 * libellés, à partir de `nbEcartes` — un compte de la structure. La phrase de
 * méthode du modèle se place à côté, et n'en porte aucun : le contrat de
 * sortie lui interdit tout chiffre, et le validateur le vérifie. Un lecteur
 * n'a donc jamais deux nombres à départager.
 */
import type { RapportBusiness, SectionRapport } from '../types.js';
import { STATUTS_SANS_RETEST } from './statuts.js';
import { LIBELLES_CATEGORIE, LIBELLES_GRAVITE, LIBELLES_RAPPORT, estLangueRapport, type LangueRapport } from './voix.js';

export interface OptionsRendu {
  /** URL scannée, affichée en tête. Absente : le rapport ne la mentionne pas. */
  url?: string;
}

/**
 * Langue de rendu. Un rapport dont la langue ne serait pas connue du rendu ne
 * peut pas arriver depuis le moteur (la structure n'est construite que sur une
 * langue supportée) ; la garde existe parce qu'un rapport peut aussi être
 * relu depuis un fichier JSON écrit par une version antérieure.
 */
/**
 * Caractères qui font d'un texte du BALISAGE Markdown actif.
 *
 * ── CE QUI EST ÉCHAPPÉ, ET POURQUOI TOUT L'EST ──────────────────────────────
 *
 * Les chemins d'URL sont écrits par le SITE inspecté : sans échappement, une
 * adresse comme `/[cliquez ici](http://ailleurs)` deviendrait un LIEN dans le
 * document remis au propriétaire du site, et `/**urgent**` un titre en gras.
 *
 * La PROSE l'est aussi, et c'est une correction de revue. N'échapper que les
 * localisations laissait le même chemin revenir intact deux lignes plus bas :
 * le modèle voit les chemins dans son bloc factuel, il peut les recopier dans
 * un titre ou un constat — par obéissance imparfaite, ou parce qu'une charge
 * l'y pousse, ce qui est très exactement le scénario S05. Une garde qui
 * neutralise un canal en en laissant un second ouvert ne garde rien.
 *
 * ── LES ADRESSES NUES, ET POURQUOI L'ÉCHAPPEMENT NE SUFFIT PAS ──────────────
 *
 * Échapper le balisage ferme la SYNTAXE de lien. Il ne ferme pas les liens
 * AUTOMATIQUES : la plupart des moteurs de rendu (GFM, markdown-it et marked
 * avec `linkify`) transforment une adresse NUE — `http://…`, `www.…` — en lien
 * cliquable sans qu'aucun caractère de balisage n'apparaisse. Le chemin d'une
 * page inspectée peut contenir un nom de domaine, et le rédacteur, à qui on
 * montre les chemins, peut le recopier. Le propriétaire du site recevrait
 * alors, sous notre marque, un lien cliquable vers un domaine choisi par le
 * site inspecté.
 *
 * On les enferme donc dans un SPAN DE CODE, qu'aucun moteur ne transforme en
 * lien. L'adresse reste lisible, intégralement, et se distingue même mieux du
 * reste de la phrase. Le motif ne connaît que des standards du web (schémas
 * d'URI, sous-domaine `www`) : le code a le droit de connaître LE WEB.
 *
 * ── CE QUI N'EST PAS ÉCHAPPÉ, ET POURQUOI ───────────────────────────────────
 *
 * Les PARENTHÈSES restent intactes : elles sont fréquentes dans une phrase
 * française, et les échapper abîmerait le texte pour rien. Une parenthèse ne
 * fabrique un lien que précédée d'un `](` — or `[` et `]` sont échappés, donc
 * la construction ne peut pas se former. On neutralise ce qui est dangereux,
 * pas ce qui y ressemble.
 */
const BALISAGE_MARKDOWN = /[\\`*_[\]<>#|~]/g;

/**
 * Une adresse NUE, au sens des moteurs qui « linkifient ». Standard du web,
 * pas de langue : un schéma d'URI suivi de `://`, ou le sous-domaine `www.`.
 */
const ADRESSE_NUE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/gi;

/** Le délimiteur d'un span de code ne peut pas vivre DANS le span. */
const ACCENT_GRAVE = /`/g;

/**
 * Neutralise le balisage Markdown d'une chaîne venue de la page, et enferme
 * ses adresses nues dans un span de code.
 *
 * Les deux traitements ne peuvent pas se composer : à l'intérieur d'un span de
 * code, une contre-oblique n'échappe rien, elle s'affiche. On découpe donc, et
 * chaque morceau reçoit le traitement qui lui revient.
 */
function echapper(valeur: string): string {
  let sortie = '';
  let curseur = 0;
  for (const trouvee of valeur.matchAll(ADRESSE_NUE)) {
    const debut = trouvee.index;
    sortie += echapperBalisage(valeur.slice(curseur, debut));
    sortie += `\`${trouvee[0].replace(ACCENT_GRAVE, '')}\``;
    curseur = debut + trouvee[0].length;
  }
  return sortie + echapperBalisage(valeur.slice(curseur));
}

function echapperBalisage(valeur: string): string {
  return valeur.replace(BALISAGE_MARKDOWN, (caractere) => `\\${caractere}`);
}

function langueDe(rapportBusiness: RapportBusiness): LangueRapport {
  return estLangueRapport(rapportBusiness.langue) ? rapportBusiness.langue : 'fr';
}

/**
 * Le libellé d'une valeur ÉNUMÉRÉE, sans faire confiance au type.
 *
 * Les tables de catégories et de gravités sont des `Record` fermés : sûres à
 * la compilation, nues à l'exécution. Or le rendu est justement l'endroit où
 * un rapport peut arriver depuis un JSON écrit par une version antérieure —
 * c'est l'hypothèse qui justifie déjà le repli de `langueDe`, et elle ne
 * s'arrêtait pas à la langue. Une catégorie disparue faisait lever
 * `Cannot read properties of undefined` : non pas une section dégradée, mais
 * le rapport ENTIER perdu, au moment précis où l'on relisait un ancien scan
 * pour comprendre une régression.
 *
 * À défaut de libellé, on affiche le CODE, échappé. C'est moins beau, et
 * c'est vrai : nous ne savons pas nommer cette catégorie-là dans cette
 * langue-là, et nous ne l'inventons pas.
 */
function libelleEnumere(
  table: Readonly<Record<string, Readonly<Record<LangueRapport, string>> | undefined>>,
  valeur: string,
  langue: LangueRapport,
): string {
  return table[valeur]?.[langue] ?? echapper(valeur);
}

function rendreSection(section: SectionRapport, langue: LangueRapport, rang: number, signalerMuette: boolean): string[] {
  const libelles = LIBELLES_RAPPORT[langue];
  const titre = section.titre === '' ? libelleEnumere(LIBELLES_CATEGORIE, section.categorie, langue) : section.titre;
  const pages = section.localisations
    .map((localisation) => {
      // Le CHEMIN vient du site ; les VIEWPORTS viennent de la configuration.
      // Seul le premier est échappé, et c'est exactement la frontière.
      const page = echapper(localisation.page);
      return localisation.viewports.length === 0 ? page : `${page} — ${localisation.viewports.join(', ')}`;
    })
    .join(' · ');

  const lignes = [
    `### ${rang}. ${echapper(titre)}`,
    '',
    `**${libelles.gravite}** : ${libelleEnumere(LIBELLES_GRAVITE, section.gravite, langue)} · ${libelleEnumere(LIBELLES_CATEGORIE, section.categorie, langue)}`,
    // `statutFormule` vient de la table de CODE : rien à échapper, et
    // l'échapper abîmerait une phrase que nous écrivons nous-mêmes.
    `**${libelles.statut}** : ${section.statutFormule}`,
    `**${libelles.pagesConcernees}** : ${pages}`,
    // L'HÔTE, posé par le code et non par le modèle (P2-2, contrat 3). Il vient
    // de la page, donc il s'échappe, exactement comme un chemin.
    ...(section.origine === undefined ? [] : [`**${libelles.serviceExterieur}** : ${echapper(section.origine)}`]),
    '',
  ];
  if (section.constat !== '') {
    lignes.push(`**${libelles.constat}** — ${echapper(section.constat)}`, '');
  }
  if (section.impact !== '') {
    lignes.push(`**${libelles.impact}** — ${echapper(section.impact)}`, '');
  }
  if (section.actionSuggeree !== '') {
    // Le mur a son libellé d'action PROPRE : « Ce qu'il faut vérifier », jamais
    // « faire corriger » qui présumerait un défaut (cahier P2-11 Q4, 2ᵉ source).
    const labelAction =
      section.murCouvrant === true
        ? libelles.actionLabelMurCouvrant
        : section.preuveFaible === true
          ? libelles.actionLabelPreuveFaible
          : libelles.action;
    lignes.push(`**${labelAction}** — ${echapper(section.actionSuggeree)}`, '');
  }
  // Une section sans prose dans un rapport QUI EN A ne se distingue autrement
  // que par ce qui lui manque, et deux sections muettes de même catégorie
  // portent jusqu'au même titre de repli. Le lecteur doit pouvoir la nommer.
  if (signalerMuette) {
    lignes.push(`_${libelles.sectionNonRedigee}_`, '');
  }
  return lignes;
}

export function rendreRapport(rapportBusiness: RapportBusiness, options: OptionsRendu = {}): string {
  const langue = langueDe(rapportBusiness);
  const libelles = LIBELLES_RAPPORT[langue];
  const lignes: string[] = [`# ${libelles.titre}`, ''];

  if (options.url !== undefined) {
    lignes.push(`\`${options.url.replace(/`/g, '')}\``, '');
  }
  // RIEN VÉRIFIÉ N'EST PAS RIEN TROUVÉ (P2-1, contrat 5). Trois rapports de la
  // campagne 6b disaient « aucune anomalie » alors que pas un groupe n'avait
  // été rejoué : deux par accident, un en enterrant un vrai défaut. Quand la
  // rejouabilité est nulle, c'est la PREMIÈRE ligne — avant la synthèse, avant
  // « aucune anomalie » — et c'est un texte à garantie sémantique (voix.ts).
  const rienVerifie = rapportBusiness.rejouabilite !== null && rapportBusiness.rejouabilite.groupes > 0 && rapportBusiness.rejouabilite.groupesRejoues === 0;
  if (rienVerifie) {
    lignes.push(`**${libelles.rienVerifie(rapportBusiness.nbNonVerifies ?? rapportBusiness.rejouabilite?.groupes ?? 0)}**`, '');
  }
  if (rapportBusiness.synthese !== '') {
    lignes.push(echapper(rapportBusiness.synthese), '');
  }
  // L'avertissement de mode dégradé ne s'affiche QUE s'il y avait quelque
  // chose à rédiger. Un site sans anomalie n'a pas de prose parce qu'il n'y a
  // rien à écrire, pas parce que la rédaction a échoué : le lui annoncer
  // serait un diagnostic faux sur un scan parfaitement réussi.
  if (rapportBusiness.sansProse && rapportBusiness.sections.length > 0) {
    lignes.push(`_${libelles.sansProse}_`, '');
  }

  // Le rapport PARTIEL : de la prose, mais pas partout. La rédaction se fait
  // en un appel sur un bloc de faits borné, et les sections qui n'y entrent
  // pas restent publiées sans explication. Ne rien dire laisserait le lecteur
  // incapable de distinguer « nous n'avons rien à en dire » de « la rédaction
  // s'est arrêtée là » — et sa synthèse, elle, a été écrite sans les voir.
  const nbMuettes = rapportBusiness.sections.length - rapportBusiness.nbSectionsRedigees;
  const partiel = !rapportBusiness.sansProse && nbMuettes > 0;
  if (partiel) {
    lignes.push(`_${libelles.partiellementRedige(nbMuettes, rapportBusiness.sections.length)}_`, '');
  }

  if (rapportBusiness.sections.length === 0) {
    lignes.push(libelles.sansAnomalie, '');
  } else {
    rapportBusiness.sections.forEach((section, rang) => {
      lignes.push(...rendreSection(section, langue, rang + 1, partiel && section.titre === ''));
    });
  }

  // LA LIGNE DE MÉTHODE. Le chiffre vient de la structure, toujours ; la
  // phrase du modèle, quand elle existe, se place à côté et jamais à la place.
  lignes.push(`## ${libelles.methode}`, '');
  const methode = [
    rapportBusiness.nbEcartes === null ? libelles.methodeIndisponible : libelles.ligneEcartes(rapportBusiness.nbEcartes),
  ];
  // Les signalements écartés SANS re-vérification ont leur phrase à eux. Les
  // fondre dans le compte précédent ferait dire au rapport que nos
  // re-vérifications ont tranché ce qu'elles n'ont jamais examiné.
  if (rapportBusiness.nbNonVerifies !== null && rapportBusiness.nbNonVerifies > 0) {
    methode.push(libelles.ligneNonVerifies(rapportBusiness.nbNonVerifies));
  }
  // Les constats PUBLIÉS sans re-test ont leur compte à eux (P2-1, contrat
  // 8) : un rapport fait surtout de découvertes ne doit pas se lire comme un
  // rapport vérifié. Le compte est lu sur les statuts, posés par le code.
  const nbDecouvertes = rapportBusiness.sections.filter((section) => STATUTS_SANS_RETEST.includes(section.statut)).length;
  if (nbDecouvertes > 0) {
    methode.push(libelles.ligneDecouvertes(nbDecouvertes));
  }
  // CE QUE LE MOTEUR A FAIT, pas seulement ce qu'il a vu (P2-3, contrat 7).
  if (rapportBusiness.nbRecouvrementsEcartes > 0) {
    methode.push(libelles.ligneEcartements(rapportBusiness.nbRecouvrementsEcartes));
  }
  // CE QUE NOUS N'AVONS PAS ESSAYÉ. Sans cette phrase, « aucune anomalie
  // retenue » se lirait « votre formulaire fonctionne » — alors que personne
  // ne l'a envoyé. Elle a sa place dans la méthode : c'est une limite de ce
  // que nous avons fait, pas un constat sur le site.
  if (!rapportBusiness.soumissionsTestees) {
    methode.push(libelles.soumissionsNonTestees);
  }
  if (rapportBusiness.ligneMethode !== '') {
    methode.push(echapper(rapportBusiness.ligneMethode));
  }
  lignes.push(methode.join(' '), '');

  return lignes.join('\n');
}
