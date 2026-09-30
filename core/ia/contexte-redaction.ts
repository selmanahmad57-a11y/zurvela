/**
 * Bornes, sérialisation, empreinte de contrat et clé d'un contexte de
 * RÉDACTION.
 *
 * Le pendant de `contexte-diagnostic.ts` pour la brique 5, avec une
 * différence de domicile qu'il faut dire : le contexte de rédaction n'est pas
 * construit ici. Il est construit par `core/rapport/faits.ts`, parce qu'il
 * dérive du rapport business — que `core/ia` ne connaît pas et n'a aucune
 * raison de connaître.
 *
 * ── LA BORNE EST STRUCTURELLE, ET C'EST TOUT L'ENJEU ────────────────────────
 *
 * Elle reçoit des SECTIONS, jamais un bloc déjà assemblé, et elle en retire
 * des ENTIÈRES. Une version antérieure tronquait la chaîne jointe au
 * caractère près : la coupe tombait au milieu d'une section, dont
 * l'identifiant restait pourtant énuméré, et le contrat exigeait alors du
 * modèle une prose sur des faits qu'il n'avait pas reçus. C'est
 * l'INVITATION À INVENTER que la brique existe pour rendre impossible — et le
 * seul cas où la borne n'était pas neutre, l'appelant indiscipliné, était
 * exactement celui où elle fabriquait cet état.
 *
 * Avec une borne structurelle, l'énumération est par construction ce que le
 * modèle a sous les yeux : `bornerContexteRedaction` rend un contexte dont
 * les sections et le bloc sérialisé sont la même chose, toujours.
 *
 * ── POURQUOI CE MODULE BORNE ALORS QUE SON CONSTRUCTEUR A DÉJÀ BORNÉ ────────
 *
 * Une borne de sécurité ne doit pas dépendre de la discipline de son
 * appelant. Elle est donc REFAITE au seuil de `core/ia`, sur le chemin du
 * prompt comme sur celui de la clé, et elle est IDEMPOTENTE — un contexte déjà
 * borné traverse inchangé, donc la clé de cassette ne dépend pas de l'endroit
 * où la borne a été appliquée.
 */
import type { ConfigRapport } from '../scanner/config.js';
import { hacherEntree } from './cle.js';
import type { ContexteRedaction, SectionFaits } from './index.js';
import { CHAMPS_PROSE_GLOBAUX, CHAMPS_PROSE_SECTION } from './schema-redaction.js';

/**
 * TOUS les séparateurs de ligne d'Unicode, neutralisés un par un.
 *
 * La classe est LARGE — RETOUR_LIGNE compris — parce qu'elle s'applique à des
 * LIGNES individuelles, jamais au bloc : une ligne ne contient pas de saut de
 * ligne, par définition. C'est la STRUCTURE qui porte la mise en page, pas
 * l'échappement. Un chemin d'URL qui apporterait un saut de ligne fabriquerait
 * sinon sa propre ligne, voire une fausse consigne présentée comme une ligne
 * de notre bloc.
 *
 * Pas de quantificateur, et c'est une propriété de LONGUEUR, pas
 * d'idempotence : chaque caractère devient une espace, donc une ligne garde
 * exactement sa taille. Le calcul d'occupation qui décide des sections
 * retenues (`tailleDe`) reste ainsi exact, et il l'est aussi bien avant
 * qu'après la borne. L'idempotence, elle, tiendrait de toute façon — après
 * une passe, aucun séparateur ne subsiste.
 */
const SEPARATEURS_DE_LIGNE = /[\r\n\v\f\u0085\u2028\u2029]/g;

/** Aplatit une ligne et la borne. */
function ligneBornee(ligne: string, maxChars: number): string {
  return ligne.replace(SEPARATEURS_DE_LIGNE, ' ').slice(0, Math.max(0, maxChars));
}

/**
 * Le bloc factuel, sérialisé — la forme EXACTE que le prompt affiche et que la
 * clé de cassette hache.
 *
 * Une seule fonction pour les deux usages, et c'est la condition du rejeu : si
 * le prompt et la clé sérialisaient chacun de leur côté, une réponse figée
 * pourrait être rejouée sur un prompt différent de celui qui l'a produite.
 */
export function serialiserContexteRedaction(contexte: ContexteRedaction): string {
  const lignes: string[] = [...contexte.enTete, ''];
  for (const section of contexte.sections) {
    lignes.push(`section ${section.id}`, ...section.lignes.map((ligne) => `  ${ligne}`), '');
  }
  return lignes.join('\n');
}

