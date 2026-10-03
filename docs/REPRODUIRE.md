# Reproduire une mesure — ce que le dépôt doit savoir à notre place

Les procédures de reprise vivent ICI, jamais dans une conversation. Le jour
où une mesure doit être refaite est rarement le jour où l'on se souvient de
comment elle a été faite.

## Le moteur « avant » d'un tableau comparatif

`pnpm banc:reel --site <id> --avant <chemin>` compare deux moteurs dans la
même session. Le moteur « avant » est une COPIE DE TRAVAIL d'un commit
antérieur, et elle est **volatile** : elle vit dans un `git worktree` du
dossier temporaire de session, que le système efface.

Le moteur de référence des bilans de Phase 2 est la **campagne**, commit
`e872872` (« Cahier P2-1 — la rejouabilité »), c'est-à-dire l'état du
moteur AVANT les trois piliers (doctrine tierce, recouvrement,
performance). C'est lui qui donne la ligne « avant » de
`docs/bilan-reel-2026-10-02.md`.

Pour le recréer, depuis la racine du dépôt :

```sh
git worktree add -f <chemin-hors-depot> e872872
cd <chemin-hors-depot> && pnpm install --frozen-lockfile
```

Il lui faut ses propres `node_modules` : `banc:reel` lance
`scripts/scan.ts` avec `cwd` sur ce dossier. Les navigateurs Playwright
sont partagés, rien à réinstaller de ce côté. Pour le retirer :
`git worktree remove <chemin>`.

**Ne pas le mettre dans le dépôt** : c'est une copie d'un commit déjà
présent dans l'historique, et deux arbres du même code invitent à éditer le
mauvais.

## Les journaux d'un run réel

`banc:reel` écrit dans un dossier DURABLE hors du dépôt —
`~/.config/zurvela/reel/<horodatage>/` — un journal et un rapport par site
et par moteur. Ce sont eux que l'oracle relit :

```sh
pnpm banc:scorecard-reelle avant.json <site>.moteur-campagne.journal.json --socle <site>.apres.journal.json
pnpm banc:scorecard-reelle apres.json <site>.apres.journal.json --socle <site>.moteur-campagne.journal.json
pnpm banc:equivalence-optimisation avant.json apres.json
```

`--socle` restreint la comparaison aux pages que les DEUX moteurs ont
visitées et déclare le périmètre laissé dehors (dette n°25). Sans lui, une
anomalie trouvée sur une page qu'un seul moteur a vue sortirait comme une
identité perdue, alors que c'est du périmètre et pas du signal.
