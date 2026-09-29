# Fiche 06 — the-internet.herokuapp.com

| | |
|---|---|
| **date** | 2026-09-25, 15:38 → 15:44 |
| **rang de cible** | 3 — catalogue public de pièges UI conçu pour les testeurs (nommé, pas anonymisé) |
| **url** | `https://the-internet.herokuapp.com` (accueil + 44 pièges ; `robots.txt` présent, tout autorisé) |
| **version du moteur** | `5d5fc74` — code moteur inchangé depuis `7f6aa1c` |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté, 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, client IA actif |
| **commande** | `pnpm scan https://the-internet.herokuapp.com --config production --sortie banc/bestiaire/fiches/06-the-internet.rapport.md --journal banc/bestiaire/fiches/06-the-internet.journal.json` |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **216 570** | **0,062417** | 40 | 24 | **5** |

**Candidates rejouables : 24/24 (5/5 groupes)** — première fiche où la
commande l'imprime, et premier scan où le protocole a tout rejoué.

`mode IA : actif`. Coût : profilage 0,0014 · rédaction 0,061 (5 sections,
98 % du coût). **Chronologie** : profilage +9,0 → +12,0 s · exploration
desktop 61 s, mobile 60 s → +122,7 s · confirmation 62 s → +184,6 s ·
**rédaction 32 s → +216,6 s**. 72 % de l'échéance. Arrêt `limite-pages` :
**20 URL sur 45** — l'accueil et les 19 premiers pièges dans l'ordre de la
page, de `abtest` à `forgot_password`.

**Pièges traversés (19)** : `abtest`, `basic_auth` (401), `broken_images`,
`challenging_dom`, `checkboxes`, `context_menu`, `digest_auth` (401),
`disappearing_elements`, `drag_and_drop`, `dropdown`, `dynamic_content`,
`dynamic_controls`, `dynamic_loading`, `entry_ad`, `exit_intent`, `download`,
`upload`, `floating_menu`, `forgot_password`. **Refusé** : `add_remove_elements`
(obs. 5). **Jamais atteints (24)** : `frames`, `nested_frames`, `windows`,
`javascript_alerts`, `javascript_error`, `redirector`, `status_codes`, `slow`,
`infinite_scroll`, `shadowdom`, `shifting_content`, `typos`, `login`,
`geolocation`, `hovers`, `horizontal_slider`, `inputs`, `jqueryui/menu`,
`key_presses`, `large`, `notification_message`, `download_secure`, `tables`,
`tinymce` — la moitié la plus méchante du catalogue (obs. 7).

## Rapport

Lu par : l'agent. Fichier : `06-the-internet.rapport.md`.

