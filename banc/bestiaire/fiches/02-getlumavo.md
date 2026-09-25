# Fiche 02 — getlumavo

| | |
|---|---|
| **date** | 2026-09-25, 12:31 (scan officiel) · 12:38 (instrument 02-bis) |
| **rang de cible** | 2 — site possédé par le propriétaire |
| **url** | `https://www.getlumavo.com` (racine ; `/login` visité sans jamais être franchi) |
| **version du moteur** | `f414fc9` |
| **config** | production — `soumission: aucune`, robots.txt respecté, 1 000 ms entre pages, budget 0,5 USD, échéance 300 s |
| **commande** | `node --env-file-if-exists=docs/.env.local --import tsx scripts/scan.ts https://www.getlumavo.com --config production --sortie banc/bestiaire/fiches/02-getlumavo.rapport.md` — *`pnpm scan` tel quel part sans clé (fiche 01, obs. 1) ; la clé est chargée par le mécanisme que le dépôt emploie déjà pour l'enregistrement, sans modification de code.* |

## Chiffres bruts (recopiés de la sortie de la commande)

| run | durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|---|
| **officiel** 12:31 | **275 767** | 0 | 40 | 3 | 3 |
| instrument 02-bis 12:38 (journal) | 229 188 | 0 | 40 | 3 | 2 |

*Les chiffres officiels de la fiche sont ceux du run 12:31. L'instrument est un
second scan identique (même moteur, même config, même cible) dont la seule
différence est d'ÉCRIRE le journal — `pnpm scan` ne le fait pas (fiche 01,
obs. 2). Il vit hors dépôt (scratchpad) ; son journal est conservé ici :
`02-getlumavo.journal.json`. L'écart entre les deux runs (3 vs 2 retenues,
276 vs 229 s) est l'intermittence réelle du site, pas celle du moteur.*

**Chronologie (instrument)** : exploration 153 s (desktop 76 s + mobile 76 s,
20 URL chacun, ≈ 3,8 s/URL délai de politesse compris) · confirmation 76 s
(6 rejeux de 6,6 à 23,8 s) · **arrêt `limite-pages`** : 20 URL sur les 125 du
sitemap (16 %), toutes en français — `/en`, `/es`, `/it` jamais atteintes.

## Rapport

Lu par : l'agent. Fichier : `02-getlumavo.rapport.md`.

