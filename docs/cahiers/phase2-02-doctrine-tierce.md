# ZURVELA — Cahier P2-2 : la doctrine tierce

Ouvert le 2026-09-29, deuxième cahier de la Phase 2, dans l'ordre du carnet
figé. Régime : COMPLET — moteur (détection, consolidation, rapport), prompt
de rédaction (nouvelle version), banc (nouveau gabarit à seconde origine),
réel (validation, METHODE §12). Contrats d'abord ; validés par le
propriétaire le 2026-09-29 (« Valide, committe le cahier P2-2, et lance par
les contrats »), décisions D2 à D4 tranchées (§6). Budget en §3, accepté.

**Pourquoi en second** : P2-1 a rendu le jugement POSSIBLE — le protocole
atteint ses candidates. P2-2 rend le jugement JUSTE — il cesse de retenir le
bruit tiers. Huit sites sur neuf de la campagne portent ce défaut, sa cause
racine est trouvée (APPRENTISSAGES n°19), et il est le plus grave par ses
deux faces : il publie du faux partout, et il enterre de vrais défauts sous
l'étiquette « tiers-mineur ». C'est lui qui fait l'essentiel des faux
positifs du carnet figé.

## 0. Décision en tête — l'identité déclarée est maintenue

**Tranché le 2026-09-29 par le propriétaire, définitivement, et inscrit ici
comme décision, pas comme question.** Zurvela se déclare : `ZurvelaBot` et
l'en-tête `X-Zurvela-Scan` (constitution §3). Une partie des faux positifs
de la campagne vient de là : Google sert au robot déclaré un format de
police hérité (TTF) là où un navigateur reçoit du woff2, une page 403 là où
un navigateur reçoit le script de Sign-In. La tentation de masquer le robot
pour « voir ce qu'un visiteur voit » est **rejetée** : se déclarer est un
engagement de la page `/robot`, éthique et juridique avant d'être technique,
et un scanner qui se déguise pour contourner ce qu'on lui sert délibérément
est le comportement que Zurvela refuse dès son mode universel. **On garde
l'identité ; on répare le jugement.** Aucun contrat de ce cahier ne touche au
user-agent, à l'en-tête, ni à aucune forme d'imitation d'un navigateur.

## 1. Le fait

- **Le robot ne voit pas le même web** (APPRENTISSAGES n°19) : polices
  Google Fonts en `ERR_FAILED` sur trois sites sur neuf, Google Sign-In
  bloqué ORB, télémétrie Stripe en `ERR_FAILED` — tous servis autrement au
  robot, aucun effet visible pour le visiteur. La doctrine A.1, écrite pour
  « le tiers en panne », les compte comme des pannes.
- **Le volume** : expandtesting, 173 candidates tierces sur 187 ;
  automationexercise, dix-neuf sections tierces sur dix-neuf ; cutlybook,
  après P2-1, cinq retenues toutes tierces (quatre fichiers d'une police et
  la télémétrie Stripe).
- **La face cachée** : books charge jQuery en `http://` depuis une page
  `https://` — le navigateur le bloque pour CHAQUE visiteur. C'est un vrai
  défaut du site, publié depuis P2-1 mais sous « un service extérieur ne
  répond pas », gravité `mineur`. Même cas pour une police en http à
  automationexercise. La doctrine confond l'hôte qui sert la ressource et la
  partie qui est en faute.
- **La prose** ne nomme jamais le tiers (C-03) : « un service extérieur »
  alors que la preuve porte `accounts.google.com`.
- **Les doublons** (C-16) : une cause, plusieurs sections — six sections
  « Bloquant » pour une iframe publicitaire à expandtesting avant le
  contrat 8 ; au banc, la ligne « une cause, un constat » publie depuis la
  clôture de P2-1 sa ligne de base : 4 constats en double sur 2 causes.

## 2. Contrats — avant toute implémentation

