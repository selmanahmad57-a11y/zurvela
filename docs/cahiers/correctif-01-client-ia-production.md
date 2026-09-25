# ZURVELA — Cahier correctif n°1 : le client IA de production

Ouvert le 2026-09-25, depuis le bestiaire (fiche 02, observation 1). Régime :
COMPLET — c'est du moteur, de l'IA et de l'assemblage. **La campagne est
suspendue** jusqu'à sa clôture : les scans 3+ mesureraient encore le silence.

> **Clos le 2026-09-25 en ÉCHEC PARTIEL DOCUMENTÉ** (arbitrage rendu, §6.5) :
> le client est câblé et l’assemblage est équivalent sur toutes les familles
> sauf la détection en politique IA — 91,4 % en production réelle contre 100 %
> sur cassettes, l’écart étant une variance de décision que le rejeu masquait.
> Ce que ce cahier a appris vaut plus qu’un succès : APPRENTISSAGES n°16,
> dette n°19 promue cahier correctif n°2.

## 1. Le fait

`creerClientIa` (`core/ia/index.ts`) rend TOUJOURS le client sans capacité ;
avec une clé présente, la raison est littéralement `non-implemente`. Le seul
constructeur du vrai client Anthropic vit dans `banc/ia.ts`. L'assemblage de
production (`creerScannerParDefaut` → `creerClientIa`) n'a jamais été câblé :
en production, ni profil, ni auto-diagnostic, ni rédaction.

Pendant quatre briques, chaque mesure d'IA est passée par le client injecté du
banc. Le banc mesurait fidèlement un moteur qui n'était pas celui de
production (APPRENTISSAGES n°15). Le bilan de Phase 1 porte un astérisque
(`docs/ROADMAP.md`) jusqu'à la clôture de ce cahier.

## 2. Contrats — avant toute implémentation

1. **`creerClientIa` ne ment plus.** Avec une clé, il construit le VRAI client
   (`creerClientAnthropic`) ; sans clé, le client sans capacité avec la raison
   `cle-absente`. La raison `non-implemente` disparaît de ce chemin — elle
   décrivait un état qui n'a plus le droit d'exister.
2. **Un seul assemblage.** `creerScannerParDefaut` monte le client de
   production par le même code que le banc en mode enregistrement
   (`creerClientAnthropic`, mêmes configs de profilage, navigation, diagnostic
   et rapport). Le banc INJECTE encore son client rejouable pour ses runs
   ordinaires — c'est l'instrument, il reste déterministe et hors réseau.
3. **L'assemblage réel est exercé par un chemin qui ne l'injecte pas** (n°15) :
   un test monte `creerScannerParDefaut` SANS `options.ia`, avec une clé
   factice et un SDK doublé, et vérifie `ia.mode: actif`. Le contrôle doit
   pouvoir échouer : le même montage sans clé rend `degrade / cle-absente`.
4. **Mode « équivalence » du banc : `pnpm banc --assemblage-production`.** Le
   sujet est le moteur monté par `creerScannerParDefaut` sans injection — le
   vrai client, le vrai réseau, la vraie dépense. Il est PAYANT et non
   déterministe, et il le dit en tête de run. Il n'écrit aucune cassette : il
   mesure, il ne remplace pas le parc. Il refuse de démarrer sans clé.
5. **La clôture est une mesure, pas un commit.** Le cahier est clos quand le
   run d'équivalence retrouve les chiffres de Phase 1 — détection 100 %
   (35/35 en IA), 0 faux positif, gravités 100 %, rapports justes — à travers
   l'assemblage de production. Un écart n'est pas un échec du cahier : c'est la
   première mesure vraie du produit, à lire ligne à ligne.

## 3. Budget

Le run d'équivalence coûte ce qu'un run IA du banc coûte au tarif enregistré :
**~1,73 USD** (43 scénarios), plafond annoncé à **2,50 USD** pour ce run-là,
qui porte le chiffre à confirmer (100 % en politique IA). La jumelle
déterministe (~0,89 USD, profilage et rédaction seuls) est un **second run,
annoncé à part** — la première version de ce paragraphe additionnait les deux
sous un seul plafond qu'ils dépassaient ensemble (2,62 USD).

