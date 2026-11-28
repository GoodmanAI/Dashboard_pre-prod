"use client";

import TicketsClients from "@/pilot/ecrans/TicketsClients";
import { Vues } from "./ListeSupport";

/** Les demandes écrites par les clients (tickets du Dashboard), traitées par l'équipe dans Pilot. */
export function DemandesDesClients() {
  return <TicketsClients cheminTicket={(id) => `/pilot/support/tickets/${id}`} entete={<Vues vue="clients" />} />;
}
