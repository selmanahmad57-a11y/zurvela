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
