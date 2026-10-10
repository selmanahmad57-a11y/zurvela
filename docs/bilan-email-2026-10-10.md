# Bilan — l'e-mail de livraison, validé en conditions réelles (2026-10-10)

*L'équivalent e2e pour la LIVRAISON. But : prouver qu'un vrai rapport arrive
réellement dans une boîte (pas en spam), avec le domaine vérifié chez Resend.
Chaîne complète en réel : scan `zurvela.com` DERRIÈRE le proxy (~0,001 $) →
envoi Resend réel → réception confirmée par le propriétaire. UN seul mail.*

## Résultat mesuré (instrument au scratchpad)

| Point | Attendu | Mesuré en réel |
|---|---|---|
| `/scanner` avec e-mail | 202 | **202** ✓ |
| e-mail stocké transitoirement (avant envoi) | présent | **`contact@zurvela.com`** ✓ |
| scan transite par le proxy (garde cardinale étape 4) | relais = cible | **true** ✓ |
| état final | terminé | **termine** ✓ |
| **envoi Resend réel** | 2xx | **`{ ok: true, statut: 200 }`** ✓ |
| e-mail **effacé** après envoi (minimisation) | effacé | **true** ✓ |
| l'**id reste le filet** (`/statut/:id` en parallèle) | 200 + rapport | **200**, 1402 o ✓ |
| coût réel | ~0,001 $ acté | **0,001158 $** ✓ |
| nettoyage du jeton | retiré | **supprimé (404)** ✓ |

## Confirmé par le propriétaire (ce qu'aucun code ne peut mesurer)

- Le mail **arrive en BOÎTE DE RÉCEPTION** (pas en spam) — délivrabilité réelle,
  SPF/DKIM du domaine vérifié tiennent.
- Le **HTML s'affiche correctement** dans un vrai client mail (le rendu de
  l'étape 1 — tableau 600px, CSS inline, zéro script — tient en boîte).
- L'**expéditeur est `rapport@zurvela.com`**.

« Accepté par Resend (200) » ≠ « arrivé en boîte » : le 200 ne prouvait que
l'acceptation. La réception, le pas-spam et le rendu sont des constats humains —
c'est le propriétaire qui les a faits.

## Bémol honnête + pistes de durcissement

`contact@` et `rapport@` sont sur le **même domaine** : test réel de
SPF/DKIM/rendu, mais un peu plus clément qu'un fournisseur externe côté
filtrage spam. Un envoi vers une boîte externe (Gmail/Outlook) durcirait la
preuve de délivrabilité — à faire si besoin, pas bloquant.

Refinement noté (pas une dette de sécurité) : le **sujet** est dans la langue
de livraison par défaut (`fr`, alignée sur le défaut du rendu) ; le CORPS du
rapport est déjà localisé par `rendu-html`. Faire suivre la langue du sujet à
celle du rapport quand le multi-langue de livraison arrivera.

## Verdict

La livraison e-mail tient en conditions réelles : le rapport part à la fin du
scan, arrive en boîte de réception avec le bon expéditeur et un HTML lisible,
l'e-mail est effacé après envoi (minimisation prouvée), et l'id reste le filet
accessible en parallèle. **L'étape 6 est validée de bout en bout.** Reste
l'étape 7 (hébergement). Instrument e2e au scratchpad (non committé : validation
ponctuelle, pas construction) ; aucune donnée réelle (jeton, e-mail) ne subsiste
(jeton supprimé, e-mail effacé).
