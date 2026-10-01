# Backlog

Éléments identifiés mais hors périmètre de la brique en cours. Chaque
entrée indique la brique ou la phase où elle a vocation à être traitée.

## Banc d'essai

- **Gabarit avec bouton destructif factice** (« Supprimer mon compte ») dont
  le manifeste attend qu'il ne soit **jamais** cliqué : le filtre d'actions
  interdites mérite son test au banc. Origine : décision du 2026-09-22
  (brique 2). Cible : un prochain gabarit du banc (Phase 1, étape 3
  « enrichissement »).
- **Mode sandbox** du filtre d'actions interdites : ne lever l'interdit que
  sur certaines catégories (`exceptionsSandbox` dans
  `config/actions-interdites.json`). Cible : Phase 1 §6 sécurité du moteur,
  après la brique 3.
- **Les TROIS faces du filtre d'actions au banc** (l'entrée ci-dessous, fusionnée
  avec le besoin révélé par la brique 4b) : un futur gabarit TRANSACTIONNEL
  portera aussi la troisième face, côté navigation — page de commande
  **visitée** (attendu « bien jugé ») et bouton « Valider la commande »
  **jamais soumis** (attendu « resté inerte »). La doctrine des catégories
  `paiement` — explorer le chemin, s'arrêter à l'acte — n'est aujourd'hui
  éprouvée par RIEN : c'est elle que ce gabarit mesurera. Origine : la brique
  4b a dû déplacer son formulaire critique sur `/devis` (non transactionnel)
  parce qu'un banc qui ne peut mesurer la navigation qu'en violant le filtre
  mesurerait un produit interdit. Ratifié au chat de conception le 2026-09-23.

- **Les deux faces du filtre d'actions au banc** (complète l'entrée ci-dessus) :
  le gabarit destructif contiendra *aussi* un lien GET `/compte/supprimer`
  (manifeste : jamais visité — canal URL) **et** un article `/blog/post/42`
  avec un bouton « Postuler » (manifeste : visité et cliqué — ni le segment
  `post` ni le préfixe `post` ne doivent bloquer) — et ce lien portera
  `id="post-42"` : la troisième face du filtre (canal identifiant, tokenisé
  sur `-`/`_`/camelCase, `post` exact ne bloque pas). Origine : décision du
  2026-09-22 (brique 2).

## Moteur

- **Détecteur d'erreurs JavaScript (D-JS)** : le signal `erreur-js` est
  collecté par l'observateur mais aucun détecteur ne le consomme (hors
  périmètre de la brique 2). Les erreurs JS d'une page passent donc
  inaperçues. Cible : une brique de couverture ultérieure.
- ~~**Regroupement des anomalies par cause**~~ — PROMU dans le périmètre de la brique 3 (consolidation, décision du 2026-09-22).
- **(archivé) Regroupement des anomalies par cause** : sur le banc, V01 (un logo
  cassé présent sur 3 pages) produit 6 anomalies (2 détecteurs × 3 pages) et
  F02 en produit 2. Le banc les apparie au même attendu, mais un rapport
  business doit présenter une anomalie par cause, pas par page et par
  détecteur. Cible : brique 3 (protocole anti-faux-positifs) ou la brique du
  rapport business.
- **Contexte de reproduction des détecteurs géométriques** : une anomalie
  constatée au chargement (D-RECOUVREMENT, D-IMAGE) porte
  `reproduction.action = null`, donc `actionsPrealables = []`, alors qu'un
  `remplir` réussi peut précéder le constat sur la même page. La brique 3,
  qui re-exécutera, voudra probablement rattacher l'action du signal `clic`
  plutôt que celle du premier signal du groupe. Origine : validation de la
  bascule du 2026-09-22. Cible : cahier de la brique 3.
- **Asymétrie de lecture des `observations` de F01** : dans un scénario
  combiné (F01 + M01), l'anomalie « élément sans effet » porte
  `observations = [desktop]` seulement, parce qu'en mobile le clic est
  intercepté et l'action `bloquee` — on ne peut rien conclure d'un clic qui
  n'a pas eu lieu. Techniquement juste, mais un lecteur du rapport pourrait
  comprendre « le bouton mort n'existe qu'en desktop ». Cible : rédaction du
  rapport business.
- **Re-confirmation des anomalies découvertes au rejeu** : une anomalie
  constatée pendant une re-exécution (site devenu injoignable) est retenue
  avec la confiance de son détecteur, sans passer elle-même par le protocole
  (ce serait récursif). Origine : annexe C du cahier de la brique 3
  (2026-09-22). Cible : une brique ultérieure du protocole.
- **Représentant le plus LISIBLE, pas le plus riche** : sur un groupe
  consolidé, le représentant est la candidate la plus riche en contexte
  (`d-http` / `ressource-interne-404`), pas la plus parlante pour un humain
  (`d-image` / `image-cassee`). Rien n'est faux — catégorie, localisations et
  `GroupeCause.descriptions` conservent tout — mais le rapport devra choisir
  son porte-parole autrement. Origine : validation de la brique 3
  (2026-09-22). Cible : brique du rapport business (Phase 1).
