# Interface marchande — CADRAGE (à ouvrir avec le dépôt présent, code en main)

*La publication (étapes 1-7) a mis le moteur en prod, public, prouvé de bout en
bout (`api.zurvela.com`). Reste la PAGE où un commerçant colle une URL et obtient
un scan. Nouveau chantier, sa propre méthode. Ce cahier FIGE le cadrage décidé
le 2026-10-10/11 ; il ne contient pas de code — on l'ouvre la prochaine session
et on construit red-first, comme le reste.*

## Q1 — Où vit l'interface : **B, même origine.**

L'UI (HTML/CSS/JS statique) est servie **par Caddy** (`file_server`) sous
`api.zurvela.com` ; les routes d'API sont proxiées vers le moteur Node. **Zéro
CORS.**

- **La raison décisive : le gate.** L'alternative A (page statique sur la vitrine
  OVH appelant l'API en cross-origin) ferait vivre l'interface — celle qui
  manipule des jetons, appelle `/scanner`, **dépense le budget** — **hors du
  pipeline testé-vert** (la vitrine se déploie par FTP, à la main). Tout le
  projet tient sur « seul du code vert arrive en prod » (l'hôte TIRE, ne pousse
  jamais). Percer ce trou précisément sur le composant qui touche à l'argent est
  rédhibitoire. En B, l'UI vit **dans le dépôt** → versionnée, testée, déployée
  par `git pull`, sous le gate.
- **B ne salit pas le moteur.** C'est **Caddy** qui sert le `file_server`, pas le
  process Node — le moteur ne rend jamais de HTML. Le « mélange » reste dans le
  reverse-proxy, inoffensif.
- **A éliminé aussi pour la surface** : pas de CORS = une surface de sécurité en
  moins, dans un projet qui en fait une obsession.

### Le point sensible de B : le matching Caddy, SANS ambiguïté

Caddy doit distinguer **explicitement** les routes d'API des routes de page —
une règle floue, et soit une page masque une route d'API, soit l'inverse. À
traiter en **liste blanche explicite**, jamais en devinette. Forme visée (à
construire, pas figée ici) :

```
api.zurvela.com {
  @api path /verifier /scanner /statut/* /sante
  reverse_proxy @api 127.0.0.1:8787
  root * /var/www/zurvela-ui
  file_server
}
```

Les quatre routes d'API sont nommées une à une ; tout le reste → la page. Un
témoin devra prouver qu'une page ne peut pas capturer une route d'API et
réciproquement.

### Conséquence visible (assumée pour le MVP)

La **vitrine** (`zurvela.com`, FTP, statique — marketing, a le droit d'être hors
du gate) **liera vers l'UI à `api.zurvela.com`** (« Scanner mon site »). L'URL
`api` visible au marchand est le coût assumé du MVP ; **renommage
`app.zurvela.com`** possible plus tard (nouveau vhost Caddy, lien vitrine mis à
jour).

## Q2 — Ambition du dépôt de propriété : **Minimal (MVP).**

Le flux (la « glue ») :

1. le marchand saisit son URL → `POST /verifier` → **jeton frais** + le fichier prêt ;
2. **téléchargement 1-clic** du fichier exact (nom + contenu) — zéro copier-coller raté ;
3. instruction racine : « mets ce fichier pour qu'il soit à
   `https://tonsite.com/zurvela-verification-xxx.txt` » ;
4. bouton **« c'est déposé → vérifier & scanner »** → `POST /scanner` ;
5. `202` → statut (`GET /statut/:id`) + « on t'envoie le rapport par e-mail quand c'est prêt ».

**Jeton frais à CHAQUE réessai** (chaque tentative rappelle `/verifier` → nouveau
nom = nouvelle URL) : c'est la mitigation du cache CDN négatif (un nom neuf n'a
jamais été GETé avant dépôt → pas de 404 figé).

Enrichissement par plateforme (FTP / cPanel / WordPress…) : **plus tard**,
seulement après avoir MESURÉ où les vrais marchands calent. Pas de prose
spécifique avant la mesure.

### L'EXIGENCE CENTRALE (pas un détail) : l'échec de vérification DISCRIMINE

Le vrai problème de l'interface n'est pas le happy path, c'est le **message
d'échec**. Un « fichier non trouvé » générique laisse le marchand tourner en
rond. Le serveur produit DÉJÀ des causes distinctes ; l'UI doit les traduire en
actions, **sans les aplatir** :

| `RaisonEchec` serveur | Ce que vit le marchand | Message / action |
|---|---|---|
| `fichier-absent` | pas-encore-là **OU** mauvais-endroit **OU** mauvais-nom (le serveur ne peut PAS les séparer — tous = 404 au chemin exact) | **auto-diagnostic** : afficher l'**URL exacte attendue en lien cliquable** (« ouvrez ceci — fichier ? page d'accueil ? erreur ? ») + « réessayer » (votre hébergeur/CDN peut prendre un instant) |
| `mauvais-contenu` | un 200, mais pas le jeton | « on a trouvé une page à cette URL, mais pas votre fichier » — souvent un site qui renvoie l'accueil pour tout chemin inconnu, ou un mauvais contenu |
| `redirection-refusee` | 3xx au lieu du fichier | « votre site nous a redirigés » — redirection forcée (http→https, www, catch-all) |
| `jeton-expire` | trop de temps écoulé | « la vérification a expiré » → recommencer (redonne un jeton frais) |
| `hote-non-public` / `erreur-reseau` | injoignable | « on n'a pas pu joindre votre site » (DNS / réseau / IP privée) |
| URL invalide (normalisation) | — | « cette adresse n'est pas valide » |

Le serveur ne peut pas lever l'ambiguïté du seau `fichier-absent` ; l'UI la lève
en **montrant au marchand ce que le serveur voit** (l'URL exacte). C'est ÇA,
l'exigence — écrite comme centrale, pas lissée.

## Hors cadrage (noté, pas tranché)

- Aide par plateforme (après mesure).
- Renommage `app.zurvela.com`.
- Le texte marchand = `locales/` (§2) ; la discrimination des causes passe par
  les `RaisonEchec` (code, universelles) → libellés localisés.

## Méthode pour la construction (prochaine session)

Red-first, chaque garde par mutation, présent avant commit, gate vert avant
push, un commit par brique. Mesure avant d'écrire. Le témoin du matching Caddy
(API-vs-page) et celui de la discrimination des échecs sont les deux morceaux où
le soin compte le plus.
