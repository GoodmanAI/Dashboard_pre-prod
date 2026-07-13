import { z } from "zod";

/**
 * Politique de mot de passe unifiée pour toute l'app.
 *
 * Règles :
 *  - 8 caractères minimum
 *  - Au moins 1 majuscule (A-Z)
 *  - Au moins 1 minuscule (a-z)
 *  - Au moins 1 chiffre (0-9)
 *  - Au moins 1 caractère spécial parmi @$!%*?&
 *
 * Utiliser dans TOUTES les routes qui prennent un mot de passe en entrée
 * (change-password, reset-password, create-client, futurs endpoints…) pour
 * éviter les incohérences entre endpoints (un admin qui créait un client
 * avec un mot de passe faible que le client ne pouvait ensuite pas changer).
 */
export const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
  .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre")
  .regex(
    /[@$!%*?&]/,
    "Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&)"
  );

/**
 * Version "message unique" pour affichage côté formulaire — plus lisible pour
 * l'utilisateur qu'une cascade d'erreurs.
 */
export const PASSWORD_POLICY_HINT =
  "Minimum 8 caractères, avec majuscule, minuscule, chiffre et caractère spécial (@$!%*?&).";