- **Surveillance chiffrée de la durée des scénarios** : au dernier run connu,
  R01 consomme 29,3 s soit 49 % du timeout de 60 s du banc (il était à 15,6 s
  avant la brique 3 : la re-exécution re-mesure deux fois une API à 5 s).
  Règle à tenir : **tout scénario dépassant 50 % du timeout au dernier run
  connu doit être signalé avant la prochaine extension du banc** (bug plus
  lent, re-exécution supplémentaire ou viewport de plus le feraient sauter).
  Origine : validation de la brique 3 (2026-09-22).
- **Pont des vocabulaires diagnostic ↔ verdict (brique 4c)** :
  `Diagnostic.verdict` de `core/ia` (`defaut-du-site | limite-automatisation
  | indetermine`) et `VerdictConfirmation` du protocole (`confirmee |
  intermittente | non-reproduite | limite-automatisation | basse-confiance`)
  ne doivent PAS être alignés : ils parlent de choses différentes — le
  diagnostic qualifie une **cause**, le verdict qualifie une **décision du
  protocole**. Le pont sera une traduction explicite, jamais une fausse
  symétrie de types. Origine : préparation de la brique 4 (2026-09-22).
  Cible : brique 4c (auto-diagnostic).
- **Troisième dimension de clé d'appariement au banc** : la garde
  anti-manifeste-ambigu (brique 3) interdit tout scénario mêlant, sur la
  MÊME catégorie et la MÊME page, un vrai bug et un faux positif simulé —
  F01+T01, R01+L01. Or c'est le cas le plus réaliste du monde réel : un vrai
  bug ET un aléa transitoire sur le même endpoint. La garde conservatrice
  est le bon défaut aujourd'hui (un manifeste ambigu ne peut pas être noté
  honnêtement) ; la troisième dimension de clé se construira quand un
  gabarit en aura besoin, probablement à l'extension du banc qui
  accompagnera le rapport business. Un changement de contrat sans
  consommateur serait de la spéculation. Origine : clôture de la brique 3
  (2026-09-23).

## Phase 2

- **C-11 ÉTENDU — la fusion INTER-PAGES d'une même cause.** Isolé le
  2026-10-01 à la clôture de P2-3, et délibérément laissé hors du cahier.
  Le dialogue de consentement Google d'automationexercise produit deux
  sections pour la même construction, l'une sur `/`, l'autre sur
  `/products` : le contrat 4 fond par cause, et « une cause est locale à sa
  page » est un invariant posé exprès, que son propre test exige. Un bandeau
  présent sur dix pages ne devrait pourtant pas produire dix sections.
  **Condition pour ouvrir** : savoir distinguer « le MÊME défaut récurrent »
  (un bandeau unique, servi partout) de « le même TYPE de défaut à plusieurs
  endroits » (un formulaire cassé par page, qui fait bien N défauts). Ce
  départage n'est pas trivial, et le trancher à la légère réunirait des
  défauts distincts sous un seul constat — le sens qui perd des signaux.
  Cahier à part, pas un correctif.

- ~~**Bilan de rejouabilité sur les dix scans de la campagne**~~ — **FAIT le
  2026-09-30**, fondu dans la validation de P2-2 (D4) : neuf sites, trois
  moteurs dans la même session (campagne `e872872`, P2-1 `7936175`, P2-2),
  1,1576 USD. Rejouabilité par groupes, avant (campagne) → P2-1 → P2-2 :
  automationexercise 1,3 → 1,7 → 16,3 % ; books 0 → 100 → 100 % ; cutlybook
  0 → 100 → — (plus rien à rejouer) ; demoqa 0 → 41,7 → 100 % ;
  expandtesting 0 → 7,3 → 50 % ; getlumavo 100 → 100 → — ; quotes
  100 → 100 → 100 % ; the-internet 100 → 100 → 100 % ; zurvela — partout.
  Le chiffre qui compte est au cahier P2-2 §5.2 : le taux de FAUX POSITIFS
  des sections publiées, 82 % (campagne) → 81 % (P2-1) → 61 % (P2-2) →
  **0 % MESURÉ** au run de 20 h (§5.5, 0,3376 USD), 14 sections publiées,
  14 vraies, zéro bruit, 75 groupes tiers tus, zéro découverte publiée.
  Que le bruit soit retiré SANS perte de signal est établi sur les mêmes
  candidates au §5.2 (24 vraies avant comme après le correctif). Deux suites
  ouvertes : les dettes n°22 (l'effet visible est aveugle aux `xhr` et aux
  polices — à lever avant tout argument commercial) et n°23 (la rejouabilité
  n'a pas de règle pour le dénominateur vide).

- **Mesurer la répétabilité inter-scans des états énumérés d'un même site
  AVANT de concevoir le cache de décisions.** Le coût IA d'un scan vit dans
  le NOMBRE d'appels, pas dans le prix du modèle : un profilage par scan
  contre une décision par point de choix — facteur 14 mesuré à la brique 4b
  (0,041 contre 0,583 USD sur 34 scans). Le cache attaquera donc le bon
  terme, mais son gain est proportionnel à une grandeur que personne n'a
  encore mesurée : la part des états énumérés identiques d'un scan à l'autre
  sur un même site. La mesurer d'abord, concevoir ensuite — c'est la règle
  des métriques jumelles appliquée par avance à une optimisation qui
  n'existe pas encore. Origine : brique 4b (2026-09-23).
