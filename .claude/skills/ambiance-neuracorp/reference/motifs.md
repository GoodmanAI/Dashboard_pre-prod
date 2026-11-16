# Motifs du site, prêts à transposer

Code repris de `repos/site` (Next 16, Tailwind 4) et réécrit pour le Dashboard (Next 14,
React 18, MUI 5). Rien ici n'est branché : la passe d'ambiance choisit ce qu'elle pose, écran
par écran, après l'inventaire. Les valeurs sont celles validées par Enzo sur le site.

## 1. Jetons de mouvement (`src/app/global.css`)

```css
:root {
  --ease-entree: cubic-bezier(0.2, 0.7, 0.2, 1);   /* entrées, cercle du bouton, compteur */
  --ease-panneau: cubic-bezier(0.23, 1, 0.32, 1);  /* menus, popovers, dialogues */
  --duree-appui: 120ms;
  --duree-etat: 200ms;     /* couleur, opacité, ombre */
  --duree-panneau: 220ms;
  --duree-entree: 600ms;
}
```

Dans le thème MUI (`DefaultColors.tsx`), pour que `Collapse`, `Fade`, `Grow`, `Menu` suivent :

```ts
transitions: {
  easing: {
    easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
    easeInOut: "cubic-bezier(0.2, 0.7, 0.2, 1)",
  },
  duration: { shortest: 120, shorter: 160, short: 200, standard: 220, enteringScreen: 220, leavingScreen: 160 },
},
```

`prefers-reduced-motion` : MUI ne le lit pas seul. Dans `CssBaseline` :

```ts
"@media (prefers-reduced-motion: reduce)": {
  "*, *::before, *::after": {
    animationDuration: "0.01ms !important",
    animationIterationCount: "1 !important",
    transitionDuration: "0.01ms !important",
    scrollBehavior: "auto !important",
  },
},
```

## 2. Socle (`CssBaseline`)

Repris de `globals.css` du site, accent du produit à la place de Lagune :

```ts
body: { WebkitFontSmoothing: "antialiased" },
"p, li, dd": { textWrap: "pretty" },
"h1, h2, h3, h4": { textWrap: "balance" },
"::selection": { background: "rgba(var(--accent-rgb), 0.28)" },
":focus-visible": { outline: "2px solid var(--accent)", outlineOffset: "3px" },
html: {
  accentColor: "var(--accent)",
  scrollbarColor: "rgba(42, 53, 71, 0.35) transparent",
},
".chiffre, [data-chiffre]": { fontVariantNumeric: "tabular-nums" },
```

Titres du site : poids 500, interlettrage `-0.025em` (titre de page) à `-0.035em` (affiche),
interligne serré (1,06). Le Dashboard est à 600 sans interlettrage : à essayer sur `h1` à `h3`
seulement, à l'œil.

## 3. Bouton : appui et relief (`MuiButton`)

```ts
MuiButton: {
  defaultProps: { disableElevation: true },
  styleOverrides: {
    root: {
      transition: "background-color 220ms ease, box-shadow 260ms ease, transform 120ms ease-out, color 220ms ease",
      "&:active": { transform: "scale(0.97)" },
    },
    containedPrimary: {
      backgroundColor: "var(--accent)",
      boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.22), 0 1px 2px rgb(14 26 28 / 0.18)",
      "@media (hover: hover) and (pointer: fine)": {
        "&:hover": {
          backgroundColor: "var(--accent-press)",
          boxShadow:
            "inset 0 1px 0 rgb(255 255 255 / 0.28), 0 1px 2px rgb(14 26 28 / 0.18), 0 12px 26px -12px rgba(var(--accent-rgb), 0.65)",
        },
      },
    },
  },
},
```

Le commentaire actuel du thème dit « l'ombre est réservée à ce qui flotte » : c'est une
décision passée, la changer se dit à Enzo. Sur le site, l'ombre teintée est son choix du 04/11.

## 4. Bouton à cercle d'encre (l'action principale d'un écran)

