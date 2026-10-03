# ZURVELA — Cahier P2-4 : la performance, ou pouvoir juger du tout

Ouvert le 2026-10-01, quatrième cahier de la Phase 2 — **promu devant la
lenteur et le périmètre** par le grand tableau du jour
(`docs/bilan-reel-2026-10-01.md`, APPRENTISSAGES n°32). Régime : COMPLET.
Contrats d'abord ; rien ne se code avant validation du §2 et des décisions
du §6.

**Pourquoi il passe devant.** Les trois premiers cahiers réparaient le
JUGEMENT. Celui-ci répare ce que le moteur ATTEINT. Quatre sites sur neuf
sont sortis « déclarés, pas jugés » du grand tableau, et ce sont exactement
ceux qui portaient la masse du bruit : automationexercise publiait à lui
seul 22 sections dont 21 fausses, quand les cinq sites comparables réunis
n'en publiaient que 4. La corrélation est CAUSALE — la lourdeur
publicitaire produit le bruit tiers ET sature le budget de rejeu. Tant que
le second défaut tient, le premier ne se mesure pas là où il est le plus
fort. **L'objectif de ce cahier n'est pas d'aller plus vite : c'est de
pouvoir juger du tout.**

## 0. Garde-maîtresse — UNE OPTIMISATION SE PROUVE ÉQUIVALENTE, PAS SEULEMENT RAPIDE

**À poser avant tout le reste, parce que le risque de ce cahier n'est celui
d'aucun des trois précédents.** P2-1 à P2-3 pouvaient juger faux, et le banc
les surveillait directement : un faux positif, un verdict, une gravité se
voient. P2-4 ne touche à aucun verdict — il change ce que le moteur
rencontre. Et c'est là le danger, unique dans le projet :

> **Une optimisation de performance peut changer un RÉSULTAT sans changer un
> seul VERDICT.** Un cache qui sert une décision périmée, un rejeu
> sélectionné qui saute la mauvaise candidate, un budget réalloué qui
> explore moins : chacun produit un scan différent, dont chaque verdict pris
> isolément est correct. Le moteur rapide donne la bonne réponse à un scan
> qui n'est pas celui que le moteur lent aurait fait.

C'est le fantôme de troisième espèce en version performance, et aucune
colonne de la scorecard ne l'allume : détection, verdicts, gravités, faux
positifs peuvent tous rester verts pendant que le scan a changé de nature.

**La règle du cahier, donc, et elle vaut pour chacun de ses contrats :**
toute optimisation se clôt sur « plus rapide **ET** équivalent », jamais sur
« plus rapide ». L'équivalence se démontre comme à la dette n°18 — la
politique déterministe lisant le menu énuméré, prouvée sur plus de deux
cents contextes sans qu'une décision bouge : **mêmes candidates, mêmes
groupes, mêmes verdicts, mêmes sections**, sur le banc, à empreinte
identique. Une optimisation qui déplace une empreinte n'est pas une
optimisation ; c'est un changement de comportement déguisé en gain de
vitesse, et il doit être déclaré et arbitré comme tel.

**Corollaire sur l'ordre des preuves** : le gain se mesure APRÈS
l'équivalence, jamais avant. Un chiffre de vitesse obtenu sur un scan
qu'on n'a pas prouvé identique ne mesure rien.

## 1. Le fait

- **Le facteur 14, mesuré à la brique 4b** : sur 34 scans, 0,041 USD de
  profilage contre **0,583 USD de décisions de navigation**. Le coût d'un
  scan ne vit pas dans le prix du modèle mais dans le NOMBRE d'appels : un
  profilage par scan, une décision par point de choix.
- **Le coût d'un rejeu**, déclaré hors périmètre de P2-1 puis repoussé deux
  fois : ~29 s la tentative sur les sites lourds. À 54 groupes, la réserve
  de confirmation (35 % de l'échéance, `echeance.repartition`) est épuisée
  avant d'avoir rejoué le dixième d'entre eux.
- **La conséquence, mesurée le 2026-10-01** : automationexercise explore
  40, 29, 20, 19 puis 17 pages selon le moment ; expandtesting 13, 10, 6.
  Leur structure « change » à chaque regard, donc l'instrument refuse de les
  juger — à juste titre (METHODE §11), et c'est précisément ce qui rend le
  bruit inmesurable là où il est le plus fort.
- **Ce qui existe déjà et qui attend** : la politique `econome`
  (`seuilConfirmationDirecte: 0.9`) est écrite dans le protocole mais n'est
  pas la politique de production (`complet`) ; elle n'a jamais été mesurée.

## 2. Contrats — avant toute implémentation

1. **L'ÉQUIVALENCE EST UN CONTRÔLE, pas une intention.** Le banc gagne un
   mode qui compare deux exécutions du même scénario — l'une sans
   optimisation, l'autre avec — et exige l'**empreinte identique** :
   candidates, groupes, verdicts, gravités, sections publiées. Toute
   divergence est un ÉCHEC du scénario, même si les deux empreintes sont
   « correctes » séparément. Invariant en code : aucun réglage ne doit
   pouvoir rendre l'écart tolérable.
   Contrôle DANS LES DEUX SENS : une optimisation neutre doit passer, et
   une optimisation volontairement fautive doit ÉCHOUER. Mutation : un
   cache qui sert une réponse d'une autre clé — l'empreinte bouge, le
   scénario rougit, alors qu'aucun verdict n'est faux.

   **TENU, et corrigé à son premier usage (2026-10-02).** L'empreinte
   écrite d'abord fondait deux grandeurs de natures opposées et rougissait
   parce que le moteur avait observé un défaut deux fois au lieu d'une.
   Elle est désormais SCINDÉE :

   - **IDENTITÉ** — ce que le rapport dit du SITE : existence de l'anomalie,
     description, catégorie, gravité, verdict, motif, groupe de cause,
     localisations ÉNUMÉRÉES (jamais comptées), sections publiées. Égalité
     exigée ; une identité perdue est le seul ÉCHEC de l'oracle.
   - **EFFORT** — ce que le rapport dit de NOUS : observations, écartés pour
     limite d'automatisation, non-vérifiés, recouvrements poussés, et la
     note du banc. Affiché en second tableau, jamais bloquant — c'est ce
     qu'une optimisation de budget a le DEVOIR de changer.

   Le critère de partage n'est pas « est-ce imprimé dans le rapport » (les
   trois comptes déclarés le sont tous les trois) mais « cette grandeur
   parle-t-elle du site, ou de nous ? ». Il vit en CODE et non en config :
   un réglage qui ferait glisser une gravité du côté effort ferait taire
   l'oracle sans qu'aucune revue le voie (constitution §2). Dix mutations
   le gardent, dont une par champ d'identité — un test par CAS laissait
   passer le retrait du VERDICT sans aucun rouge.

   Une identité GAGNÉE n'est pas un échec mais ce n'est pas une équivalence
   non plus : l'oracle la nomme, exige qu'elle soit expliquée par écrit, et
   REFUSE alors d'afficher que le gain de vitesse est comparable — une
   durée qui tombe pendant qu'on en fait davantage ne mesure rien (n°33).
   APPRENTISSAGES n°35.

