"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Box } from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { useCentre } from "@/app/context/CentreContext";
import type { SlugProduit } from "@/lib/produits";
import { cheminSupport } from "@/lib/supportProduit";

/**
 * Ancienne adresse du support client, gardée pour les liens déjà envoyés (mail de
 * clôture d'un ticket). Le support vit sous chaque produit depuis le 28/10/2026 :
 * on renvoie vers celui de LyraeTalk si le centre l'a, sinon vers son seul produit.
 */
export default function AncienSupportClient() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { selectedCentre } = useCentre();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/authentication/signin");
      return;
    }
    if (status !== "authenticated" || !session?.user?.id) return;
    const userId = selectedCentre?.id ?? Number(session.user.id);
    fetch(`/api/centre/${userId}/produits`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const slugs: SlugProduit[] = Array.isArray(d?.produits)
          ? d.produits.map((p: { slug: SlugProduit }) => p.slug)
          : [];
        const produit = slugs.includes("talk") ? "talk" : (slugs[0] ?? "talk");
        router.replace(cheminSupport(userId, produit));
      })
      .catch(() => router.replace(cheminSupport(userId, "talk")));
  }, [status, session?.user?.id, selectedCentre?.id, router]);

  return (
    <PageContainer title="Support" description="Support">
      <Box />
    </PageContainer>
  );
}
