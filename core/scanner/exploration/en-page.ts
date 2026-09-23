/**
 * Scripts exécutés DANS la page (via `page.evaluate`) : le seul code du
 * scanner qui lit le DOM. Ils ne renvoient que des structures pures
 * (localisation structurelle, rectangles, listes, horodatages) — jamais de
 * texte visible, à la seule exception de `lireDeclencheur`, réservée au
 * filtre d'actions interdites.
 *
 * Contraintes (constitution §3) : la fonction évaluée est une fonction
 * TypeScript sérialisée par Playwright, jamais une chaîne construite ; ses
 * constantes (sélecteurs, nom du tampon, bornes) lui sont passées en
 * ARGUMENT ; les sélecteurs bâtis à partir de données de page (balise, id,
 * name, type) sont échappés par CSS.escape. Le contenu de la page reste une
 * donnée : rien de ce qui en sort n'est jamais interprété comme du code côté
 * Node.
 *
 * Toute évaluation peut être bornée par un délai (`delaiMs`) : une page
 * dont le fil principal ne répond plus (navigation pendante, script
 * bloquant) ne bloque jamais le scan.
 */
/// <reference lib="dom" />
import type { Page } from 'playwright';
import type { ChampFormulaire, DescriptionFormulaire, LocalisationElement } from '../../types.js';
import type { TamponMutations } from '../navigateur.js';

/** Éléments interactifs (standards HTML/ARIA) soumis au contrôle géométrique. */
export const SELECTEURS_INTERACTIFS = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link]';

/** Attributs techniques conservés dans une LocalisationElement (plus tout `aria-*`). */
export const ATTRIBUTS_CONSERVES = ['id', 'name', 'type', 'role', 'href', 'action', 'method', 'autocomplete', 'for'];

/**
 * Attributs de NOMMAGE au sens du standard (HTML `alt`/`title`, ARIA
 * `aria-label`) : ce qui donne son nom perçu à un lien dont le contenu rendu
 * est une icône. Du WEB, pas du MONDE (constitution §2) — le code ne connaît
 * aucun mot, seulement les attributs où un nom se trouve.
 */
export const ATTRIBUTS_NOMMAGE = ['alt', 'aria-label', 'title'];

/**
 * Noms de métadonnées standard (HTML et Open Graph) retenus pour le
 * profilage. Même nature que `ATTRIBUTS_CONSERVES` : des jetons du WEB, pas
 * du MONDE (constitution §2) — aucun mot de langue naturelle, aucune
 * connaissance de secteur. Ce que le site y met reste une DONNÉE NON FIABLE.
 */
export const METADONNEES_CONSERVEES = [
  'description',
  'keywords',
  'author',
  'application-name',
  'generator',
  'og:title',
  'og:description',
  'og:site_name',
  'og:type',
];

/**
 * Ce que la page rend au profilage : du TEXTE, jamais de balisage. C'est la
 * surface d'injection minimale voulue par le cahier (§3) — le HTML brut
 * exposerait le modèle aux attributs, aux scripts et aux commentaires sans
 * rien lui apprendre de plus sur la nature du site.
 */
export interface ExtractionTexte {
  /** `document.title`, vide s'il n'y en a pas. */
  titre: string;
  /** Attribut `lang` du document : un indice technique, pas une vérité. */
  langueDeclaree: string | null;
  /** Métadonnées retenues, clé en minuscules → contenu. */
  metadonnees: Record<string, string>;
  /**
   * Texte RENDU du corps (`innerText`), borné en page.
   *
   * Ce qu'il exclut, exactement : le balisage, les scripts, les styles, les
   * sous-arbres non rendus (`display:none`, `content-visibility:hidden`) et le
   * texte en `visibility:hidden`. Ce qu'il INCLUT, et qui n'est pas visible
   * pour un humain : le texte hors écran, transparent, de taille nulle, de la
   * couleur du fond, écrêté, ou marqué `aria-hidden`.
   *
   * Cette précision n'est pas cosmétique : c'est la seule entrée de contenu
   * non fiable dans un prompt. Annoncer « ni élément masqué » y installerait
   * une confiance que la mesure dément, alors que le vecteur d'injection
   * réaliste est précisément le texte adressé au modèle seul. Tout ce qui sort
   * d'ici est une DONNÉE NON FIABLE (constitution §3) — c'est au prompt de la
   * baliser, pas à l'extraction de la censurer.
   */
  texteVisible: string;
  /** true si le texte visible a été coupé à la borne. */
  tronque: boolean;
}