Lisible par un non-technicien ? **partiellement** — rapport STRUCTUREL (voir
obs. 1) : trois sections sans titre ni explication, réduites à
« Performance · Important » et « Fonctionnement · Mineur ». Les faits sont
justes, la limite des formulaires est dite, mais un propriétaire ne saurait pas
quoi faire de « Fonctionnement · Mineur sur /login ». C'est le produit sans sa
rédaction, et ce n'est pas un choix de configuration : voir obs. 1.

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `comportement-inattendu` | **Le moteur de production n'a pas de client IA.** Clé présente (108 caractères, vue par node), budget posé (`ia.budget: 0.5`), et pourtant `ia.mode: degrade, raison: non-implemente`. Cause : `creerClientIa` (`core/ia/index.ts:329`) rend TOUJOURS le client sans capacité — avec clé, la raison est littéralement `non-implemente`. Le seul constructeur du vrai client Anthropic est `banc/ia.ts:111`, celui du banc. Depuis la brique 2, chaque appel réel est passé par le client injecté du banc ; l'assemblage produit (`creerScannerParDefaut` → `creerClientIa`) n'a jamais été câblé. Conséquence : en production, **ni profil, ni auto-diagnostic, ni rédaction** — le différenciateur n°3 est inaccessible. Coût 0 sur un site réel n'était pas une économie, c'était un silence. **Cahier correctif n°1, priorité absolue — non corrigé ici (règle d'or).** | journal : `ia.mode {degrade, non-implemente}`, `profilage.indisponible {non-implemente}`, `rapport.sans-prose {non-implemente}` · `core/ia/index.ts:329-336` |
| 2 | `faux-positif` | **`dependance-tierce-en-echec` sur `/login` : Google Sign-In (`accounts.google.com/gsi/client`) — `net::ERR_BLOCKED_BY_ORB`.** Ce n'est pas le tiers qui est en panne : c'est le navigateur qui bloque une réponse inter-origine dont le type ne correspond pas à un script — Google a servi autre chose que du JavaScript *à notre robot* (agent déclaré, aucun cookie). Pour un visiteur ordinaire, le bouton fonctionne très probablement. Reproduit ×2, donc CONFIRMÉ et publié — en mineur, tiers, jamais bloquant : la doctrine A.1 a limité le dégât, mais le rapport dit tout de même au propriétaire qu'un service qu'il paie est cassé. **Piste, pour un cahier** : `ERR_BLOCKED_BY_ORB` est un blocage CÔTÉ NAVIGATEUR, comme `ERR_ABORTED` — sa place est dans `erreursReseauIgnorees` ou dans une famille « blocages du navigateur ». **Tranché le jour même, sans le propriétaire** : `GET accounts.google.com/gsi/client` répond `403 text/html` (1 658 octets, une page HTML) à l'agent `ZurvelaBot`, et `200 application/javascript` (274 080 octets) à un navigateur ordinaire. Google refuse le robot déclaré ; la page HTML arrive là où un script était attendu ; Chromium la bloque (ORB). **La connexion Google fonctionne pour un vrai visiteur : faux positif pur**, causé par l'identité du robot — et l'identité déclarée n'est pas négociable (constitution §3). | journal : preuves `requete-echouee · script · interne false · net::ERR_BLOCKED_BY_ORB` (desktop + mobile) · verdict `confirmee/reproduite`, taux 1, conf 0,7 → 0,735 |
| 3 | `RAS` | **Lenteur du document `/` : 11,1 s en rejeu**, publiée `constatee-au-rejeu` (« non re-testé », conf 0,7). Réel : premières visites à 10,4–10,5 s (`/`, `/pricing`), puis 6,9–7,0 s aux rejeux — le profil d'un hébergement serverless qui démarre à froid. Le protocole a fait exactement son travail : les deux candidates initiales non reproduites sous le seuil de 8 s sont ÉCARTÉES (2 fausses alertes évitées), la lenteur vue pendant les rejeux est publiée comme découverte, sans sur-promettre. Pour le propriétaire, « votre accueil met parfois dix secondes » est une information vraie et actionnable. | journal : preuves `GET / · 200 · 11 110 ms · interne true` ; écartées `/pricing 10 499 ms`, `/ 10 355 ms (206)` ; découverte `reseau:GET:/ · nbMembres 2` |
| 4 | `comportement-inattendu` | **Les rejeux de lenteur ne rapportent aucune mesure** : sur les six `confirmation.tentative` des deux groupes `d-lenteur`, `mesure: null` — le verdict `jamais-reproduite` tombe par absence de mesure, pas par mesure sous le seuil. Ici le résultat est juste (les rejeux étaient bien sous 8 s) mais la RAISON du verdict ne l'est pas, et un site durablement lent pourrait ne jamais être confirmable par ce chemin. À examiner dans un cahier ; pas une correction à chaud. | journal : `confirmation.tentative reseau:GET:/pricing n°1/n°2 · mesure null` ; idem `/demo/showcase-2.mp4` (rejeux de 23,8 s et 22,4 s, verdict non reproduite) |
| 5 | `lenteur-outil` | **92 % de l'échéance consommés** (275,8 s / 300 s au run officiel ; 229 s à l'instrument). 20 URL × 2 viewports × (1 s de politesse + 2–3 s de chargement réel) ≈ 150 s d'exploration, puis 76 s de confirmation. Un site un peu plus lent, et les re-vérifications sont sacrifiées — le différenciateur n°1 vidé de sa substance au moment où il compte. | chronologie du journal : `exploration.fin +153,4 s`, `confirmation.fin +229,1 s` |
| 6 | `comportement-inattendu` | **Couverture : 16 % du site, une seule langue.** Le parcours en largeur sous budget de 20 pages a pris `/docs/*` et `/legal/*` (onze pages de documentation et de mentions légales) et n'a jamais atteint `/en`, `/es`, `/it`. Sur un site multilingue, la déterministe explore en profondeur là où elle est entrée. La politique IA (non mesurée ici, obs. 1) est précisément ce qui devait arbitrer. | `exploration.fin {arret: limite-pages, pages: 40}` ; 20 URL distinctes, toutes hors préfixe de langue ; sitemap : 125 URL |
| 7 | `RAS` | `robots.txt` lu (108 octets, `Allow: /`), aucun blocage anti-robot chez Vercel avec l'agent déclaré, aucune sortie de périmètre, aucun formulaire soumis, `/login` visité et jamais franchi. | journal : `politesse.robots {issue: lu}` ; aucun `exploration.robots.refus`, aucun `exploration.page.externe` |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **A.1 (origine) — confirmé, et pris en défaut le même jour.** La règle
  « une panne tierce n'est jamais imputée au site » a tenu : Google en échec est
  sorti mineur et tiers, pas bloquant. Mais elle a rencontré un cas qu'elle ne
  distingue pas : le tiers qui **répond mal au robot** (blocage ORB) et non le
  tiers **en panne**. Ligne à compléter : les blocages côté navigateur
  (`ERR_BLOCKED_BY_ORB`, et sans doute d'autres `ERR_BLOCKED_*`) ne sont pas
  des défaillances de dépendance.
- **A.2 (politesse) — confirmé** : robots.txt lu, délai respecté, aucun refus
  de Vercel.
- **A.3 (budget) — non éprouvé** : rien n'a été dépensé, faute de client (obs. 1).
- **B, « point de tension le plus net » — confirmé au premier site** : 92 % de
  l'échéance. `pagesMax: 20` et `delaiEntrePagesMs: 1000` contre `timeoutMs:
  300 000` ne laissent pas la marge d'un site lent. La ligne « politique complet
  pour le bestiaire » doit être relue avec ce chiffre.
- **B, `lenteur.seuilMs: 8000` — première donnée réelle** : ce site oscille
  entre 7 s et 11 s sur ses documents. Le seuil est posé pile dans sa zone
  d'incertitude ; ce n'est ni bon ni mauvais, c'est la première mesure.
- **Hypothèse `d-recouvrement` (bandeau de consentement) — sans objet** : le
  site n'en a pas. Toujours en tête de liste pour les rangs 3 et 4.
- **Hors inventaire, et plus grave que tout ce qu'il contient** : l'inventaire
  décrivait des valeurs calibrées pour le banc ; il n'a pas vu que le client IA
  de production n'existait pas. Un inventaire de configuration ne voit pas ce
  qu'aucune configuration ne gouverne (obs. 1).
