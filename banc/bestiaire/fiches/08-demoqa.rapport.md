# Rapport de vérification

`https://demoqa.com`

L'application fonctionne dans l'ensemble, mais un service externe qu'elle appelle échoue sur toutes les pages parcourues, ce qui mérite une vérification sans être bloquant.

### 1. Un service externe ne répond pas sur l'ensemble des pages

**Gravité** : Mineur · Fonctionnement
**Statut** : Constaté, puis reproduit lors d’une vérification indépendante.
**Pages concernées** : / — desktop, mobile · /elements — desktop, mobile · /forms — desktop, mobile · /alertsWindows — desktop, mobile · /widgets — desktop, mobile · /interaction — desktop, mobile · /books — desktop, mobile · /text-box — desktop, mobile · /checkbox — desktop, mobile · /radio-button — desktop, mobile · /webtables — desktop, mobile · /buttons — desktop, mobile · /links — desktop, mobile · /broken — desktop, mobile · /upload-download — desktop, mobile · /dynamic-properties — desktop, mobile · /automation-practice-form — desktop, mobile · /browser-windows — desktop, mobile · /alerts — desktop, mobile · /frames — desktop, mobile

**Ce que nous avons constaté** — L'application fait appel à un service hébergé ailleurs que sur votre site, et cet appel échoue. Nous l'avons constaté de façon constante sur toutes les pages parcourues, aussi bien sur ordinateur que sur mobile. Le reste des pages continue de s'afficher.

**Conséquence** — Tant que cet appel échoue, tout ce qui dépend de ce service extérieur reste indisponible ou incomplet pour vos visiteurs : selon son rôle, il peut s'agir d'un affichage annexe, d'une mesure d'audience ou d'une fonction secondaire qui ne se déclenche jamais. L'effet reste limité, mais il touche chaque page et chaque visiteur.

**Ce qu’il faut faire corriger** — Demandez à la personne qui entretient l'application d'identifier le service externe appelé sur toutes les pages et de vérifier s'il est toujours actif, correctement adressé et autorisé ; s'il n'est plus utile, il vaut mieux retirer l'appel que le laisser échouer.

## Notre méthode

Aucun signalement n’a été écarté par nos re-vérifications. 21 autres signalements n’ont pas pu être re-vérifiés et ne figurent pas dans ce rapport. Nous n’avons envoyé aucun formulaire de ce site : nos robots consultent vos pages sans rien y soumettre. Ce qui ne se constate qu’en envoyant un message — la réception d’une demande, la confirmation affichée — n’a donc pas été vérifié. Notre méthode consiste à tenter de reproduire chaque signalement avant de le publier : ceux que nous ne parvenons pas à retrouver sont écartés plutôt que rapportés dans le doute.

