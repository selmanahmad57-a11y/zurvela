# ZURVELA — Cahier P2-3 : le recouvrement

Ouvert le 2026-09-30, troisième cahier de la Phase 2, dans l'ordre du carnet
figé. Régime : COMPLET — moteur (exploration, détection, consolidation,
rapport), banc (nouveau gabarit à deux faces), réel (validation, METHODE
§12). **Contrats d'abord** : rien ne se code avant que le §2 et les
décisions du §6 soient validés.

**Pourquoi en troisième** : P2-1 a rendu le jugement POSSIBLE, P2-2 l'a rendu
JUSTE sur les tiers. P2-3 s'attaque à la dernière grande usine à faux
positifs du carnet, et c'est celle qui frappe le plus fort : la gravité
maximale. Cinq sites sur dix, cinq formes — modal fermable, annonces, pied
de page fixe, chevauchement d'un lien, calque de survol d'une grille
marchande (1 428 candidates sur une seule boutique) — toujours publiées
« Bloquant », c'est-à-dire « le parcours s'arrête là ». L'hypothèse
« bandeau de consentement » de l'inventaire a été vérifiée au premier
recouvrement réel, et dans le mauvais sens.

## 0. Arbitrage en tête — LE MOTEUR NE CONSENT PAS À LA PLACE DU VISITEUR

P2-3 est le premier cahier où le moteur **agit sur la page pour la traverser**
au lieu de seulement l'observer. C'est un changement de nature, et il touche
la constitution §3 (menu fermé d'actions, filtre d'actions destructives non
contournable). L'arbitrage se pose donc AVANT les contrats, comme l'identité
déclarée en tête de P2-2.

**TRANCHÉ le 2026-09-30 par le propriétaire, définitivement (D1).** Le
moteur écarte un recouvrement par un **geste neutre énuméré**, ou il échoue
honnêtement. Zurvela observe ; il ne consent jamais pour autrui.

La position d'ouverture distinguait « bouton de fermeture neutre » et
« consentement ». Le propriétaire a adopté une formulation PLUS FORTE, qui
n'a pas besoin de la distinction : **le moteur n'a pas à reconnaître un
bandeau de consentement pour être correct.** On tente les gestes neutres de
la liste fermée ; si tous échouent, l'élément est déclaré **non écartable
par un geste neutre**, et c'est tout. Un mur de consentement et un modal
sans croix tombent dans le même constat — dans les deux cas, la page exige
une décision qui n'est pas la nôtre. Le résultat éthique est identique, mais
il est atteint **sans aucune connaissance du monde** : la première version
demandait au moteur de SAVOIR qu'un consentement en est un, donc de lire,
donc de la langue naturelle en détection, que la règle maîtresse interdit.
La seconde ne lui demande que d'essayer et d'échouer honnêtement.

Ce que cette position IMPOSE au cahier, et qui doit se lire dans le code :

- **Aucun geste qui engage.** Le filtre d'actions destructives
  (`config/actions-interdites.json`, catégories `destruction`, `paiement`,
  `engagement`, `communication`, `acces`) s'applique au geste de fermeture
  **exactement comme à une action décidée par l'IA** — après coup, en code,
  non contournable. Une tentative de fermeture qui tombe sous un motif est
  refusée et journalisée comme telle.
- **Le moteur n'a pas à RECONNAÎTRE un bandeau de consentement pour être
  correct.** Le vouloir le pousserait vers la langue naturelle, que la
  règle maîtresse interdit en détection. La règle est mécanique : on tente
  les gestes neutres énumérés ; s'ils échouent tous, l'élément est déclaré
  **non écartable par un geste neutre**. Le rapport dit ce fait, pas son
  interprétation. Un mur de consentement et un modal sans croix tombent
  dans le même constat, et c'est correct : du point de vue du visiteur comme
  du nôtre, la page exige une décision qui n'est pas la nôtre.
- **Le geste de fermeture est TRAÇABLE.** Chaque tentative — son geste, sa
  cible, son issue — au journal. **Un moteur qui agit sur la page d'autrui
  sans laisser trace de ce qu'il a fait n'est pas relisible** : c'est un
  principe, pas un détail de journalisation, et il est inscrit à la
  constitution §3 le 2026-09-30. Le clic hors zone en particulier journalise
  LE POINT qu'il a choisi, pour qu'une relecture puisse vérifier qu'il n'a
  rien activé.