2. **LE CACHE DE DÉCISIONS EST SANS OBJET — constat du 2026-10-02, et il
   remplace le contrat qui le prévoyait.**

   Le poste « cache » est RETIRÉ du cahier, et voici pourquoi, écrit ici
   pour que personne ne le reconstruise dans six mois : **la production
   tourne en politique `deterministe`** (`config/production.json`,
   `exploration.politique`). Le chemin de décision IA n'est jamais
   emprunté, aucune clé de décision ne se forme, et deux scans réels de
   quotes.toscrape.com l'ont confirmé — 42 décisions chacun, zéro clé.

   **Le facteur 14 mesurait un coût RÉEL, mais dans une configuration qui
   n'est pas celle de la production.** 0,583 USD de décisions contre 0,041
   de profilage : mesuré à la brique 4b sous politique IA. En production,
   les décisions de navigation ne coûtent rien. Un cache ne pourrait donc
   économiser que sur un chemin que le produit n'emprunte pas — et au banc,
   où ce chemin existe, les cassettes jouent déjà ce rôle, gratuitement.

   C'est un **fantôme de troisième espèce à l'échelle d'une décision
   d'architecture** : la bonne mesure du mauvais système. Nous avons failli
   construire un cache entier pour optimiser un coût qui n'existe pas là où
   le produit tourne. Ce qui l'a révélé n'est pas la répétabilité que nous
   allions mesurer, mais le fait que la clé ne se formait JAMAIS — un
   symptôme que seule la tentative réelle de mesurer a fait apparaître.

   **Ce qui reste utile** : la clé de décision est désormais journalisée en
   production (`decision.cle`, hash seul, inerte, par la même fonction que
   le rejeu du banc). Elle ne sert à rien aujourd'hui et c'est assumé : le
   jour où la politique de production serait mise à l'étude, la
   répétabilité se mesurera sans nouvelle instrumentation.

   **Et la question qu'il NE FAUT PAS trancher ici** : la production
   doit-elle rester en `deterministe` ? C'est un arbitrage de PRODUIT —
   atteindre plus de parcours critiques (IA, guidée mais fragile) contre
   coûter zéro décision et rester déterministe (actuel) —, il dépend du
   cahier n°2 jamais fait (l'historique aveugle de l'IA), et **il ne se
   décide jamais sur le coût**. Rangé au carnet comme cahier distinct.

3. **Le rejeu SÉLECTIONNÉ — et il se paie en preuve, jamais en signal.**
   Tous les groupes n'ont pas besoin du même nombre de re-exécutions : un
   groupe à double signal (0,95) est plus sûr qu'un groupe fragile (0,75).
   La politique `econome` écrite en brique 3 devient réelle et MESURÉE.
   Mais la garde-maîtresse s'applique avec sa forme la plus dure ici :
   **le rejeu sélectionné doit prouver qu'il n'écarte AUCUN vrai défaut
   qu'un rejeu complet aurait retenu.** Un gain payé en signal est l'erreur
   cardinale du projet, et c'est exactement ce que cette optimisation rend
   possible.
   Contrôle : sur le banc entier, `econome` contre `complet` — mêmes
   anomalies retenues, moins de tentatives.
   **Premier cas déterministe, acquis le 2026-10-02 : `recouvrement--q10`.**
   Une fois le gaspillage de fermeture retiré, le desktop fait du vrai
   travail et l'échéance arrive plus tôt sur mobile : deux groupes de plus
   en `echeance-atteinte`, déclarés. Le budget paraissait suffisant parce
   qu'on ne s'en servait pas (n°36). **C'est désormais le CŒUR du
   cahier, et non plus l'un de ses deux postes** : le cache retiré, tout
   P2-4 tient dans le budget de rejeu — celui qui débloque les sites
   lourds, et la raison pour laquelle le cahier a été promu en tête. Mutation : un seuil qui laisse
   tomber un groupe fragile — une anomalie disparaît, le banc rougit.

