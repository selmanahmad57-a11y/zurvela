# Rapport de vérification

`https://automationexercise.com`

Le site fonctionne dans l'ensemble, mais plusieurs ressources fournies par des services extérieurs ne se chargent pas correctement, ce qui fragilise certains éléments d'affichage et de suivi sans bloquer la navigation.

### 1. Un service extérieur ne répond pas sur l'ensemble du site

**Gravité** : Mineur · Fonctionnement
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : / — desktop, mobile · /products — desktop, mobile · /view\_cart — desktop, mobile · /login — desktop, mobile · /test\_cases — desktop, mobile · /api\_list — desktop, mobile · /contact\_us — desktop, mobile · /category\_products/1 — desktop, mobile · /category\_products/2 — desktop, mobile · /category\_products/7 — desktop, mobile · /category\_products/3 — desktop, mobile · /category\_products/6 — desktop, mobile · /category\_products/4 — desktop, mobile · /category\_products/5 — desktop, mobile · /brand\_products/Polo — desktop, mobile · /brand\_products/H&M — desktop, mobile · /brand\_products/Madame — desktop, mobile · /brand\_products/Mast%20&%20Harbour — desktop, mobile · /brand\_products/Babyhug — desktop, mobile · /brand\_products/Allen%20Solly%20Junior — desktop, mobile

**Ce que nous avons constaté** — Une ressource hébergée en dehors de votre site est appelée sur toutes les pages principales, y compris l'accueil, le catalogue, le panier, la connexion et le formulaire de contact, et elle n'aboutit pas. Le visiteur ne voit pas forcément d'erreur, mais l'élément concerné reste inactif.

**Conséquence** — Tant que cet appel échoue, ce que ce service devait apporter — affichage complémentaire, suivi ou fonctionnalité annexe — n'est disponible sur aucune page de la boutique, sur ordinateur comme sur mobile.

**Ce qu’il faut faire corriger** — Demandez à la personne qui entretient le site d'identifier ce service externe appelé sur toutes les pages, de vérifier s'il est toujours actif et sous quel compte, puis de le corriger ou de retirer l'appel s'il n'est plus utile.

### 2. Seconde ressource externe en échec sur toutes les pages

**Gravité** : Mineur · Fonctionnement
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : / — desktop, mobile · /products — desktop, mobile · /view\_cart — desktop, mobile · /login — desktop, mobile · /test\_cases — desktop, mobile · /api\_list — desktop, mobile · /contact\_us — desktop, mobile · /category\_products/1 — desktop, mobile · /category\_products/2 — desktop, mobile · /category\_products/7 — desktop, mobile · /category\_products/3 — desktop, mobile · /category\_products/6 — desktop, mobile · /category\_products/4 — desktop, mobile · /category\_products/5 — desktop, mobile · /brand\_products/Polo — desktop, mobile · /brand\_products/H&M — desktop, mobile · /brand\_products/Madame — desktop, mobile · /brand\_products/Mast%20&%20Harbour — desktop, mobile · /brand\_products/Babyhug — desktop, mobile · /brand\_products/Allen%20Solly%20Junior — desktop, mobile

**Ce que nous avons constaté** — Une autre ressource provenant d'un domaine tiers est réclamée par chacune des pages testées et n'est jamais délivrée. Le chargement du site se poursuit, mais sans cet élément.

**Conséquence** — Les fonctions qui dépendent de ce service ne s'exécutent nulle part sur la boutique, ce qui peut priver certaines pages d'un affichage ou d'une mesure attendus, aussi bien sur ordinateur que sur téléphone.

**Ce qu’il faut faire corriger** — Faites lister les appels vers des domaines extérieurs présents dans le gabarit commun du site et faites vérifier celui-ci en particulier : adresse toujours valide, service encore en ligne, ou suppression de l'appel.

### 3. Troisième dépendance externe qui n'aboutit pas partout

**Gravité** : Mineur · Fonctionnement
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : / — desktop, mobile · /products — desktop, mobile · /view\_cart — desktop, mobile · /login — desktop, mobile · /test\_cases — desktop, mobile · /api\_list — desktop, mobile · /contact\_us — desktop, mobile · /category\_products/1 — desktop, mobile · /category\_products/2 — desktop, mobile · /category\_products/7 — desktop, mobile · /category\_products/3 — desktop, mobile · /category\_products/6 — desktop, mobile · /category\_products/4 — desktop, mobile · /category\_products/5 — desktop, mobile · /brand\_products/Polo — desktop, mobile · /brand\_products/H&M — desktop, mobile · /brand\_products/Madame — desktop, mobile · /brand\_products/Mast%20&%20Harbour — desktop, mobile · /brand\_products/Babyhug — desktop, mobile · /brand\_products/Allen%20Solly%20Junior — desktop, mobile

**Ce que nous avons constaté** — Une ressource tierce supplémentaire, appelée depuis l'accueil, le catalogue, le panier, la connexion et le contact, reste sans réponse. Le symptôme est le même sur ordinateur et sur mobile.

