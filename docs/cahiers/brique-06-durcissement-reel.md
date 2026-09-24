# ZURVELA — Cahier : Durcissement réel + premier bestiaire (Brique 6, Phase 2)

Le moteur sort du banc. Deux volets dans une brique : 6a construit
les mécanismes absents (l'inventaire, catégorie A + soumission),
6b mène la première campagne réelle. Régime : COMPLET sur 6a
(sécurité, contrats), la campagne 6b est une MESURE, pas un
développement — elle se gouverne comme un run, pas comme un flux.

## 6a — Les mécanismes absents

1. ORIGINE PARTOUT : d-http (5xx), d-lenteur, d-echec-muet
   apprennent signal.interne comme le 404 le connaît. Doctrine :
   une défaillance TIERCE n'est jamais imputée au site en
   catégorie/gravité d'origine — elle devient une anomalie
   distincte « dépendance tierce en échec » (catégorie
   fonctionnel, gravité mineure par défaut, config), car un chat
   mort n'est pas un site mort, mais le client mérite de le
   savoir. Le banc gagne un gabarit ou une extension avec
   ressource tierce simulée (second port = seconde origine —
   le banc SAIT faire deux origines, il ne l'a jamais fait).
2. POLITESSE : robots.txt lu et respecté (le scan refuse les
   chemins interdits et le journalise — un site qui nous interdit
   est un site qu'on n'audite pas en douce) ; délai entre pages
   (config, hypothèse 1000 ms) ; navigations séquentielles par
   origine. Le banc vérifie le respect (un gabarit avec
   robots.txt interdisant /prive : attendu jamais visité —
   nature « resté inerte », la taxonomie accueille son premier
   cas non-IA).
3. BUDGET DE DÉPENSE : budgetMaxUsdParScan en config production.
   Le compteur de coût existe (chaque ResultatIa porte le sien) ;
   le dépassement bascule les appels IA restants en repli
   déterministe/dégradé, JOURNALISÉ subie — jamais un arrêt du
   scan. Invariant testé : aucun scan ne dépense au-delà du
   budget + le coût d'UN appel en vol.
4. SOUMISSION GATÉE : config production soumission: "aucune" |
   "site-possede", défaut "aucune". En mode aucune, l'action
   soumettre n'est pas énumérée (première couche, pas un filtre
   après coup). Le banc l'éprouve : scénario en mode aucune →
   F01/F02/R01 non détectés ET non tentés (attendu : les bugs de
   soumission deviennent hors de portée déclarée — le rapport
   dit ce qu'il n'a pas testé et pourquoi).
5. TIMEOUT PRODUCTION : config/production.json porte scan.timeoutMs
   (hypothèse 300 s) et TOUTES les valeurs de l'inventaire B en
   copie datée avec commentaire « hypothèse — à confirmer au
   bestiaire ». Le banc ne lit JAMAIS ce fichier.
6. LA PAGE DU ROBOT : docs/robot.md rédigé (qui, quoi, pourquoi,
   comment bloquer, contact) — matière à publier sur
   zurvela.com/robot AVANT le premier scan externe. Action de
   publication : propriétaire.
7. exceptionsSandbox : reste dormante, MAIS gagne son test de
   forme (n°5) : le schéma la valide, un test l'atteste
   non-consommée avec renvoi au backlog — dormante DÉCLARÉE,
   plus dormante silencieuse.

## 6a (2/2) — la mesure au banc

Périmètre scellé, dans cet ordre : les CONTRATS d'abord (`Gabarit.robotsTxt`,
seconde origine du serveur de scénario, nature « resté inerte » étendue à
l'obéissance aux interdits), puis le gabarit seconde-origine (l'attendu
« dépendance tierce » mesuré), le gabarit robots (`/prive` jamais visité —
premier « resté inerte » non-IA), le scénario en mode `aucune` (le rapport dit
ce qu'il n'a pas testé et pourquoi), la commande `pnpm scan`, puis
l'enregistrement unique et les runs.

8. `pnpm scan <url> --config production` — NON NÉGOCIABLE dans ce lot.
   `config/production.json` n'est aujourd'hui exercé par rien : c'est la
   config dormante de l'apprentissage n°5, et elle naîtra exercée ou restera
   suspecte.

   SON PREMIER TEST N'EST PAS « ELLE SCANNE ». C'est « elle lit BIEN
   production.json », et il se prouve par l'EFFET, jamais par la lecture :
   altérer une valeur de production — le timeout, le gate de soumission — et
   vérifier que le scan la respecte. Un test qui constate que le fichier a été
   ouvert ne prouve que l'ouverture ; un test qui change le gate à `aucune` et
   voit disparaître les soumissions prouve que la valeur GOUVERNE. C'est
   l'apprentissage n°5 sous sa forme exécutable.

## 6b — La campagne (20 scans réels)

- CIBLES, dans l'ordre : (1) le site du projet lui-même dès
  qu'une page existe — dogfooding du plan ; (2) sites possédés
  par le propriétaire ; (3) sites de test publics conçus pour
  les robots ; (4) sites publics divers en mode
  soumission=aucune, politesse active, APRÈS que 1-3 ont tourné
  propre. Jamais de login réel, jamais de site à autorisation
  douteuse.
- PROTOCOLE PAR SCAN : commande unique (pnpm scan <url>
  --config production), rapport lu PAR UN HUMAIN, et une fiche
  bestiaire par observation : {url anonymisée si tierce, config,
  observation, classement}. Classement fermé — c'est la
  taxonomie du réel, à créer : crash | blocage-anti-bot |
  faux-positif | raté-suspecté | lenteur-outil | rapport-illisible
  | comportement-inattendu | RAS. (Clause des taxonomies : close
  après la campagne, extensible pendant.)
- L'HYPOTHÈSE D-RECOUVREMENT en tête de liste : premier site
  européen à bandeau de consentement, la fiche dit si le faux
  positif structurel existe. Si oui : entrée bestiaire n°1 et
  la correction est un cahier futur (ne pas corriger à chaud
  pendant la campagne — la campagne OBSERVE).
- RÈGLE D'OR DE CAMPAGNE : on ne corrige rien pendant les 20
  scans sauf crash bloquant la campagne elle-même. Chaque
  correction à chaud fausserait les scans suivants — le
  bestiaire mesure UNE version (5f655b4 + 6a), datée.
- JALON DE SORTIE : 20 scans, 0 crash non expliqué, un rapport
  lisible par scan, le bestiaire classé et committé
  (docs/bestiaire/ ou banc/bestiaire/ — les fiches ont vocation
  à devenir des gabarits). Les chiffres réels : durée, coût,
  pages, candidates/retenues par scan — le premier tableau
  « réel vs banc » du projet.

## Hors périmètre
Corrections des trouvailles du bestiaire (cahiers suivants,
priorisés par les fiches), page publique, file d'attente,
validation de propriété, captures dans le rapport.

## Livraison
6a : scorecard banc (périmètre historique intact, 3 runs ;
nouveaux attendus politesse/soumission/tiers), constats, hash.
6b : le tableau des 20 scans, le bestiaire classé, LES TROIS
RAPPORTS les plus intéressants à lire, et ta liste priorisée
des cahiers correctifs. Commits séparés : « Brique 6a —
durcissement réel », « Brique 6b — bestiaire n°1 ».
