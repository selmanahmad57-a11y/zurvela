# Backlog

Éléments identifiés mais hors périmètre de la brique en cours. Chaque
entrée indique la brique ou la phase où elle a vocation à être traitée.

## Banc d'essai

- **Gabarit avec bouton destructif factice** (« Supprimer mon compte ») dont
  le manifeste attend qu'il ne soit **jamais** cliqué : le filtre d'actions
  interdites mérite son test au banc. Origine : décision du 2026-09-22
  (brique 2). Cible : un prochain gabarit du banc (Phase 1, étape 3
  « enrichissement »).
- **Mode sandbox** du filtre d'actions interdites : ne lever l'interdit que
  sur certaines catégories (`exceptionsSandbox` dans
  `config/actions-interdites.json`). Cible : Phase 1 §6 sécurité du moteur,
  après la brique 3.
- **Les TROIS faces du filtre d'actions au banc** (l'entrée ci-dessous, fusionnée
  avec le besoin révélé par la brique 4b) : un futur gabarit TRANSACTIONNEL
  portera aussi la troisième face, côté navigation — page de commande
  **visitée** (attendu « bien jugé ») et bouton « Valider la commande »
  **jamais soumis** (attendu « resté inerte »). La doctrine des catégories
  `paiement` — explorer le chemin, s'arrêter à l'acte — n'est aujourd'hui
  éprouvée par RIEN : c'est elle que ce gabarit mesurera. Origine : la brique
  4b a dû déplacer son formulaire critique sur `/devis` (non transactionnel)
  parce qu'un banc qui ne peut mesurer la navigation qu'en violant le filtre
  mesurerait un produit interdit. Ratifié au chat de conception le 2026-09-23.

- **Les deux faces du filtre d'actions au banc** (complète l'entrée ci-dessus) :
  le gabarit destructif contiendra *aussi* un lien GET `/compte/supprimer`
  (manifeste : jamais visité — canal URL) **et** un article `/blog/post/42`
  avec un bouton « Postuler » (manifeste : visité et cliqué — ni le segment
  `post` ni le préfixe `post` ne doivent bloquer) — et ce lien portera
  `id="post-42"` : la troisième face du filtre (canal identifiant, tokenisé
  sur `-`/`_`/camelCase, `post` exact ne bloque pas). Origine : décision du
  2026-09-22 (brique 2).

## Moteur

- **Détecteur d'erreurs JavaScript (D-JS)** : le signal `erreur-js` est
  collecté par l'observateur mais aucun détecteur ne le consomme (hors
  périmètre de la brique 2). Les erreurs JS d'une page passent donc
  inaperçues. Cible : une brique de couverture ultérieure.
- ~~**Regroupement des anomalies par cause**~~ — PROMU dans le périmètre de la brique 3 (consolidation, décision du 2026-09-22).
- **(archivé) Regroupement des anomalies par cause** : sur le banc, V01 (un logo
  cassé présent sur 3 pages) produit 6 anomalies (2 détecteurs × 3 pages) et
  F02 en produit 2. Le banc les apparie au même attendu, mais un rapport
  business doit présenter une anomalie par cause, pas par page et par
  détecteur. Cible : brique 3 (protocole anti-faux-positifs) ou la brique du
  rapport business.
- **Contexte de reproduction des détecteurs géométriques** : une anomalie
  constatée au chargement (D-RECOUVREMENT, D-IMAGE) porte
  `reproduction.action = null`, donc `actionsPrealables = []`, alors qu'un
  `remplir` réussi peut précéder le constat sur la même page. La brique 3,
  qui re-exécutera, voudra probablement rattacher l'action du signal `clic`
  plutôt que celle du premier signal du groupe. Origine : validation de la
  bascule du 2026-09-22. Cible : cahier de la brique 3.
- **Asymétrie de lecture des `observations` de F01** : dans un scénario
  combiné (F01 + M01), l'anomalie « élément sans effet » porte
  `observations = [desktop]` seulement, parce qu'en mobile le clic est
  intercepté et l'action `bloquee` — on ne peut rien conclure d'un clic qui
  n'a pas eu lieu. Techniquement juste, mais un lecteur du rapport pourrait
  comprendre « le bouton mort n'existe qu'en desktop ». Cible : rédaction du
  rapport business.
- **Re-confirmation des anomalies découvertes au rejeu** : une anomalie
  constatée pendant une re-exécution (site devenu injoignable) est retenue
  avec la confiance de son détecteur, sans passer elle-même par le protocole
  (ce serait récursif). Origine : annexe C du cahier de la brique 3
  (2026-09-22). Cible : une brique ultérieure du protocole.
