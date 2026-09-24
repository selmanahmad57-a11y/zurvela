/**
 * RAPPORT BUSINESS (brique 5) — la dernière étape du scan, et la seule qui ne
 * regarde pas le site.
 *
 * Elle part du `Rapport` technique, et de lui seul : aucune page n'est
 * rechargée, aucun signal n'est relu, aucun réseau n'est touché en dehors de
 * l'unique appel de rédaction. C'est ce qui la rend rejouable et notable comme
 * les trois autres surfaces d'IA du moteur.
 *
 * ── DEUX MOITIÉS, ET UNE SEULE PEUT MANQUER ─────────────────────────────────
 *
 * La STRUCTURE est produite en code, toujours : sections, statuts, gravités,
 * localisations, nombre de signalements écartés. La PROSE est demandée à un
 * modèle, parfois. Quand elle manque — pas de clé, pas de cassette, réponse
 * hors contrat, aucune anomalie à décrire — le rapport est publié quand même,
 * marqué `sansProse`, et il reste lisible. C'est la constitution §4 à son
 * point le plus visible : le moteur reste utile sans IA, et ici cela se voit à
 * l'œil nu.
 */
import type { Rapport, RapportBusiness } from '../types.js';
import type { ConfigRapport } from '../scanner/config.js';
import type { ClientIa } from '../ia/index.js';
import { contexteRedaction, normaliserFaits } from './faits.js';
import { construireStructure } from './structure.js';
import { LANGUES_RAPPORT, estLangueRapport, type LangueRapport } from './voix.js';

export { construireStructure, localisationsLisibles, compterEcartes, type StructureConstruite } from './structure.js';
export { contexteRedaction, normaliserFaits, type FaitsNormalises, type SectionNormalisee } from './faits.js';
export { AUCUNE_VERIFICATION, STATUT_PAR_VERDICT, chiffresDe, statutDe, type ChiffresStatut } from './statuts.js';
export {
  FORMULATIONS,
  LANGUES_RAPPORT,
  LIBELLES_CATEGORIE,
  LIBELLES_GRAVITE,
  LIBELLES_RAPPORT,
  estLangueRapport,
  formulerStatut,
  type LangueRapport,
} from './voix.js';
export { rendreRapport } from './rendu.js';

/** Journal : une anomalie retenue à laquelle aucun statut honnête ne correspond. */
export const EVENEMENT_SECTION_NON_SITUEE = 'rapport.section-non-situee';
/** Journal : la langue demandée n'a pas de formulations vérifiées ; celle de la config s'applique. */
export const EVENEMENT_LANGUE_NON_SUPPORTEE = 'rapport.langue-non-supportee';
/** Journal : aucune anomalie retenue, donc rien à rédiger — et aucun appel payé. */
export const EVENEMENT_SANS_SECTION = 'rapport.sans-section';
/** Journal : la rédaction n'a pas abouti ; le rapport reste structurel. */
export const EVENEMENT_SANS_PROSE = 'rapport.sans-prose';
/** Journal : l'échéance du scan était dépassée ; aucun appel de rédaction n'a été engagé. */
export const EVENEMENT_ECHEANCE_DEPASSEE = 'rapport.echeance-depassee';
/** Raison technique stable : la rédaction a été renoncée faute de temps. */
export const RAISON_ECHEANCE_REDACTION = 'echeance-scan-depassee';
/** Journal : la rédaction a abouti. */
export const EVENEMENT_REDIGE = 'rapport.redige';

export interface ParametresRapportBusiness {
  rapport: Rapport;
  config: ConfigRapport;
  ia: ClientIa;
  journaliser: (type: string, details?: unknown) => void;
  /** Langue demandée pour CE scan (`OptionsScan.langueRapport`) ; absente = celle de la config. */
  langueDemandee?: string;
  /**
   * Instant (epoch ms) avant lequel le scan doit avoir rendu son rapport.
   *
   * La rédaction est la DERNIÈRE étape : quand elle commence, le budget de
   * temps est déjà largement consommé, et c'est l'appel le plus long du scan.
   * Sans cette borne, un scan pouvait dépasser son `timeoutMs` par la seule
   * faute d'une rédaction lente — et le rapport TECHNIQUE, déjà complet,
   * aurait été perdu avec lui.
   *
   * OBLIGATOIRE, et `null` pour dire « aucune échéance ». Le champ a d'abord
   * été optionnel : supprimer la ligne qui le passe depuis le scanner
   * compilait, et toute la suite passait — la seule porte qui empêche
   * d'engager un appel payant sur un budget déjà consommé pouvait mourir sans
   * qu'un test ne bronche. Un appelant peut renoncer à l'échéance ; il ne peut
   * plus l'oublier.
   */
  echeance: number | null;
  /** Horloge injectable : une échéance ne se teste pas en attendant vraiment. */
  maintenant?: () => number;
}

export interface ResultatRapportBusiness {
  rapportBusiness: RapportBusiness;
  /** Coût de l'appel de rédaction. Nul quand il n'y en a pas eu — y compris quand il a échoué sans dépenser. */
  coutApi: number;
}

/**
 * Langue effective du rapport.
 *
 * Une langue demandée hors de `LANGUES_RAPPORT` n'est pas silencieusement
 * acceptée : nous n'aurions aucune formulation de statut vérifiée à lui
 * servir, et une formulation non relue est une promesse dont on ne connaît pas
 * la teneur. On retombe sur celle de la configuration — validée au chargement,
 * donc toujours supportée — et on le DIT au journal. Le rapport existe et est
 * juste ; le lecteur du journal sait qu'il n'est pas dans la langue demandée,
 * et le banc, qui compare la langue rendue à la langue demandée, le voit rouge.
 */
