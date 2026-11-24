"use client";
import Button from "@mui/material/Button";

/** Télécharge tous les dossiers de l'équipe, toutes étapes, avec leurs contacts et leurs sites. */
export function BoutonExportProspects() {
  return <Button variant="outlined" component="a" href="/api/pilot/prospects/export.csv" download
    title="Tous les dossiers de l'équipe, toutes étapes, avec leurs contacts et leurs sites">Exporter en CSV</Button>;
}