4. **Le budget se RÉPARTIT, il ne s'augmente pas.** La réponse à « 54
   groupes à rejouer » n'est pas « plus de temps » : c'est moins de rejeux
   inutiles (contrat 4) et une réserve de confirmation qui tient compte du
   NOMBRE de groupes, pas d'une fraction fixe de l'échéance. La répartition
   (`echeance.repartition`) devient fonction de ce qu'il y a à faire.
   Contrôle : sur un site lourd simulé au banc, la confirmation reçoit de
   quoi rejouer ses groupes au lieu de s'arrêter à `reserve-confirmation`.
   **Premier cas, traité le 2026-10-02 : `calque-au-rejeu--d01-d02`.** Le
   rejeu tombait en `budget-insuffisant` à 46 s et PERDAIT une anomalie
   réelle. La réponse n'a pas été plus de temps : les clics d'essai de
   l'écartement de recouvrement étaient bornés par le budget d'ÉVALUATION
   (15 s) au lieu du délai de CLIC (2 s), déjà en config. Aucun seuil
   déplacé (METHODE §13) ; 39 s d'attente qui n'achetaient rien,
   supprimées. Le coût débordait largement le témoin : `formulaire-contact`
   perdait 34,7 s par scénario sans aucun recouvrement en jeu (n°36).

5. **Le banc gagne un gabarit LOURD.** Les trois sites qui bloquent la
   mesure sont lourds de tiers et de recouvrements ; aucun gabarit ne leur
   ressemble, et la leçon de la dette n°20 interdit de régler une
   optimisation sur des cibles vivantes seules. Régler le budget de rejeu
   en re-scannant expandtesting, ce serait régler sur une cible qui change
   à chaque passage (n°32) : on ne saurait jamais si un gain vient de
   l'optimisation ou d'une exploration différente du site.
   **Il doit reproduire la CAUSE de la lourdeur, pas sa surface** : assez
   de GROUPES à rejouer, et des rejeux assez coûteux, pour que le budget de
   confirmation soit réellement SOUS TENSION. Un gabarit « lourd » à trois
   groupes mesurerait autre chose que ce qu'il prétend (n°30) — et c'est
   précisément l'erreur que ce projet a commise quatre fois en une soirée.
   Le contrôle du gabarit lui-même : sans optimisation, il doit SATURER
   (arrêt `reserve-confirmation`, des groupes jamais rejoués) ; s'il ne
   sature pas, il ne mesure rien. Ses dimensions — pages, groupes, délai
   de chaque rejeu — vivent en config, jamais en dur.

6. **La mesure, et ce qui clôt le cahier.** Au banc : équivalence prouvée,
   appels en baisse, empreintes identiques. Sur le réel : **le grand
   tableau refait sur les neuf sites, avec automationexercise, demoqa et
   expandtesting enfin COMPARABLES** — le bilan de Phase 2 que le run du
   2026-10-01 n'a pas pu porter, et dont il devient la ligne « avant ».
   Attendus écrits dans les cas AVANT le run (METHODE §13).

Aucune règle ne porte sur un site, un hôte ou une langue : les critères
sont des comptes, des durées et des empreintes.

## 2bis. LE BUDGET RÉPARTI, ouvert par ses contrats (2026-10-02)

Le contrat « le budget se RÉPARTIT, il ne s'augmente pas » est le cœur de ce
qui reste. Il s'ouvre ici par ses sous-contrats, posés AVANT le code, sur
des faits mesurés et non sur une lecture du cahier.

### Les faits, mesurés sur `recouvrement--q10--fr` (journal du run optimisé)

| | |
|---|---|
| Échéance | 60 000 ms → exploration 30 000, confirmation 21 000, rédaction 6 000 |
| Exploration | finie à 19 666 ms, arrêt `complet` : elle REND 10 s aux phases suivantes |
| Confirmation | de 19 698 ms à 54 000 ms, soit **34 302 ms** pour **6 groupes** |
| Confiances | les six à **0,80** — rien ne distingue le premier des cinq autres |
| Groupe n°1 | 3 rejeux (2 re-exécutions + 1 contre-épreuve) à ~8 680 ms = **26 s** |
| Groupes 2 à 6 | **zéro rejeu**, tous en `echeance-atteinte` au même instant |

**Le défaut n'est pas que le budget manque : c'est qu'il n'est pas réparti.**
La boucle de confirmation est un PREMIER ARRIVÉ, PREMIER SERVI
(`for (const groupe of groupes)` + `tempsRestant()`), et rien n'empêche le
premier groupe de prendre les trois quarts du temps de tous les autres.

**Le piège que la mesure révèle, et qui interdit la réponse naïve** :
34 302 / 6 = 5 717 ms par groupe, soit **moins qu'un seul rejeu** (8 680 ms).
Une part égale en millisecondes n'affame pas un groupe, elle les affame
TOUS — les six sortiraient en `echeance-atteinte`, strictement pire que la
file actuelle. Toute répartition qui ignore l'indivisibilité d'un rejeu est
une régression déguisée en équité.

### Les sous-contrats

1. **R1 — LE BUDGET S'ALLOUE EN REJEUX, PAS EN MILLISECONDES.** L'unité
   d'allocation est le rejeu, indivisible : on calcule combien de rejeux la
   réserve peut payer, puis on distribue CES REJEUX. Un demi-rejeu n'existe
   pas — une tentative écourtée par l'échéance ne se distingue pas d'un
   rejeu complet qui n'aurait rien reproduit, règle déjà posée en P2-1.
   Mutation : allouer des millisecondes à parts égales — sur q10, zéro
   groupe rejoué, le banc rougit.

