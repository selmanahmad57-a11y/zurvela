# Rapport de vérification

`https://the-internet.herokuapp.com`

Le site présente un blocage d'interaction confirmé sur une page, aussi bien sur ordinateur que sur mobile, ainsi que plusieurs anomalies mineures d'affichage et de ressources externes qui n'empêchent pas la consultation.

### 1. Un élément recouvre la page et empêche de cliquer, sur ordinateur

**Gravité** : Bloquant · Fonctionnement
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : /entry\_ad — desktop

**Ce que nous avons constaté** — Sur la page d'entrée publicitaire consultée depuis un ordinateur, un élément se superpose au contenu et intercepte les clics. Le visiteur croit cliquer sur un lien ou un bouton, mais c'est la couche située au-dessus qui reçoit son clic.

**Conséquence** — Tant que ce défaut persiste, un visiteur qui arrive sur cette page depuis un ordinateur ne peut pas poursuivre sa navigation ni déclencher l'action attendue : le parcours s'arrête là.

**Ce qu’il faut faire corriger** — Demander à la personne qui entretient le site d'examiner la fenêtre ou le calque affiché sur cette page : vérifier qu'il se ferme réellement et qu'il ne reste pas une zone invisible par-dessus le contenu après sa fermeture.

### 2. Le même blocage des clics sur téléphone

**Gravité** : Bloquant · Mobile
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : /entry\_ad — mobile

**Ce que nous avons constaté** — Sur cette même page consultée depuis un téléphone, les appuis sont interceptés par un élément qui recouvre le contenu. Le visiteur touche l'écran sans que l'action visée se déclenche.

**Conséquence** — Tant que ce défaut persiste, les visiteurs venant d'un téléphone restent bloqués sur cette page et ne peuvent atteindre ni le contenu ni les actions qui s'y trouvent.

**Ce qu’il faut faire corriger** — Faire contrôler le comportement de cette superposition sur petit écran : la zone de fermeture doit être atteignable au doigt et la couche doit disparaître complètement une fois fermée.

### 3. Un service externe ne répond pas sur plusieurs pages

**Gravité** : Mineur · Fonctionnement
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : / — desktop, mobile · /abtest — desktop, mobile · /broken\_images — desktop, mobile · /challenging\_dom — desktop, mobile · /checkboxes — desktop, mobile · /context\_menu — desktop, mobile · /disappearing\_elements — desktop, mobile · /drag\_and\_drop — desktop, mobile · /dropdown — desktop, mobile · /dynamic\_content — desktop, mobile · /dynamic\_controls — desktop, mobile · /dynamic\_loading — desktop, mobile · /entry\_ad — desktop, mobile · /exit\_intent — desktop, mobile · /download — desktop, mobile · /upload — desktop, mobile · /floating\_menu — desktop, mobile · /forgot\_password — desktop, mobile

**Ce que nous avons constaté** — Sur la page d'accueil et plusieurs autres pages du site, une ressource fournie par un service extérieur n'a pas pu être chargée, sur ordinateur comme sur mobile. Les pages restent consultables, mais une partie de ce qui dépend de ce service ne s'exécute pas.

**Conséquence** — Selon le rôle de ce service, cela peut priver le site de statistiques, d'un affichage secondaire ou d'une fonction d'appoint, sans empêcher la consultation générale des pages.

**Ce qu’il faut faire corriger** — Faire identifier le service externe appelé sur ces pages et vérifier s'il est toujours actif, correctement paramétré, ou s'il peut être retiré du site s'il n'est plus utile.

### 4. Des images ne s'affichent pas sur une page

**Gravité** : Mineur · Affichage
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : /broken\_images — desktop, mobile

**Ce que nous avons constaté** — Sur la page consacrée aux images, des fichiers appelés par la page sont introuvables sur le site. À la place de l'image, le visiteur voit un emplacement vide ou une icône d'image cassée, sur ordinateur comme sur mobile.

**Conséquence** — L'aspect de la page est dégradé et le contenu visuel prévu n'est pas montré, ce qui donne une impression de site mal entretenu.

**Ce qu’il faut faire corriger** — Demander la vérification des adresses de ces images : soit les fichiers manquent sur le serveur, soit le chemin indiqué dans la page ne correspond plus à leur emplacement.

### 5. D'autres visuels manquants sur cette même page

**Gravité** : Mineur · Affichage
**Statut** : Constaté, puis reproduit lors de nos 2 vérifications indépendantes.
**Pages concernées** : /broken\_images — desktop, mobile

**Ce que nous avons constaté** — Toujours sur cette page, d'autres fichiers d'image appelés par le site renvoient une absence de ressource. Le résultat est le même pour le visiteur, sur ordinateur comme sur téléphone : l'emplacement reste vide.

**Conséquence** — Le rendu de la page reste incomplet tant que ces fichiers ne sont pas rétablis, ce qui nuit à la qualité perçue de l'ensemble.

**Ce qu’il faut faire corriger** — Faire passer en revue l'ensemble des images de cette page pour rétablir les fichiers manquants ou corriger les liens qui pointent vers des emplacements inexistants.

## Notre méthode

Aucun signalement n’a été écarté par nos re-vérifications. Nous n’avons envoyé aucun formulaire de ce site : nos robots consultent vos pages sans rien y soumettre. Ce qui ne se constate qu’en envoyant un message — la réception d’une demande, la confirmation affichée — n’a donc pas été vérifié. Notre méthode consiste à tenter de reproduire chaque signalement avant de le publier : ceux que nous ne parvenons pas à reproduire sont écartés plutôt que présentés comme établis.

