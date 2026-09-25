# Dettes techniques

Une dette non écrite est une dette oubliée. Chaque entrée : ce qui est en
place, pourquoi, et la **condition de levée**. On retire l'entrée quand la
dette est levée (le commit qui la lève renvoie à ce fichier).

## 1. Playwright épinglé en 1.61.1 (2026-09-22)

- **Quoi** : `playwright` est épinglé à la version exacte 1.61.1 dans
  `package.json`.
- **Pourquoi** : la machine de développement principale tourne sous
  macOS 12 ; Playwright ≥ 1.62 ne fournit plus de Chromium pour macOS 12.
  1.61.1 (juin 2026) est la dernière version compatible.
- **Portée** : contrainte de la machine de développement, pas du projet.
  La production et la CI cibleront Linux, où l'épingle doit pouvoir sauter.
  Aucun code ne doit dépendre d'une API propre à 1.61 sans le signaler ici.
- **Garde-fou du banc** : le banc utilise le Chromium fourni par Playwright
  (`navigateur.canal: null` dans `config/scanner.json`), jamais le Chrome
  installé (qui s'auto-met à jour et rendrait les scores non reproductibles).
  `navigateur.canal: "chrome"` reste une option documentée, jamais le défaut.
- **Condition de levée** : dès que l'environnement principal tourne sous
  Linux ou macOS ≥ 13 — passer à la dernière version, relancer
  `pnpm exec playwright install chromium`, puis `pnpm banc --tous` trois
  fois (scores identiques attendus).

## 2. Dérivation des actions préalables limitée à la page courante (2026-09-22)

- **Quoi** : le contexte de reproduction d'une anomalie (`ContexteReproduction.actionsPrealables`, rempli par la fonction unique `actionsPrealablesDe` de `core/scanner/detection/commun.ts`) ne retient que les actions exécutées sur la même page et le même viewport depuis la dernière navigation, avant l'action déclenchante (typiquement le `remplir` qui précède un `soumettre`).
- **Pourquoi** : suffisant pour le gabarit « formulaire-contact » et pour la re-exécution isolée de la brique 3 ; c'est une **approximation** — sur un parcours multi-pages (tunnel en 3 étapes), l'état requis vient des pages précédentes et n'est pas capturé.
- **Condition de levée** : étendre la dérivation au parcours complet (chaîne d'actions depuis l'URL de départ, ou depuis le dernier point de l'état) dès qu'un gabarit multi-étapes existe au banc.

## 3. Aides de test du moteur couplées au banc (2026-09-22)

- **Quoi** : `core/scanner/exploration/aide-tests-banc.ts` et
  `core/scanner/exploration/en-page.sonde.ts` vivent dans `core/` mais
  importent `banc/` (serveur de scénario, gabarits, config du banc).
- **Pourquoi** : ce sont des aides de test (la sonde est lancée en
  sous-processus `tsx` par `en-page.tsx.test.ts`, garde permanente de
  l'apprentissage n°1) ; n'ayant pas le suffixe `.test.ts`, elles feraient
  partie du moteur au moment d'un empaquetage de `core/`.
- **Condition de levée** : les déplacer hors de `core/` (ou les suffixer
  pour qu'elles soient exclues) dès que `core/` est empaqueté ou publié.

## 4. Politique d'admission de l'URL de départ limitée au schéma (2026-09-22)

- **Quoi** : le scanner refuse les URL qui ne sont pas `http(s)` (`file:`,
  `data:`, `javascript:`), mais rien n'interdit `localhost`,
  `169.254.169.254` ni les réseaux privés.
- **Pourquoi** : suffisant tant que les URL viennent de l'opérateur ; le
  banc sert lui-même sur `127.0.0.1`, qu'une liste d'autorisation naïve
  casserait.
- **Condition de levée** : concevoir la liste d'autorisation d'hôtes et de
  réseaux avec le premier point d'entrée exposé à des URL d'utilisateurs
  (Phase 2, page « collez votre URL »).

## 5. Confiance et gravité désolidarisées à la fusion (2026-09-22)

- **Quoi** : quand le dédoublonnage fusionne deux candidates du même
  détecteur, il retient la confiance la plus forte
  (`Math.max`) mais garde la gravité de la première.
- **Pourquoi** : le cas où les deux divergent n'est pas reproductible
  aujourd'hui (pour D-HTTP, un 500 pendant une soumission se localise sur le
  déclencheur et un 500 hors soumission sur la ressource : clés de
  dédoublonnage différentes, donc jamais fusionnés). Corriger sans cas réel
  aurait été spéculatif.
- **Condition de levée** : dès qu'un détecteur peut produire deux candidates
  de même clé et de gravités différentes — alors décider explicitement si la
  gravité suit la confiance retenue.

## 6. L'échéance d'un scan est souple, non contraignante (2026-09-22)

- **Quoi** : à l'approche de l'échéance (`options.timeoutMs`), le pipeline
  cesse d'**engager** du travail neuf — plus de navigation, plus de groupe
  re-exécuté — mais il n'**interrompt** pas ce qui est en vol. Le rapport
  peut donc être rendu légèrement après l'échéance.
- **Mesure** : sous la contention de la suite complète (plusieurs Chromium
  sur 4 cœurs), un scan à budget 60 000 ms a rendu son rapport en
  62 408 ms (+4 %). En exécution séquentielle (le banc), aucun dépassement :
  le scénario le plus long consomme 49 % de son budget.
- **Borne** : le dépassement est majoré par la plus longue opération qu'un
  rejeu peut avoir en cours, soit `confirmation.rejeu.actionMs`. C'est cette
  borne dérivée que le test de bout en bout vérifie.
- **Pourquoi ne pas durcir aujourd'hui** : une interruption franche du
  travail en vol (abandon d'un contexte navigateur en pleine action) risque
  de laisser des ressources ouvertes — exactement le défaut que la revue de
  la brique 2 a fait corriger. Un durcissement demande un mécanisme
  d'annulation propre, pas un `race`.
- **Condition de levée** : quand un appelant aura un besoin dur de
  l'échéance (une API publique avec un contrat de latence, Phase 2), doter
  le pipeline d'une annulation coopérative de bout en bout (signal propagé
  jusqu'aux appels Playwright) et rendre la borne exacte.

- **Mise à jour du 2026-09-24 (brique 5)** : la RÉDACTION du rapport business
  s'ajoute aux étapes qui peuvent déborder, et c'est la dernière du scan —
  donc celle qui déborde sur un budget déjà consommé. Deux bornes l'encadrent,
  et il a fallu les deux : une PORTE d'entrée (`redigerRapportBusiness` ne
  s'engage pas si l'échéance est déjà passée) et une borne sur l'OPÉRATION
  (`rapport.appelMaxMs`, transmis au SDK). La première seule était un
  « check-then-act » : elle empêchait d'engager l'appel trop tard, pas de le
  laisser durer.
- **Correction du même jour, après revue** : la borne annoncée ci-dessus était
  fausse d'un facteur trois. Le délai transmis au SDK s'applique **par
  tentative**, et le SDK réessaie de lui-même — deux fois par défaut, sans que
  rien dans notre code ne le dise. Le nombre de réessais est devenu un réglage
  explicite (`ia.reessaisReseauMax`), et la borne vraie s'écrit
  `appelMaxMs × (1 + ia.reessaisReseauMax) × (1 + relancesMax)`, soit 720 s
  avec la configuration livrée. Elle reste supérieure au `timeoutMs` d'un scan
  ordinaire : la dette n'est pas levée, elle est enfin CHIFFRÉE juste. Ce qui
  la lèvera est inchangé — une annulation coopérative de bout en bout.

## 7. S01 n'éprouve qu'un vecteur d'injection, et le plus bruyant (2026-09-23)

- **Quoi** : le bug S01 mesure l'inertie du profilage sous **une** charge —
  la prose impérative **visible** dans la page. Résultat de la première
  mesure : 5/5 appels réels, inertie tenue.
- **Les quatre autres vecteurs** sont nommés dans l'en-tête de
  `banc/gabarits/formulaire-contact/bugs/s01-injection-profil.ts` avec
  l'endroit où chacun est gardé unitairement : texte masqué visuellement,
  bourrage de métadonnées, forge des marqueurs du bloc de données, et
  imitation du contrat de sortie JSON.
- **Pourquoi le dernier mérite une dette à lui seul** : les trois premiers
  échouent **bruyamment** — une réponse hors schéma, un marqueur forgé, un
  contexte tronqué se voient. Une page qui recopie un contrat de sortie
  **conforme** produirait un profil **valide au schéma et faux** : ni Ajv, ni
  le banc actuel, ni le taux de profils corrects ne le verraient, puisque le
  seul juge est la valeur attendue du gabarit. C'est le seul échec
  silencieux de la famille.
- **Condition de levée** : un bug S02 au prochain passage sur le banc des
  injections. La brique 4b l'ouvrira — c'est sa surface : le modèle n'y
  classe plus une page, il choisit des actes.

## 8. Le vecteur « chaîne profilage → navigation » reste non mesuré (2026-09-23)

- **Quoi** : une page fait dire au **profileur** quelque chose que le
  **navigateur** lira ensuite comme une consigne — le profil entrant dans le
  prompt de navigation, une injection en deux temps est concevable. Aucun
  scénario du banc ne l'éprouve.
- **Pourquoi pas maintenant** : la charge suppose d'obtenir du profileur une
  sortie précise (classer le site en valeur d'échappement pour remplir
  `natureLibre`), ce qui ne se construit de façon fiable qu'en **itérant le
  gabarit contre le comportement observé du modèle**. C'est fabriquer une
  charge sur mesure pour être battue — ou pour battre : les deux mentent, et
  `docs/METHODE.md` §2 l'interdit. Le refus de l'agent de correction est
  ratifié.
- **Mitigation en place** : `natureLibre` est **borné** dans
  `normaliserEtatDecision` avant d'entrer dans le prompt de navigation, et le
  contrat de `ProfilPage.natureLibre`, qui affirmait à tort « ne franchit
  jamais la frontière du journal », a été corrigé — un contrat faux est cru.
- **Condition de levée** : quand une charge pourra être construite **depuis
  le contrat seul** (ce que le format du profil permet de forger), sans
  itération contre le modèle. À défaut, le vecteur reste **documenté comme
  non mesuré** — ce qui est un statut, pas un oubli.

## 9. L'interdiction des chiffres dans la prose est PARTIELLE (2026-09-24)

- **Quoi** : le contrat de rédaction interdit au modèle d'écrire un chiffre
  dans sa prose — c'est ce qui rend impossible qu'un rapport affiche deux
  nombres contradictoires, l'un mesuré et l'autre rédigé. La garde
  (`porteUnChiffre`, sur `\p{Nd}`) attrape les chiffres écrits **en
  chiffres**, dans toutes les écritures Unicode. Elle n'attrape **pas** un
  nombre écrit **en toutes lettres** (« deux pages », « trois fois »).
- **Pourquoi pas maintenant** : aucune expression régulière ne le ferait dans
  toutes les langues, et une garde qui prétendrait le faire serait fausse dans
  la plupart d'entre elles — donc silencieusement absente là où personne ne la
  relirait. Le prompt l'interdit explicitement, en toutes lettres ; la revue
  le lit.
- **Ce qui est en place** : la garde est documentée comme partielle **dans le
  code et dans son test**, qui écrit noir sur blanc qu'un nombre en lettres
  passe. Une garde partielle est utile tant qu'elle ne se fait pas passer pour
  totale.
- **Condition de levée** : le jour où le rapport aura des destinataires dans
  des langues que nous ne relisons pas. La levée n'est pas une expression
  régulière plus large, c'est un contrôle d'une autre nature — comparer les
  nombres de la prose à ceux de la structure, ce qui suppose de les extraire,
  donc de lire la prose : exactement ce que la règle de terminalité interdit
  au moteur. C'est donc une vérification de REVUE, pas de produit.

## 10. Un rapport PARTIEL le dit, mais il reste partiel (2026-09-24)

- **Quoi** : la rédaction se fait en UN appel, sur un bloc de faits borné. Les
  sections qui n'y entrent pas restent **dans** le rapport, avec leurs faits,
  leur statut et leurs localisations — elles n'ont simplement pas de phrases.
  Un plafond borne une dépense ; il ne fait pas disparaître une anomalie d'un
  rapport destiné à celui qui la subit.
- **Corrigé le jour même, après revue — ce qui était faux dans la première
  écriture de cette dette** : elle ne nommait qu'un déclencheur,
  `sectionsMax` (20), et fixait sa levée à « quand un scan réel produira plus
  de sections que le plafond ». C'était faux : `faitsMaxChars` évince des
  sections **bien en dessous** du plafond de sections, et il le fait d'autant
  plus tôt que les CHEMINS des pages sont longs — or ces chemins sont choisis
  par le site inspecté. Mesuré avec la configuration livrée : 12 anomalies sur
  8 pages chacune donnent 12 sections publiées dont 10 rédigées ; 30 anomalies
  en donnent 20 sur 30. Le régime partiel n'est donc pas un cas de bord
  lointain, et un site hostile peut l'obtenir exprès.
- **Ce qui a été fait** : le rapport DIT désormais qu'il est partiel — une
  phrase en tête qui donne le compte et prévient que la synthèse n'a pas vu
  ces sections-là, plus un marqueur sur chaque section muette (deux sections
  muettes de même catégorie portaient jusqu'au même titre de repli). Le moteur
  publie `nbSectionsRedigees` et `nbLocalisationsMasquees`, et le banc s'en
  sert pour refuser de créditer une épreuve de charge dont le bloc factuel
  était amputé.
- **Ce qui reste** : le rapport est honnête, il n'est pas complet. La vraie
  levée est le découpage de la rédaction en plusieurs appels — au prix de la
  cohérence d'ensemble de la synthèse, qui est précisément ce qu'un seul appel
  achète. À trancher quand un client réel lira un rapport partiel.

## 11. Une cassette ne dit pas de QUELLE surface d'IA elle vient (2026-09-24)

- **Quoi** : `Cassette.metadonnees.versionPrompt` porte `v1`, `v2`… sans
  nommer le prompt. Tant que chaque surface avait son modèle, le couple
  (version, modèle) suffisait à les distinguer dans le parc. Depuis la
  brique 5, le **diagnostic** et la **rédaction** partagent la version `v1`
  ET le modèle `claude-opus-5` : vingt-quatre cassettes du parc sont, à la
  lecture, indiscernables. La correction du prompt de rédaction a un temps
  ouvert un `v2` qui écartait la collision ; ce `v2` était une faute de
  méthode (une lignée que rien n'avait mesurée) et a été replié sur `v1`. La
  collision revient donc, et c'est le bon état : elle est un défaut de
  LISIBILITÉ du parc, pas une raison d'inventer une version.
- **Ce que cela ne casse PAS** : aucune collision de clé. La clé hache aussi
  l'**empreinte de contrat**, qui diffère entre les deux surfaces, et la forme
  de l'entrée normalisée. Le rejeu reste exact ; c'est la LISIBILITÉ du parc
  qui souffre.
- **Ce que cela coûte** : quand un prompt sera incrémenté, ses anciennes
  cassettes deviendront orphelines et **on ne saura pas lesquelles**. Elles
  s'accumuleront en silence — exactement le genre de dérive que le parc
  committé existe pour empêcher.
- **Condition de levée** : qualifier `versionPrompt` (`redaction/v1`) rendrait
  le parc lisible, mais cette chaîne entre dans la CLÉ : le faire périmerait
  les 184 cassettes d'un coup, pour une raison de confort. La bonne levée est
  un champ de métadonnées ADDITIF (`famille`), posé au prochain renouvellement
  du parc — celui-là sera payé de toute façon.

## 12. `modeleServi` n'apporte rien pour la famille Opus (2026-09-24)

- **Quoi** : la provenance à trois champs distingue l'ALIAS demandé de la
  forme RÉSOLUE servie, pour attraper le jour où un alias glisse vers un autre
  instantané. Pour `claude-haiku-4-5`, l'API répond bien
  `claude-haiku-4-5-20251001` et la distinction fait son travail. Pour
  `claude-opus-5`, l'API répond `claude-opus-5` : les deux champs sont
  identiques, et le glissement d'alias serait invisible sur cette famille.
- **Pourquoi ce n'est pas un défaut du code** : `modeleServi` est bien
  **extrait** de la réponse, jamais recopié depuis l'alias — un test unitaire
  l'éprouve avec une doublure qui renvoie une forme distincte. C'est le
  fournisseur qui ne datifie pas cet identifiant aujourd'hui.
- **Ce qui reste vrai** : la garde de divergence de cassette
  (`diagnostiquerDivergence`) nomme alors la cause « prompt modifié sans
  incrément, ou variabilité du modèle » plutôt que « glissement d'alias » —
  ce qui est exact, puisqu'elle ne peut pas trancher. Elle n'accuse pas le
  mauvais coupable ; elle dit qu'elle ne sait pas.
- **Condition de levée** : aucune de notre côté. À surveiller si Anthropic
  commence à servir une forme datée pour cette famille — le parc divergerait
  alors d'un coup, avec le bon diagnostic.

## 13. ~~La LANGUE de la prose n'est mesurée dans aucune langue~~ — LEVÉE le 2026-09-24 (brique 5)

- **Ce qu'elle disait** : le banc vérifiait que `RapportBusiness.langue` est
  celle demandée et que chaque formulation de statut vient de la table de
  CETTE langue — deux moitiés écrites par le CODE. La **prose du modèle**
  n'était vérifiée dans aucune langue : rien n'empêchait mécaniquement un
  rapport annoncé `fr` de contenir des phrases anglaises, et le critère
  d'acceptation « rapport intégralement FR » était signé par une vérification
  incapable de voir son propre échec.
- **Levée, et par quoi** : `banc/correcteur/langue-prose.ts` + le contrôle
  `langueProse`. Détection MÉCANIQUE par mots-outils — une classe fermée, pas
  du vocabulaire métier —, table en configuration
  (`config/detection-langue.json`), aucun modèle, aucun coût, aucune cassette.
  Ce que la dette craignait (« un modèle de plus, donc une variance de plus »)
  n'a pas eu lieu : il n'y a pas de modèle.
- **Ce que la levée a dû apprendre en chemin**, et qui vaut pour la suite :
  - une détection sur la prose ENTIÈRE répond « majoritairement FR », jamais
    « intégralement FR ». Le mode de panne réaliste d'une rédaction
    multi-sections est le dérapage d'UNE section, qui reste sous la majorité.
    La détection se fait donc aussi par BLOC (une section = un bloc), et un
    seul bloc étranger suffit à faire rougir ;
  - la SECTION est le bon grain, pas le champ : un titre de cinq mots
    n'atteint jamais le minimum de jetons, et un contrôle qui répond
    « indécidable » partout ne contrôle rien ;
  - le paramètre a d'abord été OPTIONNEL, absence valant succès. Deux chemins
    réels ne le passaient pas — dont `banc:enregistrer-ia`, la seule exécution
    où le modèle écrit réellement la prose. Il est désormais obligatoire, et
    `null` DIT qu'on y renonce.
- **Ce qui reste** : la détection ne tranche qu'au-delà d'un minimum de jetons
  et d'une marge (`tokensMin`, `margeMin`). Sous ce seuil elle répond `null`,
  et le contrôle est alors FAUX plutôt qu'ignoré. Elle ne couvre que les deux
  langues de `LANGUES_RAPPORT` : une troisième langue de rapport demandera sa
  liste de mots-outils avant sa première livraison.

## 14. Les viewports d'une page sans viewport déclaré sont ceux de TOUTE l'anomalie (2026-09-24)

- **Quoi** : `localisationsLisibles` affiche, pour chaque page, les viewports
  déclarés par ses localisations. Quand aucune n'en déclare — le cas d'une
  anomalie qui ne DÉPEND pas du viewport — il affiche ceux où le GROUPE a été
  observé, les mêmes pour toutes les pages de la section.
- **Ce que cela peut faire dire** : une cause observée sur `/a` en desktop et
  sur `/b` en mobile affichera « desktop, mobile » sur les deux pages. C'est
  vrai de l'anomalie, approximatif de chaque page.
- **Pourquoi c'est acceptable aujourd'hui** : l'information que le rapport
  doit porter est « ce défaut touche-t-il les mobiles ? », et elle est exacte.
  L'asymétrie réelle — « mobile uniquement » — vient des localisations qui,
  elles, DÉCLARENT leur viewport, et elle est préservée exactement.
- **Condition de levée** : quand une localisation portera son viewport dans
  tous les cas, pas seulement quand l'anomalie en dépend. C'est une
  modification de la consolidation (brique 3), pas du rapport.

## 15. Le lien entre le PROMPT et la TABLE DES FORMULATIONS n'est pas mécanique (2026-09-24)

- **Quoi** : `prompts/redaction/v1.ts` décrit à un modèle ce que chaque statut
  SIGNIFIE ; `core/rapport/voix.ts` écrit la phrase que le client lira pour ce
  même statut. Les deux doivent dire la même chose — sinon le rapport porte deux
  affirmations contradictoires, et c'est la plus forte qu'un lecteur retient.
  **Rien ne les relie mécaniquement.**
- **Ce qui est garanti** : les deux tables sont des `Record<StatutSection, …>`,
  donc un cinquième statut casse la compilation des DEUX. C'est une garantie de
  COUVERTURE, pas de cohérence : rien n'empêche deux descriptions divergentes du
  même statut.
- **Comment on l'a découvert** : par MUTATION. Un sceptique a remplacé la
  description de `confirmee` dans le prompt par la phrase fautive de v1 et a
  relancé la suite — **1382 tests passés, zéro tué**. Les deux tests censés
  garder cette propriété (`core/ia/prompt-redaction.test.ts`) n'assertent que
  des sous-chaînes du fichier qu'ils testent : ils vont chercher leur propre
  source, et ne peuvent pas échouer pour la raison du défaut (METHODE).
- **Pourquoi pas maintenant** : la cohérence entre une explication en prose
  française et une formulation en prose française est SÉMANTIQUE. La rendre
  mécanique demanderait soit un troisième modèle qui les compare — un oracle de
  plus, et un oracle qu'on ne peut pas éprouver ment tôt ou tard — soit de
  dériver l'une de l'autre, ce qui ferait écrire le prompt par la table des
  libellés et le rendrait illisible.
- **Ce qui couvre en attendant** : la revue LIT les deux côte à côte, et le
  cahier en fait un critère bloquant (« un “détecté” qui se lit comme un
  “confirmé” est un constat bloquant »). Toute modification de l'un des deux
  fichiers doit rouvrir l'autre.
- **Condition de levée** : le jour où un troisième statut naîtra. Trois paires
  à tenir d'accord à la main, ce n'est plus une relecture, c'est un oubli qui
  attend.

## 16. `exceptionsSandbox` est dormante, désormais DÉCLARÉE (2026-09-24, brique 6a)

- **Quoi** : `config/actions-interdites.json` porte `exceptionsSandbox:
  ["paiement"]`. Le schéma la valide, `ConfigScanner` la type, et **aucune
  ligne ne la lit** (`core/scanner/exploration/filtre-actions.ts` le dit dans
  son en-tête). Elle décrit un futur mode bac à sable qui lèverait l'interdit
  sur les catégories n'y figurant PAS.
- **Pourquoi elle reste** : elle porte une décision de conception déjà prise —
  quelles catégories d'interdits un bac à sable a le droit de lever. La
  supprimer perdrait la décision ; la laisser silencieuse la ferait croire
  active. C'est exactement l'angle mort de l'apprentissage n°5.
- **Ce qui la garde en attendant** :
  `core/scanner/exploration/filtre-actions.dormante.test.ts` atteste qu'AUCUN
  code ne la consomme, et que chaque catégorie qu'elle cite existe bien dans
  les motifs. **Le jour où elle sera consommée, ce test échouera** — c'est son
  but : il force à l'écrire à l'envers, et à lever cette dette.
- **Condition de levée** : le mode bac à sable lui-même. Son ouverture est un
  événement de sécurité, puisqu'il lève un interdit : il aura son cahier, et
  sa revue.

## 17. Un scanner équipé d'un budget mène UN scan à la fois (2026-09-24, brique 6a)

- **Quoi** : `creerBudgetScan` tient le compteur de dépense dans la fermeture
  du scanner, et `creerScanner` le remet à zéro au début de chaque scan. Deux
  scans **concurrents** sur le même scanner partageraient donc ce compteur et
  se voleraient leur budget — le second remettrait à zéro celui du premier.
- **Pourquoi ce n'est pas un défaut aujourd'hui** : le banc scanne
  séquentiellement, et `pnpm scan` mène un scan à la fois. La contrainte
  existait déjà ailleurs (l'explorateur tient un état par scan) : ce module ne
  l'introduit pas, il l'hérite.
- **Ce qui la lèvera** : la file d'attente de la page publique — explicitement
  hors périmètre de la brique 6. Elle devra donner **un scanner par scan**, ce
  qui referme le sujet sans toucher à ce module, ou porter la portée de budget
  dans un contexte passé d'appel en appel.
- **Ce qui la garde en attendant** : le contrat est écrit en toutes lettres
  dans `core/ia/plafond.ts`, sur l'interface `PorteeBudget`.

## 18. La politique déterministe ne choisit pas dans le menu énuméré (2026-09-25, brique 6a)

- **Quoi** : `politiqueDeterministe` fabrique son action depuis l'état de la
  page et **ne lit pas l'énumération** — « c'est délibéré », dit son en-tête,
  au nom de la gratuité. Tant que le menu énuméré et l'état de la page
  coïncidaient, c'était sans effet. Le gate de soumission (`interaction.soumission:
  'aucune'`) les fait diverger : le menu ne propose plus `soumettre`, la
  déterministe le propose quand même.
- **Ce qui se passe alors, mesuré** : la couche 1 (`COUCHE_ENUMERATION`)
  refuse l'action, appelle la politique de secours — qui est la même
  déterministe, qui propose la même chose — et refuse encore. Rien n'est
  exécuté, le scan continue. Sur le scénario
  `formulaire-contact--f01-v01--fr-sans-soumission` : **2 « replis par
  décision subis »** (un par viewport), dans une colonne qui ne mesurait
  jusqu'ici que les replis de l'IA.
- **Pourquoi ce n'est pas corrigé ici** : la propriété de SÉCURITÉ tient — la
  couche 1 fait exactement ce pour quoi elle existe, et le compteur l'a dit.
  Mais la correction naturelle (prendre la PREMIÈRE action énumérée, qui est
  déjà triée dans l'ordre de priorité déterministe) renverse une décision de
  conception écrite et justifiée. Elle est petite, et elle se vérifie par
  trois runs identiques ; elle n'est pas la mienne à prendre en fin de brique.
- **Ce que cela coûte en attendant** : deux cycles de décision perdus par page
  à formulaire sous interaction restreinte, et une colonne « replis » dont la
  cause n'est plus univoque. Rien pour le client.
- **Condition de levée** : arbitrage sur l'en-tête de `politique.ts`. Si la
  déterministe lit l'énumération, sa gratuité est intacte (l'énumération est
  déjà calculée) et tout gate futur la gouverne par construction.
