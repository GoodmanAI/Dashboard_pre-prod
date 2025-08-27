"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * # Contexte Centre
 * Fournit au front une gestion centralisée des “centres” administrés :
 * - Liste des centres gérés par l’utilisateur (si `centreRole === ADMIN_USER`)
 * - Centre actuellement sélectionné (persisté en localStorage)
 * - Méthode pour changer de centre actif
 *
 * Ce contexte est lu par les vues “centre-aware” (Explain, Talk, Tickets, etc.)
 * afin d’ajouter automatiquement `asUserId` aux requêtes API lorsque requis.
 */

/* ============================= */
/* ========== Types ============ */
/* ============================= */

/**
 * Représentation minimale d’un centre (utilisateur géré).
 * Alignée sur la structure renvoyée par `/api/client`.
 */
export interface ManagedUser {
  id: number;
  name?: string | null;
  email: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/**
 * Signature publique du contexte consommé par les composants.
 */
interface CentreContextType {
  centres: ManagedUser[];
  selectedCentre: ManagedUser | null;
  selectedUserId: number | null; // alias pratique de selectedCentre?.id
  setSelectedCentreById: (id: number) => void;
}

/* ============================= */
/* ========= Constantes ======== */
/* ============================= */

/**
 * Clé de persistance de l’ID centre sélectionné (localStorage).
 */
const STORAGE_KEY = "lyrae_selected_centre_id";

/* ============================= */
/* ===== Création du contexte == */
/* ============================= */

const CentreContext = createContext<CentreContextType | undefined>(undefined);

/* ============================= */
/* ===== Fournisseur (Provider) =*/
/* ============================= */

/**
 * Enveloppe l’application pour exposer le contexte “centre”.
 * - Au login, récupère les centres gérés si l’utilisateur est `ADMIN_USER`.
 * - Restaure la sélection précédente depuis localStorage si possible.
 * - Synchronise `selectedUserId` à partir du centre actif.
 */
export const CentreProvider = ({ children }: { children: ReactNode }) => {
  const { status } = useSession();
  const [centres, setCentres] = useState<ManagedUser[]>([]);
  const [selectedCentre, setSelectedCentre] = useState<ManagedUser | null>(null);

  /**
   * Chargement initial des centres lorsque la session est authentifiée.
   * - Fait un GET `/api/client` pour obtenir `centreRole` et `managedUsers`.
   * - Si l’utilisateur n’a pas le rôle centre admin, on nettoie l’état et le stockage local.
   */
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/client")
        .then((res) => res.json())
        .then((data) => {
          if (data.centreRole === "ADMIN_USER" && Array.isArray(data.managedUsers)) {
            setCentres(data.managedUsers);

            // Restauration d’une sélection précédente si valide, sinon fallback au premier centre.
            const storedId = Number(localStorage.getItem(STORAGE_KEY) || "");
            const fallback = data.managedUsers[0] ?? null;
            const initial =
              data.managedUsers.find((u: ManagedUser) => u.id === storedId) || fallback;

            setSelectedCentre(initial);
          } else {
            setCentres([]);
            setSelectedCentre(null);
            localStorage.removeItem(STORAGE_KEY);
          }
        })
        .catch((err) => console.error("Failed to load centres:", err));
    }
  }, [status]);

  /**
   * Change le centre actif et persiste l’ID en localStorage.
   * @param id - Identifiant du centre cible
   */
  const setSelectedCentreById = (id: number) => {
    const centre = centres.find((c) => c.id === id) || null;
    setSelectedCentre(centre);
    if (centre) localStorage.setItem(STORAGE_KEY, String(centre.id));
  };

  return (
    <CentreContext.Provider
      value={{
        centres,
        selectedCentre,
        selectedUserId: selectedCentre?.id ?? null,
        setSelectedCentreById,
      }}
    >
      {children}
    </CentreContext.Provider>
  );
};

/* ============================= */
/* ===== Hook consommateur ===== */
/* ============================= */

/**
 * Hook sécurisé pour consommer le contexte Centre.
 * Doit être utilisé à l’intérieur d’un `CentreProvider`.
 */
export const useCentre = (): CentreContextType => {
  const context = useContext(CentreContext);
  if (!context) throw new Error("useCentre must be used within a CentreProvider");
  return context;
};
