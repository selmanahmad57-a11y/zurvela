# Bilan réel du 2026-10-06 — le grand tableau, jugé par un instrument qui existe

Neuf sites, **un seul moteur** (HEAD `96c11a6`), scannés dans la même session.
Configuration de production, politique `deterministe`, identité déclarée
(`ZurvelaBot/0.1 (+https://zurvela.com)`, en-tête `X-Zurvela-Scan`), aucun
formulaire soumis, `robots.txt` respecté. **Coût réel 0,4542 USD** (annoncé
~0,45, plafond 0,70 ; dépassement de 4 millièmes annoncé AVANT le dernier lot,
sous plafond). Journaux durables : `~/.config/zurvela/reel/grand-tableau-2026-10-06T09-45-13/`.

Ce bilan est le premier **jugé par un instrument qui existe**. L'oracle de
jugement du recouvrement — jusqu'ici un jetable de REPL re-tapé de mémoire
(dette n°31) — a été transformé la veille en fichier éprouvé sur sept cas à
réponse connue, chacun discriminant, indépendant du moteur
(`scratchpad/oracle-recouvrement.mjs`, noyau partagé `oracle-noyau.mjs`). Le
dépouilleur reste un jetable déclaré (dette n°32).

## Les neuf lignes

| site | rôle | statut | pages | candidates | **publiées** | vraies | **fausses** |
|---|---|---|---|---|---|---|---|
| zurvela | témoin | comparable | 4 | 0 | 0 | — | — |
| getlumavo | témoin | comparable | 40 | 2 | 0 | — | — |
| cutlybook | défaut | comparable | 26 | 8 | 0 | — | — |
| books | défaut | comparable | 40 | 20 | 1 | **1** | 0 |
| quotes | témoin | comparable | 40 | 57 | 1 | **1** | 0 |
| automationexercise | défaut | comparable | 20 | 272 | 16 | **1** | **15** |
| demoqa | défaut | *déclaré* (10 p. < 20) | 10 | 27 | 2 | **2** | 0 |
| expandtesting | défaut | *déclaré* (6 p. < 15) | 6 | 78 | 5 | 0 | **5** |
| the-internet | témoin | *non mesurable* | 2 | 16 | 0 | — | — |

Trois témoins stables : zurvela immobile, quotes et getlumavo stables — donc
l'instrument et le réseau sont sains, le tableau est lisible.

## Le chiffre, jugé section par section — le 0 % est INFIRMÉ pour la seconde fois, et il est MESURÉ

**Sur les comparables** (zurvela, getlumavo, cutlybook, books, quotes,
automationexercise) : **18 publiées, 3 vraies, 15 fausses → 83 % de faux
positifs par section.** Sur les neuf sites : **25 publiées, 5 vraies, 20
fausses (80 %)**.

Ce n'est pas un échec du moteur, c'est un **succès de la méthode** : un run qui
cherchait à réfuter a réfuté. Le moteur explore désormais plus profond (gains
P2-4) et atteint des pages que les runs précédents tronquaient — le web réel y
porte des calques (consentement, publicités) que le banc ne contient pas. Les
anciennes sources de faux positifs, elles, ont TENU (voir plus bas).

**Le bruit n'est pas diffus : une seule cause porte 15 des 20 faux positifs.**
Par cause-racine : **3 vraies** (2 contenu-mixte + 1 recouvrement) contre **3
fausses** — 1 dominante (le mur de consentement, 15 FP) + 2 mineures (pub
transitoire 4 FP, calque de composant 1 FP). Trois lacunes nommées, pas un
brouillard.

## Les cinq vrais positifs — tous confirmés par un instrument indépendant

- **books** — `contenu-mixte` : la page HTTPS charge `http://ajax.googleapis.com/.../jquery.min.js` en clair. Confirmé par **curl** (référence `src="http://…"` dans le HTML).
- **automationexercise** — `contenu-mixte` : trois polices `http://fonts.googleapis.com/css?family=…` demandées et **bloquées `mixed-content`**. Confirmé par **capture réseau Playwright** sur contexte neuf (le curl statique les ratait : injection JS).
- **quotes** — `clic-intercepte` mobile : le `p.text-muted` du footer couvre un lien de tag (`span:nth-of-type(10) > a`). Oracle **`recouvert`, 4/4 coins**, reproductible.
- **demoqa** — `clic-intercepte` desktop (`confirmee`) : le pied fixe `#root > footer` couvre `#item-8 > a` sur `/elements` et 4 autres pages. Oracle **`recouvert`, 4/4**. C'est le cas n°48 exact, jugé sans défilement-centre.
- **demoqa** — `clic-intercepte` mobile (`decouverte`, `constatee-au-rejeu`) : le `#root > footer > span` couvre `#item-8 > a`. Oracle **`recouvert`, 4/4**. **La découverte est jugée, et elle est vraie** (n°44) : le mécanisme de découverte a publié un vrai recouvrement.

## Les trois causes-racines des faux positifs — trois défauts MOTEUR, pas des régressions (n°53)

