# Mesure sur le réel — 2026-10-01, campagne contre P2-3

**Ce document n'est PAS le bilan de la Phase 2.** Il énonce exactement ce
qu'un run a mesuré, et pourquoi ce run ne peut pas porter le bilan.

> **Sur cinq sites stables, zéro faux positif publié et aucun signal perdu ;
> les sites porteurs du bruit restent non mesurables, faute d'exploration
> stable.**

Deux moteurs dans la même session — la campagne (`e872872`) et P2-3
(`e756134`) —, neuf sites distincts, 0,8174 USD.

## 1. Ce qui est comparable, et ce qui ne l'est pas

Quatre sites sur neuf sont sortis **déclarés, pas jugés** : leur structure
a changé depuis leur fiche, donc l'instrument refuse de les comparer
(METHODE §11).

| site | motif de la déclaration |
|---|---|
| automationexercise | 19 pages explorées < 20 attendues |
| demoqa | 10 < 20 |
| expandtesting | 6 < 15 |
| the-internet | 2 < 20 — hébergement gratuit à genoux à 23 h ; vérifié : zéro tentative de fermeture, 284 s pour deux pages, arrêt « complet ». Ce n'est pas une régression de P2-3 |

Ils sont **hors de tout chiffre agrégé**. Les inclure « parce qu'ils
montrent une amélioration » reviendrait à moyenner ce qui n'est pas de même
nature.

## 2. Les cinq sites comparables — chaque section jugée à la main

| site | campagne | P2-3 |
|---|---|---|
| books | 0 section | 1 — `contenu-mixte` **vraie** (jQuery en `http` sur page `https`) |
| cutlybook | 0 | 0 |
| getlumavo | 1 — tierce `accounts.google.com` **fausse** | 1 — `reponse-lente` interne **vraie** |
| quotes | 3 — deux tierces `fonts.gstatic.com` **fausses**, une interception **vraie** | 1 — interception **vraie** |
| zurvela | 0 | 0 |
| **total** | **4 sections : 1 vraie, 3 fausses** | **3 sections : 3 vraies, 0 fausse** |

Deux énoncés, chacun sur son run (APPRENTISSAGES n°26) :

1. sur les cinq sites comparables, la campagne publiait **3 sections
   fausses sur 4** ; P2-3 en publie **0 sur 3** ;
2. le bruit retiré ne coûte aucun signal : les trois sections de P2-3 sont
   trois vrais défauts, dont **un que la campagne n'avait jamais vu** — le
   contenu mixte de books, exhumé parce que P2-3 a exploré 39 pages là où
   la campagne en voyait 13.

## 3. LA RÉSERVE, qui compte autant que le chiffre

**Le dénominateur est minuscule : quatre sections contre trois.** Un taux
juste sur une base aussi étroite mentirait par l'ampleur qu'il suggère. Ce
n'est pas le bilan de la Phase 2, et il ne doit pas en tenir lieu.

**Observation déclarée NON COMPARABLE**, à titre d'indice et non de preuve :
sur automationexercise, la campagne publie 22 sections dont **21 fausses**
(polices Google, consentement publicitaire) ; P2-3 en publie 10 dont
**aucune tierce**. Mais les deux colonnes ne mesurent pas le même parcours
— 40 pages contre 19 —, et ce chiffre n'entre dans aucun agrégat.

## 4. Le vrai résultat : pourquoi le tableau est maigre

Voir APPRENTISSAGES n°32. En deux lignes : **les sites qui portent la masse
du bruit sont exactement ceux dont l'exploration est instable**, parce que
les deux ont la même cause — la lourdeur publicitaire. Tant que le budget
de rejeu ne permet pas de scanner stablement les sites lourds, le bruit ne
peut pas être mesuré là où il est le plus fort.

**Ce run ne clôt donc pas la première moitié de la Phase 2 : il montre que
la clôture dépend d'un cahier de plus, et il le désigne.** Le cahier de
performance devient P2-4, et sa validation sera de refaire ce tableau avec
automationexercise, demoqa et expandtesting enfin comparables. Le tableau
d'aujourd'hui en sera la ligne « avant ».