- **Ce que le moteur a FAIT se dit au client, pas seulement ce qu'il a vu.**
  Taire un tiers, c'est ne pas publier ; fermer un bandeau, c'est avoir agi
  sur la page du client. Le bloc « Notre méthode » du rapport compte les
  recouvrements écartés (contrat 7). C'est le premier rapport de Zurvela qui
  déclare ses propres actes.

## 1. Le fait

- **C-12 — `d-recouvrement` ne tente jamais de fermer** (carnet, 5 sites sur
  10) : un modal fermable d'un clic est publié `bloquant` sur deux sections ;
  fiche 07, neuf recouvrements (annonce ancrée sur la navigation mobile,
  liens d'annonces intra-texte, calque d'un éditeur sur sa zone de saisie) ;
  fiche 08, vingt-sept (pied de page FIXE ×22, bannière ×5 — un second essai
  après recentrage lève l'ambiguïté d'un élément fixe) ; fiche 09, UN lien de
  mot-clé recouvert par le pied de page publié « les clics sur la page
  d'accueil n'aboutissent pas », `Bloquant · Mobile` ; fiche 10, **1 428**
  candidates dues au calque de SURVOL des cartes produit — la construction
  standard d'une grille marchande — et une géométrie tronquée à 500 éléments
  par page, donc une mesure déjà incomplète.
- **Une seule gravité, quel que soit l'élément recouvert.**
  `config/scanner.json` fixe `detecteurs.recouvrement.gravite` à
  `bloquant`, sans considération de ce qui est recouvert : un lien de
  mot-clé dans un pied de page pèse autant qu'un bouton d'achat.