export interface ExtractionPage {
  /** `href` résolus de tous les liens, bruts (le filtrage d'origine se fait côté Node). */
  liens: string[];
  /**
   * Libellé visible de chaque lien, au MÊME index que `liens`. C'est du
   * CONTENU DE PAGE (constitution §3) : une donnée non fiable, transportée et
   * bornée, jamais interprétée. L'énumération des actions la montre au modèle
   * tronquée — c'est par elle que la page lui parle, donc la surface
   * d'injection première de la navigation IA.
   */
  libellesLiens: string[];
  formulaires: DescriptionFormulaire[];
  /** Champs non actionnables (masqués, désactivés, en lecture seule) laissés hors des formulaires. */
  champsIgnores: number;
}

export interface EtatImage {
  /** URL de la ressource chargée ; vide si l'image n'a aucune source (aucune requête n'a eu lieu). */
  ressource: string;
  element: LocalisationElement;
  complete: boolean;
  largeurNaturelle: number;
  hauteurNaturelle: number;
}

export interface Recouvrement {
  element: LocalisationElement;
  intercepteur: LocalisationElement | null;
}

export interface ResultatGeometrie {
  recouvrements: Recouvrement[];
  /** true si le contrôle s'est arrêté avant d'avoir examiné tous les éléments (borne ou budget). */
  tronque: boolean;
  examines: number;
}

export interface MutationLue {
  /** Epoch ms (performance.timeOrigin + performance.now()). */
  t: number;
  /** true si la cible est dans la zone de l'action (formulaire et son parent). */
  enZone: boolean;
  /** true si la cible mutait déjà spontanément avant l'action (bruit de fond). */
  fond: boolean;
}

export interface LectureMutations {
  mutations: MutationLue[];
  /** Mutations comptées mais non conservées (tampon plein), dont celles hors bruit de fond. */
  excedent: number;
  excedentHorsFond: number;
}

/** Ce que le filtre d'actions lit sur un déclencheur : texte visible (nom accessible) et attributs examinés. */
export interface LectureDeclencheur {
  texte: string | null;
  attributs: Record<string, string>;
}

/** Validité native d'un formulaire avant sa soumission (Constraint Validation API, standard HTML). */
export interface ValiditeFormulaire {
  /** false si `novalidate` / `formnovalidate` ou déclencheur non soumetteur : le navigateur ne bloquera pas. */
  validationActive: boolean;
  /** Sélecteurs des champs qui bloqueraient la soumission. */
  champsInvalides: string[];
}

type Commande =
  | { commande: 'page'; attributsConserves: string[]; attributsNommage: string[] }
  | { commande: 'texte'; maxChars: number; metadonnees: string[] }
  | { commande: 'images'; attributsConserves: string[] }
  | {
      commande: 'geometrie';
      attributsConserves: string[];
      selecteursInteractifs: string;
      selecteur: string | null;
      max: number;
      budgetMs: number;
    }
  | { commande: 'mutations.lire'; nomTampon: string; selecteurZone: string | null }
  | { commande: 'mutations.derniere'; nomTampon: string }
  | { commande: 'mutations.vider'; nomTampon: string }
  | { commande: 'declencheur'; selecteur: string; attributs: string[]; attributsDescendants: string[]; texteVisible: boolean }
  | { commande: 'validite'; selecteurFormulaire: string; selecteurDeclencheur: string | null };

