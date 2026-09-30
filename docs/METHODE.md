# Méthode de construction

Comment une brique se construit et se vérifie. Règles permanentes, issues de
l'expérience des briques 1 à 3.

## 1. L'ordre de démarrage

1. **Le cahier des charges** arrive du chat de conception et est sauvegardé
   dans `docs/cahiers/`.
2. **Les contrats sont posés d'abord** : types (`core/types.ts`,
   `banc/types.ts`), configuration (`config/*.json` + schéma avec
   `description` sur chaque feuille). `pnpm typecheck` liste alors
   exactement les trous à combler — c'est la liste de travail, pas une
   erreur.
3. **L'implémentation** se répartit en flux à propriété de fichiers
   EXCLUSIVE, exécutés en parallèle, puis une intégration les aligne et les
   met au point sur le banc.
4. **Le commit** n'a lieu qu'après validation dans le chat de conception :
   un commit par brique, message « Brique N — nom », avec une ligne de
   justification par dépendance ajoutée. Les documents de gouvernance
   modifiés sur décision du chat de conception (`CLAUDE.md`, `docs/`)
   voyagent dans le commit de la brique en cours et y sont mentionnés.

Filet de sécurité pendant la construction : instantanés hors branche
(`git commit-tree` sur `refs/sauvegardes/<brique>-<date>`), qui ne touchent
ni `HEAD`, ni l'index, ni l'arbre de travail.

## 2. La vérification se proportionne au risque, pas au rituel

Le banc d'essai a été construit pour porter la charge de vérification.
Chaque brique qui l'enrichit rend la revue adversariale moins nécessaire sur
tout ce que le banc sait juger : on la réserve à ce qu'il ne voit pas —
conformité constitutionnelle, sécurité, choix de conception.

Le niveau est choisi **à l'ouverture** de la brique, et annoncé.

| Niveau | Quand | Vérification |
| --- | --- | --- |
| **Léger** | Clôtures, documentation, configuration, ajout de cas au banc | `typecheck` + `lint` + tests + banc ×3 à empreinte identique. Zéro sceptique. |
| **Ciblé** | Modification d'un module existant, nouveau détecteur, nouveau bug du banc | Idem, plus une revue adversariale **sur la seule frontière touchée**, 1 sceptique par constat (3 seulement en cas de désaccord). |
| **Complet** | Capacité nouvelle, contrat modifié, sécurité | Revue multi-lentilles, 3 sceptiques par constat, correction, validation. Avec deux optimisations : **déduplication des constats AVANT les sceptiques** (ne jamais faire voter trois fois le même défaut), et **budget plafond annoncé à l'ouverture** — dépassement : on s'arrête et on remonte au chat de conception. |

### Graduation du MODÈLE, à côté de la graduation du nombre

Le régime dit **combien** de sceptiques ; la graduation du modèle dit **sur
quel modèle** chaque rôle tourne. Les sceptiques représentent 60 à 70 % du
nombre d'agents d'un workflow : c'est là que vit le coût, et leur travail —
réfuter un constat documenté, preuve à l'appui — est une tâche cadrée.

| Rôle | Modèle | Pourquoi |
| --- | --- | --- |
| Flux d'implémentation, intégration, correction | le modèle de la session | ils écrivent le code, tranchent, et refusent les corrections régressives |
| Lentilles de revue | le modèle de la session | c'est là que les défauts de fond apparaissent |
| Sceptiques **sécurité / frontière** | le modèle de la session | inchangé : le coût d'un faux négatif y dépasse tout |
| Sceptiques sur le reste | un modèle moins cher | mandat précis, constat fourni, décision binaire |
| Déduplication des constats | un modèle moins cher | fusion de doublons, purement mécanique |

Économie observée à l'échelle d'un workflow : 40 à 50 %, sans toucher à ce
qui produit le code ni à ce qui garde la sécurité. C'est la doctrine de
proportion au risque appliquée au modèle au lieu du nombre.

### Le péage du banc, et quand les trois runs sont exigés

