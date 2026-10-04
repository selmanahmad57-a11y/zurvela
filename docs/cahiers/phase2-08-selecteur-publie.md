# ZURVELA — Cahier P2-8 : le sélecteur publié d'une cause

Ouvert le 2026-10-04. Deuxième des trois cahiers révélés par le run de
validation (`docs/bilan-reel-2026-10-02.md`, second amendement). Le plus
répandu : 9 sections `clic-intercepte` VRAIES publiaient au client une
adresse introuvable.

## Le constat, et ce que la mesure a tranché

Le moteur publie, comme adresse de la cause d'un recouvrement, le sélecteur
INTERNE (`selecteurDe` : positionnel, ou ancré sur le premier `id`). Il est
juste pour le DOM AU MOMENT DU SCAN, faux quand le client regarde : le DOM
d'un tiers est partiellement régénéré, la position bouge, l'`id` est recréé.
n°7 (nommer ce que la preuve contient) pris en défaut : on publie une adresse
qui ne survit pas à un rechargement.

**La mesure (point 1) a trouvé que les 9 sections ne sont pas homogènes — et
que la bonne bifurcation n'est pas « quelle méthode d'ancrage » mais « y a-t-il
une ancre, oui ou non » :**

| face | cas réels | ancre distinctive |
|---|---|---|
| **(a)** overlays à classe | les 9 d'automationexercise (boîtes de consentement) | une classe UNIQUE existe et PERSISTE (`.fc-dialog-overlay`, `.fc-cta-consent`) — mesuré : résout aux chargements 2 et 3 |
| **(b)** cadres publicitaires | expandtesting (`#aswift_N`, `html > ins`) | RIEN de stable à nommer : id volatile de bout en bout, aucune classe distinctive, même un ancêtre stable ne laisse qu'une queue positionnelle volatile |

**(a) et (b) sont deux problèmes, pas deux difficultés d'un problème.** (a) :
« le sélecteur publié n'est pas le bon » → le réparer. (b) : « il n'existe pas
de sélecteur publiable » → changer de registre, nommer la nature. **Ce cahier
traite (a) SEUL** ; (b) est un cahier distinct (nommage sémantique), parce
qu'il relève d'une doctrine opposée (quand RENONCER à une adresse), pas de la
doctrine d'ancrage.

## L'instrument était P2-6, et il a servi autrement que prévu

La volatilité ne se connaît pas d'un instantané (`#aswift_8` ressemble à un id
normal). On aurait pu la mesurer par cross-observation (P2-6). La mesure
montre que ce n'est PAS nécessaire pour (a) : la distinctivité (classe unique)
COÏNCIDE avec la persistance sur les cas réels. Cross-observation → DETTE.

## Les contrats

