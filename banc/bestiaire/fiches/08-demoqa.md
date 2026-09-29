# Fiche 08 — demoqa.com

| | |
|---|---|
| **date** | 2026-09-29, 07:29 → 07:34 |
| **rang de cible** | 3 — site public d'entraînement (ToolsQA), application React monopage, lourde de publicité (nommé, pas anonymisé) |
| **url** | `https://demoqa.com` (six familles de démos : éléments, formulaires, alertes et fenêtres, widgets, interactions, librairie ; Google Ads, Analytics, Tag Manager) |
| **version du moteur** | `b43deb5` — code moteur inchangé depuis `7f6aa1c` |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté, 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, client IA actif |
| **commande** | `pnpm scan https://demoqa.com --config production --sortie banc/bestiaire/fiches/08-demoqa.rapport.md --journal banc/bestiaire/fiches/08-demoqa.journal.json` |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **289 273** | **0,035504** | 40 | 62 | 1 |

**Candidates rejouables : 20/62 (1/22 groupes)** — le chiffre par candidates
flatte, le chiffre par groupes dit vrai : un seul groupe (la balise Analytics,
20 membres) a eu droit à UNE tentative avant l'échéance.

`mode IA : actif`. Coût : profilage 0,001 · rédaction 0,034 (une section).
**Chronologie** : profilage +7,3 → +10,8 s · exploration desktop 172 s, mobile
98 s → **+271,9 s** (`limite-pages`, ≈ 6,8 s par page, publicité) ·
confirmation **+272,0 → +277,4 s : 5 s, 1 tentative, 21 groupes
`echeance-atteinte`** · rédaction 12 s → +289,3 s. **96 % de l'échéance.**
20 URL : les six familles et leurs premières démos (`/text-box`, `/checkbox`,
`/radio-button`, `/webtables`, `/buttons`, `/links`, `/broken`,
`/upload-download`, `/dynamic-properties`, `/automation-practice-form`,
`/browser-windows`, `/alerts`, `/frames`). Six formulaires remplis, **0
soumission**.

## Rapport

Lu par : l'agent. Fichier : `08-demoqa.rapport.md`.

