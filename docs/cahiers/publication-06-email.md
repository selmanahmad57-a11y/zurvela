# PUBLICATION-06 — l'e-mail de livraison (le canal du scan lent)

*Sixième étape. Le scan dure 2-5 min ; l'e-mail est le canal qui livre le
rapport quand il est prêt, sans que le visiteur garde l'onglet ouvert. Construit
et prouvé AU BANC (Resend doublé, zéro mail réel, gratuit), puis validé par UN
seul vrai mail de bout en bout (le scan ~0,001 $, l'envoi Resend gratuit).*

Côté externe, prêt (confirmé par le propriétaire) : domaine `zurvela.com`
vérifié chez Resend (SPF/DKIM posés), clé API dans `docs/.env.local`
(`RESEND_API_KEY`, chargée par `--env-file-if-exists=docs/.env.local`, jamais
affichée).

## Brancher Resend — sans dépendance npm

Envoi = `POST https://api.resend.com/emails`, en-tête `Authorization: Bearer
<clé>`, corps JSON **structuré** `{from, to, subject, html}`. POST HTTPS direct
(`node:https`), **aucune dépendance npm** ajoutée — Resend est noté au commit
comme *dépendance de service externe* (§7), pas comme paquet. L'URL de
destination est une **constante** (api.resend.com) : le `to` que fournit le
visiteur n'est qu'une donnée du corps, jamais l'hôte appelé → pas de SSRF au
transport, donc pas d'épinglage ici (contrairement au GET de vérification, où
l'hôte EST l'entrée publique).

## Collecte minimisée + cycle de vie

- `email` est **optionnel** au `POST /scanner` (l'id seul reste un mode de
  livraison complet : e-mail et id **coexistent**). Collecté là, pas avant —
  au moment où on en a besoin.
- Stocké **transitoirement** sur l'entrée de scan (`EntreeScan.email`), le temps
  des 2-5 min.
- **Effacé après la tentative d'envoi — réussie OU échouée** (on retire le champ,
  on garde le `rapportHtml`). Moins de données au repos = moins à protéger. Sur
  scan échoué (pas de rapport) : rien à envoyer, l'e-mail est quand même effacé.

## Garde anti-injection du `to` (doublée)

Seul le `to` est une entrée publique (`from` = adresse fixe à nous, `subject` =
prose de `locales/`, `html` = le rapport, déjà sûr par construction étape 1).

- **Au bord d'entrée** (`POST /scanner`) : si un `email` est fourni, il est
  **validé avant tout stockage et toute réservation**. Invalide → `400`.
- **Au bord de sortie** (`envoyerCourriel`) : re-validé avant le POST. Invalide →
  pas d'envoi (le `poster` n'est jamais appelé). Défense en profondeur.

Le critère (universel, en code, pas de langue naturelle) : longueur plausible
(≤ 254, RFC 5321), **aucun caractère de contrôle** (`\r \n \t \0` … — tout
`charCode ≤ 0x20` et `0x7f`) ni espace, format `local@domaine.tld` (un seul `@`,
un point dans le domaine, pas en bord). Le `to` étant un champ JSON structuré,
l'injection d'en-tête SMTP classique n'est pas un vecteur via l'API Resend ; on
rejette quand même CR/LF — défense en profondeur.

## Plafond par destinataire (réputation du domaine)

Le destinataire est **non vérifié** : un visiteur peut faire envoyer un rapport à
n'importe quelle adresse. Le corps n'est pas du texte libre (c'est le rapport
d'un site qu'il a prouvé posséder), donc pas un relais de spam — mais un envoi
non sollicité engage la **réputation de `zurvela.com`**. Mitigation : un
**plafond par destinataire** (`parDestinataire`, défaut `3`/jour, en config),
même mécanisme que l'étape 5 — nouveau compteur `jourUTC|destinataire:<email>`,
**réservé dans le même bloc synchrone** que les plafonds de l'étape 5
(contrôler → réserver → enfiler, atomique). Atteint → `429` (`portee:
'destinataire'`) + `Retry-After`.

## L'envoi + l'échec

À la **fin du scan** (dans l'ordonnanceur, après l'état terminal et `surCout`) :
si un `email` est présent et qu'un rapport existe, envoi du `rapportHtml` via
Resend, expéditeur `rapport@zurvela.com` (en config), sujet depuis `locales/`.
Puis **effacement** de l'e-mail.

L'**échec d'envoi ne casse JAMAIS l'accès par id** : l'exception est avalée, le
rapport reste à `GET /statut/:id` (l'id est le filet). Mode dégradé (§4) : sans
`RESEND_API_KEY`, aucun `envoyer` n'est câblé — les scans tournent, la livraison
retombe sur l'id.

## Le témoin (banc, gratuit) et ses mutations

`courriel.test.ts` (validation + envoi doublé) + ajouts à `quota.test.ts`
(destinataire) et `serveur-scan.test.ts` (collecte, 400, 429-destinataire,
envoi, effacement, échec-n'affecte-pas-l'id). Resend doublé par un `poster`
injecté → zéro mail. Mutations tuées :

1. **sauter la validation du `to`** (bord d'entrée) → une requête avec `\r\n`
   dans l'e-mail passe (202/enfilée) au lieu de `400` → **rouge**.
2. **sauter la validation du `to`** (bord de sortie) → `envoyerCourriel` appelle
   `poster` avec un `to` à CR/LF → **rouge**.
3. **e-mail non effacé** après envoi → l'entrée garde `email` → **rouge**.
4. **sauter le plafond destinataire** → un destinataire au plafond passe quand
   même → **rouge**.
5. **échec d'envoi qui casse l'id** → une exception d'envoi laisse le scan
   inaccessible / sans rapport à `/statut/:id` → **rouge**.

## Validation réelle (après banc vert)

UN seul vrai mail, de bout en bout, vers **l'adresse du propriétaire** (son
choix, demandée avant l'envoi) : scan `zurvela.com` (chemin déjà prouvé sûr à
l'e2e, ~0,001 $) → envoi Resend réel → le propriétaire confirme : le mail
**arrive en boîte de réception (pas en spam)**, le **HTML s'affiche** dans un
vrai client mail, l'expéditeur est `rapport@zurvela.com`. Et : l'e-mail est bien
**effacé** après envoi, l'**id reste accessible** en parallèle. Clé Resend
vérifiée présente (jamais affichée) avant l'appel.

## Le rayon

`core/publication/courriel.ts` (`emailValide`, `envoyerCourriel`, `PosterHttps`,
`posterHttpsReel`) · `quota.ts` (`reserverScan` + `email`/`parDestinataire`,
`RaisonQuota += 'destinataire'`) · `serveur-scan.ts` (`EntreeScan.email`,
`demarrerScan` le stocke, `/scanner` valide+réserve+stocke, `creerOrdonnanceur`
envoie puis efface) · `demarrer-serveur.ts` (câblage Resend + locale + clé) ·
`config/publication.json` (`courriel{expediteur,delaiMs}`, `quota.parDestinataire`)
· `locales/fr.json` (`courriel.sujet`) · témoins + mutations.