- **C-11 — un défaut, plusieurs sections** (3 sites) : les groupes
  `d-recouvrement` sont clés par viewport ; la contre-épreuve PROUVE que le
  défaut est le même sur l'autre viewport (`attendue: false, reproduite:
  true`) et n'en tire qu'une baisse de confiance (0,8 → 0,63), pas une
  fusion. Le rapport dit deux fois la même chose.
- **Le legs de P2-2, mesuré** : automationexercise publie **7 sections** au
  lieu des 5 du carnet — six intercepteurs distincts, donc six causes sous
  le contrat 4 de P2-2, plus le contenu mixte. Les six sont la même
  construction répétée sur une grille. C-16 s'arrête à l'intercepteur ; il
  manque la cause AU-DESSUS des éléments.
- **Le coût** : les 500 examens de `elementsInteractifsMax` se dépensent en
  calques de survol, et n'examinent donc pas le reste de la page.

## 2. Contrats — validés le 2026-09-30, avant toute implémentation

1. **Un recouvrement n'est un défaut que si RIEN ne l'écarte.** Le critère se
   déplace de « quelque chose recouvre » vers « quelque chose recouvre ET le
   visiteur n'a pas de moyen simple de l'écarter ». Le moteur TENTE, dans un
   ordre fixé en config, une liste FERMÉE de gestes neutres — c'est du web,
   jamais du monde :
   - la touche `Échap` ;
   - la fermeture native d'un `<dialog open>` ;
   - un clic hors de la géométrie du recouvrement, à un point vide ;
   - l'activation d'un descendant du recouvrement désigné par des attributs
     STRUCTURELS universels (un `<button>`/`<a>` dont la surface est petite
     et située dans un coin du recouvrement, `aria-label` PRÉSENT sans que
     son contenu soit lu, `<dialog>`/`[aria-modal]` et leur sémantique) —
     jamais par le TEXTE de l'élément (règle maîtresse §2).
   Après chaque geste, le moteur re-mesure : l'élément cible est-il redevenu
   cliquable ? Si oui, le recouvrement est **écarté** : il n'est pas publié,
   il est compté et journalisé, et l'exploration continue — c'est l'état
   normal du web moderne, pas une panne. Si tous les gestes échouent,
   l'élément est **non écartable** : c'est un vrai défaut, et il est publié.
   Invariant en code : aucun réglage ne doit pouvoir publier un recouvrement
   qu'on n'a pas tenté d'écarter.
   **Contrôle DANS LES DEUX SENS**, au banc (§2.6) : un recouvrement fermable
   doit être écarté, traversé, NON publié ; un recouvrement sans issue doit
   être publié. Mutations : « on ne tente jamais » (les fermables
   réapparaissent en faux positifs) et « on déclare tout écarté » (le
   recouvrement sans issue est perdu).
   **Et CHAQUE GESTE prouve qu'il mord, individuellement** (METHODE §10,
   extension du 2026-09-30 sur la redondance) : retirer `Échap` doit faire
   échouer la fermeture du gabarit qui ne se ferme que par `Échap`, et ainsi
   de suite pour chacun des quatre. Sans cela, la liste serait « verte »
   sans qu'on sache lequel de ses gestes porte réellement — l'angle mort de
   la redondance, vu au contrat 4 de P2-2. Le gabarit porte donc une face
   par geste (§2.6).

2. **Le critère de gravité est CE QUI EST MASQUÉ, pas le fait de masquer**
   (tranché, D4). Trois marches, cohérentes avec toute la doctrine de
   gravité du projet :
   - un recouvrement **fermé et traversé n'est pas une anomalie** : rien à
     publier, seulement à compter (contrat 7) ;
   - un recouvrement **non écartable** qui masque une action critique —
     soumission de formulaire, bouton d'achat, navigation principale — est
     `bloquant` : l'affirmation « le parcours s'arrête là » est alors vraie ;
   - un recouvrement **non écartable** qui masque du contenu secondaire est
     `mineur`.
   Les natures d'élément et leurs gravités vivent en config ; le PLAFOND
   vit en code : un recouvrement dont on n'a pas pu établir ce qu'il masque
   ne peut pas ouvrir un rapport en `bloquant`. Contrôle : au banc, deux
   recouvrements sans issue, l'un sur une soumission, l'autre sur un lien
   secondaire, rendent deux gravités différentes. Mutation : gravité unique
   en config — la différence disparaît, le banc rougit.

3. **Le calque de SURVOL n'est pas un recouvrement subi.** Une surface qui ne
   recouvre qu'au survol (elle n'intercepte pas le clic réel, ou elle
   disparaît quand le pointeur s'en va) est la construction standard d'une
   grille marchande : 1 428 candidates à la fiche 10. Elle se reconnaît par
   un critère physique — le clic aboutit malgré la géométrie —, jamais par
   un nom de classe. Elle n'est pas une candidate, elle est comptée. Effet
   attendu : les 500 examens de `elementsInteractifsMax` cessent de s'y
   dépenser. Contrôle : le compte de candidates de la fiche 10 s'effondre
   sans que les vrais recouvrements disparaissent. Mutation : critère retiré
   — les 1 428 reviennent.

4. **N intercepteurs de MÊME CONSTRUCTION sont une cause (C-16 plein, legs de
   P2-2).** Le contrat 4 de P2-2 regroupe par intercepteur ; il manque le
   niveau au-dessus. Deux intercepteurs sont de même construction quand leur
   signature structurelle coïncide — même balise, même ensemble d'attributs
   de classe, même position relative dans un ancêtre répété. Le code compare
   des signatures ; il ne LIT aucun nom (comparer deux chaînes pour l'égalité
   n'est pas connaître leur sens). Une cause, une section, N localisations.
   Contrôle : automationexercise passe de six sections d'interception à une ;
   au banc, un gabarit à grille répétée publie une section pour N cartes.
   Mutation : comparaison de signature retirée — le banc remonte à N.

5. **La contre-épreuve FUSIONNE au lieu de minorer (C-11).** Quand la
   contre-épreuve établit que le même défaut se produit sur l'autre viewport
   (`attendue: false, reproduite: true`), les deux groupes deviennent UN,
   avec deux observations — et non deux groupes dont l'un voit sa confiance
   tomber de 0,8 à 0,63. Une confiance qui baisse après une CONFIRMATION doit
   changer quelque chose de visible, ou ne pas baisser (carnet C-11).
   Contrôle : au banc, un défaut présent sur les deux viewports publie une
   section à deux observations ; le malus de symétrie inattendue ne
   s'applique plus à ce cas. Mutation : fusion retirée — deux sections.

6. **Le banc gagne un gabarit « recouvrement » à DEUX FACES — et une
   troisième que l'option A rend nécessaire.** Chaque face est un attendu :
   - **face 1, fermable** : un recouvrement qu'un geste neutre écarte —
     attendu : **écarté, traversé, RIEN de publié**, et le compte des
     écartements > 0. C'est un attendu POSITIF, comme X01 sous P2-2 : un
     gabarit qui disparaîtrait pour une mauvaise raison (recouvrement
     jamais posé, compte à zéro) doit faire rougir le banc ;
   - **face 2, sans issue** : aucun geste neutre ne le lève — attendu :
     **publié**, avec la gravité de ce qu'il masque ;
   - **face 3, UN GESTE PAR GABARIT** : la face que l'option A rend
     nécessaire à mesurer. Un recouvrement qui ne cède qu'à `Échap` ; un
     `<dialog open>` qui ne cède qu'à sa fermeture native ; un recouvrement
     qui ne cède qu'au clic hors zone ; un modal qui ne cède qu'à sa croix
     ARIA. Retirer un geste de la liste doit faire échouer SON gabarit et
     LUI SEUL. Sans ces quatre, l'option A serait verte sans qu'on sache
     lequel de ses gestes porte ;
   - **calque de survol** sur une grille répétée — attendu : aucune
     candidate, et une cause unique si le clic est réellement intercepté ;
   - **deux viewports** — attendu : une section, deux observations
     (contrat 5).
   Chaque attendu tue sa mutation AU BANC avant sa première cassette
   (METHODE §10, n°20), et le croisement des conditions est prévu dès le
   gabarit (n°25) : la fermabilité rencontre la répétition, et le survol
   rencontre les deux viewports.
   **TÉMOIN D'INTERSECTION, exigé par le propriétaire** : le gabarit
   `calque-au-rejeu` (P2-1, contrat 8 — un calque qui n'apparaît qu'au
   rejeu) doit rester VERT après P2-3, à empreinte identique. C'est
   l'intersection P2-1/P2-3, et n°25 dit que c'est exactement là que vivent
   les défauts qu'aucun cahier ne voit seul : un recouvrement qui n'apparaît
   qu'au rejeu doit continuer d'être une découverte publiée, et le nouveau
   geste de fermeture ne doit pas l'effacer en chemin.
   **Scénarios historiques qui changent, déclarés d'avance** : M01
   (« bouton masqué en mobile ») et les gabarits qui portent un
   recouvrement. À énumérer précisément à l'implémentation, avec l'attendu
   nouveau de chacun ; tout autre scénario garde son empreinte.

7. **Ce que le moteur a FAIT se dit au client.** Les recouvrements écartés
   sont comptés dans la sortie du scan, dans la scorecard et dans le bloc
   « Notre méthode » du rapport : « nous avons écarté N éléments qui
   recouvraient l'interface pour poursuivre la vérification ». Le texte est
   à GARANTIE SÉMANTIQUE — il énonce un acte du moteur sur la page du
   client — donc il vit en code typé par langue (`core/rapport/voix.ts`,
   exception de la constitution §2), jamais en `locales/`. Un silence qui
   ne se compte pas est un angle mort (n°4) ; une ACTION qui ne se déclare
   pas est pire. Contrôle : au banc, la face 1 publie zéro section et une
   ligne de méthode à N > 0. Mutation : la ligne retirée — le banc rougit
   sur un rapport qui tait un acte.

8. **Validation sur le réel (METHODE §12)**, sur les neuf sites, deux
   moteurs dans la même session : P2-2 (`383ed3a`) et P2-3. Attendus écrits
   dans les cas AVANT le run (METHODE §13) :
   - the-internet, demoqa, quotes re-scannés **sans « Bloquant »
     injustifié** — la clôture que le carnet figé exige ;
   - automationexercise : ses six sections d'interception deviennent une ;
   - le compte de candidates de la fiche 10 s'effondre (contrat 3) sans
     perte des vrais recouvrements ;
   - **témoins** : books et zurvela, qui n'ont aucun recouvrement, ne
     bougent pas — le témoin d'un cahier qui touche au recouvrement est la
     part qui n'en a pas ;
   - jugement humain de chaque section publiée, avant et après, et
     **DEUX PHRASES, PAS UNE** (APPRENTISSAGES n°26) : ce qu'un seul run
     mesure ensemble ne se combine pas avec ce qu'un autre établit.

Aucune règle ne porte sur un nom de classe, un libellé, une langue ou un
site : les critères sont la géométrie, les attributs structurels universels,
la sémantique HTML/ARIA et l'issue mécanique d'un geste.

## 3. Budget

L'estimation DÉPEND de la décision D2 (qui choisit le contrôle de fermeture),
et c'est pourquoi elle est donnée en deux branches. Rien ne se dépense avant
que D2 soit tranchée.

- **Gabarit « recouvrement »** : profil, décisions et rédaction de ses
  scénarios fr/en ≈ **0,25 USD** (P2-2 a coûté 0,169 pour huit scénarios).
- **Réel** : neuf sites × deux moteurs ≈ **0,75 USD** (le moteur d'après
  publie moins, donc rédige moins).
- **D2 = option A, tranchée** : gestes neutres énumérés, aucune intervention
  du modèle, pas de prompt nouveau, le parc de cassettes tient.
  **ANNONCÉ : ≈ 1,00 USD, plafond 1,50 USD.** La branche B (le modèle lit
  « Fermer / Close / Später ») est écartée et mise en DETTE : elle coûterait
  ≈ 2,50 USD, un appel par recouvrement — un site à 27 recouvrements en
  ferait 27 —, et surtout elle réintroduirait la langue naturelle en
  détection, que la règle maîtresse interdit. **Condition de levée : un
  chiffre.** B ne s'ouvre que si le résidu de A, MESURÉ sur le réel, est
  significatif ; jamais par anticipation.

Tout dépassement s'annonce AVANT, jamais après, et l'estimation se refait à
mi-parcours une fois le nombre de scénarios du gabarit connu.

## 4. Hors périmètre

C-02 et le reste de C-04 : P2-4. C-14, C-15 : P2-5. Le cahier n°2 de l'IA
(C-01, C-08) et les ratés IA de K01. **Le coût d'un rejeu par groupe**
(automationexercise, expandtesting) : cahier de performance à part — c'est
lui, et non le jugement, qui a fait perdre dix vraies anomalies au run de
mesure de P2-2. **Dette n°22** (l'effet visible aveugle aux `xhr` et aux
polices) : sujet à part entière, à ouvrir avant tout argument commercial sur
le zéro faux positif. **Dette n°23** (la rejouabilité sans dénominateur) : se
décide à froid, dans son propre cahier, jamais après avoir vu un run.

## 5. Livraison

Les huit contrats tenus, chacun avec son contrôle et sa mutation tuée ; le
gabarit et ses faces, chaque geste de fermeture tué individuellement ; le
gabarit `calque-au-rejeu` toujours vert (témoin d'intersection P2-1/P2-3) ; les scénarios historiques à
empreinte identique sauf ceux déclarés au §2.6 ; les neuf sites rejoués sur
deux moteurs avec le jugement humain des sections ; les fiches annotées
« revu après P2-3 » ; commit « P2-3 — le recouvrement » à la validation
seulement.

## 6. Décisions — TOUTES TRANCHÉES le 2026-09-30

- **D1 — le moteur ne consent jamais pour autrui** : TRANCHÉ (§0), et par la
  formulation la plus forte — geste neutre ou échec honnête, sans que le
  moteur ait à reconnaître ce qu'il regarde. Le filtre d'actions
  destructives s'applique au geste de fermeture exactement comme à une
  action décidée par le modèle : après coup, en code, non contournable.
  Chaque tentative journalisée. **Non négociable.**
- **D2 — le CODE SEUL choisit le contrôle de fermeture (option A)** :
  TRANCHÉ. `Échap`, fermeture native de `<dialog>`, clic sur point vide,
  descendant désigné par géométrie et ARIA sans lire son texte — des gestes
  mécaniques et universels, indépendants de la langue. C'est le contrat 3 de
  P2-2 rejoué : une voie code bat une voie prompt dès que le fait est
  posable par le code. Option B en dette, levable par un chiffre seulement
  (§3).
- **D3 — le clic hors zone** : TRANCHÉ, avec sa garde. Le point est choisi
  par GÉOMÉTRIE — une zone vide vérifiée sans élément interactif dessous ni
  au point de clic simulé — et le point retenu est journalisé. **Si aucun
  point vide sûr n'existe, le geste est simplement INDISPONIBLE** et l'on
  passe au suivant. Jamais de clic au hasard en espérant que c'est vide.
- **D4 — la gravité** : TRANCHÉ, contrat 2. Le critère est ce qui est
  MASQUÉ, pas le fait de masquer. Fermé et traversé → rien. Non écartable
  masquant une action critique → `bloquant`. Non écartable masquant du
  contenu secondaire → `mineur`. Nature et gravités en config, plafond en
  code.
- **D5 — les recouvrements écartés** : TRANCHÉ, contrat 7. Comptés,
  journalisés avec leur geste, et DITS au client dans « Notre méthode ».
  Raison du propriétaire : taire un tiers, c'est ne pas publier ; fermer un
  bandeau, c'est avoir agi sur la page du client. C'est de l'honnêteté sur
  nos propres actes, pas seulement sur nos jugements.

## 7. Séquencement et voisinages

- **Dette n°20** (levée) et **dette n°22** (l'effet visible aveugle aux
  `xhr`) ne bloquent pas P2-3, mais leur voisinage se vérifie : le
  recouvrement croise les découvertes, W03 l'a montré. Le témoin est le
  gabarit `calque-au-rejeu`, qui doit rester vert à empreinte identique
  (contrat 6).
- **Régime COMPLET**, et au niveau de risque maximal en sécurité : c'est le
  premier cahier où le moteur agit sur la page d'un tiers.