- **Représentant le plus LISIBLE, pas le plus riche** : sur un groupe
  consolidé, le représentant est la candidate la plus riche en contexte
  (`d-http` / `ressource-interne-404`), pas la plus parlante pour un humain
  (`d-image` / `image-cassee`). Rien n'est faux — catégorie, localisations et
  `GroupeCause.descriptions` conservent tout — mais le rapport devra choisir
  son porte-parole autrement. Origine : validation de la brique 3
  (2026-09-22). Cible : brique du rapport business (Phase 1).
- **Surveillance chiffrée de la durée des scénarios** : au dernier run connu,
  R01 consomme 29,3 s soit 49 % du timeout de 60 s du banc (il était à 15,6 s
  avant la brique 3 : la re-exécution re-mesure deux fois une API à 5 s).
  Règle à tenir : **tout scénario dépassant 50 % du timeout au dernier run
  connu doit être signalé avant la prochaine extension du banc** (bug plus
  lent, re-exécution supplémentaire ou viewport de plus le feraient sauter).
  Origine : validation de la brique 3 (2026-09-22).
- **Pont des vocabulaires diagnostic ↔ verdict (brique 4c)** :
  `Diagnostic.verdict` de `core/ia` (`defaut-du-site | limite-automatisation
  | indetermine`) et `VerdictConfirmation` du protocole (`confirmee |
  intermittente | non-reproduite | limite-automatisation | basse-confiance`)
  ne doivent PAS être alignés : ils parlent de choses différentes — le
  diagnostic qualifie une **cause**, le verdict qualifie une **décision du
  protocole**. Le pont sera une traduction explicite, jamais une fausse
  symétrie de types. Origine : préparation de la brique 4 (2026-09-22).
  Cible : brique 4c (auto-diagnostic).
- **Troisième dimension de clé d'appariement au banc** : la garde
  anti-manifeste-ambigu (brique 3) interdit tout scénario mêlant, sur la
  MÊME catégorie et la MÊME page, un vrai bug et un faux positif simulé —
  F01+T01, R01+L01. Or c'est le cas le plus réaliste du monde réel : un vrai
  bug ET un aléa transitoire sur le même endpoint. La garde conservatrice
  est le bon défaut aujourd'hui (un manifeste ambigu ne peut pas être noté
  honnêtement) ; la troisième dimension de clé se construira quand un
  gabarit en aura besoin, probablement à l'extension du banc qui
  accompagnera le rapport business. Un changement de contrat sans
  consommateur serait de la spéculation. Origine : clôture de la brique 3
  (2026-09-23).

## Révélé par le run de vérification du 2026-10-04 — trois cahiers, dans cet ordre

Le run qui devait confirmer le « 0 % » du bilan de la Phase 2 l'a infirmé
(5,0 % mesuré, `docs/bilan-reel-2026-10-02.md`, second amendement) et a
découvert trois défauts moteur, tous **intra-scan**. **Ils passent devant
la continuité inter-scans** : l'inter-scans dégrade la continuité d'une
semaine à l'autre, ces trois-là dégradent ce que le client lit maintenant.
L'ordre est celui que la mesure impose, pas celui de la facilité.

### 1. L'INVERSION DE CONFIANCE DU DÉTECTEUR DE LENTEUR — le plus grave

`attendreStabilisation` borne la fenêtre d'effet à
`exploration.attenteEffetMaxMs` (12 000 ms en production). Une requête
encore en vol à la fermeture est signalée en `requete-en-attente` avec
`attenteMs = maintenant − début`, donc **`attenteMs ≤ 12 000` par
construction**, et strictement moins dès que la requête démarre après
l'ouverture de la fenêtre.

Le seuil de lenteur est à 8 000 ms. Le ratio plafonne donc à **1,5 au
mieux** — mesuré **1,39** sur getlumavo (11 131 ms relevés pour 14 629 ms
réels sur `showcase-1.mp4`). Les paliers `ratioMin: 1.5` et `ratioMin: 3`
de `detecteurs.lenteur.paliers` sont **structurellement inatteignables**
pour une requête en attente.

**Conséquence** : la lenteur qui ne finit jamais — la plus grave pour un
visiteur — sort toujours à la confiance **la plus basse (0,70)**, tandis
qu'une réponse qui finit en 25 s à l'intérieur de la fenêtre atteindrait
0,95. **Le moteur est le moins sûr précisément là où il devrait l'être le
plus.** C'est une inversion au cœur d'un détecteur, pas un réglage.

Sous-constat du même examen : **le moteur sous-mesure systématiquement ce
qui ne finit pas** (11 131 publiés pour 14 629 réels). Ce que le rapport
dit au client est un plancher, et il ne le dit pas.

Deux pistes à instruire au cahier, aucune tranchée : exprimer la mesure
d'une attente tronquée comme une BORNE INFÉRIEURE plutôt que comme une
durée, ou donner aux paliers une échelle propre à la voie « en attente ».
Voir aussi la dette n°26 — cette voie n'a pas de témoin au banc.

