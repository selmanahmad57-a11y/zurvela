# P2-12 — le proxy invisible d'un composant n'est pas une victime

*(C) des trois cahiers révélés par le grand tableau du 2026-10-06
(`docs/bilan-reel-2026-10-06.md`). (A) = le mur couvrant (P2-11). (B) = le
recouvrement transitoire (SUSPENDU, branche inter-scans de P2-6). (C), ici :
1 FP, mineur, mais nommé.*

## Le fait mesuré

Sur `practice.expandtesting.com/xpath-css-tester`, un éditeur de code (ACE)
pilote sa frappe par un `<textarea>` PROXY qu'il recouvre de sa propre couche
d'affichage. Mesuré (scratchpad/mesure-populations, lecture seule) :

- le proxy : `opacity:0`, `2×1` px — **dimension min 1**, opacité effective 0 ;
- les plus petits VRAIS positifs du grand tableau, à comparer : lien de tag de
  quotes **dimension min 11**, pied fixe de demoqa **dimension min 51** —
  visibles (opacité effective 1).

L'oracle `recouvert` était **reproductible** (le proxy est bel et bien
recouvert, à chaque passage) — donc le protocole anti-faux-positifs ne le
rattrape pas : c'est un vrai recouvrement géométrique, mais pas un blocage. Le
visiteur ne voit NI ne vise ce champ ; son recouvrement est le fonctionnement
NORMAL du composant.

## Pourquoi PAS la relation DOM (la piste du backlog)

Le backlog nommait (C) « le calque de composant » et pointait l'exclusion
« même région activable » (P2-3), qui ne couvre que les ancêtres `a`/`button`.
La piste évidente — reconnaître un « composant » dont ni la surface ni la cible
ne sont activables — exige de LIRE une forme de construction (relation
surface/cible, classes, noms). C'est le monde, pas le web (constitution §2).

La mesure a tranché autrement : le signal n'est pas dans la relation entre le
calque et sa victime, il est dans la VICTIME elle-même. Un champ que le visiteur
ne peut ni voir ni viser — **effectivement invisible ET minuscule** — n'est pas
une victime, quel que soit ce qui le recouvre. Signal physique, universel,
jamais un nom.

## Les contrats

1. **Invisible ET minuscule, les deux ENSEMBLE.** On écarte une cible comme
   proxy de composant si et seulement si elle est effectivement invisible ET
   que sa dimension minimale (la plus petite de largeur/hauteur) est sous le
   seuil. Chacun SEUL tairait un vrai défaut :
   - invisible seul → un champ invisible de TAILLE RÉELLE (rendu invisible par
     erreur) est un vrai défaut d'invisibilité, qu'on ne doit pas excuser ;
   - minuscule seul → un petit bouton VISIBLE recouvert est un vrai blocage
     (asymétrie : on ne tait pas un vrai, même petit).

2. **Invisibilité EFFECTIVE, pas déclarée.** `visibility` est déjà effective
   sous `getComputedStyle` (elle hérite, un descendant peut la rétablir).
   `opacity` NE se cumule PAS : un ancêtre à opacité nulle rend l'élément
   invisible sans que sa propre opacité le dise. On remonte la lignée ; un seul
   ancêtre à opacité nulle suffit. `display:none` donne un rect 0×0, déjà écarté
   plus haut dans la boucle de géométrie.

3. **Le seuil est calé SOUS le plus petit vrai positif mesuré, avec marge.**
   `dimensionMinVictime = 4` (config, réglage §13), sous la dimension min 11 du
   plus petit vrai positif du grand tableau (lien de tag de quotes). Un seuil
   ≥ 12 écarterait ce vrai positif → faux négatif. C'est un RÉGLAGE (une valeur
   qui changera si la mesure change) ; l'asymétrie qu'il sert — ne jamais taire
   un vrai défaut — est l'invariant.

4. **Les DEUX voies d'émission sont tenues.** Un `clic-intercepte` naît de deux
   sources : la géométrie (`elementFromPoint`) et le clic refusé par le
   navigateur (`intercepts pointer events`). La seconde faisait reparaître le
   proxy que la géométrie venait d'écarter. La géométrie expose donc
   `ciblesProxy` (nombre de cibles écartées comme proxy) : un clic refusé sur
   une cible DÉLIBÉRÉMENT écartée ne la relève pas. On distingue « la géométrie
   n'a rien trouvé » (le clic peut trancher) de « la géométrie a exclu un
   proxy » (le clic ne republie pas). Vaut à l'exploration ET au rejeu.

