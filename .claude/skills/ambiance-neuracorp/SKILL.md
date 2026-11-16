---
name: ambiance-neuracorp
description: Ce que la refonte du site neuracorp.ai a appris sur le soin de l'interface (boutons, survols, entrées, compteurs, menus, focus, typographie, mouvement), transposé au Dashboard (MUI 5, Next 14). À charger avant toute passe d'ambiance, d'animation, de transition, de chargement de page ou d'animation des statistiques du Dashboard, et dès qu'Enzo dit « comme sur le site », « l'ambiance », « que ça respire », « que ça fasse moins gabarit ».
---

# L'ambiance du site neuracorp.ai, portée au Dashboard

Source : `repos/site` (`dev` `2e13440`, `src/app/globals.css`, `src/components/`), plan
`plans/2026-10-refonte-site-neuracorp.md` § 15 à 18 (passe d'Enzo, audit, leçons). Le code
prêt à transposer est dans [reference/motifs.md](reference/motifs.md).

**Le site est une vitrine, le Dashboard un outil de travail.** On reprend la *façon de
faire* (courbes, durées, retours au toucher, sobriété du mouvement, accessibilité), pas le
décor (vidéo plein écran, grain partout, bandeau en cylindre). Une secrétaire ouvre le
Dashboard cinquante fois par jour : ce qui charme la première fois agace la dixième.

## Ordre d'une passe

1. **Inventaire** : `design-system-inventory` (on étend MUI et `global.css`, on ne recrée pas).
2. **Direction** : `impeccable` (critique, hiérarchie, couleur, accessibilité ; `product`,
   pas `brand`). Pas de `PRODUCT.md` dans ce dépôt : `impeccable init` le propose, il faut
   l'entretien avec Enzo. `design-taste-frontend` ne sert **pas** ici (site vitrine seul).
3. **Règles UX** : `ui-ux-pro-max` (accessibilité, toucher, performance, liste avant livraison).
4. **Mouvement** : `animate` pour construire, `review-animations` pour critiquer,
   `animation-performance` dès que ça saccade, `find-animation-opportunities` et
   `improve-animations` pour l'audit de départ (lecture seule, ils proposent un plan).
   Philosophie de finition : `emil-design-eng`.
5. **Graphiques et tuiles de chiffres** : skill `dataviz` avant d'écrire une ligne de
   graphique (Recharts et ApexCharts sont tous deux installés ; ne pas en ajouter un troisième).
6. **Finition** : `make-interfaces-feel-better` ; textes par `humanizer`.
7. **Navigateur** : Claude in Chrome à 1440 et 390 px, puis Chrome DevTools sur le build
   (`npm run build` puis `next start`, jamais `next dev`) : LCP, CLS, INP, console.
   Aperçu local : mémoires `apercu-ecran-en-local`, `apercu-local-dashboard`.

L'ordre de priorité du workspace tient : règles d'interface et ton du `CLAUDE.md`, puis les
skills. Une décision d'Enzo l'emporte sur la règle d'un skill.

## Ce qu'on reprend du site (détail et code : reference/motifs.md)

| Motif du site | Où il vit sur le site | Au Dashboard |
|---|---|---|
| Deux courbes, pas plus : `cubic-bezier(0.2, 0.7, 0.2, 1)` (entrées, cercle) et `cubic-bezier(0.23, 1, 0.32, 1)` (menus, panneaux, carte des cookies) | `globals.css` | jetons CSS `--ease-entree`, `--ease-panneau` dans `global.css`, et `theme.transitions.easing` |
| Durées : 120 ms (appui), 160 à 260 ms (couleur, ombre, panneau), 520 ms (cercle du bouton), 600 à 700 ms (entrée d'un titre), 1 400 ms (compteur) | idem | même échelle ; rien au-dessus de 300 ms sur une action répétée |
| Appui : `:active { transform: scale(0.97) }` en 120 ms | `.bouton` | `MuiButton`, `MuiIconButton`, cartes cliquables |
| Relief du bouton plein : liseré clair en haut, ombre teintée de l'accent qui monte au survol (souris seulement) | `.bouton-plein` | `containedPrimary` (aujourd'hui `boxShadow: none`), teinte `rgba(var(--accent-rgb), …)` |
| Cercle d'encre qui part de l'endroit où entre la souris, libellé qui monte d'un pixel ; depuis le centre au clavier | `Bouton.tsx` | **un seul** bouton par écran (l'action principale), pas sur chaque bouton |
| Survol qui estompe les voisins (0,38) avec `:has()`, seulement `(hover: hover) and (pointer: fine)` | menu `Entete.tsx` | menu latéral, listes de tuiles, onglets |
| Ouverture par `@starting-style` (fondu + 4 px ou `scale(0.97)`), interruptible | menu, `Consentement.tsx` | `Menu`, `Popover`, `Dialog`, panneau de la recherche centrale |
| Entrée d'un titre une fois, depuis un état **déjà lisible** (opacité 0,6, 16 px), jamais de 0 | `Revele.tsx` | en-tête de page et premier bloc ; pas chaque carte d'une grille |
| Compteur qui monte en 1 400 ms, `ease-out` cubique, écrit dans `textContent` sans rendu React par image, valeur finale dans le HTML servi, `tabular-nums` | `Chiffres.tsx` | tuiles de chiffres de l'accueil et des Statistiques |
| `text-wrap: balance` sur les titres, `pretty` sur les paragraphes ; titres à interlettrage négatif | `globals.css` | `theme.typography`, `CssBaseline` |
| Focus visible : contour 2 px de l'accent, décalé de 3 px ; `::selection` à l'accent clair ; `accent-color` et `scrollbar-color` à la couleur du produit | `globals.css` | `CssBaseline` |
| `prefers-reduced-motion` partout : l'état final s'applique d'un coup | chaque bloc | chaque bloc, sans exception |
| Fondu des bords par `mask-image` plutôt qu'un dégradé posé dessus | `BandeauLogos.tsx` | listes défilantes horizontales (filtres, onglets) |