## 4. Hors périmètre

Les autres trouvailles du bestiaire (ORB dans `erreursReseauIgnorees`,
`mesure: null` des rejeux de lenteur, arbitrage échéance vs politique) : des
cahiers suivants, après la reprise de la campagne.

## 5. Livraison

Le test d'assemblage non injecté ; le run d'équivalence et son tableau face au
bilan de Phase 1 ; la scorecard ordinaire (parc rejoué, périmètre historique
intact) ; l'astérisque du ROADMAP levé ou maintenu, honnêtement ; commit
« Correctif n°1 — le client IA de production », puis reprise au scan n°3.

## 6. Mesure d'équivalence — 2026-09-25, 13:22 → 13:48

Run : `pnpm banc:equivalence --tous --politique ia`, moteur `700aee4` + arbre
de travail du correctif. Scorecard `banc/resultats/2026-09-25T11-22-14.007Z.json`
(étiquetée `assemblage: production`) ; référence
`banc/resultats/2026-09-25T06-55-33.013Z.json` (politique IA, cassettes).
Dépensé : **1,653 USD** sur 1,73 annoncés (plafond 2,50).
La scorecard n’est pas suivie par git (`banc/resultats/*`, rétention 100 runs) :
un extrait — mesures de tout le parc, journaux complets des trois ratés — est
conservé à côté de ce cahier, `correctif-01-equivalence.scorecard.json`.

| Famille | Référence (cassettes) | Production (réseau réel) |
|---|---|---|
| Client IA | injecté par le banc | construit par le moteur — `ia.mode: actif` 43/43, 0 repli |
| Détection | 100 % (35/35) | **91,4 % (32/35)** — 3 ratés |
| Faux positifs | 0 | 0 |
| Gravités conformes | 100 % (31/31) | 100 % (29/29) |
| Profils / inerties | 35/35 · 8/8 | 35/35 · 8/8 |
| Cibles sous budget (IA) / inerties | 20/20 · 10/10 | 20/20 · 10/10 |
| Rapports justes / inerties | 41/41 · 2/2 | 41/41 · 2/2 |
| Couverture de rédaction | 31/31 | 29/29 |
| Coût total · par scan | 1,733 · 0,040 USD | 1,653 · 0,038 USD |
| Durée par scénario | ~9,9 s | ~36,5 s (latence réseau) |
| Écart inter-langues | 0 pt | 6,2 pt — alarme |

### 6.1 Ce que la mesure établit

L'assemblage est équivalent : chaque famille que le câblage touche —
profilage, navigation, diagnostic, rédaction, coût — rend les mêmes chiffres
à travers le client que le moteur construit lui-même. Contrats 1 à 4 tenus,
sur le vrai réseau, à la vraie dépense.

### 6.2 Les trois ratés, ligne à ligne

