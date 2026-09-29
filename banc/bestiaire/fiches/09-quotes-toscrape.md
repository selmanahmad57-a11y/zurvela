# Fiche 09 — quotes.toscrape.com

| | |
|---|---|
| **date** | 2026-09-29, 07:36 → 07:38 |
| **rang de cible** | 3 — site de test public, statique, sans publicité ni script tiers dans le HTML : le site de CONTRÔLE de la campagne (nommé, pas anonymisé) |
| **url** | `https://quotes.toscrape.com` (citations, auteurs, mots-clés ; `robots.txt` absent ; police Raleway via Google Fonts dans la feuille de style) |
| **version du moteur** | `b43deb5` — code moteur inchangé depuis `7f6aa1c` |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté (absent → tout autorisé), 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, client IA actif |
| **commande** | `pnpm scan https://quotes.toscrape.com --config production --sortie banc/bestiaire/fiches/09-quotes-toscrape.rapport.md --journal banc/bestiaire/fiches/09-quotes-toscrape.journal.json` |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **160 640** | **0,051421** | 40 | 38 | 3 |

**Candidates rejouables : 38/38 (3/3 groupes)** — 6 tentatives exploitables
sur 6, 1 contre-épreuve, 0 écartée. Le protocole a tout rejoué, comme sur
the-internet (fiche 06).

`mode IA : actif`. Coût : profilage 0,0015 · rédaction 0,050 (trois sections).
**Chronologie** : profilage +10,4 → +12,1 s · exploration desktop 56 s, mobile
54 s → +117,5 s (`limite-pages`) · confirmation 26 s → +143,8 s · rédaction
17 s → +160,6 s. **54 % de l'échéance.** Deux formulaires remplis (`/login`,
un par viewport), **0 soumission**.

## La question de contrôle : les défauts disparaissent-ils sur du simple ?

