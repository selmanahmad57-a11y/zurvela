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