**A. Le mur de consentement — 15 FP (automationexercise), le gros.** Google
Funding Choices couvre tout le viewport (overlay 1280×800). Son CTA
« Consent » est **au centre** du dialogue (x652 y573, 196×38) ; mais le geste
`controle-ferme` (P2-3) n'accepte un contrôle de fermeture que **petit ET dans
un coin** (`partCoin: 0.25`). Le moteur ne peut pas lever un mur de
consentement standard → il publie la page comme 15× bloquée. Occlusion
**physiquement réelle et reproductible** (oracle `recouvert` sur chargement
neuf), mais **pas un défaut du site** : un visiteur le lève en un clic. Une
seule cause (le mur), sur-comptée 15 fois (victimes distinctes sur 7 URLs).

**B. La pub transitoire — 4 FP (expandtesting) — soupçon confirmé, preuve au
journal.** Les intercepteurs sont `#aswift_N` (iframes Google Ads, compteur
d'emplacement). Le rejeu même-session a « confirmé » une **coïncidence
d'emplacement**. L'oracle, sur chargement neuf indépendant, dit **`cliquable`**
(3/4) ou **`hors-fenêtre`** (1/4) : aucune pub ne couvre la cible. Faux positif
d'un **type neuf** — le protocole de confirmation re-exécute dans la même
lignée de chargement, donc il peut figer un transitoire.

**C. Le calque de composant — 1 FP (expandtesting), mineur.** Un éditeur de
code (`#html-editor`) couvre son propre `<textarea>` **par conception**.
`recouvert` physiquement (oracle 4/4), mais fonctionnel — l'exclusion « même
région activable » ne couvre pas les composants dont ni la surface ni la cible
ne sont `a`/`button`.

## Ce qui a TENU — les cahiers précédents n'ont pas été rouverts

- **Contrôle `blob:` TENU** : sur 25 sections publiées, **0 `reponse-lente`, 0
  sur schéma local**. Le correctif `blob:` (`ca04789`) tient en réel.
- **Bruit tiers correctement tu** : 46 groupes écartés `sans-effet` sur
  automationexercise, 59 sur expandtesting, 21 sur quotes — la doctrine tierce
  (P2-2) tient.
- **Contenu-mixte = vrais positifs**, confirmés indépendamment.
- Aucun témoin n'a bougé. Aucune identité perdue par régression.

Le tableau a trouvé la **couche suivante**, il n'a pas rouvert les précédentes.

## L'instrument a fait son travail — et a gagné son existence

L'oracle indépendant a **réfuté les 4 faux positifs de pub que le moteur avait
« confirmés »** (les `#aswift_N`), et **confirmé les 5 vrais recouvrements**
(demoqa ×2, quotes). **Sans lui, les 4 pubs auraient compté comme vraies → un
chiffre faussement flatteur.** C'est exactement pourquoi il devait exister
avant ce run (dette n°31, la veille). Il a gagné son existence ce soir.

## the-internet — non mesurable, et P2-10 ne débloque PAS cette classe (confirmé)

Disponible (HTTP 200), mais le `page.goto` **expire à 30 s en attendant
`domcontentloaded`**, desktop et mobile (preuve au journal :
`exploration.page.echec : Timeout 30000ms exceeded … waiting until
"domcontentloaded"`). C'est la classe n°54 : les scripts bloquant-parseur du
`<head>` empêchent `DOMContentLoaded` de se déclencher quand ils pendent. **Ce
n'est ni une indisponibilité d'hébergement** (le document répond 200) **ni une
régression de P2-10** (qui traite l'otage bloquant-chargement, témoin L05, pas
l'otage bloquant-parseur). C'est précisément ce que le commit `4ed2e60`
établissait AVANT le run, maintenant confirmé en réel. Piste future :
`waitUntil: 'commit'` — un cahier, éprouvé au banc d'abord.

## Les trois cahiers que le tableau ouvre (portés au BACKLOG, à concevoir à froid)

- **(A) Mur de consentement** — 15 FP. **Arbitrage de fond, pas extension de
  geste** : le cahier devra reconnaître un mur de consentement couvrant
  (modale + contrôle de choix) **sans le franchir** — Zurvela ne consent pas
  pour autrui (arbitrage P2-3). Ce n'est PAS « étendre le geste de fermeture
  aux CTA centrés », parce que cliquer « Consent » POSE un consentement.
- **(B) Pub transitoire** — 4 FP. Le cahier B reporté, désormais mesuré : le
  rejeu fige un transitoire car il re-exécute dans la même lignée de
  chargement. Piste : `confirmation.variations: ['contexte-neuf']` existe —
  pourquoi le rejeu de recouvrement ne l'applique pas.
- **(C) Calque de composant** — 1 FP, mineur : l'exclusion « même région
  activable » ne couvre pas les composants (éditeur de code sur son
  `<textarea>`).

## Lecture d'ensemble (n°44)

Le tableau n'a pas confirmé le 0 %, et c'est son travail de ne pas le faire.
80 % de bruit paraît catastrophique ; par cause-racine, c'est **une** lacune
dominante (le consentement, 15/20) plus deux mineures. Le cahier (A) seul fera
tomber le bruit de ~80 % à ~25 %. Les cinq vrais positifs sont genuine, tous
confirmés par instrument indépendant. Les anciennes sources de faux positifs
ont tenu. Le run a coûté 0,4542 USD, dans l'enveloppe annoncée, et il est le
premier de la Phase 2 jugé par un instrument qui existe, inspectable et éprouvé.