## Ce qui ne passe pas tel quel (à faire trancher par Enzo)

- **Palette Lagune et police Geist** : décisions *du site*. Le Dashboard a son accent par
  produit (`--accent` Talk `#48c8af`, Konnect `#1268c4`, `global.css` et `src/lib/accent.ts`
  synchronisés) et **deux** polices chargées (Plus Jakarta Sans par le thème, Inter locale
  par le layout, dette à trier). Passer à Geist ou rapprocher l'encre (`#0e1a1c`) et le fond
  (`#f3f5f4`) du site est un choix de marque : le proposer, ne pas l'imposer.
- **Grain de film** : sur l'écran de connexion ou l'accueil vide, peut-être ; jamais sous un
  tableau ou un formulaire (lisibilité, coût de `mix-blend-mode`).
- **Vidéo, cylindre, scène fixe au défilement** : vitrine seulement.

## Leçons de l'audit du site (§ 18), qui valent ici

- Une séquence animée de plus de 3 s laisse une carte vide au passage : accélérer ou lier au
  défilement.
- Un compteur qui affiche la valeur finale puis repart de zéro à l'hydratation, c'est un
  saut : ne repartir de zéro que si l'élément est encore hors de l'écran au chargement.
- `@keyframes` ne s'interrompt pas : pour un état qui va et vient, une `transition`.
- Lire `getBoundingClientRect` à chaque image force la mise en page : mesurer une fois.
- `aria-live` qui parle à chaque changement fatigue le lecteur d'écran : seulement le
  résultat d'une action.
- Tout ce qui défile seul a un arrêt (WCAG 2.2.2).
- Le même fondu sur chaque bloc ne raconte rien : réserver le mouvement à deux ou trois
  moments par écran.

## Le Dashboard au 16/11/2026 (point de départ de la passe)

- `prefers-reduced-motion` : 1 fichier ; `@keyframes` : 3 ; `tabular-nums` : 12.
- Chargements : `CircularProgress` dans 75 fichiers, `Skeleton` dans 9, un seul `loading.tsx`
  sous `src/app`. Le chantier des chargements part de là : squelettes à la forme du contenu,
  place réservée (CLS 0), pas de roue au milieu d'une page blanche, `loading.tsx` par groupe
  de routes.
- Thème : `src/utils/theme/DefaultColors.tsx` (aucun `transitions` réglé, boutons pleins
  sans ombre, cartes à 7 px) ; accent : `src/app/global.css`.
- Graphiques : Recharts (7 fichiers) et ApexCharts ; les attributs SVG ne lisent pas `var()`,
  passer par `src/lib/accent.ts`.

## Règles qui ne bougent pas

Pas de `lucide-react`, pas d'icône « sparkles », pas d'emoji, pas de tiret cadratin dans un
texte affiché. Toute nouveauté d'écran passe par la recherche centrale (règle 6 du `CLAUDE.md`
du workspace). Un écran se juge dans le navigateur, à la largeur réelle.