1. **Une ressource tierce se juge à son EFFET VISIBLE, pas à sa requête.**
   Le critère se déplace de « la requête a-t-elle échoué ? » vers « la page
   rendue en est-elle affectée ? ». Une ressource d'une autre origine qui
   échoue, pour quelque raison que ce soit — réponse différente au robot,
   blocage du navigateur (`ERR_BLOCKED_*`, ORB), panne franche —, ne devient
   une candidate QUE si un effet visible en est constaté dans la page. Effet
   visible, défini par des signaux physiques et universels (c'est le web,
   jamais le monde) :
   - une image dont la source est la ressource échouée n'est pas rendue
     (`etat-image`, largeur naturelle nulle) ;
   - un sous-cadre dont le document a échoué occupe une surface visible ;
   - un script échoué est suivi, sur la même page et dans la fenêtre
     d'observation, d'une erreur JavaScript non interceptée.
   Tout le reste (police, feuille de style, balise, mesure d'audience,
   consentement publicitaire) n'est pas jugé : journalisé
   (`tiers.sans-effet`, avec l'hôte, le type de ressource et l'erreur),
   COMPTÉ dans la sortie du scan et dans la scorecard — un silence qui ne se
   compte pas est un angle mort (n°4) —, jamais publié. Invariant en code.
   Contrôle DANS LES DEUX SENS — un jugement trop étroit enterre de vrais
   défauts, un jugement trop large republie le bruit, et une vérification
   qui ne peut rater que d'un côté ne prouve que la moitié : au banc, un
   tiers qui casse AVEC effet visible doit être publié, un tiers qui casse
   SANS effet doit être tu (§2.6). Mutations : « le critère d'effet retiré »
   (des faux positifs apparaissent) et « tout tiers jugé sans effet » (le
   tiers à effet visible est raté).

2. **Deux axes : à qui la FAUTE, et l'effet est-il VISIBLE.** L'axe n'est
   pas « quel hôte sert la ressource » : jQuery vient du CDN de Google, mais
   c'est le site qui l'appelle en `http://`. Quatre cases, deux publiées :
   - *faute du site* — ressource interne en échec (inchangé) ; **contenu
     mixte** (une page `https` charge une ressource en `http`, quel qu'en soit
     l'hôte) : défaut de SÉCURITÉ du site, publié même sans effet visible,
     sous une description propre (`contenu-mixte`), catégorie et gravité en
     config, jamais sous « tiers » ;
   - *dépendance à effet visible* — un tiers en échec dont l'effet se voit
     (contrat 1) : publié et **imputé au site**, parce que c'est le site qui
     a choisi de dépendre (n°19) ;
   - *tiers sans effet visible* : ni retenu ni publié (contrat 1) ;
   - *fenêtre du robot* (réponse différente au robot déclaré) : même case que
     la précédente — le moteur ne peut pas la distinguer d'un tiers sans
     effet sans masquer son identité, et §0 l'interdit.
   Contrôle : au banc, un tiers à effet visible publié et imputé au site, un
   tiers sans effet non publié ; le contenu mixte ne se reproduit pas sur le
   banc, servi en `http` local (un navigateur ne signale le contenu mixte que
   sur une page `https`) — il est éprouvé par les tests du détecteur sur des
   signaux construits, et par le réel (books, automationexercise). Déclaré
   ici plutôt que découvert plus tard.

3. **La prose peut nommer l'origine (C-03).** Quand une anomalie publiée
   porte une origine identifiable (dépendance à effet visible, contenu
   mixte), les faits transmis à la rédaction portent son HÔTE, validé comme
   un nom d'hôte et traité comme une donnée non fiable (§3 de la
   constitution : il vient de la page ; le rappel anti-injection du prompt le
   couvre). La prose nomme cet hôte ; elle ne lui attribue PAS de nom de
   produit (« Google Sign-In ») — ce serait une connaissance du monde posée
   par le modèle dans une phrase que nous garantissons, et une page pourrait lui
   suggérer un faux nom. **Tranché (D3)** : la prose garantie nomme ce que la
   preuve contient, jamais ce que le modèle en déduit. Le prompt de rédaction change :
   il passe en **v2** (des cassettes existent sous v1, METHODE §6), et sa
   variance se mesure AVANT sa première cassette (n°14, n°16).