**Conséquence** — Sur chaque page de la boutique, y compris celles qui mènent à l'achat, ce que ce service devait fournir reste absent aussi longtemps que l'appel échoue.

**Ce qu’il faut faire corriger** — Faites contrôler le bloc de scripts et de ressources externes inséré sur toutes les pages, et faites décider pour chaque entrée si elle doit être réparée ou retirée.

### 4. Ressource externe non chargée sur la page d'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Lors de notre passage de vérification sur la page d'accueil en affichage ordinateur, nous avons observé qu'une ressource provenant d'un service extérieur n'a pas pu être récupérée. Nous ne l'avons pas re-testée ensuite.

**Conséquence** — Si le problème se reproduit, l'élément attendu de ce service ne s'affiche pas sur la page d'accueil, qui est souvent la première vue par un client.

**Ce qu’il faut faire corriger** — Faites examiner les ressources externes appelées par la page d'accueil et vérifier laquelle ne répond pas au moment du chargement.

### 5. Un appel vers l'extérieur resté sans réponse à l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons constaté, au cours de la vérification de la page d'accueil sur ordinateur, qu'un appel vers un domaine tiers n'a rien renvoyé. Cette observation n'a pas été rejouée.

**Conséquence** — Tant que l'appel échoue, la partie de la page qui en dépend reste vide ou inerte pour le visiteur.

**Ce qu’il faut faire corriger** — Demandez un relevé des appels externes déclenchés par l'accueil et faites identifier celui qui reste sans réponse.

### 6. Élément fourni par un tiers manquant sur l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Pendant notre passe de vérification, la page d'accueil en version ordinateur a réclamé une ressource extérieure qui ne lui a pas été délivrée. Le constat n'a été fait qu'au cours de ce passage.

**Conséquence** — La page continue de s'afficher, mais l'apport de ce service — visuel, mesure ou fonction secondaire — n'est pas rendu au visiteur si la situation persiste.

**Ce qu’il faut faire corriger** — Faites vérifier auprès du prestataire du site si ce service externe est toujours souscrit et correctement paramétré.

### 7. Chargement externe interrompu sur la page d'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons observé sur l'accueil, en affichage ordinateur, une ressource hébergée ailleurs qui n'a pas abouti lors de notre vérification. Elle n'a pas fait l'objet d'un nouveau test.

**Conséquence** — En cas de répétition, une partie de l'expérience prévue sur la page d'entrée de la boutique ne se met pas en place.

**Ce qu’il faut faire corriger** — Faites contrôler les adresses externes utilisées par l'accueil et remplacer ou retirer celles qui ne répondent plus.

### 8. Service tiers injoignable depuis l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Au cours de notre vérification de la page d'accueil sur ordinateur, un service extérieur appelé par la page n'a pas répondu. Il s'agit d'une observation isolée, non rejouée.

**Conséquence** — Si ce comportement se confirme, la fonction assurée par ce service reste indisponible pour les visiteurs arrivant sur la boutique.

**Ce qu’il faut faire corriger** — Faites vérifier la disponibilité de ce service côté fournisseur, ainsi que l'adresse employée dans le code de la page d'accueil.

### 9. Une dépendance externe absente à l'ouverture du site

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons relevé, pendant la vérification de l'accueil en version ordinateur, qu'une ressource tierce demandée par la page n'a pas été obtenue. Ce constat n'a pas été reproduit.

**Conséquence** — Le visiteur peut voir une page d'accueil incomplète sur le point pris en charge par ce service, sans comprendre ce qui manque.

**Ce qu’il faut faire corriger** — Faites inventorier les dépendances externes de l'accueil et tester leur disponibilité depuis un navigateur ordinaire.

### 10. Ressource tierce non délivrée sur l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Lors de notre passe de vérification, un fichier provenant d'un domaine extérieur et appelé par la page d'accueil en affichage ordinateur n'a pas pu être chargé. Nous n'avons pas rejoué ce test.

**Conséquence** — Si l'échec se reproduit, l'affichage ou la fonction liée à ce fichier reste absent de la page d'entrée de la boutique.

**Ce qu’il faut faire corriger** — Faites vérifier ce chargement externe et, s'il n'est plus nécessaire, faites supprimer l'appel du code de la page.

### 11. Appel externe sans réponse observé sur l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons constaté sur la page d'accueil, en version ordinateur, un appel vers un service extérieur resté sans réponse au moment de notre vérification. Cette observation est ponctuelle.

**Conséquence** — La navigation reste possible, mais l'élément géré par ce service n'apparaît pas tant que l'appel n'aboutit pas.

**Ce qu’il faut faire corriger** — Faites examiner la liste des services tiers utilisés sur l'accueil et corriger celui dont l'adresse ne répond plus.

