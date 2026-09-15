"use client";

import { useSession } from "next-auth/react";
import { hasPermission, type PageKey } from "@/lib/permissions";

/**
 * Le droit de la session courante sur une page, côté navigateur.
 *
 * Miroir client de `requirePagePermission` (`src/lib/authGuards.ts`). Il lit la même
 * fonction `hasPermission` et la même session, donc les deux ne peuvent pas diverger.
 *
 * **Pourquoi il manquait** (ajouté le 15/09/2026). `PageAccessGuard` ne testait que le
 * niveau `read` : un sous-compte en lecture seule ouvrait l'écran, voyait ses champs
 * actifs, saisissait, cliquait sur Enregistrer, et découvrait le refus au retour de
 * l'API. Et tant que les routes n'étaient pas gardées, il n'y avait même pas de refus.
 *
 * **Ce hook ne protège rien.** Il rend l'écran honnête, c'est tout. La sécurité est la
 * garde serveur, qui reste obligatoire sur chaque route : un formulaire grisé se
 * contourne avec la console du navigateur.
 *
 * Usage typique, sur un écran qui porte `BarreEnregistrement` :
 *
 *     const { peutEcrire, raisonLectureSeule } = useDroitPage(PAGES.KONNECT_SITES);
 *     ...
 *     <BarreEnregistrement blocage={raisonLectureSeule ?? blocageMetier} ... />
 */
export function useDroitPage(page: PageKey): {
  /** La session peut ouvrir cette page. */
  peutLire: boolean;
  /** La session peut y enregistrer. */
  peutEcrire: boolean;
  /**
   * Texte à passer tel quel à `BarreEnregistrement.blocage` quand l'écran est en
   * lecture seule, `null` sinon. Formulé pour un utilisateur, pas pour un
   * développeur : il dit ce qui se passe et vers qui se tourner.
   */
  raisonLectureSeule: string | null;
  /** La session n'est pas encore chargée : ne rien décider sur cette base. */
  enChargement: boolean;
} {
  const { data: session, status } = useSession();
  const enChargement = status === "loading";

  // Tant que la session charge, on annonce les droits au MINIMUM. Annoncer l'inverse
  // ferait clignoter un formulaire actif puis grisé, et laisserait une fraction de
  // seconde pour cliquer sur Enregistrer.
  if (enChargement || !session?.user) {
    return {
      peutLire: false,
      peutEcrire: false,
      raisonLectureSeule: null,
      enChargement,
    };
  }

  const sujet = session.user as any;
  const peutLire = hasPermission(sujet, page, "read");
  const peutEcrire = hasPermission(sujet, page, "write");

  return {
    peutLire,
    peutEcrire,
    raisonLectureSeule: peutEcrire
      ? null
      : "Vous avez cette page en lecture seule. Demandez les droits d'écriture à votre administrateur.",
    enChargement: false,
  };
}