4. **Une cause, un constat (C-16).** Les interceptions de clic se regroupent
   par INTERCEPTEUR — la cause —, et non par élément intercepté : un calque
   sur trois boutons est un défaut, publié une fois, avec les trois éléments
   en localisations. Même règle pour les découvertes au rejeu. Contrôle : la
   ligne « une cause, un constat » du banc passe de 4 à **0** sur
   « calque-au-rejeu » ; une fois tenue, elle devient une ALARME (un double
   sur une cause déclarée unique fait rougir le banc) — une ligne de base qui
   ne devient pas un invariant après correction n'aurait rien protégé.
   Mutation : regrouper par élément ciblé — la ligne remonte, l'alarme sonne.

5. **La lenteur d'un tiers n'est pas une candidate (part tierce de C-02).**
   `d-lenteur` ne fabrique plus de candidates pour une ressource d'une autre
   origine : un tiers lent sans effet visible est du bruit (contrat 1), et un
   tiers lent à effet visible tombe sous le contrat 1. La lenteur des
   ressources du site est inchangée (P2-4).

6. **Le banc gagne des tiers qui répondent autrement au robot** (n°17 : des
   anomalies fausses par construction). Un gabarit à seconde origine, dont le
   serveur tiers sert selon le `User-Agent` : au robot déclaré, une police en
   403 HTML (sans effet visible — attendu : **rien de publié**) ; un script
   dont la page a besoin, qui échoue et dont l'absence produit une erreur
   JavaScript et un contenu manquant (attendu : publié, imputé au site) ; une
   image tierce absente (attendu : publiée). Chaque attendu a sa mutation
   tuée AU BANC avant sa première cassette (METHODE §10, n°20).
   **Scénario historique qui change, déclaré d'avance** : X01
   (« formulaire-contact », script tiers en 5xx que la page n'utilise pas).
   Il ne disparaît pas : il CHANGE D'ATTENDU — d'« anomalie tierce mineure
   publiée » à « tiers sans effet, compté et non publié » (D2). C'est un
   attendu POSITIF : le banc vérifie que le moteur a vu le tiers en panne et
   s'est tu, pas que rien n'est arrivé ; un X01 qui disparaîtrait pour une
   mauvaise raison (tiers jamais chargé, compte à zéro) doit faire rougir le
   banc. Tout autre scénario historique garde son empreinte.
   **Limite déclarée, inscrite en dette** : le contenu mixte ne se reproduit
   pas au banc servi en `http` local (dette n°21, condition de levée : un
   gabarit en `https` dès que le serveur du banc sait servir en local avec
   un certificat auto-signé).

7. **Validation sur le réel (METHODE §12), sur les neuf sites distincts de
   la campagne**, trois moteurs dans la même session : la campagne
   (`e872872`), P2-1 (`7936175`) et P2-2. Le premier écart dit ce que les
   deux cahiers ont rendu ensemble — c'est le **bilan des dix scans** du
   backlog, mesuré ici plutôt qu'à part (§6, D4) ; le second isole P2-2.
   Attendus, écrits dans les cas AVANT le run (METHODE §13) :
   - **zéro section tierce sans effet visible** sur les neuf sites — le
     chiffre qui, agrégé, dit de combien P2-2 rapproche Zurvela du zéro faux
     positif ;
   - le contenu mixte de books et d'automationexercise publié comme défaut
     du site, sous sa description propre, hôte nommé ;
   - automationexercise sous cinq sections (carnet figé) ;
   - cutlybook : ses cinq retenues tierces disparaissent (polices, Stripe) ;
   - **témoin** : the-internet garde ses retenues NON tierces (deux images
     404, le modal) et perd sa seule retenue tierce (Optimizely) — le témoin
     d'un cahier qui change le jugement tiers est la part qu'il ne doit pas
     toucher ;
   - la rejouabilité ne régresse sur aucun site ;
   - jugement humain de chaque retenue, avant et après.

Aucune règle ne porte sur un nom de service, un hôte ou une langue : les
critères sont l'origine, le schéma d'URL, le type de ressource et des signaux
physiques de rendu.

## 3. Budget

Estimé avec le terme que l'apprentissage n°23 impose (une section, une
rédaction ; un prompt de rédaction nouveau ré-enregistre tout) :

