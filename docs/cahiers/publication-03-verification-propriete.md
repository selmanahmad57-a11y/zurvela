# PUBLICATION-03 — la vérification de propriété (le verrou du produit public)

*Troisième étape de la publication (modèle 2). AUCUN scan public ne part sans
une preuve que le demandeur contrôle le site : « on ne scanne que ce qu'on a le
droit de scanner » (constitution §3). C'est la première pièce de l'étage
applicatif, parce que tout le reste (serveur, file, scan — étapes 4+) s'y
appuie. Logique PURE et testable : `core/publication/verification-propriete.ts`,
le serveur HTTP l'appellera à l'étape 4. Aucune valeur-seuil en dur — durées,
tailles et identité du robot entrent par paramètres (défauts de prod en config
à l'étape 4) ; les plages d'IP privées sont des faits RFC (régime des codes
HTTP). Cahier de SÉCURITÉ : le seul où un trou non vu se paie en attaque réelle,
pas en faux positif.*

## La garde cardinale

`peutScanner(url, { stock, maintenant }) → { ok, origine } | refus`. Aucun scan
ne part sans qu'elle réponde `ok`. Elle ne lit QUE l'état serveur des preuves
(jamais une donnée du client), exige une preuve pour l'origine **exacte** et non
expirée, et n'est pas contournable par le contenu d'une requête — même patron
que le filtre d'actions destructives (§3 : après décision, en code).

## Le flux

1. **Démarrage** (`demarrerVerification`) : URL → origine canonique → jeton
   `crypto.randomBytes` (256 bits, non devinable), stocké `{ origine →
   {jeton, expireLe} }`, instruction « déposez `zurvela-verification-<jeton>.txt`
   à la racine, contenant `<jeton>` » (universel, zéro langue naturelle).
2. **Stockage** : store injectable (fichier JSON en prod, en mémoire au témoin).
   **Deux durées distinctes** : `expirationJetonMs` = fenêtre de DÉPÔT (24 h) ;
   `fenetreValiditeMs` = validité de la PREUVE une fois vérifiée (1 h). Elles ne
   se confondent pas dans le code.
3. **Achèvement** (`acheverVerification`) : GET gardé → 200 direct + corps
   (trimé) === jeton + jeton non expiré → écrit la preuve. Sinon échec typé.

## Les gardes de sécurité, et comment chacune est fermée

- **4a confusion / normalisation** (`normaliserOrigine`) : parseur WHATWG,
  origine canonique `schéma://hôte[:port]` exacte (pas de fusion www/apex, pas
  de domaine enregistrable). Refuse : schéma hors http(s), **userinfo**
  (`user:pass@`, vecteur de confusion), **IP littérale** (un outil public attend
  un nom ; ferme une part du SSRF d'entrée).
- **4b aucune redirection suivie** (`recupererDirect`) : GET par
  `node:http(s).request` qui ne suit RIEN ; tout 3xx = échec. Plus strict et plus
  sûr que « pas de cross-domaine » — un propriétaire légitime sert un `.txt`
  statique sans redirection. (Conséquence assumée : apex→www échoue, message qui
  invite à entrer l'adresse www.)
- **4c origine exacte** : la preuve est clé par l'origine canonique ; prouver A
  n'autorise que A (ni sous-domaine, ni autre port, ni suffixe). Le scanner reste
  déjà dans l'origine (`explorateur.ts:382`).
- **4d SSRF — fermée, et MESURÉE pas supposée.** Un GET vers une URL fournie par
  le visiteur EST une primitive SSRF. `lookupPublicSeulement` : un `lookup`
  unique qui **résout + valide + renvoie l'IP** ; `node:net` connecte à l'IP
  renvoyée (mesuré : appel avec `options.all`, forme `[{address, family}]`), donc
  **une seule résolution** sert à valider ET à connecter → **anti-rebinding par
  épinglage natif**, pas de re-résolution. Une adresse privée/réservée/loopback/
  link-local (dont `169.254.169.254`)/CGNAT/ULA → refus AVANT toute connexion.
  Épinglage PROUVÉ au témoin (la connexion va à l'IP du lookup ; un lookup qui
  refuse → 0 connexion au serveur local).

## 4e — ce qui N'EST PAS fermé ici, nommé honnêtement → dette n°34

Le SSRF **au moment du scan** : le scan utilise Playwright (un navigateur qui
résout son propre DNS) ; un hôte prouvé public peut **rebinder** vers une IP
interne entre la vérification et le scan. Fermer le SSRF d'un navigateur est un
problème distinct et plus dur (épinglage au niveau navigateur, ou proxy
filtrant). Ce n'est PAS dans le périmètre du verrou de vérification. **Inscrit en
dette n°34**, garde obligatoire de l'étape du scan (4+). Je ne le fais pas passer
pour clos : en sécurité, le trou caché est pire que le trou nommé.

## Le témoin (vrai chemin) et ses mutations

`verification-propriete.test.ts` : de vrais serveurs HTTP locaux, de vraies
sockets, le vrai `recupererDirect` et le vrai `lookupPublicSeulement`. 18 sens.
Sept mutations de sécurité, toutes prouvées ROUGES puis restaurées :

| Mutation | Garde | tests rouges |
|---|---|---|
| expiration jeton → `false` | jeton-expire | 1 |
| redirection `<400` → `<301` | 4b | 2 |
| rejet IP privée → jamais | 4d SSRF | 2 |
| userinfo accepté | 4a | 1 |
| IP littérale acceptée | 4a | 1 |
| retrait du `lookup` | 4d épinglage | 8 |
| origine ignore le port | 4c origine exacte | 5 |

## Ce qui est reporté à l'étape 4 (serveur)

Câblage config (`config/publication.json` : `octetsJeton` 32, `expirationJetonMs`
24 h, `fenetreValiditeMs` 1 h, `delaiMs`, `maxOctets`, préfixe de fichier,
identité robot) ; store JSON durable (écriture atomique, le race du quota vaut
ici) ; le serveur HTTP qui expose démarrage/achèvement et appelle `peutScanner`
avant d'enfiler un scan ; **la garde 4e (dette n°34) comme condition du scan**.
