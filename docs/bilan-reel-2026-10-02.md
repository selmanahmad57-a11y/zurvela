# Bilan réel du 2026-10-02 — ce que la Phase 2 a rendu

Neuf sites, deux moteurs dans la même session : la **campagne** (`e872872`,
avant la Phase 2) et **P2-4** (`31a8224`). Dix-huit scans, **0,6241 USD**.
Configuration de production, politique `deterministe`, identité déclarée
(`ZurvelaBot/0.1`), aucun formulaire soumis.

## Les neuf lignes

| site | pages av/ap | candidates av/ap | **publiées av/ap** | ce que P2-4 publie |
|---|---|---|---|---|
| zurvela *(témoin)* | 4 / 4 | 0 / 0 | 0 / 0 | — |
| quotes *(témoin)* | 40 / 40 | 38 / 57 | **3 / 1** | 1 recouvrement |
| books | 13 / **40** | 13 / 20 | **0 / 1** | 1 contenu mixte |
| cutlybook | 26 / 26 | 8 / 8 | 0 / 0 | — |
| getlumavo *(témoin)* | 40 / 40 | 1 / 1 | **1 / 0** | — |
| the-internet *(témoin)* | 2 / 2 | 14 / 14 | **1 / 0** | — |
| demoqa | 16 / 8 | 69 / 26 | **0 / 2** | 2 recouvrements |
| automationexercise | 15 / 7 | 325 / 94 | **0 / 7** | 1 contenu mixte, 6 recouvrements |
| expandtesting | 15 / 6 | 259 / 82 | **0 / 9** | 6 recouvrements, 3 lenteurs *(découvertes)* |

## ⚠ AMENDEMENT DU 2026-10-03 — le chiffre publié était faux

Ce bilan annonçait « 0 faux positif ». **C'est faux, et je le corrige.**

Les trois `reponse-lente` d'expandtesting, que j'avais classées « ni vraies
ni fausses par construction » parce qu'elles étaient déclarées non
re-testées, **sont trois faux positifs** : leurs ressources sont des
`blob:` URL — des objets créés par le JavaScript de la page, qui ne
quittent jamais le navigateur et n'ont aucun temps de réponse. Le moteur
les comptait comme des requêtes réseau en attente. Mesuré le lendemain, en
cherchant le cas d'école d'un autre cahier : **14 `reponse-lente` sur 14,
dans les 28 journaux, portaient sur une `blob:`**.

**Le chiffre honnête :**

> campagne : **4 faux positifs sur 5 publiées (80 %)**
> P2-4 : **3 faux positifs sur 20 publiées (15 %)**, tous de la même cause

Tout le reste du bilan tient : aucune identité perdue, les trois sites
lourds enfin jugés, le témoin immobile, le défaut de sécurité de `books`
récupéré. Mais « 0 % » était une classification, pas une mesure — et c'est
exactement ce que METHODE §14 interdit : un statut (« déclaré non
re-testé ») n'est pas un jugement, c'est un jugement DIFFÉRÉ, qui doit
finir par tomber.

Le correctif est livré (`estRessourceReseau`, les schémas locaux ne sont
pas du réseau) et validé sur le site qui produisait le défaut :
expandtesting publie désormais **zéro** `reponse-lente`. Le 0 % redeviendra
vrai — mais après correction et par la mesure, pas avant et par commodité.
La différence est tout.

## ⚠ SECOND AMENDEMENT DU 2026-10-04 — le « 0 % » est INFIRMÉ, et il est MESURÉ

Le premier amendement promettait : *« Le 0 % redeviendra vrai — mais après
correction et par la mesure, pas avant et par commodité. »* Le run de
vérification a eu lieu : neuf sites, moteur `751778e`, configuration de
production, identité déclarée, **0,4483 USD**. Il **infirme** le 0 %. La
promesse est donc tenue au sens où elle engageait — mesurer — et non au
sens où elle espérait.

**Le `blob:` est éteint, confirmé en conditions réelles.** Sur les neuf
sites, 24 sections publiées, **une seule** `reponse-lente`, et **zéro sur
un schéma local** — y compris sur expandtesting, le site même qui
produisait les trois faux. Le correctif `ca04789` tient sur le réel.

**Le chiffre honnête, mesuré :**

> **1 faux positif sur 20 sections comparables — 5,0 %**, plus **4 cibles
> instables déclarées à côté**, non moyennées.

| site | publiées | vraies | fausses | instables |
|---|---|---|---|---|
| books | 1 | 1 | — | — |
| cutlybook | 0 | — | — | — |
| quotes | 1 | 1 | — | — |
| zurvela *(témoin)* | 0 | — | — | — |
| **getlumavo** | 1 | 0 | **1** | — |
| the-internet | 0 *(non mesurable)* | — | — | — |
| automationexercise | 11 | 10 | 0 | 1 |
| demoqa | 4 | 4 | 0 | 0 |
| expandtesting | 6 | 3 | 0 | **3** |
| **total** | **24** | **19** | **1** | **4** |

