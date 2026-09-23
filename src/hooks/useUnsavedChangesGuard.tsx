"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import DialogConfirmation from "@/components/shared/DialogConfirmation";

/**
 * Hook `useUnsavedChangesGuard` (chantier 2026-08-06).
 * -----------------------------------------------------------------------------
 * Prévient avant de quitter une page qui a des modifications non enregistrées.
 *
 * Deux chemins de sortie, et ils ne se traitent pas pareil :
 *  1. Fermeture ou rechargement de l'onglet → `beforeunload`. Le navigateur impose
 *     son propre dialogue, on ne peut ni le styler ni en changer le texte. C'est une
 *     contrainte des navigateurs, pas un choix.
 *  2. Clic sur un lien interne (menu, fil d'Ariane) → intercepté ici, et c'est un
 *     **dialogue du site** depuis le 23/09/2026, à la place du `confirm()` du
 *     navigateur, qui s'affichait hors de la page et se validait d'un Entrée réflexe.
 *
 * On ne remplace pas `router.push` : un écran qui redirige volontairement après un
 * enregistrement appelle `disable()` juste avant.
 *
 * ⚠️ **L'appelant DOIT rendre `dialogue`**, sinon le clic est bloqué sans que rien ne
 * s'affiche, et l'utilisateur ne peut plus quitter la page.
 *
 * Usage :
 *   const { disable, dialogue } = useUnsavedChangesGuard(modifications > 0, {
 *     message: "Vos 3 modifications seront perdues.",
 *   });
 *   return (<>{dialogue} … </>);
 */

interface Options {
  /** Ce que l'utilisateur perd s'il quitte. Une affirmation, pas une question. */
  message?: string;
  /** La question, en titre. Par défaut « Quitter sans enregistrer ? ». */
  titre?: string;
}

const DEFAULT_MSG =
  "Les modifications que vous avez faites sur cette page seront perdues.";
const DEFAULT_TITRE = "Quitter sans enregistrer ?";

export function useUnsavedChangesGuard(isDirty: boolean, opts: Options = {}) {
  const router = useRouter();
  const message = opts.message ?? DEFAULT_MSG;
  const titre = opts.titre ?? DEFAULT_TITRE;

  // Ref pour eviter que le handler ne capture une vieille valeur de isDirty.
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  // Destination retenue le temps que l'utilisateur réponde. `null` = pas de dialogue.
  const [destination, setDestination] = useState<string | null>(null);

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
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      // Skip si download, target=_blank, ou href externe
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "" && anchor.target !== "_self")
        return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return; // ancre interne page = OK
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      // Skip si meme URL que la courante (pas de vraie navigation)
      let cible: URL;
      try {
        cible = new URL(anchor.href, window.location.href);
        if (
          cible.origin === window.location.origin &&
          cible.pathname === window.location.pathname &&
          cible.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }

      // La navigation est suspendue, pas refusée : elle reprend si l'utilisateur
      // confirme. Le `confirm()` d'avant pouvait répondre en synchrone ; un dialogue
      // du site ne le peut pas, donc on arrête le clic et on garde la destination.
      e.preventDefault();
      e.stopPropagation();
      setDestination(cible.href);
    };
    // Capture phase pour intercepter AVANT les handlers React de <Link>
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  // Bouton d'echappement pour une redirection volontaire.
  const disable = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  const quitter = useCallback(() => {
    const url = destination;
    setDestination(null);
    if (!url) return;
    dirtyRef.current = false;
    // Navigation interne : on reprend le chemin normal de l'application, sans recharger.
    // Externe (documentation, sous-domaine patient) : rechargement complet.
    const cible = new URL(url);
    if (cible.origin === window.location.origin) {
      router.push(cible.pathname + cible.search + cible.hash);
    } else {
      window.location.href = url;
    }
  }, [destination, router]);

  const dialogue = (
    <DialogConfirmation
      ouvert={destination !== null}
      titre={titre}
      texte={message}
      libelleAction="Quitter sans enregistrer"
      destructif
      onConfirmer={quitter}
      onAnnuler={() => setDestination(null)}
    />
  );

  return { disable, dialogue };
}
