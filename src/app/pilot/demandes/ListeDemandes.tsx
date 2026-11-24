"use client";

import Link from "next/link";
import { Box, Stack } from "@mui/material";
import { IconCircleCheck, IconSend } from "@tabler/icons-react";
import { Bloc, EnTete } from "@/pilot/components/Bloc";
import { LigneDemande, type Moi } from "@/pilot/components/formulaires/Demandes";
import type { LigneDemande as Demande, VueDemandes } from "@/pilot/lib/demandes/charger";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";

const LIBELLES_VUE: Record<VueDemandes, string> = { "pour-moi": "Pour moi", envoyees: "Envoyées", toutes: "Toute l'équipe" };
const VIDES: Record<VueDemandes, string> = {
  "pour-moi": "Personne ne vous a rien demandé. Les demandes de vos collègues apparaîtront ici et sur Aujourd'hui.",
  envoyees: "Vous n'avez rien demandé. Depuis la fiche d'un client ou une étape de mise en service, utilisez « Demander à… ».",
  toutes: "Aucune demande en cours dans l'équipe.",
};

/** Contrôle segmenté à trois vues, comme sur iOS : des liens, la page se recharge sur la bonne vue. */
function Vues({ vue }: { vue: VueDemandes }) {
  return <Box role="group" aria-label="Demandes affichées" sx={{ display: "inline-flex", bgcolor: JETONS.segment, borderRadius: "10px", p: "2px" }}>
    {(Object.keys(LIBELLES_VUE) as VueDemandes[]).map((v) => {
      const actif = v === vue;
      return <Box key={v} component={Link} href={`/pilot/demandes?vue=${v}`} aria-pressed={actif} sx={{
        display: "inline-flex", alignItems: "center", height: 30, px: 1.75, borderRadius: "8px", fontSize: 13, fontWeight: actif ? 600 : 500, whiteSpace: "nowrap",
        color: actif ? "text.primary" : "text.secondary", bgcolor: actif ? "background.paper" : "transparent", boxShadow: actif ? JETONS.ombreSegment : "none",
        transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`, "&&:hover": { color: "text.primary" },
      }}>{LIBELLES_VUE[v]}</Box>;
    })}
  </Box>;
}

export function ListeDemandes({ vue, donnees, moi }: { vue: VueDemandes; donnees: { ouvertes: Demande[]; traitees: Demande[] }; moi: Moi }) {
  return <Stack spacing={2.5}>
    <EnTete titre="Demandes" sousTitre="Ce qu'on demande à un collègue de faire sur un client : rappeler, relancer EDL, tester les créneaux…">
      <Vues vue={vue} />
    </EnTete>
    <Bloc titre="À faire" icone={IconSend} teinte="violet" nombre={donnees.ouvertes.length} vide={!donnees.ouvertes.length && VIDES[vue]}>
      {donnees.ouvertes.map((d) => <LigneDemande key={d.id} demande={d} moi={moi} />)}
    </Bloc>
    <Bloc titre="Traitées récemment" icone={IconCircleCheck} teinte="vert" nombre={donnees.traitees.length} vide={!donnees.traitees.length && "Rien de traité pour l'instant."}>
      {donnees.traitees.map((d) => <LigneDemande key={d.id} demande={d} moi={moi} />)}
    </Bloc>
  </Stack>;
}