/**
 * Point d'entrée unique en page. Une seule fonction pour que `localiser`
 * soit le même algorithme partout : Playwright sérialise la fonction, ses
 * auxiliaires doivent donc être définis à l'intérieur.
 */
function enPage(arg: Commande): unknown {
  // Auxiliaires en MÉTHODES d'un objet, pas en fonctions imbriquées : un
  // bundler qui conserve les noms (tsx/esbuild `keepNames`) enveloppe les
  // fonctions nommées d'un appel à `__name`, inexistant dans la page.
  const aide = {
    attributsDe(el: Element, conserves: string[]): Record<string, string> {
      const attributs: Record<string, string> = {};
      for (const nom of el.getAttributeNames()) {
        if (conserves.includes(nom) || nom.startsWith('aria-')) {
          attributs[nom] = el.getAttribute(nom) ?? '';
        }
      }
      return attributs;
    },

    /** Segment d'un élément : balise + name/type discriminant + rang parmi les frères de même balise si nécessaire. */
    segmentDe(el: Element): string {
      // La balise est une donnée de page (`<o:p>` du HTML exporté de Word, `<fb:like>`) : échappée comme le reste.
      const balise = CSS.escape(el.tagName.toLowerCase());
      const name = el.getAttribute('name');
      const type = el.getAttribute('type');
      // Attribut discriminant (name, sinon type) : le rang n'est ajouté que si des frères de même balise le partagent.
      const attribut = name !== null && name !== '' ? 'name' : type !== null && type !== '' ? 'type' : null;
      const valeur = attribut === null ? null : el.getAttribute(attribut);
      let segment = balise;
      if (attribut !== null && valeur !== null) {
        segment += `[${attribut}="${CSS.escape(valeur)}"]`;
      }
      const parent = el.parentElement;
      if (parent !== null) {
        const memeBalise = Array.from(parent.children).filter((frere) => frere.tagName === el.tagName);
        const semblables = attribut === null ? memeBalise : memeBalise.filter((frere) => frere.getAttribute(attribut) === valeur);
        if (semblables.length > 1) {
          segment += `:nth-of-type(${memeBalise.indexOf(el) + 1})`;
        }
      }
      return segment;
    },

    selecteurDe(el: Element): string {
      const segments: string[] = [];
      let courant: Element | null = el;
      while (courant !== null) {
        const id = courant.getAttribute('id');
        if (id !== null && id !== '') {
          segments.unshift(`#${CSS.escape(id)}`);
          break;
        }
        segments.unshift(aide.segmentDe(courant));
        if (courant === document.body || courant === document.documentElement) {
          break;
        }
        courant = courant.parentElement;
      }
      return segments.join(' > ');
    },

    localiser(el: Element, conserves: string[]): LocalisationElement {
      return { balise: el.tagName.toLowerCase(), selecteur: aide.selecteurDe(el), attributs: aide.attributsDe(el, conserves) };
    },

    typeDe(el: Element): string {
      const balise = el.tagName.toLowerCase();
      if (balise === 'input') {
        const type = (el.getAttribute('type') ?? '').trim().toLowerCase();
        return type === '' ? 'text' : type;
      }
      return balise;
    },

    /** Type effectif d'un bouton : un `type` absent ou inconnu vaut `submit` (standard HTML). */
    typeBouton(el: Element): string {
      const balise = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') ?? '').trim().toLowerCase();
      if (balise === 'input') {
        return type;
      }
      return type === 'button' || type === 'reset' ? type : 'submit';
    },

    estChamp(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
      const balise = el.tagName.toLowerCase();
      return balise === 'input' || balise === 'select' || balise === 'textarea';
    },

    estBouton(el: Element): boolean {
      const balise = el.tagName.toLowerCase();
      return balise === 'button' || balise === 'input';
    },

    /** Un bouton qui SOUMET (submit ou image) : celui que le navigateur activerait, formaction compris. */
    estSoumetteur(el: Element): boolean {
      const type = aide.typeBouton(el);
      return type === 'submit' || type === 'image';
    },

    /**
     * Champ que le robot peut remplir : ni désactivé, ni en lecture seule, ni
     * masqué (propriétés structurelles ; `checkVisibility` quand le navigateur
     * l'offre). Un champ masqué attendrait tout le délai de saisie pour rien.
     */
    estActionnable(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
      if (el.disabled || ('readOnly' in el && el.readOnly)) {
        return false;
      }
      const verifier = (el as unknown as { checkVisibility?: () => boolean }).checkVisibility;
      return typeof verifier === 'function' ? verifier.call(el) : true;
    },

    resoudre(url: string | null): string {
      try {
        return new URL(url ?? '', document.baseURI).href;
      } catch {
        return url ?? '';
      }
    },

    /**
     * Boutons d'un formulaire en ordre d'arbre : `form.elements` EXCLUT les
     * `input[type=image]` (standard HTML), qui sont pourtant des boutons de
     * soumission activés par la soumission implicite, avec leur `formaction`.
     * On les ajoute (dans le formulaire ou associés par `form=`).
     */
    boutonsDe(form: HTMLFormElement): Element[] {
      const boutons = new Set<Element>(Array.from(form.elements).filter((el) => aide.estBouton(el)));
      for (const image of Array.from(form.querySelectorAll('input[type=image]'))) {
        boutons.add(image);
      }
      const id = form.getAttribute('id');
      if (id !== null && id !== '') {
        for (const image of Array.from(document.querySelectorAll(`input[type=image][form="${CSS.escape(id)}"]`))) {
          boutons.add(image);
        }
      }
      return Array.from(boutons).sort((a, b) => {
        const position = a.compareDocumentPosition(b);
        return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? -1 : (position & Node.DOCUMENT_POSITION_PRECEDING) !== 0 ? 1 : 0;
      });
    },

    decrireFormulaire(form: HTMLFormElement, conserves: string[]): { formulaire: DescriptionFormulaire; ignores: number } {
      const champs: ChampFormulaire[] = [];
      let ignores = 0;
      for (const el of Array.from(form.elements)) {
        if (!aide.estChamp(el)) {
          continue;
        }
        const type = aide.typeDe(el);
        if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
          continue;
        }
        if (type !== 'hidden' && !aide.estActionnable(el)) {
          ignores += 1;
          continue;
        }
        const autocomplete = (el.getAttribute('autocomplete') ?? '').trim().toLowerCase();
        const champ: ChampFormulaire = {
          localisation: aide.localiser(el, conserves),
          type,
          autocomplete: autocomplete === '' ? null : autocomplete,
          requis: el.required || el.getAttribute('aria-required') === 'true',
        };
        if (el instanceof HTMLSelectElement) {
          champ.options = Array.from(el.options).map((option) => option.value);
        }
        champs.push(champ);
      }
      const boutons = aide.boutonsDe(form);
      const soumission = boutons.find((el) => aide.estSoumetteur(el));
      const declencheur = soumission ?? boutons.find((el) => aide.typeBouton(el) === 'button') ?? null;
      const formulaire: DescriptionFormulaire = {
        localisation: aide.localiser(form, conserves),
        methode: (form.getAttribute('method') ?? 'get').trim().toLowerCase(),
        action: aide.resoudre(form.getAttribute('action')),
        champs,
        declencheur: declencheur === null ? null : aide.localiser(declencheur, conserves),
      };
      return { formulaire, ignores };
    },

    tampon(nom: string): TamponMutations | undefined {
      return (window as unknown as Record<string, TamponMutations | undefined>)[nom];
    },

    /** Contenu généré d'un pseudo-élément, s'il est une chaîne (sinon `none`, `normal`, `url(...)`). */
    contenuGenere(el: Element, pseudo: string): string | null {
      const contenu = getComputedStyle(el, pseudo).content;
      if (contenu.length >= 2 && (contenu.startsWith('"') || contenu.startsWith("'")) && contenu.endsWith(contenu[0] ?? '')) {
        return contenu.slice(1, -1);
      }
      return null;
    },

    /**
     * Nom perçu d'un déclencheur, sans lire d'autre texte de page que le sien :
     * son texte rendu, le texte des éléments qu'il référence par
     * `aria-labelledby`, les attributs de nommage de ses descendants (icône
     * avec `alt`, `aria-label`, `title`), le `<title>` SVG descendant, et le
     * contenu CSS généré (`::before` / `::after`). Un bouton-icône n'a souvent
     * que cela pour libellé.
     */
    nomPercu(el: Element, attributsDescendants: string[]): string {
      const morceaux: string[] = [];
      if (el instanceof HTMLElement) {
        morceaux.push(el.innerText);
      }
      for (const jeton of (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter((j) => j !== '')) {
        const reference = document.getElementById(jeton);
        if (reference !== null) {
          morceaux.push(reference.textContent ?? '');
        }
      }
      for (const descendant of Array.from(el.querySelectorAll('*'))) {
        for (const nom of attributsDescendants) {
          const valeur = descendant.getAttribute(nom);
          if (valeur !== null) {
            morceaux.push(valeur);
          }
        }
        if (descendant instanceof SVGTitleElement) {
          morceaux.push(descendant.textContent ?? '');
        }
      }
      for (const pseudo of ['::before', '::after']) {
        const contenu = aide.contenuGenere(el, pseudo);
        if (contenu !== null) {
          morceaux.push(contenu);
        }
      }
      return morceaux.join('\n');
    },
  };

  switch (arg.commande) {
    case 'page': {
      const ancres = Array.from(document.querySelectorAll('a[href]'));
      const liens = ancres.map((a) => aide.resoudre(a.getAttribute('href')));
      // Le libellé est du CONTENU : il est lu, jamais interprété. Le nom perçu
      // d'abord (texte rendu, icône nommée), les attributs de nommage portés
      // par le lien lui-même en secours.
      const libellesLiens = ancres.map((a) => {
        const percu = aide.nomPercu(a, arg.attributsNommage).trim();
        if (percu !== '') {
          return percu;
        }
        for (const nom of arg.attributsNommage) {
          const valeur = (a.getAttribute(nom) ?? '').trim();
          if (valeur !== '') {
            return valeur;
          }
        }
        return '';
      });
      const formulaires: DescriptionFormulaire[] = [];
      let champsIgnores = 0;
      for (const form of Array.from(document.forms)) {
        const { formulaire, ignores } = aide.decrireFormulaire(form, arg.attributsConserves);
        formulaires.push(formulaire);
        champsIgnores += ignores;
      }
      const resultat: ExtractionPage = { liens, libellesLiens, formulaires, champsIgnores };
      return resultat;
    }
    case 'texte': {
      // Le PROFILAGE lit du texte, et seulement du texte. `innerText` rend le
      // texte RENDU : ni balisage, ni script, ni style, ni sous-arbre
      // `display:none` ou `content-visibility:hidden`, ni texte en
      // `visibility:hidden`. Le masquage purement visuel — hors écran,
      // transparent, taille nulle, couleur du fond, écrêté, `aria-hidden` —
      // n'est PAS un filtre : ce texte-là est collecté. Tout ce qui en sort
      // est une DONNÉE NON FIABLE (constitution §3) : rien n'est interprété
      // ici, ni côté Node.
      const metadonnees: Record<string, string> = {};
      for (const meta of Array.from(document.querySelectorAll('meta'))) {
        const nom = (meta.getAttribute('name') ?? meta.getAttribute('property') ?? '').trim().toLowerCase();
        const contenu = meta.getAttribute('content');
        if (nom !== '' && contenu !== null && contenu !== '' && arg.metadonnees.includes(nom)) {
          metadonnees[nom] = contenu;
        }
      }
      const langue = (document.documentElement.getAttribute('lang') ?? '').trim();
      // `document.body` est absent d'un document non HTML (XML servi tel quel).
      const corps: HTMLElement | null = document.body;
      const texte = corps === null ? '' : corps.innerText;
      const resultat: ExtractionTexte = {
        titre: document.title,
        langueDeclaree: langue === '' ? null : langue,
        metadonnees,
        // Borne posée EN PAGE : une page-catalogue ne fait pas transiter des
        // mégaoctets de texte vers Node pour être tronquée ensuite.
        texteVisible: texte.slice(0, arg.maxChars),
        tronque: texte.length > arg.maxChars,
      };
      return resultat;
    }
    case 'images': {
      // Une image sans `src` (ou `src=""`, motif des bibliothèques de chargement
      // différé) n'a demandé aucune ressource : sa ressource est vide, jamais
      // l'URL du document.
      const etats: EtatImage[] = Array.from(document.images).map((img) => {
        const src = img.getAttribute('src');
        const ressource = img.currentSrc !== '' ? img.currentSrc : src !== null && src !== '' ? aide.resoudre(src) : '';
        return {
          ressource,
          element: aide.localiser(img, arg.attributsConserves),
          complete: img.complete,
          largeurNaturelle: img.naturalWidth,
          hauteurNaturelle: img.naturalHeight,
        };
      });
      return etats;
    }
    case 'geometrie': {
      // Point de clic = centre du rectangle après défilement ; couvert si un
      // autre élément reçoit ce point. Ne comptent pas : la cible, un de ses
      // descendants, un de ses ancêtres (cible non atteignable en son centre,
      // ex. lien en ligne sur plusieurs lignes) et un label lié à la cible
      // (l'activer active le contrôle, standard HTML). Le parcours est borné
      // (nombre d'éléments, budget de temps) : chaque défilement force une
      // mise en page, une page-catalogue en compte des dizaines de milliers.
      const cibles =
        arg.selecteur === null
          ? Array.from(document.querySelectorAll(arg.selecteursInteractifs))
          : Array.from(document.querySelectorAll(arg.selecteur));
      const fin = performance.now() + arg.budgetMs;
      const recouvrements: Recouvrement[] = [];
      let examines = 0;
      let tronque = false;
      for (const el of cibles) {
        if (examines >= arg.max || performance.now() > fin) {
          tronque = true;
          break;
        }
        examines += 1;
        let rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          continue;
        }
        // Ne défiler que si le centre n'est pas déjà dans la fenêtre.
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          rect = el.getBoundingClientRect();
        }
        const recu = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (recu === null || recu === el || el.contains(recu) || recu.contains(el)) {
          continue;
        }
        if (recu instanceof HTMLLabelElement && recu.control === el) {
          continue;
        }
        recouvrements.push({ element: aide.localiser(el, arg.attributsConserves), intercepteur: aide.localiser(recu, arg.attributsConserves) });
      }
      window.scrollTo(0, 0);
      const resultat: ResultatGeometrie = { recouvrements, tronque, examines };
      return resultat;
    }
    case 'mutations.lire': {
      const t = aide.tampon(arg.nomTampon);
      if (t === undefined) {
        const vide: LectureMutations = { mutations: [], excedent: 0, excedentHorsFond: 0 };
        return vide;
      }
      const formulaire = arg.selecteurZone === null ? null : document.querySelector(arg.selecteurZone);
      const zone = formulaire === null ? null : (formulaire.parentElement ?? formulaire);
      const lecture: LectureMutations = {
        mutations: t.mutations.map((m) => ({ t: m.t, enZone: zone !== null && zone.contains(m.cible), fond: m.fond })),
        excedent: t.excedent,
        excedentHorsFond: t.excedentHorsFond,
      };
      t.mutations.length = 0;
      t.excedent = 0;
      t.excedentHorsFond = 0;
      t.derniereHorsFond = null;
      return lecture;
    }
    case 'mutations.derniere': {
      // Dernière mutation HORS bruit de fond : une page qui mute en boucle
      // (carrousel) ne repousse pas indéfiniment la stabilisation.
      const t = aide.tampon(arg.nomTampon);
      return t === undefined ? null : t.derniereHorsFond;
    }
    case 'mutations.vider': {
      const t = aide.tampon(arg.nomTampon);
      if (t !== undefined) {
        t.mutations.length = 0;
        t.excedent = 0;
        t.excedentHorsFond = 0;
        t.derniereHorsFond = null;
      }
      return null;
    }
    case 'declencheur': {
      const el = document.querySelector(arg.selecteur);
      if (el === null) {
        return null;
      }
      const attributs: Record<string, string> = {};
      for (const nom of arg.attributs) {
        const valeur = el.getAttribute(nom);
        if (valeur !== null) {
          attributs[nom] = valeur;
        }
      }
      const texte = arg.texteVisible ? aide.nomPercu(el, arg.attributsDescendants) : null;
      const lecture: LectureDeclencheur = { texte, attributs };
      return lecture;
    }
    case 'validite': {
      // `element.validity` plutôt que `form.checkValidity()`, qui déclenche des
      // événements `invalid` auxquels le script du site pourrait réagir avant le clic.
      const form = document.querySelector(arg.selecteurFormulaire);
      const declencheur = arg.selecteurDeclencheur === null ? null : document.querySelector(arg.selecteurDeclencheur);
      const resultat: ValiditeFormulaire = { validationActive: false, champsInvalides: [] };
      if (!(form instanceof HTMLFormElement)) {
        return resultat;
      }
      // La validation native ne s'applique qu'à une soumission par un bouton
      // soumetteur (ou implicite), sans `novalidate` ni `formnovalidate`.
      const soumetteur = declencheur === null ? true : aide.estSoumetteur(declencheur);
      const sansValidation = form.noValidate || (declencheur !== null && declencheur.hasAttribute('formnovalidate'));
      resultat.validationActive = soumetteur && !sansValidation;
      if (!resultat.validationActive) {
        return resultat;
      }
      for (const el of Array.from(form.elements)) {
        if (aide.estChamp(el) && el.willValidate && !el.validity.valid) {
          resultat.champsInvalides.push(aide.selecteurDe(el));
        }
      }
      return resultat;
    }
  }
}

