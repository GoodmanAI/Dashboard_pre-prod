"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Alert, Box, Button, Container } from "@mui/material";
import { getFirstAccessiblePath, getPageFromPathname } from "@/lib/pageAccess";
import { hasPermission } from "@/lib/permissions";
import { trouverProduit } from "@/lib/produits";

/**
 * PageAccessGuard (chantier 3, Lot B).
 * -----------------------------------------------------------------------------
 * Wrapper client qui garde les pages du dashboard selon les permissions
 * granulaires du user.
 *
 * Logique :
 *   - Deduit la PageKey de la pathname courante via getPageFromPathname
 *   - Si aucune page mapped (page utilitaire type /client/profile) : laisse
 *     passer (les permissions granulaires ne s'appliquent pas)
 *   - Si l'user a hasPermission(page, "read") : rend children
 *   - Sinon : affiche un message "acces refuse" + boutons de retour vers une
 *     page accessible (premiere page selon PAGE_PRIORITY, avec le vrai talkId
 *     du user resolu via /api/users/[id]/products — qui gere l'heritage
 *     parent pour les sous-comptes)
 *
 * Enveloppe uniquement les enfants du DashboardLayout (pas les pages publiques
 * /authentication, /c/*, /d/*). Cote root layout, on ne monte le guard que
 * quand isPublicPage === false.
 */
export default function PageAccessGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [talkId, setTalkId] = useState<number | null>(null);
  const userId = session?.user?.id;

  const requiredPage = useMemo(() => getPageFromPathname(pathname ?? ""), [pathname]);

  // Fetch talkId (userProductId LyraeTalk) pour construire le fallbackUrl
  // dynamiquement. Ne bloque pas l'affichage : on rend children des qu'on
  // a le verdict permissions, le talkId ne sert qu'au bouton de fallback.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}/products`);
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data)) {
          const talk = trouverProduit<any>(data, "talk");
          setTalkId(talk?.id ?? null);
        }
      } catch {
        // silencieux : fallback pointera juste vers /client
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Pas encore de session ou page hors mapping : rend directement les enfants.
  if (status !== "authenticated" || !requiredPage) {
    return <>{children}</>;
  }
  if (!session?.user) return <>{children}</>;

  const allowed = hasPermission(session.user as any, requiredPage, "read");
  if (allowed) return <>{children}</>;

  const fallbackUrl =
    getFirstAccessiblePath(session.user as any, talkId) ?? "/client";

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        <strong>Acces refuse.</strong>
        <br />
        Vous n&apos;avez pas les permissions necessaires pour acceder a cette page.
        Contactez votre administrateur si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
      </Alert>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button variant="contained" onClick={() => router.push(fallbackUrl)}>
          Retour au dashboard
        </Button>
        <Button variant="outlined" onClick={() => router.back()}>
          Retour precedent
        </Button>
      </Box>
    </Container>
  );
}
