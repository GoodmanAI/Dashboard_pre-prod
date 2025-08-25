"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useSession } from "next-auth/react";

export interface ManagedUser {
  id: number;
  name?: string | null;
  email: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

interface CentreContextType {
  centres: ManagedUser[];
  selectedCentre: ManagedUser | null;
  selectedUserId: number | null;
  setSelectedCentreById: (id: number) => void;
}

const STORAGE_KEY = "lyrae_selected_centre_id";
const CentreContext = createContext<CentreContextType | undefined>(undefined);

export const CentreProvider = ({ children }: { children: ReactNode }) => {
  const { status } = useSession();
  const [centres, setCentres] = useState<ManagedUser[]>([]);
  const [selectedCentre, setSelectedCentre] = useState<ManagedUser | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/client")
        .then((res) => res.json())
        .then((data) => {
          if (data.centreRole === "ADMIN_USER" && Array.isArray(data.managedUsers)) {
            setCentres(data.managedUsers);

            // Récupérer éventuelle sélection précédente
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

export const useCentre = (): CentreContextType => {
  const context = useContext(CentreContext);
  if (!context) throw new Error("useCentre must be used within a CentreProvider");
  return context;
};
