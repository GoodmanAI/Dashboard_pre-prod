"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Hook `useUnsavedChangesGuard` (chantier 2026-08-06).
 * -----------------------------------------------------------------------------
 * Bloque la navigation quand un formulaire a des modifications non sauvegardees.
 *
 * Bloque 2 chemins de sortie :
 *  1. Fermeture / reload du navigateur -> beforeunload natif (prompt browser).
 *  2. Clic sur un lien interne <a href="..."> qui pointerait vers une autre
 *     page -> intercepte via click delegation sur document, empeche la nav.
 *
 * On NE monkey-patch PAS router.push : les composants qui font une redirection
 * volontaire APRES un save doivent appeler `disable()` juste avant.
 *
 * Usage :
 *   const guard = useUnsavedChangesGuard(dirtyCount > 0, {
 *     message: "Vous avez X modifications non enregistrees. Quitter sans sauver ?",
 *   });
 *   // Avant une redirection volontaire :
 *   guard.disable();
 *   router.push("/somewhere");
 */

interface Options {
  /** Message affiche dans le confirm() JS pour les liens internes. */
  message?: string;
}

const DEFAULT_MSG =
  "Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter cette page sans sauvegarder ?";

export function useUnsavedChangesGuard(isDirty: boolean, opts: Options = {}) {
  const message = opts.message ?? DEFAULT_MSG;

  // Ref pour eviter que le handler ne capture une vieille valeur de isDirty.
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  // 1) Beforeunload : reload / close / URL directe
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      // Les navigateurs modernes ignorent le string custom mais lisent
      // returnValue pour afficher leur prompt natif.
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [message]);

  // 2) Interception des clics sur liens internes.
  //    On evite d'utiliser un router listener (l'App Router ne fournit pas de
  //    hook officiel de type route-change-start). Cette delegation click est
  //    la solution la plus robuste et couvre 90% des cas (menu sidebar,
  //    breadcrumbs, boutons wrappant un <a>).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      // Ignorer clics modifies (ctrl/cmd/shift = ouvre nouvelle tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      // Skip si download, target=_blank, ou href externe
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return; // ancre interne page = OK
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      // Skip si meme URL que la courante (pas de vraie navigation)
      try {
        const targetUrl = new URL(anchor.href, window.location.href);
        if (
          targetUrl.origin === window.location.origin &&
          targetUrl.pathname === window.location.pathname &&
          targetUrl.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }

      // Confirm : si annule, on bloque la navigation.
      const confirmed = window.confirm(message);
      if (!confirmed) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Capture phase pour intercepter AVANT les handlers React de <Link>
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [message]);

  // Bouton d'echappement pour une redirection volontaire.
  const disable = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  return { disable };
}
