# zurvela

Agent autonome de surveillance et de test d'applications web. Règles du
projet : [CLAUDE.md](CLAUDE.md) (constitution). Plan : [docs/ROADMAP.md](docs/ROADMAP.md).
Cahiers des charges des briques : [docs/cahiers/](docs/cahiers/).

## Prérequis

- Node.js ≥ 22 (cible : 24 LTS)
- pnpm via corepack : `corepack enable`
- Chromium pour Playwright : `pnpm exec playwright install chromium` (après `pnpm install`)

> **Contrainte de la machine de développement** (macOS 12) : Playwright est épinglé en 1.61.1, dernière version fournissant un Chromium pour macOS 12. Ce n'est pas une contrainte du projet — voir [docs/DETTES.md](docs/DETTES.md), dette n°1.

## Commandes

| Commande | Rôle |
| --- | --- |
| `pnpm install` | installe les dépendances |
| `pnpm typecheck` | TypeScript strict, sans émission |
| `pnpm lint` | ESLint |
| `pnpm test` | tests unitaires et d'intégration (Vitest) |
| `pnpm banc:generer` | régénère les scénarios du banc (`banc/scenarios/*.scenario.json`) |
| `pnpm banc --tous` | note le moteur sur tous les scénarios et écrit la scorecard |
| `pnpm banc --scenario <id>` | note un seul scénario |
| `pnpm banc:servir --scenario <id>` | sert un scénario en local pour l'inspecter dans un navigateur |

## Arborescence

- `core/` — moteur ; `core/types.ts` est le contrat `scanner(url, options) → Rapport`
- `banc/` — banc d'essai : gabarits (mini-sites + bugs injectables), scénarios, correcteur, scorecard
- `config/` — tous les seuils et réglages (`banc.json`, validé par `banc.schema.json`)
- `locales/` — textes affichés à l'utilisateur (console du banc)
- `banc/resultats/` — une scorecard JSON par exécution (ignoré par git)
