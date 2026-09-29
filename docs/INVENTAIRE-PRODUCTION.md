# Inventaire — ce qui est calibré pour le banc

**Établi le 2026-09-24, contre `5f655b4` (fin de la Phase 1).**

Document fondateur de la Phase 2. Il répond à une seule question : *qu'est-ce
qui, dans la configuration livrée, n'est vrai que parce que le banc sert des
pages en local ?*

Il a été établi en relisant la configuration livrée et les détecteurs, pas leur
souvenir. **Il a vocation à être raturé ligne à ligne par le bestiaire** : chaque
valeur qui suit est une hypothèse jusqu'à ce qu'un scan réel la confirme ou la
corrige.

Quatre catégories, par ordre de risque au premier scan réel.

## A. Ce qui ne se recalibre pas : ce qui manque

Ces quatre points ne sont pas des valeurs à changer, ce sont des mécanismes
absents. Le banc ne pouvait pas les faire apparaître, parce que sa géométrie
les rend inutiles.

**1. Aucun filtre d'origine sur les 5xx.** `core/scanner/detection/d-http.ts:59` :
le 404 vérifie `signal.interne`, le 5xx **non**. Un widget de chat, une régie
publicitaire, une police servie par un CDN qui rend 500 → anomalie **bloquante
imputée au client**. Même angle mort dans `d-lenteur` et `d-echec-muet`, qui ne
connaissent pas la notion d'origine du tout. Invisible au banc : tout y est même
origine par construction. **C'est le candidat n°1 au faux positif réel**, et il
touche directement le différenciateur n°1.

**2. Aucun `robots.txt`, aucun délai de politesse, aucune limite de débit.**
Rien dans `core/` n'en parle. 20 pages × 2 viewports, plus 2 re-exécutions par
groupe en politique complète, en rafale depuis une IP : c'est un profil
d'attaque pour un WAF, et c'est le premier blocage que le bestiaire
rencontrera.

**3. Aucun plafond de dépense.** Il n'existe aucun `budgetMaxUsd` — ni par scan,
ni par jour. Les seuls budgets du dépôt sont des budgets de *temps* et de
*pages*. Pour une page publique où n'importe qui colle une URL, c'est le réglage
le plus manquant de tous.

**4. Aucun défaut de production pour `OptionsScan.timeoutMs`.** Le contrat
l'exige du caller ; le seul caller existant est le banc, qui lit
`config/banc.json` (60 s). La Phase 2 doit poser cette valeur, et elle n'a pas
de raison d'être 60 s.

**Et une hypothèse à vérifier, pas une certitude** : `d-recouvrement` signale
« clic intercepté par un élément superposé » — c'est la description exacte d'un
bandeau de consentement. Non testé ; si l'hypothèse tient, c'est un faux positif
structurel sur la quasi-totalité des sites européens. À mettre en tête du
bestiaire.

## B. Valeurs calibrées sur des pages servies en local

| Réglage | Valeur | Pourquoi elle est fausse hors du banc |
|---|---|---|
| `detecteurs.lenteur.seuilMs` | 3000 | Le banc sert en **0 ms** et injecte 5000 ms : l'écart est caricatural. Sur mutualisé, 3 s après une soumission est banal. Les paliers (×1 / ×1,5 / ×3) héritent du même étalon. |
| `exploration.chargementPageMs` | 15000 | Mesuré contre `127.0.0.1`. Un premier chargement réel avec polices, images et scripts tiers en consomme une part sans être lent. |
| `exploration.attenteEffetMaxMs` | 8000 | Idem : la fenêtre d'observation d'un effet après clic. |
| `exploration.clicMs` / `saisieMs` / `stabilisationMs` | 2000 / 2000 / 500 | Calibrés sur des pages statiques sans animation ni hydratation. |
| `confirmation.rejeu.*` | 15000 / 10000 / 8000 | Les mêmes étalons, appliqués à la re-vérification — donc l'erreur se paie **trois fois** en politique complète. |
| `exploration.pagesMax` / `profondeurMax` | 20 / 2 | Gabarits de 3 à 5 pages. Un CMS réel expose des centaines d'URLs (pagination, filtres, archives, `?utm=`). |
| `exploration.mutationsMax` | 5000 | Pensé pour du statique. Un carrousel ou un chat widget mute en continu. |
| `bruitFondRepetitions` | 2 | La notion même de « bruit de fond » a été étalonnée sur un site sans tiers. |
| `elementsInteractifsMax` / `liensParPageMax` | 500 / 500 | Jamais approchés au banc ; un méga-menu réel peut les frôler. |
| `confirmation.seuilConfirmationDirecte` / `seuilRetenue` | 0,9 / 0,6 | Calibrés contre des bugs **dont nous connaissions la confiance attendue**. C'est le réglage le plus circulaire du lot, et il n'a qu'un remède : des données réelles. |
| `echeance.repartition` (exploration / confirmation / rédaction) | 0,5 / 0,35 / 0,1 | **La seule ligne de ce tableau qui vient du réel** (cahier P2-1, 2026-09-29) : calibrée sur la campagne 6b — fiches 05, 08 et 10, où l'exploration mangeait l'échéance entière, laissait 5 s à la confirmation, ou laissait la rédaction déborder de 59 s. La somme est < 1 par invariant en code ; le reste est la marge. Sans donnée de plus, ces fractions sont une première pose, pas un étalon. |
| `rapport.dureeParSectionMs` | 6000 | Durée observée d'une section rédigée sur la campagne (fiche 10 : seize sections, 17 s de rédaction en fiche 02). Sert à plafonner le NOMBRE de sections quand le temps restant ne les paie pas ; une valeur trop basse rédige trop et déborde, une valeur trop haute coupe des sections qu'on aurait eu le temps d'écrire. |