2. **R2 — LE COÛT D'UN REJEU SE MESURE, IL NE SE CONFIGURE PAS.** 8,7 s au
   banc, 29 s sur expandtesting : une constante en config ne vaudrait que
   pour le site qui l'a inspirée, et le cahier interdit déjà de régler une
   optimisation sur une cible unique (dette n°20, n°32). Le protocole tient
   une ESTIMATION COURANTE : valeur initiale en config, révisée par la
   médiane des rejeux déjà exécutés dans ce scan. Invariant en CODE :
   l'estimation ne descend jamais sous un plancher, sans quoi un rejeu
   anormalement rapide ferait promettre des rejeux impayables.
   Mutation : figer l'estimation à sa valeur de config — sur un gabarit
   ralenti, l'allocation promet plus de rejeux qu'il n'en tient.

3. **R3 — UN TOUR AVANT DEUX.** Les rejeux se distribuent par TOURS : aucun
   groupe ne reçoit sa deuxième re-exécution avant que tous aient reçu la
   première, et la contre-épreuve est un tour ultérieur encore.
   La justification est MESURÉE, pas esthétique : `juger` conclut sur les
   tentatives EXPLOITABLES (`taux = reproduites / exploitables`), donc une
   seule re-exécution reproduite suffit déjà au verdict `confirmee`. Le
   deuxième rejeu achète de la PREUVE, pas la conclusion. Trois rejeux sur
   un groupe confirment un groupe ; trois rejeux sur trois groupes en
   confirment trois. Et rien n'est sur-promis au client : la voix du
   rapport dit déjà « nos N vérifications indépendantes », N compris.
   Mutation : rendre le deuxième tour avant le premier (la file actuelle) —
   sur q10, un seul groupe rejoué, le banc rougit.

4. **R4 — AUCUN VIEWPORT N'EST SACRIFIÉ À L'AUTRE.** À l'intérieur d'un
   tour, l'ordre ALTERNE les viewports. Ce n'est pas une préférence de
   confort : en référence, le défaut de `/panier` existait sur desktop ET
   mobile, le mobile tombait en `echeance-atteinte`, et le client lisait
   « desktop » seul. Un gaspillage ne coûte pas que du temps, il tronque la
   couverture livrée (n°36).
   Mutation : ordre non alterné — sur un gabarit à deux viewports saturé,
   le mobile n'est jamais rejoué.

5. **R5 — CE QUI N'EST PAS REJOUÉ RESTE DÉCLARÉ.** Rien ne change à l'aveu :
   `limite-automatisation` / `echeance-atteinte`, compté dans
   `nbNonVerifies`, dit au client. Le budget réparti réduit le NOMBRE de
   non-vérifiés ; il ne change pas la nature de l'aveu, et il n'autorise
   aucun groupe à être conclu sans rejeu.

6. **R6 — LA QUESTION DES DEUX PORTES** (METHODE §3bis). L'allocation vit
   dans la boucle de confirmation, et le rejeu n'a pas de seconde entrée :
   l'exploration n'est pas touchée. Mais il existe une porte DÉRIVÉE —
   les candidates relevées PENDANT un rejeu (`candidatesRejeu`) repassent au
   tri final et peuvent produire des découvertes. Rejouer plus de groupes
   élargit donc la surface de découverte : c'est attendu, c'est un gain
   d'IDENTITÉ, et l'oracle doit le NOMMER plutôt que le laisser passer.

### Les attendus, écrits AVANT la mesure (METHODE §13)

- `recouvrement--q10` (fr et en) : **au moins 3 groupes rejoués** au lieu
  de 1 ; `nbNonVerifies` ≤ 2 au lieu de 4 ; l'anomalie desktop reste
  `confirmee` ; au moins un groupe **mobile** rejoué.
- `site-charge--z01` : plus de groupes rejoués qu'aujourd'hui (6 sur 54).
- Banc entier : l'oracle rend **identité préservée ou gagnée, jamais
  perdue**. Une seule identité perdue arrête le contrat.
- Aucun seuil de config déplacé pour obtenir ces chiffres.

### La mesure, et l'attendu NON TENU (2026-10-02)

Banc entier, référence = `f8f079e` : détection 97,1 % inchangée, **0 faux
positif**, 97/97 scénarios, 0 anomalie perdue. **Groupes retenus 79 contre
65**, écartés 102 contre 116 : quatorze groupes de plus réellement vérifiés.
Oracle : **0 identité PERDUE**, 54 gagnées sur 4 scénarios, 93/97 à identité
inchangée. Durée : −1,1 % à identité inchangée — ce contrat ne vend pas de
la vitesse, il emploie mieux le même budget, et c'est l'oracle qui permet de
le dire sans tricher.

| attendu écrit avant | résultat |
|---|---|
| q10 : ≥ 3 groupes rejoués (contre 1) | **3** ✓ |
| q10 : au moins un groupe MOBILE rejoué | **1** ✓ |
| q10 : `nbNonVerifies` ≤ 2 (contre 4) | **3** ✗ **NON TENU** |
| z01 : plus de 6 groupes rejoués sur 54 | **12** ✓ |
| banc : identité jamais perdue | **0 perdue** ✓ |
| aucun seuil de config déplacé | aucun ✓ |

**L'attendu non tenu l'est par une faute d'arithmétique DE L'ATTENDU, pas du
moteur**, et il reste inscrit tel quel : 34 302 / 8 680 = 3,95, donc trois
rejeux payables, donc au mieux trois groupes servis sur six et trois
non vérifiés. Écrire « ≤ 2 » supposait quatre rejeux là où le budget n'en
paie que trois. Le corriger après coup pour afficher un succès serait
exactement le geste que METHODE §13 interdit. Ce qui reste à gagner sur q10
ne viendra pas d'une meilleure répartition — elle est optimale à trois
rejeux — mais du **rejeu sélectionné** : moins de rejeux nécessaires, donc
plus de groupes servis. C'est le contrat suivant, et q10 lui sert déjà de
cas.

