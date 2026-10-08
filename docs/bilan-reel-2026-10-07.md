# Bilan réel du 2026-10-07 — le grand tableau, jugé par des instruments qui existent

Neuf sites, **un seul moteur** (HEAD `340ae3a`), scannés dans la même session.
Configuration de production, politique `deterministe`, mode IA **actif**,
identité déclarée (`ZurvelaBot/0.1 (+https://zurvela.com)`, en-tête
`X-Zurvela-Scan`), aucun formulaire soumis, `robots.txt` respecté. **Coût réel
0,3389 USD** (annoncé ~0,45, plafond 0,70 — **sous l'annoncé, zéro
dépassement**). Journaux durables : `~/.config/zurvela/reel/grand-tableau-2026-10-07/`
(neuf journaux, qui survivent).

Ce bilan clôt la boucle ouverte par le run de validation : celui qui avait
infirmé le « 0 % » et révélé quatre défauts, puis le grand tableau du
2026-10-06 qui avait mesuré 80 % de faux positifs, 15 d'une seule cause. Les
quatre sont traités ou classés, et **ce tableau le mesure** — il ne le déclare
pas.

Et une première : **tous les instruments du tableau existent et sont
committés**. L'oracle de jugement du recouvrement (dette n°31, `banc/oracle-recouvrement.ts`,
témoin 7/7 + 2 discrimination) et le comparateur d'équivalence honnête (dette
n°33, auto-exclusion annoncée de `site-charge`) ne sont plus des jetables de
REPL. Le jugement ci-dessous est rendu par l'oracle committé, appliqué en
direct — donc **ce tableau est comparable au prochain**, ce que les précédents
n'étaient pas. Reste n°32 (le dépouilleur), classé post-run (voir §5).

## Les neuf lignes

| site | rôle | statut | pages | cand. | **publiées** | vraies | transit. (B) | **fausses stables** |
|---|---|---|---|---|---|---|---|---|
| zurvela | témoin | comparable | 4 | 0 | 0 | — | — | 0 |
| quotes | témoin | comparable | 40 | 57 | 1 | **1** | 0 | 0 |
| getlumavo | témoin | comparable | 39 | 2 | 1 | **1** | 0 | 0 |
| books | défaut | comparable | 37 | 20 | 1 | **1** | 0 | 0 |
| cutlybook | défaut | comparable | 26 | 8 | 0 | — | — | 0 |
| automationexercise | défaut | comparable | 7 | 92 | 3 | **2** | **1** | 0 |
| demoqa | défaut | comparable | 17 | 32 | 5 | **4** | **1** | 0 |
| expandtesting | défaut | comparable | 14 | 100 | 1 | 0 | **1** | 0 |
| the-internet | témoin | **non-témoin / instable** | 40 | 22 | 0 | — | — | 0 |

**Sur les comparables (hors the-internet) : 12 sections publiées → 9 vraies,
3 transitoires déclarées (B), 0 faux positif stable net.**

## 1. (A) et (C) réparés — mesurés au réel

**(A) le mur de consentement : 15 FP → 2 constats honnêtes, la fusion PROUVÉE
tirée.** automationexercise porte deux `clic-intercepte` dont le journal montre
`murCouvrant: true` — la fusion P2-11 s'est **déclenchée en direct**, au réel.
Ce n'est pas « le mur était absent ce soir » : le marqueur prouve que c'est la
réparation qui agit, pas la chance. Gravité **mineur** (pas la cascade de 15
alarmes `bloquant`). L'oracle committé juge l'un **recouvert** (mur présent,
vrai), l'autre **cliquable** (mur transitoire — couvert au scan, libre quelques
secondes plus tard). 15 → 2, avec la preuve du mécanisme.

**(C) le proxy ACE : disparu.** expandtesting ne publie plus son `<textarea>`
proxy comme recouvrement. Sa seule section restante est une pub (`#aswift_6`),
introuvable au jugement. P2-12 confirmé au réel.

## 2. (B) déclaré, PAS résolu — le « 0 » n'est honnête que parce que (B) est à côté

Les trois sections transitoires — automationexercise mur #1 (cliquable au
jugement), demoqa `#item-0` ← `#google_ads_iframe` (pub partie), expandtesting
`#aswift_6` (pub partie) — sont la classe (B), **suspendue inter-scans**, hors
du périmètre qu'on sait traiter. Elles ne sont **pas comptées « vraies »** (ce
serait flatteur et faux) ni fondues dans un « 0 % » qui les maquillerait. Elles
sont déclarées pour ce qu'elles sont : un recouvrement réel au moment du scan,
par une pub ou un mur qui bouge entre le scan et le jugement, et qu'il faudra la
mémoire inter-scans pour reconnaître comme transitoire. Un re-scan les reverra
bouger. Le « 0 % stable » ne vaut que parce que (B) est déclaré à côté.