**L'unique faux positif est sur notre propre produit**, et c'est une
lenteur transitoire : `reponse-lente` sur le document de getlumavo,
8 676 ms relevés dans une observation unique, alors que le document répond
en **552, 806, 1 088 et 2 361 ms** sur quatre chargements à contexte neuf.
Huit pour cent au-dessus du seuil, au palier de confiance le plus bas.

Les quatre instables sont toutes pilotées par des régies — `aswift_*`
d'AdSense sur expandtesting, la boîte Funding Choices sur
automationexercise : la bannière est présente ou non selon le chargement.
Mesurées trois fois chacune, elles sortent 1 fois sur 3. C'est un site non
déterministe, pas un moteur qui se trompe — et on le DÉCLARE au lieu de le
moyenner.

### L'instrument de jugement a dû être corrigé en cours de dépouillement

Le premier oracle utilisait `click({trial: true})`, qui **fait défiler
l'élément au centre** avant de tester — ce qui écarte mécaniquement tout
pied de page collant ou toute bannière fixe. Il répondait donc à « cet
élément est-il atteignable SI L'ON FAIT DÉFILER », quand la question était
« est-il atteignable LÀ OÙ LE VISITEUR LE VOIT ». Il déclarait faux des
vrais positifs : demoqa `#root > footer`, en `position: fixed`, couvre le
lien aux trois positions de page.

**Six verdicts se sont inversés** quand le défilement a été retiré. Les
deux sites déjà dépouillés ont été entièrement re-jugés avec l'oracle
corrigé — on ne juge pas deux sites à deux instruments. Le tableau
ci-dessus est celui de l'oracle corrigé : `elementFromPoint` au centre de
la victime, **sans défilement**, à trois positions de page, deux à trois
passages par section ; `curl` sur le HTML et les feuilles de style pour le
contenu mixte ; `naturalWidth` pour les images. Apprentissage n°48.

### Ce que le run a dissous, et les trois cahiers qu'il a révélés

**Il n'y a pas de faux négatif de lenteur sur getlumavo.** Une première
sonde avait relevé des bundles à 14, 28, 29 et 36 secondes, ce qui aurait
voulu dire que le moteur taisait du sévère en publiant du passager. Elle
mesurait faux — son propre affichage était corrompu, ce qui aurait dû
alerter. Quatre passages sous les conditions exactes du moteur ne la
reproduisent pas : `load` tombe entre 1 713 et 2 414 ms, incompatible avec
un vendor chunk à 29 s. Les seules vraies lenteurs sont deux vidéos de
démonstration à 10–15 s, et **le moteur les voit** (`showcase-2.mp4` sort
en candidate à 9 683 ms dans le scan réel).

Trois défauts moteur, eux, sont mesurés et inscrits au backlog, par
priorité révisée :

1. **`attenteMs` est plafonnée par la fenêtre d'effet** →
   `attendreStabilisation` borne à `attenteEffetMaxMs = 12000`, donc
   `attenteMs / seuilMs ≤ 1,5` au mieux (mesuré : 11 131 ms pour 14 629 ms
   réels). Les paliers `ratioMin: 1.5` et `ratioMin: 3` sont
   **inatteignables** pour une requête en attente : la lenteur qui ne finit
   jamais sort toujours à 0,70, le plancher. Inversion au cœur du
   détecteur.
2. **Le sélecteur positionnel ne résout pas chez le client** → sur 15
   `clic-intercepte` vraies, **9 nomment un sélecteur introuvable**
   (`citePresent: false` dans 10 cas sur 10 sur automationexercise), parce
   que c'est un chemin positionnel dans le DOM d'un tiers régénéré à chaque
   chargement. L'anomalie est vraie, l'adresse est fausse.
3. **`waitUntil: 'load'` prend le scan en otage** → the-internet passe de
   40 pages à 2 parce qu'une ressource bloque le `load`, alors que
   `domcontentloaded` rend une page complète à 46 liens en 5 410 ms.
   Reproduit avec Playwright nu et l'agent par défaut : ni régression
   moteur, ni site qui punit `ZurvelaBot`.


## Le chiffre, jugé section par section

**La campagne publiait 5 anomalies, dont 4 FAUX POSITIFS (80 %)** — toutes
des dépendances tierces en échec sans effet visible : une sur
the-internet, deux polices Raleway sur quotes, et le **Google Sign-In de
getlumavo**, le faux positif historique du projet. La cinquième était
vraie.

**P2-4 publie 20 anomalies, dont ~~0~~ 3 FAUX POSITIFS** *(corrigé par le
premier amendement : la phrase ci-dessous datait du jour du run, quand les
3 découvertes étaient encore comptées comme hors-jugement)* : 17 défauts
confirmés (2 contenus mixtes, 15 recouvrements) et 3 découvertes déclarées
non re-testées, jamais affirmées (P2-1, contrat 8) — **ces 3 sont les faux
positifs `blob:`**.

**Aucune identité perdue nulle part.** Chaque anomalie que la campagne
publiait et que P2-4 ne publie plus a été tracée au journal : ce sont les
quatre faux positifs tierce, tus avec leur motif `tiers-sans-effet`. La
cinquième — le recouvrement de quotes — est toujours publiée, re-clé sur sa
cause et re-graduée par P2-3 : même cible, même intercepteur, mieux décrite.