- **Prompt de rédaction v2** : éprouver sa variance avant la première
  cassette ≈ **0,30 USD** ; ré-enregistrer toutes les cassettes de rédaction
  du banc (61 scénarios, deux politiques) ≈ **1,40 USD**.
- **Gabarit à seconde origine** : profil, décisions IA et rédaction de ses
  scénarios fr/en ≈ **0,25 USD**.
- **Réel** : neuf sites × trois moteurs ≈ **1,30 USD** (le moteur de la
  campagne coûte peu, faute de rejeu ; P2-1 et P2-2 rédigent).
- **Annoncé : ≈ 3,25 USD, plafond 4,50 USD.** Tout dépassement s'annonce
  avant, pas après — et l'estimation se refait à mi-parcours, une fois le
  nombre de sections de v2 connu au banc.

## 4. Hors périmètre

C-12 (recouvrement fermable) et C-11 (fusion des viewports) : P2-3. C-02
hors tiers et le reste de C-04 : P2-4. Le coût d'un rejeu par groupe sur les
pages publicitaires (expandtesting à 3,1 % de rejouabilité) : cahier de
performance à part. C-14, C-15 : P2-5. Le cahier n°2 de l'IA (C-01, C-08) et
les ratés IA de K01. Tout ce qui imiterait un navigateur (§0).

## 5. Livraison

Les sept contrats tenus, chacun avec son contrôle et sa mutation tuée ; les
scénarios historiques à empreinte identique sauf ceux déclarés au §2.6 ; la
ligne « une cause, un constat » à zéro et devenue alarme ; la scorecard avec
les tiers sans effet comptés ; les neuf sites rejoués sur trois moteurs, avec
le jugement humain des retenues ; les fiches annotées « revu après P2-2 » ;
commit « P2-2 — la doctrine tierce » à la validation seulement.

## 5.1 Ce qui est livré (2026-09-30)

