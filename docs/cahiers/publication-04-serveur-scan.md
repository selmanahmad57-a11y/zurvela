# PUBLICATION-04 — le serveur de scan public

*Quatrième étape de la publication (modèle 2). Le code quitte le dépôt et
tourne en continu face au public. Construit et prouvé AU BANC (gratuit, zéro
scan) ; la validation réelle de bout en bout (le seul dollar, ~0,05 $) est une
étape de VALIDATION séparée, pas de construction. Trois gardes de sécurité,
chacune prouvée porteuse par sa mutation — c'est la dernière épreuve avant qu'un
vrai visiteur puisse scanner.*

## La garde cardinale : le proxy filtrant d'egress (SSRF-au-scan, dette n°34)

`core/publication/proxy-filtrant.ts`. Le scan tourne dans Chromium, qui résout
son propre DNS et charge des SOUS-RESSOURCES vers n'importe quel hôte — chacune
un vecteur SSRF (n°45 : le SSRF passe par la sous-ressource, pas par l'origine).
`--host-resolver-rules` n'épingle que l'origine listée (mesuré, étape 4) ; le
PROXY voit CHAQUE connexion, valide l'IP, refuse privé/réservé/metadata.

Réutilise `estIpPublique` + `lookupPublicSeulement` de l'étape 3 (résoudre →
valider → connecter à l'IP validée, UNE résolution → anti-rebinding). Deux
sous-points fermés, pas en dette : CONNECT (HTTPS) validé+épinglé AVANT le
tunnel (le `200` n'est émis qu'après connexion à l'IP validée) ; épinglage sans
re-résolution (TOCTOU). Témoin 5/5 ; mutations tuées (filtre IP · CONNECT-après-
tunnel · lookup retiré) ; **Chromium réel → sous-ressource `169.254.169.254`
refusée** (0 egress).

**Le pont scanner↔proxy, prouvé EFFECTIF.** `config.navigateur.proxy` →
`lancerNavigateur` → `chromium.launch({ proxy, bypass:'' })`. Le `bypass:''`
ferme le contournement localhost par défaut de Chromium (sinon un scan de
127.0.0.1 sortirait sans filtre). Prouvé via le vrai chemin navigateur du
scanner : navigation principale privée → 403 du proxy, 0 egress ; sous-ressource
privée → refusée ; site public → chargé, transparent (le proxy ne casse pas un
scan légitime). **Dette n°34 LEVÉE.**

## La garde de l'étape 3, ACTIVE : `peutScanner` avant d'enfiler

`demarrerScan` appelle `peutScanner(origine)` (lit l'état serveur des preuves,
origine EXACTE, non contournable) AVANT d'enfiler. Origine non prouvée → aucun
scan. Mutation (sauter la garde) → rouge.

## IDOR : `scanId` imprévisible

`scanId` = 256 bits crypto. L'imprévisibilité EST la capacité d'accès (pas
d'auth à ce stade). `GET /statut/:id` : énumération `1,2,3` → 404, seul l'id
exact rend le rapport. Mutation (id prévisible) → rouge.

## La file + l'état durable

File 1-à-la-fois (`creerOrdonnanceur`, sérialisé) ; mutation (retirer l'`await`)
→ rouge. État durable JSON atomique (temp + `rename`) : jetons, preuves, scans
survivent au redémarrage (`stock-fichier.ts`, témoin de persistance). Un seul
processus + file 1-à-la-fois → le `rename` suffit (file parallèle = verrou à
ajouter, noté).

## Les routes (toutes validées, rien d'autre exposé)

`POST /verifier` (démarre la vérif, rend jeton + instruction) · `POST /scanner`
(achève la vérif, `peutScanner`, enfile) · `GET /statut/:id` (avancement puis
rapport HTML, via l'id imprévisible) · `GET /sante`. **E-mail NON collecté**
(minimisation des données — reporté à l'étape 6).

## La touche moteur (le seul point)

`core/scanner/{config,navigateur,defaut}.ts` : une option `proxy` injectée à
l'exécution. Absente au banc et pour `pnpm scan` (direct) ; présente pour le
serveur public (derrière la garde). Aucun seuil en dur : `config/publication.json`.

## L'assemblage (production) et ce qui reste à valider en réel

`demarrer-serveur.ts` : démarre le proxy, câble le scan derrière lui, l'état
fichier, la file, les routes. Exercé seulement à la validation réelle (~0,05 $)
et au déploiement. Les GARDES, elles, sont prouvées au banc. La validation e2e
(cahier séparé) prouve la chaîne complète en conditions réelles : vérification →
scan derrière proxy → rapport via `/statut`, et que les gardes tiennent HORS
banc (transit par le proxy, `peutScanner`, id imprévisible).

Le rayon : `proxy-filtrant.ts` · `serveur-scan.ts` · `stock-fichier.ts` ·
`demarrer-serveur.ts` · `verification-propriete.ts` (export du code d'erreur) ·
`core/scanner/{config,navigateur,defaut}.ts` (option proxy) ·
`config/publication.json` (+ schéma) · témoins + mutations · suite 1852/1852.