### 2. LE SÉLECTEUR POSITIONNEL QUI NE RÉSOUT PAS CHEZ LE CLIENT — le plus répandu — **TRAITÉ : cahier P2-8 (face a)**

> **État (2026-10-04) : la face (a) est livrée (cahier P2-8).** La mesure du
> point 1 a montré que les 9 ne sont pas homogènes — la bifurcation n'est pas
> « quelle méthode d'ancrage » mais **« y a-t-il une ancre, oui ou non »** :
> (a) overlays à classe stable → une ancre existe, le sélecteur de
> présentation la nomme ; (b) cadres publicitaires → rien de stable à nommer,
> renoncement. P2-8 traite (a) : un `selecteurPublie` calculé à la publication
> (classe unique / `role` / id non-instable, jamais positionnel), `null` quand
> aucune ancre — sans toucher `selecteurDe` interne. (b) devient le cahier
> ci-dessous. **Deux dettes de bascule inscrites à `docs/DETTES.md` n°28 et
> n°29.**


Sur les **15 `clic-intercepte` jugées VRAIES** du run, **9 nomment au
client un sélecteur qui ne résout pas** : `citePresent: false` dans
**10 cas sur 10** sur automationexercise, et deux cas d'expandtesting
nomment une bannière là où c'en est une autre qui bloque.

La cause est structurelle, et elle ne plaide pas en notre faveur : le
moteur publie un chemin **positionnel**
(`div:nth-of-type(4) > div:nth-of-type(2) > … > li:nth-of-type(9)`) qui
pointe **dans le DOM d'un tiers régénéré à chaque chargement** — boîte de
consentement Funding Choices, cadres AdSense. L'anomalie est vraie, le
blocage est réel et reproductible ; **l'adresse donnée au client est
introuvable quand il regarde.**

C'est le principe n°7 — *la prose garantie nomme ce que la preuve
contient* — pris en défaut sur 9 sections publiées : le moteur nomme une
POSITION dans un DOM volatil, pas un élément.

**Et c'est le vrai visage du problème publicitaire**, enfin formulé juste.
Ce n'est pas « le protocole confirme par coïncidence » (réfuté : le churn
est inter-scans, P2-6). Ce n'est pas non plus la volatilité des
identifiants `#aswift_*` seule, déjà notée au bilan du 2026-10-02. C'est
**intra-scan, réel, mesuré sur 9 sections, et traitable** : ce qu'il faut
publier, c'est ce qui permet au client de RETROUVER l'élément, pas le
chemin qui nous y a menés.

### 2bis. NOMMAGE SÉMANTIQUE DES RECOUVREMENTS SANS ANCRE (face b) — révélé par P2-8

La face (b) de P2-8 : les recouvrements pour lesquels **il n'existe pas de
sélecteur publiable** (cadre publicitaire à id volatile, overlay sans classe).
P2-8 les RENONCE proprement (`selecteurPublie = null`) — il ne leur colle pas
de fausse adresse. Mais renoncer n'est pas nommer : le client sait qu'un
recouvrement couvre le lien, sans adresse. Ce cahier donne le registre
SÉMANTIQUE (doctrine P2-2, n°7 poussé à son bout) : quand la preuve ne contient
aucune adresse stable, **nommer la NATURE** (« un cadre publicitaire tiers
couvre ce lien ») au lieu de l'adresse. Arbitrage de fond : reconnaître
« pas d'ancre » par le renoncement de (a) ; nommer la nature **sans lire le
monde** (pas de nom de produit en dur — comme l'hôte de P2-2 vient d'une table
en config). **Condition d'ouverture** : après (a), sur le résidu réel des
`selecteurPublie = null` (les combien, de quelle nature).

### 4. UNE DÉCOUVERTE D'UN DÉTECTEUR GRADUÉ SE PUBLIE SUR UNE OBSERVATION UNIQUE — le faux positif getlumavo, mesuré (révélé le 2026-10-04)

> **État (2026-10-05) : TRAITÉ — cahier P2-9.** Un branchement (zéro préalable) : dans la voie découverte, une découverte dont le détecteur est GRADUÉ (`mesureDe`) est re-mesurée via `reexecuterGroupe` + `juger` avant publication ; `non-reproduite` (sous le seuil) → écartée, sinon publiée. Borne anti-récursion (ne pas collecter les rejeux de re-mesure — un niveau, pas N) ; asymétrie (re-mesure impossible → statut faible « constatée une fois ») ; binaire inchangé. Témoin deux faces (transitoire écarté / persistant publié), mutation grave tuée, oracle inerte sur le corpus. getlumavo passe d'abri (n°44) à re-testé-et-écarté. APPRENTISSAGES n°51.