/** Levée quand une évaluation en page dépasse son délai : la page ne répond plus. */
export class ErreurEvaluationExpiree extends Error {
  constructor(delaiMs: number) {
    super(`evaluation-expiree:${delaiMs}`);
    this.name = 'ErreurEvaluationExpiree';
  }
}

/**
 * Met une promesse en course avec un délai : au-delà, rejet en
 * `ErreurEvaluationExpiree`. La promesse d'origine reste pendante (une
 * évaluation Playwright ne s'interrompt qu'à la fermeture du contexte) et
 * son rejet tardif est absorbé.
 */
export function sousDelai<T>(promesse: Promise<T>, delaiMs: number): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  const expiration = new Promise<never>((_resoudre, rejeter) => {
    minuteur = setTimeout(() => rejeter(new ErreurEvaluationExpiree(delaiMs)), Math.max(1, delaiMs));
    minuteur.unref();
  });
  promesse.catch(() => undefined);
  return Promise.race([promesse, expiration]).finally(() => clearTimeout(minuteur));
}

/**
 * Évalue le script en page avec une commande typée (Playwright sérialise la
 * fonction, la commande voyage en argument), sous délai si `delaiMs` est
 * fourni.
 */
function evaluer(page: Page, commande: Commande, delaiMs?: number): Promise<unknown> {
  const evaluation = page.evaluate(enPage, commande);
  return delaiMs === undefined ? evaluation : sousDelai(evaluation, delaiMs);
}

