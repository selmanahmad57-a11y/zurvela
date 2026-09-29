# Fiche 10 — automationexercise.com

| | |
|---|---|
| **date** | 2026-09-29, 07:50 → 07:56 |
| **rang de cible** | 3 — boutique de démonstration complète (panier, comptes, paiement simulé) : le seul type transactionnel de la campagne (nommé, pas anonymisé) |
| **url** | `https://automationexercise.com` (34 produits, 7 catégories, 8 marques, panier, connexion, contact ; Google Ads, Funding Choices, Google Fonts chargé en `http` sur une page `https`) |
| **version du moteur** | `11be1a2` — code moteur inchangé depuis `7f6aa1c` |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté, 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, client IA actif |
| **commande** | `pnpm scan https://automationexercise.com --config production --sortie banc/bestiaire/fiches/10-automationexercise.rapport.md --journal banc/bestiaire/fiches/10-automationexercise.journal.json` |
| **journal** | **hors dépôt** (C-13, même arbitrage que la fiche 07) : `~/.config/zurvela/bestiaire/10-automationexercise.journal.json` — 41 939 865 octets, sha256 `3b66752f8290bdde…` ; `ecartees` en pèse 35,3 Mo |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **337 936** | **0,155** | 40 | **1 649** | **19** |

**Candidates rejouables : 61/1 665 (4/410 groupes)** — 8 tentatives, toutes
exploitables ; 390 groupes tombés à l'échéance.

