# ZURVELA — Cahier P2-7 : la confiance de la lenteur en attente

Ouvert le 2026-10-04. Premier des trois cahiers révélés par le run de
validation du bilan de Phase 2 (`docs/bilan-reel-2026-10-02.md`, second
amendement). **Correctif défensif d'une inversion latente** : le défaut est
réel dans le code, mais sans victime enregistrée — zéro `reponse-lente` de
la voie « en attente » sur réseau réel dans tous les journaux (les 28 cas
historiques étaient des `blob:`, déjà filtrés par `ca04789`). Mené sans une
ligne de code payante : budget 0 $, tout au banc.

## Le constat, reformulé — un ARTEFACT d'observation décide de la confiance

`attendreStabilisation` borne la fenêtre d'effet à
`exploration.attenteEffetMaxMs`. Une requête encore en vol à la fermeture
est signalée `requete-en-attente` avec `attenteMs = maintenant − début`,
donc **`attenteMs ≤ attenteEffetMaxMs` par construction** : elle n'a jamais
fini, sa vraie durée est inconnaissable. Le détecteur gradait cette attente
par les mêmes paliers que les réponses reçues (`ratio = attente / seuil`).

Conséquence, et ce n'est **pas** « plancher 0,70 systématique » comme on l'a
d'abord dit : la confiance était **graduée par l'instant où la requête a
démarré dans la fenêtre** — un artefact d'observation — et **plafonnée sous
le palier haut**. En production (fenêtre 12 000, seuil 8 000), ratio ≤ 1,5 :
une requête en vol depuis l'ouverture → 0,85 ; une partie plus tard → 0,70 ;
jamais 0,95. La lenteur la plus grave — celle qui **ne finit jamais** —
recevait une confiance décidée par le timing, inaccessible au palier haut.
Le moteur était le moins sûr précisément là où il devrait l'être le plus.

## Les contrats

