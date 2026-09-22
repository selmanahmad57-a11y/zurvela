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

Quel que soit le niveau, une garantie ne se déclare pas, elle s'éprouve :
**si un compteur ne peut pas mentir, il faut que quelqu'un ait essayé de le
faire mentir.** C'est la version opérationnelle du principe des métriques
jumelles (`docs/APPRENTISSAGES.md` n°3) : la vérification d'une garde se
fait en construisant le cas qui la déclenche, pas en relisant son code.

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
