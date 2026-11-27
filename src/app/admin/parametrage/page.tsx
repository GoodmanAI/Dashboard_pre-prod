"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Tab, Tabs } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import InstallationTalk from "@/components/admin/parametrage/InstallationTalk";
import ConfigurationRobot from "@/components/admin/parametrage/ConfigurationRobot";
import InstallationKonnect from "@/components/admin/parametrage/InstallationKonnect";
import IdentifiantsExternes from "@/components/admin/parametrage/IdentifiantsExternes";
import PackConfiguration from "@/components/admin/parametrage/PackConfiguration";

/**
 * Paramétrage d'un centre (27/11/2026, plan lyrae/plans/2026-11-separation-dashboard-pilot.md).
 *
 * Les cinq écrans qui installent et règlent un centre, réunis en une page et un choix de
 * centre : installation Talk, configuration du robot, installation Konnect, identifiants
 * externes, pack de configuration. Les anciennes adresses (`/admin/talk-installation`…)
 * mènent ici, sur le bon onglet. Le centre choisi dans un onglet Talk reste choisi dans
 * l'autre ; même chose pour Konnect.
 *
 * `?onglet=talk|robot|konnect|identifiants|pack` et `?centre=<UserProduct.id>`.
 */
const ONGLETS = [
  { cle: "talk", libelle: "Installation Talk" },
  { cle: "robot", libelle: "Configuration du robot" },
  { cle: "konnect", libelle: "Installation Konnect" },
  { cle: "identifiants", libelle: "Identifiants externes" },
  { cle: "pack", libelle: "Pack de configuration" },
] as const;
type Onglet = (typeof ONGLETS)[number]["cle"];

function estOnglet(v: string | null): v is Onglet {
  return ONGLETS.some((o) => o.cle === v);
}

function Parametrage() {
  const router = useRouter();
  const params = useSearchParams();
  const ongletLu = params?.get("onglet") ?? null;
  const onglet: Onglet = estOnglet(ongletLu) ? ongletLu : "talk";
  const centreLu = Number(params?.get("centre"));
  const centreUrl = Number.isInteger(centreLu) && centreLu > 0 ? centreLu : undefined;

  const [centreTalk, setCentreTalk] = useState<number | undefined>(onglet === "konnect" ? undefined : centreUrl);
  const [centreKonnect, setCentreKonnect] = useState<number | undefined>(onglet === "konnect" ? centreUrl : undefined);

  const changer = useCallback(
    (suivant: Onglet) => {
      const centre = suivant === "konnect" ? centreKonnect : suivant === "talk" || suivant === "robot" ? centreTalk : undefined;
      router.replace(`/admin/parametrage?onglet=${suivant}${centre ? `&centre=${centre}` : ""}`, { scroll: false });
    },
    [router, centreTalk, centreKonnect]
  );

  return (
    <PageContainer title="Paramétrage d'un centre" description="Installer et régler un centre">
      <Box>
        <Tabs
          value={onglet}
          onChange={(_, v) => changer(v)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {ONGLETS.map((o) => (
            <Tab key={o.cle} value={o.cle} label={o.libelle} id={`onglet-${o.cle}`} />
          ))}
        </Tabs>
        {onglet === "talk" && <InstallationTalk centreInitial={centreTalk} onCentre={setCentreTalk} />}
        {onglet === "robot" && <ConfigurationRobot centreInitial={centreTalk} onCentre={setCentreTalk} />}
        {onglet === "konnect" && <InstallationKonnect centreInitial={centreKonnect} onCentre={setCentreKonnect} />}
        {onglet === "identifiants" && <IdentifiantsExternes />}
        {onglet === "pack" && <PackConfiguration />}
      </Box>
    </PageContainer>
  );
}

export default function PageParametrage() {
  return (
    <Suspense fallback={null}>
      <Parametrage />
    </Suspense>
  );
}
