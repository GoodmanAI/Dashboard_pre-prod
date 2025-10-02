"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { useSession } from "next-auth/react";

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
 * (ne pas modifier pour éviter les breaking changes)
 */
interface CentreContextType {
  centres: ManagedUser[];
  selectedCentre: ManagedUser | null;
  selectedUserId: number | null; // alias pratique de selectedCentre?.id
  setSelectedCentreById: (id: number) => void;
}

/** Clé de persistance de l’ID centre sélectionné (localStorage). */
const STORAGE_KEY = "lyrae_selected_centre_id";

const CentreContext = createContext<CentreContextType | undefined>(undefined);

export const CentreProvider = ({ children }: { children: ReactNode }) => {
  const { status } = useSession();
  const [centres, setCentres] = useState<ManagedUser[]>([]);
  const [selectedCentre, setSelectedCentre] = useState<ManagedUser | null>(null);

  /**
   * Chargement initial des centres lorsque la session est authentifiée.
   * - GET `/api/client` pour obtenir `centreRole` et `managedUsers`.
   * - Si l’utilisateur n’est pas ADMIN_USER, nettoyage de l’état et du stockage local.
   */
  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/client", { cache: "no-store" });
        const data = await res.json();

        if (cancelled) return;

        if (data?.centreRole === "ADMIN_USER" && Array.isArray(data?.managedUsers)) {
          const list: ManagedUser[] = data.managedUsers;
          setCentres(list);

          // Restauration d’une sélection précédente si valide, sinon fallback au premier centre.
          const raw = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "";
          const storedId = Number(raw);
          const fallback = list[0] ?? null;
          const initial =
            list.find((u) => u.id === storedId) || fallback;

          setSelectedCentre(initial || null);

          // Re-synchronise le storage si besoin
          if (initial) {
            localStorage.setItem(STORAGE_KEY, String(initial.id));
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        } else {
          setCentres([]);
          setSelectedCentre(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (err) {
        console.error("Failed to load centres:", err);
        setCentres([]);
        setSelectedCentre(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  /**
   * Si la liste des centres change et que le centre sélectionné actuel
   * n’en fait plus partie, on force un fallback propre.
   */
  useEffect(() => {
    if (!centres.length) return;
    if (selectedCentre && centres.some((c) => c.id === selectedCentre.id)) return;

    const raw = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "";
    const storedId = Number(raw);
    const next =
      centres.find((c) => c.id === storedId) || centres[0] || null;

    setSelectedCentre(next);
    if (next) {
      localStorage.setItem(STORAGE_KEY, String(next.id));
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centres]);

  /**
   * Change le centre actif et persiste l’ID en localStorage.
   */
  const setSelectedCentreById = (id: number) => {
    const centre = centres.find((c) => c.id === id) || null;
    setSelectedCentre(centre);
    if (typeof window !== "undefined") {
      if (centre) localStorage.setItem(STORAGE_KEY, String(centre.id));
      else localStorage.removeItem(STORAGE_KEY);
    }
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

export const useCentre = (): CentreContextType => {
  const context = useContext(CentreContext);
  if (!context) throw new Error("useCentre must be used within a CentreProvider");
  return context;
};