Sur le site (`Bouton.tsx`) : la seconde couleur s'étend en cercle depuis l'entrée de la souris,
se retire vers sa sortie ; au clavier, depuis le centre ; libellé qui monte d'un pixel.

```tsx
"use client";
import { useRef } from "react";
import Button, { ButtonProps } from "@mui/material/Button";

export function BoutonCercle({ children, sx, ...props }: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const placer = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect(); // une lecture par évènement, jamais par image
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  return (
    <Button
      ref={ref}
      variant="contained"
      onPointerEnter={placer}
      onPointerMove={placer}
      onPointerLeave={placer}
      sx={{
        "--x": "50%", "--y": "50%",
        position: "relative", isolation: "isolate", overflow: "hidden",
        "& .cercle": {
          position: "absolute", inset: 0, zIndex: -1,
          background: "var(--accent-deep)",
          clipPath: "circle(0 at var(--x) var(--y))",
          transition: "clip-path 520ms cubic-bezier(0.2, 0.7, 0.2, 1)",
        },
        "&:hover .cercle, &.Mui-focusVisible .cercle": { clipPath: "circle(150% at var(--x) var(--y))" },
        "&.Mui-focusVisible": { "--x": "50%", "--y": "50%" },
        "& .texte": { display: "inline-block", transition: "translate 320ms cubic-bezier(0.2, 0.7, 0.2, 1)" },
        "&:hover .texte": { translate: "0 -1px" },
        "@media (prefers-reduced-motion: reduce)": {
          "& .cercle, & .texte": { transition: "none" },
          "&:hover .texte": { translate: "none" },
        },
        ...sx,
      }}
      {...props}
    >
      <span aria-hidden="true" className="cercle" />
      <span className="texte">{children}</span>
    </Button>
  );
}
```

Un par écran au plus. Sur une rangée de dix boutons, l'effet devient du bruit.

## 5. Survol qui estompe les voisins

Menu du site (`globals.css`, `.menu-liste`). Pour le menu latéral ou une grille de tuiles :

```ts
sx={{
  "& .item": { transition: "opacity 200ms ease" },
  "@media (hover: hover) and (pointer: fine)": {
    "&:has(.item:hover) .item:not(:hover)": { opacity: 0.38 },
  },
  "&:has(.item:focus-visible) .item:not(:focus-visible)": { opacity: 0.38 },
}}
```

Au Dashboard, 0,38 est fort pour un menu qu'on lit : essayer 0,55 et juger au navigateur.

## 6. Ouverture d'un panneau par `@starting-style`

Le site l'emploie pour le menu et les cookies : interruptible (une transition, pas une
animation), et rien à faire en JavaScript. Navigateurs : Chrome 117, Safari 17.5,
Firefox 129 ; ailleurs, le panneau apparaît sans transition (dégradation propre).
Emotion (MUI) ne sait pas imbriquer `@starting-style` : le poser en CSS global.

```css
.panneau-entre {
  transition: opacity 220ms var(--ease-panneau), translate 220ms var(--ease-panneau);
}
@starting-style {
  .panneau-entre { opacity: 0; translate: 0 4px; }
}
dialog.panneau-entre[open] { transition-property: opacity, scale; }
@starting-style {
  dialog.panneau-entre[open] { opacity: 0; scale: 0.97; }
}
@media (prefers-reduced-motion: reduce) {
  .panneau-entre { transition: none; }
}
```

Pour `Menu`, `Popover` et `Dialog` de MUI, régler plutôt `TransitionComponent` et
`transitionDuration` (section 1) : ils ont déjà leur propre mécanique d'entrée et de sortie.

## 7. Entrée d'un titre, une fois

`Revele.tsx` du site : un `IntersectionObserver` pose `.vu`, le décalage vient de
`data-revele` (ms). **Départ lisible** (opacité 0,6, 16 px), jamais d'opacité 0 : si le
JavaScript tarde, rien n'est caché. Classe `.js` posée sur `<html>` par un script en tête.

