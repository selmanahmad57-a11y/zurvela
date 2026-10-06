# ZURVELA — Cahier P2-11 : le mur couvrant

Ouvert le 2026-10-06. Premier des trois cahiers révélés par le grand tableau
(`docs/bilan-reel-2026-10-06.md`), MESURÉ avant d'être conçu. Le plus gros :
15 des 20 faux positifs du tableau, d'une seule cause.

## Le défaut, mesuré

Sur automationexercise, le moteur publie **15 `clic-intercepte`** « bloquant /
important » pour **un seul mur de consentement** (Google Funding Choices)
couvrant la page. Occlusion physiquement réelle et reproductible (oracle
`recouvert` sur chargement neuf), mais **pas 15 défauts du site** : un mur de
consentement standard, qu'un visiteur lève en un clic.

Deux mesures préalables ont décidé la conception, avant tout contrat :

**Q1 — un mur couvrant PAR PAGE, pas N défauts.** Les 15 interceptions
couvrent 8 pages ; sur chacune, tous les intercepteurs partagent un **ancêtre
couvrant unique** (`div:nth-of-type(4)` → `fc-help-dialog-overlay`, plein
viewport 1280×800). Le moteur sur-compte pour deux raisons mesurées : il ancre
la cause sur le nœud interceptant **le plus profond** (overlay, `li`, bouton),
jamais sur le conteneur couvrant ; et la clé de cause inclut la page (8 pages =
8 causes — c'est C-11). `cleCause` (`d-recouvrement.ts`, niveaux 2-3) ne connaît
pas le critère « ancêtre couvrant commun ».

**Q2 — le mur est la SEULE barrière.** En retirant le sous-arbre du mur en
sonde (jamais en cliquant « Consent » — aucun consentement donné) puis en
re-jugeant à l'oracle : **7 victimes résolvables sur 7 passent
`recouvert → cliquable`, 0 reste recouverte.** Aucun vrai défaut dessous :
c'est, mesuré, un consentement, pas un blocage du site.

**Ce que Q2 a éliminé.** Une voie envisagée — « distinguer consentement de vrai
blocage par le retrait » — est **impossible en production** : retirer le mur,
c'est AGIR, ce que l'arbitrage éthique de P2-3 interdit. La sonde peut le faire
pour diagnostiquer (gratuit, hors ligne) ; le moteur ne le peut pas sans
franchir. La mesure a donc tué une option avant qu'on ne pèse une voie
impossible.

## Le périmètre, resserré par la lecture du code

`ecarter-recouvrement.ts` porte déjà, inscrit le 2026-09-30, la doctrine
éthique : **le moteur ne consent jamais pour autrui** ; un mur qu'aucun geste
neutre n'écarte tombe dans « non écartable par un geste neutre ». **Le côté
éthique est donc CLOS.** P2-11 ne touche PAS la fermeture : il ne décide que
**ce qu'on PUBLIE** d'une occlusion couvrante non écartable. Aucun geste
nouveau, aucun CTA cliqué.

## L'arbitrage, tranché par la mesure

« Que publier d'un mur couvrant non écartable ? » Trois voies envisagées : (a)
un constat unique honnête ; (b) écarter si *dismissable* ; (c) distinguer
consentement de vrai blocage. Q2 a tué (c) (retrait interdit en production). (b)
exige de lire un contrôle de fermeture (souvent absent côté « refuser » d'un
RGPD) et, surtout, revient à décider que le mur est inoffensif — ce que le
moteur ne peut pas savoir sans le retrait interdit.

**Reste (a), et c'est la décision du cahier : publier un constat unique
honnête, pour TOUT mur couvrant, sans jamais prétendre savoir s'il est voulu.**
Le moteur ne distingue PAS consentement de piège — il ne le peut pas de
l'extérieur — donc il publie les deux à l'identique : « un élément couvre
l'interface et empêche l'accès à N contrôles ». Un fait observable, une cause,
N localisations. Le client juge si c'est voulu ; le moteur ne le prétend pas.

Pourquoi pas « écarter tout mur couvrant » : parce que le moteur ne peut pas
savoir qu'un mur est inoffensif (le retrait est interdit), donc écarter les
murs reviendrait à **taire aussi un vrai overlay bloquant sans issue** — un
piège qui enferme le visiteur. §15 : le doute va vers PUBLIER, jamais vers
taire. Mieux vaut signaler un consentement standard (bruit mineur, honnête) que
taire un vrai piège (signal perdu).

## Les contrats

**C1 — reconnaître le mur couvrant par sa FORME OBSERVABLE (critère Q1).** Un
intercepteur est un « mur couvrant » quand un de ses ancêtres (ou lui-même)
couvre une **large part du viewport** (seuil en config, `réglage`) ET qu'il
intercepte **au moins N victimes distinctes** (seuil en config — une seule
victime n'est pas un mur, c'est un recouvrement localisé, qui reste tel quel).
Critère **physique et universel** : la fraction de viewport couverte, mesurée
en page (`getBoundingClientRect` de l'ancêtre couvrant / `innerWidth×innerHeight`).
**Aucune classe `fc-*`, aucun texte, aucun modèle** — invariant maître §2. Le
mur est l'ancêtre couvrant, pas le nœud le plus profond.

**C2 — fondre en UNE cause par mur couvrant (étend C-16, absorbe le cas
consentement de C-11).** Les victimes dont les intercepteurs partagent un même
ancêtre couvrant sont **une** cause, dont l'élément en cause est l'ancêtre
couvrant, et dont les N victimes deviennent les localisations (« N contrôles
bloqués »). Un mur couvrant de **même construction** (signature structurelle,
déjà calculée par `signatureIntercepteur`) servi sur plusieurs pages est **un
seul mur récurrent** (un chrome de site, pas N défauts de contenu) : la clé de
cause d'un mur couvrant **laisse tomber la page**, contrairement à un
recouvrement localisé qui la garde. C'est l'absorption du cas consentement de
C-11, et seulement celui-là (le problème général « défaut récurrent vs
défaut-par-page » de C-11 reste ouvert, parce qu'un mur couvrant est par nature
un chrome site-large, pas du contenu). **Asymétrie C-16 préservée** : on ne fond
que si le critère C1 est rempli ; sinon, un intercepteur = une cause, comme
aujourd'hui.

**C3 — publier un constat unique honnête, dans la voix.** Le constat d'un mur
couvrant se dit « un élément couvre l'interface et empêche l'accès à N
contrôles [sur ces pages] » — un **fait observable**, sans prétendre que c'est
un consentement (le moteur ne le sait pas — ce serait lire le monde) ni que
c'est un bug. La formulation vit dans la voix (`core/rapport/voix.ts`, texte à
garantie sémantique, par langue, sous revue) : c'est une PROMESSE de périmètre
(« nous constatons une occlusion, nous ne jugeons pas l'intention »), pas de la
prose utilitaire. Gravité = le pire de ce que le mur couvre (`nature-masquee`,
inchangé), mais **une** cause. La cause fusionnée porte un marqueur « mur
couvrant » qui sélectionne cette formulation.

**C4 — la garde cardinale : publier TOUT mur couvrant, ne distinguer RIEN (le
sens grave de l'asymétrie).** Le moteur ne tente pas de dire consentement de
piège — il ne le peut pas sans le retrait interdit. Il publie **tout** mur
couvrant comme « un élément couvre l'interface ». Donc un **vrai overlay
bloquant sans issue** (un piège réel) est PUBLIÉ, jamais tu, jamais fondu dans
« mur inoffensif ». Mutation grave à tuer : tout chemin qui ÉCARTERAIT un mur
couvrant (le traitant comme inoffensif) tairait un vrai piège → doit rougir le
témoin. On ne gagne jamais le bruit en payant du silence (différenciateur n°1).

**C5 — le côté éthique est déjà clos, on n'y touche pas.** P2-11 ne modifie ni
`ecarter-recouvrement.ts` ni les gestes de fermeture : la reconnaissance et la
fusion du mur couvrant se font APRÈS la fermeture, sur les `restants` non
écartés, dans la chaîne de détection/fusion (`d-recouvrement.ts` `cleCause`).
Aucun geste ajouté, aucun consentement posé.

**C6 — témoin fidèle, jamais contrefait, DEUX faces + mutation dans les deux
sens.** Gabarit (famille `recouvrement`) où un **overlay couvrant** bloque N
victimes réelles :
 - **face « mur couvrant »** : l'overlay couvre une large part du viewport et
   intercepte N victimes → **une** cause publiée (« un élément couvre
   l'interface et bloque N contrôles »), pas N.
 - **face « vrai piège sans issue »** : un overlay couvrant qu'aucun geste
   neutre n'écarte, sous lequel les victimes resteraient inaccessibles → publié
   AUSSI, comme une cause couvrante — **pas tu**. (Le moteur ne les distingue
   pas ; les deux sortent « un élément couvre l'interface », et c'est le
   résultat accepté : on publie tout honnêtement, le client distingue.)
 - **mutations à tuer** : (i) ancrer la fusion sur le nœud le plus profond →
   N sections republiées → ROUGE ; (ii) écarter un mur couvrant comme
   inoffensif → le piège tu → ROUGE.
 Tenu par un `*.banc.test.ts` dédié, protocole complet, vrai navigateur.
 `calque-au-rejeu` reste vert ; **oracle d'équivalence** : seuls les scénarios
 à mur couvrant changent d'empreinte, tout le reste identique. `pnpm banc
 --tous --sans-ia` ×3 à empreinte identique.

**Périmètre technique, exact (ne pas sous-estimer).** Reconnaître un ancêtre
couvrant exige une mesure géométrique NOUVELLE en page (`en-page.ts` : pour
chaque recouvrement, trouver l'ancêtre couvrant et sa fraction de viewport),
portée au signal (`core/types.ts`), puis lue par `cleCause`
(`d-recouvrement.ts`). Donc la fusion n'est PAS « seule la clé bouge » : elle
touche `en-page.ts` (géométrie) + `types.ts` (le signal gagne l'ancêtre
couvrant) + `d-recouvrement.ts` (clé) + `voix.ts` (formulation) + `config`
(seuils). La capture est ADDITIVE : un scénario sans mur couvrant ne trouve
aucun ancêtre couvrant → verdict inchangé → empreinte identique (c'est ce que
l'oracle doit confirmer).

**C7 — recadrage du backlog.** P2-11 **absorbe le cas consentement de C-11**
(mur couvrant récurrent inter-pages), **étend C-16** du critère « ancêtre
couvrant commun », laisse **#2bis** (nommer sans ancre) et **(B)** (pub
transitoire) distincts. À inscrire au BACKLOG à la clôture.

## Seuils, MESURÉS sur deux populations (config, `réglages` — §13)

Mesuré le 2026-10-06, couche couvrante = couverture de viewport max parmi
l'intercepteur et ses ancêtres positionnés (hors `html`/`body`) :

| population | couche couvrante |
|---|---|
| légitime — demoqa `#root>footer` (pied fixe) | **0,075** |
| légitime — quotes `footer.footer` (mobile) | **0,045** |
| mur — automationexercise overlay de consentement | **1,0** |

- **`fractionViewportMur` : 0,5** — au milieu d'un fossé mesuré [0,075 ; 1,0],
  marge 6× de chaque côté. Sépare les deux populations, documenté (§13), pas
  posé à l'intuition.
- **`victimesMinMur` : 2** — une seule victime n'est pas un mur. Garde
  SECONDAIRE : les deux critères requis ensemble, donc un pied légitime
  (couverture 0,075) n'est jamais fondu en mur même s'il masque 2+ victimes —
  la couverture le disqualifie d'abord.

Découverte en mesurant (n°44) : le mur de consentement live est **non
déterministe** (overlay 1,0 quand il couvre, replié/absent sur d'autres
chargements). D'où un témoin de BANC déterministe (Q14), jamais le site vivant.

## Le témoin rouge, posé (METHODE §10)

`banc/gabarits/recouvrement/bugs/q14-mur-couvrant.ts` : un overlay couvrant
(`fixed;inset:0`, couverture 1,0, non écartable) à deux voiles de balises
distinctes (`div.voile-a`, `section.voile-b`), deux victimes `fixed` en vue.
`core/scanner/detection/mur-couvrant.banc.test.ts` — **ROUGE mesuré le
2026-10-06** : le mur donne **2 causes** sur desktop (intercepteurs `…> div` et
`…> section`), attendu **1** ; contrôle sain = 0. Le défaut est prouvé sur le
code actuel avant toute ligne de moteur.

## Mesure avant écriture — à faire au banc avant les cassettes (METHODE §10)

Le témoin rouge d'abord : prouver qu'un overlay couvrant à N victimes sort
aujourd'hui **N sections**, puis une (fusion). Et la mutation grave (vrai piège
écarté) rouge avant le fix. Aucune ligne de moteur avant le témoin rouge.

## État à la clôture (2026-10-06) — la moitié lourde, prouvée ; C3 reste à câbler

**Fix de fusion (C1/C2/C4/C5) : LIVRÉ et prouvé.** Le 4ᵉ niveau « ancêtre
couvrant » de `cleCause`, gaté par `fractionViewport ≥ 0,5` ET
`victimesMin ≥ 2`, fond les victimes d'un même ancêtre couvrant (cross-page par
signature de construction, absorbe le cas consentement de C-11), gravité
« important » fixe via le marqueur `murCouvrant`. Rayon : `en-page.ts` →
`types.ts` → `explorateur.ts` → `d-recouvrement.ts` → `config` + schéma +
fabrique.

Témoin `mur-couvrant.banc.test.ts`, **6 sens verts** : sain 0 ; Q14 mur→1 ;
Q15 soumission→1 « important » ; Q16 pied légitime→2 (seuil sépare) ; Q17 même
mur 2 pages→1 ; Q18 deux murs→2. **Mutations graves tuées** : seuil retiré →
Q16 fond à tort (rouge) ; court-circuit de gravité retiré → Q15 « bloquant »
(rouge). **Équivalence ×3** : ÉQUIVALENT (97 scénarios, identité ET effort).
Non-régression : banc 100 % (95/95), vitest 1776/1776, `calque-au-rejeu` vert,
tsc propre.

**C3 (la formulation honnête) : POSÉE, NON CÂBLÉE — c'est P2-11 (b).** Le
détecteur porte le marqueur `murCouvrant` ; mais la phrase « Un élément recouvre
l'interface et masque N éléments interactifs sur [pages] » n'est pas encore
rendue au client. Aujourd'hui, un mur couvrant sort en **1 section
`clic-intercepte`, gravité « important », avec la description technique par
défaut** — pas encore la voix honnête posée. Le câblage est un sous-chantier du
pipeline de rapport (la phrase à garantie sémantique contourne la rédaction IA,
modèle `statutFormule` ; la rédaction saute ces sections ; tests de voix +
exhaustivité), à mener à froid par ses propres contrats.

**Ce qui est acquis, et ce qui ne l'est pas (n°44).** Le SUR-COMPTAGE (15→1) et
la GRAVITÉ (bloquant→important) sont corrigés — le gros du bruit tombe, **prouvé
AU BANC** (le témoin). La LISIBILITÉ du constat restant attend C3-b. Les deux
ensemble ferment (A). Le « 80 % → ~25 % » n'est PAS déclaré acquis sur le réel :
il est prouvé au banc ; le prochain grand tableau le confirmera (ou le corrigera)
en conditions réelles.
