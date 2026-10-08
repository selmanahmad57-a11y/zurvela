# PUBLICATION-01 — le rendu HTML du rapport

*Première étape de la publication (modèle 2). Le rendu HTML débloque la démo
figée (étape 2) et sera le corps du mail de livraison (étapes 6-7). Il part de
la structure `RapportBusiness`, JAMAIS du Markdown de `rendu.ts` — « convertir
le Markdown en HTML » referait les erreurs de voix et laisserait des artefacts
d'échappement. C'est un rendu PARALLÈLE, pas un remplacement : `rendu.ts` reste
intact.*

## Deux gardes cardinales

### Garde 1 — anti-injection HTML (XSS), PAR CONSTRUCTION

Le contenu du site scanné entre dans la page ET dans le mail. L'échappement est
GARANTI, pas discipliné : `core/rapport/html.ts` fournit un gabarit étiqueté
`html` qui échappe CHAQUE interpolation par défaut ; seule une valeur déjà
`FragmentHtml` (notre HTML composé) passe en brut. Oublier d'échapper demande un
geste EXPLICITE (`brut`), rare et revu. Compléments :

- **`href` : schéma validé** (`lienHref`). L'échappement HTML ne protège pas un
  `href` — `javascript:alert(1)` n'a aucun caractère à échapper. Seuls `http:`
  et `https:` deviennent un lien ; sinon l'URL s'affiche en texte seul.
- **Jamais de contenu du site dans un attribut `style` ni un nom d'attribut.**
- **`prose` échappe PUIS ajoute les seuls `<br>`** (jamais Markdown→HTML).
- `<meta charset="utf-8">`.

Champs « contenu du site » (carte tirée du `echapper()` de `rendu.ts`) : URL
scannée, `localisation.page`, `section.origine`, et toute la prose IA (`titre`,
`constat`, `impact`, `actionSuggeree`, `synthese`, `ligneMethode`). Les textes à
nous (voix, libellés, statut fixe) sont échappés AUSSI, par principe.

Témoin : un `<script>` dans un chemin de site → `&lt;script&gt;`, jamais
exécutable. Une URL `javascript:` → jamais de `href`. Mutation tuée :
`echapperHtml` qui rend la valeur brute → le script passe → rouge.

### Garde 2 — la voix (mur couvrant + preuve faible) portée

Mesuré : l'essentiel est déjà posé par `structure.ts` (gravité, statut fixe,
titre, constat, impact vide). La SEULE logique de branche propre au rendu — le
libellé d'action (« ce qu'il faut vérifier » vs « faire corriger ») — est
EXTRAITE dans `voix.ts` (`libelleAction`) et PARTAGÉE par les deux rendus : une
seule source, pas de dérive à la prochaine branche (l'écart « 30 contre 15 »
déjà vécu). `rendu.ts` ne bouge que d'une ligne (il appelle la fonction
partagée), son comportement et ses tests inchangés.

Témoin : un mur → « Élément recouvrant l'interface », mineur, « ce qu'il faut
vérifier » ; une preuve faible → « observé une seule fois », mineur ; un vrai
persistant → important. Mutation tuée : routage qui ignore `murCouvrant` →
rouge (dans la fonction partagée, donc pour les DEUX rendus).

## Le visuel de la gravité (décision du propriétaire)

Libellé texte, AUCUNE couleur d'alarme. `important` : gras, ardoise `#1f2937`,
filet gauche 3 px de la même teinte. `mineur` : graisse normale, gris `#6b7280`,
filet gris clair. Pas de rouge, pas d'orange, pas de pictogramme, pas de
bandeau. Raison : le mode sombre des clients mail altère les couleurs, et un
rapport imprimé ou lu par un daltonien doit rester lisible — **le mot porte
l'information, la couleur ne fait que l'accompagner.**

## Dénominateur commun mail + web

Structure en TABLEAU (Outlook ignore la mise en page moderne), largeur max
~600 px, polices système, couleur de texte ET de fond déclarées ENSEMBLE sur
chaque bloc (mode sombre), styles inline (les clients suppriment `<style>` en
`<head>`), zéro script, zéro ressource externe. Marche comme corps de mail ET
comme page de démo.

## Le rayon

`core/rapport/html.ts` (socle : `html`, `echapperHtml`, `prose`, `lienHref`,
`FragmentHtml`, `brut`) · `core/rapport/rendu-html.ts` (le rendu) ·
`voix.ts` (`libelleAction` partagée) · `rendu.ts` (une ligne, l'appelle) ·
`prose-terminale.test.ts` (`rendu-html.ts` autorisé — jumeau de `rendu.ts`,
il affiche la prose, ne branche pas dessus) · témoin `rendu-html.test.ts`.

`rendu.ts` (Markdown) intact ; équivalence sans objet (nouveau rendu parallèle).
