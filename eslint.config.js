// Configuration ESLint (format plat). Lint standard TypeScript : détecte le
// code mort et les erreurs de génération avant l'exécution.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'banc/resultats/**', 'pnpm-lock.yaml'],
  },
  ...tseslint.configs.recommended,
  {
    // JavaScript client servi par les mini-sites du banc : contexte navigateur.
    files: ['banc/gabarits/**/site/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
      },
    },
  },
);
