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

## Le chiffre, jugé section par section

**La campagne publiait 5 anomalies, dont 4 FAUX POSITIFS (80 %)** — toutes
des dépendances tierces en échec sans effet visible : une sur
the-internet, deux polices Raleway sur quotes, et le **Google Sign-In de
getlumavo**, le faux positif historique du projet. La cinquième était
vraie.

**P2-4 publie 20 anomalies, dont 0 FAUX POSITIF jugé** : 17 défauts
confirmés (2 contenus mixtes, 15 recouvrements) et 3 découvertes déclarées
non re-testées, jamais affirmées (P2-1, contrat 8).

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

> **P2-4** mesure, sur les mêmes neuf sites dans la même session,
> **0 faux positif sur 20 anomalies publiées**, dont 17 confirmées et 3
> déclarées non re-testées — et il juge les quatre sites que la campagne ne
> pouvait pas atteindre.

Ces deux phrases viennent de deux runs du même soir, sur les mêmes sites,
dans le même état du monde. Elles ne se comparent à aucun chiffre d'une
autre nuit.