**C1 — garde cardinale, et le témoin jamais contrefait.** Le gabarit reproduit
l'ASYMÉTRIE réelle : un recouvrement dont l'ancre distinctive PERSISTE mais
dont la POSITION change entre chargements (Q11, face a), ET un recouvrement
SANS ancre (Q12, id volatile, aucune classe, face b). Un gabarit qui
régénérerait tout ne testerait rien ; un qui ne régénérerait rien non plus.
**Tenu** : `selecteur-publie.banc.test.ts`, témoin rouge sur les deux faces,
fidélité verte (leçon de P2-7 appliquée d'avance).

**C2 — sélecteur de présentation, séparé du sélecteur interne.** `selecteurDe`
NE CHANGE PAS : il sert la mécanique interne (clés de cause, consolidation),
où le positionnel précis est juste, dans l'instant figé du scan. On AJOUTE un
sélecteur de PRÉSENTATION, calculé à la publication à partir de la preuve,
pour nommer ce qui PERSISTE. C'est la doctrine P2-2 contrat 3 et n°7 : le
sélecteur publié est un fait de présentation, pas l'identité interne. Un
sélecteur interne (précis, instantané) et un sélecteur publié (lisible,
persistant) sont deux choses aux exigences opposées ; les confondre est le
défaut.

**C3 — l'asymétrie « ancre ou renoncement », le cœur du cahier.** L'heuristique
de distinctivité (classe unique > `role`/landmark > id non-généré
structurellement) produit une ancre SEULEMENT si elle est distinctive et
stable ; sinon elle RENONCE — `selecteurPublie = null` — et le cas sort vers
(b), jamais une fausse ancre de repli. Sans ce contrat, le cahier (a)
appliquerait son heuristique à un cadre pub (b), trouverait l'id volatile ou
une position, et republierait une adresse non résolvante — le défaut corrigé,
recréé par l'autre bout. **Mieux vaut « pas d'adresse stable » qu'une fausse
adresse.** La borne de « id généré » (structurelle : suffixe numérique, pas un
nom de produit — le code connaît LE WEB, pas LE MONDE) vit en config.

**C4 — garde cardinale DOUBLE, mutation-tuée dans les deux sens.** Toute
adresse publiée RÉSOUT sur un chargement régénéré (a), OU est explicitement
absente — `null` (b). Jamais une adresse qui ne résout pas. Deux mutations
graves : un sélecteur positionnel republié comme adresse → rouge (a non
corrigé) ; un cas (b) recevant une ancre de repli au lieu d'un `null` → rouge
(b faussement ancré).

**C5 — oracle d'équivalence + `calque-au-rejeu` vert.** `selecteurDe` interne
ne bougeant pas, l'empreinte des autres détecteurs est INTACTE : l'oracle doit
sortir équivalent partout, sauf le champ « sélecteur publié » des sections
`clic-intercepte` concernées. C'est le bénéfice mesurable de ne pas toucher le
constructeur. Le gabarit porte les deux faces (a résolvant, b renoncé) pour
prouver l'asymétrie de C3.

**C6 — (b) inscrit en cahier distinct** : « nommage sémantique des
recouvrements sans ancre stable », P2-2-adjacent, avec son arbitrage de fond
(reconnaître « pas d'ancre » par mesure, nommer la nature sans lire le monde).
Condition d'ouverture : après (a), sur le résidu réel des cas (b).

## Ce qui a été livré

- **Un `selecteurDePresentation(intercepteur)`** (en page, à côté de
  `selecteurDe`) : rend l'ancre distinctive-ET-stable de l'intercepteur si
  elle existe et résout de façon unique (classe unique sur l'élément, sinon
  `role`/landmark unique, sinon id non-généré structurellement), **sinon
  `null`**. Jamais de segment positionnel : un segment positionnel est
  volatile, donc on renonce plutôt que de le publier.
- **`LocalisationElement.selecteurPublie?: string | null`** : l'adresse de
  présentation (résolvante) ou `null` (renoncée). Portée à la détection,
  transportée jusqu'au rapport. Le rapport l'utilise ; `null` → le rapport ne
  donne pas d'adresse (et pointera, au cahier (b), vers un nommage de nature).
- **La garantie « résout sur un chargement frais » est MESURÉE par le témoin**
  (C1/C4), pas par un contrôle réseau à l'exécution : le moteur applique
  l'heuristique syntaxique (distinctive-only), le banc prouve qu'elle produit
  des adresses qui résolvent pour (a) et renonce pour (b). Si le résidu réel
  de (a) l'exigeait, une validation au rejeu (chargement déjà fait) serait la
  version plus forte — à décider sur mesure, pas d'avance.

## État — livré, trois faces au témoin, deux mutations tuées (2026-10-04)

Le gabarit recouvrement porte les TROIS faces, reproduites sans contrefaçon
(garde C1), et le témoin `selecteur-publie.banc.test.ts` les juge :

- **Q11 (a)** — classe stable `bandeau-temoin` + position volatile → `selecteurPublie`
  = `.bandeau-temoin`, **résout** sur chargement régénéré. ✓
- **Q12 (b)** — id volatile `#cadre-<visite>`, aucune classe → `selecteurPublie`
  = `null`, **renoncé**, jamais de fausse adresse. ✓
- **Q13 (c)** — id STABLE à suffixe numérique `#promo-7` (qui RÉSOUT pourtant)
  → `selecteurPublie` = `null`, **renoncé PAR COHÉRENCE** : on ne distingue pas
  un suffixe numérique stable d'un volatil sur un instantané (le choix gravé).

**Deux mutations graves tuées** : (A) renoncer remplacé par un repli sur le
sélecteur positionnel → rouge (b/c reçoivent une fausse adresse) ; (B) filtre
d'instabilité retiré → rouge (b faussement ancré sur `#cadre`, c sur `#promo-7`
contre l'asymétrie). **Oracle d'équivalence** : le banc complet sort IDENTIQUE
à la base (l'empreinte lit le sélecteur INTERNE, inchangé ; `selecteurPublie`
est additif) — mieux que « équivalent sauf un champ », c'est pleinement
équivalent. `calque-au-rejeu` vert.

**Deux dettes de bascule** (`docs/DETTES.md`) : n°28 (le renoncement strict
peut sur-renoncer ; la tolérance ne s'ouvre que sur une mesure, via
cross-observation) ; n°29 (la garantie « résout » est syntaxique, pas mesurée à
l'exécution ; bascule vers validation au rejeu si le résidu réel le montre).

## Hors périmètre

(b) le nommage sémantique des cadres sans ancre (cahier distinct) ;
`waitUntil: 'load'` (cahier navigation). Ce cahier n'ajoute qu'un sélecteur de
présentation à la publication, sans toucher `selecteurDe`.
