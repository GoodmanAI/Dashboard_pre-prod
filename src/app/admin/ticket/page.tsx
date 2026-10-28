"use client";

import SupportAdmin from "@/components/tickets/SupportAdmin";

/** Console du support : les tickets de tous les produits, filtrables par produit. */
export default function AdminSupportPage() {
  return <SupportAdmin cheminTicket={(id) => `/admin/ticket/${id}`} />;
}
