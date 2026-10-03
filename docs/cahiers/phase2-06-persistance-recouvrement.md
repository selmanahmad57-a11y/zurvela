# ZURVELA — Cahier P2-6 : la persistance d'un recouvrement

Ouvert le 2026-10-03. Il s'appelait « les causes sans continuité » au
carnet ; cinq mesures lui ont donné sa forme réelle, et trois prémisses
sont tombées en chemin — « c'est de l'inventaire publicitaire » (faux : ce
sont les contrôles du site), « la consolidation fond à tort » (non établi :
le rapport nomme toutes les pages), « il faut une mémoire inter-scans »
(faux : tout se mesure dans un scan).

## 0. Garde-maîtresse — ON MESURE L'EFFET, PAS SON SUPPORT

La persistance d'un recouvrement se mesure sur **le recouvrement**, jamais
sur l'identifiant ni sur l'emplacement qui le portent. Deux objets
parfaitement stables peuvent se chevaucher par hasard de mise en page, et
le hasard change à chaque rendu : ce qui est volatil n'est ni le nom ni la
position, **c'est la collision** (APPRENTISSAGES n°45).

Mesuré : `#aswift_4` existe à chaque chargement de `/about` — les 97
identifiants de la page sont stables — et **aucun `#aswift_*` n'est présent
dans les quatre chargements** quand on mesure les RECOUVREMENTS.

## 1. Les faits, mesurés avant d'écrire

Quatre chargements de la même page, dans la même session, avec la
détection du moteur (`recouvrements`), pas une réimplémentation :

| page | emplacement présent dans les 4 | victimes communes |
|---|---|---|
| demoqa `/elements` | `#root > footer` | **1 / 1 — 100 %** |
| expandtesting `/xpath-css-tester` | `#html-editor > div:nth-of-type(1)` | 1 / 2 — 50 % |
| expandtesting `/about` | **aucun** | — |

Et sur quatre scans successifs d'expandtesting, pour les clés qui
reviennent : **12 victimes communes sur 45 distinctes (27 %)**.
`#aswift_4` est `confirmee` dans trois scans **sans une seule victime
commune**.

**Les deux défauts constatés viennent du même manque** : ni `cleCause`
(`['intercepteur', page, selecteur, viewport]`) ni `identite()`
(`detecteur + element + selecteur + viewport`) ne portent la VICTIME. Donc
le protocole confirme un emplacement, et la consolidation réunit des
pages. Un seul critère les règle tous les deux.

## 1bis. OÙ LE PALIER SE DÉCIDE — corrigé le 2026-10-03, en lisant le code

P1 et P4 ci-dessous ont été écrits en situant le palier **à la détection**.
C'est le mauvais lieu, et la raison est structurelle, pas circonstancielle :

`detecter()` est appelé une fois sur les signaux de l'exploration, puis une
fois PAR REJEU sur les signaux de ce seul rejeu. **Il ne voit donc jamais
qu'une observation à la fois** — il est aveugle à la multiplicité par
construction. Et pendant l'exploration, une page n'est visitée qu'une fois
par viewport : les observations multiples viennent des REJEUX, qui arrivent
plus tard.

**L'endroit où les observations se rencontrent est le PROTOCOLE DE
CONFIRMATION** — lui seul tient ensemble le constat d'origine et les
constats de chaque rejeu.

Et cela simplifie le cahier d'un cran de plus. Le protocole pose déjà la
question « le rejeu a-t-il produit une candidate de MÊME CAUSE ? ». Il lui
manque **un seul mot** : *et de même VICTIME ?* Les trois paliers tombent
alors du matériau que `reexecuterGroupe` a déjà en main (les candidates
relevées à chaque rejeu) :

| ce que les rejeux montrent | palier |
|---|---|
| la cause ne reparaît pas | 1 — pas un défaut établi |
| la cause reparaît, **même victime** | 2 — défaut précis, ancré sur la victime |
| la cause reparaît, **victime différente** | 3 — phénomène, ancré sur l'emplacement |
| **trop peu de rejeux pour conclure** | la quatrième face — on publie |

**P3 (zéro chargement ajouté) est donc tenu PAR CONSTRUCTION**, et pas
seulement respecté : le cahier ne construit pas un mécanisme de mesure, il
lit une persistance que le protocole mesure déjà.

Le critère ne change pas ; son LIEU si. Lire P1 et P4 avec cette
correction : le palier se décide APRÈS les rejeux, et c'est la clé
PUBLIÉE qui en découle, pas la clé posée à la détection.

### L'intersection à surveiller : P2-4 et P2-6 (n°25)

Si le palier se décide au protocole, **la quatrième face dépend du nombre
de rejeux que le budget accorde** — nombre que P2-4 vient précisément de
répartir. Un groupe qui reçoit peu de rejeux (budget serré, site lourd)
tombe donc plus facilement dans « trop peu d'observations → on publie ».

C'est cohérent avec l'asymétrie « doute → publier » : moins de rejeux,
plus de doute, on publie. Mais il faut le VÉRIFIER plutôt que le supposer :
**le budget réparti ne doit pas faire taire un défaut persistant en lui
refusant les rejeux qui prouveraient sa persistance.** `calque-au-rejeu`
ne couvrira pas cet angle seul ; il faudra sans doute un gabarit où un
défaut persistant reçoit peu de budget.

## 2. Contrats — avant toute implémentation