export function resoudreLangue(
  langueDemandee: string | undefined,
  config: ConfigRapport,
  journaliser: (type: string, details?: unknown) => void,
): LangueRapport {
  const defaut = config.langueRapport;
  if (!estLangueRapport(defaut)) {
    // Le schéma ne peut pas connaître la liste (elle vit en code) : la
    // configuration est donc vérifiée ICI, au premier usage, plutôt que jamais.
    throw new Error(
      `config/rapport.json : langueRapport « ${defaut} » n'a pas de formulations vérifiées (langues connues : ${LANGUES_RAPPORT.join(', ')})`,
    );
  }
  if (langueDemandee === undefined || langueDemandee === defaut) {
    return defaut;
  }
  if (estLangueRapport(langueDemandee)) {
    return langueDemandee;
  }
  journaliser(EVENEMENT_LANGUE_NON_SUPPORTEE, { demandee: langueDemandee, appliquee: defaut });
  return defaut;
}

export async function redigerRapportBusiness(
  parametres: ParametresRapportBusiness,
): Promise<ResultatRapportBusiness> {
  const { rapport, config, ia, journaliser } = parametres;
  const langue = resoudreLangue(parametres.langueDemandee, config, journaliser);
  const { rapportBusiness, nonSituees } = construireStructure(rapport, langue);

  // Une anomalie retenue sans statut publiable est une incohérence du
  // protocole. Elle n'est ni publiée sous une formulation fausse, ni perdue en
  // silence : elle est NOMMÉE au journal (constitution §5).
  for (const anomalie of nonSituees) {
    journaliser(EVENEMENT_SECTION_NON_SITUEE, {
      detecteur: anomalie.detecteur,
      urlOuEtape: anomalie.urlOuEtape,
      verdict: anomalie.verdict,
      motif: anomalie.motif,
    });
  }

  if (rapportBusiness.sections.length === 0) {
    // Rien à rédiger, et donc rien à payer : un site sain ne doit pas coûter
    // un appel de modèle pour qu'on lui écrive qu'il va bien. Le rendu sait
    // dire « aucune anomalie retenue » sans prose.
    journaliser(EVENEMENT_SANS_SECTION, { langue, nbEcartes: rapportBusiness.nbEcartes });
    return { rapportBusiness, coutApi: 0 };
  }

  // L'ÉCHÉANCE est consultée AVANT de dépenser, jamais après : un appel engagé
  // hors délai coûte de l'argent pour un rapport que personne n'attendra plus.
  const maintenant = parametres.maintenant ?? ((): number => Date.now());
  if (parametres.echeance !== null && maintenant() >= parametres.echeance) {
    journaliser(EVENEMENT_ECHEANCE_DEPASSEE, {
      langue,
      raison: RAISON_ECHEANCE_REDACTION,
      nbSections: rapportBusiness.sections.length,
    });
    return { rapportBusiness, coutApi: 0 };
  }

  const contexte = contexteRedaction(normaliserFaits(rapportBusiness, rapport, config));
  const resultat = await ia.rediger(contexte);
  if (!resultat.disponible) {
    // Le coût DÉPENSÉ reste compté même quand rien n'en est sorti : un coût
    // invisible ment (APPRENTISSAGES n°3).
    journaliser(EVENEMENT_SANS_PROSE, {
      langue,
      raison: resultat.raison,
      message: resultat.message,
      coutApi: resultat.coutApi ?? 0,
      nbSections: rapportBusiness.sections.length,
    });
    return { rapportBusiness, coutApi: resultat.coutApi ?? 0 };
  }

  const prose = new Map(resultat.valeur.sections.map((section) => [section.sectionId, section]));
  const sections = rapportBusiness.sections.map((section) => {
    const ecrite = prose.get(section.id);
    // Les FAITS sont recopiés depuis la section existante et la prose est
    // posée par-dessus : le modèle ne peut pas les remplacer, il ne peut que
    // remplir ce que la structure a laissé vide.
    return ecrite === undefined
      ? section
      : {
          ...section,
          titre: ecrite.titre,
          constat: ecrite.constat,
          impact: ecrite.impact,
          actionSuggeree: ecrite.actionSuggeree,
        };
  });

  const nbRedigees = sections.filter((section) => section.titre !== '').length;
  // CE QUE LE RÉDACTEUR N'A PAS VU. Le rapport publie toutes les pages d'une
  // section ; le bloc factuel en montre au plus `localisationsMaxParSection`.
  // C'est par le CHEMIN d'une page qu'un site peut adresser une phrase à notre
  // rédacteur : cette borne est donc aussi celle par laquelle une charge peut
  // disparaître avant de l'atteindre, et le banc doit pouvoir le savoir.
  const nbLocalisationsMasquees = rapportBusiness.sections.reduce(
    (total, section) => total + Math.max(0, section.localisations.length - Math.max(1, config.localisationsMaxParSection)),
    0,
  );
  journaliser(EVENEMENT_REDIGE, {
    langue,
    nbSections: sections.length,
    nbSectionsRedigees: nbRedigees,
    nbLocalisationsMasquees,
    coutApi: resultat.coutApi,
    provenance: resultat.valeur.provenance,
  });

  return {
    rapportBusiness: {
      ...rapportBusiness,
      synthese: resultat.valeur.synthese,
      ligneMethode: resultat.valeur.ligneMethode,
      sections,
      provenance: resultat.valeur.provenance,
      nbSectionsRedigees: nbRedigees,
      nbLocalisationsMasquees,
      sansProse: false,
    },
    coutApi: resultat.coutApi,
  };
}