Arbitrage du 2026-09-24 : **le déterminisme est un invariant de l'instrument,
pas un rituel de chaque mesure.**

- Les **trois runs par politique** restent exigés là où le déterminisme est
  l'OBJET mesuré : tout ce qui touche aux cassettes, au protocole, aux
  décisions.
- Pour une extension dont l'objet est le **contenu** (le rapport business),
  **un run par politique suffit aux scénarios NOUVEAUX** ; les trois runs
  restent sur le **périmètre historique**, qui garde son rôle de témoin de
  non-régression.

### L'ordre de l'enregistrement : geler ce qui entre dans la clé, PUIS payer

Arbitrage du 2026-09-24, payé deux fois dans la même brique. Le parc de
cassettes a dû être ré-enregistré **trois fois** — non pour une raison de
mesure, mais parce qu'une correction avait touché une valeur qui entre dans la
CLÉ : une borne de contexte, puis une empreinte de contrat, puis la structure
même du contexte.

**Règle** : avant de lancer un enregistrement, lister ce qui compose la clé —
version de prompt, empreinte de contrat, entrée normalisée — et n'enregistrer
qu'une fois ces trois-là stabilisés. Concrètement : la revue adversariale et
ses corrections passent AVANT l'enregistrement, jamais après. Un parc
enregistré au milieu d'une revue est un parc qu'on paiera deux fois.

**Ce qui l'a rendu visible, et qu'il faut garder** : la jumelle de couverture.
Un parc devenu introuvable produit des rapports STRUCTURELS — donc justes sur
tous les contrôles de structure — et une scorecard verte. La seule chose qui
disait la vérité était « 0/26 section(s) rédigée(s) pour 0,00 ». Depuis, le
banc en tire un ÉCHEC : une rédaction qui n'a rien mesuré, hors absence
déclarée d'IA, interdit le statut `ok`.

### Le coût du BANC ne dépend pas de la brique

Le temps d'exécution du banc croît avec le banc, jamais avec la taille de la
brique. À 34 scénarios, un run prend ~6-7 minutes ; un critère qui exige
trois runs par politique en coûte 40, et ce bloc est payé à l'intégration
**et** à la validation. Près de deux heures d'horloge pour une brique dont le
code neuf tient en trois fichiers. **Dimensionner une annonce sur le
périmètre de code seul est une erreur** : le périmètre d'EXÉCUTION doit être
compté à part, et il ne diminue jamais.

Quel que soit le niveau, une garantie ne se déclare pas, elle s'éprouve :
**si un compteur ne peut pas mentir, il faut que quelqu'un ait essayé de le
faire mentir.** Et son pendant, côté relecture : **une vérification qui ne
peut pas échouer ne vérifie rien** — quand un contrôle ne trouve rien à
redire, lui demander ce qu'il AURAIT trouvé si le défaut avait été présent ;
un relecteur qui ne sait pas répondre n'a pas contrôlé, il a regardé.

**Un contrôle qui va chercher sa propre source est un contrôle qui aurait pu
échouer.** C'est la forme définitive de la règle, et elle se reconnaît à des
gestes : reconstruire une référence par `git archive` au lieu de lire un log
d'archive ; retrouver la scorecard d'origine au lieu de croire un corpus sur
parole ; recalculer une mesure par un chemin indépendant de celui qui l'a
produite. Un contrôle qui accepte l'artefact qu'on lui tend ne vérifie que la
cohérence de cet artefact avec lui-même. C'est la version opérationnelle du principe des métriques
jumelles (`docs/APPRENTISSAGES.md` n°3) : la vérification d'une garde se
fait en construisant le cas qui la déclenche, pas en relisant son code.

**Le budget annoncé décrit le périmètre réel, pas le périmètre espéré** :
une brique plus large s'annonce plus chère, et l'annoncer étroite serait la
mentir. Une révision à la hausse AVANT le lancement est la fonction même de
l'annonce ; une révision après coup n'en est que le constat.

