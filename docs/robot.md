# ZurvelaBot — le robot de vérification

*Matière destinée à être publiée sur `https://zurvela.com/robot`. Cette page
doit être en ligne AVANT le premier scan d'un site que nous ne possédons pas :
un administrateur qui voit passer notre agent doit pouvoir savoir, en une
minute, qui nous sommes et comment nous arrêter.*

---

## Qui vous rend visite

`ZurvelaBot` est le robot de **Zurvela**, un service de vérification
automatique de sites web. Il visite un site pour y chercher des anomalies —
un bouton qui ne répond pas, une image qui ne s'affiche pas, une page en
erreur, une lenteur anormale — et il en rend un rapport au **propriétaire du
site**, en langage clair.

Il ne collecte aucune donnée personnelle, n'indexe rien, ne revend rien, et
n'alimente aucun jeu d'entraînement.

## Comment le reconnaître

| | |
|---|---|
| **User-agent** | `ZurvelaBot/0.1 (+https://zurvela.com)` |
| **En-tête dédié** | `X-Zurvela-Scan: 1` sur chaque requête |
| **Données de test** | tout formulaire rempli l'est avec des valeurs marquées : adresses en `@zurvela-scan.invalid`, noms contenant « Zurvela », jamais de données réelles |

Le robot **se signale toujours**. Il ne se déguise pas en navigateur ordinaire,
ne change pas d'agent pour contourner un blocage, et ne cherche jamais à passer
inaperçu.

## Ce qu'il fait, et ce qu'il ne fait jamais

**Il fait** : charger des pages publiques, suivre des liens internes, regarder
la page sur un écran d'ordinateur et sur un écran de téléphone, mesurer des
temps de réponse, et rejouer une anomalie constatée pour vérifier qu'elle est
réelle avant de la signaler.

**Il ne fait jamais** :

- **aucune action destructrice** — supprimer, vider, réinitialiser,
  désabonner, résilier, révoquer. Ces actions sont refusées par un filtre
  appliqué en code, après toute décision, et que rien dans le contenu d'une
  page ne peut contourner ;
- **aucun paiement, aucune commande, aucun don** ;
- **aucune tentative de connexion** à un compte, aucune saisie d'identifiants
  réels ;
- **aucun contournement** d'une protection anti-robot, d'un mot de passe, d'une
  limitation de débit ou d'une interdiction ;
- **aucune soumission de formulaire**, sauf sur un site dont le propriétaire a
  explicitement déclaré la propriété et demandé le scan.

## Il respecte votre `robots.txt`

Le robot lit le `robots.txt` de votre domaine avant de commencer, et **refuse
les chemins que vous lui interdisez**. Un site qui nous interdit est un site
que nous n'auditons pas en douce.

## Comment l'arrêter

Ajoutez ceci à votre `robots.txt` :

```
User-agent: ZurvelaBot
Disallow: /
```

Le robot cessera de visiter votre site. Vous pouvez aussi n'interdire qu'une
partie :

```
User-agent: ZurvelaBot
Disallow: /admin
Disallow: /panier
```

Si vous préférez un blocage côté serveur, l'en-tête `X-Zurvela-Scan: 1` et
l'user-agent `ZurvelaBot` suffisent à l'identifier.

## Un scan a-t-il été demandé ?

Un scan est déclenché par une personne qui saisit une adresse. Nous demandons à
cette personne d'être le propriétaire du site ou d'en avoir l'autorisation,
mais **nous ne pouvons pas le vérifier dans tous les cas**. Si vous pensez que
votre site a été scanné sans votre accord, écrivez-nous : nous vous dirons ce
que nous avons enregistré, nous le supprimerons, et nous ajouterons votre
domaine à notre liste d'exclusion.

## Nous écrire

**contact@zurvela.com** — *(à confirmer : adresse à créer avant publication)*

Nous répondons à toute demande d'un administrateur de site : exclusion,
ralentissement, suppression de données, ou simple question.