**Et la découverte du contrat, qui n'était pas cherchée** : la fusion de
viewports confondait deux questions — *faut-il fondre ?* et *qui survit ?*.
La preuve répondait aux deux, et cela ne se voyait pas tant que l'ordre de
traitement était stable. Dès que le budget se répartit, c'est le groupe qui
PEUT SE PAYER la contre-épreuve qui imposait son viewport, donc sa
CATÉGORIE (`mobile` ou `fonctionnel` selon le viewport, `d-recouvrement`) :
sur q05, un mur bloquant présent sur les deux viewports se publiait
« mobile ». La preuve dit désormais qu'il faut fondre ; la liste CONFIGURÉE
des viewports dit sous quelle identité on publie. APPRENTISSAGES n°37.

### Hors périmètre de ce contrat

Le rejeu SÉLECTIONNÉ (politique `econome`, un groupe très sûr qui ne paie
pas de rejeu) est le contrat suivant. Les deux se composent — moins de
rejeux inutiles ET mieux répartis — mais se mesurent séparément, sans quoi
on ne saurait pas lequel porte le gain.

## 2ter. LE REJEU SÉLECTIONNÉ, ouvert par ses contrats — et sa garde le condamne dans ses formes connues (2026-10-02)

### S1 — LA GARDE CARDINALE, et pourquoi elle est à DEUX SENS

Le rejeu sélectionné se mesure contre le rejeu complet sur le même jeu, et
l'oracle doit sortir **0 identité PERDUE et 0 identité GAGNÉE**.

Les deux sens, et c'est propre à ce contrat. Pour le budget réparti, une
identité gagnée était le résultat recherché : on vérifie PLUS, donc on
publie ce qu'on ne pouvait pas vérifier avant. Pour le rejeu sélectionné,
une identité gagnée est une ALARME : elle signifie que la sélection retient
quelque chose que le rejeu complet écartait, donc qu'elle JUGE autrement.
Ce contrat ne touche pas à *comment* on confirme, il touche à *quoi* on
confirme — il doit donc être strictement équivalent en identité, dans les
deux sens. Le même oracle, lu différemment selon ce que le contrat promet.

### S2 — LES FAITS, mesurés sur le banc entier (run `9e33624`, 185 groupes)

| | |
|---|---|
| Groupes à confiance 0,95 | **141 / 185 (76,2 %)** — bien au-dessus de `seuilConfirmationDirecte: 0.9` |
| Groupes à confiance ≥ 0,9 effectivement REJOUÉS | 57 |
| … et dont le rejeu a changé le sort | **8** : 4 `intermittente` (reproduction partielle), 4 `non-reproduite` (dont 2 par mesure sous seuil) |

**LA CONFIANCE INITIALE NE PRÉDIT PAS LE VERDICT DU REJEU : 8 sur 57, soit
14 %.** Ces huit-là sont exactement ceux que le protocole existe pour
attraper — un `POST /api/contact` qui ne se reproduit qu'une fois sur deux,
une lenteur qui redescend sous son seuil à la re-mesure.

### S3 — LES TROIS FORMES ENVISAGEABLES, et pourquoi chacune tombe

1. **Le seuil de confiance** (la politique `econome` telle qu'écrite en
   brique 3 : au-dessus de `seuilConfirmationDirecte`, confirmer sans
   rejeu). Elle publierait les 8 groupes ci-dessus avec un statut faux —
   quatre « confirmé » pour des défauts intermittents, quatre pour des
   défauts qui ne se reproduisent pas. 14 % de mauvaise publication sur les
   groupes qu'elle sélectionne. L'oracle la refuse, et il a raison. Elle
   change aussi le MOTIF (`confiance-suffisante` au lieu de `reproduite`),
   donc l'identité, donc elle est refusée deux fois.

2. **Réduire deux re-exécutions à une** pour les groupes très sûrs. Même
   défaut, par construction : `reproduction-partielle` SIGNIFIE reproduit
   une fois sur deux. Avec une seule tentative, ces quatre groupes sortent
   `confirmee` (si la tentative conservée reproduit) ou `non-reproduite`
   (sinon) — jamais `intermittente`. L'identité bascule dans les deux cas,
   et dans le sens qui sur-promet une fois sur deux.

3. **Exclure de la sélection les causes fragiles** — les huit sauvés ont
   tous une clé `reseau:`, donc « ne jamais sélectionner une cause réseau »
   les protégerait tous. Mais la mesure tue le remède : il resterait **6
   groupes sélectionnables sur 185**. Le gain serait de six rejeux sur tout
   le banc, et le critère serait taillé sur ce corpus précis — exactement
   la faute que la dette n°20 et l'apprentissage n°32 interdisent.

### S4 — CE QUI EST DONC TRANCHÉ, et à quelle condition cela se rouvre

**Le rejeu sélectionné n'est pas livrable sous sa garde cardinale, et le
poste est suspendu — pas abandonné.** C'est le deuxième fantôme de P2-4
après le cache de décisions, et il tombe de la même manière : une mesure
faite AVANT la construction dissout le levier. La différence avec le cache
est importante : le cache optimisait un chemin que la production n'emprunte
pas ; ici le chemin existe, c'est le CRITÈRE de sélection qui n'existe pas.

**Condition de réveil, écrite pour que personne ne le reconstruise au
jugé** : un critère de sélection ne se propose qu'accompagné de sa mesure
sur le banc entier, montrant 0 identité perdue ET 0 identité gagnée contre
le rejeu complet, et il doit sélectionner assez de groupes pour que le gain
existe. Les deux conditions ensemble : un critère sûr qui ne sélectionne
rien n'est pas un critère.

