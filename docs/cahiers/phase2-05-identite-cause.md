# ZURVELA — Cahier P2-5 : l'identité d'une cause — **SUSPENDU le 2026-10-03, ZÉRO CAS**

> **SUSPENDU AVANT LA PREMIÈRE LIGNE DE CODE.** Une quatrième mesure a
> montré que l'unique cas d'école du cahier n'était pas un problème
> d'identité : **les QUATORZE `reponse-lente` publiées sur l'ensemble des
> 28 journaux portaient sur une `blob:` URL**, aucune sur une vraie
> ressource réseau. Une `blob:` est un objet créé par le JavaScript de la
> page, qui ne quitte pas le navigateur, sans temps de réponse — et
> **unique PAR SPÉCIFICATION**, d'où une clé neuve à chaque fois.
>
> Ce n'était donc pas « un phénomène stable sous un identifiant volatil ».
> C'était **un faux positif dont l'identifiant est unique parce que le web
> l'exige**. Lui donner une identité stable aurait consisté à mieux ranger
> ce qu'il ne fallait pas publier : P2-5 aurait construit un mécanisme
> pour rendre continu un faux positif.
>
> Les autres candidats sont tombés aussi : les `clic-intercepte` publiés
> sous deux clés sur une même page masquent des VICTIMES DIFFÉRENTES — ce
> sont des défauts distincts, pas un défaut sous deux noms.
>
> **Il ne reste aucun cas.** À sa place : le correctif « les schémas locaux
> ne sont pas du réseau » (`core/scanner/observation/observateur.ts`),
> validé sur le site qui produisait le défaut — expandtesting publiait
> trois à quatre `reponse-lente` par scan, il en publie **zéro**.
>
> **Condition de réouverture** : un cas mesuré de phénomène stable publié
> sous plusieurs clés, où les clés désignent BIEN la même chose — c'est-à-
> dire avec la même victime. Pas un cas supposé, pas un cas de site de
> test : un cas mesuré, hors `/xpath-css-tester`.

Ouvert le 2026-10-03, après trois mesures gratuites qui ont réduit sa
portée à ce qu'elle est réellement (APPRENTISSAGES n°43). Les contrats
ci-dessous restent écrits : ils sont la trace de ce que le cahier aurait
été, et la condition de réouverture s'y réfère.

## 0. Garde-maîtresse — ON RÉVÈLE UNE CONTINUITÉ, ON N'EN INVENTE PAS

Ce cahier ne traite QUE les causes dont le phénomène est stable et dont
l'identifiant est volatil : la continuité existe, elle est masquée, on la
révèle. Il ne traite PAS les phénomènes qui n'ont pas de continuité —
aucun ré-ancrage ne crée une permanence que la réalité n'a pas. Ceux-là
sont rangés au carnet comme cahier distinct, parce qu'ils ne se décident
pas au même niveau (n°39 : un réglage est un contrat, une garantie est un
cahier).

## 1. Les faits, mesurés avant d'écrire

Trois scans de chaque site, en mode dégradé, gratuits et déterministes.

| | publiées par scan | causes revenant dans les 3 scans |
|---|---|---|
| automationexercise | 8, 6, 5 | **2 / 12 (17 %)** |
| expandtesting | 10, 7, 8 | **3 / 18 (17 %)** |
| quotes *(témoin)* | 1, 1 | **100 %** |
| books *(témoin)* | 1, 1 | **100 %** |

Puis, en groupant par PHÉNOMÈNE — (nature du défaut, page où il est
constaté) — et en regardant si sa clé change :

- **`reponse-lente` sur `/xpath-css-tester` : phénomène présent dans les
  TROIS scans, publié sous ONZE clés différentes.** C'est le cas de ce
  cahier, et le seul mesuré.
- Tout le reste des phénomènes stables garde la MÊME clé partout : rien à
  réparer. Y compris les recouvrements publicitaires dont l'emplacement
  revient (`#aswift_4`, `#aswift_5`, `#aswift_8` reviennent trois fois sur
  trois) — l'identifiant AdSense est un compteur d'emplacement, pas un
  jeton aléatoire.
- Les phénomènes qui ne reviennent pas (7 causes sur 12 à
  automationexercise, vues dans un seul scan) n'ont aucune continuité à
  retrouver : hors périmètre, cahier B.

**Ce que la mesure a aussi retiré** : l'idée que les URL à UUID seraient
« le même endpoint sous un autre nom ». Elles ne le sont pas — ce sont des
ressources à usage unique, de type `requete-en-attente`, sans mesure, et
le chemin privé de son UUID vaut `/`. Il n'y a aucun endpoint commun à
retrouver. Ce qui persiste est le couple (nature, page), rien de plus fin.

## 2. Contrats — avant toute implémentation

