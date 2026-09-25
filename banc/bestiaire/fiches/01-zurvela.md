# Fiche 01 — zurvela

| | |
|---|---|
| **date** | 2026-09-25, 12:29 |
| **rang de cible** | 1 — le site du projet lui-même (dogfooding) |
| **url** | `https://zurvela.com` |
| **version du moteur** | `f414fc9` (= `5f655b4` + 6a + dette n°18) |
| **config** | production |
| **commande** | `pnpm scan https://zurvela.com --config production --sortie banc/bestiaire/fiches/01-zurvela.rapport.md` |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| 14 101 | 0 | 4 | 0 | 0 |

*« pages : 4 » = 2 pages (`/`, `/robot/`) × 2 viewports (desktop, mobile) — la
convention du banc, qui compte des visites et non des URL. À lire ainsi dans
toutes les fiches.*

**Candidates rejouables** : 0/0 — aucune candidate, rien à rejouer (mesure ajoutée rétroactivement le 2026-09-25, APPRENTISSAGES n°18).

## Rapport

Lu par : l'agent. Fichier : `01-zurvela.rapport.md`.

Lisible par un non-technicien ? **oui** — deux phrases : aucune anomalie
retenue, et la limite déclarée (aucun formulaire envoyé). Rapport STRUCTUREL :
sans clé API, aucune prose n'était possible — voir observation 1.

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `comportement-inattendu` | **La commande standard part sans clé API.** `pnpm scan` = `tsx scripts/scan.ts` : contrairement à `banc:enregistrer-ia`, le script npm ne charge pas `docs/.env.local`. Le scan tourne donc en mode dégradé — pas de profil, rapport structurel, coût 0 — alors que la configuration de production annonce un budget de 0,5 USD. Un scan réel « standard » ne mesure pas le produit, il mesure son mode sans clé. Outillage de campagne, pas moteur. | sortie : `coût API : 0` ; `printenv ANTHROPIC_API_KEY` vide ; `package.json:16` |
| 2 | `comportement-inattendu` | **`pnpm scan` n'émet aucun journal.** Il écrit le rapport rendu et imprime cinq chiffres ; le journal structuré du scan (décisions, robots.txt lu ou non, requêtes, échéance) n'est écrit nulle part. La colonne « preuve » de cette fiche ne peut donc pas citer le journal — elle cite la sortie console. Outillage de campagne. | `scripts/scan.ts` : aucune écriture de `rapport.journal` |
| 3 | `RAS` | Le site lui-même : 0 candidate, 0 retenue, 4 visites en 14 s derrière Cloudflare, aucun blocage anti-robot avec l'agent `ZurvelaBot`. | sortie de la commande ; `/` et `/robot/` en 200 |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **A.2 (robots.txt, piège du 404) — confirmé sur le réel** : `zurvela.com`
  n'a pas de `robots.txt` (404), et le scan rend **0 candidate**. La lecture
  hors du contexte observé a tenu : un `robots.txt` absent n'est pas devenu
  une anomalie `ressource-interne-404`. C'était le risque n°1 nommé en 6a (1/2).
- **A.1 (origine) — non éprouvé ici** : le site ne charge aucune ressource
  tierce en échec. Rien à confirmer, rien à raturer.
- **Cloudflare en frontal** : aucun blocage avec l'agent déclaré. Une donnée
  pour le rang 4.
- **Hypothèse `d-recouvrement` (bandeau de consentement) — sans objet** :
  le site n'en a pas. Reste en tête de liste pour la cible n°2.
