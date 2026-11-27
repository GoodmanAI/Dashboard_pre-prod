"use client";

import { useState } from "react";
import Link from "next/link";
import { Box, Button, Stack } from "@mui/material";
import { IconCircleCheck, IconLifebuoy, IconSend } from "@tabler/icons-react";
import { Bloc, EnTete } from "@/pilot/components/Bloc";
import { DialogueNouveauSujet, LigneSujetSupport } from "@/pilot/components/formulaires/Support";
import type { LigneSujet, VueSupport } from "@/pilot/lib/support/charger";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";

/** Les vues de la page Support : les sujets de l'équipe (les miens, tous), puis les demandes des clients (27/11/2026). */
export type VuePageSupport = VueSupport | "clients";
const LIBELLES_VUE: Record<VuePageSupport, string> = { "les-miens": "Sujets : les miens", tous: "Sujets : tous", clients: "Demandes des clients" };

export function Vues({ vue }: { vue: VuePageSupport }) {
  return <Box role="group" aria-label="Ce qui est affiché" sx={{ display: "inline-flex", flexWrap: "wrap", bgcolor: JETONS.segment, borderRadius: "10px", p: "2px" }}>
    {(Object.keys(LIBELLES_VUE) as VuePageSupport[]).map((v) => {
      const actif = v === vue;
      return <Box key={v} component={Link} href={`/pilot/support?vue=${v}`} aria-pressed={actif} sx={{
        display: "inline-flex", alignItems: "center", height: 30, px: 1.75, borderRadius: "8px", fontSize: 13, fontWeight: actif ? 600 : 500, whiteSpace: "nowrap",
        color: actif ? "text.primary" : "text.secondary", bgcolor: actif ? "background.paper" : "transparent", boxShadow: actif ? JETONS.ombreSegment : "none",
        transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`, "&&:hover": { color: "text.primary" },
      }}>{LIBELLES_VUE[v]}</Box>;
    })}
  </Box>;
}

/** Le support (25/11/2026) : ce qu'il faut dire aux clients, et ce qui l'a été. */
export function ListeSupport({ vue, donnees, clients }: {
  vue: VueSupport; donnees: { ouverts: LigneSujet[]; resolus: LigneSujet[] }; clients: { id: number; nom: string }[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const aTransmettre = donnees.ouverts.filter((s) => s.statut === "A_TRANSMETTRE");
  const enCours = donnees.ouverts.filter((s) => s.statut !== "A_TRANSMETTRE");
  const mes = vue === "les-miens";
  return <Stack spacing={2.5}>
    <EnTete titre="Support" sousTitre="Les sujets de l'équipe : ce que la technique a trouvé, ce que le commercial doit dire au client, et ce qui lui a été dit. Les demandes écrites par les clients sont dans l'onglet voisin.">
      <Vues vue={vue} />
      <Button variant="contained" onClick={() => setOuvert(true)}>Nouveau sujet</Button>
    </EnTete>
    <Bloc titre="À transmettre au client" icone={IconSend} teinte="orange" nombre={aTransmettre.length}
      vide={!aTransmettre.length && (mes ? "Rien à transmettre à vos clients." : "Rien à transmettre aux clients.")}>
      {aTransmettre.map((s) => <LigneSujetSupport key={s.id} sujet={s} />)}
    </Bloc>
    <Bloc titre="En cours" icone={IconLifebuoy} teinte="bleu" nombre={enCours.length}
      vide={!enCours.length && "Aucun sujet en cours. Ouvrez-en un quand un client remonte un problème."}>
      {enCours.map((s) => <LigneSujetSupport key={s.id} sujet={s} />)}
    </Bloc>
    <Bloc titre="Résolus récemment" icone={IconCircleCheck} teinte="vert" nombre={donnees.resolus.length} vide={!donnees.resolus.length && "Rien de résolu pour l'instant."}>
      {donnees.resolus.map((s) => <LigneSujetSupport key={s.id} sujet={s} />)}
    </Bloc>
    {ouvert && <DialogueNouveauSujet clients={clients} fermer={() => setOuvert(false)} />}
  </Stack>;
}