export async function extrairePage(page: Page, delaiMs?: number): Promise<ExtractionPage> {
  return (await evaluer(page, { commande: 'page', attributsConserves: ATTRIBUTS_CONSERVES, attributsNommage: ATTRIBUTS_NOMMAGE }, delaiMs)) as ExtractionPage;
}

/**
 * Texte de la page pour le profilage IA, lu sur la page DÉJÀ CHARGÉE par
 * l'exploration. `maxChars` borne le texte visible dès la page ; la
 * troncature qui fait foi reste celle de Node (`composerContexteProfilage`).
 */
export async function extraireTexte(page: Page, maxChars: number, delaiMs?: number): Promise<ExtractionTexte> {
  return (await evaluer(page, { commande: 'texte', maxChars, metadonnees: METADONNEES_CONSERVEES }, delaiMs)) as ExtractionTexte;
}

export async function etatsImages(page: Page, delaiMs?: number): Promise<EtatImage[]> {
  return (await evaluer(page, { commande: 'images', attributsConserves: ATTRIBUTS_CONSERVES }, delaiMs)) as EtatImage[];
}

export interface OptionsGeometrie {
  /** Éléments désignés (null = tous les éléments interactifs). */
  selecteur?: string | null;
  /** Nombre maximal d'éléments examinés. */
  max: number;
  /** Budget de temps en page. */
  budgetMs: number;
  /** Délai de l'évaluation côté Node (par défaut le budget, avec une marge du même ordre). */
  delaiMs?: number;
}

