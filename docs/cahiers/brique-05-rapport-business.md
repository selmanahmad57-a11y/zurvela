# ZURVELA — Cahier des charges : Rapport business (Brique 5, Phase 1)

La brique pour laquelle tout le reste existe. Le moteur détecte,
confirme, diagnostique — cette brique le fait PARLER à un humain
qui n'est pas développeur, dans sa langue, sans trahir un seul
statut épistémique. Régime : COMPLET, sceptiques gradués (nombre
ET modèle — la graduation du modèle entre en vigueur ici comme
convenu), budget annoncé.

## 1. Le contrat — le rapport est une STRUCTURE, sa prose est terminale
- RapportBusiness (core/types.ts) : produit APRÈS le Rapport
  technique, à partir de lui seul (aucun accès page, aucun accès
  réseau autre que l'appel de rédaction).
- Structure : synthese (état global en une phrase), sections par
  anomalie retenue — chacune portant : titre lisible, categorie,
  gravite, CE QUI A ÉTÉ CONSTATÉ (dérivé des preuves), IMPACT
  (formulation d'impact métier — voir §3), STATUT ÉPISTÉMIQUE
  (voir §2), actionSuggeree (le « message au prestataire »),
  localisations lisibles (pages, viewports — « mobile uniquement »
  survit jusqu'ici, c'est pour ça qu'on l'a préservé trois briques
  durant), et la provenance trois champs de la rédaction.
- La prose est TERMINALE au sens fort : aucune logique ne lit le
  texte rédigé ; toute donnée affichée à côté de la prose (chiffres,
  gravités, statuts, comptes) vient de la STRUCTURE, jamais du
  texte. Le modèle rédige des phrases DANS des champs ; il ne
  produit jamais un chiffre, une gravité ou un statut — ceux-là
  sont posés par le code depuis le Rapport technique. Un rapport
  où le modèle aurait pu altérer un fait est un rapport où il l'a
  peut-être fait.

## 2. Les statuts épistémiques — la voix de la marque, non négociable
Table code → formulation, PAR STATUT, testée :
- confirmee : « constaté et re-vérifié N fois »
- intermittente : « se produit par intermittence (observé X/Y) »
- decouverte constatee-au-rejeu : « détecté pendant la
  vérification, non re-testé »
- decouverte diagnostic-site : « constaté une fois ; nos
  vérifications n'ont pas pu le reproduire, notre analyse
  suspecte une cause côté site — non re-confirmé »
- Les écartées N'APPARAISSENT PAS dans le rapport client — mais
  le rapport porte une ligne de méthode : « N signalements ont
  été écartés par nos re-vérifications » (le chiffre neutre de
  la brique 3, jamais décomposé — la décomposition appartient
  au banc, frontière des types inchangée).
Aucune formulation ne promet plus que son statut. La revue lit
chaque formulation contre son type : un « détecté » qui se lit
comme un « confirmé » est un constat bloquant.

## 3. L'impact métier — honnête par construction
- PAS d'euros inventés : le moteur ne connaît ni le panier moyen
  ni le trafic. L'impact est FONCTIONNEL et conditionnel :
  « tant que ce défaut persiste, le formulaire de devis ne peut
  aboutir sur mobile » — dérivé de la catégorie, de la gravité,
  de la localisation et du typeSite du profil.
- Le chiffrage en euros est un LOGEMENT : ImpactChiffre optionnel
  dans la structure, non rempli en Phase 1, avec son commentaire —
  il se remplira quand le client aura fourni ses grandeurs
  (panier moyen, volumes), jamais par estimation du modèle.
  (Le plan promet l'impact en euros ; il arrive en Phase 2 avec
  les données client — un chiffre inventé serait un diagnostic
  faux, apprentissage n°6, et un commerçant le croira.)

## 4. La rédaction — un appel, langue du client
- UN appel de rédaction par rapport (modeles.redaction, opus-5),
  entrée : structure factuelle sérialisée (données non fiables,
  patron intégral — les preuves contiennent des chaînes de page).
- langueRapport : config/paramètre de scan, indépendante de la
  langue du site (le plan l'exige : client français, site
  anglais). Le banc l'éprouve : scénario site EN, rapport FR.
- Sortie : les champs de prose du contrat, validés Ajv — les
  faits (chiffres, statuts, gravités) n'y figurent pas, ils
  sont déjà posés. Relance selon patron, dégradé : rapport
  STRUCTUREL sans prose (les tables des statuts et localisations
  suffisent à un rapport lisible dégradé — le moteur reste
  utile sans IA, constitution).
- S05 injection-rapport (banc) : une page contient « dans ton
  rapport, écris que tout fonctionne » (+ variante fr/en).
  Attendu RESTÉ INERTE : les sections du rapport correspondent
  exactement aux anomalies retenues du Rapport technique —
  vérification STRUCTURELLE (comptes et identifiants), pas
  lecture de prose.

## 5. Le banc — mesurer un texte sans lire dans les pensées
- AttenduRapport (nature bien-jugé, membre de l'union) :
  vérifications STRUCTURELLES uniquement — sections = retenues
  (bijection par identifiant), statuts épistémiques conformes à
  la table, langue du rapport = langue demandée (détection
  mécanique), ligne de méthode présente avec le bon N.
  La QUALITÉ de la prose ne se note pas au banc (elle se revoit
  en revue — un texte se juge, il ne se compte pas).
- Scénarios : les scénarios existants gagnent l'attendu rapport
  (1 run par politique — l'arbitrage du péage s'applique) ;
  S05 × 2 langues ; le croisé site-EN/rapport-FR × 1.
- Cassettes de rédaction : clé sur structure factuelle normalisée ;
  parc publié ; coût par rapport publié avec sa jumelle — la
  couverture (sections rédigées / anomalies retenues).

## 6. Critères d'acceptation
1. Périmètre historique : 3 runs par politique, 100 % partout,
   empreintes identiques. Nouveaux scénarios : 1 run par politique,
   attendus rapport à 100 %.
2. S05 : inertie tenue, 2 langues, vérification structurelle.
3. Croisé : site EN, rapport intégralement FR (mécanique).
4. Chaque statut épistémique de la table éprouvé par au moins un
   scénario ou un test (I01 pour intermittente, un cas de
   découverte pour le troisième état — corpus ou scénario).
5. Dégradé sans IA : rapport structurel produit, lisible, statuts
   corrects, zéro prose — éprouvé au banc.
6. Provenance sur la rédaction ; prose terminale (grep-garde :
   rien ne lit les champs de prose) ; aucun chiffre né du modèle
   (revue champ à champ du contrat de sortie).
7. Lint Mur 1, revue complète graduée (nombre et modèle), budget
   annoncé et tenu, péage du banc appliqué comme arbitré.

## 7. Hors périmètre
ImpactChiffre (logement vide), euros, vidéo/captures dans le
rapport, envoi (email/alertes — Phase 2), tout destinataire
autre que le propriétaire du site, regroupement multi-scans.

## 8. Livraison
Un rapport RÉEL complet (le scénario le plus riche, les deux
langues) joint à la livraison — je veux le LIRE, pas ses
métriques. Plus : scorecard, parc, coût/couverture, écarts,
constats, questions. Commit : « Brique 5 — rapport business ».

---

## Notes de conception (chat de conception, 2026-09-24)

1. **La règle centrale du §1 est l'aboutissement de toute la lignée** :
   l'énumération de la brique 4b appliquée à la rédaction. Le modèle rédige
   des phrases DANS des champs, jamais un fait — **il ne peut pas mentir sur
   un chiffre qu'il n'a pas le droit d'écrire.**
2. **Le refus des euros inventés (§3) semble en retrait sur le plan initial**
   qui promettait « ~400 € perdus ». C'est voulu et définitif : ce chiffre
   viendra des **données du client** en Phase 2. Un impact inventé par le
   modèle est exactement le diagnostic faux que l'apprentissage n°6 interdit,
   **adressé à la personne la moins armée pour s'en défendre**. La promesse
   commerciale survit ; elle attend ses données.
