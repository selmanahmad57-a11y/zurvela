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
