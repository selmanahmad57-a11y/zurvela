# LE PLAN ZURVELA

> Document de référence du projet Zurvela — plan complet **actualisé**, intégrant toutes les décisions : découverte client supprimée, domaine acquis (zurvela.com ✅), exigence multilingue, murs anti-codage-en-dur, moteur auto-apprenant, et la méthode de travail chat-conception / éditeur-construction.
>
> Enregistré le 2026-09-22. **Position actuelle : Phase 1, étape 2** — la constitution du projet, puis le cahier des charges du banc d'essai.

---

## Phase 1 — Le moteur web (en cours : 6-10 semaines)

**Objectif : un moteur qui scanne n'importe quel site par URL, dans n'importe quelle langue, avec les trois différenciateurs intégrés dès la naissance.**

**Ordre de construction :**

1. **Fondations** *(fait / en cours)* : domaine zurvela.com ✅ → reste : zurvela.fr, pseudos réseaux, contrôle INPI classe 42, hébergeur européen choisi à la création du serveur ;
2. **La constitution du projet** : fichier de règles permanent pour ton assistant de code (Mur 2) — je te le rédige, tu le poses avant la première ligne ;
3. **Le banc d'essai** (conçu ✅, à construire) : gabarit formulaire + 5 bugs injectables + manifeste + correcteur — la boucle complète d'abord, puis enrichissement (6 gabarits × bugs × 3 langues + scénarios 100 % sains) ;
4. **Le scanner** : exploration autonome (Playwright + IA de profilage/décision), détecteurs universels **language-agnostic** (signaux techniques + jugement IA, jamais de regex de langue), viewports desktop ET mobile, couverture multi-catégories : fonctionnel, performance, accessibilité, SEO de base ;
5. **L'anti-faux-positifs** (le cœur défendable) : re-exécution 2-3×, variation navigateur/IP, auto-diagnostic « défaut du site ou limite de mon automatisation ? », score de confiance affiché, blocage anti-bot signalé comme tel et non comme panne ;
6. **La sécurité du moteur** : anti-injection de prompt (contenu de page = données, jamais des ordres ; actions en menu fermé), liste noire destructive en configuration, robot signé, données de test marquées ;
7. **Les fondations d'apprentissage** : journalisation structurée de chaque scan, profil persistant par site (langue, carte des parcours, temps normaux), prompts versionnés jugés au banc avant déploiement ;
8. **Le rapport business** : impact en €/clients perdus, langue du client (pas du site), preuve vidéo/captures, message prêt pour le prestataire.

**Fils rouges permanents dès cette phase** : les 4 murs anti-codage-en-dur ; scores du banc par langue et par gabarit (écart > 5 pts = alarme biais) ; tout changement passe par le banc.

**🚦 Jalon** : détection ≥ 80 %, faux positifs ≤ 10 %, coût/scan ≤ 0,15 €, écarts inter-langues < 5 pts.

> **Bilan du 2026-09-24 — battu sur toute la ligne au banc ; mesuré en
> production le 2026-09-25.** Au banc (cassettes) : détection 100 % (32/32,
> politique IA), faux positifs 0 %, ~0,048 USD/scan, écart inter-langues 0 pt.
> **Astérisque, posé le 2026-09-25** : le deuxième scan réel de la campagne
> (bestiaire, fiche 02) a révélé que l'assemblage de PRODUCTION n'avait jamais eu
> de client IA (`creerClientIa` rendait toujours le client sans capacité). Le
> cahier correctif n°1 a câblé le vrai client et re-mesuré le banc À TRAVERS
> l'assemblage de production (réseau réel, 1,653 USD) : profils, cibles,
> gravités, rapports et coût identiques ; **détection 91,4 % (32/35) en une
> passe, 0 faux positif, 0,038 USD/scan**. L'écart ne vient pas de
> l'assemblage : le 100 % du banc tenait sur deux cassettes réutilisées qui
> verrouillaient une bonne passe par scénario (APPRENTISSAGES n°16) ; en
> production chaque décision est un tirage, et la politique IA soumet avant
> de remplir dans ~45 % des passes puis relit le blocage comme une soumission
> (dette n°19, promue cahier correctif n°2). Le jalon tient sur le banc et, en production, tient sur tout
> sauf la détection en politique IA, mesurée une fois à 91,4 % — au-dessus du
> seuil de 80 %, sous le chiffre annoncé. La politique par défaut de
> production reste `deterministe` ; sa jumelle d'équivalence n'est pas encore
> mesurée.

---

## Phase 2 — Lancement commercial (4-6 semaines, chevauche la fin de Phase 1)