**Contrat 1 — l'effet visible.** `core/scanner/detection/effet-visible.ts` :
image non rendue (`etat-image`, largeur naturelle nulle), sous-cadre visible
(`etat-cadre`, nouveau signal), script suivi d'une erreur JavaScript dans la
fenêtre d'observation. Tout le reste n'est pas jugé : marqué
`sansEffetVisible`, écarté d'office au verdict `sans-effet`, journalisé
(`tiers.sans-effet`, avec l'hôte et le type), compté dans la sortie du scan et
dans la scorecard. Le contrôle est POSÉ DANS LES DEUX SENS au banc (W01 tu,
W02 publié) et dans les deux sens en test (un seul membre à effet visible
suffit à faire juger le groupe). Mutations tuées : critère retiré, tout jugé
sans effet.

**Contrat 2 — les deux axes.** Le contenu mixte se teste AVANT l'origine, sur
les sous-ressources de toute page `https`, quel qu'en soit l'hôte : c'est un
défaut de SÉCURITÉ du site (`contenu-mixte`), jamais un tiers en panne.
Vérifié sur le réel : books publie `ajax.googleapis.com` en `Important ·
Sécurité` là où P2-1 disait « un service extérieur ne répond pas » en
`Mineur` ; automationexercise de même avec `fonts.googleapis.com` sur vingt
pages. Le banc ne peut pas le reproduire (dette n°21, déclarée d'avance).

**Contrat 3 — l'hôte, par la VOIE GRATUITE.** Deux versions de prompt ont
essayé de faire écrire l'hôte par le modèle : v2 en le permettant (0 hôte
nommé sur 5 appels mesurés — une permission perd contre deux interdictions
fortes), v3 en l'exigeant (prose refusée pour cause de chiffre). Les deux sont
abandonnées. Le RAPPORT pose l'hôte lui-même, à côté de la prose, dans la
table de voix typée par langue — le patron savait déjà poser des phrases
écrites par le code. Conséquences : le modèle ne voit plus l'hôte du tout,
l'exemption aux chiffres disparaît (la règle redevient sans exception),
l'hôte affiché est CELUI DE LA PREUVE, il est échappé comme un chemin, et il
paraît même dans un rapport structurel sans aucune prose — ce que la voie
modèle n'aurait jamais pu faire. Le prompt reste en **v1**, inchangé : le parc
de cassettes tient, et son ré-enregistrement (1,40 USD) est annulé. Cinq
mutations tuées : prompt qui redemande l'hôte, hôte montré au modèle, hôte
divergent de la preuve, hôte non échappé, ligne supprimée.

**Contrat 4 — une cause, un constat.** Regroupement à deux niveaux : les
PREUVES par cible (page × élément × viewport), les CAUSES par intercepteur.
La cible sert la haute confiance d'un clic refusé qui ne connaît pas son
intercepteur ; la cause sert la publication. La ligne « une cause, un
constat » du banc passe de 4 à **0** et devient une ALARME.

**Contrat 5 — la lenteur tierce.** `d-lenteur` ignore les ressources d'une
autre origine. Effet mesuré sur le réel : automationexercise passe de 1 157 à
360 candidates à nombre de pages égal.

**Contrat 6 — le gabarit à seconde origine.** `tiers-au-robot` : W01 (police
servie au navigateur avec l'en-tête CORS, refusée au robot déclaré — silence
attendu), W02 (script d'avis en panne que la page appelle — publication
attendue). X01 change d'attendu comme déclaré : `confirmee` → `sans-effet`,
0 section publiée, coût 0,035 → 0,001 USD.

**Contrat 7 — la validation sur le réel** : §5.2.

## 5.2 Les trois moteurs sur les neuf sites (2026-09-30, 1,1576 USD)

Campagne (`e872872`), P2-1 (`7936175`) et P2-2, dans la même session, sur
l'état vivant du jour. Sections publiées au client :

| site | rôle | campagne | P2-1 | P2-2 |
|---|---|---|---|---|
| automationexercise | défaut | 24 | 29 | 29 |
| books | défaut | 0 | 1 | 1 |
| cutlybook | défaut | 0 | 5 | 0 |
| demoqa | défaut | 0 | 3 | 6 |
| expandtesting | défaut | 0 | 16 | 20 |
| getlumavo | témoin | 1 | 1 | 0 |
| quotes | témoin | 3 | 3 | 1 |
| the-internet | témoin | 5 | 5 | 4 |
| zurvela | témoin | 0 | 0 | 0 |
| **total** | | **33** | **63** | **61** |

**Jugement humain de chaque section publiée** — un tiers en échec sans effet
visible est du bruit ; un tiers appelé en `http` depuis une page `https` est
un vrai défaut du site, même quand le moteur le publiait sous une mauvaise
étiquette :

| moteur | vraies | fausses | taux de faux positifs |
|---|---|---|---|
| campagne | 6 | 27 | 82 % |
| P2-1 | 12 | 51 | 81 % |
| P2-2 | 24 | 37 | 61 % |
| P2-2 + correctif §5.3 | 24 | 0 | **0 %** — recalculé sur ce run |
| **P2-2 + correctif, RUN DE MESURE** | **14** | **0** | **0 % — MESURÉ** |

La ligne « recalculé » applique le correctif de §5.3 aux journaux du run de
16 h, groupe par groupe. Ce qu'elle établit, et qui ne dépend d'aucun autre
run : sur les MÊMES candidates, les vraies anomalies restent à **24** avant
et après le correctif — le bruit est retiré sans qu'un seul signal soit
perdu. Réduire les faux positifs en jetant les vrais serait facile et sans
valeur. La ligne « mesuré » est le run de 20 h ; son écart de vraies
anomalies est expliqué au §5.5.

**77 groupes tiers tus** sur les neuf sites, par hôte :
`fundingchoicesmessages.google.com` (41), `fonts.gstatic.com` (29),
`maps.googleapis.com`, `m.stripe.com`, `www.google-analytics.com`,
`cdnjs.cloudflare.com`, `pagead2.googlesyndication.com`,
`accounts.google.com`, `298279967.log.optimizely.com`. Par type : 45 `xhr`,
29 `font`, 2 `script`, 1 `document` — dont 74 tus par DÉFAUT et non par
mesure (dette n°22).

**Témoins** : the-internet garde ses quatre retenues non tierces (deux images
404, deux interceptions) et perd sa seule retenue tierce (Optimizely) —
l'attendu exact. quotes garde son interception et perd ses deux polices.
getlumavo et zurvela sortent NON TENU sur une rejouabilité « — » : ils n'ont
plus rien à rejouer, ce qui était le résultat attendu, et le critère n'a pas
de règle pour le dénominateur vide (dette n°23). Le seuil n'a pas bougé
(METHODE §13).

**Attendus non tenus, déclarés** : automationexercise sort à 7 sections utiles
et non 5 — six intercepteurs distincts, donc six causes sous la règle du
contrat 4, plus le contenu mixte ; les fondre demanderait une cause au-dessus
des éléments (C-12, P2-3). Trois sites déclarés NON TENU par le dénominateur
vide (dette n°23). Deux sites déclarés « structure changée », donc non jugés.

## 5.3 Ce que le réel a trouvé, et que le banc ne pouvait pas voir

Le contrat 1 était juste et ne gardait qu'une porte. Un groupe atteint le
rapport par deux chemins — les candidates du scan et les DÉCOUVERTES du rejeu
(P2-1, contrat 8) — et le filtre n'était posé que sur le premier :
automationexercise a publié 22 sections « service extérieur » pour le
gestionnaire de consentement de Google, expandtesting 14. Les deux contrats
venaient de cahiers différents, et aucun scénario ne croisait les deux
(APPRENTISSAGES n°25).

**Réparé** par une fonction unique que les deux portes appellent
(`tiersSansEffetVisible`), avec sa journalisation et sa trace d'écartée.
Mutations tuées en test — filtre retiré de la seconde porte, seconde porte
qui tait tout — et AU BANC, sur le gabarit qui manquait :

- **W03 `mesure-tardive-au-rejeu`** : une balise de mesure tierce que rien
  ne rappelle, servie normalement pendant l'exploration, en panne au-delà de
  `visitesAvantPanne` — donc pendant le rejeu, donc en découverte, sans effet
  visible. Attendu : `sans-effet`.
- **W04 `logo-introuvable`** : l'image interne qu'on rejoue, et dont le rejeu
  fait tomber la balise. Catégorie `visuel` — le manifeste refuse, à juste
  titre, deux attendus de camps opposés sur la même catégorie et la même page.

Mutations au banc : le filtre retiré de la seconde porte fait tomber les
verdicts corrects de 100 % à 50 % (`fonctionnel` à 0 %) et le compte des
tiers tus de 1 à 0 ; la seconde porte qui tait tout fait perdre la découverte
à effet visible de `calque-au-rejeu` (1 anomalie perdue, 1 erreur, verdicts
à 50 %).

Le banc a lui-même trouvé un défaut dans le correctif : un silence de
découverte n'apparaissait pas parmi les écartées, donc le correcteur ne
pouvait l'apparier — et une revue n'aurait pas su de quoi le moteur s'était
tu. La trace est posée, et le test unitaire l'exige désormais.

Effet de bord réparé au passage : automationexercise passait 21 de ses 29
sections sans prose (plafond de rédaction). À 7 sections, tout tient.

**Le banc après correctif, 71 scénarios** (les quatre nouveaux : W03+W04 et
W04 seul, en fr et en en) :

| run | scénarios | détection | faux positifs | erreurs | verdicts corrects |
|---|---|---|---|---|---|
| déterministe | 71 | 55/57 (96,5 %) | 0 | 0 | 100 % |
| cassettes (IA) | 71 | 55/57 (96,5 %) | 0 | 0 | 100 % |

Profilage 35/35, inerties 8/8, **couverture de rédaction 100 % (43/43)**,
zéro rapport sans prose, « une cause, un constat » à 0 sur 2 défauts déclarés,
écart inter-langues 0,2 pt. Les deux ratés sont les connus : `mini-boutique`
F01 en déterministe, `catalogue-boutons` K01 en IA (hors périmètre, §4).

**Les 67 scénarios historiques ont une empreinte IDENTIQUE** — verdicts,
groupes, sections, faux positifs — au run d'avant correctif. Le correctif est
strictement additif au banc, et c'est le réel seul qui le mesure.

**Coût du correctif : 0,00 USD.** Les deux scénarios neufs n'ont demandé
aucune cassette : leur contexte de rédaction est celui, déjà enregistré sous
P2-1, d'une vitrine à une image manquante (`calque-au-rejeu--d01`). Une
cassette est adressée par son contenu ; deux situations que le modèle voit
identiques partagent légitimement sa réponse.

## 5.3bis État de la validation au commit (2026-09-30)

Le cahier a été committé (`4a2deb1`) avec sa **validation banc COMPLÈTE**
(71 scénarios, déterministe et cassettes, empreintes historiques
identiques, mutations tuées des deux côtés de chaque contrat) et une passe
de validation réelle restante. **Cette passe est faite** : §5.5. Les 0 % ne
sont plus une projection.

**Budget P2-2** : 1,14 (voie prompt abandonnée) + 0,169 (cassettes du
gabarit) + 1,1576 (trois moteurs) + 0,3376 (run de mesure) = **2,80 USD**,
sous les 3,25 annoncés et loin du plafond de 4,50. Les 1,40 de
ré-enregistrement du parc ont été annulés par la voie gratuite du contrat 3,
et les cassettes de W03/W04 n'ont rien coûté.

## 5.4 Annotation des fiches — « revu après P2-2 »

Le carnet figé vit hors du dépôt. Voici, site par site, ce qu'il y a à y
reporter ; les cas `banc/reel/<site>.json` ne sont PAS modifiés (leurs
attendus ont été écrits avant le run, METHODE §13).

| fiche | site | revu après P2-2 |
|---|---|---|
| 01 | zurvela | inchangé : zéro candidate, rien à rejouer ; NON TENU par dénominateur vide (dette n°23) |
| 02 | getlumavo | sa seule section (`accounts.google.com`, sans effet) disparaît ; rapport vide ; témoin « déplacé » pour la bonne raison |
| 04 | cutlybook | ses cinq sections (quatre polices + télémétrie Stripe) disparaissent ; rapport vide |
| 05 | books | jQuery en `http` requalifié : `contenu-mixte`, `Important · Sécurité`, hôte `ajax.googleapis.com` nommé, 20 pages |
| 06 | the-internet | témoin tenu : garde ses deux 404 internes et ses deux interceptions, perd sa seule tierce (Optimizely) |
| 07 | expandtesting | 26 groupes tiers tus ; 14 découvertes tierces restaient publiées avant le correctif de §5.3 ; rejouabilité 7,3 → 50 % ; structure changée (13 pages < 15), donc déclaré et non jugé |
| 08 | demoqa | le bruit tiers ne consomme plus le budget de rejeu : 2 images cassées et 3 interceptions APPARAISSENT ; rejouabilité 41,7 → 100 % ; structure changée (16 pages < 20), déclaré et non jugé |
| 09 | quotes | témoin tenu : garde son interception, perd ses deux polices |
| 10 | automationexercise | 37 groupes tiers tus ; contenu mixte publié (`fonts.googleapis.com`, 20 pages) ; six intercepteurs distincts, donc six sections sous le contrat 4 ; rejouabilité 1,7 → 16,3 % ; candidates 1 157 → 360 à pages égales (contrat 5) |

## 5.5 Le run de mesure (2026-09-30 20 h, 0,3376 USD)

Le seul moteur d'après, sur les neuf sites, trois heures après les deux
moteurs de référence — écart DÉCLARÉ (§5.3bis). Ce qui doit être simultané,
c'est l'avant et l'après du moteur qu'on répare ; les moteurs figés de 16 h
restent la comparaison.

| site | publiées | vraies | bruit | groupes tiers tus | verdict |
|---|---|---|---|---|---|
| automationexercise | 3 | 3 | 0 | 42 | NON TENU (rejouabilité 8,8 % < 10 %) |
| books | 1 | 1 | 0 | 0 | TENU |
| cutlybook | 0 | 0 | 0 | 5 | NON TENU (dénominateur vide, dette n°23) |
| demoqa | 5 | 5 | 0 | 4 | TENU |
| expandtesting | 0 | 0 | 0 | 20 | déclaré (8 pages < 15) |
| getlumavo | 0 | 0 | 0 | 1 | NON TENU (dénominateur vide) |
| quotes | 1 | 1 | 0 | 2 | TENU |
| the-internet | 4 | 4 | 0 | 1 | TENU |
| zurvela | 0 | 0 | 0 | 0 | NON TENU (rien à scanner) |
| **total** | **14** | **14** | **0** | **75** | 4 tenus, 4 non tenus, 1 déclaré |

**Zéro découverte publiée sur les neuf sites** : la seconde porte est
fermée, mesurée, et non plus recalculée. **Zéro section sans prose** :
l'effet de bord du volume a disparu. Deux hôtes nommés par le code,
`ajax.googleapis.com` (books) et `fonts.googleapis.com`
(automationexercise), tous deux en contenu mixte, `Important · Sécurité`.

**L'écart de vraies anomalies, 24 → 14, n'est PAS imputable au correctif**
et se lit site par site. Quatre sites rendent exactement les mêmes
anomalies qu'à 16 h : books (1), demoqa (5), quotes (1), the-internet (4) —
onze sur onze. Les dix manquantes sont sur les deux seuls sites dont
l'exploration a été moins profonde ce soir : automationexercise (3 au lieu
de 7 — 2 intercepteurs atteints au lieu de 6, rejouabilité 16,3 → 8,8 %) et
expandtesting (0 au lieu de 6 — 8 pages explorées au lieu de 13,
1 groupe rejoué sur 7). Ce sont précisément les deux sites du **coût d'un
rejeu par groupe**, déclaré hors périmètre au §4 et renvoyé au cahier de
performance : le moteur n'a pas jugé autrement, il a eu moins de budget pour
atteindre. Le seuil d'automationexercise n'a pas bougé (METHODE §13) et son
échec reste rouge.

