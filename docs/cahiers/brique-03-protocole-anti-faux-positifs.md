# ZURVELA — Cahier des charges : Protocole anti-faux-positifs (Brique 3, Phase 1)

Tu remplaces protocolePassePlat par le vrai protocole de confirmation —
le cœur défendable du produit (différenciateur n°1 du plan : le secteur
est à 85 % de bruit, Zurvela vise quasi zéro). Toujours SANS IA : le
protocole est mécanique dans cette brique ; l'auto-diagnostic IA aura
son logement, comme la confirmation avait le sien en brique 2.

## 1. Le protocole en 4 étapes (dans l'étape CONFIRMATION du pipeline)

CANDIDATES → CONSOLIDATION → RE-EXÉCUTION → VERDICT → CALIBRATION
              groupes par      reproduction    statut     confiance
              cause racine     isolée          motivé     finale

### 1a. CONSOLIDATION (promue du backlog)
Regroupe les candidates partageant une cause racine AVANT de confirmer,
pour ne payer qu'une confirmation par cause :
- même ressource en échec sur plusieurs pages/viewports (V01 : 6
  candidates → 1 groupe « logo 404 », pages listées) ;
- même requête/endpoint en cause sur plusieurs candidates ;
- clé de groupe STRUCTURELLE (type de signal + identité de la ressource
  ou de l'action), jamais textuelle.
Le groupe conserve : toutes les localisations, tous les viewports
(l'asymétrie « mobile uniquement » reste intacte), la confiance la plus
haute des membres (leçon de la bascule), et un membre REPRÉSENTANT
choisi pour la re-exécution (le plus riche en contexte).
Résolution attendue au banc : ~14 groupes pour les 26 signalements
actuels — la scorecard comptera désormais en groupes.

### 1b. RE-EXÉCUTION
Pour chaque groupe, dans un contexte navigateur NEUF (cache froid,
storage vierge — c'est déjà une variation de contexte) :
1. naviguer vers l'URL du représentant ;
2. rejouer actionsPrealables (c'est ici que la brique 2 prouve son
   contexte de reproduction : F01 doit rejouer son remplir) ;
3. exécuter l'action déclenchante ;
4. observer avec les MÊMES détecteurs (réutilise observation+détection
   sur la page unique — pas de code de détection dupliqué).
Répétitions : reExecutions en config (défaut 2). Politique en config :
  "complet" (défaut) = tout groupe est re-exécuté ;
  "econome" = seuls les groupes sous seuilConfirmationDirecte (défaut
  0,90) le sont — prépare l'échelle, le banc tourne en "complet".
Cas particulier D-LENTEUR : la re-exécution mesure à nouveau la durée ;
le verdict compare les N mesures au seuil (médiane en config).
Cas particulier anomalies de viewport (D-RECOUVREMENT) : re-exécution
dans LE viewport incriminé + contre-épreuve dans l'autre — l'asymétrie
attendue (mobile KO, desktop OK) renforce la confiance ; une symétrie
inattendue la dégrade et se journalise.

### 1c. VERDICT (énuméré, journalisé, motivé)
- confirmee            reproduite ≥ tauxReproduction (config, défaut :
                       toutes les re-exécutions)
- intermittente        reproduite partiellement (1/2) — c'est une
                       ANOMALIE RÉELLE (un bug sur deux requêtes est
                       un bug), retenue, marquée intermittente
- non-reproduite       jamais reproduite — écartée du rapport final,
                       conservée au journal avec ses preuves d'origine
- limite-automatisation la re-exécution elle-même a échoué pour une
                       cause imputable à l'outillage (timeout du
                       navigateur, page inchargeable par le robot,
                       crash Playwright) — écartée ET distinguée de
                       non-reproduite : c'est la catégorie qui, dans
                       l'étude des 85 %, était confondue avec les
                       défauts du site. Heuristiques mécaniques dans
                       cette brique ; interface prévue pour que l'IA
                       affine plus tard (le logement suivant).
Le Rapport final sépare : anomalies retenues (confirmées +
intermittentes) / écartées (les deux autres verdicts, journal complet).

### 1d. CALIBRATION
confianceFinale = f(confianceDetecteur, verdict, tauxReproduction,
contreEpreuve) — la formule vit en config (facteurs), pas en code.
Une anomalie retenue sous seuilRetenue (config, défaut 0,60) est
rétrogradée en écartée-basse-confiance (5e verdict), journalisée.

## 2. Extension du banc (le protocole doit être MESURÉ, pas cru)

Trois bugs nouveaux au gabarit formulaire-contact — DÉTERMINISTES
(contrainte des 3 runs identiques : pas d'aléa, des compteurs) :
- I01 api-intermittente : la soumission échoue en 500 une requête sur
  deux (compteur serveur, pair/impair). Attendu : verdict intermittente,
  RETENUE. Catégorie fonctionnel, gravité important.
- T01 echec-transitoire : la PREMIÈRE requête de soumission de la vie
  du scénario échoue (500), toutes les suivantes réussissent (compteur
  serveur remis à zéro au démarrage du scénario). Attendu : détectée en
  scan, verdict non-reproduite, ÉCARTÉE. C'est le faux positif
  simulé — le test central de la brique.
- L01 lenteur-transitoire : première requête lente (config), suivantes
  rapides. Attendu : écartée (médiane des re-exécutions sous le seuil).
Le manifeste s'étend : chaque bug déclare son VERDICT ATTENDU en plus
de sa détection attendue. La scorecard gagne une colonne « verdicts
corrects » et le correcteur note : détecté+bien-jugé / détecté+mal-jugé
/ raté. T01 et L01 comptent comme réussite quand ils sont ÉCARTÉS.
Scénarios régénérés (les nouveaux bugs isolés × 2 langues + 1 combiné
I01+V01 × 2 langues pour tester consolidation ET confirmation ensemble).

## 3. Ce que cette brique NE fait PAS
- Aucun appel IA (coût banc toujours 0,00 €) — l'interface
  d'auto-diagnostic est posée, son implémentation IA viendra.
- Pas de variation d'IP ni de second navigateur (un seul Chromium
  installé) : le point d'extension existe en config
  (variations: ["contexte-neuf"]), les autres valeurs sont réservées.
- Pas de rapport business, pas de vidéo.

## 4. Critères d'acceptation
1. Les 14 scénarios existants : toujours 100 % détection, 0 faux
   positif, écart inter-langues 0, 3 runs identiques — le protocole
   ne casse rien (T01/L01 absents = rien à écarter).
2. Nouveaux scénarios : I01 retenue-intermittente, T01 et L01 écartées
   avec le bon verdict, dans les DEUX langues — verdicts corrects
   à 100 % sur le banc.
3. La re-exécution de F01 rejoue prouvablement actionsPrealables
   (assertion sur le journal de re-exécution).
4. Consolidation : V01 produit 1 groupe (pages et viewports listés),
   et le scénario I01+V01 montre les deux mécanismes coexistant.
5. Durée : chaque scénario reste sous le timeout du banc — publie le
   surcoût de confirmation (avant/après) dans ta livraison.
6. Chaque candidate porte un verdict journalisé et motivé ; le Rapport
   sépare retenues/écartées ; tests Vitest sur consolidation (clés de
   groupe), verdicts (matrices de reproduction), calibration (formule).
7. Lint Mur 1, les trois questions de la constitution sur chaque
   nouveau module, revue adversariale comme aux briques 1-2.

## 5. Livraison
Scorecard étendue (détection + verdicts + surcoût), écarts justifiés,
valeurs de config choisies, constats de revue, questions. Commit après
validation ici : « Brique 3 — protocole anti-faux-positifs ».

---

## Notes de conception (chat de conception, 2026-09-22)

- La colonne « verdicts corrects » devient la **quatrième métrique nord
  opérationnelle** : c'est elle qui chiffrera l'argument commercial central
  (« notre taux de fausses alertes, mesuré »).
- **T01 est le scénario le plus important du banc** : le premier cas où
  Zurvela a *raison de se taire* — la moitié du métier d'un bon surveillant.
- Fragment d'URL dans le canal du filtre : **confirmé**, une SPA hash-routée
  utilise le fragment comme vrai chemin. Même règle que le chemin :
  tokenisation par segment, jamais de sous-chaîne sur le fragment entier.
- La consolidation précède la confirmation **par économie** : re-exécuter 26
  candidates dont 12 partagent 3 causes, c'est payer deux fois.

---

## Annexe A — Identité de cause : la formulation retenue

Adoptée le 2026-09-22 (formalisation validée en conception) :

> **La cause réseau transcende le détecteur** — une ressource morte est une
> seule panne, quel que soit l'œil qui la voit. Toutes les candidates dont
> les preuves portent le même couple (méthode, chemin de ressource) forment
> un seul groupe, quels que soient les détecteurs qui les ont émises.
>
> **La cause locale reste liée au couple détecteur + élément** — deux
> mécanismes de défaillance distincts sur le même bouton sont deux bugs.
> Un bouton mort (D-INERTE) et un bouton recouvert (D-RECOUVREMENT) ne
> fusionnent jamais.

Conséquence mesurée sur le banc d'avant-brique : 26 signalements → 14 groupes
(V01 : 6 candidates, 2 détecteurs, 3 pages → 1 groupe ; F02 : 2 détecteurs sur
le même endpoint → 1 groupe ; F01+M01 : même élément, 2 détecteurs → 2 groupes).

## Annexe B — Trois précisions de conception (2026-09-22)

1. **La confiance finale est bornée à 1,0 en code**, indépendamment de la
   configuration : `borner(x, confianceMin, min(confianceMax, 1))`. Un
   facteur de verdict supérieur à 1 cumulé au bonus de contre-épreuve
   dépasserait sinon 1 silencieusement — une confiance supérieure à 1 dans
   un rapport serait un symptôme de non-rigueur pour un produit qui vend la
   mesure.
2. **La frontière `non-reproduite` / `limite-automatisation` se teste
   activement** : un échec d'outillage doit être provoqué pendant une
   re-exécution (page rendue inchargeable, délai dépassé) et le verdict
   vérifié. C'est la frontière exacte des 85 % de bruit du secteur ; si les
   heuristiques mécaniques la tracent mal, c'est une information à
   documenter — le logement IA de l'auto-diagnostic existe pour cela.
3. **Série de mesures d'un détecteur gradué** : elle ne couvre QUE les
   re-exécutions, jamais la mesure du scan initial (l'inclure biaiserait
   chaque verdict vers la confirmation). La médiane d'un nombre pair de
   valeurs est la moyenne des deux valeurs centrales. La règle de la mesure
   agrégée est **à sens unique** : elle peut ramener un verdict à
   `non-reproduite`, jamais l'inverse — un groupe qui n'a rien reproduit
   reste `non-reproduite` quelle que soit la mesure.

## Annexe C — Causes d'échec de rejeu et principe du sens unique (2026-09-22)

**Un rejeu qui échoue ne dit pas à qui la faute.** La taxonomie est
`outil | reseau-site | indetermine` :

- `outil` (navigateur perdu, contexte qui ne s'ouvre pas, délai de l'outil)
  → tentative non exploitable → `limite-automatisation` ;
- `reseau-site` (connexion refusée, DNS en échec, 5xx sur la navigation)
  → **ce n'est pas un verdict sur la candidate d'origine** : le site vient
  peut-être de tomber, ce qui est l'incident le plus grave qui existe. La
  tentative est exploitable, ses signaux passent aux détecteurs, et
  l'anomalie qui en sort est **retenue** comme découverte
  (`ResultatConfirmation.decouvertes`, motif `constatee-au-rejeu`). Se taire
  parce que la panne est survenue trop tard serait le pire des faux négatifs ;
- `indetermine` → tentative non exploitable, et client légitime du logement
  `AutoDiagnostic` de la brique 4.

**Principe permanent du protocole** : *le doute ne monte jamais la
confiance*. Un signal d'incertitude peut dégrader un verdict ou une
confiance, jamais les remonter. Toute règle future — y compris la
calibration IA de la brique 4 — lui obéit. Une règle qui remonte une
confiance apporte une PREUVE, pas un doute, et doit être nommée comme telle.

## Annexe D — Placement des tests d'échec de rejeu, et le troisième état (2026-09-22)

**Les deux tests actifs de l'annexe C vivent en tests Vitest**, où le test
pilote le serveur du banc et le coupe à l'instant choisi — jamais en
scénarios du banc. Un scénario « site injoignable » polluerait la
scorecard : l'anomalie découverte au rejeu n'appartient à aucun manifeste
dérivé et compterait mécaniquement en faux positif, faisant mentir
l'instrument sur la métrique qu'il doit précisément protéger.

**`decouvertes` est un troisième état épistémique** : ni confirmée, ni
écartée — *constatée une fois*. Confiance du détecteur, sans calibration.
Le rapport business (brique 5+) devra le formuler au client dans ces
termes : « détecté pendant la vérification, non re-testé ». L'honnêteté sur
le statut de chaque affirmation est la voix de la marque ; elle commence
dans les types.
