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
