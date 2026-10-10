# PUBLICATION-05 — le quota dur (le filet anti-facture)

*Cinquième étape de la publication. Même avec preuve de propriété (étape 3) et
proxy filtrant (étape 4), un visiteur — ou plusieurs — pourrait lancer assez de
scans pour vider le budget. Le quota est le plafond DUR qui garantit que ça ne
peut pas arriver. Construit et prouvé AU BANC (gratuit, compteurs simulés) —
aucun scan payant pour cette étape.*

## Double plafond — le point clé

Le NOMBRE ne borne pas la DÉPENSE (un scan de site lourd coûte plus qu'un léger).
Donc deux plafonds, aux deux bouts :

- **Nombre, AVANT d'enfiler** : global `50`/jour (tous demandeurs) + par origine
  `3`/jour. Barre avant.
- **Dépense cumulée** : vérifiée AVANT d'enfiler sur le cumul du jour, **alimentée
  APRÈS chaque scan** par son coût réel (`rapport.coutApi`, même sur échec — des
  appels IA ont pu être payés). Plafond `5 $`/jour. Barre après — **le vrai
  filet** : un pic de sites lourds ne surprend pas le budget.

## L'ordre : contrôler → réserver → enfiler (synchrone)

Dans `/scanner`, APRÈS vérification réussie, un bloc **sans `await` au milieu** :
`reserverScan` vérifie les trois plafonds, et s'ils passent **incrémente le
nombre** (global + origine) — la réservation — PUIS on enfile. Incrémenter AVANT
d'enfiler, dans le même bloc synchrone, ferme la **fenêtre de course** : le
serveur est mono-processus et les ops du stock sont synchrones, donc la
réservation est atomique vis-à-vis des autres requêtes. Deux requêtes
quasi-simultanées ne peuvent pas réserver la même dernière place. (Sur-comptage
conservateur si l'enfilement échouait après : un scan compté non fait < un scan
fait non compté. Multi-processus = verrou à ajouter, noté.)

## État et reset

`TableJson<number>` de l'étape 4 (écriture atomique temp + `rename`). Clé
`jourUTC|portée` (`global`, `origine:<url>`, `depense`) → **reset quotidien
IMPLICITE** : les clés d'hier sont mortes. Jour en **UTC** (sans ambiguïté).

## Garde cardinale

Plafonds DURS, lus de l'état serveur, non contournables par le client. Atteint →
le scan ne part pas : `/scanner` rend **429** (`portee` = global/origine/depense)
avec un en-tête **`Retry-After`** jusqu'au reset UTC.

## Clé par demandeur : l'origine prouvée

Par **origine** (déjà prouvée, non usurpable — on limite les scans d'un SITE).
L'IP source est écartée (usurpable derrière un proxy/CDN via X-Forwarded-For).
L'e-mail n'existe pas encore (étape 6).

## Le témoin (banc, gratuit) et ses mutations

`quota.test.ts` (compteurs mémoire) + tests d'intégration dans `serveur-scan.test.ts`.
Sens : global atteint → 429 même avec preuve valide ; par-origine atteint → 429
pour cette origine, une autre passe ; dépense atteinte → 429 quel que soit le
nombre ; jour avancé → compteurs repartent ; 429 porte `Retry-After` ; **deux
`/scanner` CONCURRENTS à la dernière place → une seule passe (202), l'autre 429**.
Mutations tuées : sauter le plafond dépense → rouge ; sauter global → rouge ;
sauter par-origine → rouge ; clé sans le jour (pas de reset) → rouge ; réservation
non-atomique (check-only) → la course passe des deux → rouge.

## Le rayon

`core/publication/quota.ts` (`reserverScan`, `enregistrerDepense`, `jourUtc`,
`msJusquaResetUtc`) · `serveur-scan.ts` (route `/scanner` : réservation synchrone
+ 429 ; `ExecuterScan` porte le `cout` ; `creerOrdonnanceur` a `surCout` →
dépense) · `stock-fichier.ts` (`stockQuotaFichier`) · `demarrer-serveur.ts`
(câblage) · `config/publication.json` (bloc `quota` : 50 / 3 / 5 $, en config,
pas en dur) · témoins + mutations · suite 1866.