Lisible par un non-technicien ? **oui** — une section, synthèse juste (« sans
être bloquant »), statut à UNE vérification correctement formulé (« reproduit
lors d'une vérification indépendante », au singulier : la voix suit le
nombre). Réserves : vingt pages listées, un mur ; le service n'est pas nommé
(c'est Google Analytics) ; la conséquence « il touche chaque page et chaque
visiteur » est trop forte pour une balise de mesure d'audience ; et « 21
autres signalements non re-vérifiés » cache deux images réellement cassées
(obs. 3).

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `lenteur-outil` | **L'exploration a mangé l'échéance et laissé 5 secondes à la confirmation.** Variante nouvelle de C-06 : l'échéance n'est pas atteinte pendant l'exploration (fiches 05, 07) mais l'exploration (272 s, 6,8 s par page de publicité) ne laisse rien au protocole — 1 tentative sur le premier groupe, 21 groupes `echeance-atteinte`, puis 12 s de rédaction. Le rapport sort à 96 %, propre en apparence, vérifié à 1/22. Il n'y a pas de RÉPARTITION de l'échéance entre les phases : la première sert, les suivantes ramassent. | journal : `exploration.fin +271,9 s {arret: limite-pages}`, `confirmation.debut +272,0 s`, `confirmation.fin +277,4 s {dureeMs: 5467}`, verdicts `limite-automatisation/echeance-atteinte` ×21 |
| 2 | `faux-positif` | **27 recouvrements « bloquants », dont 22 par le pied de page FIXE du site et 5 par une bannière publicitaire.** `#root > footer` (« © TOOLSQA ») est collé au bas de la fenêtre ; quand la déterministe clique un lien amené au bord inférieur, le pied de page l'intercepte — 14 fois sur desktop, 8 sur mobile, sur 16 pages. Un visiteur fait défiler d'un pouce ; le détecteur juge à la géométrie de l'instant, sans second essai après recentrage. Les 5 autres : l'`iframe` Google Ads 970 px. Aucun publié (échéance), tous seraient sortis `bloquant`. C-12, élargi aux éléments FIXES (pied, en-tête collant) : un second essai après recentrage lève l'ambiguïté ; une bannière fermable, une tentative de fermeture. | journal : preuves `interception-clic {intercepteur: footer #root > footer}` ×14, `{span #root > footer > span}` ×8, `{iframe #google_ads_iframe_…Ad.Plus-970x…}` ×5 ; toutes `fonctionnel/bloquant` ou `mobile/bloquant` |
| 3 | `rate-suspecte` | **Deux images réellement cassées, perdues dans le silence.** `/broken` : `Toolsqa.jpg` et `Toolsqa_1.jpg`, détectées par `d-image` (`etat-image`, `visuel/mineur`) — la page existe pour ça — jamais rejouées (obs. 1), donc « 21 autres signalements n'ont pas pu être re-vérifiés ». Quatrième fiche où le vrai défaut du site est enterré (books : jQuery ; expandtesting : cdnjs ; ici : images), et le premier cas où c'est l'ÉCHÉANCE seule qui l'enterre, pas la recette (C-09) ni la mesure (C-04). | journal : candidates `d-image · image-cassee · /broken · ressource /images/Toolsqa.jpg, Toolsqa_1.jpg` ; aucune tentative |
| 4 | `comportement-inattendu` | **La seule anomalie publiée est une balise Google Analytics** (`POST www.google-analytics.com/j/collect`, `ERR_FAILED`, 20 pages), confirmée sur UNE tentative, rédigée : « tout ce qui dépend de ce service extérieur reste indisponible… il touche chaque page et chaque visiteur ». Vrai pour la balise, faux pour le visiteur : une mesure d'audience qui échoue ne lui enlève rien. Le service n'est pas nommé (C-03, quatrième fiche). Et `d-lenteur` a produit cinq candidates `dependance-tierce-en-echec` de plus sur des requêtes EN ATTENTE (`gen_204` Google Ads ×4, pixel Tag Manager ×1, 24 s d'attente) : le détecteur de lenteur alimente la doctrine tierce par sa propre porte. C-05 (sixième cas), C-02. | journal : preuve `requete-echouee · xhr · POST …/j/collect · net::ERR_FAILED · interne false` ×20 ; `requete-en-attente {urlRessource: pagead2.googlesyndication.com/pagead/gen_204…, attenteMs: 24098}` ×4 ; rapport §1 |
| 5 | `comportement-inattendu` | **`robots.txt` servi en HTML, lu comme des règles.** L'application monopage répond `200 text/html` (436 octets, sa coquille React) à `/robots.txt` ; le moteur note `issue: lu` et n'y trouve aucune directive — tout est autorisé. Le résultat est juste, l'étiquette est fausse : un `robots.txt` est du `text/plain`, une page HTML à cet endroit vaut ABSENT (c'est le web). Un jour, une coquille HTML contenant le mot « Disallow » dans un script fera pire. C-14. | journal : `politesse.robots {issue: lu, octets: 436}` ; `curl -D - /robots.txt` : `200 OK · Content-Type: text/html` |
| 6 | `comportement-inattendu` | **Le profil tient sur 151 caractères.** L'accueil est une grille de six cartes-images ; l'extraction rend 151 caractères de texte, aucune métadonnée, et le profil sort `application` · `en` · **0,75** — juste, mais presque sans matière. Sur une application monopage, le texte utile est dans les pages, pas dans l'accueil ; le profilage n'a qu'une page à lire (brique 4a). À noter pour le jour où le profil pilotera la navigation (C-01). | journal : `profilage.extraction {nbChars: 151, metadonnees: []}`, `profilage.fin {confiance: 0.75}` |
| 7 | `RAS` | Aucun refus robots (rien n'est interdit) ; 6 formulaires remplis (`/text-box`, `/automation-practice-form`…), 0 soumis ; 2 champs ignorés ; aucune sortie de périmètre ; budget 7 % du plafond ; la voix au singulier pour une vérification unique — le contrat sémantique de `voix.ts` tient. | journal : `exploration.champs.ignores` ×2, actions `remplir/ok` ×6, aucune `soumettre` ; rapport : « reproduit lors d'une vérification indépendante » |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **B (échéance) — troisième rature, la plus instructive** : l'échéance
  n'est pas partagée entre les phases. Une exploration qui tient dans le
  budget de pages mais frôle le temps laisse le protocole sans rien, et le
  rapport ne le dit qu'en petit (« 21 signalements non re-vérifiés »). La
  ligne doit réserver du temps à la confirmation, ou arrêter l'exploration
  plus tôt quand la confirmation aura besoin de rejouer.
- **`d-recouvrement`** — après le modal (06) et les annonces (07), les
  éléments FIXES : un pied de page collé produit 22 « bloquants ». Sans
  second essai après recentrage, tout site à en-tête ou pied collant est
  un faux positif de gravité maximale par page.
- **A.1 (origine tierce) — sixième cas** (Analytics), et une porte
  d'entrée de plus : `d-lenteur` fabrique des candidates tierces à partir
  de requêtes en attente.
- **A.2 (politesse)** — un `robots.txt` doit être du texte ; une page HTML
  à sa place est un robots ABSENT (C-14).
- **Profilage (brique 4a)** — une application monopage peut n'offrir que
  151 caractères en page d'accueil ; le profil garde sa confiance honnête
  (0,75), mais la ligne « une page suffit » est à relire.
- **Rejouabilité** — le compteur par candidates (20/62) et le compteur par
  groupes (1/22) divergent quand un seul gros groupe est rejoué : les deux
  se publient ; le second est celui qui compte.
