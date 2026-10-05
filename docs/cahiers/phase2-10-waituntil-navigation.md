# ZURVELA — Cahier P2-10 : `waitUntil` — ne pas se faire prendre en otage

Ouvert le 2026-10-05. Troisième défaut révélé par le run de validation, le
DERNIER verrou du grand tableau. Défaut de COUVERTURE, pas de jugement : il ne
publie rien de faux, il AMPUTE — un site parfaitement explorable devient
invisible.

## Le défaut

`explorateur` et `reexecuteur` naviguent en `waitUntil: 'load'`. `load` n'arrive
qu'une fois **toutes** les ressources chargées : une seule ressource qui pend
fait expirer le `goto` à `chargementPageMs`, et la page est perdue — ses liens
ne sont jamais extraits, l'exploration reste coincée. Mesuré sur the-internet :
**40 pages → 2**, alors que le document sort en 200 à 0,4 s et que
`domcontentloaded` rend une page complète (46 liens) en 5,4 s. Reproduit avec
Playwright nu — ni régression moteur, ni site qui punit `ZurvelaBot`.

## La mesure a AFFINÉ l'attente sur l'oracle

On attendait l'oracle « NON équivalent » (changer le moment d'observation
change ce qui est observé). **Mesuré : sur le corpus du banc, `domcontentloaded`
est PLEINEMENT équivalent** — global identique, 0 scénario dont les compteurs
bougent. La raison est structurelle : les gabarits sont servis en local, sans
ressource qui pend, donc `load` et `domcontentloaded` se déclenchent quasi
ensemble. Le défaut (et le gain) ne se manifeste que sur une ressource lente,
que le corpus n'a pas. **La garde cardinale « sans perte ailleurs » est donc
prouvée par l'équivalence du corpus** ; le gain se prouve par un témoin neuf.

## Le fix

Les trois `goto` de production (`explorateur` ×2, `reexecuteur` ×1) passent de
`waitUntil: 'load'` à `'domcontentloaded'` : le `goto` rend la main au DOM prêt,
et les ressources en cours sont bornées par la fenêtre d'effet
(`attendreStabilisation`, déjà appelée après chaque navigation), pas par le
`goto`. C'est l'arbitrage *attendre-trop (otage) → agir-au-DOM-prêt-puis-borner*
plutôt que *attendre-tout*. Une ressource qui pend devient une
`requete-en-attente` bornée (jugée par P2-7), non un otage.

## Les contrats

**C1 — témoin fidèle, jamais contrefait.** L05 fait référencer par l'accueil une
image qui BLOQUE le `load` (retenue par le serveur via `retarderRessource`,
le DOM restant complet) ; Q06 pose un recouvrement sur ce MÊME accueil. **Tenu**
(`waituntil-navigation.banc.test.ts`) : sous `'load'`, le `goto` de l'accueil
expire → /panier jamais atteint, recouvrement jamais détecté (rouge) ; sous
`'domcontentloaded'`, /panier atteint et Q06 détecté (vert).

**C1bis — `retarderRessource` ré-introduit, deuxième usage réel (§7).** Le
crochet construit puis retiré en P2-7 (faute d'usage) sert ici à faire pendre
une ressource qui bloque le `load`. §7 (pas d'abstraction avant le deuxième
usage) est satisfait.

**C2 — la garde cardinale est le GAIN SANS PERTE, pas l'équivalence.** Ce n'est
pas « l'oracle sort équivalent » (il l'est déjà sur le corpus, qui ne peut pas
montrer le défaut) mais : le site repris à l'otage est de nouveau exploré, ET
rien n'est perdu ailleurs (banc ×3 équivalent à la base).

**C3 — l'identité qui change se JUGE (METHODE §14), elle ne se redoute pas.** Un
seul test a bougé : `reexecuteur.pannes` — sous `'load'`, une ressource qui pend
faisait ÉCHOUER le rejeu (`page-inchargeable`, `indetermine`) sur un site
pourtant sain ; sous `'domcontentloaded'`, le rejeu ABOUTIT (`echecOutillage:
false`). Tracé à sa cause (le fix), jugé VRAI : c'est un gain (moins de
`limite-automatisation` dus à une ressource accessoire), la garantie profonde
tenant (le site sain n'est jamais flashé « document injoignable »). Test mis à
jour.

**C4 — l'annexe résolue.** « Un `goto` qui expire ressort en `indetermine` »
(dette notée à l'ouverture) : avec `'domcontentloaded'`, une ressource qui pend
ne fait PLUS expirer le `goto`. Le seul `goto` qui expire encore est un DOCUMENT
qui ne répond jamais → `reseau-site` (correct, prouvé par `reexecuteur.pannes`).
Le mauvais classement disparaît avec le fix.

## Ce qui a été livré

- `explorateur.ts` (×2), `reexecuteur.ts` (×1) — `waitUntil: 'domcontentloaded'`.
- `banc/types.ts` + `banc/serveur.ts` — `retarderRessource` ré-introduit.
- `l05-ressource-bloque-load.ts` + `config/banc.json` bugs.L05 ;
  `waituntil-navigation.banc.test.ts` (témoin deux symptômes).
- `reexecuteur.pannes.test.ts` — mis à jour (le rejeu aboutit).

## Dette

Le corpus est en HTML statique : son contenu est COMPLET dès
`DOMContentLoaded`. La garde « sans perte » est donc prouvée pour le contenu
statique, pas pour un site à rendu JS tardif (contenu injecté ENTRE
`domcontentloaded` et `load`). La fenêtre d'effet (`attendreStabilisation`)
borne et attend l'activité réseau/mutations APRÈS le DOM prêt, ce qui couvre le
rendu par XHR/fetch — mais un rendu synchrone post-`load` sans activité réseau
échapperait. À valider sur un site réel à rendu JS lourd avant de s'en remettre
entièrement (dette inscrite à `docs/DETTES.md`).

## Le jalon : le grand tableau redevient faisable

Avec P2-10, the-internet redevient mesurable et les deux faux positifs du run
sont fermés (`blob:` `ca04789`, transitoire getlumavo `83d261a`). **Les deux
verrous du grand tableau sont levés.** Le grand tableau refait dira enfin le
vrai taux de faux positifs de la Phase 2, sur neuf sites tous jugeables.
