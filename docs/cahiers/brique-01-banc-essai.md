# ZURVELA — Cahier des charges : Banc d'essai (Brique 1, Phase 1)

Tu construis le banc d'essai AVANT le moteur : c'est l'instrument qui
mesurera tout le reste. Objectif de cette brique : la BOUCLE COMPLÈTE
minimale — un gabarit, cinq bugs injectables, un manifeste, un correcteur
qui produit une scorecard. Le volume (gabarits, langues, bugs) viendra
dans les briques suivantes ; la boucle d'abord.

## 1. Rôle du banc (rappel)

1. Mesurer le moteur : taux de détection, taux de faux positifs,
   coût par scan — les chiffres des jalons du plan.
2. Juger tout changement : aucun prompt/modèle/détecteur ne part en
   production sans passage au banc.
3. Garde anti-biais (Mur 3) : les écarts de score entre langues et
   gabarits dénoncent le codage en dur résiduel.

## 2. Arborescence à créer

banc/
  gabarits/
    formulaire-contact/        # gabarit n°1 (cette brique)
      site/                    # le mini-site (statique + un peu de JS)
      bugs/                    # un module par bug injectable
      (manifeste.schema.json déplacé dans banc/schemas/ — décision du 2026-09-22)
  scenarios/                   # scénarios = gabarit + bugs actifs + langue
    *.scenario.json
  correcteur/
    index.ts                   # orchestrateur : déploie → scanne → note
    scorecard.ts               # calcul et rendu des scores
  serveur.ts                   # sert un scénario en local sur un port

## 3. Le gabarit n°1 : « formulaire-contact »

Un mini-site d'entreprise fictive : page d'accueil, page contact avec
formulaire (nom, email, message, bouton envoyer), page de confirmation.
- Statique + un petit backend de formulaire (Node, même repo) pour
  pouvoir simuler des comportements serveur.
- I18n DU GABARIT dès cette brique : les textes du site vivent dans
  banc/gabarits/formulaire-contact/site/locales/{fr,en}.json.
  Le scénario choisit la langue servie. (Deux langues suffisent ici ;
  l'écart de score FR/EN est déjà un détecteur de biais.)
- Le site est VOLONTAIREMENT ordinaire : HTML sémantique standard,
  pas de piège — les pièges sont un gabarit futur.

## 4. Les 5 bugs injectables de cette brique

Chaque bug est un module dans bugs/, activable par le scénario,
avec un identifiant stable :

- F01 bouton-mort : le bouton « envoyer » ne déclenche plus rien
  (handler retiré). Catégorie : fonctionnel.
- F02 echec-silencieux : la soumission échoue côté serveur (500)
  mais l'interface n'affiche rien et reste figée. Catégorie : fonctionnel.
- R01 api-lente : la soumission répond en N secondes (N dans le
  scénario, défaut en config). Catégorie : performance.
- V01 image-cassee : le logo pointe vers une ressource 404.
  Catégorie : visuel.
- M01 bouton-masque-mobile : en viewport mobile uniquement, un élément
  fixe recouvre le bouton « envoyer ». Catégorie : mobile.
  (Le bug le plus fréquent et le plus coûteux chez la cible — il est
  dans la première fournée exprès.)

Contrainte d'implémentation : un bug = une transformation isolée et
réversible du site sain. Le site sain est la référence ; les bugs ne
forkent jamais le gabarit.

## 5. Scénarios et manifeste (vérité terrain)

Un scénario est un JSON :
{
  "id": "formulaire-contact--f01-m01--fr",
  "gabarit": "formulaire-contact",
  "langue": "fr",
  "bugsActifs": ["F01", "M01"]
}
Le manifeste de vérité terrain est DÉRIVÉ automatiquement du scénario
(pas écrit à la main) : pour chaque bug actif, le correcteur sait —
via la déclaration du module de bug — quoi attendre : catégorie,
page/étape concernée, gravité attendue (bloquant | important | mineur).

Scénarios livrés dans cette brique (générés, pas dupliqués à la main) :
- 1 scénario SAIN par langue (zéro bug) — le test des faux positifs,
  aussi important que les autres : tout signalement y est du bruit.
- 1 scénario par bug isolé, par langue (5 × 2).
- 1 scénario combiné (F01 + M01) par langue.
Total : 14 scénarios.

## 6. Le correcteur

Interface CLI : pnpm banc [--scenario <id>] [--tous]
Séquence par scénario :
1. Démarre serveur.ts avec le scénario (port libre).
2. Lance le sujet à noter. Le moteur n'existant pas encore, le
   correcteur définit dès maintenant le CONTRAT D'INTERFACE :
   il invoque une fonction `scanner(url, options): Promise<Rapport>`
   importée depuis core/ — et cette brique livre un
   `scannerFactice` (stub) qui retourne un Rapport vide, pour
   prouver la boucle de bout en bout.
   Le type Rapport (dans core/types.ts) contient au minimum :
   liste d'anomalies { categorie, description, urlOuEtape,
   graviteEstimee, confiance (0-1) }, coutApi, dureeMs, journal.
3. Compare Rapport vs manifeste :
   - bug actif retrouvé (même catégorie + même page/étape) → DÉTECTÉ
   - bug actif absent du rapport → RATÉ (faux négatif)
   - anomalie du rapport hors manifeste → FAUX POSITIF
   L'appariement est structurel (catégorie + localisation),
   JAMAIS par correspondance de texte — le libellé d'une anomalie
   est de la prose IA, il ne sert pas de clé. (Règle maîtresse §2.)
4. Écrit la scorecard.

## 7. La scorecard

Sortie double : tableau lisible en console + JSON dans
banc/resultats/<horodatage>.json (journalisation, constitution §5).
Par exécution : détection %, faux positifs (nombre + % des
signalements), ratés, coût API total, durée — GLOBAL puis PAR LANGUE
puis PAR CATÉGORIE de bug. Affiche l'écart de détection inter-langues
et le marque ALARME au-delà du seuil (config, défaut 5 points).

## 8. Configuration et i18n

- Tous les seuils de cette brique dans config/banc.json : port de base,
  N secondes de R01, seuil d'alarme inter-langues, timeout de scan.
- Textes de la scorecard console dans locales/fr.json (structure i18n
  posée même monolingue — constitution §2).

## 9. Critères d'acceptation (la brique est finie quand)

1. `pnpm banc --tous` exécute les 14 scénarios avec le scannerFactice
   et produit une scorecard cohérente (0 % détection, 0 faux positif —
   le stub ne signale rien).
2. Un scénario sert bien le site dans la langue demandée, avec les
   bugs actifs et eux seuls (vérifiable à la main dans un navigateur).
3. Chaque bug est visuellement/fonctionnellement constatable à la main.
4. Ajouter un 6e bug = créer UN module + l'ajouter à la génération de
   scénarios ; rien d'autre à toucher (extensibilité prouvée).
5. Aucun motif linguistique dans le code du correcteur ni des bugs
   (revue Mur 1 : lint + relecture avec les trois questions du §2
   de la constitution).
6. Tests unitaires Vitest sur : dérivation du manifeste, appariement
   rapport/manifeste, calcul de scorecard.

## 10. Hors périmètre de cette brique (ne pas construire)

Les autres gabarits, la 3e langue, les bugs d'accessibilité/SEO/
sécurité, le déploiement distant du banc, toute UI web. Le moteur
lui-même : brique suivante — son contrat d'interface est posé ici,
c'est suffisant.
