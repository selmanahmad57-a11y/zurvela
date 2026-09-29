# ZURVELA — Cahier P2-1 : la rejouabilité

Ouvert le 2026-09-29, depuis le carnet figé de la campagne 6b (validé le
même jour : « l'ordre est le bon »). Premier cahier de la Phase 2. Régime :
COMPLET — moteur (détection, confirmation, exploration), banc (nouvelle
famille, nouveaux gabarits), réel (validation, METHODE §12). Contrats
d'abord ; validés par le propriétaire le 2026-09-29 (« Valide, committe le
cahier, et lance P2-1 par les contrats »). Budget annoncé à l'ouverture de
la session de code.

**Pourquoi en premier** : non parce que c'est le défaut le plus fréquent,
mais parce qu'il est en amont de tout. Tant que le protocole n'atteint pas
ses candidates, la doctrine tierce, la lenteur et le recouvrement ne peuvent
pas être jugés — on ne sait pas si un faux positif vient d'une mauvaise
doctrine ou d'un rejeu qui n'a pas eu lieu. Réparer la rejouabilité, c'est
rendre les autres défauts mesurables avant de les corriger.

## 1. Le fait

Sur dix scans réels, le taux de candidates rejouables vaut 0/0, 3/3, 3/3,
**0/8**, **0/13**, 24/24, **0/187**, 20/62 (**1/22 groupes**), 38/38,
61/1 665 (**4/410 groupes**). Bimodal : le protocole marche ou il est
empêché, jamais entre les deux. Quand il marche (the-internet, quotes),
0 écartée à tort, contre-épreuves menées et concluantes. Quand il est
empêché, le rapport dit « aucune anomalie » — deux fois par accident, deux
fois en enterrant un vrai défaut (jQuery en http à books, images cassées à
demoqa). Deux causes nommées, et deux contributeurs.

**Cause A — le rejeu s'ouvre sur la mauvaise page (C-09).**
`actionsPrealablesDe` (`core/scanner/detection/commun.ts`) retient comme
préalables les actions de la MÊME page que l'action déclenchante ; quand
celle-ci est une navigation, ce sont les actions de la page d'ORIGINE (le
formulaire rempli avant de partir). Mais `reexecuteur.ts` ouvre
`reproduction.url` — la page d'ARRIVÉE, où l'anomalie a été observée — et y
cherche le formulaire de la page d'origine : `selecteur-introuvable`,
`limite-automatisation`, sur 100 % des candidates dès qu'un remplissage
précède une navigation. cutlybook : 0/8 (fiche 04). Latent sur tout site à
formulaire de connexion, d'inscription ou de contact — presque tous. C'est
la dette n°2, inscrite dès la brique 2 (« dérivation des actions préalables
limitée à la page courante… une approximation ») : elle nous rattrape
exactement là où on l'avait notée.

**Cause B — l'échéance mangée par l'exploration (C-06), sous trois formes.**
*Atteinte* pendant l'exploration : books (0/13, 237 remplissages vides),
expandtesting (0/187, pages de publicité à 10–27 s). *Non répartie* :
demoqa, l'exploration tient dans le budget de pages mais finit à +272 s et
laisse 5 s à la confirmation (1/22 groupes). *Non appliquée* :
automationexercise, la rédaction tourne 59 s au-delà de l'échéance, scan à
113 %. Les phases tirent sur la même horloge avec pour seule protection
`exploration.margeEcheanceMs` (5 000) et `confirmation.margeEcheanceMs`
(3 000) ; rien ne réserve, rien ne borne la dernière phase.

**Contributeurs.** *C-10* : le menu énumère `remplir` sur des formulaires
sans champ (`valeurs: []`) et vingt fois le même formulaire par page — la
déterministe remplit vingt fois rien avant d'avancer (books : 25 s par page
sur un catalogue statique). *C-04* : les rejeux de lenteur ne rapportent
aucune mesure (`mesure` absente sur les douze tentatives de getlumavo) — un
rejeu qui tourne sans mesurer est rejoué pour rien ; le vrai lent de
`/pricing` (22,9 s) a été écarté pour une mauvaise raison.

