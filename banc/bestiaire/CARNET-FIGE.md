# Carnet figé — ce que le web réel a cassé, dans l'ordre où il faut le réparer

**Campagne 6b close au scan n°10 (2026-09-29).** *Figé le 2026-09-29 après la fiche 10 ; relu et validé par le propriétaire le
même jour : « l'ordre est le bon ».* Dix sites, du plus propre au
plus lourd ; conditions du protocole remplies : aucun crash, aucun blocage
anti-robot sur les rangs 1 à 3 ; le spectre couvert va du site statique à la
boutique transactionnelle. On s'arrête d'observer parce que les mêmes
défauts reviennent — le carnet est saturé, pas la campagne. Le carnet vivant
reste `CARNET-CORRECTIFS.md` (une entrée par défaut, ses fiches) ; ce
document le FIGE et le TRIE en cahiers correctifs de la Phase 2, priorisés
par récurrence puis par gravité pour le produit.

Moteur mesuré : `7f6aa1c` (correctif n°1, client IA de production câblé),
politique `deterministe`, `soumission: aucune`, client IA actif, budget
0,5 USD, échéance 300 s. Rien n'a été corrigé pendant les dix scans.

## 1. Les dix scans en une vue

| n° | site | type | durée · échéance | coût USD | candidates | retenues | **rejouables** | retenues jugées par un humain |
|---|---|---|---|---|---|---|---|---|
| 01 | zurvela.com | vitrine du projet, 4 pages | 14 s · 5 % | 0 | 0 | 0 | 0/0 | — (sans client IA) |
| 02 | getlumavo.com | SaaS possédé, 125 URL | 276 s · 92 % | 0 | 3 | 2–3 | 3/3 | 1 faux (Google Sign-In, ORB), 1 vrai (accueil 11 s) ; sans client IA |
| 03 | getlumavo.com | idem, client IA actif | 272 s · 91 % | 0,047 | 3 | 2 | 3/3 | 1 faux (Sign-In), **1 faux publié en titre lisible (vidéo 206 = « page lente »)**, le vrai lent écarté |
| 04 | cutlybook.com | SaaS possédé, 13 URL | 170 s · 57 % | 0,002 | 8 | 0 | **0/8** | 8 candidates tierces irréjouables (polices, Stripe) : propre par accident |
| 05 | books.toscrape.com | catalogue statique | 295 s · 98 % | 0,002 | 13 | 0 | **0/13** | échéance mangée par 237 remplissages vides ; le vrai défaut (jQuery http) enterré |
| 06 | the-internet.herokuapp.com | pièges UI | 217 s · 72 % | 0,062 | 24 | 5 | **24/24** | 2 vrais (images), 1 vrai mineur (Optimizely mort), **2 faux « bloquant »** (modal fermable) |
| 07 | practice.expandtesting.com | entraînement, lourd pub | 296 s · 99 % | 0,002 | 187 | 0 | **0/187** | 173 tierces, 9 recouvrements pub, 5 « lenteurs » en attente ; rapport « 93 non re-vérifiés » |
| 08 | demoqa.com | SPA React, pub | 289 s · 96 % | 0,036 | 62 | 1 | 20/62 (**1/22 groupes**) | 1 faux (balise Analytics) ; 2 vraies images cassées perdues ; 27 recouvrements (pied fixe, pub) |
| 09 | quotes.toscrape.com | **contrôle** : statique, sans tiers | 161 s · 54 % | 0,051 | 38 | 3 | **38/38** | **3 faux** (2 × Google Fonts, 1 lien recouvert → « bloquant mobile ») ; vrai défaut https→http non détecté |
| 10 | automationexercise.com | boutique, panier, comptes | **338 s · 113 %** | **0,155** | **1 649** | 19 | 61/1 665 (**4/410 groupes**) | **19 sections tierces** : 1 vraie mal expliquée (feuille de style en http sur https), 16 « découvertes » d'une seule balise, 2 polices ; 1 428 recouvrements de calques de survol ; le parcours d'achat jamais exercé |

