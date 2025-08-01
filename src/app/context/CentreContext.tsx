// context/CentreContext.tsx
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
  setSelectedCentreById: (id: number) => void;
}

const CentreContext = createContext<CentreContextType | undefined>(undefined);

export const CentreProvider = ({ children }: { children: ReactNode }) => {
  const { data: session, status } = useSession();
  const [centres, setCentres] = useState<ManagedUser[]>([]);
  const [selectedCentre, setSelectedCentre] = useState<ManagedUser | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/client")
        .then((res) => res.json())
        .then((data) => {
          // Seuls les admin_user chargent des centres
          if (data.centreRole === "ADMIN_USER" && Array.isArray(data.managedUsers)) {
            setCentres(data.managedUsers);
            if (data.managedUsers.length > 0) {
              setSelectedCentre(data.managedUsers[0]);
            }
          } else {
            setCentres([]);
            setSelectedCentre(null);
          }
        })
        .catch((err) => console.error("Failed to load centres:", err));
    }
  }, [status]);

  const setSelectedCentreById = (id: number) => {
    const centre = centres.find((c) => c.id === id) || null;
    setSelectedCentre(centre);
  };

  return (
    <CentreContext.Provider value={{ centres, selectedCentre, setSelectedCentreById }}>
      {children}
    </CentreContext.Provider>
  );
};

export const useCentre = (): CentreContextType => {
  const context = useContext(CentreContext);
  if (!context) {
    throw new Error("useCentre must be used within a CentreProvider");
  }
  return context;
};