## 3. Le chiffre, lu juste

**~80 % → 0 % de faux positif STABLE**, sur les comparables, les transitoires
déclarés à part, the-internet en non-témoin. La formule exacte, à ne pas
raccourcir : ce n'est **pas** « le moteur ne fait plus de faux positifs » —
c'est « les faux positifs stables sont réparés et mesurés ; les transitoires
restants sont déclarés, suspendus, en attente de la mémoire inter-scans ». Le
« 0 » est vrai sur le périmètre qu'on sait traiter, et honnête sur ce qui reste.

Les témoins tiennent : zurvela immobile (0 section), quotes stable (1 vraie — le
lien de tag recouvert, le plus petit vrai positif, l'oracle le confirme). Une
régression générale du moteur les aurait fait bouger ; ils ne bougent pas. Le
tableau est lisible.

Les neuf vraies, chacune tracée à sa cause : recouvrement réel (footer fixe
demoqa `#item-8` recouvert desktop ET mobile sur 11 pages `confirmee` ; lien de
tag quotes @mobile ; mur présent automationexercise) ou source connue tenue
(contenu-mixte http/https sur automationexercise et books ; image-cassée ×2 sur
demoqa ; réponse-lente getlumavo home à 8 697 ms, **re-mesurée**
`constatee-au-rejeu` — pas publiée sur une observation unique, le piège P2-9 est
évité).

## 4. Pour la première fois, les instruments existent — donc le tableau est comparable

Oracle committé (n°31) + équivalence honnête (n°33). Le jugement de ce tableau
est rendu par un instrument versionné, pas re-tapé de mémoire. C'est la
condition de la **comparabilité** entre tableaux — tout l'intérêt du
« avant/après » de la Phase 2, que les runs précédents ne pouvaient pas donner.

## 5. La correction de jugement demoqa — le filet du run

Quatre verdicts « introuvable » sur demoqa, que le compte brut aurait pris pour
des transitoires. Le jugement à la main a refusé : *pourquoi* introuvable ? Les
`#item-N` sont les menus latéraux de demoqa, absents de la racine que le harnais
de jugement avait chargée — une **limite de l'instrument de lecture, pas une
transience**. Re-jugé sur `/elements` (la vraie page des victimes, lue dans le
journal) : footer fixe `#item-8` **recouvert** desktop ET mobile (vrai, cohérent
avec les 11 pages `confirmee`), `#item-0` **cliquable** (pub partie, transitoire).

Si les quatre « introuvable » avaient été comptés transitoires, **deux vrais
positifs (les footers recouverts) auraient disparu du tableau**. Le jugement
section par section a corrigé une limite du harnais que le compte brut aurait
laissée fausser le chiffre. C'est l'erreur même que l'oracle biaisé avait failli
causer au tableau précédent (n°48) — un « introuvable/cliquable » qui n'est pas
une transience mais un artefact d'instrument.

**Cahier des charges de n°32** (le dépouilleur committé) : il devra **charger la
bonne page par victime** (la lire dans la localisation du journal), jamais la
racine par défaut — sinon il re-fera l'erreur que le jugement à la main vient de
corriger.

## Ce que le tableau dit du projet

Le moteur est **montrable**. Les faux positifs stables sont à zéro sur neuf
sites réels, jugés par un instrument committé, le seul résidu (transitoires)
honnêtement déclaré et sa solution nommée (mémoire inter-scans). Ce n'est plus
« on verra ce que le tableau révèle » : le tableau a parlé, et il dit que le
moteur produit des rapports qu'un commerçant peut lire sans qu'on ait honte du
bruit.

Le chemin critique bascule. Restent, côté moteur : n°32 (dépouilleur committé,
post-run, avec le piège de la bonne page par victime), (B) quand la mémoire
inter-scans sera construite (gros cahier futur), et C3-b est fait. Aucun de ces
restes n'empêche de montrer le produit. La **Phase 3** — la page publique, les
premiers commerçants, écouter ce qu'ils disent du rapport — n'attend plus le
moteur.

Le run le plus important depuis la campagne a coûté **0,3389 USD**, sous
l'annoncé, zéro dépassement. La première moitié de la Phase 2 est close — non
sur un chiffre déclaré, mais sur un chiffre mesuré, jugé section par section,
par des instruments qui existent.
