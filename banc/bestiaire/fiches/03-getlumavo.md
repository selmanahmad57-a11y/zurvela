# Fiche 03 — getlumavo (second passage : le client IA de production est là)

| | |
|---|---|
| **date** | 2026-09-25, 14:42 → 14:46 |
| **rang de cible** | 2 — site possédé par le propriétaire (même cible que la fiche 02, à deux heures d'intervalle, pour mesurer ce que le client IA ajoute) |
| **url** | `https://www.getlumavo.com` (racine ; `/login` visité sans jamais être franchi) |
| **version du moteur** | `7f6aa1c` — correctif n°1 : client IA de production câblé |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté, 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, **client IA actif** (profilage haiku, rédaction opus) |
| **commande** | `pnpm scan https://www.getlumavo.com --config production --sortie banc/bestiaire/fiches/03-getlumavo.rapport.md --journal banc/bestiaire/fiches/03-getlumavo.journal.json` — *un seul run : depuis `700aee4`, la commande charge la clé et écrit le journal elle-même (fiche 02 : deux runs, dont un « instrument »).* |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **271 567** | **0,047183** | 40 | 3 | 2 |

`mode IA : actif`. Coût par famille : profilage 0,0017 · rédaction 0,0455 (96 %)
· exploration et confirmation 0 (la déterministe ne consulte pas le modèle).

**Chronologie (journal)** : profilage +15,4 → +17,2 s (1,8 s, pendant
l'exploration desktop) · exploration desktop 75 s, mobile 97 s → +173,2 s ·
confirmation 81 s → +254,2 s · **rédaction 17,4 s → +271,6 s** · arrêt
`limite-pages` (20 URL sur 125). **90,5 % de l'échéance.**

## Comparaison explicite au scan 02 — ce que le client IA ajoute

| | scan 02 (`f414fc9`, sans client) | scan 03 (`7f6aa1c`, client actif) | lecture |
|---|---|---|---|
| `ia.mode` | `degrade / non-implemente` | `actif` | le correctif n°1 tient en production |
| profil du site | aucun | `application` · `en` · confiance 0,95 (haiku, prompt v1, 1,8 s, 0,0017 USD) | juste : c'est une application SaaS en anglais |
| exploration | 40 visites, 20 URL | **les mêmes 20 URL, dans le même ordre**, 730 signaux dans les deux cas | la déterministe est reproductible sur un site réel ; l'IA n'y touche pas |
| détection | 3 candidates (1 `d-http`, 2 `d-lenteur`) | 3 candidates, mêmes détecteurs | identique |
| confirmation | 2 retenues, 2 écartées, 1 découverte, 0 USD | 2 retenues, 2 écartées, 1 découverte, 0 USD | identique — et toujours sans mesure de rejeu (obs. 4) |
| diagnostic IA (4c) | non sollicité | non sollicité | conforme : aucun rejeu en échec d'outillage indéterminé, donc pas de résidu (`estResidu`) |
| rapport | structurel : sections sans titre (« Performance · Important »), pas de synthèse | **rédigé** (opus, prompt v1) : synthèse, titres en langage courant, constat, conséquence, action, ligne de méthode | le différenciateur n°3 existe pour la première fois sur un site réel |
| langue du rapport | — | `fr` pour un site `en` | la langue vient de `config/rapport.json` (`langueRapport`), pas du site — voir inventaire |
| anomalie tierce (`/login`) | `dependance-tierce-en-echec` · fonctionnel/mineur · confirmée 2/2 · conf 0,735 | **identique, à la décimale** | classée tiers-mineur comme attendu (obs. 1) |
| anomalie de lenteur (`/`) | document `/` en 11,1 s — un vrai ralentissement | média `showcase-2.mp4` (206) en 14,6 s — une vidéo qui se lit | même page, autre cause, et cette fois c'est faux (obs. 2) |
| coût | 0 | 0,047 USD | 9,4 % du plafond ; le rapport coûte 0,045 |
| durée | 229 s (instrument) · 276 s (officiel) | 271,6 s | +19 s d'IA sur un scan qui frôlait déjà l'échéance (obs. 6) |

**Candidates rejouables** : 3/3 (3/3 groupes, 6 tentatives exploitables sur 6) — idem fiche 02 : les rejeux de lenteur tournent mais ne mesurent rien (obs. 4, C-04) (mesure ajoutée rétroactivement le 2026-09-25, APPRENTISSAGES n°18).

## Rapport

Lu par : l'agent. Fichier : `03-getlumavo.rapport.md`.

Lisible par un non-technicien ? **oui — c'est le premier rapport complet réel
du projet.** Une synthèse d'une phrase (« Le site reste utilisable dans
l'ensemble, mais… »), deux sections titrées en langage courant, chacune avec
« Ce que nous avons constaté », « Conséquence », « Ce qu'il faut faire
corriger », les statuts garantis (`voix.ts`) intacts, et « Notre méthode »
enrichi d'une ligne rédigée. Aucun chiffre dans la prose (dette n°9, tenue).
Trois réserves, toutes sur ce que la prose FAIT des données : elle rédige avec
aplomb un faux positif (obs. 2), elle ne nomme pas le tiers (obs. 3), et sa
ligne de méthode frôle le statut de la section 1 (obs. 5).

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `RAS` | **Google Sign-In : classé tiers-mineur, comme demandé et comme attendu.** `dependance-tierce-en-echec · fonctionnel/mineur`, confirmée 2/2 (ORB, desktop + mobile), confiance 0,7 → 0,735, gravité de `detecteurs.tiers` — identique à la fiche 02. Le faux positif (fiche 02, obs. 2 : Google sert du HTML 403 au robot déclaré, du JavaScript 200 à un navigateur) persiste, règle d'or ; la doctrine A.1 tient : jamais bloquant, jamais imputé au site. Ce que la prose en fait est une autre affaire (obs. 3). | journal : preuves `requete-echouee · script · accounts.google.com/gsi/client · net::ERR_BLOCKED_BY_ORB` ×2 · verdict `confirmee/reproduite`, taux 1 · rapport §2 « Mineur · Fonctionnement » |
| 2 | `faux-positif` | **« Page d'accueil lente à s'afficher sur téléphone » : c'est une vidéo de démonstration qui se télécharge, pas la page.** La preuve unique de la section 1 est `GET /demo/showcase-2.mp4 · media · 206 · 14 639 ms` (mobile, constatée pendant un rejeu, `nbMembres: 2`). Le document `/` a répondu 200 aux deux viewports ; à un navigateur ordinaire, au moment de la fiche : 200, 16,7 Ko, **0,25 s**. Une réponse 206 (contenu partiel) sur un média est un flux : sa durée mesure le téléchargement au rythme de la lecture, pas la lenteur du serveur. `d-lenteur` ne regarde ni le type de ressource ni le statut (`core/scanner/detection/d-lenteur.ts` : un seuil sur la durée, point) → palier 1,5× → confiance **0,85**, plus sûre que le vrai ralentissement du scan 02 (0,7). La rédaction a fait ce qu'on lui a donné : « la page d'accueil consultée depuis un mobile mettait un temps inhabituel à répondre » — faux pour le document — et recommande de « faire examiner le temps de réponse de la page d'accueil » : une dépense pour rien. Les deux autres candidates : `showcase-1.mp4` (média 206, 13,9 s, écartée) et **`/pricing` — document 200 en 22,9 s (mobile)**, le seul vrai ralentissement du scan, écarté après deux rejeux à 6,7 s et 6,2 s (démarrage à froid, comme au scan 02). **Bilan performance : le vrai lent est écarté, le faux lent est publié avec le titre le plus lisible du rapport.** Piste, pour un cahier : un flux média n'est pas une lenteur de page — c'est le web (206, `typeRessource: media`), pas le monde ; mesurer le document et les ressources bloquantes. **Non corrigé ici.** | journal : `confirmation.decouverte {cle: reseau:GET:/demo/showcase-2.mp4, motif: constatee-au-rejeu, confiance: 0.85, nbMembres: 2}` · anomalie retenue, preuve `typeRessource: media, statut: 206, dureeMs: 14639` · candidates `showcase-1.mp4 206 13 894 ms`, `/pricing document 200 22 937 ms` · `config/production.json` `lenteur.paliers[1] {ratioMin: 1.5, confiance: 0.85}` · `curl -A <navigateur> /` : HTTP 200, TTFB 0,254 s |
| 3 | `comportement-inattendu` | **La prose ne nomme pas le tiers.** Section 2 : « un service fourni par un prestataire extérieur et appelé par la page échoue » ; action : « demandez à votre prestataire d'identifier quel service extérieur est sollicité ». La preuve porte `accounts.google.com/gsi/client` et `nbLocalisationsMasquees: 0` : soit la rédaction ne reçoit pas l'URL de la ressource tierce, soit elle s'interdit de la citer. Pour un non-technicien, « la connexion avec Google ne répond pas » est actionnable en une minute ; « un service extérieur » l'oblige à payer quelqu'un pour chercher — et ici, à chercher une panne qui n'existe pas (obs. 1). À examiner (données passées au prompt de rédaction, ou consigne), pas à corriger ici. | rapport §2 · journal : `rapport.redige {nbLocalisationsMasquees: 0}` · preuve `urlRessource: https://accounts.google.com/gsi/client` |
| 4 | `comportement-inattendu` | **Rejeux de lenteur toujours sans mesure** (fiche 02, obs. 4 — confirmée au deuxième scan) : 6 `confirmation.tentative`, aucune ne porte de `mesure`. Le rejeu de `showcase-1.mp4` a duré **27,1 s puis 25,1 s** (durée de la tentative, statuts `[200, 206]`) et sort « jamais reproduite » : le verdict contredit sa propre durée. Ici l'issue est juste (média, obs. 2) ; mais `/pricing` à 22,9 s est écarté par la même absence, et l'on ne saura jamais si ses rejeux à 6,7 s étaient « sous le seuil » ou « non mesurés ». Deux scans, douze tentatives, zéro mesure : ce n'est plus une intermittence, c'est un chemin. | journal : `confirmation.tentative reseau:GET:/demo/showcase-1.mp4 n°1 {reproduite: false, dureeMs: 27064}`, n°2 `{dureeMs: 25053}` ; `/pricing` n°1 6 708 ms, n°2 6 249 ms ; aucun champ `mesure` |
| 5 | `comportement-inattendu` | **La ligne de méthode rédigée et le statut de la section 1 se frôlent.** « Notre méthode consiste à rejouer chaque signalement avant de le publier : ce que nous ne parvenons pas à reproduire est écarté du rapport » — et la section 1 est « Détecté pendant nos vérifications ; non re-testé ». Les deux phrases sont vraies (non re-testé ≠ non reproduit), mais un lecteur non technicien peut y lire une contradiction dans le même rapport. La ligne de méthode est une prose IA ; le statut est une garantie (`voix.ts`). Quand les deux parlent du même sujet, la garantie devrait cadrer la prose. À noter pour le prompt de rédaction. | rapport : « Notre méthode », dernière phrase · §1 statut `constatee-au-rejeu` |
| 6 | `lenteur-outil` | **90,5 % de l'échéance** (271,6 s / 300 s ; fiche 02 : 92 %). L'IA ajoute 19,2 s — profilage 1,8 s pendant l'exploration, **rédaction 17,4 s en toute fin de scan** — sur un parcours qui n'avait pas la marge. La rédaction arrive DERNIÈRE : si l'échéance tombe pendant, que devient le rapport ? Non observé ici (28 s de marge), non éprouvé au banc (l'instrument n'a pas d'échéance) : un site un peu plus lent, et le premier rapport complet redevient structurel au moment précis où il allait être rédigé. | chronologie : `confirmation.fin +254,2 s`, `rapport.redige +271,6 s` · `config/production.json` `scan.timeoutMs: 300000` |
| 7 | `RAS` | **Reproductibilité réelle de la déterministe** : 20 URL identiques à la fiche 02, dans le même ordre, 730 signaux ici comme là, mêmes trois détecteurs déclenchés, à deux heures d'intervalle. Couverture inchangée : 16 % du site, une seule langue, `/docs/*` et `/legal/*` (fiche 02, obs. 6). | journal : `exploration.page` ×40, `detection.fin {nbSignaux: 730}` ; fiche 02, même liste |
| 8 | `RAS` | Politesse et périmètre : `robots.txt` lu (108 octets), 1 000 ms respectés, aucun refus de Vercel, aucun formulaire soumis (`soumissionsTestees: false`), `/login` visité et jamais franchi, aucun secret dans le journal (0 occurrence des noms de variables). **Budget éprouvé pour la première fois** : 0,047 USD sur 0,5 (9,4 %), aucun refus de budget. | journal : `politesse.robots {issue: lu}`, `ia.budget {maxUsdParScan: 0.5}`, `scan.fin {coutApi: 0.047183}` ; aucun `ia.budget.refus` |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **A.1 (origine tierce) — confirmé une seconde fois** : le tiers sort mineur,
  jamais bloquant. La ligne reste à compléter (fiche 02) : un tiers qui
  répond mal au robot (ORB) n'est pas un tiers en panne ; et désormais,
  la prose ne nomme pas le tiers (obs. 3).
- **A.3 (budget) — éprouvé pour la première fois** : 0,047 USD, dont 96 % de
  rédaction. Le plafond de 0,5 USD laisse dix rapports de cette taille ; il
  n'a pas été approché. Aucun refus, aucun repli.
- **B (échéance) — confirmé et aggravé** : 90,5 %, avec 19 s d'IA en plus
  dont 17 s de rédaction placés en dernier. La ligne doit dire ce qui arrive
  au rapport quand l'échéance tombe pendant la rédaction (obs. 6).
- **B `lenteur.seuilMs: 8000` — deuxième donnée réelle, et elle rature la
  ligne** : le seuil est franchi par des flux média (13,9 s, 14,6 s, statut
  206) comme par un document (22,9 s). Une durée seule ne distingue pas les
  deux, et le rapport a publié le mauvais (obs. 2). La ligne doit porter le
  type de ressource et le statut, pas seulement la durée.
- **Rapport, langue** — la langue du rapport (`fr`) vient de
  `config/rapport.json` (`langueRapport`) : `pnpm scan` n'a pas d'option de
  langue, et le profil (`en`, 0,95) n'y entre pas. Pour un client, c'est bien
  la langue DU CLIENT qu'il faut, pas celle de la config par défaut ni celle
  du site : la commande devra la recevoir. Ligne à ajouter.
- **Différenciateur n°3 — première mesure réelle** : le rapport est lisible,
  et il est rédigé avec la même assurance quand il a raison (§2, mineur) et
  quand il a tort (§1, faux positif). La rédaction amplifie ce que la
  détection lui donne ; le différenciateur n°1 (zéro faux positif) est donc
  la condition du n°3, pas son voisin.

## Entrées au carnet des correctifs — trois, distinctes (arbitrage du 2026-09-25)

Trois défauts se cachent sous cette fiche et ne se corrigent pas ensemble ;
ils entrent au `CARNET-CORRECTIFS.md` comme trois entrées, aux côtés du
cahier n°2 (C-01), et rien n'est corrigé avant le vingtième scan :

- **C-02** — `d-lenteur` ignore le type et le statut de la ressource
  (obs. 2). Cause racine du faux positif publié.
- **C-03** — la prose ne nomme pas le tiers (obs. 3). L'apprentissage n°6 en
  action dans le rapport : un diagnostic imprécis envoie chercher au mauvais
  endroit.
- **C-04** — les rejeux de lenteur sans mesure (obs. 4, fiche 02 obs. 4
  confirmée récurrente). **Le plus urgent** : le protocole anti-faux-positifs
  ne fonctionne pas sur la catégorie lenteur — il écarte par absence de
  mesure, pas par re-mesure ; le vrai lent de `/pricing` a été écarté
  correctement pour une mauvaise raison.

Ce que ces trois-là disent ensemble : **le pilier n°1 vient de rencontrer sa
première défaite réelle — il a écarté le vrai et retenu le faux** — et la
rédaction, qui fonctionne, l'a habillé de la même clarté qu'une vérité
(APPRENTISSAGES n°17). La Phase 1 tient ; ce sont les détecteurs face au web
réel qui ont besoin d'une seconde passe, exactement ce que la campagne
existait pour révéler.