**Non.** Sans publicité, sans script tiers, sans formulaire à l'accueil, le
rapport publie trois anomalies « confirmées lors de nos 2 vérifications » :
deux sections pour deux fichiers de la MÊME police Google Fonts en
`ERR_FAILED`, et un « Bloquant · Mobile — les clics sur la page d'accueil
n'aboutissent pas » pour UN lien de mot-clé recouvert par le pied de page.
Aucune des trois n'est un défaut que le lecteur du site rencontre. Le site de
contrôle isole donc ce qui ne vient ni des tiers lourds ni des recettes de
rejeu : la doctrine tierce (C-05), le groupement par ressource (C-11) et la
gravité unique du recouvrement (C-12) suffisent, seuls, à produire un rapport
faux sur un site sain. Et il révèle un vrai défaut que personne ne publie
(obs. 3).

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `faux-positif` | **Google Fonts : la cause racine est l'IDENTITÉ DÉCLARÉE du robot.** 37 candidates `ERR_FAILED` sur deux fichiers `.ttf` de Raleway, rejouées 2/2, publiées en deux sections mineures (« un service externe », « une seconde ressource externe »). Vérifié hors moteur : `fonts.googleapis.com/css?family=Raleway` sert au `User-Agent: ZurvelaBot` **2 fichiers TTF sans découpage `unicode-range`** (le format hérité réservé aux agents inconnus) et à un navigateur **10 fichiers woff2** découpés. Le TTF répond 200 avec CORS `*` ; l'échec est côté navigateur, sur ce format-là, dans notre Chromium. Même cause que Google Sign-In (fiche 02 : 403 HTML au robot) : **le robot déclaré ne voit pas le même web que le visiteur**, et la doctrine tierce mesure cette différence comme une panne du site — troisième site sur neuf (cutlybook, expandtesting, ici). L'identité n'est pas négociable (constitution §3) ; c'est la doctrine qui doit cesser de juger ce que le tiers sert au robot. C-05, APPRENTISSAGES n°19. | journal : `requete-echouee · font · fonts.gstatic.com/s/raleway/v37/…ttf · net::ERR_FAILED` ×37, 2 groupes `confirmee/reproduite` ; `curl -A ZurvelaBot …/css?family=Raleway` : 2 × `.ttf`, 0 `unicode-range` ; `curl -A <Chrome>` : 10 × `.woff2`, 10 `unicode-range` |
| 2 | `faux-positif` | **« Sur téléphone, les clics sur la page d'accueil n'aboutissent pas » — c'est UN lien.** Le dixième mot-clé du bloc « Top Ten tags » (`a[href="/tag/simile/"]`) est recouvert, sur mobile, par le paragraphe du pied de page (`body > footer > div > p`) ; reproduit 2/2 sur mobile, absent sur desktop (contre-épreuve `attendue: true, reproduite: false` → confiance 0,8 → **0,88**). Le fait est vrai et petit : un chevauchement de deux pixels sur le dernier lien secondaire de la page. Le rapport en fait « Bloquant · Mobile », « un lecteur… bloqué dès le premier geste… quitter le site sans accéder aux articles », et invite à chercher « bandeau, fenêtre de consentement, menu » — la localisation dit « / — mobile » sans l'élément, la prose généralise à toute la page. Le détecteur n'a qu'une gravité (`bloquant`) quel que soit l'élément recouvert ; la rédaction amplifie (n°17). C-12, élargi à la gravité et à la localisation. | journal : `interception-clic {element: a[href=/tag/simile/] (span:nth-of-type(10)), intercepteur: p (body > footer > div > p:nth-of-type(1)), source: geometrie}` ; verdict `confirmee`, `confianceFinale 0.882` ; rapport §1 |
| 3 | `rate-suspecte` | **Le site rétrograde ses visiteurs de https vers http, et personne ne le dit.** Les liens de l'accueil sont relatifs ; leur cible sans barre finale répond **`308 → http://quotes.toscrape.com/…/`**. Le moteur a suivi : **36 des 40 visites se sont faites en `http://`**. Comme le schéma fait partie de l'origine (`normaliserUrl`), chaque page atteinte a été jugée EXTERNE — 36 événements `exploration.page.externe` — donc jamais extraite (ni liens, ni formulaires) : l'exploration s'est arrêtée à la profondeur 1, l'accueil et `/login` étant les deux seules pages « internes ». Et pourtant ces pages externes ont été **comptées dans le budget de 20 pages, détectées (les 37 candidates de polices y sont) et publiées** (« /tag/change/page/1/ — desktop, mobile »), en cachant qu'elles sont servies en clair. Trois faits : (a) un vrai défaut de sécurité de base — redirection qui rétrograde le chiffrement — que rien ne détecte (catégorie promise par la constitution §1) ; (b) une contradiction du périmètre : externe pour l'extraction, interne pour le budget et le rapport ; (c) un rapport qui liste des pages http comme si elles étaient les siennes. C-15 ; détecteur manquant au backlog. | journal : `exploration.page.externe {depuis: https://…/author/Albert-Einstein, vers: http://…/author/Albert-Einstein/}` ×36 ; `exploration.page {url: http://…}` ×36 ; `curl -I https://…/author/Albert-Einstein` : `308 → http://quotes.toscrape.com/author/Albert-Einstein/` ; rapport §2–3, pages listées |
| 4 | `comportement-inattendu` | **Une cause, deux sections** : deux fichiers de la même police = deux groupes = deux sections, la seconde titrée « Une seconde ressource externe échoue » — le lecteur cherche un second prestataire qui n'existe pas. Aucune des deux ne nomme Google Fonts (C-03, cinquième fiche). Vingt-et-une localisations masquées, et encore dix-sept à vingt pages listées par section : un mur. C-11. | journal : groupes `reseau:GET:/s/raleway/v37/…vaorCIPrQ.ttf` (17 membres) et `…Vs9pbCIPrQ.ttf` (20) ; `rapport.redige {nbLocalisationsMasquees: 21}` |
| 5 | `RAS` | Ce qui a marché : 38/38 rejouées, 6/6 tentatives, contre-épreuve menée et concluante (le défaut est bien propre au mobile) ; `robots.txt` absent géré ; 2 remplissages (`/login`), 0 soumission ; profil `blog-contenu` · `en` · 0,85 (juste) ; 54 % de l'échéance ; budget 10 % du plafond ; le pied de page et le mot-clé sont réellement superposés sur mobile (le fait, pas la gravité). | journal : `confirmation.fin {nbRetenues: 3, nbEcartees: 0}` ; `politesse.robots {issue: absent, statut: 404}` ; `profilage.fin {typeSite: blog-contenu, confiance: 0.85}` |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **A.1 (origine tierce) — la cause racine est trouvée, et elle est chez
  nous** : Google sert au robot déclaré autre chose qu'au visiteur (403 HTML
  pour Sign-In, TTF hérité pour Fonts). La ligne doit dire : *une ressource
  tierce qui échoue POUR LE ROBOT n'est pas jugée ; seule une ressource
  tierce dont l'échec a un effet visible dans la page l'est* — et l'identité
  reste déclarée.
- **Périmètre (origine)** — le schéma fait partie de l'origine pour
  l'extraction mais pas pour le budget ni pour le rapport ; un site qui
  rétrograde en http est exploré à profondeur 1 et publié comme si de rien
  n'était (C-15). Et la rétrogradation elle-même est un défaut de sécurité de
  base sans détecteur : ligne à ajouter au backlog des détecteurs.
- **`d-recouvrement`** — après le modal, les annonces et le pied fixe : le
  chevauchement RÉEL mais minuscule. Une seule gravité pour tout cela n'est
  pas une gravité. La localisation doit descendre à l'élément.
- **A.3 (budget)** — 10 % du plafond, dont 97 % de rédaction pour trois
  sections dont aucune n'aurait dû exister : le faux positif tiers coûte
  0,017 USD la section.
- **Protocole (brique 3)** — 38/38 rejouées : deuxième preuve (fiche 06)
  que le protocole tient quand la recette tient. Sur neuf fiches, la
  rejouabilité vaut 0/0, 3/3, 3/3, 0/8, 0/13, 24/24, 0/187, 20/62 (1/22),
  38/38 : bimodale, jamais entre les deux — c'est la recette ou l'échéance,
  jamais le protocole.