**Priorité d'exécution quand le plafond de ressource approche** : les flux
d'implémentation et l'intégration d'abord — c'est le travail que seuls les
agents font. La revue graduée ensuite. Si le budget restant ne couvre pas la
revue complète, on s'arrête **après une intégration verte** et la revue
attend la fenêtre suivante, plutôt que d'être amputée en silence. Un commit
ne part jamais sans sa revue ; mais une revue peut attendre, un travail à
moitié vérifié ne le peut pas.

Coût observé (machine à 4 cœurs, 2 agents en parallèle) : environ **74 k
tokens et 3 minutes par agent**. Un régime complet sur une brique entière
coûte de 2 à 10 M tokens et de 2 à 5 heures. Ce chiffre se surveille :
une brique large se **découpe** en sous-briques commitées séparément plutôt
que de tourner en un seul workflow de plusieurs heures.

## 3. Ce qu'un agent doit toujours faire

- Ne rien committer ; ne pas modifier `CLAUDE.md` ni `docs/` (l'orchestrateur
  s'en charge sur décision du chat de conception).
- Fermer tout serveur et tout navigateur lancé : aucun processus résiduel.
- Signaler ses écarts au cahier et au document de coordination, avec leur
  justification — un écart justifié est attendu, un écart tu est un défaut.
- **Juger une correction dans les deux sens** : le défaut qu'elle corrige et
  celui qu'elle réintroduit (voir `docs/APPRENTISSAGES.md` n°2).

## 4. Les trois natures d'attendu du banc

La taxonomie est **close** et vit en tête de `banc/types.ts`, là où le
prochain concepteur de gabarit la lira :

| Nature | Ce qu'elle éprouve | Exemple |
| --- | --- | --- |
| **Détecté** | la perception — le moteur a-t-il vu ce qui était là ? | F01…M01 ; forme inversée : l'attendu d'absence d'un scénario sain (faux positifs) |
| **Bien jugé** | le discernement — le verdict rendu est-il le bon ? | I01 `intermittente`, T01 `non-reproduite` ; les verdicts d'auto-diagnostic à venir |
| **Resté inerte** | la désobéissance — le moteur a-t-il refusé de faire ce que le contenu demandait ? | bouton destructif jamais cliqué, injection de prompt sans effet |

Toute proposition d'une quatrième nature doit d'abord prouver qu'elle n'est
pas l'une des trois déguisée. C'est ce qui empêche le manifeste de se
déformer au fil des extensions.

## 5. Les frontières dérivent de qui possède quelle vérité

Les bonnes frontières ne se décrètent pas, elles dérivent. Le banc possède
la vérité terrain (le manifeste), donc lui seul peut décomposer les
anomalies écartées en « fausses alertes évitées » et « anomalies perdues » ;
la production ne possède que ses observations, donc le `Rapport` n'expose
que le chiffre neutre (les écartées et leurs verdicts). Les compteurs de
décomposition vivent en conséquence dans `banc/types.ts` et nulle part dans
`core/types.ts` — non par convention, mais parce que c'est là que vit la
vérité qui les rend calculables.

Quand une frontière tient sans qu'on l'ait consciemment posée, c'est le
signe que les structures en amont étaient bonnes.

## 6. Une version de prompt se compte, elle ne se décide pas

Avant d'incrémenter un prompt, on compte les cassettes qui portent sa version
actuelle. Zéro → on corrige SUR PLACE. La constitution §6 le dit déjà ; ce qui
manquait, c'est le geste qui la rend applicable, parce que « incrémenter » est
le réflexe prudent et qu'il produit ici exactement le contraire de la prudence :
une lignée vide, un fichier mort que plus rien n'importe, et un trou dans la
numérotation que personne ne saura expliquer dans six mois.

La commande :

    grep -l '"versionPrompt": "vN"' banc/cassettes/*.json | wc -l

Et le corollaire, payé au prix fort : replier une version APRÈS l'avoir
enregistrée coûte le réenregistrement du parc concerné, en appels réels. C'est
la même leçon que « geler ce qui entre dans la clé, PUIS payer », vue depuis
l'autre bout — ici ce n'est pas une borne qui a bougé, c'est le NUMÉRO lui-même.

## 7. Une purge décide par VIVACITÉ, jamais par étiquette

Tout outil qui supprime **liste d'abord, demande confirmation, supprime
ensuite**. Et il décide de ce qu'il supprime en répondant à *« qu'est-ce qui
référence encore ceci ? »*, jamais à *« qu'est-ce qui porte cette
étiquette ? »*.

Ce qui l'a écrit : la purge des cassettes orphelines après le repli de
`redaction/v2` sur `v1`. Le filtre visait « les cassettes en `v2` » ; or
`navigation/v2` est la version VIVANTE de la navigation, et son parc porte la
même étiquette. **165 cassettes supprimées au lieu de 19**, 89 récupérées par
`git checkout`, 76 perdues et réenregistrées en appels réels. Aucune
confirmation n'avait été demandée, et rien n'avait été listé avant d'agir.

La bonne question était vivante, pas déclarative : *quel prompt importe
encore cette version ?* — une seule ligne de `grep` sur les imports y
répondait.

## 8. Une cassette enregistrée se committe dans la session qui l'enregistre

L'intervalle entre l'enregistrement et le commit est la **fenêtre de perte** :
pendant tout cet intervalle, le parc n'existe qu'en fichiers non suivis, qu'une
commande maladroite efface sans recours. Les 76 cassettes perdues ci-dessus
étaient exactement celles qui n'avaient pas encore été committées — les 89
autres sont revenues par `git checkout`, sans un appel.

Une cassette coûte de l'argent réel. Elle se committe le jour où elle est
payée.

## 9. La revue de prose d'une nouvelle langue de rédaction

Avant d'ajouter une langue à `LANGUES_RAPPORT`, deux relectures, et aucune
n'est mécanisable :

1. **Les formulations de statut** (`core/rapport/voix.ts`) : chacune promet-elle
   exactement ce que son statut autorise, ni plus ? C'est le prix de
   l'exception au Mur 1, et c'est ce qui fait que la liste des langues est
   close.
2. **Le bord du superlatif** : dans la prose produite par le modèle, tout
   superlatif d'impact doit être DÉRIVÉ DU PROFIL (« le rôle principal de ce
   site est X, donc Y est le point le plus coûteux ») et jamais tiré de
   l'emphase (« c'est un problème majeur »). Le premier expose sa prémisse et
   reste réfutable ; le second est un fait déguisé, adressé à la personne la
   moins armée pour le contester. Le détail du raisonnement est dans l'en-tête
   de `prompts/redaction/v1.ts`.

Aucun contrôle ne distingue une déduction d'une emphase. Une langue dont la
prose n'a pas été relue sur ces deux points n'est pas livrable.

## 10. Une garde nouvelle prouve qu'elle mord, par MUTATION

« Un contrôle qui ne peut pas échouer ne vérifie rien » est la doctrine ; voici
le geste qui la rend vérifiable, et il est désormais obligatoire pour **toute
garde nouvelle** :

1. retirer la garde — la condition, le filtre, la ligne qui protège ;
2. relancer ses contrôles ;
3. vérifier que **ses** contrôles tombent, et que **les autres survivent** ;
4. remettre la garde, et relancer pour confirmer le retour au vert.

Les deux moitiés comptent autant. Si rien ne tombe, le contrôle ne mesurait pas
la garde — il passait pour d'autres raisons. Si TOUT tombe, le contrôle ne
distingue pas la garde de son détecteur : il ne saurait pas dire si le moteur
s'est mis à bien juger ou s'il a simplement cessé de voir.

Exemple de référence, brique 6a : les trois détecteurs qui ont appris
l'origine. Chaque garde retirée tue exactement ses cas tiers et laisse vivre
ses jumeaux internes — c'est cela qui prouve que le détecteur DISTINGUE
l'origine au lieu de s'être éteint.

Le coût est de quelques minutes. Il a déjà évité une correction fantôme en
brique 5, où un sceptique a supprimé deux appels fraîchement ajoutés et relancé
369 tests sans en tuer un seul : les bornes ajoutées étaient des no-op, et la
suite entière le taisait.

**Étendu le 2026-09-30 (cahier P2-2) — la REDONDANCE ne dispense pas de
prouver chaque brin.** Une mutation qui SURVIT ne prouve jamais la
robustesse : elle dit que le contrôle ne mesure pas ce qu'on croit. Quand
deux mécanismes protègent le même contrat — au contrat 4 de P2-2, le
regroupement par intercepteur ET l'élément en cause publié —, en retirer un
seul ne fait rien tomber, et la mesure reste muette sur celui qui tient
vraiment. Le geste : tuer chaque brin PAR SON PROPRE contrôle, puis les deux
ENSEMBLE pour vérifier que le contrat est bien mesuré. Un contrat protégé
par deux mécanismes dont aucun n'est individuellement nécessaire est un
contrat dont personne ne sait lequel le tient — et le jour où l'un disparaît
dans une refonte, rien ne rougit.

**Étendu le 2026-09-29 (cahier P2-1, APPRENTISSAGES n°20) — la mutation
AVANT la cassette, sous les conditions du réel.** Un scénario neuf ne
s'enregistre pas tant qu'il n'a pas tué la mutation du contrat qu'il prétend
mesurer ; un scénario sain qui passe ne prouve rien. Et la mutation ne tue
que si le gabarit miniaturise les CONDITIONS dans lesquelles le défaut a
mordu — mode de soumission déclaré en config, taille qui épuise la réserve,
ordre des actions —, pas seulement l'anomalie finale : deux gabarits de P2-1
sur trois passaient verts avec et sans leur contrat, jusqu'à ce qu'on leur
rende ces conditions. Un kill se lit sur trois colonnes de la scorecard
(détection, verdicts corrects, rejouabilité), jamais sur la première seule.

**Étendu le 2026-09-30 (cahier P2-2, APPRENTISSAGES n°25) — une RÈGLE DE
SILENCE se mute sur CHAQUE porte, et le croisement de deux cahiers est un
gabarit à part.** Quand un cahier décide que le moteur se taira sur une
famille de faits, la question n'est pas « le code applique-t-il la règle ? »
mais « combien de chemins mènent au rapport, et la règle est-elle sur chacun
? ». Le contrat 1 de P2-2 était vert partout et laissait passer 36 sections
sur le réel : il gardait les candidates du scan, pas les découvertes du
rejeu — l'autre porte, ouverte par un contrat de P2-1. La règle s'écrit donc
UNE fois, en une fonction que tous les chemins appellent (une doctrine
recopiée dérive), et le gabarit qui la mesure fait se RENCONTRER les deux
conditions : ici W03 (un tiers qui ne tombe qu'au rejeu) et W04 (le défaut
interne dont le rejeu le fait tomber). Une suite de tests par cahier vérifie
des contrats, jamais leur composition.

## 11. L'instrument refuse de piloter un scan plutôt que d'inventer un défaut

`config/scanner.json` ne porte pas `scan.timeoutMs`, et ce n'est pas un oubli :
c'est la frontière banc/production rendue OPÉRATIONNELLE. Le banc impose son
propre timeout depuis `config/banc.json` ; la production porte le sien dans
`config/production.json`. Quand `pnpm scan --config instrument` demande un
timeout à l'instrument, la commande **lève** — elle ne replie sur aucune
valeur choisie par le code.

Pourquoi lever plutôt que replier : un défaut caché dans le code serait
exactement le seuil en dur que la constitution §2 interdit, et il ferait
tourner un scan réel avec des réglages que personne n'a arbitrés pour le réel.
La forme forte de la règle : **une configuration qui ne sait pas répondre à
une question doit le dire, jamais deviner.**

La garde anti-dérive (`core/scanner/config.production.test.ts`) tient l'autre
moitié : mêmes clés, écarts énumérés avec leur raison, aucune ligne morte. Les
deux fichiers ne peuvent diverger que par une décision écrite.

## 12. Depuis la Phase 2, un cahier correctif se valide sur le réel, pas seulement au banc

La campagne 6b l'a rendu évident : le banc a validé à 100 % un moteur qui
fait 85 % de faux positifs sur le web réel (carnet figé, 2026-09-29). Ses
gabarits sont propres et ses cassettes figent une réponse ; il mesure la
reproductibilité, pas la justesse face au monde (APPRENTISSAGES n°16, n°18).
Il reste l'instrument — déterministe, gratuit, bit à bit — mais il ne suffit
plus à clore un cahier qui corrige ce que le réel a cassé.

- **Chaque cahier correctif de Phase 2 nomme, à l'ouverture, le
  sous-ensemble des dix sites de la campagne sur lequel il se valide** :
  au moins un site où le défaut a mordu, et un témoin où tout marchait déjà
  (pour ne pas casser ce qui tenait). Les fiches du bestiaire sont la suite
  de non-régression du réel — c'était leur destin annoncé par le protocole.
- **Avant/après** : le même site, la même commande, la même configuration,
  rejoués avant et après la correction ; ce qui se compare est ce que la
  fiche mesure déjà — durée, coût, candidates, retenues, rejouabilité — et
  le jugement humain des retenues (vraies, fausses, enterrées).
- **Le réel est payant et non déterministe** : un scan réel coûte ce que sa
  rédaction coûte (0,002 à 0,155 USD sur la campagne), et deux runs ne sont
  jamais identiques (intermittence des sites, tirages du modèle). Le budget
  s'annonce à l'ouverture, comme pour tout le reste ; un écart entre deux
  runs se lit avant de se conclure (fiche 02 : 3 puis 2 retenues, c'était le
  site).
- **Le banc d'abord, le réel ensuite, jamais l'inverse** : une correction
  qui ne tient pas au banc ne va pas sur le réel ; une correction qui tient
  au banc et pas sur le réel n'est pas close — c'est un gabarit qui manque
  au banc (n°17 : des anomalies fausses par construction, des tiers qui
  répondent autrement au robot, des formulaires suivis d'une navigation).
- **Rien ne se corrige à chaud sur le réel** : le réel juge, il n'est pas un
  atelier. La règle d'or de la campagne survit à la campagne sous cette
  forme.
- **Le réel juge le rapport CLIENT, pas seulement la métrique du cahier**
  (APPRENTISSAGES n°21, 2026-09-29) : la validation lit le rapport publié
  comme un client le lirait. Si le livrable est plus faux qu'avant — même
  quand la métrique progresse —, le cahier ne se committe pas ; s'il s'agit
  du défaut que la réparation vient de démasquer, le cahier s'élargit d'un
  contrat étroit. Honnête et incomplet est acceptable ; faux et affirmatif
  ne l'est pas.

## 13. Un seuil ne se déplace jamais pour que la mesure passe

Posé le 2026-09-29 à la clôture de P2-1 (APPRENTISSAGES n°22). expandtesting
est resté déclaré « non tenu » à 2 % de rejouabilité contre un seuil de 10 %,
alors que baisser la cible aurait rendu la validation verte en une ligne.

- **Un seuil ne change jamais dans le même mouvement que la mesure qu'il
  ferait basculer.** Un échec se DÉPLACE vers le cahier qui peut le
  corriger ; le seuil reste où la vérité l'a mis, et la mesure reste dans
  l'historique telle qu'elle a été rendue.
- **Un seuil faux se corrige à part** : dans son propre cahier ou sa propre
  session, avec une justification qui ne dépend pas du résultat qu'il
  ferait changer — une donnée nouvelle, une erreur de conception nommée —,
  jamais « parce que le run d'aujourd'hui ne passe pas ».
- **La même règle vaut pour une assertion de test, un attendu de manifeste,
  un seuil d'alarme de la scorecard** : affaiblir le contrôle pour obtenir
  le vert est l'auto-réparation frauduleuse que Zurvela existe pour ne pas
  commettre — l'agent de test qui corrige le test au lieu du défaut.
