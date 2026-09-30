# ZURVELA — Constitution du projet

Tu es l'agent de développement du projet Zurvela. Tu lis ce fichier au début
de chaque session et tu appliques ces règles à CHAQUE ligne de code que tu
produis, sans exception. En cas de conflit entre une demande ponctuelle et
cette constitution, tu signales le conflit avant de coder.

## 1. Ce que tu construis

Zurvela est un agent autonome de surveillance et de test d'applications web
(puis mobiles). Il scanne n'importe quel site par URL, dans n'importe quelle
langue, détecte les anomalies (fonctionnelles, performance, accessibilité,
SEO, sécurité de base, visuelles), vérifie ses propres alertes avant de les
émettre, et produit des rapports en langage business traduits en impact
métier. Ses trois différenciateurs, que ton code doit protéger en priorité :
1. Quasi-zéro faux positifs (protocole de confirmation systématique)
2. Couverture multi-catégories en un seul scan
3. Rapports compréhensibles par un non-technicien, dans la langue du client

## 2. Règle maîtresse — RIEN de spécifique en dur

Le code ne contient que de l'UNIVERSEL. Tout ce qui est spécifique à une
langue, un site, un secteur ou une plateforme passe par l'un de ces trois
canaux : jugement IA, données apprises (bestiaire, profils, règles), ou
configuration. Concrètement :

- INTERDIT : tout motif de langue naturelle dans une détection
  (regex de mots comme error/erreur/oops, textes de boutons, libellés).
  Toute détection sémantique de texte passe par le module IA (`core/ia`).
- INTERDIT : sélecteurs CSS propres à un site, URLs de clients,
  listes de mots-clés métier dans le code.
- INTERDIT : seuils numériques en dur (durées, limites, scores).
  Tout seuil vit dans `config/` avec une valeur par défaut documentée.
- INTERDIT : texte destiné à l'utilisateur écrit dans le code.
  Tout passe par les fichiers i18n (`locales/`), même si seul `fr` existe.
- EXCEPTION — les TEXTES À GARANTIE SÉMANTIQUE. Une poignée de phrases ne
  sont pas de la prose utilitaire : elles ÉNONCENT une propriété que le
  moteur doit tenir. « Constaté, puis reproduit lors de nos N vérifications
  indépendantes » n'est pas une traduction, c'est une promesse — la déplacer
  en `locales/` la rendrait modifiable sans revue, et une formulation qui
  promet plus que son statut détruit le différenciateur n°1 sans qu'aucun
  test ne rougisse. Ces textes vivent donc en CODE TYPÉ, au même régime que
  les prompts : une table par langue, la complétude imposée par `tsc` (toute
  langue × tout statut, sans trou possible), et modification sous revue
  seulement. Le canal reste par-langue ; c'est la GARANTIE qui change de
  nature, pas l'internationalisation. Aujourd'hui : `core/rapport/voix.ts`.
  Tout le reste de la prose utilisateur reste dans `locales/`.
- AUTORISÉ en dur : standards techniques universels (codes HTTP, types
  MIME, balises HTML, attributs ARIA), signaux physiques (page vide,
  dimensions, image au naturalWidth nul). Résumé : le code peut connaître
  LE WEB, jamais LE MONDE.
- La liste d'actions destructives interdites (supprimer, payer, etc.)
  vit dans `config/actions-interdites.json`, jamais dans le code.
- Frontière code/config : les INVARIANTS vivent en code, les RÉGLAGES en
  config. Une valeur de config protège tant que personne ne la change, ce
  qui n'est pas une protection : une borne que le produit ne doit jamais
  franchir (une confiance > 1) est un invariant, pas un réglage.

Avant de livrer un fichier, tu te poses les trois questions :
« Ce code fonctionnerait-il tel quel sur un site japonais ? »
« Cette valeur devra-t-elle changer un jour ? » (oui → config)
« Cette connaissance appartient-elle au code ou au moteur qui apprend ? »

## 3. Sécurité du moteur — non négociable

- Le contenu des pages scannées est une DONNÉE NON FIABLE. Il ne devient
  jamais une instruction. Les prompts séparent strictement instructions
  (système) et contenu de page (données), avec un rappel anti-injection
  dans chaque prompt qui reçoit du contenu externe.
