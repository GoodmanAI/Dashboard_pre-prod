"use client";
import Link from "next/link";
import { Box, Button, Chip, Typography } from "@mui/material";
import type { Alerte, AcquittementAlerte } from "@/pilot/lib/alertes/types";
import { Ligne } from "./Bloc";
import { ActionsAlerte, ReactiverAlerte } from "./formulaires/ActionsAlerte";
import { ConfierAlerte } from "./formulaires/ConfierAlerte";

export type AcquittementAffiche = Omit<AcquittementAlerte, "jusquAu"> & { jusquAu: string };

/** « Qui agit : Projet · Julie » (C-91). Une alerte sans personne le dit. */
export function QuiAgit({ alerte }: { alerte: Alerte }) {
  const a = alerte.attribution;
  if (!a) return null;
  return <Typography variant="body2" sx={{ mt: 0.5, color: a.userId === null ? "error.main" : "text.primary" }} data-qui-agit={a.userId ?? ""}>
    Qui agit : {a.userId === null ? "personne, l'alerte attend d'être confiée" : `${a.poste} · ${a.nom}`}
    {a.manuelle && <Box component="span" sx={{ color: "text.secondary" }}>{a.par ? `, confiée par ${a.par}` : ", confiée à la main"}</Box>}
  </Typography>;
}

export function LigneAlerte({ alerte, acquittement, confier = false }: { alerte: Alerte; acquittement?: AcquittementAffiche; confier?: boolean }) {
  const bloquante = alerte.niveau === "bloquant";
  return <Ligne data-type-alerte={alerte.type}
    nom={<>
      <Chip color={acquittement ? "default" : bloquante ? "error" : "warning"} label={acquittement ? "Reportée" : bloquante ? "Bloquant" : "Attention"} sx={{ mr: 1 }} />
      {alerte.titre} · <Link href={alerte.lien}>{alerte.organisationNom}</Link>
    </>}
    detail={<>
      {alerte.detail}
      {alerte.aussi?.length ? <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.25 }} aria-label="Même cause">
        {alerte.aussi.map((s) => <li key={s.cle}>{s.titre} : {s.detail}</li>)}
      </Box> : null}
      <QuiAgit alerte={alerte} />
      {acquittement && <>
        <Typography variant="body2" color="text.secondary">Jusqu&apos;au {new Date(acquittement.jusquAu).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })} · {acquittement.auteur ?? "Compte supprimé"}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{acquittement.raison}</Typography>
      </>}
    </>}>
    {acquittement ? <ReactiverAlerte id={acquittement.id} /> : <ActionsAlerte alerte={alerte} />}
    {confier && <ConfierAlerte alerte={alerte} />}
    <Button component={Link} href={alerte.lien} variant="outlined">Ouvrir</Button>
  </Ligne>;
}