**Et la redirection que la mesure impose** : ce qui bloque les sites lourds
n'est pas le NOMBRE de rejeux — le budget réparti vient d'en servir 14 de
plus à budget constant — mais le COÛT d'un rejeu (8,7 s au banc, 29 s sur
expandtesting). La question à poser au prochain cahier de performance n'est
donc pas « lesquels ne pas rejouer » mais « pourquoi un rejeu coûte un
chargement de page entier ». Elle n'est pas ouverte ici : elle est nommée,
chiffrée, et rangée.

## 2quater. LE COÛT DE FERMETURE AU REJEU, ouvert par ses contrats (2026-10-02)

### Les faits, mesurés sur les 166 rejeux du banc

| | |
|---|---|
| Durée totale des rejeux | **510,5 s** |
| Navigation | 286,5 s (56 %) |
| **Fermeture des recouvrements** | **232,4 s (45 %)**, sur **58 rejeux** seulement |
| Coût de la fermeture, sur un rejeu concerné | **4 006 ms** |
| Sur `recouvrement--q10` | **6 034 ms sur 8 783**, soit **69 %**, pour un seul geste (voie C, 3 candidats morts × `clicMs`) |

Le moteur refait à CHAQUE rejeu les cinq gestes sur chaque intercepteur,
alors que le scan a déjà mesuré, sur cette page, ce qui ferme et ce qui ne
ferme pas. **Rejouer, c'est reproduire un parcours connu ; refaire
l'apprentissage est du gaspillage, pas une garantie.**

Ce poste est un CONTRAT et non un cahier parce qu'il ne se heurte qu'à un
réglage : on ne change pas ce qu'on teste, on arrête de re-découvrir ce
qu'on sait. La navigation, elle, se heurte à `variations: ['contexte-neuf']`
— une GARANTIE — et part en cahier distinct (APPRENTISSAGES n°39).

### Les sous-contrats

1. **F1 — LE SCAN APPREND, LE REJEU SE SOUVIENT.** Ce que l'écartement a
   mesuré sur un recouvrement — quel geste l'écarte, ou qu'aucun ne
   l'écarte — est mémorisé, et le rejeu consulte cette mémoire au lieu de
   re-mesurer. La clé identifie LE MÊME recouvrement SUR LA MÊME PAGE :
   url, viewport, signature de l'intercepteur.

2. **F2 — LA MÉMOIRE NAÎT ET MEURT AVEC LE SCAN.** Aucune persistance entre
   scans, et c'est un INVARIANT en code, pas un réglage : un site change
   entre deux passages, et une mémoire qui survit ferait croire au moteur
   qu'il connaît une page qu'il n'a pas vue aujourd'hui.

3. **F3 — CE QUE LA MÉMOIRE NE CONNAÎT PAS SE MESURE. La garde cardinale.**
   Un recouvrement rencontré au rejeu dont la signature n'est pas en
   mémoire ne reçoit AUCUN raccourci : séquence complète. C'est exactement
   le cas de `calque-au-rejeu` — un calque qui n'apparaît qu'au rejeu — et
   des iframes publicitaires d'expandtesting. Une absence de souvenir n'est
   pas un souvenir d'absence.

4. **F4 — UN SOUVENIR EST UN RACCOURCI, JAMAIS UNE AUTORITÉ.** Si la
   mémoire dit « le geste X ferme ceci » et que X échoue au rejeu, le
   moteur ne conclut pas : il reprend la séquence complète. Le cas commun
   est gratuit, le cas rare retombe sur la mesure, et aucun des deux ne
   ment.

5. **F5 — L'ATTENDU S'ÉCRIT EN PART DE COÛT SUPPRIMÉE, JAMAIS EN SECONDES.**
   Les 45 % sont mesurés sur un banc où les gabarits de recouvrement sont
   sur-représentés PAR CONSTRUCTION : l'échantillon n'a pas la composition
   de la population (n°32). Promettre « −4 s par rejeu » sur expandtesting,
   ce serait annoncer sur un site non mesuré un chiffre pris sur mes
   propres gabarits — un fantôme de troisième espèce en puissance.
   Ce qui est vrai partout, et qui est donc l'attendu : **pour un
   recouvrement DÉJÀ CONNU du scan, le nombre de gestes tentés au rejeu
   tombe à 0 (si rien ne le ferme) ou 1 (le geste mémorisé)**, contre cinq
   par intercepteur aujourd'hui.

6. **F6 — L'ORACLE JUGE, et ici les deux sens sont des alarmes.** La
   mémoire ne doit RIEN changer à ce qui est publié : identité préservée,
   effort réduit — le cas normal d'une optimisation de budget. Une identité
   gagnée serait aussi suspecte qu'une perdue.

### Les attendus, écrits AVANT la mesure (METHODE §13)

- Banc entier : oracle **0 identité perdue ET 0 gagnée**.
- `calque-au-rejeu--d01-d02` (fr et en) reste **vert** : le calque qui
  n'apparaît qu'au rejeu est toujours écarté, mémoire vide donc mesure
  complète. C'est le témoin de la garde F3.
- Sur les scénarios `recouvrement--*`, le nombre de `recouvrement.tentative`
  journalisés AU REJEU baisse ; sur q10, la voie C n'est plus retentée.
- Aucun seuil de config déplacé.

### La mesure (2026-10-02), et l'attendu F6 NON TENU

Référence = `9e33624`. Détection 97,1 % inchangée, **0 faux positif**,
97/97 scénarios, 0 anomalie perdue, 1720 tests.