### 12. Ressource distante manquante à l'affichage de l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Pendant notre vérification, la page d'accueil en affichage ordinateur a tenté de récupérer une ressource distante sans y parvenir. Ce point n'a pas été re-testé par la suite.

**Conséquence** — Si le défaut persiste, la partie de la page d'accueil qui repose sur cette ressource n'est pas rendue aux visiteurs.

**Ce qu’il faut faire corriger** — Faites contrôler l'origine de cette ressource distante et sa disponibilité effective.

### 13. Un composant externe n'a pas répondu sur l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons observé qu'un composant fourni par un prestataire extérieur, appelé sur l'accueil en version ordinateur, n'a pas été chargé lors de notre vérification. Le constat n'a pas été reproduit.

**Conséquence** — Le service attendu de ce composant, s'il reste indisponible, ne bénéficie à aucun visiteur de la page d'accueil.

**Ce qu’il faut faire corriger** — Faites confirmer par le prestataire que ce composant est toujours actif et correctement référencé dans le site.

### 14. Chargement tiers en échec sur la page d'entrée

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Au cours de notre passe de vérification, un chargement provenant d'un domaine tiers n'a pas abouti sur la page d'accueil en affichage ordinateur. Il s'agit d'une observation unique.

**Conséquence** — En cas de répétition, la fonction portée par ce chargement reste hors service sur la page la plus visitée de la boutique.

**Ce qu’il faut faire corriger** — Faites tester ce chargement externe depuis plusieurs connexions afin de déterminer s'il échoue de façon durable.

### 15. Dépendance externe non résolue sur l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons relevé sur la page d'accueil, en version ordinateur, une dépendance externe qui n'a pas pu être résolue pendant notre vérification. Elle n'a pas été rejouée.

**Conséquence** — Tant que cette dépendance reste inaccessible, l'élément correspondant de la page d'accueil n'est pas opérationnel pour les visiteurs.

**Ce qu’il faut faire corriger** — Faites vérifier l'adresse et le nom de domaine appelés par cette dépendance dans le code de l'accueil.

### 16. Ressource externe indisponible lors de notre passage

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Lors de la vérification de la page d'accueil sur ordinateur, une ressource externe attendue par la page n'a pas été fournie. Nous n'avons pas procédé à un nouveau test.

**Conséquence** — Si l'indisponibilité se confirme, une partie de ce qui devait s'afficher à l'arrivée sur la boutique reste absente.

**Ce qu’il faut faire corriger** — Faites examiner les erreurs de chargement signalées par le navigateur sur la page d'accueil et traiter celle qui concerne ce domaine externe.

### 17. Appel à un prestataire extérieur non abouti sur l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons observé, pendant notre passe de vérification, un appel vers un prestataire extérieur qui n'a pas abouti sur la page d'accueil en affichage ordinateur. Ce constat reste ponctuel.

**Conséquence** — La fonction assurée par ce prestataire ne s'active pas pour le visiteur aussi longtemps que l'appel reste en échec.

**Ce qu’il faut faire corriger** — Faites vérifier le statut du compte ou de l'abonnement auprès de ce prestataire, ainsi que l'intégration correspondante.

### 18. Élément tiers non chargé à l'accueil de la boutique

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Au moment de notre vérification, un élément provenant d'un service tiers n'a pas été chargé sur la page d'accueil en version ordinateur. Cette observation n'a pas été reproduite.

**Conséquence** — Si le problème se répète, la page d'accueil se présente aux clients sans cet élément, ce qui peut donner une impression d'incomplétude.

**Ce qu’il faut faire corriger** — Faites identifier cet élément tiers et décider s'il doit être réparé, remplacé ou retiré du site.

### 19. Dernière ressource externe en défaut sur l'accueil

**Gravité** : Mineur · Fonctionnement
**Statut** : Détecté pendant nos vérifications ; non re-testé.
**Pages concernées** : / — desktop

**Ce que nous avons constaté** — Nous avons constaté lors de notre vérification qu'une ressource externe supplémentaire appelée par la page d'accueil en affichage ordinateur n'a pas répondu. Elle n'a pas été re-testée.

**Conséquence** — Cumulé aux autres appels externes en échec, ce défaut peut rendre la page d'accueil moins complète et moins fluide pour vos visiteurs.

**Ce qu’il faut faire corriger** — Faites réaliser une revue globale des services externes appelés par le site et faites nettoyer ceux qui ne sont plus joignables ou plus utiles.

## Notre méthode

1 signalement a été écarté par nos re-vérifications. 390 autres signalements n’ont pas pu être re-vérifiés et ne figurent pas dans ce rapport. Nous n’avons envoyé aucun formulaire de ce site : nos robots consultent vos pages sans rien y soumettre. Ce qui ne se constate qu’en envoyant un message — la réception d’une demande, la confirmation affichée — n’a donc pas été vérifié. Notre méthode consiste à rejouer chaque signalement avant de le publier : ce que nous ne parvenons pas à reproduire est écarté du rapport plutôt que présenté comme un défaut avéré.