**Le point de tension le plus net** : `scan.timeoutMs` (60 s) contre la politique
`complet` (2 re-exécutions + contre-épreuve). L'échéance a déjà tué une
re-vérification — run déterministe n°2 de la mesure finale de la brique 5, sous
simple charge de la machine de développement. Sur le web réel, **ce cas cesse
d'être l'accident et devient le cas courant** : le rapport bascule alors en
`nbNonVerifies`, ce qui est honnête mais vide le différenciateur de sa
substance.

*Arbitrage rendu* : les deux, séquencés. Le bestiaire reste en politique
`complet` avec un budget généreux (hypothèse 300 s) — le différenciateur n°1 ne
se mesure pas en mode dégradé. La politique `econome` est l'affaire de la page
publique, quand le volume l'exigera, et l'arbitrage sera alors chiffré par le
bestiaire, pas deviné.

*Complété le 2026-09-29 (cahier P2-1)* : l'échéance n'est plus un seul
compte à rebours que l'exploration peut consommer entière (fiches 05, 08, 10),
elle est RÉPARTIE en fractions (`echeance.repartition`) : l'exploration
s'arrête à la sienne (`reserve-confirmation`, journalisé), la confirmation
reçoit la suivante, la rédaction le reste — et le journal dit
`confirmation.reserve.insuffisante` quand il ne reste pas de quoi rejouer une
fois. La tension demeure (300 s pour dix-neuf rejeux ne se répartissent pas
mieux qu'ils ne s'additionnaient), mais elle se lit désormais dans le journal
au lieu de se deviner dans un rapport vide.

## C. Le coût change de nature

Les 0,048 USD/scan mesurés portent sur des parcours de 5 pages utiles avec un
plafond de 20. Le coût suit le nombre de **décisions de navigation** (0,66 sur
1,53 au total, soit 43 %), donc il suit `pagesMax`. Un site réel à 20 pages
atteintes coûtera davantage que le banc à 5.

Par ailleurs, la borne vraie d'un appel de rédaction est
`appelMaxMs × (1 + reessaisReseauMax) × (1 + relancesMax)` = **720 s**
(`docs/DETTES.md` n°6) — très au-delà de tout `timeoutMs` de scan réaliste. Tant
qu'aucune annulation coopérative n'existe, la porte d'échéance protège
l'engagement de l'appel, pas sa durée.

## D. Config dormante, et responsabilité

**`exceptionsSandbox: ["paiement"]` n'est consommé par personne**
(`core/scanner/exploration/filtre-actions.ts:23`). C'est exactement
l'apprentissage n°5 : une valeur que rien n'exécute n'est pas vérifiée. Elle se
réveillera en Phase 2 — et son réveil est un événement de sécurité, puisqu'elle
lève un interdit.

**Le remplissage de formulaires sort du bac à sable.**
`test@zurvela-scan.invalid` part dans de **vrais** formulaires : vrai email au
propriétaire, vraie entrée en base, vrai devis à traiter. Pire, la règle
`password` (`Zurvela-scan-test-1!`) appliquée à un formulaire de connexion réel
produit des **tentatives échouées** — donc du verrouillage de compte et des
alertes de sécurité chez la cible. Au banc, l'API de test ne fait rien ; sur le
réel, chaque soumission a une conséquence. C'est le point où « site possédé »
cesse d'être une formalité.

*Arbitrage rendu* : un **mode d'interaction** en configuration de production,
`soumission: "aucune" | "site-possede"`, défaut `aucune`. Le premier scan d'un
site réel n'a pas besoin de soumettre pour être utile — navigation, images, 404,
lenteurs, recouvrements fonctionnent sans. La soumission ne s'active que sur
déclaration explicite de propriété.

**`robot.userAgent` annonce `+https://zurvela.com`** — l'URL doit servir une page
expliquant le robot **avant** le premier scan réel. Un administrateur qui voit
passer cet agent ira la lire ; aujourd'hui il ne trouverait rien.

**La liste noire est éprouvée contre des libellés que nous avons écrits.** Six
langues, appariement testé — mais sur le réel : un bouton « Valider » seul, une
icône sans texte, un libellé rendu en image. Le filtre est fermé (il refuse
plutôt qu'il ne laisse passer), ce qui transforme le risque en sur-blocage
plutôt qu'en accident. C'est le bon sens du risque, et le bestiaire mesurera le
sur-blocage.

## La forme qui en découle

Une **configuration de production distincte**, et non un ajustement de
l'existante. Les valeurs ci-dessus sont justes *pour le banc* et doivent le
rester : c'est l'instrument, et le faire dériver rendrait les mesures de la
Phase 1 incomparables.

*Arbitrage rendu* : `config/banc.json` est gelé pour toute raison de production.
`config/production.json` naît **vide de certitudes** — chaque valeur y entre
comme hypothèse datée, que le bestiaire confirme ou corrige.