`formulaire-contact--f02--en`, `--i01--en`, `--l01--fr`. Même séquence dans
les trois journaux, sur les DEUX viewports : l'IA choisit `soumettre` avant
`remplir` ; le moteur bloque (`validation-native`, trois champs requis vides —
c'est le web, pas le monde : Mur 3 respecté) ; au tour suivant, l'historique
montré à l'IA dit « soumettre sur /contact » sans l'issue (l'historique ne
porte que le type et la page, `explorateur.ts`), l'IA conclut « déjà soumis »
et élit `terminer`. Le bug attendu ne se manifeste qu'à une soumission
réelle : aucune candidate, raté.

Ce n'est pas un défaut du câblage. Le mécanisme est présent à l'identique
dans la référence : soumission avant remplissage sur 49 des 86 passes
viewport (46 en production), `terminer` après blocage 37 fois sur 43 (30 sur
38). La référence ne ratait pas — pour une raison qui ne tient pas au moteur.

### 6.3 Pourquoi la référence affichait 100 % — le fait nouveau

Première décision prise sur `/contact`, gabarit formulaire-contact, 33 passes
par viewport :

| | Raisons distinctes (desktop / mobile) | Paires desktop→mobile |
|---|---|---|
| Référence | 8 / 8 — deux cassettes couvrent 27 passes sur 33 | remplir→soumettre 15 · soumettre→remplir 16 · remplir→remplir 2 · **soumettre→soumettre 0** |
| Production | 33 / 33 — un tirage par passe | 5 · 11 · 13 · **4** |

Les cassettes sont indexées sur l'entrée normalisée ; quatorze scénarios
présentent la même entrée sur `/contact`, donc la même réponse figée. Et les
deux passes d'un scénario sont VERROUILLÉES : l'historique du viewport mobile
contient les actions du desktop, si bien que « desktop prématuré » entraîne
« mobile remplit » et inversement — chaque scénario obtenait mécaniquement
une bonne passe, et aucun ne pouvait manquer les deux. Le 100 % de la Phase 1
en politique IA tient sur deux cassettes, pas sur trente-cinq tirages. À
tirages indépendants, avec ~45 % de soumissions prématurées par passe, deux à
trois ratés sur dix-huit scénarios à formulaire sont attendus ; il y en a eu
trois.

L'alarme inter-langues (6,2 pt) est le même tirage : deux ratés en `en`, un
en `fr`, sur des paires dont la jumelle est détectée. Un biais se confirme
par répétition, pas par une passe ; elle sera relue au run suivant.

### 6.4 Verdict sur le contrat 5

Le run ne retrouve pas 35/35 ; il retrouve tout le reste. Lu ligne à ligne,
l'écart n'est pas entre deux assemblages : il est entre un instrument qui
rejoue et un produit qui tire au sort. C'est la première mesure vraie de la
politique IA — **91,4 % en une passe, 0 faux positif, 0,038 USD par scan** —
et le chiffre de Phase 1 était une propriété du parc de cassettes. Le contrat
5, tel qu'écrit, n'est pas tenu à la lettre ; la clôture est un arbitrage,
pas une exécution. Trois suites, hors de ce cahier :

- **APPRENTISSAGES n°16** — une cassette réutilisée n'est pas N échantillons ;
  le rejeu fige la variance d'une politique et l'instrument ne peut pas voir
  ce que le produit tire au sort.
- **Dette n°19** — l'historique montré à l'IA ne porte pas l'issue des
  actions : une soumission bloquée y figure comme une soumission. Prompt de
  navigation v3 + état normalisé (cahier à ouvrir ; le blocage lui-même est le
  bon comportement).
- **Variance mesurée** — `pnpm banc:variance-ia --mesure decision` sur la
  décision `/contact` : quelques centimes, pour poser une probabilité au lieu
  d'une estimation.

Note : `config/production.json` porte `exploration.politique: deterministe` —
la campagne (scans 1 et 2) tourne sous cette politique. Sa jumelle
d'équivalence (~0,89 USD, profilage + rédaction seuls) est le second run
annoncé au §3, non lancé.

### 6.5 Arbitrage rendu (2026-09-25)

1. **Commit tel quel, verdict dans le titre.** Un commit qui enterrerait
   91,4 % dans un tableau mentirait par titre. Le contrat 5 n’est pas tenu à
   la lettre : le cahier se clôt en échec partiel documenté, pas en succès.
2. **La dette n°19 est le cœur du sujet, pas une annexe.** Une IA qui voit
   « soumettre sur /contact » sans savoir que c’est bloqué conclut
   logiquement « déjà fait » et abandonne : cause racine des trois ratés, et
   d’une classe entière d’échecs à venir en navigation réelle. Promue
   **cahier correctif n°2** (le prompt de navigation porte l’issue, pas
   seulement l’acte) — prochain gros morceau, à ouvrir avant la reprise
   pleine de la campagne, pas maintenant.
3. **Jumelle déterministe : lancée.** C’est la politique de
   `config/production.json` et de la campagne, et elle remplit avant de
   soumettre par construction (0 soumission prématurée sur son run de
   référence, contre 49/86 en IA). Son chiffre dit si la campagne roule ou
   attend : proche de sa référence (33/35, les deux « ratés » étant des
   cibles hors parcours sous budget, le prix affiché de la gratuité) → la
   campagne reprend au scan n°3 en déterministe pendant que le cahier n°2
   corrige l’IA ; dégradée aussi → la campagne reste suspendue.
4. **Variance sur la décision `/contact` : NON lancée, et voici pourquoi.**
   `banc:variance-ia --mesure decision` échantillonne, par construction, le
   PREMIER point de décision du scénario — sur le gabarit formulaire-contact,
   c’est la page d’accueil (« naviguer vers /contact »), pas la décision en
   cause. Dépenser pour mesurer le mauvais point et le présenter comme la
   réponse serait un faux chiffre de plus. Le chiffre demandé existe déjà,
   à tirages indépendants, dans le run d’équivalence (§6.3) : première
   décision sur `/contact`, **soumettre avant remplir 15/33 en desktop
   (45 %), 9/33 en mobile (27 %), les deux viewports 4/33 (12 %)**. L’outil
   gagnera une option de point de mesure (page ou rang) en ouverture du
   cahier n°2, où sa variance doit être posée AVANT la première cassette v3.

## 7. Annonce de budget — jumelle déterministe

Run : `pnpm banc:equivalence --tous --politique deterministe`. Coût attendu
**~0,89 USD** (profilage ~0,05 + rédaction ~0,84 au tarif de la référence
déterministe du 2026-09-25 06:35 ; décisions gratuites), **plafond 1,20 USD**.
Référence de comparaison : `banc/resultats/2026-09-25T06-35-05.501Z.json`
(33/35, 0 faux positif, gravités 29/29, profils 35/35, rapports 41/41).

### 7.1 Résultat — 2026-09-25, 14:11 → 14:24

Run sur le moteur committé `7f6aa1c`. Scorecard
`banc/resultats/2026-09-25T12-11-43.323Z.json` (étiquetée `assemblage:
production`) ; extrait sans journaux à côté de ce cahier,
`correctif-01-equivalence-deterministe.scorecard.json`. Dépensé : **0,893 USD**
sur 0,89 annoncés (plafond 1,20).

| Famille | Référence déterministe (cassettes, 06:35) | Production (réseau réel) |
|---|---|---|
| Client IA actif | injecté | 43/43 — 0 décision confiée au modèle (politique déterministe) |
| Détection | 33/35 (94,3 %) | **33/35 (94,3 %)** |
| Ratés | mini-boutique f01 en/fr | les mêmes deux |
| Faux positifs | 0 | 0 |
| Gravités · profils · rapports | 29/29 · 35/35 · 41/41 | 29/29 · 35/35 · 41/41 |
| Cibles (déterministe) | 20/20 conformes, inerties 10/10 | 20/20, 10/10 |
| Soumission avant remplissage | 0 sur 86 passes | **0 sur 86 passes** |
| Coût total · par scan | 0,891 · 0,0207 USD | 0,893 · 0,0208 USD |
| Écart inter-langues | 0,3 pt | 0,3 pt |

Bit à bit sur chaque compteur ; seuls la durée (latence réseau) et quelques
dix-millièmes de dollar bougent. Les deux « ratés » sont les mêmes F01 de la
mini-boutique, dont la page `/devis` est une cible **déclarée hors parcours
sous budget pour cette politique** (`atteinteAttendue.deterministe: false`,
attendu satisfait) — le prix affiché de la gratuité, pas un défaut.

### 7.2 Ce que le chiffre décide

La politique de `config/production.json`, celle de la campagne, produit en
production réelle exactement ce que le banc lui prédit, et elle ne souffre
pas du mécanisme de la dette n°19 : elle remplit avant de soumettre par
construction, 0 soumission prématurée sur 86 passes, contre 45 % en IA.
**La campagne peut reprendre au scan n°3 sur la politique déterministe**
pendant que le cahier correctif n°2 corrige l'IA — les deux chantiers ne se
bloquent pas. Le bestiaire mesurera désormais `7f6aa1c` : la règle d'or
reprend à cette version, et les fiches 01 et 02 restent valides (elles
notaient la déterministe, dont rien n'a bougé hors le client de profilage et
de rédaction, désormais présent).