**Lecture** : 33 anomalies publiées sur dix sites ; **3 vraies et justes**
(images cassées ×2, Optimizely mort), 2 vraies mais mal expliquées ou
surdimensionnées (Analytics ; la feuille de style en http présentée comme une
panne du tiers), **28 fausses** (Sign-In ×2, vidéo 206, modal ×2, polices ×4,
lien recouvert, seize « découvertes » d'une balise signée, deux autres tierces)
— et au moins **4 vrais défauts enterrés** (accueil lent, jQuery http, images
cassées demoqa ×2, https→http). **Le rapport le plus cher (0,155 USD) est le
moins utile (dix-neuf sections pour rien).** Le différenciateur n°1 est à l'envers sur le
web réel. La rejouabilité est **bimodale** — 3/3, 3/3, 0/8, 0/13, 24/24,
0/187, 1/22, 38/38 — jamais entre les deux : le protocole marche ou il est
empêché, par deux causes nommées.

## 2. Récurrence par entrée (fiches où l'entrée est née ou revue)

| entrée | fiches | sites | gravité pour le produit |
|---|---|---|---|
| C-05 doctrine tierce | 02 03 04 05 06 07 08 09 10 | **9/10** | publie du faux sur chaque site à tiers, enterre du vrai ; cause racine : l'identité déclarée |
| C-06 échéance : atteinte, non répartie, non appliquée | 02 03 05 07 08 10 | **6/10** | le protocole et la rédaction ramassent ce que l'exploration laisse : parfois rien |
| C-08 couverture, ordre de page | 02 03 06 07 08 10 | 6/10 | 16 %, 20/45, 20/101 : les pages intéressantes jamais vues |
| C-03 la prose ne nomme pas le tiers | 03 06 08 09 10 | 5/10 | le propriétaire cherche au mauvais endroit |
| C-12 recouvrement sans fermeture ni gravité | 06 07 08 09 10 | **5/10** (modal, annonces, pied fixe, lien, calque de survol) | « bloquant » pour un modal, une annonce, un pied fixe, un lien |
| C-02 lenteur : média, requêtes en attente | 03 07 08 | 3/10 | le faux lent publié, le vrai lent écarté |
| C-04 rejeux de lenteur sans mesure | 02 03 | 2/10 | écarte par absence, pas par re-mesure |
| C-09 rejeu sur la page d'arrivée | 04 06 | 2/10 (+ latent sur tout site à formulaire) | le pilier n°1 aveugle après tout remplissage |
| C-11 un défaut, plusieurs sections | 06 09 10 | 3/10 | le lecteur cherche deux défauts là où il y en a un |
| C-13 rapport technique en O(n²) | 05 07 10 | 3/10 | 6,9 Mo à 187 candidates, 42 Mo à 1 649 |
| C-10 `remplir` sur un bouton seul | 05 | 1/10 | échéance explosée sur le site le plus simple |
| C-14 robots.txt servi en HTML | 08 10 | 2/10 | « lu » alors qu'absent |
| C-15 périmètre : schéma, rétrogradation https→http | 09 | 1/10 | exploration à profondeur 1, défaut de sécurité muet |
| C-07 langue du rapport non paramétrable | 03 | 1/10 | la langue du client n'est pas celle de la commande |
| C-16 découvertes au rejeu non dédoublonnées | 10 | 1/10 | seize sections pour une balise signée ; sections bornées par les rejeux, plus par le site |
| C-01 historique aveugle de l'IA | banc (correctif n°1) | 0/10 | la politique IA n'a pas tourné en campagne ; 91,4 % au banc réel |

## 3. Les cahiers correctifs de la Phase 2, dans l'ordre

### Cahier P2-1 — La rejouabilité *(ouvre la Phase 2)*

**Pourquoi en premier** : c'est le défaut qui tient le produit entier. Tant
que le protocole n'atteint pas ses candidates, rien de ce qu'il y a en aval
— doctrine tierce, lenteur, rédaction — ne peut être jugé fiable. Bimodal,
à deux causes nommées : corrigible.

**Périmètre** : **C-09** (la recette d'une navigation ouvre la page
d'arrivée et y rejoue les préalables de la page d'origine) · **C-06**
(l'échéance est répartie entre les phases, réservée à la confirmation, et
APPLIQUÉE à la rédaction — la boutique a fini à 113 %) · **C-10** (le menu offre
`remplir` sur des formulaires sans champ, et vingt fois le même) · **C-04**
(les rejeux de lenteur ne mesurent rien) · la **métrique** : le taux de
candidates rejouables entre dans la scorecard, par candidates ET par groupes.

**Ce qui le clôt** : sur le banc, un gabarit « formulaire puis navigation »
et un gabarit « catalogue à boutons » rejoués à 100 % ; en campagne, les
quatre sites à rejouabilité nulle ou quasi nulle (cutlybook, books,
expandtesting, demoqa) re-scannés au-dessus d'un seuil de config ; et un
rapport qui dit « rien n'a pu être vérifié » quand c'est le cas.

### Cahier P2-2 — La doctrine tierce

**Pourquoi en second** : 8 sites sur 9, cause racine trouvée (fiche 09,
APPRENTISSAGES n°19), et le motif le plus grave — elle **enterre de vrais
défauts** (jQuery http, cdnjs) sous « tiers-mineur » et publie du faux
partout ailleurs. Elle coûte aussi de l'argent : 93 sections projetées à
expandtesting, au-delà du plafond.

**Périmètre** : **C-05** (une ressource tierce qui échoue pour le robot
n'est pas jugée ; seul un échec à effet visible compte, imputé au site — et
sa réciproque : une ressource tierce que le site charge en clair, ou un
script attendu absent, EST un défaut du site, dit comme tel) · **C-03**
(quand l'origine est identifiable, la prose la nomme) · **C-16** (les
découvertes au rejeu se dédoublonnent par cause, jamais par URL signée) ·
la part tierce de **C-02** (`d-lenteur` ne fabrique plus de candidates
tierces) · `ERR_BLOCKED_*` côté navigateur. L'identité déclarée reste : c'est le
jugement qui change de place. Le banc gagne des tiers qui répondent
AUTREMENT au robot (n°17 : des anomalies fausses par construction).

**Ce qui le clôt** : 0 section tierce sans effet visible sur les dix sites
re-scannés ; les vrais défauts (contenu mixte à books et automationexercise,
script attendu absent) publiés, nommés et imputés au site ; automationexercise
re-scanné sous cinq sections.

### Cahier P2-3 — Le recouvrement

**Pourquoi** : 5 sites, cinq formes (modal fermable, annonces, pied de
page fixe, chevauchement d'un lien, calque de survol d'une grille
marchande — 1 428 candidates sur la boutique), toujours « bloquant » ; l'hypothèse
« bandeau de consentement » de l'inventaire vérifiée dans le mauvais sens.
Sur les vrais sites de commerçants — bandeaux cookies, pop-ups d'inscription
— c'est une usine à faux positifs de gravité maximale.

**Périmètre** : **C-12** (tenter de fermer ; réessayer après recentrage pour
un élément fixe ; reconnaître le calque de survol ; une gravité qui dépend de
ce qui est recouvert ; la localisation descend à l'élément ; les 500 examens de
`elementsInteractifsMax` ne se dépensent plus en calques de survol) · **C-11** (fusionner les groupes qu'une
contre-épreuve réunit, et les ressources d'une même cause sur une page).

**Ce qui le clôt** : the-internet, demoqa, quotes re-scannés sans
« bloquant » injustifié ; une section par cause.

### Cahier P2-4 — La PERFORMANCE : pouvoir juger du tout

**PROMU EN TÊTE le 2026-10-01**, devant la lenteur et le périmètre, par le
grand tableau campagne contre P2-3 (`docs/bilan-reel-2026-10-01.md`,
APPRENTISSAGES n°32). Quatre sites sur neuf sont sortis « déclarés, pas
jugés » — et ce sont exactement ceux qui portaient la masse du bruit :
automationexercise publiait à lui seul 22 sections dont 21 fausses, quand
les cinq sites comparables réunis n'en publiaient que 4. La corrélation est
CAUSALE : la lourdeur publicitaire produit le bruit tiers ET sature le
budget de rejeu. Tant que le second défaut tient, le premier ne se mesure
pas là où il est le plus fort.

**Objectif, et il est nouveau** : non pas « juger juste », mais **pouvoir
juger du tout** là où le bruit se cache. Ce n'est pas un cahier de confort.

**Périmètre pressenti** : le coût d'un rejeu par groupe (29 s la tentative,
déclaré hors périmètre de P2-1 et repoussé deux fois) · le rejeu
SÉLECTIONNÉ · le cache de décisions, dont le facteur 14 entre profilage et
décisions de navigation donne depuis longtemps le chiffre justificatif
(0,041 contre 0,583 USD sur 34 scans, brique 4b) · la répétabilité
inter-scans des états énumérés, à mesurer AVANT de concevoir le cache
(backlog).

**Ce qui le clôt** : le grand tableau refait sur les neuf sites, avec
automationexercise, demoqa et expandtesting enfin COMPARABLES — le bilan de
Phase 2 que le run du 2026-10-01 n'a pas pu porter, et dont il devient la
ligne « avant ».

### Cahier P2-5 — La lenteur

**Périmètre** : **C-02** (un flux média 206 et une requête en attente ne sont
pas des lenteurs ; mesurer le document et les ressources bloquantes) ·
**C-04** (partagé avec P2-1 : la mesure au rejeu). 3 sites. Clôture :
getlumavo re-scanné publie l'accueil lent et pas la vidéo.

### Cahier P2-6 — Périmètre, politesse, sécurité de base

**Périmètre** : **C-15** (une page du même hôte servie en http depuis https
est interne ET rétrogradée : à extraire, à compter, à signaler) · **C-14**
(un robots.txt hors `text/plain` vaut absent) · détecteur « rétrogradation
https → http » (backlog, catégorie sécurité de base de la constitution).
2 sites. Clôture : quotes re-scanné publie la rétrogradation et explore en
profondeur.

### Cahier n°2 (déjà promu) — L'historique aveugle de l'IA

**Périmètre** : **C-01** (l'historique montré à l'IA porte l'issue des
actions ; prompt de navigation v3 ; variance mesurée avant la première
cassette ; l'outil de variance gagne un point de mesure) · **C-08** (la
couverture par ordre de page : la politique IA est ce qui devait choisir).
0 site en campagne (la production tourne en déterministe) ; 91,4 % au banc
réel. Se place après P2-1 à P2-3 parce qu'il ne touche pas ce que les
clients voient aujourd'hui.

### Hors cahier — outillage et réglages

**C-07** (option de langue sur la commande de scan, portée jusqu'au
rapport) · **C-13** (le rapport technique référence ses candidates au lieu
de les recopier). Petits, autonomes, à prendre au fil de l'eau.

## 4. Ce que la campagne a prouvé — les invariants qui ont tenu

- **La politesse** : robots.txt lu, absent ou refusé proprement sur dix
  sites (deux fois du HTML pris pour des règles, sans conséquence) ; 88 refus,
  tous conformes ; 1 000 ms respectés ; aucun blocage anti-robot.
- **Aucune soumission** : 0 formulaire envoyé sur dix sites, 323 remplissages
  aux valeurs marquées `test@zurvela-scan.invalid` (dont 46 sur la boutique :
  recherche, connexion, inscription, contact) ; les pages de connexion
  visitées 14 fois, jamais franchies ; 310 pages, 1 987 candidates.
- **Le budget** : jamais dépassé (31 % au plus, sur la boutique, pour des
  sections qui ne devraient pas exister) ; le refus de budget n'a jamais eu
  à jouer.
- **La voix** : les statuts garantis tiennent, y compris au singulier pour
  une vérification unique ; aucun chiffre dans la prose.
- **Le profil** : juste sur 9 sites sur 9 mesurés, confiance honnête
  (0,75 sur 151 caractères).
- **La déterministe est reproductible** : mêmes 20 URL dans le même ordre à
  deux heures d'intervalle.
- **Quand le rejeu marche, le protocole tient** : 24/24 et 38/38, 0 écartée
  à tort, contre-épreuves menées et concluantes.

## 5. Les apprentissages nés de la campagne

n°15 (ce qui fournit la pièce ne peut pas révéler son absence), n°16 (une
cassette réutilisée n'est pas N échantillons), n°17 (la rédaction est un
multiplicateur), n°18 (un protocole qui ne rejoue pas est un tri par
hasard), n°19 (le robot déclaré ne voit pas le même web que le visiteur).

## 6. Un arbitrage de fond, à trancher plus tard

Notre honnêteté — déclarer le robot — crée une partie de nos faux positifs :
Google sert autre chose à `ZurvelaBot`. La constitution (§3) ne se négocie
pas ; P2-2 déplace le jugement (ne pas juger ce que le tiers sert au robot).
Reste la question de ce qu'on ne VERRA pas en conséquence : un tiers
réellement cassé pour le visiteur mais qui répond au robot. À poser
explicitement quand P2-2 sera clos, pas avant.

**Cadre posé le 2026-09-29 (propriétaire), pour le jour où l'arbitrage
viendra** : la tentation sera de masquer le robot pour « voir ce qu'un vrai
visiteur voit ». Y résister. Se déclarer est un engagement de la page
`/robot`, un choix éthique et juridique avant d'être technique ; un scanner
qui se déguise pour contourner ce qu'on lui sert délibérément est le
comportement refusé dès le mode universel. La bonne réponse n'est pas de
mentir sur l'identité, c'est de corriger le jugement (APPRENTISSAGES n°19),
ce que P2-2 prévoit. L'arbitrage se réduira probablement à « on garde
l'identité, on répare la doctrine » — et il se posera formellement à
l'ouverture de P2-2, pas avant.
