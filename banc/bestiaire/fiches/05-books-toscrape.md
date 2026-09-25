# Fiche 05 — books.toscrape.com

| | |
|---|---|
| **date** | 2026-09-25, 15:11 → 15:16 |
| **rang de cible** | 3 — site de test public conçu pour les robots (nommé, pas anonymisé : il existe pour être scanné par n'importe qui) |
| **url** | `https://books.toscrape.com` (librairie factice : 50 catégories, 1 000 livres, 20 par page, chaque livre avec un formulaire « Add to basket » réduit à un bouton ; `robots.txt` absent) |
| **version du moteur** | `8b209a2` — code moteur inchangé depuis `7f6aa1c` |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté (absent → tout autorisé), 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, client IA actif |
| **commande** | `pnpm scan https://books.toscrape.com --config production --sortie banc/bestiaire/fiches/05-books-toscrape.rapport.md --journal banc/bestiaire/fiches/05-books-toscrape.journal.json` |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **295 233** | **0,001707** | 13 | 13 | **0** |

`mode IA : actif`. Coût : profilage 0,0017 · rédaction 0.

**Chronologie (journal)** : profilage +5,0 → +7,2 s · exploration desktop
13 pages en 288 s (≈ 25 s par page) · **viewport mobile ouvert à +295,0 s,
échéance à +295,2 s : 0 page mobile** · confirmation : **0 tentative**
(`echeance-atteinte`) · rapport sans section. **Arrêt `echeance` — 98,4 % de
l'échéance consommés par la seule exploration.**

**Candidates rejouables** : **0/13** (0/1 groupe, 0 tentative — `echeance-atteinte`, C-06/C-10) (mesure ajoutée rétroactivement le 2026-09-25, APPRENTISSAGES n°18).

## Rapport

Lu par : l'agent. Fichier : `05-books-toscrape.rapport.md`.

Lisible par un non-technicien ? **oui** — « Aucune anomalie n'a été retenue »,
« 1 autre signalement n'a pas pu être re-vérifié ». Et faux par omission : le
seul vrai défaut du site est ce signalement (obs. 2).

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `lenteur-outil` | **L'échéance est atteinte pendant l'exploration, sur le site le plus simple de la campagne — un catalogue statique.** 250 actions en 13 pages : **237 `remplir`** sur des formulaires SANS CHAMP (chaque livre porte un `<form method="get">` réduit à un bouton « Add to basket », 20 à 21 par page ; `choisirValeurs` rend `valeurs: []` et l'action est quand même énumérée, puis exécutée « ok » en 1,04 s chacune) ; 13 `naviguer` à 3,4 s. Par page : 21 remplissages vides (22 s) + navigation + politesse ≈ 25 s. La déterministe élit la PREMIÈRE action du menu (dette n°18, levée) et le menu place `remplir` avant `naviguer` : elle remplit tout ce qui se présente avant d'avancer — ici, rien, vingt fois par page. Conséquences : 0 page mobile, 0 rejeu, 13 candidates écartées `echeance-atteinte`, un rapport vide. Deux volets, carnet C-10 : (a) un formulaire sans champ remplissable n'a pas d'action `remplir` (c'est le web) ; (b) vingt formulaires identiques (même méthode, même action, même signature) sur une page ne valent pas vingt actions. | journal : actions `remplir/ok` ×237, `naviguer/ok` ×13 ; `parcours.actions[1] {type: remplir, formulaire {method: get}, valeurs: []}` ; durées moyennes `remplir` 1 040 ms, `naviguer` 3 428 ms ; `exploration.fin {arret: echeance, pages: 13, actions: 250}` ; `confirmation.verdict {motif: echeance-atteinte, nbTentatives: 0}` |
| 2 | `rate-suspecte` | **Le seul vrai défaut du site est passé sous silence.** `http://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js` chargé EN CLAIR sur une page https → `mixed-content`, bloqué par le navigateur pour tout visiteur en https (13 candidates, une par page, 1 groupe) — jQuery absent, donc tout comportement qui en dépend est cassé. Trois choses : (a) c'est classé `dependance-tierce-en-echec` (tiers, mineur) alors que **le tiers n'y est pour rien : c'est le site qui charge une ressource en http** — `mixed-content` est un standard du navigateur, à distinguer d'une panne tierce, et sa gravité n'est pas « mineur » quand la ressource est un script ; (b) jamais rejoué (obs. 1), donc « 1 autre signalement n'a pas pu être re-vérifié » : la seule vraie trouvaille du scan disparaît dans le silence, troisième fois en trois fiches (fiches 03, 04) ; (c) sur un vrai client, un propriétaire lit « aucune anomalie » et garde son script cassé. Carnet C-05 (élargi), C-06. | journal : preuve `requete-echouee · script · http://ajax.googleapis.com/… · erreur: mixed-content · interne false · cadrePrincipal false` ×13 ; rapport : « 1 autre signalement n'a pas pu être re-vérifié » |
| 3 | `RAS` | `robots.txt` absent (404) : `issue: absent`, tout autorisé, proprement journalisé — premier cas réel. Profil `boutique` · `en` · 0,95 : juste (la langue déclarée `en-us` est normalisée). 237 remplissages, **0 soumission** (`soumission: aucune` tenue). Aucune lenteur (0 candidate `d-lenteur`). Budget 0,3 % du plafond. | journal : `politesse.robots {issue: absent, statut: 404}`, `profilage.fin {typeSite: boutique, langue: en, confiance: 0.95}`, aucune action `soumettre` |
| 4 | `comportement-inattendu` | **Menus de 73 à 263 actions (moyenne 146)** : 50 catégories + 20 livres + 21 formulaires par page, sans borne. Pour la déterministe c'est du temps ; pour la politique IA (quand C-01 la rendra) c'est un prompt de 263 entrées à chaque décision — coût et confusion. `libelleMaxChars` et `historiqueMaxActions` bornent le libellé et l'historique, rien ne borne le NOMBRE d'actions énumérées. À lire avec C-08 (couverture) et le cahier n°2. | journal : `decision.enumeration {nbActions: 95 … 263}` ×249 ; `config/production.json` : `libelleMaxChars: 120`, `historiqueMaxActions: 10`, pas de borne de menu |
| 5 | `comportement-inattendu` | **Journal de 4,3 Mo** (781 entrées ; JSON indenté ; `parcours.actions` porte 250 actions avec leurs sélecteurs, 882 signaux). Les fiches 02–04 pesaient 165 à 324 Ko. Vingt scans à ce rythme, c'est le dépôt qui grossit de dizaines de Mo pour une campagne. Outillage de campagne (autorisé par la règle d'or) : JSON compact, ou extrait à côté du journal complet hors dépôt — à trancher avant le scan n°6. | `ls -la 05-books-toscrape.journal.json` : 4 300 077 octets |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **B (échéance) — raturée, pas confirmée** : jusqu'ici l'échéance était
  frôlée (92 %, 90,5 %) ou large (57 %) ; ici elle est ATTEINTE par
  l'exploration seule, et tout ce qui suit (mobile, confirmation, rédaction)
  n'existe pas. L'arbitrage `pagesMax` / `delaiEntrePagesMs` / `timeoutMs`
  ne suffit pas : le coût d'une PAGE n'est pas borné (ici 25 s pour un
  catalogue statique), parce que le coût d'une page dépend du nombre
  d'actions que la politique y prend. La ligne doit porter un budget
  d'actions par page, ou une borne sur ce qu'on énumère (C-10).
- **A.1 (origine tierce) — raturée une troisième fois** : `mixed-content`
  n'est ni une panne tierce ni un blocage du robot, c'est un défaut du site,
  et il vaut plus que « mineur » sur un script. La ligne « une panne tierce
  n'est jamais imputée au site » a besoin de sa réciproque : une ressource
  tierce que LE SITE charge mal (http sur https) EST imputée au site.
- **A.2 (politesse) — confirmé** avec le cas « pas de robots.txt ».
- **Protocole (brique 3) — le taux de candidates réjouables, encore** : 0
  sur 13, pour une raison nouvelle (échéance). Trois fiches, trois raisons
  de ne rien rejouer (C-04 mesure absente, C-09 préalables, C-06 échéance),
  et à chaque fois le rapport dit « aucune anomalie ». Le chiffre qui manque
  au rapport comme à la scorecard est le même.