- Page « collez votre URL, rapport en 60 s, gratuit, sans carte » — acquisition ET découverte client réelle (on écoute en vendant) ;
- Paliers publics : Essentiel ~29 € / Pro ~79 € / Agence ~249 €, annuel -20 % ;
- Produit et rapports **FR + EN**, structure i18n dans l'interface dès le premier écran ;
- Alertes email + cycle de vie des incidents (déduplication par cause racine, états, re-vérification « corrigé ✅ », fenêtres de silence) ;
- Boutons vrai problème / fausse alerte sur chaque alerte (boucle d'apprentissage n°1 active) ;
- Zurvela se surveille lui-même (client n°1) + supervision tierce + page de statut publique ;
- Au premier client payant : CGV (obligation de moyens + plafond), assurance RC pro, dépôt de marque INPI ;
- Acquisition : 2-3 pages verticales (e-commerce, réservation), SEO français.

**🚦 Jalon** : 20 clients payants, churn < 8 %, conversion gratuit→payant ≥ 2 %. **Point de décision financement** : autofinancé (défaut) ou préparation de levée.

---

## Phase 3 — Approfondissement (2-3 mois)

- Intégrations : identifiants de test chiffrés (zones connectées), snippet JS (vrais utilisateurs = confirmation croisée + canal de secours anti-bot), webhook CI/CD ;
- Couverture complétée : sécurité de base, régression visuelle ;
- Anti-churn : score de santé évolutif, email mensuel « tout va bien » chiffré, comparaisons sectorielles ;
- Alertes SMS/WhatsApp, Slack ; FAQ puis assistant IA de support (multilingue par nature) ;
- Boucles d'apprentissage 2 et 5 : auto-évaluation croisée, mémoire par client (scans plus rapides, moins chers, plus précis avec l'ancienneté).

**🚦 Jalon** : 60-80 clients, marge brute ≥ 75 %, les 5 métriques nord en amélioration (détection ↑, faux positifs ↓, blocages ↓, coût/scan ↓, délai de détection ↓).

---

## Phase 4 — Distribution démultipliée (2-3 mois, chevauche la Phase 3)

- **Agences** (priorité n°1) : dashboard multi-sites, white-label, programme partenaire — 1 agence = 8 clients ;
- **Marketplaces** : plugin WordPress puis app Shopify (1 clic = propriété validée + snippet posé) ;
- Palier Business ~149 € ; pages verticales en série, déclinées **par langue et par marché** (le scan gratuit sert de détecteur de demande géographique) ;
- API publique propre (prépare le canal MCP de la Phase 6).

**🚦 Jalon** : ≥ 5 agences actives, ≥ 25 % des nouveaux clients via marketplaces/partenaires → feu vert mobile.

---

## Phase 5 — Mobile (3-4 mois)

**Couverture totale, zéro infrastructure permanente :**

- **Capteurs continus (~0 €)** : API backend (enregistrement proxy → rejeu), avis des stores analysés par IA, analyse statique des APK, webview → bascule web ;
- **Exécution à l'événement** : détecteur de nouvelles versions → émulateur Android éphémère sur serveurs existants ; iOS via runners macOS à la minute puis appareils réels à la demande refacturés ; dépôt APK/TestFlight pour le pré-publication ; déclencheur croisé (pic SDK/avis → confirmation avant alerte) ;
- **SDK** : React Native et Flutter d'abord, natif ensuite — jamais un prérequis ;
- Add-on mobile ~49 €, CI/CD mobile pour éditeurs/agences (argument : verdict avant la validation Apple).

**🚦 Jalon** : coût mobile ≤ 20 % du revenu mobile, 15+ clients mobile.

---

## Phase 6 — Échelle et défense (mois 12-24)

- Exécution de la décision financement (levée avec métriques, ou annuels agences payés d'avance) ;
- Boucle globale : règles apprises mutualisées entre clients — l'effet de réseau anti-faux-positifs devient le moat, prouvé par les chiffres (« -X % de fausses alertes en 12 mois ») ;
- Conformité montée en gamme (audit sécurité, trajectoire SOC 2 sur demande client) ;
- Canal agents IA : exposition MCP de l'API ;
- Résilience solo : exploitation auto-guérissante, doc « tout redéployer en 1 h », question associé/embauche tranchée ;
- International : moteur déjà multilingue → expansion purement marketing, Europe francophone puis du Sud avant l'anglophone saturé.

**🚦 Horizon** : 300-500 clients ≈ 20-35 K€ MRR, marge ≥ 80 %, churn < 5 %.

---

## Les fils rouges (toutes phases)

1. Les **5 métriques nord** chaque semaine ;
2. **Tout passe par le banc d'essai** avant production, puis déploiement progressif ;
3. Chaque blocage terrain → **bestiaire** → correction → tous les clients en bénéficient ;
4. Les **4 murs** anti-codage-en-dur actifs en permanence ;
5. **Dogfooding** : Zurvela surveille Zurvela ;
6. Jalon 🚦 raté = analyse et ajustement, jamais de fuite en avant ;
7. **Méthode de travail** : ici la conception, les specs et les revues — dans l'éditeur la construction. Chaque brique part d'ici avec son cahier des charges prêt à coller.
