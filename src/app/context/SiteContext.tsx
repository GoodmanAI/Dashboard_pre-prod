"use client";

import React, { createContext, useContext, useState } from "react";

type CHUName = "CHU Nantes" | "CHU Rennes" | "CHU Vannes";

interface SiteContextType {
  selectedSite: CHUName;
  setSelectedSite: (site: CHUName) => void;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

export const SiteProvider = ({ children }: { children: React.ReactNode }) => {
    const [selectedSite, setSelectedSite] = useState<CHUName>("CHU Nantes");

  return (
    <SiteContext.Provider value={{ selectedSite, setSelectedSite }}>
      {children}
    </SiteContext.Provider>
  );
};

export const useSite = (): SiteContextType => {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error("useSite must be used within a SiteProvider");
  }
  return context;
};