1. **P1 — TROIS PALIERS, décidés par la persistance du recouvrement.**
   - *ne persiste pas d'un chargement à l'autre* → **pas un défaut
     établi**. Ce n'est pas « un défaut dont la victime varie », c'est une
     collision fortuite. Le protocole anti-faux-positifs fait alors son
     travail normal — enfin correctement, puisqu'il juge le recouvrement
     et non l'emplacement ;
   - *persiste, MÊME victime* → **défaut précis**, cause ancrée sur la
     victime. Le `#root > footer` de demoqa ;
   - *persiste, victime VARIABLE* → **phénomène**, cause ancrée sur
     l'emplacement, publié comme motif.

2. **P2 — L'ASYMÉTRIE DU PALIER 1 : LE DOUTE VA VERS PUBLIER.** C'est le
   palier qui TAIT, donc le seul endroit où l'on peut taire à tort. Taire
   un vrai défaut est pire que publier un bruit intermittent. **« Ne
   persiste pas » exige la PREUVE, jamais le soupçon** : un recouvrement
   qu'on n'a pas vu disparaître assez souvent reste publié.
   Le nombre de chargements et le seuil sont des RÉGLAGES (config, posés à
   froid, §13) ; l'asymétrie est l'INVARIANT, et elle vit en code.
   C'est l'inverse de l'asymétrie de la fusion (P2-3 : ne pas fondre en
   cas de doute) et c'est cohérent — là-bas le doute protégeait du
   silence par fusion, ici il protège du silence par non-publication. Les
   deux penchent du même côté : **vers le signal préservé**.

3. **P3 — ZÉRO CHARGEMENT AJOUTÉ.** Le moteur recharge déjà chaque page à
   l'exploration puis à chaque rejeu : la persistance se mesure sur ces
   observations-là. P2-4 a passé trois contrats à rendre un rechargement
   moins cher ; en ajouter un ici le défairait (n°25, l'intersection des
   cahiers).

4. **P4 — LA CLÉ SUIT LE PALIER.** Au palier 2, la victime entre dans
   l'identité de cause — le protocole cesse alors de confirmer par
   coïncidence d'emplacement, et la consolidation cesse de réunir des
   pages que rien n'unit. Au palier 3, la clé reste l'emplacement : treize
   victimes changeantes font un motif, pas treize sections.
   Mutation : mettre la victime dans la clé À TOUS LES PALIERS — le
   gabarit du palier 3 explose en autant de sections que de victimes.

5. **P5 — UN MOTIF SE DIT COMME UN MOTIF.** Une cause publiée au palier 3
   déclare que les contrôles frappés VARIENT : le rapport ne doit pas
   laisser croire qu'un bouton précis est toujours masqué quand ce n'est
   pas ce qu'on a constaté (constitution §2, les textes à garantie
   sémantique — une formulation qui promet plus que son statut détruit le
   différenciateur n°1).

6. **P6 — LA QUESTION DES DEUX PORTES** (METHODE §3bis). La persistance se
   mesure à l'exploration ET au rejeu ; la clé se forme à la
   consolidation ; la fusion de viewports (P2-3) compare des identités.
   Les trois doivent voir le même palier, sans quoi une cause classée au
   palier 3 à l'exploration ressortirait au palier 2 au rejeu.

## 3. Les attendus, écrits AVANT la mesure (METHODE §13)

- `demoqa` : `#root > footer` reste **une** cause, publiée **avec sa
  victime**, sur ses quatre pages. Le cas légitime ne bouge pas.
- `expandtesting` : les recouvrements `#aswift_*` **ne sont plus publiés
  comme défauts établis** — ils ne persistent pas.
- Le nombre de sections publiées sur expandtesting **baisse**, et aucune
  des sections restantes ne réunit des pages que rien n'unit.
- Banc entier : oracle **identité préservée** sur tous les scénarios dont
  les recouvrements persistent — ce cahier ne change rien là où l'effet
  est stable.
- `calque-au-rejeu` reste **vert** : la fusion de P2-3 est intacte.
- Aucun seuil de config déplacé pour obtenir ces chiffres.

## 4. Le gabarit, les trois faces

- un recouvrement **persistant à victime stable** → publié avec sa
  victime (palier 2) ;
- un recouvrement **persistant à victime variable** → publié comme motif,
  une section (palier 3) ;
- un recouvrement **intermittent** → non publié (palier 1) ;
- **un recouvrement intermittent vu sur TROP PEU de chargements → PUBLIÉ.**
  C'est la quatrième face, et elle est la plus importante : « ne persiste
  pas » conclu sur deux observations serait le FAUX STABLE de P2-5
  retourné. Un recouvrement vu une fois sur deux peut être
  persistant-mais-intermittent — les `aswift_N` mesurés à 1/6, 5/6 le
  sont. **Peu d'observations, c'est du doute ; le doute publie.** Si le
  moteur n'a pas fourni assez de chargements pour que l'absence soit une
  PREUVE, le palier 1 ne s'applique pas.

Chaque sens mutation-tué, et **le sens grave est le palier 1 muté vers le
silence** : un recouvrement qui devrait être publié et que le mécanisme
tait doit faire rougir le banc. C'est l'erreur cardinale de ce cahier.

## 5. Hors périmètre

- La dette « deux sections indiscernables en mode dégradé » (n°27) : c'est
  un défaut de RENDU, découvert en lisant le rapport, pas une question de
  persistance.
- La granularité des causes réseau : ce cahier ne traite que les
  recouvrements, seul cas où la persistance de l'effet a été mesurée.
