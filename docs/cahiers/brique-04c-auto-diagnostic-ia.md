# ZURVELA — Cahier des charges : Auto-diagnostic IA (Brique 4c, Phase 1)

Le client du logement AutoDiagnostic posé en brique 3 : l'IA examine
ce que les heuristiques mécaniques ont renoncé à trancher — le résidu
`indetermine` des re-exécutions — et rend un avis de cause. Sa raison
d'être est l'apprentissage n°6 : aujourd'hui, ce résidu s'effondre en
limite-automatisation, c'est-à-dire en SILENCE ; or certains de ces
silences sont des pannes réelles. Le diagnostic existe pour réduire
le silence injustifié — jamais pour promouvoir une opinion en preuve.
Régime : CIBLÉ (le logement et ses tests existent ; la surface neuve
est un prompt et une table de traduction). Budget annoncé à
l'ouverture — il doit être le plus petit de la lignée 4.

## 1. Quand le diagnostic parle
- Déclenchement : uniquement les groupes dont le verdict reposerait
  sur des tentatives `indetermine` (les deux autres causes ont déjà
  leur circuit : outil → limite-automatisation, reseau-site →
  découvertes). Un appel par groupe maximum, plafond par scan en
  config (diagnostic.groupesMax, défaut 3), gate diagnostic.actif.
- Modèle : config modeles.diagnostic (opus-5 — le résidu est rare
  et grave : le modèle cher au bon endroit).
- Mode dégradé : diagnostic inactif, sans clé ou en échec →
  comportement STRICTEMENT identique à aujourd'hui (le silence
  actuel), l'absence journalisée subie/déclarée selon le patron 4a.
  Le diagnostic est un affineur, jamais un prérequis.

## 2. Le contrat — avis fermé, aveu possible
- Entrée (données NON FIABLES, patron intégral) : extraits
  structurés du journal de la tentative (actions, signaux, erreurs
  outillage), tronqués (config), balisés contenu. Le journal
  contient des chaînes issues de la page : la chaîne de méfiance
  s'applique au journal comme à la page.
- Sortie : avis ∈ { outil, site, indetermine } + justification.
  L'avis `indetermine` est une RÉPONSE ATTENDUE et légitime —
  le diagnostic doit pouvoir avouer son ignorance (n°6), et le
  corpus l'éprouvera. justification : terminale (statut natureLibre).
  Provenance trois champs. Prompt diagnostic/v1, patron v2 de
  navigation (provenance, critère positif, rappel).

## 3. Le pont des vocabulaires — traduction explicite, jamais symétrie
Table unique en code, testée cas par cas :
- avis outil       → verdict limite-automatisation (inchangé de fait)
- avis indetermine → verdict limite-automatisation, avis journalisé —
                     le silence demeure mais il est désormais MOTIVÉ
- avis site        → le groupe RESTE écarté (A5 : une opinion ne
                     remonte pas un verdict) ; une DÉCOUVERTE est
                     émise, motif `diagnostic-site`, confiance =
                     confiance d'origine du détecteur × facteur
                     config < 1 (un avis n'est pas une preuve),
                     statut affiché du troisième état épistémique :
                     « constaté, cause site suspectée par diagnostic,
                     non re-confirmé ».
Invariants testés : aucune écriture du diagnostic ne modifie un
groupe retenu ; aucune confiance ne monte ; la table est le SEUL
point de contact entre les deux vocabulaires (grep-garde au lint).

## 4. La mesure — corpus Vitest, banc intact
Le banc ne sait pas produire d'`indetermine` déterministe depuis un
site — et A6 interdit d'y ranger des sabotages. La mesure vit donc
en Vitest avec cassettes :
- Corpus de journaux CONSTRUITS (banc/corpus-diagnostic/) : 2 cas
  outil sans ambiguïté, 2 cas site sans ambiguïté, 1 cas
  authentiquement ambigu dont l'attendu est `indetermine` — l'aveu
  comme bonne réponse, éprouvé.
- Cassettes enregistrées sur ce corpus (même garde, même
  provenance) ; variance-ia étendue au corpus (informatif).
- Les 24+ scénarios du banc : INCHANGÉS, deux politiques, runs à
  empreinte identique — le diagnostic n'y est jamais déclenché,
  donc aucune cassette de diagnostic n'entre au banc : le
  déterminisme de l'instrument ne dépend pas de cette brique.

## 5. Critères d'acceptation
1. Banc inchangé : 100 % partout, deux politiques, 3 runs identiques.
2. Corpus : 5/5 avis corrects (dont l'aveu), deux langues de
   journaux si les chaînes de page y entrent en fr et en.
3. Invariants A5 verts (jamais de promotion, jamais de hausse).
4. Dégradé éprouvé : diagnostic coupé → sortie bit à bit identique
   à la brique 4b sur un cas de résidu construit.
5. Provenance sur chaque avis ; justification terminale vérifiée.
6. Lint Mur 1, revue ciblée sur la frontière (table de traduction,
   prompt, gate) — sécurité et contrats à 3 sceptiques, inchangé.

## 6. Hors périmètre
Rédaction du rapport (brique finale), re-confirmation des
découvertes diagnostiquées, consommation de la justification,
diagnostic des replis de décision de 4b, extension du corpus
au-delà de 5 cas.

## 7. Livraison
Résultats corpus, variance, coût réel (il doit être marginal —
publie-le), écarts, constats, questions.
Commit : « Brique 4c — auto-diagnostic IA ».

---

## Notes de conception (chat de conception, 2026-09-24)

1. **`avis site → découverte plutôt que promotion` est le point où trois
   principes convergent et se verrouillent mutuellement** : A5 (l'opinion ne
   monte rien), le troisième état épistémique de la brique 3 (« constaté, non
   re-confirmé » — le diagnostic en devient le deuxième producteur), et
   l'apprentissage n°6 (le silence qui demeure est désormais *motivé*, ce qui
   est la différence entre se taire et n'avoir rien à dire).
   **Réponse écrite d'avance à la revue**, si elle trouve la découverte trop
   timide (« pourquoi ne pas retenir quand le diagnostic est sûr ? ») : le
   jour où l'on voudra retenir sur avis, ce sera par une **re-exécution
   supplémentaire déclenchée par l'avis** — une preuve achetée, pas une
   opinion crue — et c'est une brique future, pas un ajustement de table.
2. **Le cas ambigu du corpus est le plus important des cinq.** Un diagnostic
   qui répond toujours `outil` ou `site` sur un journal construit pour être
   indécidable est un diagnostic qui **fabrique de la certitude** — exactement
   ce que le produit ne doit jamais faire devant un commerçant.
   **L'aveu mesuré à 1/1 vaut plus que les quatre certitudes.**