/** Longueur qu'une section occupe dans le bloc, indentation et séparateurs compris. */
function tailleDe(section: SectionFaits): number {
  return `section ${section.id}\n`.length + section.lignes.reduce((total, ligne) => total + ligne.length + 3, 0) + 1;
}

/**
 * Borne un contexte de rédaction : lignes aplaties et tronquées, puis sections
 * ENTIÈRES retirées de la fin jusqu'à tenir dans le plafond cumulé.
 *
 * Les sections évincées restent DANS le rapport, avec leurs faits, leur statut
 * et leurs localisations — elles n'auront simplement pas de prose. Un plafond
 * borne une dépense ; il ne fait pas disparaître une anomalie d'un rapport
 * destiné à celui qui la subit, et il ne fait JAMAIS inventer une phrase.
 */
export function bornerContexteRedaction(contexte: ContexteRedaction, config: ConfigRapport): ContexteRedaction {
  const enTete = contexte.enTete.map((ligne) => ligneBornee(ligne, Math.max(1, config.faitsMaxChars)));
  const candidates = contexte.sections.slice(0, Math.max(1, config.sectionsMax)).map(
    (section): SectionFaits => ({
      id: section.id,
      // `ligneMaxChars` et non une somme improvisée : la ligne des pages peut
      // porter `localisationsMaxParSection` chemins entiers, bien au-delà de
      // `cheminMaxChars + symptomesMaxChars`. Emprunter cette somme tronquait
      // des localisations LÉGITIMES — des pages où le défaut se manifeste —
      // en silence, et un test confronte désormais le plafond à la pire ligne
      // que la configuration autorise.
      lignes: section.lignes.map((ligne) => ligneBornee(ligne, Math.max(1, config.ligneMaxChars))),
    }),
  );

  const plafond = Math.max(0, config.faitsMaxChars);
  let occupe = enTete.reduce((total, ligne) => total + ligne.length + 1, 0) + 1;
  const retenues: SectionFaits[] = [];
  for (const section of candidates) {
    const taille = tailleDe(section);
    if (occupe + taille > plafond) {
      break;
    }
    occupe += taille;
    retenues.push(section);
  }

  return { langue: contexte.langue, enTete, sections: retenues };
}

/**
 * Empreinte de ce qui compose le PROMPT et l'APPEL au-delà du fichier de
 * prompt.
 *
 * `VERSION` ne protège que le fichier de prompt de rédaction en service (`prompts/redaction/v1.ts`). Deux autres sources
 * composent l'appel sans y figurer : les BORNES de config, qui décident de ce
 * que le modèle voit, et la liste des CHAMPS DE PROSE, qui vit en code et
 * s'écrit en toutes lettres dans les instructions comme dans le contrat de
 * sortie — ajouter un cinquième champ changerait le prompt et le schéma sans
 * changer une ligne du fichier de prompt, et une clé aveugle rejouerait une
 * réponse produite sous un AUTRE contrat.
 *
 * `relancesMax` et `langueRapport` en sont ABSENTS, pour deux raisons
 * différentes : le premier ne compose ni le prompt ni l'appel, et l'inclure
 * périmerait tout le parc au premier réglage d'une tolérance ; la seconde est
 * déjà DANS la clé, par le contexte — c'est le contexte qui porte la langue du
 * scan, pas le défaut de configuration.
 */
export function empreinteContratRapport(config: ConfigRapport): string {
  return hacherEntree([
    config.sectionsMax,
    config.localisationsMaxParSection,
    config.faitsMaxChars,
    config.cheminMaxChars,
    config.symptomesMaxChars,
    config.ligneMaxChars,
    config.maxTokensReponse,
    [...CHAMPS_PROSE_SECTION],
    [...CHAMPS_PROSE_GLOBAUX],
  ]);
}

/**
 * Sérialisation du contexte pour le hachage : un TABLEAU à ordre fixe, jamais
 * un objet — l'ordre des clés d'un objet est une propriété du code qui le
 * construit, donc une source de dérive silencieuse.
 *
 * Le BLOC SÉRIALISÉ y entre, et pas seulement la structure : c'est lui que le
 * modèle lit, donc c'est lui qui décide de l'identité d'une réponse. Une clé
 * qui ne hacherait que la structure laisserait un changement de mise en page
 * du bloc modifier le prompt sans changer la clé.
 */
export function entreeCleDepuisRedaction(contexte: ContexteRedaction): readonly unknown[] {
  return [contexte.langue, contexte.sections.map((section) => section.id), serialiserContexteRedaction(contexte)];
}

/** Les identifiants énumérés, dans l'ordre : le contrat de sortie les porte en `enum`. */
export function identifiantsSections(contexte: ContexteRedaction): string[] {
  return contexte.sections.map((section) => section.id);
}