**Le chiffre qui manquait** existe depuis le 2026-09-25 dans la commande de
scan (APPRENTISSAGES n°18) ; il n'est ni dans la scorecard ni dans le
rapport.

## 2. Contrats — avant toute implémentation

1. **La recette de reproduction porte sa page d'ouverture.** Le contexte de
   reproduction distingue la page où l'anomalie a été OBSERVÉE (`url`,
   inchangé) de la page où les préalables se REJOUENT (`pageDepart` : la page
   où l'action déclenchante a été exécutée, `action.page`). Le rejeu ouvre
   `pageDepart`, rejoue les préalables, puis exécute l'action déclenchante —
   pour une navigation, c'est elle qui mène à `url`. Invariant en code, pas
   en config : une recette dont un préalable ne vient pas de `pageDepart` ne
   se construit pas (le type l'interdit, `tsc` rougit). Le contrôle qui peut
   échouer : un gabarit « formulaire puis navigation » (cutlybook en
   miniature — remplir sur une page, naviguer vers une page où une ressource
   échoue) rejoué à 0 % avant, 100 % après ; la mutation « ouvrir `url` » est
   tuée (METHODE §10). La levée complète de la dette n°2 (état venu de
   plusieurs pages, tunnel en trois étapes) reste HORS périmètre : ici, la
   page d'origine, pas la chaîne depuis le départ.

2. **L'échéance est répartie, réservée et appliquée à toutes les phases.**
   Réglages en config (`scan.repartition` : parts de l'échéance réservées à
   l'exploration, à la confirmation et à la rédaction — **en FRACTIONS de
   `scan.timeoutMs`**, tranché le 2026-09-29 : l'échéance de production est
   de 300 s, celle du banc de 60 s, et des réserves en millisecondes seraient
   absurdes sur l'une ou sur l'autre), invariant en code : la somme des
   fractions est strictement inférieure à 1, sinon la configuration est
   refusée au chargement. Conséquence portée au contrat : sur un budget
   serré, une fraction peut donner à la confirmation MOINS de temps qu'un
   seul rejeu n'en coûte ; le cas est détecté et journalisé (« réserve de
   confirmation insuffisante pour un rejeu », avec les deux nombres), jamais
   subi en silence. Le principe qui dépasse ce cahier : *le protocole de
   confirmation est le cœur du produit ; il ne peut pas être la variable
   d'ajustement du budget* — désormais c'est l'exploration qui se fait
   couper. L'exploration s'arrête (nouvel arrêt journalisé, par exemple
   `reserve-confirmation`) dès que le temps restant atteint la réserve de
   confirmation, quel que soit le budget de pages. La rédaction reçoit un
   budget et s'y tient : elle rédige dans l'ordre de gravité, s'arrête
   proprement, et le rapport DIT combien de sections n'ont pas été rédigées
   (voix : texte à garantie sémantique, `voix.ts`). `scan.fin.dureeMs` ne
   dépasse jamais `scan.timeoutMs` : propriété testée sur le banc avec un
   gabarit « site lent » (pages à délai configurable) ; mutation « la
   rédaction ignore son budget » tuée.

3. **Le menu n'énumère que ce qui se remplit.** Pas d'action `remplir` pour
   un formulaire sans champ remplissable (un bouton seul, c'est le web) ;
   les formulaires de même méthode, même action et même signature de champs
   sur une page ne valent qu'une action. Contrôle : gabarit « catalogue à
   boutons » (books en miniature, vingt cartes à formulaire-bouton) — zéro
   remplissage vide, échéance non atteinte ; mutation tuée. Les 43
   scénarios existants ne bougent pas (trois runs bit à bit).

4. **Un rejeu de lenteur mesure, ou dit qu'il n'a pas mesuré.** Chaque
   tentative de rejeu d'une candidate `d-lenteur` porte la durée observée de
   la ressource visée ; si la ressource n'a pas été rechargée, la tentative
   est `non-mesuree` — un troisième état, compté, jamais confondu avec
   « reproduite » ni « non reproduite ». Le verdict `jamais-reproduite`
   n'est rendu que sur des mesures présentes ; sans mesure, le groupe est
   `non-mesure` et le rapport le range avec les non-vérifiés. Contrôle : le
   gabarit L01 existant (lenteur transitoire) rend des tentatives mesurées ;
   mutation « mesure absente compte comme non reproduite » tuée.

5. **La rejouabilité est une famille de premier rang de la scorecard.** Par
   candidates ET par groupes (les deux divergent quand un seul gros groupe
   est rejoué : demoqa 20/62 mais 1/22), par langue et par gabarit, avec un
   seuil d'alarme en config (`scorecard.rejouabiliteMin`) ; publiée par
   `pnpm banc` comme elle l'est déjà par `pnpm scan`. Et le rapport business
   ne dit plus « aucune anomalie » quand rien n'a pu être vérifié : quand
   la rejouabilité est nulle, sa première ligne le dit (texte à garantie
   sémantique). Contrôle : la famille se calcule sur les 43 scénarios
   (aujourd'hui 100 % au banc — c'est le banc) et rougit sur le gabarit
   « formulaire puis navigation » avant correction.

6. **Validation sur le réel (METHODE §12).** Sites nommés à l'ouverture :
   **cutlybook** (cause A : 0/8), **expandtesting** (cause B : 0/187, pages
   lourdes), **books** (C-10 : 0/13, échéance par remplissages vides), et
   **the-internet** comme témoin (24/24 — ne doit pas bouger). L'« avant »
   est la fiche de campagne (même moteur `7f6aa1c`, même commande) ;
   l'« après » est un scan identique sur le moteur corrigé. Attendus, en
   config du cas et non en dur : rejouabilité de cutlybook et books au-dessus
   du seuil, expandtesting au-dessus de zéro avec une confirmation qui a eu
   sa réserve, the-internet à 24/24, scan.fin sous l'échéance partout, et
   aucune retenue nouvelle qu'un humain jugerait fausse. Outillage : un cas
   de validation rejouable par site (`banc/reel/<site>.json` : url, config,
   attendus) et la commande **`pnpm banc:reel`** — de la famille `banc:*`,
   l'espace des commandes de mesure, comme `banc:equivalence` : ce n'est pas
   un scan de campagne, c'est une mesure de non-régression du réel. Deux
   précautions, tranchées le 2026-09-29, parce que les quatre sites sont des
   cibles vivantes : **l'« avant » et l'« après » se mesurent dans la même
   session** (le moteur d'avant et le moteur d'après, à quelques minutes
   d'écart, jamais le « avant » d'un jour contre l'« après » d'un autre) ; et
   si un site est indisponible ou a changé de structure au moment du run
   (statut, nombre de pages, candidates hors de l'attendu), la validation le
   **déclare** au lieu de comparer des pommes et des poires — le fantôme de
   troisième espèce appliqué à la validation réelle. the-internet, le témoin,
   sert exactement à cela : s'il bouge, c'est le moteur ou le réseau, pas le
   site.

7. **Le rapport technique référence ses candidates au lieu de les recopier
   (C-13).** Une écartée ne porte plus son groupe entier avec tous ses
   membres ; elle référence la candidate et le groupe par identifiant, la
   preuve complète existe une fois. Ajouté à l'ouverture parce que la
   livraison attendue comprend « le journal du scan lourd redevenu
   raisonnable » : 42 Mo à 1 649 candidates est la conséquence directe de
   cette structure, et le cahier qui multiplie les rejeux réussis ne peut pas
   laisser grossir ce qu'il produit. Contrôle : un rapport à N candidates
   pèse en O(n), testé sur un rapport synthétique ; mutation « recopie »
   tuée. *C-16 (les découvertes au rejeu ne sont pas dédoublonnées par
   cause) reste dans P2-2 : dédoublonner « par cause » suppose la notion de
   cause de la doctrine tierce ; la taille du journal, elle, est C-13.*

8. **Une découverte n'est jamais publiée comme un défaut vérifié.** *Ajouté
   le 2026-09-29 après la première validation réelle, par arbitrage du
   propriétaire : élargir P2-1 plutôt que committer en l'état.* Le rejeu
   réparé a démasqué le défaut suivant : sur expandtesting, quarante
   anomalies constatées PENDANT les rejeux sont sorties `confirmee`, jamais
   re-testées, et le rapport s'ouvrait sur six sections « Bloquant » nées
   d'une seule iframe publicitaire. Le silence d'avant mentait par omission,
   ce bruit mentait ouvertement ; honnête et incomplet est acceptable, faux
   et affirmatif ne l'est pas. Le contrat : une anomalie constatée pendant
   une re-exécution — ou suspectée côté site par l'auto-diagnostic — porte
   le verdict `decouverte` (le troisième état épistémique de la brique 3,
   porté enfin par le rapport TECHNIQUE et non plus seulement par la phrase
   du rapport business), ne peut jamais sortir `confirmee`, et sa gravité
   est bornée sous « Bloquant » sans un re-test qui lui soit propre.
   Invariants en code, pas en config. Le rapport compte, dans sa méthode,
   les constats publiés sans re-test (texte à garantie sémantique) ; le banc
   compte un groupe de découverte comme publié, pas comme écarté ;
   `banc:reel` déclare non tenu tout site où une découverte serait publiée
   comme vérifiée. Mutation nommée : une découverte sort `confirmee` — des
   contrôles doivent rougir. Validation : expandtesting rejoué, plus aucune
   section « Bloquant » née d'un rejeu ; cutlybook et books inchangés ;
   the-internet 5/5 ; les 43 scénarios historiques intacts. HORS périmètre,
   et c'est tranché : le coût d'un rejeu à 29 s sur un site publicitaire
   (cahier de performance à part : rejeu sélectionné, cache de décisions),
   le dédoublonnage des découvertes par cause (C-16 plein, P2-2), la doctrine
   tierce (P2-2).

Aucun prompt ne change dans ce cahier ; aucune version de prompt ne bouge.

## 3. Budget

- **Banc** : 0 USD pour les rejeux. Les trois gabarits nouveaux (formulaire
  puis navigation, catalogue à boutons, site lent) demandent des cassettes
  de profilage et de rédaction : ≈ 6 scénarios × 0,05 USD ≈ **0,30 USD**.
- **Réel** : quatre sites, l'« avant » étant déjà mesuré par les fiches ;
  un « après » par site (0,002 à 0,16 USD selon les sections rédigées) et
  un second « après » pour lire la variance : ≈ 8 scans ≈ **0,60 USD**.
- **Annoncé : ≈ 0,90 USD, plafond 2,00 USD** pour l'ensemble du cahier —
  accepté le 2026-09-29. Tout dépassement s'annonce avant, pas après.

## 4. Hors périmètre

P2-2 (doctrine tierce — les candidates tierces restent ce qu'elles sont,
elles seront seulement rejouées ; C-16 y compris), P2-3 (recouvrement), P2-4
hors C-04, P2-5, le cahier n°2 de l'IA, la levée complète de la dette n°2
(état multi-pages) et C-07.

## 5. Livraison

Les sept contrats tenus, chacun avec son contrôle qui peut échouer et sa
mutation tuée ; les 43 scénarios existants à empreinte identique sur trois
runs ; la nouvelle famille dans la scorecard ; les quatre cas réels rejoués
et comparés, avec le jugement humain des retenues ; les fiches 04, 05, 06 et
07 annotées « revu après P2-1 » ; commit « P2-1 — la rejouabilité » à la
validation seulement.

### 5.1 Ce qui a été livré (2026-09-29)

**Contrats et mutations.** Chaque contrat moteur a son contrôle qui peut
échouer, et chaque mutation nommée a été jouée (METHODE §10) :

| contrat | mutation | ce qui a rougi |
|---|---|---|
| 1 | le rejeu ouvre `url` au lieu de `pageDepart` | N01 : 0/1 groupe rejoué, une anomalie réelle perdue, alarmes « pertes » et « rejouabilité » |
| 2 | l'explorateur reçoit l'échéance de confirmation au lieu de sa fraction | L02 : 0/1 groupe rejoué, alarme « rejouabilité » |
| 2 | la rédaction ignore son budget *(nommée par le cahier)* | trois tests du rapport (plafond de sections, délai d'appel, aucun appel sans temps) |
| 3 | les deux gardes de `remplir` retirées (sans champ, doublons) | K01 : 0/1 détecté, l'exploration n'atteint plus la dernière page |
| 4 | la ressource visée n'est plus mesurée au rejeu | L02 : `limite-automatisation / non-mesuree` au lieu de `non-reproduite`, verdicts corrects à 0 % |
| 4 | une mesure absente compte comme non reproduite *(nommée par le cahier)* | deux tests du verdict et du protocole |
| 5 | l'agrégat par gabarit vidé | son test ; la famille elle-même rougit sous la mutation du contrat 1 |
| 7 | chaque écartée recopie son groupe *(nommée par le cahier)* | deux tests du protocole, dont le test de poids en O(n) |

Deux mutations ont d'abord SURVÉCU (contrats 1 et 3) : les gabarits
reproduisaient le défaut, pas les conditions dans lesquelles il avait mordu.
« formulaire-puis-navigation » s'explore désormais sous `soumission: aucune`
(la déterministe soumettait, et la navigation partait d'une page sans
préalable) ; « catalogue-boutons » a huit pages et non trois (soixante
remplissages vides tenaient encore dans l'échéance du banc, cent quarante non).
Leçon : APPRENTISSAGES n°20, METHODE §10 étendu.

**Banc.** 55 scénarios (12 nouveaux, trois gabarits), sur cassettes :

| run | détectés | faux positifs | verdicts corrects | gravités conformes | rejouabilité (groupes) | coût des cassettes (USD) |
|---|---|---|---|---|---|---|
| déterministe ×3 | 39/41 | 0 | 39/41 | 33/33 | 39/39 (100 %) | 1,0396 |
| IA | 39/41 | 0 | 39/41 | 33/33 | 39/39 (100 %) | 1,9571 |

Les 43 scénarios existants gardent une empreinte IDENTIQUE à la référence
d'avant P2-1 (runs du 2026-09-25, déterministe et IA) sur les quatre runs :
statut, attendus, verdicts, faux positifs, comptes du protocole, coût,
profils, cibles, rapports. Les deux ratés déterministes sont F01 fr/en,
déjà ratés avant P2-1. Les deux ratés IA sont K01 fr/en : la politique IA
refuse de paginer un catalogue (« les pages 2 à 8 seraient des répétitions »)
et termine avant la page du défaut — un défaut de couverture (C-08, cahier
n°2), pas de rejouabilité.

**Réel** (`pnpm banc:reel --avant`, moteur de la campagne contre moteur P2-1,
même session) :

| site | rôle | rejouabilité avant → après (groupes) | retenues avant → après | durée après | verdict du cas |
|---|---|---|---|---|---|
| cutlybook | défaut C-09 | 0/5 → **6/6** | 0 → 5 | 193 s | **tenu** |
| books | défaut C-10 | 0/1 → **1/1** | 0 → 1 | 132 s | **tenu** |
| the-internet | témoin | 5/5 → 5/5 | 5 → 5 (les mêmes) | 190 s | **tenu, stable** |
| expandtesting | défaut C-06 | 0/98 → **2/94** | 0 → **41** | 290 s | **non tenu** (2,1 % < 10 %) |

Un second « après » (variance, une heure plus tard) rend les mêmes verdicts :
cutlybook 5/5, books 1/1, the-internet 5/5 avec les cinq mêmes retenues,
expandtesting 2/79 (2,5 %) avec 21 retenues dont 20 découvertes au rejeu et
deux sections `Bloquant` pour la même iframe publicitaire. Le constat
d'expandtesting n'est pas un tirage : il se reproduit, en plus petit.

Les quatre « avant » reproduisent leurs fiches : aucun site n'a changé de
structure, aucun n'est déclaré. Le premier passage a tourné avec une borne de
durée de 305 s, ramenée à 300 s (les marges de la config se prennent avant
l'échéance, jamais après) ; aucun scan ne s'en approchait. Journaux : 7,2 → 1,7 Mo (expandtesting),
2,9 → 0,8 Mo (books). Aucun scan « après » ne dépasse 300 s.

**Jugement humain des retenues nouvelles** (fiches 04 à 07, « Revu après
P2-1 ») : books, 1 vraie — le jQuery en http, la trouvaille que la campagne
avait perdue, mais étiquetée « service extérieur » et `mineur` ; cutlybook, 5
tierces (quatre fichiers d'une police, la télémétrie Stripe), vraies pour le
robot, non démontrées pour un visiteur, du bruit ; expandtesting, 40
découvertes au rejeu publiées `confirmee` sans avoir été re-testées (C-16),
dont six sections `Bloquant` pour une seule iframe publicitaire — **non
fondées**. Le critère « aucune retenue nouvelle qu'un humain jugerait
fausse » n'est PAS tenu sur expandtesting.

**Écarts au cahier, déclarés.**
- Contrat 1 : l'invariant est tenu en code, à l'exécution (constructeur
  unique `recetteDe` qui refuse une recette incohérente, garde du rejeu qui
  refuse de l'ouvrir), pas par le type : une page est une chaîne, `tsc` ne
  peut pas comparer deux valeurs. La voie typée existe — des préalables sans
  page propre, rejoués par construction sur `pageDepart` — et toucherait
  toutes les recettes des tests ; non faite.
- Noms de réglages : `echeance.repartition` (et non `scan.repartition`),
  `scorecard.rejouabiliteMinPourcent` (et non `rejouabiliteMin`).
- Contrat 4 : éprouvé au banc seulement ; aucun des quatre sites n'avait de
  lenteur.
- Contrat 5 : la table par gabarit est une seconde table, pour que chaque
  table ne porte qu'une partition (langues ou gabarits) et reste sommable.
- Contrat 6 : le seuil d'expandtesting (10 %) est celui du cas ; le cahier
  demandait « au-dessus de zéro avec une réserve servie », tenu à la lettre
  (2/94, réserve servie), mais la livraison attendue disait « proche du
  maximum » — c'est ce dernier critère qui compte, et il n'est pas tenu.
- C-16 reste hors P2-1 (§4) : la taille du journal est venue de C-13.

**Ce que la validation réelle a ouvert** : sur une page lourde, le coût d'un
rejeu PAR GROUPE (29 s par tentative, 54 groupes) borne la rejouabilité
quelle que soit la répartition ; et dès que le rejeu marche, C-16, C-12 et
C-05 deviennent visibles au client (carnet des correctifs, « État après
P2-1 »).

**Budget dépensé** : cassettes des 12 scénarios nouveaux 0,18 USD (43
appels) ; validation réelle avant/après 0,31 USD (huit scans) ; second
« après » pour la variance 0,24 USD (quatre scans). **Total 0,73 USD**, sous
les 0,90 annoncés et le plafond de 2,00.

### 5.2 Contrat 8 — livré et validé (2026-09-29, le soir)

**Arbitrage du propriétaire** après la première validation réelle : ne pas
committer un moteur dont la propre mesure montre un rapport client plus faux
qu'avant, élargir P2-1 d'un contrat étroit (§2, contrat 8).

**Mutations** (toutes jouées, chacune restaurée) :

| contrat | mutation | ce qui a rougi |
|---|---|---|
| 8 | une découverte sort `confirmee` *(nommée par le propriétaire)* | trois tests : la découverte au rejeu, la découverte « cause site », le site injoignable |
| 8 | la gravité du détecteur passe sans borne | la borne elle-même, et le site injoignable qui ressortait « Bloquant » |
| 8 | la méthode tait les constats non re-testés | le compte, dans les deux langues |
| 8 | le banc compte un groupe de découverte comme écarté | le test qui refuse d'en faire une « fausse alerte évitée » |
| 8 | `banc:reel` tient un site qui affirme une découverte | le test du critère |
| 1 | `recetteDe` accepte un préalable étranger | l'invariant du constructeur |
| 1 | le rejeu ouvre une recette incohérente | le test de la garde du rejeu, ajouté à cette occasion : elle n'en avait pas |

**Banc** : trois runs déterministes et un run IA après le contrat 8, tous
identiques aux runs d'avant le contrat (55/55 scénarios) et les 43
historiques identiques à la référence d'avant P2-1. Aucun scénario du banc ne
produit de découverte : le contrat 8 est éprouvé par les tests du protocole,
du rapport et du banc, et par le réel — un gabarit où un calque n'apparaît
qu'au rejeu manque au banc (METHODE §12), noté au carnet.

**Réel**, avant (moteur de la campagne) et après (moteur P2-1 avec le
contrat 8), même session :

| site | rejouables après (groupes) | retenues après | dont découvertes | découvertes affirmées | verdict du cas |
|---|---|---|---|---|---|
| cutlybook | 5/5 | 5, les mêmes | 0 | 0 | tenu |
| books | 1/1 | 1, la même | 0 | 0 | tenu |
| the-internet | 5/5 | 5, les mêmes | 0 | 0 | tenu, témoin stable |
| expandtesting | 2/101 | 37 | 36 | **0** | non tenu sur la rejouabilité seule (2 % < 10 %) |

**Jugement humain d'expandtesting** : plus aucune section « Bloquant » ; les
quinze découvertes que le détecteur classait « bloquant » (douze clics
interceptés par des iframes publicitaires, trois par un calque de la page)
sortent « Important », statut « Détecté pendant nos vérifications ; non
re-testé » ; la méthode dit « 63 autres signalements n'ont pas pu être
re-vérifiés » et « 36 constats de ce rapport ont été vus pendant nos
vérifications sans pouvoir être re-testés : ils sont présentés comme des
observations, pas comme des défauts établis ». La synthèse reste à
l'observation (« nous avons observé… ce qui mérite un examen »). Le rapport
est **honnête et incomplet** : six sections rédigées pour les mêmes iframes
publicitaires (C-16 plein, P2-2) et 63 groupes jamais rejoués (le coût du
rejeu, cahier de performance à part). Le seuil de 10 % du cas n'a pas été
baissé après coup : il reste la cible de ce cahier-là.

**Budget** : contrat 8, validation réelle avant/après 0,32 USD, aucune
cassette nouvelle. **Total du cahier : 1,05 USD** (annoncé 0,90 puis
≈ 1,04 à l'élargissement ; plafond 2,00).

Journal après d'expandtesting : `~/.config/zurvela/bestiaire/p2-1-reel-2026-09-29/contrat-8/`,
sha256 `62615ff2925f3e6a7d0b76b3c55f70d1401bb15275fa9d7a87f6cdcf474a5e30`.

### 5.3 Clôture — le contrat 8 éprouvé par le banc (dette n°20 levée)

expandtesting avait rendu 40, 20 puis 36 découvertes le même jour : une
référence qui change trois fois en une journée n'en est pas une. Le gabarit
« calque-au-rejeu » la remplace par une référence déterministe. D01 casse
l'image de vitrine de l'accueil (défaut ordinaire, rejoué) ; D02 pose sur les
trois boutons de l'accueil un calque qui n'apparaît qu'au-delà des deux
visites de l'exploration — donc pendant le rejeu de D01. D02 porte les deux
attendus : verdict `decouverte` à gravité bornée (contrat 8), et cause unique
(une cause, trois interceptions : la ligne de base de C-16 pour P2-2).

Ce que le banc a appris pour le porter : `noterVisite` (le compte de visites
se tient sur la requête, jamais au rendu que la vérification du démarrage
appelle aussi), `seulementEnCombinaison` (pas de scénario seul, qui ne
mesurerait rien, et un refus si aucune combinaison ne le contient),
`causeUnique` et la mesure « une cause, un constat » dans la scorecard, et
les camps du manifeste lus en « publié » (`VERDICTS_PUBLIES`).

**Mutations tuées AU BANC** (combinaison D01 + D02, sans IA) :

| mutation | ce qui a rougi |
|---|---|
| la découverte sort `confirmee` | verdicts corrects 100 % → 50 % |
| la gravité du détecteur passe sans borne | gravités conformes 100 % → 50 % |
| le calque paraît dès l'exploration | 3 faux positifs, verdicts et gravités à 50 % |
| les découvertes rentrent dans la rejouabilité | 25 % et alarme |

**Un défaut de l'instrument, révélé par le gabarit et corrigé** : les groupes
de découverte entraient dans le dénominateur de la rejouabilité, comptés
« non rejoués ». Un protocole qui avait tout rejoué sortait à 25 %. Par sa
propre définition, la métrique compte les candidates DU SCAN que le protocole
devait re-tester ; une découverte n'en est jamais une. Ce n'est pas un seuil
(METHODE §13) : c'est le périmètre de la mesure, corrigé avec une
justification qui ne dépend d'aucun résultat, et publié. Effet sur les
chiffres déjà publiés d'expandtesting, recalculés sur les journaux archivés :
premier après 2/54 (3,7 %) au lieu de 2/94, variance 2/59 (3,4 %) au lieu de
2/79, contrat 8 2/65 (3,1 %) au lieu de 2/101. Toujours sous le seuil de
10 %, qui ne bouge pas.

**Un incident, et sa garde** : les deux bugs du gabarit se sont d'abord appelés
R01 et R02 — identifiants déjà pris par « formulaire-contact » et
« mini-boutique ». La config range les paramètres de bug par identifiant ;
ceux du R01 de « formulaire-contact » ont été écrasés, et le premier run
complet du banc est tombé à son vingtième scénario, au démarrage du serveur.
Renommés D01 et D02 ; et le test du registre vérifie désormais que chaque bug
de chaque gabarit accepte les paramètres que la config lui donne — mutation
jouée : la collision remise, le test rougit.

**Budget de la clôture** : cassettes des six scénarios nouveaux 0,23 USD (22
appels), au-dessus des 0,15 annoncés — chaque section de découverte coûte une
rédaction. **Total du cahier : 1,28 USD** sur un plafond de 2,00.

**Banc de clôture** : 61 scénarios (6 nouveaux), trois runs déterministes
identiques entre eux et un run IA ; les 43 historiques identiques à la
référence d'avant P2-1, déterministe et IA ; les 55 scénarios d'avant le
gabarit identiques à leur dernier run.

| run | détectés | faux positifs | gravités conformes | rejouabilité (groupes) | une cause, un constat |
|---|---|---|---|---|---|
| déterministe ×3 | 45/47 | 0 | 39/39 | 43/43 (100 %) | 4 en double sur 2 causes uniques |
| IA | 45/47 | 0 | 39/39 | 43/43 (100 %) | 4 en double sur 2 causes uniques |

Les ratés sont ceux d'avant : F01 fr/en en déterministe, K01 fr/en en IA.
Le contrat 8 est désormais éprouvé par l'instrument, et P2-2 s'ouvrira sur une
ligne de base mesurée : 2 constats en double par langue pour un seul calque.
