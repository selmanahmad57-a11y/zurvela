# Fiche 04 — cutlybook

| | |
|---|---|
| **date** | 2026-09-25, 15:03 → 15:06 |
| **rang de cible** | 2 — site possédé par le propriétaire |
| **url** | `https://cutlybook.com` (canonique selon `robots.txt` ; `www` répond aussi ; Cutly, plateforme de réservation pour salons de coiffure, `lang="fr"`, 13 URL au sitemap) |
| **version du moteur** | `8b209a2` — code moteur inchangé depuis `7f6aa1c` (les deux commits intermédiaires sont des fiches et un cahier) |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté, 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, client IA actif |
| **commande** | `pnpm scan https://cutlybook.com --config production --sortie banc/bestiaire/fiches/04-cutlybook.rapport.md --journal banc/bestiaire/fiches/04-cutlybook.journal.json` |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **170 277** | **0,001908** | 26 | 8 | **0** |

`mode IA : actif`. Coût : profilage 0,0019 · rédaction 0 (rien à rédiger).

**Chronologie (journal)** : profilage +6,1 → +7,9 s · exploration desktop 54 s,
mobile 48 s → +103,3 s · confirmation 67 s → +170,2 s · rapport sans section
+170,3 s. **57 % de l'échéance.** Arrêt **`complet`** : 13 URL (12 des 13 du
sitemap + `/poster`, liée ; `/delete-account` jamais liée), 26 visites, sous
le budget de 20 pages. `/reset-password` **refusée par robots.txt** (×2, une
par viewport). Trois formulaires remplis (`/login`, `/register`, `/support`),
aucun soumis.

**Candidates rejouables** : **0/8** (0/5 groupes, 0 tentative exploitable sur 10 — `selecteur-introuvable`, C-09) (mesure ajoutée rétroactivement le 2026-09-25, APPRENTISSAGES n°18).

## Rapport

Lu par : l'agent. Fichier : `04-cutlybook.rapport.md`.

