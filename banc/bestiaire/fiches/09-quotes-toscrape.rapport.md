# Rapport de vérification

`https://quotes.toscrape.com`

Le site souffre d'un blocage confirmé à l'usage sur mobile depuis la page d'accueil, auquel s'ajoutent des défaillances de services externes qui touchent de nombreuses pages sans empêcher la lecture.

### 1. Sur téléphone, les clics sur la page d'accueil n'aboutissent pas

**Gravité** : Bloquant · Mobile
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : / — mobile

**Ce que nous avons constaté** — Sur la page d'accueil consultée depuis un mobile, un élément invisible se superpose à la zone cliquable et intercepte le geste du visiteur. Le clic est bien effectué, mais il n'atteint pas le lien ou le bouton visé.

**Conséquence** — Tant que ce défaut persiste, un lecteur arrivant sur l'accueil depuis son téléphone peut se retrouver bloqué dès le premier geste, sans comprendre pourquoi rien ne se passe, et quitter le site sans accéder aux articles.

**Ce qu’il faut faire corriger** — Faire examiner la page d'accueil en affichage mobile pour identifier le calque ou l'élément superposé qui capte les clics : bandeau, fenêtre de consentement, menu ou visuel resté actif au-dessus du contenu.

### 2. Un service externe ne répond pas sur une grande partie du site

**Gravité** : Mineur · Fonctionnement
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : / — desktop, mobile · /login — desktop, mobile · /tag/change/page/1/ — desktop, mobile · /tag/deep-thoughts/page/1/ — desktop, mobile · /tag/thinking/page/1/ — desktop, mobile · /tag/world/page/1/ — desktop, mobile · /tag/abilities/page/1/ — desktop, mobile · /tag/choices/page/1/ — desktop, mobile · /tag/inspirational/page/1/ — desktop, mobile · /tag/life/page/1/ — desktop, mobile · /tag/live/page/1/ — desktop, mobile · /tag/miracle/page/1/ — desktop, mobile · /tag/miracles/page/1/ — desktop, mobile · /tag/aliteracy/page/1/ — desktop, mobile · /tag/books/page/1/ — desktop, mobile · /tag/classic/page/1/ — desktop, mobile · /tag/humor/page/1/ — desktop, mobile

**Ce que nous avons constaté** — Sur la page d'accueil, la page de connexion et plusieurs pages de mots-clés, un service hébergé chez un tiers ne se charge pas correctement, en version ordinateur comme en version mobile. Le contenu principal reste accessible.

**Conséquence** — Tant que cette ressource externe échoue, la fonction qu'elle apporte reste indisponible sur ces pages et des erreurs peuvent s'afficher ou des éléments d'affichage rester incomplets pour le lecteur.

**Ce qu’il faut faire corriger** — Demander au prestataire d'identifier le service externe appelé sur ces pages, de vérifier s'il est toujours actif et correctement configuré, et de prévoir un comportement de repli lorsqu'il ne répond pas.

### 3. Une seconde ressource externe échoue, y compris sur les pages d'auteurs

**Gravité** : Mineur · Fonctionnement
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : / — desktop, mobile · /login — desktop, mobile · /author/Albert-Einstein/ — desktop, mobile · /tag/change/page/1/ — desktop, mobile · /tag/deep-thoughts/page/1/ — desktop, mobile · /tag/thinking/page/1/ — desktop, mobile · /tag/world/page/1/ — desktop, mobile · /author/J-K-Rowling/ — desktop, mobile · /tag/abilities/page/1/ — desktop, mobile · /tag/choices/page/1/ — desktop, mobile · /tag/inspirational/page/1/ — desktop, mobile · /tag/life/page/1/ — desktop, mobile · /tag/live/page/1/ — desktop, mobile · /tag/miracle/page/1/ — desktop, mobile · /tag/miracles/page/1/ — desktop, mobile · /author/Jane-Austen/ — desktop, mobile · /tag/aliteracy/page/1/ — desktop, mobile · /tag/books/page/1/ — desktop, mobile · /tag/classic/page/1/ — desktop, mobile · /tag/humor/page/1/ — desktop, mobile

**Ce que nous avons constaté** — Une autre dépendance hébergée à l'extérieur du site n'aboutit pas, sur l'accueil, la page de connexion, des pages de mots-clés et des pages d'auteurs, en affichage ordinateur comme mobile. La navigation reste possible.

**Conséquence** — Tant que cet appel externe reste en échec, la fonctionnalité associée ne fonctionne pas sur ces pages et le chargement peut être ralenti ou partiellement dégradé pour les visiteurs.

**Ce qu’il faut faire corriger** — Faire inventorier les services tiers chargés par le thème ou les extensions du site, repérer celui qui ne répond plus et décider de le remplacer, de le mettre à jour ou de le retirer s'il n'est plus utile.

## Notre méthode

Aucun signalement n’a été écarté par nos re-vérifications. Nous n’avons envoyé aucun formulaire de ce site : nos robots consultent vos pages sans rien y soumettre. Ce qui ne se constate qu’en envoyant un message — la réception d’une demande, la confirmation affichée — n’a donc pas été vérifié. Avant de publier une anomalie, nous cherchons à la reproduire lors d'une passe de vérification ; celles que nous ne parvenons pas à retrouver sont écartées plutôt que rapportées dans le doute.

