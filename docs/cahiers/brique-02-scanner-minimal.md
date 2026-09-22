# ZURVELA — Cahier des charges : Scanner minimal (Brique 2, Phase 1)

Tu remplaces le scannerFactice par un vrai scanner qui fait monter la
scorecard du banc. Périmètre volontairement resserré : détecteurs
TECHNIQUES universels, navigation simple SANS IA, mais l'architecture
du pipeline complet — car la brique 3 (protocole anti-faux-positifs)
et la suite (IA, rapport business) s'emboîteront dedans sans refonte.

## 0. Ouverture de brique

- Implémente retentionRuns (config/banc.json, défaut 100) : à chaque
  run du banc, ne conserve que les N plus récents dans banc/resultats/.

## 1. Le pipeline en étapes (l'architecture qui compte)

core/scanner/ orchestre quatre étapes aux contrats explicites
(types dans core/types.ts) :

1. EXPLORATION  → produit un Parcours (pages visitées, actions faites)
2. OBSERVATION  → produit des Signaux bruts (événements techniques
   collectés pendant l'exploration)
3. DÉTECTION    → produit des AnomaliesCandidates (signal interprété,
   avec catégorie, localisation, gravité estimée, confiance 0-1)
4. CONFIRMATION → produit les Anomalies retenues du Rapport final.
   DANS CETTE BRIQUE : implémentation « passe-plat » (toute candidate
   est retenue, confiance inchangée) derrière l'interface
   ProtocoleConfirmation — le logement de la brique 3. L'interface
   prévoit dès maintenant : accès au contexte de reproduction
   (URL, action déclenchante, viewport) pour permettre la
   re-exécution future.

Chaque étape journalise (constitution §5) : le Rapport final contient
le journal complet, le coût API (0 dans cette brique) et la durée.

## 2. Exploration (sans IA)

- Découverte : depuis l'URL de départ, suit les liens internes
  (même origine), profondeur max en config (défaut 2), pages max
  en config (défaut 20).
- Interaction : sur chaque page, remplit les formulaires avec des
  données de test MARQUÉES (email test@zurvela-scan.invalid,
  constitution §3) et soumet ; les champs sont identifiés par leurs
  attributs techniques (type, autocomplete, name normalisé,
  attributs ARIA) — JAMAIS par leur libellé visible (Mur 1).
- Actions en MENU FERMÉ : naviguer | remplir | soumettre | terminer.
  La structure de décision est celle que l'IA pilotera plus tard ;
  ici une politique déterministe simple choisit (tout lien non
  visité, tout formulaire non soumis).
- Chaque page est visitée en DEUX viewports : desktop et mobile
  (dimensions en config, mobile ≤ 767 px cohérent avec M01).
- Identité du robot : user-agent ZurvelaBot/0.1, en-tête
  X-Zurvela-Scan (constitution §3).
- Filtre d'actions destructives : appliqué en code après la décision,
  depuis config/actions-interdites.json. Pour identifier une action
  potentiellement destructive sans lire son libellé dans le code :
  le filtre EST le seul consommateur autorisé de cette liste de
  config (l'exception prévue par la constitution — la liste vit en
  config, le code ne fait que l'appliquer).

## 3. Détecteurs (un module par famille, tous language-agnostic)

Chaque détecteur consomme les Signaux et émet des AnomaliesCandidates.
Signaux à collecter pendant l'observation : réponses réseau (statut,
durée, type), erreurs JS de page, requêtes échouées, navigations,
mutations après action (la page a-t-elle réagi ?), état des images,
géométrie des éléments interactifs.

- D-HTTP    : réponse ≥ 500 → candidate (bloquant si liée à une
  soumission, important sinon). 404 sur ressource interne → candidate.
- D-INERTE  : action de soumission/clic suivie d'AUCUN effet observable
  (ni requête, ni navigation, ni mutation significative dans un délai
  en config) → candidate « élément sans effet ». Couvre F01.
- D-ECHEC-MUET : soumission dont la requête échoue (≥ 400) ET aucune
  mutation visible de la page après réponse → candidate. Couvre F02.
  (La distinction « la page affiche-t-elle quelque chose » est
  STRUCTURELLE : mutation DOM dans la zone du formulaire — jamais
  une recherche de texte d'erreur.)
- D-LENTEUR : requête liée à une action dont la durée dépasse le seuil
  config (défaut 3 000 ms) → candidate. Couvre R01.
- D-IMAGE   : image dont naturalWidth = 0 ou ressource en échec
  → candidate. Couvre V01.
- D-RECOUVREMENT : élément interactif dont le point de clic est
  intercepté par un autre élément (elementFromPoint ≠ la cible ou
  clic Playwright en échec d'interception) sur l'un des viewports
  → candidate, en précisant le viewport. Couvre M01.

Chaque candidate porte sa localisation STRUCTURELLE (chemin d'URL +
action/élément en cause) — c'est la clé d'appariement du correcteur.

## 4. Ce que cette brique NE fait PAS (logements réservés)

- Aucun appel IA : core/ia existe (abstraction, constitution §4) mais
  le scanner tourne en mode dégradé permanent ici. Le banc doit
  afficher coût 0,00 €.
- Pas de re-exécution, variation de contexte, score calibré :
  brique 3, derrière ProtocoleConfirmation.
- Pas de rapport business, pas de vidéo, pas de profil persistant.

## 5. Critères d'acceptation

1. pnpm banc --tous avec le vrai scanner :
   - détection ≥ 90 % global (les 5 bugs sont techniques : vise 100 %,
     accepte ≥ 90 % documenté),
   - 0 faux positif sur les scénarios sains,
   - écart inter-langues = 0 pt (les sites sont identiques hors texte :
     tout écart est un biais — ALARME et correction avant livraison),
   - coût 0,00 €, durée par scénario < timeout config.
2. Le scannerFactice reste utilisable par le correcteur (option) :
   il valide que le banc lui-même n'a pas régressé.
3. Tests Vitest par détecteur (signaux simulés → candidates attendues)
   + test du pipeline complet sur un scénario.
4. Lint Mur 1 sans exception nouvelle non commentée ; relecture des
   trois questions de la constitution §2 sur chaque détecteur.
5. Le Rapport contient journal, durée, coût, et chaque anomalie
   retenue porte confiance + localisation structurelle.

## 6. Livraison attendue

Scorecard réelle (globale, par langue, par catégorie), écarts au
cahier justifiés, valeurs de config choisies, constats de ta revue
adversariale, et tes questions. Commit « Brique 2 — scanner minimal »
après validation ici.
