# PUBLICATION-07 — les webhooks Resend (la boucle de retour)

*Septième étape, volet délivrabilité. L'envoi (étape 6) part « en aveugle » :
Resend accepte le mail, puis la vraie issue — livré, rejeté (bounce), signalé
comme indésirable (plainte), retardé — n'arrive qu'après, par WEBHOOK. Ce volet
reçoit ces événements, les authentifie, les dé-doublonne, en tient des compteurs
glissants et CRIE quand la réputation se dégrade. Construit et prouvé AU BANC
(zéro webhook réel), validable par UN vrai événement signé via les adresses de
test Resend (~0,001 $).*

Resend signe ses webhooks au format **Svix** (HMAC-SHA256). Le secret n'est pas
dans le dépôt : variable `RESEND_WEBHOOK_SECRET`, posée côté serveur.

## Garde n°1 — authenticité (sans elle, tout le reste ment)

Le corps d'un POST webhook est une **donnée non fiable** (§3) jusqu'à preuve de
signature. Sans vérification, un tiers fabriquerait de fausses plaintes/bounces
et empoisonnerait compteurs et alertes. `signatureSvixValide` : HMAC-SHA256 de
`${svix-id}.${svix-timestamp}.${corps}` avec la clé du secret (`whsec_<base64>`),
comparé en **temps constant** à chaque signature `v1,…` de l'en-tête (plusieurs
possibles en rotation de clé). Prouvée par le **vecteur de test officiel Svix**
(accord exact avec l'implémentation réelle) + un round-trip.

## Fail-closed = FERMÉ, pas « ouvert » (l'inverse d'un client)

Pour un CLIENT (Anthropic, `RESEND_API_KEY`), mode dégradé = *on n'appelle pas le
service*, et c'est sûr. Pour un RÉCEPTEUR de webhook, c'est l'inverse : « dégradé
= accepter sans vérifier » rouvrirait exactement le trou que Svix ferme. Donc
**sans secret (ou secret vide, ou un des trois réglages absents, ou corps trop
gros) → 401, rien enregistré.** Absence de config = fermé, même régime que le
proxy d'egress. La route reste **montée** (elle atteint Node et répond 401) — ne
pas la monter rendrait un 404 statique indistinguable de « non routé ».

## Machine-à-machine — n'hérite rien du monde marchand

`POST /webhook/resend` ne passe NI par `peutScanner`, NI par le quota, NI par la
discrimination d'échec, NI par le dispatch client. Deux conséquences portées par
le code :

- **Ordre impératif** : lire le brut → vérifier la signature → *puis* parser. Le
  corps est vérifié sur les **octets reçus** (lecteur `lireCorpsBrut`, qui ne
  parse rien), pas sur un JSON re-sérialisé — sinon la signature ne collerait pas.
- **Répondre 2xx vite** : Svix retente sur non-2xx et sur timeout. Un `throw` du
  store → la coquille fail-closed du serveur fait un **500 propre** → Svix
  retente → l'**idempotence** absorbe la redelivery (pas de double comptage).

## Idempotence + compteurs (durables)

Journal durable en un JSON atomique (`webhooks.json`, motif `TableJson`) :
**svix-id vus** (idempotence) + **fenêtre d'événements** `{type, creeLe}`. Les
deux listes sont élaguées par `fenetreMs`. Ce `fenetreMs` est en config (réglage,
défaut 7 j) MAIS **borné en bas par le schéma** (`minimum` 2 j) : l'idempotence
doit rester ≥ l'horizon de retry de Svix, sinon une redelivery tardive serait
recomptée — invariant rendu **infranchissable** par le schéma, pas seulement
documenté (le témoin `config-publication.test.ts` le prouve).

On n'extrait du corps que `type` et `data.email_id` (l'id **opaque** Resend),
**jamais `data.to`** (l'adresse du marchand — minimisation, §3). Les alertes
(`console.error [webhook-resend]`) ne portent que l'`email_id`.

## Les alertes — plaintes toujours, bounces avec PLANCHER

- **Plainte** : toute plainte alerte. Une plainte est grave EN SOI et
  **sous-rapportée** — des fournisseurs (p. ex. Gmail) ne renvoient PAS de
  `complained` à Resend. Donc une qui ARRIVE est un signal fort, et « zéro
  plainte » au compteur ne veut PAS dire zéro plainte dans la réalité, seulement
  zéro chez les fournisseurs qui les remontent. **Ne jamais lire ce silence comme
  un feu vert** (inscrit dans le commentaire du code pour le futur-nous).
- **Taux de bounce** : alerte si `bounces ≥ plancher absolu` **ET** `taux > seuil`.
  À bas volume, le pourcentage seul est inutilisable (1 faute de frappe = 100 %
  sur 1 envoi) — d'où le plancher. Réglages en config (`tauxBounceMax` 2 %,
  `bounceMinAbsolu` 3).