`mode IA : actif`. Coût : profilage 0,003 · **rédaction 0,152** (dix-neuf
sections, 31 % du plafond — la première fois que le budget est entamé pour de
bon). **Chronologie** : profilage +12,0 → +14,0 s · exploration desktop 107 s,
mobile 111 s → +222,7 s (`limite-pages`) · confirmation 56 s → +278,6 s,
arrêtée par l'échéance · **rédaction 59 s → +337,9 s : le scan finit à 113 %
de son échéance.** 46 formulaires remplis (recherche, connexion, inscription,
contact, lettre d'information), **0 soumission**. Profil `boutique` · `en` ·
0,95.

**Couverture** : 20 URL — accueil, `/products`, `/view_cart`, `/login`,
`/test_cases`, `/api_list`, `/contact_us`, les 7 catégories, 6 marques.
**Aucune fiche produit, aucun ajout au panier, aucun tunnel d'achat** : les 34
liens de produits viennent après les catégories et les marques dans l'ordre
de la page, et le budget de 20 pages s'arrête avant. L'objectif du scan — les
parcours transactionnels — n'a pas été exercé (obs. 6).

## Rapport

Lu par : l'agent. Fichier : `10-automationexercise.rapport.md` — 19 sections,
2 629 mots.

Lisible par un non-technicien ? **Chaque section, oui ; le rapport, non.**
Dix-neuf sections qui disent la même chose — « Un service extérieur ne
répond pas », « Seconde ressource externe en échec », « Troisième dépendance
externe », puis seize « Ressource externe non chargée sur la page d'accueil »
sous des titres variés —, aucune ne nomme le service, et la seule anomalie
VRAIE du lot (obs. 2) est expliquée de travers. Un commerçant qui lit cela
paie une « revue globale des services externes » pour rien. C'est le rapport
le plus cher de la campagne et le moins utile.

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `lenteur-outil` | **L'échéance ne borne pas la rédaction : le scan a duré 338 s pour 300 annoncées.** L'exploration s'est arrêtée au budget de pages (+222,7 s), la confirmation à l'échéance (+278,6 s, 390 groupes `echeance-atteinte`), puis la rédaction a tourné 59 s au-delà — dix-neuf appels, aucun garde-fou de temps. La commande annonce « échéance : 300 000 ms » et rend la main à 337 936. Sur un site à cent sections, la rédaction seule dépasserait l'échéance. C-06, troisième forme : non répartie (fiche 08), atteinte (fiches 05, 07), **non appliquée** (ici). | journal : `confirmation.fin +278,6 s`, `rapport.redige +337,9 s {nbSections: 19}`, `scan.fin {dureeMs: 337936}` ; sortie : `échéance : 300000 ms`, `durée : 337936 ms` |
| 2 | `comportement-inattendu` | **Un vrai défaut publié, et mal expliqué.** Le site charge sa feuille de style Google Fonts en **`http://` sur une page `https://`** → `mixed-content`, bloquée par le navigateur pour tout visiteur : polices de repli partout (20 candidates, groupe `reseau:GET:/css`, confirmé 2/2). C'est la section 1 — « Un service extérieur ne répond pas sur l'ensemble du site… une ressource hébergée en dehors de votre site… n'aboutit pas ». Faux : le service répond ; c'est LE SITE qui l'appelle en clair, et la correction tient en un `s`. Comme le jQuery de books (fiche 05), enfin publié — et le propriétaire ne saura pas quoi faire. C-05 (réciproque), C-03. | journal : preuve `requete-echouee · stylesheet · http://fonts.googleapis.com/css?family=Roboto… · erreur: mixed-content` ×20 ; verdict `confirmee/reproduite` ; rapport §1 |
| 3 | `faux-positif` | **Seize sections nées de seize « découvertes » qui sont une seule balise.** Les rejeux de l'accueil ont chacun émis de nouvelles balises Funding Choices (`POST fundingchoicesmessages.google.com/el/<jeton unique>`), jamais vues à l'exploration puisque le jeton change à chaque chargement : chacune est devenue une « découverte » (`constatee-au-rejeu`), chaque découverte une section — « Ressource externe non chargée sur la page d'accueil », « Un appel vers l'extérieur resté sans réponse à l'accueil », « Élément fourni par un tiers manquant sur l'accueil »… seize titres pour la même chose. Le mécanisme de découverte (brique 3) ne dédoublonne pas par cause, et une URL signée produit une découverte par rejeu : **le nombre de sections n'est plus borné par le site, mais par le nombre de rejeux**. 0,13 USD de rédaction pour seize fois rien. Nouveau : C-16. | journal : `confirmation.decouverte {cle: reseau:POST:/el/AGSKWx…}` ×16 (clés toutes distinctes) ; rapport §4 à §19, statut `constatee-au-rejeu` |
| 4 | `faux-positif` | **1 428 recouvrements « bloquants » : les cartes produit ont un calque de survol.** Chaque produit porte un `.product-overlay` (prix, nom, « Add to cart ») posé sur `.productinfo` et révélé au survol — la construction standard d'une grille marchande. La géométrie le voit comme un intercepteur permanent : `p` ×410, `div` ×272, `h2` ×19 de `.overlay-content` recouvrant 59 éléments distincts, sur 20 pages × 2 viewports. Plus 652 interceptions par le bloc d'en-tête. Aucune publiée (échéance) ; sur un site plus rapide, des dizaines de sections « bloquant ». Cinquième forme du recouvrement après le modal, l'annonce, le pied fixe et le chevauchement d'un lien : **le calque de survol**, que tout site marchand possède. C-12. | journal : `detection.fin {d-recouvrement: 1428}` ; preuves `interception-clic {intercepteur: p body > div > div:nth-of-type(2) > … , element: a …}` ; accueil : `<div class="product-overlay"><div class="overlay-content">` ×34 |
| 5 | `comportement-inattendu` | **La géométrie est tronquée à 500 éléments sur chacune des 40 visites** (`exploration.geometrie.tronquee {examines: 500}`) : au-delà, les éléments ne sont plus examinés. Sur une grille de 34 produits × (image, lien, bouton, calque), 500 est atteint dès l'accueil. Le résultat est doublement faux : trop (1 428 candidates sur ce qui est examiné) et trop peu (le reste n'est pas vu). Le plafond est un réglage (`exploration.elementsInteractifsMax: 500`) et il est bon ; ce qui ne l'est pas, c'est de dépenser cinq cents examens sur des calques de survol. À lire avec C-12. | journal : `exploration.geometrie.tronquee {examines: 500}` ×40 ; `config/production.json` : `exploration.elementsInteractifsMax: 500` |
| 6 | `comportement-inattendu` | **Le parcours d'achat n'a pas été exercé.** Vingt pages en largeur dans l'ordre du menu — catégories, marques — et jamais un produit, jamais le panier après un ajout, jamais le tunnel. Sur le seul site transactionnel de la campagne, Zurvela a vérifié le catalogue et pas la caisse. La déterministe ne sait pas qu'une fiche produit vaut plus qu'une sixième marque ; c'est ce que la politique IA (C-01) et un profil `boutique` (juste, 0,95) devaient arbitrer. C-08. | journal : 20 URL, 0 `/product_details/*`, 0 action `cliquer` sur « Add to cart » ; profil `boutique` |
| 7 | `comportement-inattendu` | **Journal de 42 Mo** : 1 649 candidates → 1 589 écartées, chacune recopiant son groupe entier — `ecartees` 35,3 Mo, `groupes` 3,6 Mo. Tenu hors dépôt (pointeur et empreinte dans l'en-tête). C-13, troisième fiche. | `JSON.stringify(rapport.ecartees).length` = 35,30 Mo sur 41,94 |
| 8 | `comportement-inattendu` | **`robots.txt` redirigé vers l'accueil et lu comme des règles** : `302 → /` puis `200 text/html`, 51 976 octets, `issue: lu`, aucune directive, tout autorisé. Deuxième site (fiche 08). C-14. | journal : `politesse.robots {issue: lu, octets: 51976}` ; `curl -L /robots.txt` : `1 redirection · text/html` |
| 9 | `RAS` | Ce qui a tenu : 46 remplissages aux valeurs marquées, 0 soumission — sur une boutique avec panier, connexion, inscription et contact, rien n'a été envoyé ; les huit rejeux menés ont tous été exploitables ; le budget a joué son rôle de plafond sans être atteint (31 %) ; le profil est juste. | journal : actions `remplir/ok` ×46, aucune `soumettre` ; `confirmation.tentative {echecOutillage: false}` ×8 ; `scan.fin {coutApi: 0.155}` |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **B (échéance) — quatrième rature** : l'échéance ne s'applique pas à la
  rédaction. « Échéance : 300 s » est une promesse de la commande ; elle
  doit être tenue phase par phase, rédaction comprise.
- **A.1 (origine tierce) — la réciproque, enfin sous les yeux** : un tiers
  que le site charge en clair est un défaut DU SITE ; le rapport l'a publié
  comme une panne du tiers. Et les découvertes au rejeu multiplient la
  doctrine par le nombre de rejeux (C-16).
- **A.3 (budget) — 31 % du plafond**, entamé par des sections qui ne
  devraient pas exister. À ce rythme, trois sites comme celui-ci par jour
  coûtent un demi-dollar de faux.
- **`d-recouvrement`** — le calque de survol d'une grille marchande est le
  cas le plus courant du web commercial, et il est traité comme un blocage.
  La ligne « bandeau de consentement » est devenue une famille de cinq.
- **Couverture (C-08)** — sur une boutique, vingt pages en largeur ne
  touchent pas le parcours qui fait vivre le commerçant. Le profil
  `boutique` est disponible et n'est pas utilisé pour choisir.
- **Rapport** — dix-neuf sections pour un site : le rapport a besoin d'une
  borne (sections par cause, sections au total) et d'une phrase de tête qui
  dise « 390 signalements non vérifiés » AVANT « le site fonctionne dans
  l'ensemble ».
