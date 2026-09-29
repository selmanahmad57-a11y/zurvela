# Dossier de déploiement — zurvela.com

Pages statiques, sans dépendance externe (pas de police distante, pas de
script, pas de CDN). À déposer **tel quel** à la racine web de l'hébergement
OVH (`www/`) :

```
www/
├── index.html          → https://zurvela.com/
└── robot/
    └── index.html      → https://zurvela.com/robot/
```

- `robot/index.html` porte le français et l'anglais sur la même page
  (ancres `#fr` et `#en`). C'est l'adresse que le user-agent du robot annonce :
  elle doit être en ligne **avant** le premier scan d'un site que nous ne
  possédons pas (`banc/bestiaire/PROTOCOLE.md`).
- Source de la page du robot : `docs/robot.md`. Toute modification se fait là
  d'abord, puis se reporte ici.
- **À confirmer avant mise en ligne** : l'adresse `contact@zurvela.com` doit
  exister et être relevée — elle est promise à tout administrateur qui voudrait
  nous écrire.