Rappel porté par le code : ces compteurs mesurent des **événements REÇUS**, pas
la réalité complète.

## Les témoins (banc, gratuits) et leurs mutations

`webhook-resend.test.ts` (23) : vecteur officiel + round-trip + rejets ;
`analyser` (4 types, null sur inconnu/malformé) ; `alertesWebhook` (plainte
toujours ; bounce sous plancher → rien ; plancher+taux → alerte ; plancher mais
taux noyé → rien ; delivered → rien) ; `traiter` (sans secret → 401/rien ;
signature forgée → 401/store intact ; delivered → 200/enregistré ; redelivery →
200/pas recompté ; plainte → alerte ; type non géré → 200/rien). Mutations tuées :
sauter la vérif avant parse (store touché sur sig forgée), retirer le `dejaVu`
(redelivery recomptée), retirer le plancher (alerte à 1 bounce), retirer le taux
(alerte même noyé). `serveur-scan.test.ts` (route, VRAI serveur, corps brut
EXACT) : non configuré → 401 **qui atteint Node** (pas 404 statique) ; signature
forgée → 401/store intact ; signature valide sur le brut → 200/enregistré (preuve
de bout en bout du corps brut) ; plainte → cri opérateur avec `email_id`, **pas**
l'adresse (§3). `config-publication.test.ts` : synchro json↔schéma + plancher de
fenêtre imposé. `routes-api.test.ts` garde la synchro `/webhook/resend` ↔ Caddy.

## Déploiement + validation réelle

Nouveau nom dans le routage → passe par la **sonde + rollback** de
`deployer-caddy.sh`, qui teste aussi `/webhook/resend` : un POST sans signature
valide → **Node rejette (401)**, pas un 404 statique — prouve le routage ET le
fail-closed d'un coup. Côté propriétaire, après déploiement : déclarer l'URL
`https://app.zurvela.com/webhook/resend` dans Resend, récupérer le secret, le
poser dans `/etc/zurvela/zurvela.env` (`RESEND_WEBHOOK_SECRET`, jamais dans le
dépôt), redémarrer. Preuve de bout en bout : un scan avec `complained@resend.dev`
(adresse de test Resend) → **vrai webhook signé par Resend**, sans toucher un
vrai fournisseur (~0,001 $).

## Le rayon

`core/publication/webhook-resend.ts` (`signatureSvixValide`,
`analyserEvenementResend`, `alertesWebhook`, `traiterWebhookResend`, `StockWebhook`)
· `stock-fichier.ts` (`stockWebhookFichier` + `ecrireJsonAtomique` extrait, 2e
usage) · `serveur-scan.ts` (route `/webhook/resend`, `lireCorpsBrut`,
`enTeteTexte`, deps webhook) · `demarrer-serveur.ts` (câblage secret + stock +
seuils) · `routes-api.ts` + `Caddyfile` (`/webhook/resend`) · `deployer-caddy.sh`
(sonde) · `config/publication.json` + schéma (`webhook{fenetreMs, tauxBounceMax,
bounceMinAbsolu}`) · témoins + mutations.