1. **C1 — LA VOLATILITÉ D'UNE CLÉ SE MESURE DANS UN SEUL SCAN.** Le moteur
   recharge déjà chaque page plusieurs fois : l'exploration, puis chaque
   rejeu. Si un même phénomène — (nature, page) — se présente sous des
   clés différentes d'une observation à l'autre DU MÊME SCAN, sa clé est
   volatile, prouvé. Coût : zéro chargement supplémentaire.
   Le contrôle qui peut échouer : une implémentation qui demanderait un
   chargement de plus. Le cahier P2-4 vient de passer trois contrats à
   rendre un rechargement moins cher ; en ajouter un ici serait le défaire.

2. **C2 — ON NE REGROUPE QUE CE QUI EST PROUVÉ VOLATIL.** Une clé stable
   reste la clé : c'est le meilleur ancrage et la meilleure lisibilité
   d'un rapport. Seules les clés mesurées volatiles sont remplacées par le
   grain immédiatement supérieur où le phénomène persiste.
   L'asymétrie, et elle est la garde du cahier : **regrouper à tort perd
   un signal** (deux défauts distincts fondus en un, le client n'en
   corrige qu'un), **ne pas regrouper coûte une section en double**. Le
   premier est bien plus grave — donc le doute se résout en NE REGROUPANT
   PAS. C'est l'inverse de l'asymétrie du cahier B, et c'est voulu : ici
   on agit sur ce qu'on publie déjà, là-bas on déciderait de ne pas
   publier.
   Mutation : regrouper dès que deux clés diffèrent, sans preuve de
   volatilité — deux lenteurs réellement distinctes sur une même page
   fondent, le banc rougit.

3. **C3 — LE GRAIN DE REPLI EST LE PLUS FIN QUI PERSISTE, JAMAIS LE PLUS
   COMMODE.** Pour le cas mesuré, (nature, page) persiste. Mais ce grain
   est grossier : deux endpoints réellement distincts et réellement lents
   sur la même page fondraient. Le contrat exige donc que le repli soit
   CHOISI PAR MESURE parmi les grains candidats, du plus fin au plus
   grossier, et que le premier qui persiste l'emporte — jamais un grain
   fixé d'avance.
   Contrôle : un gabarit à deux lenteurs distinctes et stables sur une même
   page doit rendre DEUX sections ; le même gabarit avec des URL générées
   doit en rendre UNE.

4. **C4 — CE QUI A ÉTÉ REGROUPÉ SE DIT.** Le rapport déclare qu'un
   phénomène a été constaté sous plusieurs identifiants et combien — comme
   il déclare déjà ses écartements et ses non-vérifiés (constitution §3 :
   ce que le moteur a FAIT se dit au client). Un regroupement muet serait
   indistinguable d'une sous-détection.

5. **C5 — COÛT NUL LÀ OÙ IL N'Y A RIEN À MESURER.** Les témoins le
   prouvent : quotes et books rendent des scans identiques à l'octet près.
   Le mécanisme ne doit rien coûter sur un site dont aucune clé ne varie.
   Contrôle : l'oracle d'équivalence sur le banc entier doit rendre
   **identité préservée** sur tous les scénarios sans identifiant généré.

6. **C6 — LA QUESTION DES DEUX PORTES** (METHODE §3bis). L'identité d'une
   cause se forme à la consolidation, qui est la porte unique du scan ;
   mais le REJEU reforme des clés sur les candidates qu'il relève, et la
   fusion de viewports (P2-3) compare des identités. Les trois chemins
   doivent voir la même identité, sans quoi une cause regroupée à
   l'exploration ressortirait éclatée au rejeu.

## 3. Les attendus, écrits AVANT la mesure (METHODE §13)

- `expandtesting` : le phénomène `reponse-lente` sur `/xpath-css-tester`
  sort en **une** section au lieu de trois à quatre par scan, et la même
  d'un scan à l'autre.
- Les témoins `quotes` et `books` : **scans identiques à l'octet près**,
  comme aujourd'hui.
- `calque-au-rejeu` reste **vert** : la fusion de P2-3 est intacte sur les
  causes stables.
- Banc entier : oracle **identité préservée**, 0 perdue ET 0 gagnée — ce
  cahier ne change pas ce qu'on détecte, seulement comment on le nomme.
- Aucun seuil de config déplacé.

## 4. Le gabarit, les deux faces

- un défaut stable sous un identifiant GÉNÉRÉ, répété N fois → doit sortir
  en UNE section, la même d'un scan à l'autre ;
- deux défauts réellement DISTINCTS et stables sur la même page → doivent
  rester DEUX sections (le sens grave) ;
- un défaut stable à identifiant stable → rien ne change (P2-3 tient).

## 5. Hors périmètre, explicitement

Les phénomènes sans continuité — recouvrements publicitaires dont la
publicité, l'emplacement et la victime changent à chaque chargement. Ils
ne relèvent pas de l'identité mais d'un arbitrage de produit : un effet
visible mais non reproductible est-il un défaut du site ? Rangé au carnet
comme cahier distinct, à ouvrir APRÈS celui-ci, sur le résidu réellement
mesuré.
