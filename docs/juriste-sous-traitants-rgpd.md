# Brief juriste — sous-traitants & transferts hors UE (RGPD)

Document de préparation pour le conseil juridique, avant publication de la
politique de confidentialité (`deploiement/confidentialite/index.html`). But :
poser la question précisément pour qu'il tranche vite. **Rien ici n'est garanti
— tout est à confirmer, notamment au registre `dataprivacyframework.gov` à la
date de publication.** (Rédigé le 2026-10-25.)

## Contexte produit

Zurvela vérifie un site web **à la demande de son propriétaire** (preuve de
propriété obligatoire avant tout scan) et lui envoie un rapport par e-mail.
Modèle **transactionnel**, pas de prospection à froid aujourd'hui. Données
traitées : adresse e-mail du demandeur, URL du site (public), résultats du scan,
IP/logs serveur. **L'e-mail est supprimé dès l'envoi du rapport.**

## Les trois sous-traitants situés aux États-Unis

| Sous-traitant | Ce qu'il reçoit exactement | Rôle | Base de transfert proposée |
|---|---|---|---|
| **Anthropic, PBC** | **Le contenu des pages analysées** (HTML + textes du site scanné) | Analyse automatisée par modèle d'IA (produit le diagnostic) | **Clauses contractuelles types** (modules 2/3 de la DPA Anthropic) ; participation DPF annoncée par des tiers, **à vérifier au registre** |
| **Resend** | **L'adresse e-mail du demandeur** (uniquement, le temps de l'envoi) | Envoi de l'e-mail de rapport | **Data Privacy Framework UE–US** (certification annoncée mars 2025, à confirmer au registre) |
| **Cloudflare** | **DNS + trafic réseau** (dont IP des visiteurs) | DNS, proxy, protection réseau | **Data Privacy Framework UE–US**, repli clauses contractuelles types (Cloudflare l'annonce lui-même) |

Sous-traitants **dans l'UE** (pas de transfert hors UE) : **Hetzner** (Allemagne,
hébergement app/scanner), **OVHcloud** (France, vitrine).

## Le point le plus sensible : Anthropic

C'est le transfert le moins évident pour un marchand et le plus important à
nommer honnêtement : **le contenu des pages du marchand part vers un modèle
hébergé aux États-Unis.** La politique de confidentialité le dit en clair (pas
noyé dans une liste), avec la précision que ce contenu n'entraîne pas de modèles
et que le site est public par nature. À valider : cette formulation suffit-elle,
ou faut-il un consentement explicite distinct au moment de la saisie ?

## Questions à trancher

1. **Base de transfert par sous-traitant** : DPF, CCT, ou les deux ? Vérifier le
   statut de chaque certification au registre DPF à la date de publication.
2. **Anthropic** : la mention « contenu des pages → modèle US » dans la politique
   suffit-elle, ou faut-il un point de consentement dédié à la saisie de l'URL ?
3. **Mentions légales** : forme juridique, SIREN, directeur de publication,
   adresse — dépendent du Kbis (champs `[À COMPLÉTER]` dans les pages).
4. **Durées de conservation** : fixer les durées (URL + résultats ; logs/IP) —
   champs `[À COMPLÉTER]`.
5. **Cookies** : confirmer l'absence de traceur (seuls d'éventuels cookies
   strictement nécessaires).
6. **Scan non sollicité** (hors périmètre actuel) : si un jour Zurvela scanne de
   sa propre initiative et envoie à froid, cela devient de la prospection
   (désinscription obligatoire, risque de plaintes). À border **avant** tout
   envoi non sollicité — ne pas franchir sans avis.

## Argument de minimisation (vrai, à faire valoir)

- E-mail **effacé après l'envoi** — aucune conservation.
- Site scanné **public** — aucun accès à une zone connectée ni à un compte.
- **Aucun compte créé, aucun profil** publicitaire ou comportemental.
- Aucune revente, aucun entraînement d'IA avec le contenu analysé.

Ces faits réduisent l'exposition réelle et sont vérifiables dans le code —
ils tiennent face au juriste comme face au marchand.