Lisible par un non-technicien ? **oui** — synthèse juste (« un blocage
d'interaction confirmé sur une page… plusieurs anomalies mineures »), cinq
sections titrées avec constat, conséquence, action. Trois réserves : les
sections 1–2 promettent un blocage qui n'en est pas un (obs. 2) ; les
sections 1–2 et 4–5 disent deux fois la même chose (obs. 3) ; la section 3
liste dix-huit pages, un mur pour un non-technicien, sans nommer le service
(obs. 4).

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `RAS` | **Le protocole a tout rejoué** : 24/24 candidates, 5/5 groupes, 10 tentatives exploitables sur 10, 0 écartée, 2 contre-épreuves. Première fois en six scans. Pourquoi C-09 n'a pas mordu : les représentants rejoués venaient de pages atteintes SANS remplissage préalable (`/`, `/broken_images`, `/entry_ad`, `/dynamic_controls`) ; dix `remplir` ont eu lieu (`/checkboxes`, `/dropdown`, `/dynamic_controls`, `/upload`, `/forgot_password`) mais aucune candidate n'a été observée sur la page qui les suivait. Chance du représentant, pas correction. | journal : `confirmation.tentative {echecOutillage: false}` ×10, `confirmation.fin {nbRetenues: 5, nbEcartees: 0}` ; sortie `rejouables : 24/24 candidates (5/5 groupes)` |
| 2 | `faux-positif` | **Le modal d'entrée est « bloquant », et il se ferme d'un clic.** `/entry_ad` affiche à l'arrivée une fenêtre modale (« This is a modal window. It's not a big deal. ») avec un pied « Close » (`#modal .modal-footer` → `$('#modal').hide()`) ; le lien `#restart-ad` est dessous. `d-recouvrement` a vu le clic intercepté par `#modal > div` (source `geometrie`), rejoué ×2 → confirmé, gravité `bloquant` (config), catégorie `fonctionnel` puis `mobile` : sections 1 et 2, « le parcours s'arrête là ». Faux : le visiteur ferme le modal et continue. **Le détecteur n'essaie pas de fermer ce qui recouvre.** C'est l'hypothèse « bandeau de consentement » de l'inventaire, vérifiée au premier recouvrement rencontré : sur les sites de rang 4, chaque bandeau cookies produira deux sections bloquantes. La confiance a pourtant BAISSÉ (0,8 → 0,63, obs. 3) sans que la gravité ni le statut « reproduit lors de nos 2 vérifications » ne bougent. Carnet C-12. | journal : candidates `interception-clic {element: a#restart-ad, intercepteur: #modal > div:nth-of-type(1), source: geometrie}` ×2 ; verdicts `confirmee/reproduite, taux 1, confianceInitiale 0.8 → confianceFinale 0.63` ; `curl /entry_ad` : `<div class="modal-footer"><p>Close</p>` |
| 3 | `comportement-inattendu` | **Un défaut, deux groupes, deux sections — et la contre-épreuve l'a prouvé sans en tirer la conséquence.** Les groupes `d-recouvrement` sont clés par viewport (`…:desktop`, `…:mobile`) ; chacun a été contre-éprouvé sur l'AUTRE viewport (`attendue: false`, `reproduite: true`) — le défaut n'est donc pas propre à un viewport — et la seule suite a été de baisser la confiance à 0,63 et de publier les deux, l'une `fonctionnel`, l'autre `mobile`. La rédaction a dû titrer « Le même blocage des clics sur téléphone ». Idem `/broken_images` : deux ressources 404 sur la même page (`/asdf.jpg`, `/hjkl.jpg`) = deux groupes = deux sections (« D'autres visuels manquants sur cette même page »). Le groupement est par clé de ressource ; le lecteur veut une cause par page. Carnet C-11. | journal : `confirmation.contre-epreuve {cle: …:desktop, viewport: mobile, attendue: false, reproduite: true}` et l'inverse ; groupes `reseau:GET:/hjkl.jpg`, `reseau:GET:/asdf.jpg` ; rapport §1–2, §4–5 |
| 4 | `RAS` | **La doctrine tierce a eu raison, une fois.** `298279967.log.optimizely.com/event` → `net::ERR_NAME_NOT_RESOLVED` : le sous-domaine n'existe plus, pour le robot comme pour tout visiteur. Vieux snippet Optimizely sur 18 pages : un vrai défaut sans effet visible, publié mineur, 18 pages listées. Quatrième cas de la doctrine (après ORB, `ERR_FAILED` police/balise, contenu mixte) et le premier où « tiers en panne » est littéralement vrai. Mais la prose ne le nomme toujours pas — « un service extérieur », « faire identifier le service » — troisième fiche (C-03). Les deux vraies anomalies du scan (images cassées, section 4–5) sont justes : `/broken_images` est fait pour ça. | journal : preuves `requete-echouee · xhr · net::ERR_NAME_NOT_RESOLVED · interne false` ×18 ; groupe `reseau:GET:/event` 18 membres ; `ressource-interne-404 · visuel/mineur · conf 0,99` ×2 |
| 5 | `comportement-inattendu` | **Le filtre destructif a refusé une page** : `/add_remove_elements/` — le canal URL a reconnu le motif `remove` (`config/actions-interdites.json`, `motifsUrl`), `naviguer/interdite` ×2, page jamais vue. Sur ce site c'est une démo d'ajout et de suppression d'éléments ; la deuxième ligne de défense a préféré ne pas voir. C'est le bon sens de l'erreur (constitution §3), au prix d'une page sur vingt — et d'un mot de chemin pris pour un verbe exécuté. À l'inventaire, pas au carnet : la sécurité tranche. | journal : `decision.couche {couche: filtre-destructif, canal: url, motif: remove}` ×2, `action a3 naviguer → interdite` |
| 6 | `RAS` | Pièges traversés sans incident : `basic_auth` et `digest_auth` répondent 401 (visités, non signalés — un mur d'authentification n'est pas un défaut — mais non mentionnés au rapport non plus) ; `download` sans aucun téléchargement suivi ; `upload` sans envoi ; `forgot_password` rempli (`test@zurvela-scan.invalid`) et jamais soumis ; champ désactivé ignoré sur `/dynamic_controls` ; `exit_intent`, `context_menu`, `drag_and_drop`, `floating_menu`, `dynamic_*` sans bruit. **Non détecté, faute de détecteur** : `disappearing_elements` (un lien de menu disparaît aléatoirement) — pas un raté, une catégorie absente (stabilité visuelle). Profil `autre` avec `natureLibre` juste (« site de démonstration et de test pour l'automatisation web »), 0,85. | journal : `exploration.page {statutHttp: 401}` ×4, `exploration.champs.ignores {url: /dynamic_controls, champs: 1}` ×2, actions `remplir/ok` ×10, aucune `soumettre` ; `profilage.fin {typeSite: autre, natureLibre: …}` |
| 7 | `comportement-inattendu` | **Couverture 20/45, dans l'ordre de la page.** La moitié la plus méchante du catalogue n'a jamais été vue — alertes JavaScript, fenêtres multiples, cadres, redirections, codes de statut, page lente, défilement infini, DOM fantôme, coquilles, connexion. Un second scan donnerait exactement les mêmes vingt (fiche 03, obs. 7). C-08, et l'argument le plus concret jusqu'ici pour une politique qui CHOISIT : sur un catalogue, l'ordre alphabétique de la page n'est pas un ordre d'intérêt. | journal : `exploration.fin {arret: limite-pages, pages: 40}` ; 44 pièges listés dans l'accueil, 19 visités |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **Hypothèse `d-recouvrement` (bandeau de consentement) — vérifiée, et dans
  le mauvais sens** : le premier recouvrement réel est un modal fermable, et
  il sort « bloquant » sur deux sections. La ligne doit dire : un
  recouvrement n'est bloquant que si l'on a TENTÉ de le fermer et échoué
  (C-12) ; sinon c'est une gêne, à confiance minorée.
- **A.1 (origine tierce) — quatrième cas** : un tiers réellement mort
  (DNS). La doctrine a raison ici ; les trois cas précédents restent
  raturés. La prose ne nomme jamais le tiers (C-03), sur quatre occurrences.
- **A.3 (budget) — 12 % du plafond** : 0,062 USD, dont 0,061 de rédaction
  pour cinq sections (≈ 0,012 la section). Le plafond de 0,5 USD tient
  quarante sections.
- **B (échéance) — 72 %**, avec la rédaction (32 s) placée en dernier : sur
  un site à cinq sections, elle est le second poste après l'exploration.
- **Filtre destructif, canal URL** — première ligne à écrire : un motif de
  chemin (`remove`) vaut refus de visite. Sûr par construction, une page
  perdue sur vingt ici ; à surveiller sur les rangs 4 (des URL comme
  `/blog/remove-stains` seront refusées).
- **Protocole (brique 3) — 24/24 rejouables** : quand le rejeu marche, le
  pilier tient (0 écartée, 2 contre-épreuves menées). Ce scan est la
  preuve que C-09 est un défaut de recette, pas de protocole.
