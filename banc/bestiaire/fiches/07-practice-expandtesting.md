# Fiche 07 — practice.expandtesting.com

| | |
|---|---|
| **date** | 2026-09-25, 15:48 → 15:53 |
| **rang de cible** | 3 — site public d'entraînement à l'automatisation (nommé, pas anonymisé) ; lourd : Google Ads, Funding Choices, Tag Manager, jsdelivr, cdnjs |
| **url** | `https://practice.expandtesting.com` (101 liens internes sur l'accueil ; `robots.txt` interdit `/download/*`, `/notes/api/*`, `/download-secure`, `/digest-auth`, `/infinite-scroll/*`) |
| **version du moteur** | `5d5fc74` — code moteur inchangé depuis `7f6aa1c` |
| **config** | production — politique `deterministe`, `soumission: aucune`, robots.txt respecté, 1 000 ms entre pages, budget 0,5 USD, échéance 300 s, client IA actif |
| **commande** | `pnpm scan https://practice.expandtesting.com --config production --sortie banc/bestiaire/fiches/07-practice-expandtesting.rapport.md --journal banc/bestiaire/fiches/07-practice-expandtesting.journal.json` |
| **journal** | **hors dépôt** (arbitrage du 2026-09-29, C-13) : `~/.config/zurvela/bestiaire/07-practice-expandtesting.journal.json` — 6859721 octets, sha256 `e448d0a18282e71b…` |

## Chiffres bruts (recopiés de la sortie de la commande)

| durée (ms) | coût (USD) | pages | candidates | retenues |
|---|---|---|---|---|
| **295 897** | **0,002348** | 31 | **187** | **0** |

**Candidates rejouables : 0/187 (0/93 groupes)** — échéance atteinte, 0 tentative.

`mode IA : actif`. Coût : profilage 0,0023 · rédaction 0. **Chronologie** :
profilage +10,5 → +12,7 s (extraction tronquée à 6 000 caractères, proprement)
· exploration desktop **20 pages en 194 s** — les six premières pages à
10–27 s chacune (publicités), 4–6 s ensuite · mobile 11 pages en 102 s ·
**échéance à +295,8 s** · confirmation 8 ms, 0 rejeu · rapport sans section.
Arrêt `echeance`. Robots : **86 refus sur 55 URL distinctes**, tous conformes
(fichiers de `/download/*`, `/notes/api/*`, `/download-secure`, `/digest-auth`).
Actions : 30 navigations, 12 remplissages (`/xpath-css-tester`, `/login`,
`/register`, `/forgot-password`, `/otp-login`, `/form-validation`, `/upload`),
**0 soumission**, 1 navigation en échec (`/otp-login`, mobile, sans suite).

## Rapport

Lu par : l'agent. Fichier : `07-practice-expandtesting.rapport.md`.

Lisible par un non-technicien ? **oui, et il dit l'essentiel sans le
vouloir** : « Aucune anomalie n'a été retenue… 93 autres signalements n'ont
pas pu être re-vérifiés ». Un propriétaire lit 93 et comprend que rien n'a
été vérifié — c'est exactement le cas où le rapport devrait le dire en
première ligne au lieu de « aucune anomalie » (APPRENTISSAGES n°18).

## Observations — une par ligne, une classe par ligne

| # | classe | observation | preuve |
|---|---|---|---|
| 1 | `lenteur-outil` | **Échéance atteinte, deuxième fois (fiche 05), pour une cause nouvelle : les pages sont lourdes de PUBLICITÉ.** Google Ads, Funding Choices, Tag Manager : les six premières pages ont pris 10 à 27 s chacune (attente du réseau des annonces), les suivantes 4 à 6 s une fois les scripts en cache. 31 pages, 0 rejeu, 93 groupes en silence. Nous payons l'échéance pour attendre des ressources que nous ne noterons pas. C-06, revu. | journal : `exploration.page` `/` +9,6 s, `/tips` +16,4 s, `/test-cases` +18,2 s, `/xpath-css-tester` +26,7 s ; `exploration.fin {arret: echeance, pages: 31}` ; `confirmation.fin {dureeMs: 8}` |
| 2 | `comportement-inattendu` | **187 candidates, dont 173 tiers.** 88 polices Google Fonts `ERR_FAILED` (comme cutlybook, fiche 04) ; 64 `fundingchoicesmessages.google.com` `ERR_FAILED` (la plateforme de consentement publicitaire de Google) ; 20 scripts cdnjs `ERR_FAILED` (`popper.js 1.12.9` — le fichier répond 200 au navigateur ; cause non établie, intégrité SRI probable : **si c'est cela, c'est un vrai défaut du site**, enterré sous le silence comme jQuery à books) ; 1 image Google ORB. **Projection** : si les rejeux avaient marché, 93 groupes « confirmés » tiers-mineur → ~93 sections à ≈ 0,012 USD ≈ 1,1 USD : **le plafond de 0,5 USD aurait joué pour la première fois**, et le rapport aurait été partiel — la doctrine tierce coûte de l'argent avant de coûter la confiance. C-05, cinquième cas. | journal : `detection.fin {nbCandidates: 187, parDetecteur: {d-http: 173, d-lenteur: 5, d-recouvrement: 9}}` ; preuves `requete-echouee · font/xhr/script · net::ERR_FAILED · interne false` ; `curl` popper.min.js : `HTTP 200 application/javascript` |
| 3 | `faux-positif` | **Neuf recouvrements « bloquants », tous des publicités — ou un éditeur de code.** Sur mobile, l'`iframe #aswift_8` (annonce Google ancrée) couvre la barre de navigation de l'accueil : quatre candidates sur les liens et le bouton du menu ; sur desktop, `#google-anno-sa` (liens d'annonces intra-texte) intercepte des clics sur `/tips`, `/xpath-css-tester`, `/login` ; et sur `/xpath-css-tester`, le calque de l'éditeur de code (`#html-editor`, CodeMirror) « intercepte » la `textarea` qu'il habille — un éditeur par-dessus sa textarea est la construction normale d'un composant. Géométrie seule, sans tentative de fermeture ni lecture du calque. Non publiés (échéance) ; chacun serait sorti `bloquant` sur un site à publicité. C-12, élargi : annonce ancrée fermable, calque légitime d'un composant. | journal : preuves `interception-clic {intercepteur: iframe #aswift_8}` ×4 (mobile `/`), `{intercepteur: span #google-anno-sa …}` ×4, `{element: textarea#html-editor > textarea, intercepteur: div #html-editor > div …}` ; tous `fonctionnel/bloquant` ou `mobile/bloquant` |
| 4 | `comportement-inattendu` | **`d-lenteur` compte les requêtes EN ATTENTE comme des lenteurs, au palier maximal.** Cinq candidates de type `requete-en-attente` : balises `gen_204` de Google Ads (×2), pixel Tag Manager (×1), scripts `blob:` (×2) — `attenteMs` ≈ 25 000, `dureeMs` 0, confiance 0,7 à **0,95**. Une balise qui ne répond jamais (keep-alive, long-poll) n'est pas une page lente ; un `blob:` interne pendant n'est pas une réponse serveur. Fiche 03 : flux média ; ici : requêtes pendantes. C-02, élargi. | journal : preuves `requete-en-attente {urlRessource: pagead2.googlesyndication.com/pagead/gen_204?…fle-fetch-lat, attenteMs: 24994}` ; `blob:https://practice.expandtesting.com/… · script · attenteMs 24994 · conf 0,95` |
| 5 | `comportement-inattendu` | **Journal de 6,9 Mo en JSON compact** : `ecartees` pèse 5,4 Mo parce que chaque écartée embarque son groupe avec TOUS ses membres (42 Ko par écartée, 187 écartées) — les mêmes candidates recopiées des dizaines de fois, en O(n²). C'est la structure du rapport technique (moteur), pas l'outillage : la compaction (fiche 05) ne pouvait pas y suffire. **Tenu hors dépôt** (arbitrage du 2026-09-29 : on observe le défaut, on ne le corrige pas, on ne s'alourdit pas de sa conséquence) — pointeur et empreinte dans l'en-tête. C-13. | `JSON.stringify(rapport.ecartees).length` = 5,38 Mo sur 6,86 ; `ecartees[0].resultat.groupe.membres.length` = 20 |
| 6 | `RAS` | **La plus grosse épreuve de politesse de la campagne, tenue** : 86 refus robots.txt sur 55 URL distinctes, tous conformes ; 12 formulaires remplis, 0 soumis ; `test@zurvela-scan.invalid` partout ; profil `application` · `en` · 0,95 (extraction tronquée à 6 000 caractères, déclaré) ; budget 0,5 % du plafond. | journal : `exploration.robots.refus` ×86 (`/download/…`, `/notes/api/api-docs`, `/download-secure`, `/digest-auth`) ; actions `remplir/ok` ×12, aucune `soumettre` ; `profilage.extraction {tronque: true, corpsRaccourci: true}` |
| 7 | `comportement-inattendu` | **Couverture 20/101 liens, dans l'ordre de la page** : l'accueil, `/tips`, `/test-cases`, `/about`, puis les formulaires et tables ; jamais `/js-dialogs`, `/windows`, `/iframe`, `/redirector`, `/status-codes`, `/slow`, `/flaky-test`, `/cookie-alert`, `/shadowdom`, `/bookstore`, `/notes/app`… Même constat que fiche 06 : sur un catalogue, l'ordre de la page n'est pas un ordre d'intérêt. C-08. | journal : 20 URL distinctes sur les 101 de l'accueil |

## Ce que ce scan enseigne sur l'inventaire

Ligne(s) de `docs/INVENTAIRE-PRODUCTION.md` confirmée(s) ou raturée(s) :

- **B (échéance) — raturée d'une manière nouvelle** : le coût d'une page
  est dicté par les TIERS qu'elle charge. Attendre le réseau des annonces,
  c'est payer l'échéance pour des ressources qu'on ne juge pas (et qu'on
  jugerait mal, C-05). La ligne doit lier le budget de chargement à ce qu'on
  note : ne pas attendre ce qu'on ne notera pas.
- **A.1 (origine tierce) — cinquième cas** (Funding Choices), et la première
  fois que la doctrine a un COÛT projeté : 93 sections tiers-mineur ≈
  1,1 USD, au-delà du plafond. A.3 aurait joué. Le faux positif tiers n'est
  pas seulement une fausse alerte, c'est une facture.
- **A.2 (politesse) — confirmé** à grande échelle (86 refus).
- **`d-recouvrement`** — la ligne « bandeau de consentement » devient « tout
  calque tiers fermable (annonce ancrée, bandeau, modal) et tout calque
  légitime d'un composant (éditeur, sélecteur de date) » : sans tentative de
  fermeture, le détecteur ne distingue rien de tout cela (C-12).
- **`d-lenteur`** — une requête en attente n'est pas une lenteur ; la ligne
  `seuilMs` ne parle que de réponses reçues (C-02).
- **Rapport technique** — la taille est en O(n²) des candidates par
  duplication des groupes dans les écartées (C-13) ; à 187 candidates, 6,9 Mo.
- **Protocole (brique 3)** — 0/187 : sixième et septième fiches, le taux de
  candidates rejouables reste le chiffre qui décide de tout.

## Revu après P2-1 (2026-09-29)

Rejoué dans la même session par `pnpm banc:reel --avant` (METHODE §12) :
l'« avant » est le moteur de la campagne (`e872872`, code moteur inchangé
depuis `7f6aa1c`), l'« après » le moteur P2-1, à quelques minutes d'écart,
même commande, même configuration de production.

| | durée (ms) | pages | candidates | retenues | rejouables (groupes) | arrêt | journal | coût (USD) |
|---|---|---|---|---|---|---|---|---|
| avant | 295 127 | 31 | 198 | 0 | 0/98 (0 %) | echeance | 7 241 Ko | 0,0024 |
| après | 290 098 | 17 | 135 | **41** | **2/94 (2,1 %)** | reserve-confirmation | 1 738 Ko | 0,0682 |

L'avant reproduit la fiche (échéance, 0 tentative, 7,2 Mo). Ce que P2-1 a
changé, et ce qu'il n'a pas changé :

- **C-06 tenu dans sa lettre** : l'exploration s'arrête à sa fraction
  (+145 s, `reserve-confirmation`, 17 URL au lieu de 20), la confirmation
  reçoit sa réserve (117 s utilisées), la rédaction est plafonnée à 6
  sections sur 41 par le temps restant (`rapport.sections-plafonnees`), et
  le scan finit à 290 s, sous l'échéance.
- **C-13 corrigé** (contrat 7) : 1,7 Mo au lieu de 7,2 Mo.
- **La rejouabilité reste presque nulle** : 2 groupes rejoués sur les 54 de
  la confirmation (2/94 en comptant les découvertes). Chaque tentative coûte
  29 s sur ces pages chargées de publicité ; deux groupes, deux tentatives
  chacun, et la réserve est consommée. Aucune fraction ne finance 54 groupes
  à 58 s : c'est le coût d'un rejeu PAR GROUPE qui borne, pas la
  répartition. **Non tenu** au seuil du cas (10 %), et loin du « proche du
  maximum » attendu.
- **La confirmation rejoue enfin, et C-16 mord** : les quatre tentatives ont
  « découvert » 40 anomalies (`constatee-au-rejeu`, jamais re-testées
  elles-mêmes) — 24 requêtes Funding Choices à URL signée, 12 clics
  interceptés sur l'accueil desktop, 3 polices, 1 ORB. Elles sont publiées
  `confirmee` : **41 retenues là où l'avant n'en publiait aucune.**

**Jugement humain** : le rapport ouvre sur « des clics qui n'atteignent pas
leur cible, ce qui touche des interactions essentielles », puis six sections
`Bloquant` ; les douze clics interceptés ont UN seul intercepteur, l'iframe
publicitaire `#aswift_11` (`aria-label="Advertisement"`), vue pendant un
rejeu — une publicité plein écran, fermable (C-12), jamais re-testée
(statut honnête « non re-testé »), dédoublonnée nulle part (C-16, C-11).
Suivent 35 sections non rédigées. La seule retenue reproduite (popper.js sur
cdnjs, `ERR_FAILED`, tiers) est vraie pour le robot, non démontrée pour un
visiteur. **Les six sections bloquantes sont des alertes non fondées** : le
rapport passe d'un silence non vérifié (« aucune anomalie ») à un bruit non
vérifié et affirmatif — pire pour le différenciateur n°1, parce qu'une
alerte bien rédigée pèse plus qu'un silence (APPRENTISSAGES n°17).

Second « après » (variance, une heure plus tard) : 292 750 ms, 15 pages,
2/79 groupes (2,5 %), 21 retenues dont 20 découvertes au rejeu (18 Funding
Choices, 2 clics interceptés par la même iframe `#aswift_11`), deux sections
`Bloquant`. Même constat, en plus petit : il se reproduit. Journal :
`variance/`, sha256
`16b880388ea1886904f982a287dced1921da2a02536fadfa97ce3294daf8edd3`.

**Après le contrat 8** (même soir, avant/après ; cahier P2-1 §5.2) : 2/101
groupes rejoués, 37 retenues dont 36 découvertes, **aucune publiée comme
vérifiée ni « Bloquant »** — les quinze que le détecteur classait « bloquant
» sortent « Important », « non re-testé », et la méthode compte les 36
constats non re-testés et les 63 signalements non re-vérifiés. Honnête et
incomplet : six sections rédigées pour les mêmes iframes publicitaires
(C-16, P2-2), et le coût du rejeu (29 s par tentative) borne toujours la
rejouabilité. Journal : `contrat-8/`, sha256
`62615ff2925f3e6a7d0b76b3c55f70d1401bb15275fa9d7a87f6cdcf474a5e30`.

Journaux, rapports et résultat hors dépôt :
`~/.config/zurvela/bestiaire/p2-1-reel-2026-09-29/` (journal après :
sha256 `8815dfb101c37f7c1d4d7ff7fd2d9df58ad07593a4c7a33f221aed074465d47f` ; toutes les sommes dans `SHA256SUMS`).