**Mesuré au journal getlumavo du run de validation**, et NON couvert par P2-7
ni P2-8. Le faux positif publié était `reponse-lente` sur le document
(`reseau:GET:/`), en `verdict: decouverte`, `motif: constatee-au-rejeu`, sur
**une preuve unique** (dureeMs 8 676, observation `o85`, pendant un rejeu). Le
document chargeait vite au scan (0,5–2,4 s mesuré) ; il n'est apparu lent que
lors d'UN rejeu, sur une congestion passagère.

Le contraste est la preuve du trou : les candidates du SCAN (phone-3, phone-2,
showcase-2) ont été correctement rétrogradées par le protocole
(`non-reproduite / mesure-sous-seuil`, mesure agrégée 752 ms — la dégradation à
sens unique a marché). Mais le document, DÉCOUVERT au rejeu, a été publié sur
une observation unique, **sans re-test** — la voie découverte (P2-1 contrat 8)
court-circuite la re-mesure du protocole.

**La distinction binaire / gradué** : pour un détecteur BINAIRE (image cassée,
site injoignable), une observation au rejeu suffit — le défaut est ou n'est
pas. Pour un détecteur GRADUÉ (lenteur), une observation unique d'une valeur à
peine au-dessus du seuil est exactement le transitoire que la re-mesure existe
pour filtrer. **Une découverte de détecteur gradué ne devrait pas se publier
sur une observation unique.**