| | référence | avec la mémoire |
|---|---|---|
| **Tentatives de fermeture sur tout le banc** | **780** | **240** (172 consultations de mémoire) |
| Durée du banc | 1 297 019 ms | **1 048 728 ms (−19,1 %)** |
| Durée à identité inchangée (93/97) | 1 103 740 ms | **954 037 ms (−13,6 %)** |
| `recouvrement--q05--fr` | 40 572 ms | **17 363 ms** |
| `recouvrement--q10--fr` | 45 970 ms | **26 299 ms**, `nbNonVerifies` 3 → **0** |
| `calque-au-rejeu--d01-d02` | 2/2, 21 491 ms | **2/2**, 15 370 ms |

**L'attendu F5, dans sa forme vraie partout : 69 % des tentatives de
fermeture supprimées** (780 → 240). C'est la grandeur qui ne mente pas hors
du banc, contrairement aux secondes.

**ATTENDU F6 NON TENU** : j'avais écrit « 0 identité perdue ET 0 gagnée ».
L'oracle rend **0 perdue et 12 gagnées** sur 4 scénarios. F6 était
MAL SPÉCIFIÉ, et je le laisse rouge : il supposait que la mémoire ne pouvait
agir que sur le coût du rejeu, alors qu'elle libère du budget dans les DEUX
phases, et qu'un budget libéré voit davantage. Chaque gain est tracé :

- `recouvrement--q10` : les trois groupes que la référence déclarait
  `limite-automatisation / echeance-atteinte` sont désormais vérifiés —
  `nbNonVerifies` passe de 3 à **0**. L'attendu laissé rouge au contrat du
  budget réparti (`≤ 2`) est donc tenu, et dépassé, par ce contrat-ci ;
- `recouvrement--q07` : **l'exploration de la référence s'arrêtait sur
  `reserve-confirmation`, à 3 pages sur 4.** Le coût de fermeture n'écourtait
  pas seulement le rejeu, **il tronquait le scan**. L'exploration va
  désormais au bout, la quatrième page est vue, le recouvrement mobile
  devient candidat, est confirmé par son propre rejeu et fusionne avec son
  jumeau desktop. C'est n°36 pour la troisième fois : un gaspillage
  falsifie le dimensionnement de tout ce qui l'entoure.

**Aucun jugement n'a changé**, et c'est vérifié et non supposé : au premier
contact, mêmes gestes tentés, mêmes candidates, 0 recouvrement écarté avant
comme après. Les 12 gains sont de la COUVERTURE, pas du jugement.

**Et ce que cela apprend sur l'instrument** : l'oracle ne peut pas
distinguer « la couverture s'élargit » de « le jugement change » — les deux
se présentent à lui comme une identité gagnée. Il NOMME la question ; seul
le journal y répond. APPRENTISSAGES n°40.

### Les mutations à tuer