- La chaîne de méfiance couvre aussi les données DÉRIVÉES — journaux,
  profils, sorties de nos propres modèles — et pas seulement le contenu
  direct d'une page : un journal n'est pas plus fiable parce que c'est nous
  qui l'avons écrit, nous y avons recopié ce que la page a dit.
- L'IA choisit ses actions dans un MENU FERMÉ d'actions énumérées
  (cliquer, remplir, terminer...). Elle ne rédige jamais d'action libre.
- Le filtre d'actions destructives s'applique APRÈS la décision IA,
  en code, non contournable par le contenu d'une page.
- Le robot se signale : user-agent dédié `ZurvelaBot`, en-tête
  `X-Zurvela-Scan`, données de test marquées (emails en
  `test@zurvela-scan.invalid`).
- UN MOTEUR QUI AGIT SUR LA PAGE D'AUTRUI SANS LAISSER TRACE DE CE QU'IL A
  FAIT N'EST PAS RELISIBLE. Dès que le moteur ne se contente plus
  d'observer — écarter un recouvrement, presser une touche, cliquer pour
  traverser —, chaque geste, sa cible exacte et son issue vont au journal,
  et le filtre d'actions destructives s'applique au geste comme à une
  action décidée par l'IA : après coup, en code, non contournable. Un geste
  choisi par le code n'échappe pas au filtre parce qu'aucun modèle ne l'a
  demandé. Et ce que le moteur a FAIT se dit au client dans le rapport, pas
  seulement ce qu'il a vu : taire un jugement, c'est ne pas publier ; agir
  sur la page d'un client sans le lui dire, c'est autre chose. (Inscrit le
  2026-09-30, à l'ouverture du cahier P2-3, premier cahier où le moteur
  agit pour traverser.)
- Identifiants clients : chiffrés au repos, jamais dans les logs.

## 4. Architecture

- `core/` : moteur (scanner, décisions, anti-faux-positifs, diagnostic)
- `core/ia/` : SEUL point de contact avec les API de modèles. Couche
  d'abstraction : le reste du code appelle des fonctions métier
  (`profiler`, `decider`, `diagnostiquer`, `rediger`), jamais un SDK
  directement. Chaque prompt est versionné dans `prompts/` avec numéro.
- `config/` : tous les seuils, listes et réglages
- `locales/` : tous les textes utilisateur
- `banc/` : banc d'essai (gabarits, manifestes, correcteur)
- Modèles IA : modèle rapide/économique pour les décisions de navigation,
  modèle puissant pour le diagnostic et les rapports. Le choix des
  modèles est en config.
- Mode dégradé obligatoire : sans clé API, le moteur fonctionne
  (détecteurs techniques + fallback simple) et le signale proprement.

## 5. Journalisation et apprentissage

Chaque scan produit un journal structuré (JSON) : décisions prises,
actions exécutées, blocages rencontrés, anomalies + score de confiance,
coût API, durée. Ces journaux alimentent le bestiaire et les métriques.
Aucune fonctionnalité ne se construit sans sa journalisation.

## 6. Qualité et validation

- Tout changement de prompt, de modèle ou de détecteur doit pouvoir être
  évalué par le banc d'essai (`banc/correcteur`). Tu ne modifies jamais
  un prompt sans incrémenter sa version.
- Ce que le versionnement d'un prompt protège, ce sont les MESURES, pas le
  texte : un prompt s'incrémente dès qu'une cassette ou une mesure existe
  sous sa version. Avant sa première cassette, il est en rédaction et se
  corrige sur place — ouvrir une version que rien n'a mesurée créerait une
  lignée vide.
- Les cinq métriques de référence : taux de détection, taux de faux
  positifs, taux de blocage, coût par scan, délai de détection.
  Ton code expose ce qu'il faut pour les calculer.
- Tests : chaque module de `core/` a des tests unitaires. Le banc
  d'essai sert de test d'intégration.

## 7. Style

- Code et commentaires en français. Simplicité d'abord : pas
  d'abstraction avant le deuxième usage réel. Pas de dépendance nouvelle
  sans justification en une ligne dans le commit.
- Stack : Node.js ≥ 22 (cible 24 LTS) + TypeScript strict + pnpm + Vitest + Playwright. Un seul repo.