Enjeu : **tant que ce défaut tient, le grand tableau ne peut pas être refait**
sans risquer de republier un transitoire de lenteur découvert au rejeu. C'est
P2-7-adjacent (lenteur) mais DISTINCT (le chemin découverte, pas l'échelle de
confiance). Piste à instruire à froid : une découverte graduée exige soit une
re-mesure (coûteuse, elle est déjà au rejeu), soit un signal bien plus fort que
le seuil, soit elle n'est pas publiée. L'instrument P2-6 (marque d'observation)
et la dégradation à sens unique du protocole sont les outils.

### 3. `waitUntil: 'load'` QUI PREND LE SCAN EN OTAGE — le plus silencieux

> **État (2026-10-05) : TRAITÉ — cahier P2-10.** Les 3 `goto` de production passent en `'domcontentloaded'` ; les ressources en cours sont bornées par la fenêtre d'effet, pas par le `goto`. MESURE clé : sur le corpus, `domcontentloaded` est PLEINEMENT équivalent (0 scénario bouge) — la garde « sans perte ailleurs » est prouvée ; l'oracle non-équivalent attendu ne se manifeste pas sur le corpus (pas de ressource qui pend). Témoin neuf (Q06 + L05, `retarderRessource` ré-introduit, 2ᵉ usage §7) : otage levé (rouge→vert). Le test `reexecuteur.pannes` a bougé — jugé VRAI (le rejeu aboutit au lieu d'échouer sur un site sain, §14). Dette n°30 (rendu JS tardif). **CORRECTION 2026-10-05 : P2-10 ne débloque PAS the-internet** — ses `<script src>` du `<head>` bloquent le PARSEUR (DOMContentLoaded ne se déclenche pas quand ils pendent), classe différente de L05 (ressource bloquant le `load`, pas le parseur) ; the-internet est non déterministe (OK le 2026-10-04, expire le 2026-10-05). the-internet reste un NON-témoin ; les témoins du grand tableau sont zurvela + quotes, donc le tableau N'est PAS bloqué. APPRENTISSAGES n°53 et n°54.

`explorateur.ts` et `reexecuteur.ts` naviguent en `waitUntil: 'load'`. Le
`load` n'arrive qu'une fois **toutes** les ressources initiales terminées :
une seule ressource bloquée suffit à faire expirer le `goto` à
`chargementPageMs`, et la page entière est perdue.

Mesuré sur the-internet : **40 pages explorées le 1er octobre, 2 depuis le
2** — alors que le document sort en **HTTP 200 en 0,4 s** et que
`domcontentloaded` rend une page **complète, 46 liens, en 5 410 ms**. Cinq
ressources statiques (`jquery`, `jquery-ui`, `foundation`,
`foundation.alerts`, une image) restent bloquées 29,5 s.

Reproduit avec **Playwright nu, agent par défaut, aucun en-tête Zurvela** :
ce n'est ni une régression moteur, ni le site qui punit `ZurvelaBot` — les
deux hypothèses écartées par mesure, pas par raisonnement.

**Pourquoi c'est le plus silencieux** : il ne publie rien de faux. Il rend
des sites entiers **invisibles**, sans aucun signal au client ni au
tableau de bord — the-internet sort « structure changée, déclaré, pas
jugé » depuis deux jours et la cause était chez nous. Un échec de
couverture ne se voit dans aucune des cinq métriques de référence.

Note annexe relevée au même endroit, à trancher dans ce cahier : un site
dont le `goto` expire ressort en `cause: indetermine`, alors que le
principe de la taxonomie du rejeu réserve `reseau-site` au site
injoignable. Vérifier si le classement est juste.

**Cadrage pour la conception (2026-10-05), car (3) a un piège que les trois
autres n'avaient pas.** `waitUntil: 'load'` a été choisi pour une raison :
`load` attend que TOUTES les ressources soient là — robuste (la page est
vraiment prête), mais fragile (une ressource lente prend le scan en otage).
Passer à `domcontentloaded` débloque the-internet, mais **change ce que le
moteur VOIT au moment où il agit** — éléments pas encore rendus, recouvrements
pas encore injectés, lenteurs pas encore mesurées. Ce n'est donc pas « changer
un mot » : c'est un arbitrage entre ATTENDRE TROP (otage) et AGIR TROP TÔT
(page incomplète), et il touche TOUS les détecteurs (tous observent après le
chargement).

**Conséquence sur l'oracle** : contrairement à P2-7/8/9 (additifs, oracle
pleinement équivalent), (3) changera probablement CE QUI EST OBSERVÉ →
l'oracle sortira **NON équivalent**, et c'est ATTENDU. Ce sera le premier des
cahiers du run où « identité change » doit être JUGÉ (METHODE §14), pas
« équivalent ». La garde cardinale n'est donc pas « équivalent » mais :
**the-internet redevient mesurable SANS perte de détection sur les sites qui
marchaient déjà** — tout ce qui était détecté avant doit l'être encore, et
the-internet en plus. Le gabarit témoin : un site dont une ressource non
essentielle pend indéfiniment, dont le DOM est complet et explorable à
`domcontentloaded` — rouge aujourd'hui (0 page jugée faute de `load`), vert
après (pages explorées, détection préservée).


## Révélé par le grand tableau du 2026-10-06 — trois cahiers (nommés, pas conçus)

Le grand tableau du 2026-10-06 (`docs/bilan-reel-2026-10-06.md`, run réel
0,4542 USD, jugé par l'oracle indépendant) a infirmé le 0 % pour la seconde
fois, mesuré : **80 % de faux positifs (20/25 publiées), mais une seule cause
en porte 15/20.** Trois causes-racines, trois cahiers, dans cet ordre de
poids. À concevoir **à froid, par leurs contrats, un par un** (n°34 — la
conception d'un arbitrage de fond ne se fait pas sur la fatigue d'une session
de deux heures). Le cahier (A) seul fera tomber le bruit de ~80 % à ~25 %.

> **État (2026-10-07) : les trois faux positifs sont traités ou classés.**
> (A) mur de consentement : 15 FP → 1 constat honnête (P2-11). (B) pub
> transitoire : 4 FP → suspendu, inter-scans, hors périmètre (`4bf8d2a`).
> (C) proxy invisible : 1 FP → écarté (P2-12, `6e379ab`). **Verrous
> instrumentaux avant de refaire le tableau** (un tableau jugé par un oracle
> jetable, lu par un dépouilleur jetable, comparé par un banc qui crie faux
> n'est pas fiable) : **n°33 LEVÉE** (`site-charge` exclu de l'équivalence,
> documenté et annoncé — révélée en vérifiant P2-12) ; **n°31 LEVÉE** (oracle
> de jugement committé et testé, `banc/oracle-recouvrement.ts` + témoin 7/7) ;
> **n°32 LEVÉE** le 2026-10-08 (dépouilleur committé et testé,
> `banc/depouiller-reel.ts` + 8 contrôles : contrôle `blob:` + bonne page par
> victime ; validé sur les journaux réels du run). **Les TROIS verrous sont
> levés** — oracle, équivalence, dépouilleur, tous committés et testés : deux
> grands tableaux sont enfin comparables de bout en bout. Voir DETTES.

> **GRAND TABLEAU REFAIT le 2026-10-07** (`docs/bilan-reel-2026-10-07.md`,
> HEAD `340ae3a`, 9 sites, **0,3389 USD** sous l'annoncé, jugé par l'oracle
> committé n°31). **~80 % → 0 % de faux positif STABLE** sur les comparables.
> (A) confirmé au réel (automationexercise : `murCouvrant:true` au journal — la
> fusion a TIRÉ, 15→2 constats mineurs honnêtes) ; (C) confirmé (proxy ACE
> disparu d'expandtesting) ; (B) déclaré, pas résolu (3 transitoires :
> `#google_ads_iframe`, `#aswift_6`, mur transitoire — classe suspendue
> inter-scans). 9 vraies, 3 transitoires déclarées, 0 FP stable net.
> the-internet non-témoin (0 FP, rejouabilité mangée par la lenteur). Filet du
> run : la correction de jugement demoqa (le harnais chargeait la racine, les
> `#item-N` vivent sur `/elements` — re-jugé, 2 vrais footers sauvés d'un
> « introuvable » faussement transitoire). **Le moteur est montrable ; le
> chemin critique bascule vers la Phase 3** (page publique, premiers
> commerçants). Restes moteur : n°32 (post-run), (B) (mémoire inter-scans,
> gros cahier futur).

### A. LE MUR DE CONSENTEMENT NON LEVÉ — 15 FP, le gros — **moitié lourde TRAITÉE (P2-11), reste C3-b**

> **État (2026-10-06) : fusion TRAITÉE — cahier P2-11 « le mur couvrant ».** Le
> 4ᵉ niveau « ancêtre couvrant » de `cleCause` fond les victimes d'un même
> ancêtre couvrant (seuil `fractionViewport ≥ 0,5` + `victimesMin ≥ 2`,
> cross-page par signature — absorbe le cas consentement de C-11), gravité
> « important » fixe (marqueur `murCouvrant`, court-circuite la
> gravité-par-ce-qui-est-masqué). 15→1 et bloquant→important, prouvés au banc
> (témoin 6 sens, 2 mutations tuées, équivalence ×3, 1776 tests). L'éthique
> reste close (P2-3, C5) : le moteur ne franchit jamais le mur. **Le « 80 % →
> ~25 % » est prouvé AU BANC, pas déclaré acquis sur le réel** — le prochain
> grand tableau le confirmera. **Reste C3-b** (ci-dessous).

#### A-b (C3-b). CÂBLER LA FORMULATION DU MUR COUVRANT, HORS RÉDACTION IA — le pas délibéré suivant

La seconde moitié de P2-11, clairement séparée (natures différentes : la fusion
de causes est prouvée neutre ; la voix du rapport est un autre registre). Le
détecteur porte déjà le marqueur `murCouvrant`, mais la phrase posée — **« Un
élément recouvre l'interface et masque N éléments interactifs sur [pages] »** —
n'est pas rendue : aujourd'hui un mur sort en 1 section `clic-intercepte`
« important » avec la description technique par défaut. **Cadrage** : la phrase
est à **garantie sémantique** (elle promet « on constate une occlusion, on ne
juge pas l'intention »), donc elle doit **contourner la rédaction IA** qui
reformulerait `constat` — modèle `statutFormule` (assignée hors-IA au montage,
`structure.ts`). Chantier : `voix.ts` (la formulation, par langue, +
`voix.exhaustivite.test.ts`) + `structure.ts`/`rendu.ts` (assignation + rendu) +
la rédaction qui **saute** ces sections. À ouvrir à froid, par ses contrats. À
mener avant de déclarer (A) clos : fusion + voix honnête ensemble ferment (A).

Mesuré sur automationexercise (`docs/bilan-reel-2026-10-06.md`) : le mur Google
Funding Choices couvre tout le viewport et intercepte 15 éléments sur 7 URLs.
Le geste `controle-ferme` (P2-3) ne reconnaît un contrôle de fermeture que
**petit ET dans un coin** ; le CTA « Consent » est centré → non reconnu → le
moteur publie la page comme 15× bloquée. Occlusion réelle (oracle `recouvert`),
mais pas un défaut du site : un visiteur lève le mur en un clic.

> ⚠ **AVERTISSEMENT D'ARBITRAGE, inscrit dès le backlog.** Ce cahier devra
> reconnaître un mur de consentement couvrant (modale + contrôle de choix) **et
> renoncer à le publier comme défaut bloquant — SANS le franchir.** Ce n'est
> **PAS** « étendre le geste de fermeture aux CTA centrés », parce que cliquer
> « Consent » **POSE un consentement** : Zurvela ne consent pas pour autrui
> (arbitrage P2-3 — le moteur agit sur la page, mais jamais un acte à
> conséquence pour le propriétaire du site ou ses visiteurs). Le cahier a donc
> un **arbitrage de fond** (reconnaître sans franchir ; que dire au client d'un
> mur de consentement qu'on ne peut pas lever sans consentir ?), pas une
> extension mécanique. Reconnaissance par **forme universelle** (modale
> couvrante + contrôle de choix), jamais par classe `fc-*`. Lié à C-11 étendu
> (le même mur est aussi sur-compté inter-pages).

### B. LE RECOUVREMENT TRANSITOIRE — 4 FP — SUSPENDU : c'est la branche d'action INTER-SCANS de P2-6 (mesure préalable 2026-10-07)

> **État : SUSPENDU, preuve acquise, en attente de la mémoire inter-scans.**
> Ce n'est PAS un cahier distinct ni un trou du rejeu intra-scan : c'est la
> branche d'action que **P2-6 a suspendue**, et le grand tableau lui a donné
> son cas réel.

Mesuré sur expandtesting : 4 `clic-intercepte` dont l'intercepteur est une pub
`#aswift_N`, « confirmés » par le rejeu du moteur mais `cliquable` à l'oracle en
chargement indépendant ultérieur. **Mesure préalable (lecture seule) :**
- `contexte-neuf` EST appliqué — chaque rejeu ouvre un contexte navigateur neuf
  (cache froid, stockage vierge), par construction (`reexecuteur.ts`). La piste
  « contexte-neuf pas appliqué » est **RÉFUTÉE**.
- Le verdict `reproduite` apparie par `identiteCause` = l'intercepteur
  (emplacement), jamais la victime. MAIS P2-6 a ajouté le palier victime et
  **mesuré que le palier 3 (victime différente) = 0 intra-scan** : quand
  l'emplacement reproduit dans un scan, la victime aussi. Donc rien à corriger
  intra-scan.
- L'oracle trouve `cliquable` à un chargement **ultérieur et indépendant** —
  inter-scan par nature. Le churn n'est visible qu'entre deux chargements.

**Verdict : non traitable dans un scan.** Un scan est un instant ; le transitoire
se révèle entre deux instants. Pendant le scan, l'ad est réellement là, sur la
même victime, à chaque rejeu — le moteur ne peut pas savoir qu'il est
transitoire. Ralentir les rejeux ne le révélerait pas (même session ; délai
suffisant inconnu, dépendant du cycle de chaque régie). C'est exactement le
phénomène **INTER-SCANS** que P2-6 a situé (n°47) et dont il a suspendu la
branche d'action.

**Condition de réouverture (celle de P2-6) : une MÉMOIRE INTER-SCANS qui se
souvient d'un recouvrement d'un scan au suivant et compare les victimes.**
DEMI-CONDITION LEVÉE : le churn est désormais **mesuré** (les 4 cas réels
`#aswift_N`, confirmés intra-scan, cliquables à un chargement ultérieur). Reste
à construire la mémoire (voir l'entrée « mémoire inter-scans » ci-dessous).
Distinct de #2bis (nommer un cadre pub quand il EST un vrai recouvrement sans
ancre) : ici le recouvrement n'est pas persistant du tout.

### La MÉMOIRE INTER-SCANS — une capacité nouvelle, pas un petit cahier

Un magasin de persistance entre scans : se souvenir des recouvrements (et de
leurs victimes) d'un scan au suivant, pour distinguer un défaut **persistant**
(même victime, scan après scan) d'un **transitoire** (victime changeante au
même emplacement). Elle débloque DEUX problèmes d'un seul mécanisme : (B)
ci-dessus (les pubs transitoires, churn mesuré), ET la **continuité du
bestiaire** (« six nouveaux défauts chaque semaine », nommée de longue date).
Substantielle, à concevoir à froid. Condition de valeur : un churn de victimes
mesuré entre scans (acquis pour les pubs via le grand tableau).

### C. LE CALQUE DE COMPOSANT — 1 FP, mineur — **TRAITÉ : cahier P2-12**

Mesuré sur expandtesting : un éditeur de code (`#html-editor`) couvre son
propre `<textarea>` par conception ; oracle `recouvert` (reproductible), mais
fonctionnel. L'exclusion « même région activable » (P2-3) ne couvre que les
ancêtres `a`/`button` ; elle ne reconnaît pas les **composants** dont ni la
surface ni la cible ne sont activables. Mineur, mais nommé.

> **État (2026-10-07) : TRAITÉ — cahier P2-12.** La piste « reconnaître le
> composant par sa construction » a été ÉCARTÉE par la mesure : elle exigerait
> de lire le monde (relation surface/cible, classes). Le signal est dans la
> VICTIME, pas dans le calque : un champ **effectivement invisible** (opacité
> cumulée des ancêtres nulle, ou `visibility` non visible) ET **minuscule**
> (dimension min ≤ `recouvrement.dimensionMinVictime`, défaut 4) n'est pas une
> victime — le proxy ACE mesurait dimension min 1, opacité 0. Les deux
> conditions ENSEMBLE (chacune seule tairait un vrai défaut) ; seuil calé SOUS
> le plus petit vrai positif mesuré (11, lien de tag de quotes) avec marge.
> Témoin Q19–Q23 (5 sens) + 3 mutations + équivalence ×3. Signal physique,
> universel, zéro nom.


## Phase 2

- **Le grand tableau du 2026-10-01 est écrit** (`docs/bilan-reel-2026-10-01.md`)
  et il ne porte PAS le bilan de la Phase 2 : quatre sites sur neuf sortis
  « déclarés, pas jugés », et ce sont ceux qui portaient le bruit. Sur les
  cinq comparables : la campagne publiait 3 sections fausses sur 4, P2-3 en
  publie 0 sur 3 — juste, mais sur un dénominateur trop étroit pour être dit
  à voix haute. **Ne pas relancer à une autre heure** : seul the-internet
  tenait à l'horaire ; l'instabilité des trois autres est le budget de
  rejeu, pas l'horloge. Le déblocage est P2-4.

- **C-11 ÉTENDU — la fusion INTER-PAGES d'une même cause.** Isolé le
  2026-10-01 à la clôture de P2-3, et délibérément laissé hors du cahier.
  Le dialogue de consentement Google d'automationexercise produit deux
  sections pour la même construction, l'une sur `/`, l'autre sur
  `/products` : le contrat 4 fond par cause, et « une cause est locale à sa
  page » est un invariant posé exprès, que son propre test exige. Un bandeau
  présent sur dix pages ne devrait pourtant pas produire dix sections.
  **Condition pour ouvrir** : savoir distinguer « le MÊME défaut récurrent »
  (un bandeau unique, servi partout) de « le même TYPE de défaut à plusieurs
  endroits » (un formulaire cassé par page, qui fait bien N défauts). Ce
  départage n'est pas trivial, et le trancher à la légère réunirait des
  défauts distincts sous un seul constat — le sens qui perd des signaux.
  Cahier à part, pas un correctif.

- ~~**Bilan de rejouabilité sur les dix scans de la campagne**~~ — **FAIT le
  2026-09-30**, fondu dans la validation de P2-2 (D4) : neuf sites, trois
  moteurs dans la même session (campagne `e872872`, P2-1 `7936175`, P2-2),
  1,1576 USD. Rejouabilité par groupes, avant (campagne) → P2-1 → P2-2 :
  automationexercise 1,3 → 1,7 → 16,3 % ; books 0 → 100 → 100 % ; cutlybook
  0 → 100 → — (plus rien à rejouer) ; demoqa 0 → 41,7 → 100 % ;
  expandtesting 0 → 7,3 → 50 % ; getlumavo 100 → 100 → — ; quotes
  100 → 100 → 100 % ; the-internet 100 → 100 → 100 % ; zurvela — partout.
  Le chiffre qui compte est au cahier P2-2 §5.2 : le taux de FAUX POSITIFS
  des sections publiées, 82 % (campagne) → 81 % (P2-1) → 61 % (P2-2) →
  **0 % MESURÉ** au run de 20 h (§5.5, 0,3376 USD), 14 sections publiées,
  14 vraies, zéro bruit, 75 groupes tiers tus, zéro découverte publiée.
  Que le bruit soit retiré SANS perte de signal est établi sur les mêmes
  candidates au §5.2 (24 vraies avant comme après le correctif). Deux suites
  ouvertes : les dettes n°22 (l'effet visible est aveugle aux `xhr` et aux
  polices — à lever avant tout argument commercial) et n°23 (la rejouabilité
  n'a pas de règle pour le dénominateur vide).

  ⚠ **Ce « 0 % » n'a PAS subi la vérification que le bilan du 2026-10-02 a
  subie** (2026-10-04). Il est antérieur au correctif `blob:` (`ca04789`),
  à la correction de méthode n°44 (un statut n'est pas un jugement) et à la
  correction d'oracle n°48 (`click({trial})` fait défiler avant de tester).
  Ce qui a pu être revérifié GRATUITEMENT sur les rapports survivants du run
  (`reel-mesure/`, 2026-09-30 20 h) : les 14 sections sont **toutes** du
  contenu mixte, du clic-intercepté ou de l'image cassée — **zéro
  `reponse-lente`**, donc le faux positif `blob:` ne peut pas les toucher.
  Ce qui N'a PAS été revérifié : le jugement « 14 vraies » lui-même, rendu
  par la méthode d'alors. À re-mesurer avec l'oracle corrigé avant tout
  appui ; ne pas lui prêter l'autorité d'un chiffre éprouvé.

- **Mesurer la répétabilité inter-scans des états énumérés d'un même site
  AVANT de concevoir le cache de décisions.** Le coût IA d'un scan vit dans
  le NOMBRE d'appels, pas dans le prix du modèle : un profilage par scan
  contre une décision par point de choix — facteur 14 mesuré à la brique 4b
  (0,041 contre 0,583 USD sur 34 scans). Le cache attaquera donc le bon
  terme, mais son gain est proportionnel à une grandeur que personne n'a
  encore mesurée : la part des états énumérés identiques d'un scan à l'autre
  sur un même site. La mesurer d'abord, concevoir ensuite — c'est la règle
  des métriques jumelles appliquée par avance à une optimisation qui
  n'existe pas encore. Origine : brique 4b (2026-09-23).