- Traiter une signature ABSENTE comme « rien ne ferme » (confondre absence
  de souvenir et souvenir d'absence) : `calque-au-rejeu` rougit.
- Faire du souvenir une autorité, sans repli quand le geste mémorisé
  échoue : un gabarit dont le recouvrement change de prise rougit.
- Ignorer le viewport dans la clé : un recouvrement présent sur un seul
  viewport ferait taire l'autre.
- Laisser la mémoire survivre au scan : deux scans successifs du même
  gabarit ne doivent pas différer.

## 2quinquies. LE DÉPOUILLEMENT DU GRAND TABLEAU, posé AVANT le run

### L'instrument, éprouvé avant de lui confier le bilan

`pnpm banc:scorecard-reelle <sortie.json> <journal...>` enveloppe les
journaux de scan réel en pseudo-scénarios, nommés par l'HÔTE du site, pour
que `banc:equivalence-optimisation` les lise sans modification. Sans ce
pont, le dépouillement serait manuel sur neuf sites × des dizaines de
sections, à la fin d'un cahier, sur des runs coûteux — la situation exacte
où l'attention cède (n°34).

Il a été **éprouvé par un ROUGE avant d'être cru** : une anomalie retirée à
la main d'une copie de journal lui fait déclarer 4 identités perdues et
sortir en 1. Un adaptateur qui n'a jamais rougi ne peut pas être cru quand
il dira « 0 perdue » sur les sites lourds. Contre-épreuves : le même journal
contre lui-même sort ÉQUIVALENT ; une anomalie ajoutée sort en identité
gagnée sans perte ; deux journaux du MÊME site dans une scorecard sont
REFUSÉS — l'erreur de manipulation la plus facile du soir du tableau, qui
aurait fait apparier un moteur au hasard et déclarer une équivalence qui ne
compare rien. Trois mutations tuées.

### DEUX USAGES, DEUX COMPARAISONS, qu'on ne croise jamais

La jambe « avant » de ce soir n'est PAS la référence du 2026-10-01 : c'est
un nouveau run du moteur campagne sur les sites **d'aujourd'hui**.

- **Mesurer P2-4** : les deux jambes de CE SOIR, l'une contre l'autre. Même
  session, mêmes sites, même état du monde — c'est la seule comparaison qui
  mesure ce que le moteur change.
- **Raconter le chemin** : les chiffres du 2026-10-01 et des campagnes
  précédentes (82 % → 81 % → 61 % → 0 %). Ils disent d'où l'on vient, et
  rien d'autre.

Croiser les deux — comparer la jambe « avant » de ce soir aux chiffres de
l'autre nuit — mélangerait deux états du monde (n°26). Interdit.

### LE CRITÈRE DE DÉCISION DE `the-internet`, posé avant de voir le résultat

Il passe en premier, seul. S'il ne tient pas, deux causes et deux suites
OPPOSÉES, distinguées MAINTENANT pour que le résultat ne décide pas de sa
propre lecture :

- **Indisponibilité du site** (lenteur, pages non rendues, comme le
  2026-10-01) : ce n'est pas un échec de P2-4. Le site est déclaré
  « non mesurable ce soir » et les autres suivent.
- **Régression du moteur** (le site répond, et le modal n'est plus fermé) :
  le témoin rougit, **tout s'arrête**, et c'est le sujet.

### `the-internet` n'est PAS un témoin de run réel (acté le 2026-10-02)

Deuxième fois sur deux que son hébergement gratuit le rend indisponible le
soir d'un grand tableau : 2 pages explorées au lieu des ~20 de sa fiche,
pour LES DEUX moteurs, deux scans collés à l'échéance de 300 s. **Un témoin
qui est « non mesurable » un soir sur deux n'est pas un témoin** — faire
dépendre une décision du grand tableau de sa disponibilité, c'est confier
l'arbitrage à la météo d'un hébergement gratuit.

Il reste précieux au BANC comme cas de modal pur (c'est lui qui a donné la
voie C de P2-3). Pour le réel, les témoins stables sont **zurvela** (deux
pages statiques que nous contrôlons) et **quotes** (statique, stable).

Ce que la soirée du 2026-10-02 lui doit quand même, et ce n'est pas rien :
sur sa jambe comparable, la seule anomalie que le moteur de campagne
publiait — `dependance-tierce-en-echec`, mineur — est désormais écartée en
`sans-effet / tiers-sans-effet`. **La doctrine tierce de P2-2 est vérifiée
sur un site réel**, motif déclaré à l'appui. Un site « non mesurable » a
quand même prouvé quelque chose.

### Comment chaque ligne se lit

1. **L'oracle trie, le jugement tranche.** Aucune identité gagnée n'est
   bénigne par défaut : chacune est tracée à sa cause dans le journal —
   `echeance-atteinte` levée, arrêt `reserve-confirmation` disparu — PUIS
   jugée vraie ou bruit, section par section (n°40, METHODE §14).
2. **Une identité perdue arrête tout** et devient le sujet.
3. **Les cibles qui dérivent sont déclarées, pas moyennées.**
4. **Le bilan se lit sur les faux positifs JUGÉS**, jamais sur un total —
   la leçon du tableau maigre du 2026-10-01.
5. **Deux runs, deux phrases** (n°26).

## 3. Budget

**Le piège propre à ce cahier : les sites qui valident sont les plus
chers.** Un scan d'expandtesting approche les cinq minutes, et une
optimisation se règle par itérations. La règle du cahier :

- **toute la mise au point se fait au banc (gratuit) et, si un site vivant
  est nécessaire, sur une cible stable et bon marché** — quotes ou books,
  ~0,04 USD le scan ;
- **les trois sites lourds ne sont scannés qu'à la validation finale**, une
  seule fois, dans le grand tableau.

- **Dépensé : 0,16 USD**, et c'est une perte sèche — quatre scans de
  quotes dont aucun n'a produit de chiffre. Les deux premiers sans
  `--journal`, les deux suivants sur une politique supposée au lieu d'être
  lue. Deux règles écrites de ma main, enfreintes coup sur coup
  (APPRENTISSAGES n°34). La dépense a néanmoins acheté la découverte : la
  clé ne se forme jamais en production.
- Le poste « cache » est **supprimé** : il valait 0,10 de mesure et
  l'écriture du cache. Les deux sont annulés.
- Gabarit lourd et cassettes (contrat 5) ≈ **0,20 USD**.
- Mises au point sur cible stable ≈ **0,20 USD**.
- Grand tableau final, neuf sites × deux moteurs ≈ **0,85 USD**.
- **Annoncé : ≈ 1,41 USD au total (0,16 déjà dépensés), plafond 2,00 USD.**
  Tout dépassement s'annonce avant, jamais après.

## 4. Hors périmètre

C-02 et le reste de C-04 : P2-5 (la lenteur). C-14, C-15 : P2-6. Le cahier
n°2 de l'IA (C-01, C-08). **C-11 étendu** (la fusion inter-pages d'une même
cause, isolée à la clôture de P2-3). **Dette n°22** (l'effet visible
aveugle aux `xhr` et aux polices) — à lever avant tout argument commercial,
pas ici. **Dette n°23** (la rejouabilité sans dénominateur) : à décider à
froid. **Dette n°24** (le banc ne distingue pas deux causes sur une page).

## 5. Livraison

Les sept contrats tenus, chacun avec son contrôle et sa mutation tuée ;
l'équivalence prouvée pour CHAQUE optimisation, et déclarée comme telle ;
le chiffre de répétabilité publié même s'il condamne le cache ; le gabarit
lourd ; le grand tableau refait avec les trois sites lourds comparables ;
commit « P2-4 — la performance » à la validation seulement.

## 6. Décisions à trancher avant le code

- **D1 — la garde-maîtresse** (§0) : à confirmer telle quelle. Une
  optimisation se prouve équivalente, pas seulement rapide.
- **D2 et D3 — SANS OBJET, tranchées par le réel** (contrat 2). Le cache
  n'a pas été condamné par une répétabilité faible mais par la
  configuration de production : la clé ne se forme jamais. Le constat est
  publié dans le cahier pour que la question soit fermée, pas rouverte.
- **D4 — la politique de production change-t-elle de `complet` à
  `econome` ?** Proposition : NON par défaut. `econome` devient mesurable
  et mesurée, et le passage en production est une décision séparée, prise
  sur le chiffre « anomalies perdues = 0 » du contrat 4, jamais sur le gain
  de vitesse.
