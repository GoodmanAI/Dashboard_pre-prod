---
name: make-interfaces-feel-better
description: Peaufiner le ressenti d'un écran existant, états, retours au clic, alignements, mouvement, tailles de cible, lisibilité, sans en changer la structure. À utiliser après que l'écran fonctionne, quand l'utilisateur dit « peaufine », « le feeling », « ça fait brouillon », « rends ça plus agréable ».
---

# make-interfaces-feel-better (version locale Lyrae)

Version écrite pour ce workspace. Ce n'est pas le skill public du même nom.

`frontend-design` décide de l'allure. Ce skill s'occupe de la **finition** : ce que
l'utilisateur ne sait pas nommer, mais qui lui fait dire qu'un écran est soigné ou brouillon.

## Avant de toucher

1. `design-system-inventory` : on règle avec les jetons et composants existants.
2. **Ouvrir l'écran dans un navigateur**, à la largeur réelle. Konnect : 412 px, c'est un
   téléphone. Le 18/09/2026, c'est l'aperçu qui a montré un schéma « mannequin en bois »,
   un zoom réduit à une colonne, et des bouts de mains grises au bord du cadre. Aucun test
   ne l'aurait dit.
3. Pas de backend sous la main : une page d'aperçu hors de git (`.git/info/exclude`),
   branchée sur les propriétés injectables du composant.

## La liste, du plus rentable au plus fin

**États.** Chaque écran a quatre états : chargement, vide, erreur, plein.
- Un état vide dit quoi faire, il ne dit pas « Aucune donnée ».
- Un bouton désactivé **dit pourquoi**, à côté de lui. Un bouton gris sans explication
  passe pour un écran cassé.
- Pas de saut de mise en page quand les données arrivent : réserver la place.
- Un zéro affiché à la place d'un refus est pire qu'un refus (accueil LyraeTalk, 16/09).

**Toucher.**
- Cible de **44 px au moins**, 48 px pour Konnect. Quand l'objet ne peut pas les faire (un
  poignet sur un schéma), un bouton en toutes lettres à côté garantit le geste.
- Retour immédiat au toucher (`:active`), pas seulement au survol : un téléphone n'a pas de
  survol.
- Un choix exclusif ne se désélectionne pas en le retouchant.

**Lire.**
- Konnect : 16 px au moins pour tout ce qui se lit, contraste fort, une idée par écran.
- Chiffres en colonne : `font-variant-numeric: tabular-nums`.
- Pas de texte tronqué qui cache l'information utile : un libellé long passe à la ligne.
- Les textes passent par `humanizer`.

**Aligner.**
- Rayons concentriques : le rayon intérieur vaut le rayon extérieur moins l'écart.
- Alignement optique : une icône se centre à l'œil, pas à la boîte.
- Un seul rythme d'espacement par écran.

**Bouger.**
- 120 à 260 ms, en décélération. Le mouvement explique d'où vient une chose ; s'il
  n'explique rien, il n'a pas lieu d'être.
- `prefers-reduced-motion` respecté partout : l'état final s'applique sans transition.
- Une `viewBox` SVG ne s'anime pas en CSS (`BodySchema.tsx` le fait à la main).

**Ce qu'on n'ajoute pas.** Pas de `lucide-react`, pas d'icône « sparkles », pas d'emoji,
pas de dégradé ni d'ombre pour meubler, pas de second accent de couleur.

## Accessibilité, non négociable

Focus visible au clavier. Un dessin cliquable a un équivalent en bouton nommé (un SVG
décoratif est `aria-hidden`). `aria-expanded`, `aria-pressed`, `aria-selected` sur ce qui
s'ouvre, s'enfonce ou se choisit. Jamais la couleur seule pour porter un sens.

## Finir

Regarder de nouveau dans le navigateur, puis `python ../../scripts/verify_changed.py`. Rendre à
l'utilisateur ce qui a changé **à l'œil**, en trois ou quatre points, pas la liste des
fichiers.
