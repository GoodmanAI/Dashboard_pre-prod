"use client";

import { Stack } from "@mui/material";
import TicketsClients from "@/pilot/ecrans/TicketsClients";
import { Vues } from "./ListeSupport";

/** Les demandes écrites par les clients (tickets du Dashboard), traitées par l'équipe dans Pilot. */
export function DemandesDesClients() {
  return <Stack spacing={2}>
    <Stack direction="row" justifyContent="flex-end"><Vues vue="clients" /></Stack>
    <TicketsClients cheminTicket={(id) => `/pilot/support/tickets/${id}`} />
  </Stack>;
}