## Ce que chaque pilier a prouvé sur le réel

- **P2-2, la doctrine tierce** : vérifiée sur quatre sites, dont getlumavo
  — notre propre produit, où le Google Sign-In est enfin tu.
- **P2-3, le recouvrement** : la gravité se distribue (`important` au lieu
  d'un `bloquant` uniforme), la cause se nomme sur l'intercepteur.
- **P2-4, le budget** : `books` passe de 13 à 40 pages et publie un
  **défaut de sécurité réel** (jQuery chargé en http) que l'ancien moteur
  n'avait jamais atteint. Le gaspillage ne coûtait pas que du temps : il
  cachait une faille au client.
- **Les trois sites lourds, jamais jugés jusqu'ici, le sont** : demoqa,
  automationexercise et expandtesting publiaient **zéro** anomalie sous la
  campagne — 325 et 259 candidates toutes écartées en `echeance-atteinte`.
  Ils publient aujourd'hui 2, 7 et 9 défauts réels.
- **Le témoin n'a pas bougé** : zurvela rend exactement la même chose sous
  les deux moteurs.

## La comparabilité, et son périmètre déclaré

Les trois sites lourds sont comparés sur leur **socle commun** — les pages
que les deux moteurs ont réellement visitées (dette n°25) :

| site | pages comparées | pages vues par la seule campagne | identités perdues |
|---|---|---|---|
| demoqa | 8 | 8 | **0** |
| automationexercise | 7 | 8 | **0** |
| expandtesting | 6 | 9 | **0** |

P2-4 explore moins parce que P2-1 a donné à la confirmation une réserve que
l'exploration ne peut plus manger : *16 pages vues et rien jugé* contre
*8 pages vues et jugées*. Sur les pages que la campagne a vues en plus,
elle n'a rien publié non plus — ses candidates y étaient toutes en
`echeance-atteinte`.

## CE QUE LE RÉEL RÉVÈLE, ET QU'AUCUN CAHIER N'A TRAITÉ

Les deux sites riches en publicité montrent un défaut d'une nature neuve.
**Ce n'est pas un faux positif** — les cadres publicitaires couvrent
réellement des liens produits, et un visiteur qui clique touche la publicité
au lieu du lien. C'est un problème d'**IDENTITÉ DE LA CAUSE** :

- les intercepteurs sont des `<iframe>` AdSense dont l'identifiant est
  **généré à chaque chargement** — `#aswift_2`, `#aswift_9`, `#aswift_17` —
  et dont `signatureConstruction` ne tire **aucune signature** (`null`) ;
- la clé de cause retombe donc sur cet identifiant volatil ;
- les trois lenteurs d'expandtesting portent sur des URL en **UUID de
  session** (`/1fa9aa73-dee9-…`), même problème sous une autre forme.

Deux conséquences, toutes deux graves pour le produit :

1. **Un phénomène, plusieurs sections.** « Les publicités couvrent le
   contenu » sort en six sections au lieu d'une. Le client lit six défauts
   là où il y en a un à corriger.
2. **Aucune continuité.** Au prochain scan, les mêmes publicités auront
   d'autres identifiants : le bestiaire ne pourra pas suivre le défaut, et
   le client verra « six nouveaux défauts » chaque semaine.

**L'identité d'une cause doit survivre à un rechargement.** C'est le
prochain cahier, et seul le réel pouvait le découvrir — c'est exactement ce
que les trois sites lourds devaient nous apprendre.

## Les deux phrases du bilan, séparées (n°26)

> **La campagne** mesurait, sur ces neuf sites, **4 faux positifs sur 5
> anomalies publiées**, et ne publiait rien du tout sur les quatre sites les
> plus lourds, faute de budget pour les confirmer.

> **P2-4** mesurait, sur les mêmes neuf sites dans la même session,
> **3 faux positifs sur 20 anomalies publiées (15 %)** — tous de la même
> cause, les schémas locaux comptés comme du réseau — et il juge les quatre
> sites que la campagne ne pouvait pas atteindre.

Ces deux phrases viennent de deux runs du même soir, sur les mêmes sites,
dans le même état du monde. Elles ne se comparent à aucun chiffre d'une
autre nuit.

**Et une troisième phrase, d'une autre nuit, qui ne se compare donc à
aucune des deux** — c'est le run de vérification du 2026-10-04, après le
correctif des schémas locaux :

> **Le moteur `751778e`** mesure, sur ces neuf sites, **1 faux positif sur
> 20 sections comparables (5,0 %)** — une lenteur transitoire sur notre
> propre produit — avec **4 cibles instables déclarées** à côté, et
> **zéro `reponse-lente` sur un schéma local**.

La phrase de P2-4 a porté « 0 % » pendant un jour, puis « 15 % » après
mesure. Celle-ci porte « 5,0 % » parce qu'un run est allé la chercher. Le
chiffre qui a survécu à un run qui cherchait à le réfuter vaut plus que
celui qu'aucun run n'a attaqué.
