# ZURVELA — Cahier P2-9 : la découverte d'un détecteur gradué

Ouvert le 2026-10-05. Quatrième défaut révélé par le run de validation
(`docs/bilan-reel-2026-10-02.md`), MESURÉ au journal getlumavo avant d'être
traité. Il verrouillait le grand tableau avec (3) `waitUntil` : refaire le
tableau sans lui aurait republié le faux positif getlumavo.

## Le défaut, et pourquoi il était invisible jusqu'ici

Le faux positif getlumavo : `reponse-lente` sur le document, en
`verdict: decouverte`, `motif: constatee-au-rejeu`, sur une **observation
unique** (8 676 ms, obs `o85`, pendant un rejeu). Le document chargeait vite
au scan ; il n'est apparu lent qu'à UN rejeu, sur une congestion passagère.
Les candidates du SCAN, elles, étaient correctement rétrogradées
(`non-reproduite / mesure-sous-seuil`, 752 ms) — la re-mesure du protocole a
fait son travail. Mais le document, DÉCOUVERT au rejeu, a été publié **sans
re-test** : la voie découverte (P2-1 contrat 8) court-circuite la re-mesure.

**La faille de doctrine, forme neuve de n°25 (l'intersection de deux cahiers
justes)** : P2-1 contrat 8 publie une découverte sur une observation unique.
C'est JUSTE pour un détecteur BINAIRE (image cassée, site injoignable : une
observation suffit, le défaut est ou n'est pas). C'est FAUX pour un détecteur
GRADUÉ (lenteur : une valeur à peine au-dessus du seuil sur une observation
est le transitoire que la re-mesure existe pour filtrer). Le même contrat est
juste pour une classe et faux pour l'autre, et rien ne distinguait les deux —
les deux passaient par le même `anomalieDecouverte`. C'est aussi n°5 des
décisions : *une décision de conception valide pour une classe de cas survit à
son domaine quand rien ne la ré-éprouve.* « Hors périmètre » (la
re-confirmation récursive) était vrai pour les binaires ; il est faux pour les
gradués. Et c'est n°44 en embuscade : les trois `blob:` du bilan faux étaient
aussi des `decouverte / constatee-au-rejeu` — la voie découverte est le canal
par lequel les faux positifs gradués entrent sans re-mesure.

## Un branchement, pas une construction

Mesuré avant les contrats : `reexecuterGroupe` + `juger` existent et
re-mesurent n'importe quel groupe ayant un contexte de reproduction, via
`mesureDe`/`seuilMesure`. La découverte getlumavo A un contexte de
reproduction (`r2 naviguer`). Et `reexecuterGroupe` sépare déjà MESURE et
COLLECTE : les candidates qu'il rend sont poussées vers `collecterDecouvertes`
par l'APPELANT (protocole), pas par lui. Donc re-mesurer une découverte sans
collecter = ne pas pousser ses candidates. **Zéro préalable technique.**

## Les contrats

**C1 — témoin fidèle, jamais contrefait, DEUX faces.** La clé de conception :
cibler « lent UNE FOIS » et non « lent au Nᵉ ». Le fix ajoute des rejeux de
re-mesure ; un témoin « Nᵉ chargement lent » dépendrait du comportement qu'il
teste (le serpent qui se mord la queue). « Lent une fois, au premier rejeu »
est INVARIANT au nombre de rejeux ajoutés (tous postérieurs). Le gabarit (Q06
déclencheur + L04 document lent) :
 - **transitoire** (L04 `aPartirDe: 3, unique: true`) : document rapide à
   l'exploration (#1/#2 → pas candidate de scan), lent au premier rejeu (#3 →
   naît en découverte), rapide ensuite (re-mesure → sous le seuil → ÉCARTÉ).
 - **persistant** (`unique: false`) : rapide à l'exploration, lent dès #3 et
   après (re-mesure → toujours lent → RESTE publié). Le garde-fou contre le
   faux négatif. **Tenu** : `decouverte-graduee.banc.test.ts`, protocole
   complet, vrai navigateur.

**C2 — critère STRUCTUREL binaire/gradué.** Re-mesurer une découverte seulement
si son détecteur est gradué (`mesureDe !== undefined && seuilMesure !==
undefined`). Binaire → publiée sur observation unique, inchangé. Même
abstraction que P2-7 (le protocole juge sans connaître la lenteur), étendue à
la voie découverte.

**C3 — borne anti-récursion : un niveau, pas N.** La re-mesure re-exécute CE
groupe et **ne collecte aucune nouvelle découverte** de ses rejeux (ses
candidates ne sont pas poussées dans `candidatesRejeu`). Un rejeu CIBLÉ (« cette
lenteur se reproduit-elle ? »), pas EXPLORATOIRE (« que trouve-t-on ? »). La
récursion non bornée que le docstring P2-1 écartait reste écartée.

**C4 — l'asymétrie écarter / statut faible.** Re-mesure possible et verdict
`non-reproduite` (sous le seuil) → ÉCARTÉE (comme une candidate de scan).
Re-mesure impossible (plus de temps) ou inconclusive (`limite-automatisation`)
→ la découverte SURVIT en statut faible « constatée une fois ». Le doute
n'écarte pas un défaut possible ; seule une re-mesure POSITIVEMENT sous le
seuil le fait. C'est n°44 fermé : « non re-testé » reste honnête quand le
re-test est impossible, il devient un abri quand il était possible et esquivé
— getlumavo passe d'abri à re-testé-et-écarté.

**C5 — intersection budget P2-4.** La re-mesure des découvertes consomme le
temps restant APRÈS la confirmation des candidates de scan. Sur un site lent
partout, ce temps peut manquer : la découverte sort alors en statut faible
(C4, cas « impossible »), jamais écartée par défaut. Mesuré : le scénario
persistant à site lent épuisait le budget et sortait en statut faible — l'asymétrie P2-4
(doute → publier) et celle-ci cohabitent sans que l'une taise ce que l'autre
doit publier.

**C6 — oracle + mutation.** Oracle d'équivalence : le corpus n'a aucune
découverte graduée, donc le fix est INERTE — banc identique à la base.
Mutation grave : écarter une découverte graduée EN IGNORANT la re-mesure (ou
sans la re-mesurer) → la face persistante rougit (une vraie lenteur écartée =
faux négatif). Tuée.

## Ce qui a été livré

- `core/scanner/confirmation/protocole.ts` — dans la boucle des découvertes,
  avant publication : si le détecteur est gradué et qu'il reste du temps,
  `reexecuterGroupe` + `juger` ; `non-reproduite` → écartée (journalisée) ;
  sinon publiée. Les candidates de re-mesure ne sont pas collectées
  (anti-récursion). Événement `confirmation.remesure-decouverte`.
- `banc/gabarits/recouvrement/bugs/l04-document-lent-decouvert.ts` — le témoin
  (document lent « une fois » ou « dès le premier rejeu »), `config/banc.json`
  bugs.L04.
- `decouverte-graduee.banc.test.ts` — deux faces, protocole complet.

## Hors périmètre

`waitUntil: 'load'` (cahier navigation) ; la face (b) de P2-8 (nommage
sémantique). Après (4) et (3), le grand tableau redevient faisable — neuf
sites tous jugeables, faux positif gradué fermé, the-internet re-mesurable.
