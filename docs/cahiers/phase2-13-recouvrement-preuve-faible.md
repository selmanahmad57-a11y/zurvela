# P2-13 — minorer les recouvrements à preuve faible (voie A)

*Cahier de VOIX, ouvert pour débloquer la publication (mesure préalable du
2026-10-08). Le grand tableau du 2026-10-07 a montré que les pubs transitoires
(`#aswift_N`, `#google_ads_iframe`) sortent en `clic-intercepte` gravité
`important`, verdict `decouverte` — une fausse alarme `important` qu'un
commerçant verrait sur sa propre pub. Le traitement n'est ni « les exclure »
(taire un vrai défaut, lire le monde), ni « détecter les pubs » (lire le monde
par le nom), ni « dire qu'elles varient » (le moteur ne le sait pas d'un seul
scan).*

## La mesure qui a décidé la forme

Dans les journaux du grand tableau, les deux populations se séparent sur un axe
ÉPISTÉMIQUE, pas sur le nom :

- **transitoires** (pubs, jugées `cliquable`/`introuvable` par l'oracle) : toutes
  `decouverte` / `constatee-au-rejeu`, confiance 0,80, **jamais passées par le
  test de persistance** (pas de palier `victime-stable`) — ce sont des
  DÉCOUVERTES graduées, nées au rejeu.
- **vrais persistants** (footer fixe de demoqa sur 11 pages, lien de tag de
  quotes) : `confirmee` / `reproduite`, palier **`victime-stable`**, confiance
  0,88.

Bonus mesuré : le protocole de persistance (P2-6) écarte DÉJÀ les pubs qu'il
teste (`#aswift_2/3` → `non-persistant` → non publiées). Celles qui passent sont
les découvertes graduées (P2-9), qui ne subissent pas le test. Et le concept
« preuve faible » EXISTE déjà en code : `STATUTS_SANS_RETEST =
['constatee-au-rejeu','diagnostic-site']`. La voie A ne crée pas de notion — elle
donne une VOIX à une distinction que le moteur fait déjà.

## Voie A, pas voie B

**Voie A (retenue)** : MINORER dans la voix les recouvrements à preuve faible,
pas les écarter. On ne tait rien (le doute publie, minoré honnêtement). **Voie B**
(écarter en fermant le trou P2-6/P2-9) est notée pour plus tard, après mesure
qu'elle n'écarte que du vrai transitoire. Voie A d'abord : sûre, suffit à
débloquer la publication côté rapport.

## Les contrats

1. **Le critère, épistémique, jamais le nom.** Un `clic-intercepte` dont le
   statut ∈ `STATUTS_SANS_RETEST` (découverte graduée, jamais passée par la
   persistance) ET qui n'est pas `murCouvrant` est minoré. Un `confirmee` /
   `victime-stable` ne l'est jamais. Jamais « c'est `aswift` ».
2. **La garde cardinale.** Le persistant (`confirmee`) n'est pas touché : le
   footer fixe de demoqa desktop (vrai recouvrement, 11 pages) reste `important`.
   Mutation tuée : minorer un `confirmee` → rouge.
3. **La collision honnête, minorée PAS tue.** Un vrai recouvrement vu une seule
   fois (découverte) est minoré — c'est honnête (preuve faible) — mais la section
   RESTE publiée. Minorer = rétrograder, jamais supprimer. Mutation tuée : une
   minoration qui supprime → rouge.
4. **La voix (garantie sémantique, tranchée par le propriétaire).** Gravité
   `mineur` posée AU RAPPORT (l'anomalie garde sa gravité au journal : minoration
   de VOIX, pas de détection — empreinte de l'anomalie inchangée). Prose fixe,
   hors rédaction IA (exclue du contexte, comme le mur) :
   - titre : « Recouvrement observé une seule fois » ;
   - statut : « Observé une fois, non reproduit lors de nos vérifications. »
     (factuel — PAS « susceptible de varier », que le moteur ne sait pas) ;
   - constat : « Lors d'un seul de nos passages, un élément a reçu le clic à la
     place de ce contrôle ; nous ne l'avons pas revu ensuite. » ;
   - action (« Ce qu'il faut vérifier ») : « Si vous le constatez sur votre site,
     vérifiez s'il gêne l'usage de ce contrôle. » — INVITE à vérifier l'effet,
     ne conclut PAS que le revoir = défaut (le moteur ne le sait pas) ;
   - impact : vide (aucune conséquence prétendue).

   La correction de revue qui compte (Q4 en plus petit) : la première rédaction
   disait « s'il y reste, il gêne vraiment ce contrôle » — une conclusion que le
   moteur n'a pas mesurée. Rendue au jugement du commerçant : « vérifiez s'il
   gêne l'usage ». On rapporte ce qu'on observe, on invite à juger, on ne juge
   pas à la place.
5. **Préséance avec (A) le mur couvrant.** Mesurés DISJOINTS (les murs sont
   `confirmee`, les découvertes ordinaires), et structurellement attendus
   disjoints (un mur naît de la fusion de victimes géométriques → persistance ;
   une découverte naît seule au rejeu). Contrat de préséance malgré tout : le
   mur est vérifié d'abord et GAGNE (déjà minoré par sa fraction de viewport, sa
   voix). La preuve-faible ne s'applique qu'aux recouvrements non-mur. Mutation
   tuée : preuve-faible sur un murCouvrant → rouge.

## Le témoin (vrai chemin, n°30/dette n°26 évités)

- `core/rapport/preuve-faible.banc.test.ts` : VRAI chemin — un scan réel du
  gabarit `calque-au-rejeu` (D01+D02) fait NAÎTRE une découverte de recouvrement
  au rejeu (`constatee-au-rejeu`, la miniature déterministe de la pub
  transitoire), pas injectée à la main. Mesuré rouge d'abord : ce calque sort
  `important` aujourd'hui. Attendu après : `mineur` + voix fixe + PRÉSENT.
- `core/rapport/preuve-faible-voix.test.ts` : la LOGIQUE là où le vrai chemin ne
  donne pas le cas — garde cardinale (confirmee intact), préséance (mur gagne),
  portée (seuls les clic-intercepte). Trois mutations tuées.

Le gabarit `calque-au-rejeu` garde son attendu d'ORIGINE (découverte /
`important` au niveau ANOMALIE) : la voie A minore au RAPPORT, pas à la
détection.

## Le rayon

`voix.ts` (voix preuve-faible fr+en + exhaustivité) · `types.ts`
(`SectionRapport.preuveFaible`) · `statuts.ts` (critère réutilise
`STATUTS_SANS_RETEST`, rien ajouté) · `structure.ts` (branche preuve-faible
APRÈS mur : gravité mineur + voix fixe + marquage) · `faits.ts` (exclusion du
contexte IA) · `rendu.ts` (libellé d'action) · deux témoins.

## Équivalence

Additive/confinée : la voie A change la gravité/voix de rapport des SEULES
découvertes de recouvrement. L'empreinte de l'anomalie (`graviteEstimee`) ne
bouge pas ; seule l'empreinte de SECTION du rapport change, et uniquement sur
les scénarios à découverte de recouvrement.

**Mesuré (ref sans voie A vs opt avec voie A, ×3, site-charge exclu par n°33) :**
les SEULS scénarios divergents sont `calque-au-rejeu--d01-d02--fr` et `--en`,
identiques aux trois runs. La divergence est exactement :

```
PERDU   section:fonctionnel|important|constatee-au-rejeu|d-recouvrement:...
APPARU  section:fonctionnel|mineur|constatee-au-rejeu|d-recouvrement:...
```

— même section (même groupe, même statut, même catégorie), gravité `important`
→ `mineur`. Rien d'autre ne bouge ; partout ailleurs ÉQUIVALENT. L'oracle dit
« NON ÉQUIVALENT » et c'est JUSTE : la voie A est un changement de comportement
délibéré, pas une optimisation — l'oracle flaire fidèlement la minoration
voulue, sur exactement les scénarios visés. L'anomalie étant intacte, l'attendu
d'origine de `calque-au-rejeu` (découverte / `important`) reste vert.
