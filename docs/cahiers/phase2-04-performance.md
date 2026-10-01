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

2. **MESURER LA RÉPÉTABILITÉ AVANT DE CONSTRUIRE LE CACHE.** Le facteur 14
   dit OÙ est le coût ; il ne dit pas si un cache le réduira. Le gain d'un
   cache de décisions est proportionnel à une grandeur que personne n'a
   mesurée : **la part des états énumérés identiques d'un scan à l'autre sur
   un même site**. Un outil la mesure — deux scans d'un site stable, les
   états énumérés normalisés, le taux de répétition — et le chiffre décide
   de l'architecture :
   - répétabilité forte → le cache de décisions est la bonne arme
     (contrat 3) ;
   - répétabilité faible → le cache ne vaut pas son code, et l'effort va
     entièrement au budget de rejeu (contrat 4).
   **Aucune ligne de cache ne s'écrit avant ce chiffre.** C'est la règle
   que la brique 4b posait déjà : « c'est cette grandeur qu'il faudra
   mesurer avant de le construire, pas le coût ».

3. **Le cache de décisions est une CASSETTE d'un autre nom**, et il hérite
   de toutes ses gardes. Deux états énumérés identiques produisent la même
   décision, donc la seconde ne paie pas d'appel. Mais :
   - la clé porte la **version du prompt** et le **modèle**, exactement
     comme une cassette — sans quoi un prompt modifié rejouerait une
     décision périmée (fantôme de seconde espèce, METHODE §6) ;
   - deux réponses différentes sous une même clé sont une ERREUR, jamais un
     écrasement silencieux ;
   - le cache est **intra-scan par défaut** : sa portée inter-scans est une
     décision à part (D2), parce qu'un site change entre deux scans et
     qu'une décision mise en cache hier peut être fausse aujourd'hui.
   Contrôle : à empreinte identique, le nombre d'appels baisse et le
   résultat ne bouge pas. Mutations : clé sans version de prompt (une
   décision périmée est servie), clé sans modèle (un modèle change sans que
   rien ne rougisse).

4. **Le rejeu SÉLECTIONNÉ — et il se paie en preuve, jamais en signal.**
   Tous les groupes n'ont pas besoin du même nombre de re-exécutions : un
   groupe à double signal (0,95) est plus sûr qu'un groupe fragile (0,75).
   La politique `econome` écrite en brique 3 devient réelle et MESURÉE.
   Mais la garde-maîtresse s'applique avec sa forme la plus dure ici :
   **le rejeu sélectionné doit prouver qu'il n'écarte AUCUN vrai défaut
   qu'un rejeu complet aurait retenu.** Un gain payé en signal est l'erreur
   cardinale du projet, et c'est exactement ce que cette optimisation rend
   possible.
   Contrôle : sur le banc entier, `econome` contre `complet` — mêmes
   anomalies retenues, moins de tentatives. Mutation : un seuil qui laisse
   tomber un groupe fragile — une anomalie disparaît, le banc rougit.

5. **Le budget se RÉPARTIT, il ne s'augmente pas.** La réponse à « 54
   groupes à rejouer » n'est pas « plus de temps » : c'est moins de rejeux
   inutiles (contrat 4) et une réserve de confirmation qui tient compte du
   NOMBRE de groupes, pas d'une fraction fixe de l'échéance. La répartition
   (`echeance.repartition`) devient fonction de ce qu'il y a à faire.
   Contrôle : sur un site lourd simulé au banc, la confirmation reçoit de
   quoi rejouer ses groupes au lieu de s'arrêter à `reserve-confirmation`.

6. **Le banc gagne un gabarit LOURD.** Les trois sites qui bloquent la
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

7. **La mesure, et ce qui clôt le cahier.** Au banc : équivalence prouvée,
   appels en baisse, empreintes identiques. Sur le réel : **le grand
   tableau refait sur les neuf sites, avec automationexercise, demoqa et
   expandtesting enfin COMPARABLES** — le bilan de Phase 2 que le run du
   2026-10-01 n'a pas pu porter, et dont il devient la ligne « avant ».
   Attendus écrits dans les cas AVANT le run (METHODE §13).

Aucune règle ne porte sur un site, un hôte ou une langue : les critères
sont des comptes, des durées et des empreintes.

## 3. Budget

**Le piège propre à ce cahier : les sites qui valident sont les plus
chers.** Un scan d'expandtesting approche les cinq minutes, et une
optimisation se règle par itérations. La règle du cahier :

- **toute la mise au point se fait au banc (gratuit) et, si un site vivant
  est nécessaire, sur une cible stable et bon marché** — quotes ou books,
  ~0,04 USD le scan ;
- **les trois sites lourds ne sont scannés qu'à la validation finale**, une
  seule fois, dans le grand tableau.

- Mesure de répétabilité (contrat 2) : deux scans d'un site stable ≈ **0,10
  USD**. C'est la première dépense, et la seule avant toute décision
  d'architecture.
- Gabarit lourd et cassettes (contrat 6) ≈ **0,20 USD**.
- Mises au point sur cible stable ≈ **0,20 USD**.
- Grand tableau final, neuf sites × deux moteurs ≈ **0,85 USD**.
- **Annoncé : ≈ 1,35 USD, plafond 2,00 USD.** Tout dépassement s'annonce
  avant, jamais après, et l'estimation se refait une fois la répétabilité
  connue — elle peut supprimer le poste « cache » entièrement.

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
- **D2 — portée du cache de décisions : intra-scan seulement, ou
  inter-scans ?** Ma proposition : **intra-scan d'abord**, parce qu'un site
  change entre deux scans et qu'une décision d'hier peut être fausse
  aujourd'hui — et parce que l'inter-scans demanderait une politique
  d'invalidation que rien ne mesure encore. L'inter-scans s'ouvre en dette,
  levable par un chiffre : la répétabilité INTER-SCANS du contrat 2, si
  elle est forte.
- **D3 — que faire si la répétabilité est faible ?** Proposition :
  abandonner le cache, l'inscrire en dette avec son chiffre, et porter tout
  l'effort sur les contrats 4 et 5. Publier le chiffre qui condamne le
  cache est un résultat, pas un échec — et il évite à quelqu'un de le
  reconstruire dans six mois.
- **D4 — la politique de production change-t-elle de `complet` à
  `econome` ?** Proposition : NON par défaut. `econome` devient mesurable
  et mesurée, et le passage en production est une décision séparée, prise
  sur le chiffre « anomalies perdues = 0 » du contrat 4, jamais sur le gain
  de vitesse.