Lisible par un non-technicien ? **oui** — deux phrases : « Aucune anomalie n'a
été retenue », puis « 5 autres signalements n'ont pas pu être re-vérifiés et
ne figurent pas dans ce rapport ». Honnête ; opaque (obs. 4). Et propre par
accident (obs. 1 et 2).

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `comportement-inattendu` | **Le protocole n'a pu rejouer AUCUNE candidate : 10 tentatives, 10 `selecteur-introuvable`, 5 groupes `limite-automatisation / rejeu-impossible`.** Mécanisme, lu dans le code et non corrigé : `actionsPrealablesDe` (`core/scanner/detection/commun.ts`) garde comme préalables les actions de la MÊME page que l'action déclenchante. Quand l'action déclenchante est une **navigation** (a8 : `/register` → `/poster`), les préalables sont ceux de la page d'ORIGINE (a7 : `remplir` le formulaire d'inscription, sélecteurs `body > div:nth-of-type(2) > … > form`), alors que la recette s'ouvre sur la page d'ARRIVÉE (`reproduction.url = /poster`, `reexecuteur.ts` : « 1. ouvrir l'url, 2. rejouer les préalables, 3. l'action »). On cherche donc le formulaire d'inscription sur la page de l'affiche. Idem pour les quatre pages de salon, atteintes depuis `/support` après remplissage du formulaire de support. **Toute candidate observée sur une page atteinte juste après un remplissage est irréjouable.** Sur getlumavo (fiches 02, 03) le rejeu marchait parce qu'aucun remplissage ne précédait la navigation vers `/login`. Sur un site avec formulaire de connexion, d'inscription ou de contact — presque tous —, la déterministe remplit puis navigue : **le pilier n°1 est aveugle sur la page suivante.** Carnet C-09. | journal : `rejeu.debut {url: /poster, nbPrealables: 1, action: naviguer}` → `rejeu.action r1 naviguer ok` → `rejeu.echec {erreur: selecteur-introuvable, cause: outil}` ×10 · verdicts `limite-automatisation / rejeu-impossible` ×5 · candidate : `reproduction.url = /poster`, `action.page = /register`, `actionsPrealables[0] = remplir sur /register` |
| 2 | `comportement-inattendu` | **8 candidates, 8 probables faux positifs, tous tiers.** Quatre polices Google Fonts (`fonts.gstatic.com/s/inter/v20/*.ttf`, page `/poster` « Affiche Premium Salon », `net::ERR_FAILED`, desktop + mobile) et quatre balises de télémétrie Stripe (`POST m.stripe.com/6`, les quatre pages de salon, `net::ERR_FAILED`). Ni l'un ni l'autre ne refuse le robot : les deux répondent **200 à `ZurvelaBot`** (police `font/ttf` avec `access-control-allow-origin: *` ; Stripe `application/json`). `ERR_FAILED` est un échec CÔTÉ CLIENT — police préchargée dont le mode de crédentials ne correspond pas, balise anti-fraude Stripe en navigateur automatisé — invisible au visiteur : une police de repli, une balise ignorée. Le moteur n'intercepte rien lui-même (aucun `route`/`abort` dans `core/scanner`) ; seul `ERR_ABORTED` est ignoré par config. **Si les rejeux avaient marché, ces huit candidates auraient été « confirmées ×2 » et publiées tiers-mineur comme Google Sign-In : cinq sections de plus à faire corriger pour rien.** Le rapport est propre par accident : le défaut de l'obs. 1 a masqué celui-ci — deuxième fois en deux fiches que le silence donne le bon résultat pour une mauvaise raison (fiche 03, C-04). Carnet C-05, élargi. | journal : 8 preuves `requete-echouee · net::ERR_FAILED · interne false · cadrePrincipal false` (4 `font`, 4 `xhr`) · `curl -A ZurvelaBot` sur la police : `HTTP/2 200, content-type: font/ttf, access-control-allow-origin: *` ; sur `m.stripe.com/6` : `HTTP 200 application/json` · `config/production.json` `erreursReseauIgnorees: ["net::ERR_ABORTED"]` |
| 3 | `RAS` | Couverture complète et politesse tenue : 13 URL, arrêt `complet` sous le budget, 57 % de l'échéance ; `/reset-password` refusée par robots.txt (premier refus réel de la campagne) ; trois formulaires remplis, aucun soumis, avec les valeurs marquées `test@zurvela-scan.invalid` / `Zurvela scan test` (constitution §3) ; aucune lenteur (0 candidate `d-lenteur`, TTFB 0,37 s au navigateur) ; profil `reservation` · `fr` · 0,95 : juste ; budget 0,4 % du plafond. | journal : `exploration.fin {arret: complet, pages: 26}`, `exploration.robots.refus {url: /reset-password}` ×2, actions `remplir/ok` ×6, `profilage.fin {typeSite: reservation, langue: fr, confiance: 0.95}` |
| 4 | `comportement-inattendu` | **Un silence honnête, mais sans adresse** : « 5 autres signalements n'ont pas pu être re-vérifiés et ne figurent pas dans ce rapport ». Vrai, et c'est la doctrine — ce qui n'est pas vérifié n'est pas publié. Mais le propriétaire ne sait ni quoi, ni où, ni si cela le concerne ; ici c'étaient des polices et une balise, il aurait été rassuré de le savoir. La phrase laisse une question sans réponse dans le seul rapport qu'il lira. Le jour où le rejeu marche (C-09), elle disparaît ; en attendant, elle est tout ce que le client voit. | rapport, « Notre méthode » · `rapportBusiness {nbNonVerifies: 5, nbEcartes: 0}` |
| 5 | `RAS` | Diagnostic IA (4c) non sollicité : les échecs de rejeu sont `causeEchec: outil` (déterminé) et le diagnostic ne traite que l'`indetermine` — conforme à sa définition ; il n'aurait rien pu dire d'utile sur un sélecteur introuvable. Rédaction : 0 appel, rien à rédiger (comme fiche 01). | journal : `confirmation.tentative {echecOutillage: true, causeEchec: outil}` ×10 ; aucun événement `diagnostic.*` ; `rapport.sans-section` |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **A.1 (origine tierce) — à réécrire.** Trois familles de tiers « en échec »
  pour le robot et pas pour le visiteur, en trois fiches : Google Sign-In
  (ORB, fiches 02–03), polices Google Fonts (`ERR_FAILED`, ici), balise
  Stripe (`ERR_FAILED`, ici). La ligne doit dire que ce qui compte est
  l'EFFET VISIBLE : une police, une balise, un analytics qui échouent ne sont
  pas une anomalie du site — ou le sont à confiance minorée, jamais « établie ».
- **A.2 (politesse) — confirmé, avec le premier refus robots.txt réel** :
  `/reset-password` interdite, jamais visitée.
- **A.3 (budget) — 0,4 % du plafond** : sans anomalie retenue, un scan coûte
  le profil, 0,002 USD.
- **B (échéance) — 57 %** : un site de 13 pages tient largement. La marge
  vient du site, pas de nous.
- **Protocole (brique 3) — la ligne « politique complet, 2 rejeux » ne suffit
  plus.** Il manque une métrique de scan : **le taux de candidates
  réjouables** — ici 0 sur 8. Un pilier qui ne peut pas rejouer ne protège
  pas (C-04 pour la lenteur, C-09 pour la navigation après remplissage) ;
  tant que ce taux n'est pas publié, un rapport vide ne distingue pas « rien
  à signaler » de « rien n'a pu être vérifié ». Le rapport le dit en une
  phrase ; la scorecard et le journal doivent le compter.
