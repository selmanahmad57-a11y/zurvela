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
- **Regroupement des anomalies par cause** : sur le banc, V01 (un logo
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
