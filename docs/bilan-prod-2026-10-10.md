# Bilan — la traversée publique entière, validée en prod (2026-10-10)

*La preuve finale de l'étape 7 : non pas « le serveur tourne », mais la chaîne
ENTIÈRE exercée en une seule traversée, par le domaine public —
DNS → Caddy → app → proxy filtrant → scan → quota → e-mail → boîte de réception.
Un seul scan payant (0,001158 $) + un e-mail (gratuit). Cible : zurvela.com (à
nous). Mail : contact@zurvela.com.*

## Résultat mesuré — tout par `https://api.zurvela.com`

| Point de contrôle | Mesuré |
|---|---|
| `/verifier` → jeton | 200, origine `https://zurvela.com` |
| Dépôt du jeton AVANT le scan (constat CDN) | déposé puis déclenché |
| `/scanner` (avec e-mail) | **202**, scanId `cicFpbp_…7-k` (43 car.) |
| Progression des statuts (file réelle) | `en-cours` (t=2 s) → `termine` (t=19 s) |
| Coût réel | **0,001158 $** |
| Imputation au quota DUR (avant/après) | avant : aucun fichier (0/0/0) → après : `global=1`, `origine:https://zurvela.com=1`, `destinataire:contact@zurvela.com=1`, `depense=0,001158` |
| **Transit par le proxy filtrant** (OS-level) | Chromium (`chrome-headless`) → **uniquement** `127.0.0.1:45279` ; **0** sortie directe ; le node/proxy relaie vers `104.21.76.250` (zurvela.com / Cloudflare). **Garde SSRF active, non contournée.** |
| Minimisation e-mail | entrée du scan = `[scanId, origine, etat, creeLe, rapportHtml]` → **clé `email` ABSENTE (effacée)**, rapport conservé |
| Livraison (confirmée par le propriétaire) | **boîte de réception** (pas spam), sujet « Votre rapport Zurvela — https://zurvela.com », expéditeur **rapport@zurvela.com**, **HTML lisible** |
| Verdict du rapport | « Aucune anomalie n'a été retenue à l'issue de nos vérifications. » — cohérent démo/local |
| IDOR (chemin public) | voisin **404**, exact **200** |

## Écarts honnêtes (non lissés) vs le local

- **`en-attente` non capté** : le premier sondage (t=2 s) voyait déjà `en-cours`
  (l'attente fut plus brève que le pas de 2 s). La file a traité le scan
  (`en-cours → termine`, 17 s) — pas un court-circuit, mais l'état d'attente n'a
  pas été *observé*, donc pas affirmé.
- **Egress direct de nos API maison** : le node a aussi ouvert des `:443` vers
  l'API Anthropic (diagnostic/rapport) et Resend (l'e-mail). Ils sortent **en
  direct, PAS par le proxy filtrant** — correct PAR CONCEPTION : le proxy garde
  l'egress du **navigateur de scan** (contenu non fiable), pas nos appels de
  confiance. Noté pour qu'on ne le prenne pas pour une fuite.
- **Caddy transparent** : POST + JSON traversent proprement, aucune réécriture
  d'en-tête gênante, HTTP→HTTPS en 308. Coût et durée cohérents avec le local.

## Verdict

La traversée publique entière tient en conditions réelles. Les gardes prouvées
au banc (propriété, proxy SSRF, quota, minimisation e-mail, IDOR) tiennent sur
le chemin de prod, et la livraison arrive en boîte de réception. **L'étape 7 —
et toute la chaîne de publication (étapes 1-7) — est validée de bout en bout en
production.** Reste l'interface marchande (hors étape 7) : coller une URL,
guider dépôt-puis-scan, brancher les routes (backlog : jeton frais anti-cache
CDN). Instruments au scratchpad (non committés) ; aucune donnée réelle ne
subsiste (jeton supprimé, e-mail effacé).