## 6. Décisions à valider avant le code

**Toutes tranchées le 2026-09-29.**

- **D1 — identité déclarée** : tranchée (§0). Rappelée pour mémoire.
- **D2 — X01, le tiers en panne franche sans effet** — ACCEPTÉ, avec sa
  précision : X01 change d'attendu, il ne disparaît pas (§2.6). Un script
  tiers en 5xx, que la page n'utilise pas, cesse d'être publié. Raison : un seul critère, l'effet visible, sans exception pour la
  « panne franche » : un widget en panne que le visiteur ne voit pas n'est
  pas un défaut qu'il subit, et une exception ramènerait le bruit par la
  porte des 5xx. X01 est requalifié en « tiers sans effet, non publié », et
  le nouveau gabarit porte le tiers à effet visible.
- **D3 — nommer l'hôte, pas le produit** (contrat 3) — TRANCHÉ : l'hôte
  seul (`accounts.google.com`), pour que la phrase garantie ne contienne que
  ce que la preuve porte. Si le produit doit être nommé, ce sera par une
  table en config tenue par nous, jamais par le modèle.
- **D4 — le bilan des dix scans fondu dans la validation de P2-2**, par le
  troisième moteur — ACCEPTÉ ; `banc:reel` s'étend à plusieurs moteurs
  d'avant. Les trois chiffres sur le même état des sites vivants, donc
  comparables. Coût marginal ≈ 0,15 USD (les neuf scans du moteur de
  la campagne), et il mesure les deux réparations d'un coup tout en isolant
  chacune.
