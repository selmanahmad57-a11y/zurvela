# Dettes techniques

Une dette non écrite est une dette oubliée. Chaque entrée : ce qui est en
place, pourquoi, et la **condition de levée**. On retire l'entrée quand la
dette est levée (le commit qui la lève renvoie à ce fichier).

## 1. Playwright épinglé en 1.61.1 (2026-09-22)

- **Quoi** : `playwright` est épinglé à la version exacte 1.61.1 dans
  `package.json`.
- **Pourquoi** : la machine de développement principale tourne sous
  macOS 12 ; Playwright ≥ 1.62 ne fournit plus de Chromium pour macOS 12.
  1.61.1 (juin 2026) est la dernière version compatible.
- **Portée** : contrainte de la machine de développement, pas du projet.
  La production et la CI cibleront Linux, où l'épingle doit pouvoir sauter.
  Aucun code ne doit dépendre d'une API propre à 1.61 sans le signaler ici.
- **Garde-fou du banc** : le banc utilise le Chromium fourni par Playwright
  (`navigateur.canal: null` dans `config/scanner.json`), jamais le Chrome
  installé (qui s'auto-met à jour et rendrait les scores non reproductibles).
  `navigateur.canal: "chrome"` reste une option documentée, jamais le défaut.
- **Condition de levée** : dès que l'environnement principal tourne sous
  Linux ou macOS ≥ 13 — passer à la dernière version, relancer
  `pnpm exec playwright install chromium`, puis `pnpm banc --tous` trois
  fois (scores identiques attendus).

## 2. Dérivation des actions préalables limitée à la page courante (2026-09-22)

- **Quoi** : le contexte de reproduction d'une anomalie (`ContexteReproduction.actionsPrealables`, rempli par la fonction unique `actionsPrealablesDe` de `core/scanner/detection/commun.ts`) ne retient que les actions exécutées sur la même page et le même viewport depuis la dernière navigation, avant l'action déclenchante (typiquement le `remplir` qui précède un `soumettre`).
- **Pourquoi** : suffisant pour le gabarit « formulaire-contact » et pour la re-exécution isolée de la brique 3 ; c'est une **approximation** — sur un parcours multi-pages (tunnel en 3 étapes), l'état requis vient des pages précédentes et n'est pas capturé.
- **Condition de levée** : étendre la dérivation au parcours complet (chaîne d'actions depuis l'URL de départ, ou depuis le dernier point de l'état) dès qu'un gabarit multi-étapes existe au banc.

## 3. Aides de test du moteur couplées au banc (2026-09-22)

- **Quoi** : `core/scanner/exploration/aide-tests-banc.ts` et
  `core/scanner/exploration/en-page.sonde.ts` vivent dans `core/` mais
  importent `banc/` (serveur de scénario, gabarits, config du banc).
- **Pourquoi** : ce sont des aides de test (la sonde est lancée en
  sous-processus `tsx` par `en-page.tsx.test.ts`, garde permanente de
  l'apprentissage n°1) ; n'ayant pas le suffixe `.test.ts`, elles feraient
  partie du moteur au moment d'un empaquetage de `core/`.
- **Condition de levée** : les déplacer hors de `core/` (ou les suffixer
  pour qu'elles soient exclues) dès que `core/` est empaqueté ou publié.

## 4. Politique d'admission de l'URL de départ limitée au schéma (2026-09-22)

- **Quoi** : le scanner refuse les URL qui ne sont pas `http(s)` (`file:`,
  `data:`, `javascript:`), mais rien n'interdit `localhost`,
  `169.254.169.254` ni les réseaux privés.
- **Pourquoi** : suffisant tant que les URL viennent de l'opérateur ; le
  banc sert lui-même sur `127.0.0.1`, qu'une liste d'autorisation naïve
  casserait.
- **Condition de levée** : concevoir la liste d'autorisation d'hôtes et de
  réseaux avec le premier point d'entrée exposé à des URL d'utilisateurs
  (Phase 2, page « collez votre URL »).

## 5. Confiance et gravité désolidarisées à la fusion (2026-09-22)

- **Quoi** : quand le dédoublonnage fusionne deux candidates du même
  détecteur, il retient la confiance la plus forte
  (`Math.max`) mais garde la gravité de la première.
- **Pourquoi** : le cas où les deux divergent n'est pas reproductible
  aujourd'hui (pour D-HTTP, un 500 pendant une soumission se localise sur le
  déclencheur et un 500 hors soumission sur la ressource : clés de
  dédoublonnage différentes, donc jamais fusionnés). Corriger sans cas réel
  aurait été spéculatif.
- **Condition de levée** : dès qu'un détecteur peut produire deux candidates
  de même clé et de gravités différentes — alors décider explicitement si la
  gravité suit la confiance retenue.

## 6. L'échéance d'un scan est souple, non contraignante (2026-09-22)

- **Quoi** : à l'approche de l'échéance (`options.timeoutMs`), le pipeline
  cesse d'**engager** du travail neuf — plus de navigation, plus de groupe
  re-exécuté — mais il n'**interrompt** pas ce qui est en vol. Le rapport
  peut donc être rendu légèrement après l'échéance.
- **Mesure** : sous la contention de la suite complète (plusieurs Chromium
  sur 4 cœurs), un scan à budget 60 000 ms a rendu son rapport en
  62 408 ms (+4 %). En exécution séquentielle (le banc), aucun dépassement :
  le scénario le plus long consomme 49 % de son budget.
- **Borne** : le dépassement est majoré par la plus longue opération qu'un
  rejeu peut avoir en cours, soit `confirmation.rejeu.actionMs`. C'est cette
  borne dérivée que le test de bout en bout vérifie.
- **Pourquoi ne pas durcir aujourd'hui** : une interruption franche du
  travail en vol (abandon d'un contexte navigateur en pleine action) risque
  de laisser des ressources ouvertes — exactement le défaut que la revue de
  la brique 2 a fait corriger. Un durcissement demande un mécanisme
  d'annulation propre, pas un `race`.
- **Condition de levée** : quand un appelant aura un besoin dur de
  l'échéance (une API publique avec un contrat de latence, Phase 2), doter
  le pipeline d'une annulation coopérative de bout en bout (signal propagé
  jusqu'aux appels Playwright) et rendre la borne exacte.

## 7. S01 n'éprouve qu'un vecteur d'injection, et le plus bruyant (2026-09-23)

- **Quoi** : le bug S01 mesure l'inertie du profilage sous **une** charge —
  la prose impérative **visible** dans la page. Résultat de la première
  mesure : 5/5 appels réels, inertie tenue.
- **Les quatre autres vecteurs** sont nommés dans l'en-tête de
  `banc/gabarits/formulaire-contact/bugs/s01-injection-profil.ts` avec
  l'endroit où chacun est gardé unitairement : texte masqué visuellement,
  bourrage de métadonnées, forge des marqueurs du bloc de données, et
  imitation du contrat de sortie JSON.
- **Pourquoi le dernier mérite une dette à lui seul** : les trois premiers
  échouent **bruyamment** — une réponse hors schéma, un marqueur forgé, un
  contexte tronqué se voient. Une page qui recopie un contrat de sortie
  **conforme** produirait un profil **valide au schéma et faux** : ni Ajv, ni
  le banc actuel, ni le taux de profils corrects ne le verraient, puisque le
  seul juge est la valeur attendue du gabarit. C'est le seul échec
  silencieux de la famille.
- **Condition de levée** : un bug S02 au prochain passage sur le banc des
  injections. La brique 4b l'ouvrira — c'est sa surface : le modèle n'y
  classe plus une page, il choisit des actes.
