# Apprentissages de terrain

Les pièges du *réel* que ni la conception ni les tests n'avaient prévus,
capturés pour ne jamais être redécouverts. Ancêtre direct du bestiaire du
plan. Chaque entrée : le symptôme, la cause, la règle qui en découle, et la
garde permanente qui l'applique (test, sonde, lint) quand elle existe.

## 1. Le code injecté en page ne vit pas dans l'environnement du runner de tests (2026-09-22, brique 2)

- **Symptôme** : `pnpm banc --tous` échouait avec `ReferenceError: __name is
  not defined` dans le navigateur, alors que la suite Vitest était verte.
- **Cause** : `pnpm banc` exécute le TypeScript via `tsx` (esbuild avec
  `keepNames`), qui enveloppe les fonctions nommées imbriquées d'un appel
  `__name(...)`. Le script d'exploration est sérialisé par Playwright et
  rejoué dans la page, où `__name` n'existe pas. Vitest (Vite/esbuild, autre
  réglage) ne reproduit pas cette transformation : les tests étaient
  structurellement aveugles.
- **Correction** : auxiliaires du script en page écrits en méthodes d'un
  objet littéral (non renommées) ; filet dans le script d'initialisation
  (`globalThis.__name` défini à l'identité s'il manque).
- **Règle** : tout code injecté en page (`page.evaluate`, `addInitScript`)
  vit dans un environnement différent de celui du runner de tests ; toute
  divergence de toolchain (esbuild vs V8 nu) peut y produire des erreurs que
  les tests unitaires ne reproduisent pas. **Vérification par sonde
  d'exécution réelle obligatoire pour tout script injecté**, avec la
  toolchain de production (`tsx`), pas seulement celle des tests.
- **Garde permanente** : un test du banc qui lance, via `tsx` (la toolchain
  de `pnpm banc`), un scan réel d'un scénario et vérifie qu'aucune erreur
  d'exécution en page n'apparaît — à ajouter à la bascule de fin de
  brique 2 (moindre coût : un sous-processus `tsx` sur un scénario sain).

## 2. Une correction proposée se juge aussi par le défaut qu'elle réintroduit (2026-09-22, brique 3)

- **Symptôme** : lors de la revue de la brique 3, un constat confirmé
  proposait d'ajouter une règle `requete-en-attente → document-injoignable`
  pour faire remonter un site figé. L'agent de correction a **refusé** cette
  moitié de la correction : le signal `requete-en-attente` est émis à la fin
  de CHAQUE fenêtre d'action en exploration normale, et la règle aurait
  rallumé un faux positif bloquant à 0,9 sur toute navigation simplement
  lente — exactement le défaut qu'un autre constat de la même revue venait
  de faire corriger, réintroduit par l'autre bout.
- **Règle** : une correction proposée se juge dans **les deux sens** — le
  défaut qu'elle corrige ET celui qu'elle réintroduit. Une revue qui ne
  vérifie qu'un sens fabrique des allers-retours. Un agent qui refuse une
  correction en expliquant le défaut qu'elle recréerait fait son travail ;
  un agent qui applique tout ce qu'on lui propose ne le fait pas.
- **Garde permanente** : les relecteurs sceptiques ont pour consigne
  explicite de réfuter une correction « pire que le mal », et l'agent de
  correction a mandat d'adapter ou de refuser en le justifiant.

## 3. Toute métrique de réussite naît avec sa métrique d'échec jumelle (2026-09-22, brique 3)

- **Cas fondateur** : la clôture de la brique 3 devait afficher « fausses
  alertes évitées par le protocole » — l'argument commercial central du
  produit. Non gardée, cette métrique **contient sa propre perversion** : un
  protocole qui écarte TOUT afficherait 100 % de fausses alertes évitées,
  donc le score parfait, en ayant détruit le produit. Le compteur jumeau
  `nbPertesProtocole` (anomalies réelles écartées à tort, classées par
  appariement au manifeste) a été posé dans le même contrat, avant que la
  métrique n'existe dans une seule scorecard.
- **Règle** : toute métrique de réussite naît avec sa métrique d'échec
  jumelle, dans le même contrat et la même livraison. Un chiffre qui ne peut
  pas révéler son propre échec n'est pas une mesure, c'est un argument.
  C'est l'application à la mesure elle-même du principe A5 (« le doute ne
  monte jamais la confiance », voir [docs/METHODE.md](METHODE.md) et le
  cahier de la brique 3, annexe C).
- **Épreuve obligatoire** : la jumelle doit être PROUVÉE par un cas
  construit où elle s'allume — un compteur de pertes qui n'a jamais compté
  une perte n'est pas prouvé. Le cas est un sabotage piloté en test
  (Vitest), jamais un scénario du registre du banc (annexe A6 du cahier de
  la brique 3 : un scénario polluerait la scorecard). *Si le compteur ne
  peut pas mentir, il faut que quelqu'un ait essayé de le faire mentir.*
- **Jumelles déjà identifiées pour la suite** : coût IA par scan ↔ qualité
  de décision achetée (brique 4) ; taux de détection commercial ↔ ce que le
  banc sait qu'on rate ; exhaustivité du rapport business ↔ sa lisibilité.

## 4. Une métrique jumelle peut encore mentir : sa règle d'appariement et son périmètre en font partie (2026-09-23, clôture de la brique 3)

L'apprentissage n°3 a posé la jumelle (`nbPertesProtocole` face à
`nbFaussesAlertesEvitees`). Le sabotage exigé par ce même apprentissage a
montré que **poser la jumelle ne suffit pas** : trois défauts la rendaient
contournable, et deux étaient atteignables sans rien saboter.

- **Le compteur peut se TAIRE.** Toute la mesure ne lisait que
  `rapport.groupes` ; or le chemin réel « le protocole tombe » publie des
  `ecartees` **sans** `groupes`. Résultat : 100 % des anomalies détruites,
  scorecard à « 0 écartée, 0 perdue », détection 100 %, statut `ok`, aucune
  alarme. **Règle** : une jumelle doit lire la même source que ce qu'elle
  garde, et tout état où elle devient aveugle doit être un ÉCHEC BRUYANT, pas
  un zéro silencieux.
- **Sa règle d'appariement doit être DÉTERMINISTE et pessimiste.** Deux
  scénarios identiques ne différant que par l'ordre des bugs donnaient
  « 1 fausse alerte évitée » / « 1 anomalie perdue » pour le même vrai bug
  détruit : c'est le premier membre apparié qui tranchait. **Règle** : quand
  plusieurs lectures sont possibles, une métrique de garde prend toujours la
  moins flatteuse. Et un « aucun appariement » n'est jamais une victoire :
  il lui faut sa propre colonne, jamais additionnée au chiffre de vente.
- **Son périmètre d'affichage doit PARTITIONNER.** Les colonnes du protocole
  étaient versées entières à chaque catégorie d'un scénario multi-catégories
  (somme des candidates par catégorie : 64 pour un global de 46, et des
  lignes arithmétiquement fausses). **Règle** : un compteur ne s'affiche que
  sur un périmètre qui partitionne l'ensemble mesuré — sinon la somme des
  lignes contredit le total, et un tableau qui se contredit ne se défend pas.
- **Corollaire d'unité** : toutes les colonnes d'une même ligne doivent être
  dans la même unité (ici des groupes de cause racine, pas des anomalies).
  Le mélange d'unités est ce qui rendait l'incohérence invisible.