**C1 — garde cardinale : le témoin est une VRAIE attente tronquée, jamais
simulée.** n°48 (nommer ce que le gabarit fait au monde) et dette n°26 (ne
pas contrefaire un gabarit jusqu'au rouge) appliqués à nous-mêmes. Un test
vérifie qu'une vraie requête est encore en vol à la fermeture de la fenêtre,
son `attenteMs` borné par la fenêtre et strictement sous le vrai délai du
serveur — mesuré, pas injecté. **Tenu** : `lenteur-attente.banc.test.ts`
(`requete-en-attente` sur `/api/contact`, `attenteMs ≈ 4012`, aucune réponse
reçue dans l'observation).

**C2 — voie A : la confiance d'une attente ne dépend pas de la durée que la
fenêtre plafonne.** Une requête en attente au-delà du seuil porte une
confiance DÉDIÉE (`detecteurs.lenteur.confianceEnAttente`), découplée du
ratio. L'invariant : *la confiance reflète la gravité du ralentissement, pas
la durée d'observation que l'outil s'autorise* (n°45 au cœur du détecteur).
Voie **A** et non B (un ratio sur une borne non plafonnée) parce que la vraie
durée au-delà de la fenêtre est **inconnaissable** : la voie B devrait
fabriquer la grandeur manquante, « n°45 au carré ». « Ne finit pas » est une
NATURE, pas une quantité. Valeur : **0,95** (le palier haut — une requête
qui ne finit jamais est au moins aussi grave qu'une réponse revenue après
3× le seuil). Correction localisée au détecteur ; `mesureDe`/`seuilMesure`
et le protocole intacts.

**C3 — les deux faces, et §15.** Attente qui se reproduit → confiance haute
préservée. Congestion transitoire → non montée, écartée par le protocole
(`non-reproduite`, mesure du rejeu sous le seuil). La correction ne
réintroduit pas le faux positif getlumavo (8 676 ms d'une observation
unique). La mesure du rejeu est à sens unique (principe permanent n°2).

**C3bis — invariant permanent : une `requete-en-attente` n'est JAMAIS
confirmée sans rejeu, quelle que soit la politique.** Le court-circuit
`confiance-suffisante` (confirmer sans rejeu si confiance ≥
`seuilConfirmationDirecte`, sous `econome`) confond confiance et preuve. Pour
une attente, c'est faux par nature : « ne finit pas » est un signal de
GRAVITÉ, pas une preuve de REPRODUCTION — on ignore si elle pend à chaque
fois ou une fois par congestion. Seul le rejeu le dit. `confianceEnAttente`
peut donc être haute sans danger (`lenteurSansPreuveDeReproduction` l'exclut
du court-circuit aux deux endroits : le filtre `groupesRestants` et la
branche). C'est la séparation confiance/preuve défendue depuis la brique 3,
appliquée dans l'autre sens : la confiance haute ne dispense pas de la
preuve.

**C4 — l'oracle d'équivalence + deux mutations graves.** Le correctif est
INVISIBLE à l'empreinte (la confiance est de l'effort, pas de l'identité —
principe n°8) et INERTE sur le corpus existant (0 cas d'attente réseau). Le
banc complet (97 scénarios) sort identique, 0 faux positif. Les deux
mutations graves sont tuées : (A) regrader l'attente par le palier →
`lenteur-attente.banc.test.ts` et `d-lenteur.test.ts` rougissent ; (B)
retirer l'exclusion C3bis → `protocole.test.ts` rougit.

**C5bis — le cycle de rejeu complet, mesuré.** Détection (0,95) → pas de
court-circuit (C3bis) → rejeu → verdict. Testé de bout en bout avec un VRAI
réexécuteur (`lenteur-attente-rejeu.banc.test.ts`) : une attente qui se
reproduit au rejeu sort `confirmee` — `mesurerRessourceVisee` lit
l'`attenteMs` du rejeu (qui reste > seuil), elle n'est donc ni court-circuitée
ni « non mesurée ». La face transitoire (attente qui ne revient pas) retombe
en `non-reproduite` par le même mécanisme de mesure, partagé avec L01/L02.

## Le témoin — pourquoi R01, et pourquoi `retarderRessource` a été construit puis RETIRÉ

Le préalable technique validé en conception était un crochet
`retarderRessource` au pipeline statique du banc, pour retenir une
SOUS-RESSOURCE en vol (le cas `showcase-1.mp4` de getlumavo). Il a été
construit, puis le témoin l'a RÉFUTÉ : la sous-ressource sortait **reçue**
(6003 ms), jamais en attente. La mesure du code (instrumentation de
`emettreAttentes`, trace de l'ordre) a montré pourquoi : **un sous-fetch de
page est AVORTÉ à la re-navigation de l'explorateur** (`abandonnerNavigation`
re-goto), donc jamais en vol au plafond de la fenêtre.

Et cela **confirme la mesure « zéro victime »** par une seconde voie : un
vrai sous-fetch finit reçu ou avorté — jamais en attente ; seuls les `blob:`
(jamais finis, non avortables) produisaient l'attente, et ils sont filtrés.
Le seul chemin qui produit une vraie `requete-en-attente` est une **action
qui ne navigue pas** — une soumission dont l'API pend au-delà de la fenêtre.
C'était la seconde option de C1 (« répond au-delà de la fenêtre »), la seule
juste. Le témoin est donc **R01 (api-lente), délai 6000 ms > fenêtre
4000 ms**, sans crochet neuf. `retarderRessource` a été reverté (§7 : pas
d'abstraction avant le deuxième usage réel).

**La leçon (APPRENTISSAGES n°49)** : un préalable technique validé en
conception peut se révéler inutile à l'implémentation, parce que la
conception suppose un chemin que le code n'emprunte pas. Le construire puis
le retirer n'est pas du gaspillage — c'est la mesure qui corrige la
conception, et le revert est la bonne fin. Et le témoin VRAI (C1, jamais
simulé) a protégé contre l'erreur de validation : un témoin contrefait aurait
rougi puis verdi sur un fantôme, et le crochet mort serait resté.

## Ce qui a été livré

- `d-lenteur.ts` — voie A (confiance dédiée pour la voie « en attente »,
  découplée du ratio) ; doc du détecteur reformulée.
- `protocole.ts` — C3bis (`lenteurSansPreuveDeReproduction`, exclusion du
  court-circuit).
- `confianceEnAttente` en config (`scanner.json`, `production.json` : 0,95),
  schéma (requis, décrit), type.
- Témoins : `lenteur-attente.banc.test.ts` (C1 + confiance, rouge-puis-vert),
  `lenteur-attente-rejeu.banc.test.ts` (C5bis, cycle complet),
  `d-lenteur.test.ts` (voie A), `protocole.test.ts` (C3bis).

## Hors périmètre

`waitUntil: 'load'` qui prend le scan en otage (cahier navigation) ; le
sélecteur positionnel non résolvable (cahier suivant, le plus répandu). Ce
cahier ne touche que l'échelle de confiance de `d-lenteur` et l'exclusion du
court-circuit pour l'attente.
