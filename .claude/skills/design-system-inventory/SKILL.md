---
name: design-system-inventory
description: Inventorier ce qui existe déjà avant d'ajouter de l'interface au Dashboard ou à Konnect, composants partagés, jetons de style, icônes, et ce qui est déjà dupliqué. À lancer AVANT d'écrire un composant, un écran, une carte, un bouton ou une classe CSS. Correspond à « design-system:inventory ».
---

# Inventaire avant d'ajouter de l'interface

```bash
python ../../scripts/inventaire_ui.py dashboard
python ../../scripts/inventaire_ui.py konnect carte     # filtre sur un mot : carte, bouton, badge...
```

On cherche ce qui existe **avant** d'écrire. Le 18/09/2026, l'inventaire du Dashboard a
montré `BORDER` redéfini à la main dans 21 écrans, `SURFACE` dans 9, et le composant
`Reglage` recopié dans 3 : chaque copie avait été ajoutée par quelqu'un qui n'avait pas
regardé.

## Deux systèmes, qui ne se mélangent pas

| | Dashboard | Konnect |
|---|---|---|
| Base | MUI 5, `sx`, thème dans `(DashboardLayout)` | aucun kit : `src/ui/` et `styles/konnect.css` |
| Composants partagés | `src/components/**`, `src/app/(DashboardLayout)/components/**` | `ui/components.tsx` : `Screen`, `Primary`, `Secondary`, `Ghost`, `Note`... |
| Icônes | `@mui/icons-material`, `@tabler/icons-react` | `ui/Icon.tsx`, dessinées à la main : une icône = un `<path>` |
| Couleurs | `var(--accent)` et constantes par écran (dette) | jetons `:root` : `--accent`, `--ink`, `--line`, `--r-card`... |
| Public | secrétaires et administrateurs, sur écran de bureau | patients, souvent âgés, sur téléphone |

## Règles d'interface du workspace

1. **Pas de `lucide-react`.** Aucune brique ne l'utilise : ne pas l'introduire. Les icônes
   viennent du système de la brique, tableau ci-dessus.
2. **Pas d'icône « sparkles »** (`Sparkles`, `AutoAwesome`, `IconSparkles`), ni d'étoiles
   pour dire « intelligent ». Le produit n'a pas à se présenter comme une IA à chaque bouton.
3. **Pas d'emoji dans l'interface** : écrans, mails et SMS lus par un client ou un patient.
   Une icône du système, ou rien.
4. **Pas de tiret cadratin** dans un texte affiché (voir `humanizer`).

`scripts/verify_changed.py` refuse les trois premières sur les lignes ajoutées.

## L'ordre de décision

1. **Réutiliser** un composant partagé tel quel.
2. **Étendre** un composant existant par une propriété, si le besoin est une variante.
3. **Créer**, et alors dans le dossier partagé, pas dans le fichier de l'écran.
4. Si l'inventaire montre que la chose est **déjà dupliquée** : ne pas ajouter une copie.
   Sortir le composant une bonne fois, ou au minimum le dire dans le compte rendu.

## Ce que l'inventaire ne dit pas

Il liste des noms, pas des usages. Avant de réutiliser un composant, ouvrir un écran qui
s'en sert. Et il ne juge pas le rendu : ça se fait dans un navigateur, à la largeur réelle
(téléphone pour Konnect), avec `frontend-design` pour la direction visuelle et
`make-interfaces-feel-better` pour la finition.