## Le rayon

`core/scanner/exploration/en-page.ts` : `aide.invisibleEffectif` (cumul
d'opacité + visibility), le saut dans la boucle de géométrie (après le saut
`width/height === 0`), `ResultatGeometrie.ciblesProxy`, le fil
`dimensionMinVictime` dans la commande `geometrie` et `OptionsGeometrie`.
`explorateur.ts` + `reexecuteur.ts` : `proxyExclu` gate la branche
« le navigateur a refusé ». `config.ts` + `config/scanner.json` +
`config/production.json` + `scanner.schema.json` + `fabriques-test.ts` :
le réglage `recouvrement.dimensionMinVictime`.

## Le témoin (déterministe, vrai navigateur)

`core/scanner/detection/victime-invisible.banc.test.ts`, cinq sens sur le
gabarit recouvrement (Q19–Q23) :

- **Q19** proxy invisible+minuscule (2×2) → ÉCARTÉ (rouge avant : publié) ;
- **Q20** champ visible de taille réelle (120×30) → PUBLIÉ (garde) ;
- **Q21** champ invisible mais de taille réelle (dimension min 11, comme
  quotes) → PUBLIÉ (le fix exige invisible ET minuscule) ;
- **Q22** sliver invisible fin et long (300×1) → ÉCARTÉ par la dimension MIN —
  c'est le cas où l'AIRE tromperait (300) mais la dimension min (1) tranche
  (justifie « dimension min » et non « aire ») ;
- **Q23** petit bouton visible (3×3) → PUBLIÉ (le fix exige invisible ET
  minuscule).

Note de gabarit : les `<input>` portent `box-sizing:border-box;border:0;
padding:0` — sans quoi le chrome par défaut de l'UA gonfle un champ déclaré
2×2 jusqu'à 8×6 (dimension min 6 > seuil). Un vrai proxy de composant est
effectivement collapsé à ~1px ; le gabarit le reproduit fidèlement.

Trois mutations tuées (chaque clause est porteuse) :

- invisible SEUL (on retire la porte minuscule) → Q21 écarté à tort → rouge ;
- minuscule SEUL (on retire la porte invisible) → Q23 écarté à tort → rouge ;
- seuil élargi à 12 (au-dessus du plus petit vrai positif, 11) → Q21 écarté à
  tort → rouge (prouve que 4 est calé SOUS 11, pas arbitraire).

Équivalence (oracle P2-4) : **93/93 scénarios ÉQUIVALENT** (identité ET effort
identiques), sur les trois runs `opt` comparés au `ref` pristine — aucun
scénario existant n'a de victime invisible+minuscule, donc le fix ne touche que
ce qu'il vise, et aucune identité `recouvrement`/`clic-intercepte` ne bouge
nulle part. Les 4 scénarios `site-charge` sont EXCLUS de ce décompte : ils
divergent, mais pour une raison ÉTRANGÈRE au fix — le gabarit lourd course sa
propre échéance, et l'axe `ressource-interne-404` ↔ `echeance-atteinte` bascule
selon le timing. Prouvé INHÉRENT (pas causé par le fix) en comparant deux runs
à CODE IDENTIQUE (`opt1` vs `opt2`), qui divergent de la même façon : deux
exécutions du même binaire ne devraient jamais diverger. C'est une flakiness du
banc, inscrite en **dette n°33** (verrou du prochain grand tableau).

## Clôture

Les trois cahiers du grand tableau sont désormais tranchés : (A) traité
(P2-11 + voix C3-b), (B) suspendu au bon niveau (mémoire inter-scans, chiffré,
APPRENTISSAGES n°55), (C) traité (ici). Prochain jalon : refaire le grand
tableau (run réel payant) — le vrai taux de faux positifs de la Phase 2, avec
les instruments committés (dettes n°31 oracle + n°32 dépouilleur) en VERROU.