```css
.js [data-revele] {
  transition: opacity 600ms var(--ease-entree), translate 700ms var(--ease-entree);
}
.js [data-revele]:not(.vu) { opacity: 0.6; translate: 0 16px; }
@media (prefers-reduced-motion: reduce) {
  .js [data-revele]:not(.vu) { opacity: 1; translate: none; }
  .js [data-revele] { transition: none; }
}
```

```tsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function Revele() {
  const chemin = usePathname(); // au Dashboard, on change d'écran sans recharger
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.transitionDelay = `${el.dataset.revele || 0}ms`;
          el.classList.add("vu");
          obs.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll<HTMLElement>("[data-revele]:not(.vu)").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [chemin]);
  return null;
}
```

Sur un outil, l'en-tête de page et le premier bloc suffisent. Décalage entre deux éléments :
40 à 60 ms, jamais plus de cinq éléments en cascade.

## 8. Compteur des tuiles de chiffres

`Chiffres.tsx` du site. Ce qui le rend juste :

- la **valeur finale est dans le HTML servi** (pas de saut à l'hydratation, rien de faux si le
  JavaScript échoue) ;
- il ne repart de zéro que si la tuile est **encore sous l'écran** au chargement ; sinon il
  affiche la valeur et ne bouge pas ;
- il écrit dans `textContent` à chaque image, **sans rendu React** ;
- 1 400 ms, `1 - (1 - p)^3`, `tabular-nums` pour que les chiffres ne tremblent pas ;
- le démontage remet la valeur finale.

```tsx
"use client";
import { useEffect, useRef } from "react";

export function Compteur({ valeur, format = (v) => new Intl.NumberFormat("fr-FR").format(Math.round(v)), duree = 1400 }: {
  valeur: number; format?: (v: number) => string; duree?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fin = format(valeur);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.textContent = format(0);
    let image = 0;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const debut = performance.now();
      const pas = (t: number) => {
        const p = Math.min((t - debut) / duree, 1);
        el.textContent = format(valeur * (1 - Math.pow(1 - p, 3)));
        if (p < 1) image = requestAnimationFrame(pas);
      };
      image = requestAnimationFrame(pas);
    }, { threshold: 0.6 });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(image); el.textContent = fin; };
  }, [valeur, duree, fin]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }} suppressHydrationWarning>{fin}</span>;
}
```

**Différence avec le site** : au Dashboard, les tuiles sont presque toujours dans le premier
écran, et les chiffres arrivent par `fetch`. La règle à trancher dans la passe : monter de
l'ancienne valeur à la nouvelle quand un filtre change (période, examen) plutôt que de zéro au
chargement ; un pourcentage ou un délai ne se compte pas (comme « 24/7 » sur le site) ; un
chiffre qui se rafraîchit seul (socket) ne remonte pas à chaque fois.

## 9. Fondu des bords d'une liste qui défile

`BandeauLogos.tsx` : `mask-image` sur la fenêtre plutôt qu'un dégradé posé par-dessus (qui
suppose la couleur du fond).

```ts
sx={{ maskImage: "linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent)" }}
```

## 10. Grain (vitrine, à réserver)

```css
.grain { position: relative; isolation: isolate; }
.grain::before {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  opacity: 0.18; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
```

Écran de connexion ou accueil vide seulement. La CSP de `next.config.js` doit admettre
`data:` en `img-src` (à vérifier avant).

## 11. Palette du site, pour mémoire

Lagune (`repos/site/src/app/globals.css`) : fond `#f3f5f4`, bloc `#d9eae5`, encre `#0e1a1c`,
encre 2 `#4e5d5e`, accent `#0f6e68`, accent foncé `#0b5752`, touche (vert d'eau) `#7fd1c1`,
trait `#d6dedb`, alerte ocre `#8a4f0c` sur `#f6e7cf`, rose No Show `#a1335f`. Police Geist
(`next/font/google`, poids 500 aux titres). **Ce sont des décisions du site** : ne les poser au
Dashboard que sur décision d'Enzo.