/** Recouvrements des éléments interactifs visibles, bornés en nombre et en temps. */
export async function recouvrements(page: Page, options: OptionsGeometrie): Promise<ResultatGeometrie> {
  return (await evaluer(
    page,
    {
      commande: 'geometrie',
      attributsConserves: ATTRIBUTS_CONSERVES,
      selecteursInteractifs: SELECTEURS_INTERACTIFS,
      selecteur: options.selecteur ?? null,
      max: options.max,
      budgetMs: options.budgetMs,
    },
    options.delaiMs ?? options.budgetMs * 2,
  )) as ResultatGeometrie;
}

/** Lit ET vide le tampon ; `selecteurZone` désigne le formulaire de l'action (zone = lui et son parent). */
export async function lireMutations(page: Page, nomTampon: string, selecteurZone: string | null, delaiMs?: number): Promise<LectureMutations> {
  return (await evaluer(page, { commande: 'mutations.lire', nomTampon, selecteurZone }, delaiMs)) as LectureMutations;
}

/** Horodatage de la dernière mutation hors bruit de fond en attente dans le tampon, sans le vider. */
export async function derniereMutation(page: Page, nomTampon: string, delaiMs?: number): Promise<number | null> {
  return (await evaluer(page, { commande: 'mutations.derniere', nomTampon }, delaiMs)) as number | null;
}

export async function viderMutations(page: Page, nomTampon: string, delaiMs?: number): Promise<void> {
  await evaluer(page, { commande: 'mutations.vider', nomTampon }, delaiMs);
}

/**
 * Lecture réservée au filtre d'actions interdites : nom perçu et attributs
 * examinés d'un élément. Nulle part ailleurs le scanner ne lit un texte de
 * page.
 */
export async function lireDeclencheur(
  page: Page,
  selecteur: string,
  attributs: string[],
  texteVisible: boolean,
  attributsDescendants: string[] = [],
  delaiMs?: number,
): Promise<LectureDeclencheur | null> {
  return (await evaluer(
    page,
    { commande: 'declencheur', selecteur, attributs, attributsDescendants, texteVisible },
    delaiMs,
  )) as LectureDeclencheur | null;
}

/** Validité native d'un formulaire avant le clic sur son déclencheur (null = soumission implicite). */
export async function validiteFormulaire(
  page: Page,
  selecteurFormulaire: string,
  selecteurDeclencheur: string | null,
  delaiMs?: number,
): Promise<ValiditeFormulaire> {
  return (await evaluer(page, { commande: 'validite', selecteurFormulaire, selecteurDeclencheur }, delaiMs)) as ValiditeFormulaire;
}
