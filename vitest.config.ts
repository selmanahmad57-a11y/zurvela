import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/**/*.test.ts', 'banc/**/*.test.ts'],
    /**
     * Sept suites pilotent un vrai Chromium (exploration, re-exécution,
     * filtre d'actions) et démarrent chacune un serveur de banc. Vitest
     * ouvre un worker par fichier : à pleine parallélisation, autant de
     * navigateurs se disputent les mêmes cœurs, et ce sont les fermetures
     * (`afterAll`) puis les soumissions de formulaire qui cèdent les
     * premières — des échecs de CONTENTION, jamais de logique.
     *
     * La borne est relative à la machine (pourcentage des cœurs) et non à
     * celle-ci : le banc doit rendre le même verdict sur le poste d'un autre.
     */
    maxWorkers: '50%',
    /**
     * Fermer un navigateur et un serveur HTTP est une opération d'E/S
     * réelle, pas un calcul : les 10 s par défaut de Vitest sont un réglage
     * de tâche courte, insuffisant pour un arrêt de Chromium sur une machine
     * chargée. Une fermeture saine se mesure en dizaines de millisecondes ;
     * ce délai ne sert donc qu'à borner un blocage FRANC, et l'allonger ne
     * masque aucun défaut — il supprime des échecs qui ne disent rien du
     * code.
     */
    hookTimeout: 60_000,
  },
});
