# Bestiaire n°1 — protocole de campagne

**Brique 6b. Vingt scans réels, une version du moteur, datée.** Le banc mesure le
moteur contre des bugs que nous avons écrits ; le bestiaire mesure ce que le web
réel lui fait. Ce document existe pour que le premier site réel soit une
EXÉCUTION, pas une improvisation.

## Avant le premier scan externe — deux gestes du propriétaire

1. **La page du robot est en ligne** à `https://zurvela.com/robot` (matière :
   `docs/robot.md`). Un administrateur qui voit passer `ZurvelaBot` doit
   pouvoir savoir en une minute qui nous sommes et comment nous arrêter.
2. **La liste des sites possédés** est fournie à l'agent (cibles de rang 2).

Sans ces deux gestes, la campagne s'arrête aux cibles de rang 1 et 3.

## La règle d'or

**On ne corrige rien pendant les vingt scans**, sauf un crash qui bloque la
campagne elle-même. Chaque correction à chaud fausserait les scans suivants :
le bestiaire mesure UNE version — `aa03211` + la dette n°18 —, et une bonne
observation du mauvais moteur n'est pas une observation. Les corrections sont
des cahiers *suivants*, priorisés par les fiches.

Ce qui va démanger dès le troisième scan est précisément ce que cette règle
interdit.

## L'ordre des cibles

| rang | cible | condition |
|---|---|---|
| 1 | le site du projet lui-même, dès qu'une page existe | dogfooding |
| 2 | les sites possédés par le propriétaire | liste fournie |
| 3 | des sites de test publics conçus pour les robots | — |
| 4 | des sites publics divers, mode `aucune`, politesse active | **après** que 1–3 ont tourné propre |

Jamais de connexion réelle. Jamais de site à autorisation douteuse. Un doute
sur l'autorisation vaut refus.

## La commande, par scan

```
pnpm scan <url> --config production --sortie banc/bestiaire/fiches/NN-<slug>.rapport.md
```

`--config production` est le défaut, mais il s'écrit : ce qu'un scan réel va
faire — et ce qu'il s'interdit — se lit avant de partir, et la commande
l'annonce (soumission, robots.txt, délai, budget, échéance, agent).

Ce que la commande imprime en fin de scan est ce que la fiche recopie :
**durée, coût, pages, candidates, retenues.**

## La fiche, par scan

Une fiche par scan — `banc/bestiaire/fiches/NN-<slug>.md`, depuis
`FICHE-VIERGE.md`. Une OBSERVATION par ligne de classement ; un scan RAS a une
fiche aussi, sinon la campagne ne compte que ses ennuis.

L'URL d'un site tiers (rang 3–4) est **anonymisée** dans la fiche : le
bestiaire est committé, et un site qui ne nous a rien demandé n'a pas à y
figurer nommément.

## Le classement — taxonomie du réel

Fermée **après** la campagne, extensible **pendant** (clause des taxonomies).
Source unique : `taxonomie.json`. Une observation reçoit UNE classe :

| classe | ce que c'est |
|---|---|
| `crash` | le scan ne rend pas de rapport |
| `blocage-anti-bot` | le site nous refuse (WAF, captcha, 403 généralisé) |
| `faux-positif` | une anomalie retenue qui n'en est pas une, lue par un humain |
| `rate-suspecte` | un défaut visible à l'œil que le moteur n'a pas retenu |
| `lenteur-outil` | le scan lui-même est lent (échéance frôlée ou atteinte) |
| `rapport-illisible` | le rapport existe mais un non-technicien ne le comprendrait pas |
| `comportement-inattendu` | tout ce qui surprend sans entrer ailleurs — à nommer précisément |
| `RAS` | rien à signaler, et c'est une donnée |

**L'hypothèse `d-recouvrement` en tête de liste** : au premier site européen à
bandeau de consentement, la fiche dit si le faux positif structurel existe. Si
oui : entrée bestiaire n°1, correction dans un cahier futur.

## Le jalon de sortie

20 scans · 0 crash non expliqué · un rapport lisible par scan · le bestiaire
classé et committé · le premier tableau **réel vs banc** du projet — durée,
coût, pages, candidates/retenues par scan, face aux 0,048 USD et 5 pages
utiles du banc.

Ce tableau est ce qui raturera `docs/INVENTAIRE-PRODUCTION.md`, ligne à ligne.
