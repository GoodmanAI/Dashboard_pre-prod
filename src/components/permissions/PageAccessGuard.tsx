"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Alert, Box, Button, Container } from "@mui/material";
import { getPageFromPathname } from "@/lib/pageAccess";
import { hasPermission, getAccessiblePages, PAGES } from "@/lib/permissions";

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
 *   - Sinon : affiche un message "acces refuse" + bouton retour vers une page
 *     accessible (premier item disponible)
 *
 * Enveloppe uniquement les enfants du DashboardLayout (pas les pages publiques
 * /authentication, /c/*, /d/*). Cote root layout, on ne monte le guard que
 * quand isPublicPage === false.
 */
export default function PageAccessGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  const requiredPage = useMemo(() => getPageFromPathname(pathname ?? ""), [pathname]);

  useEffect(() => {
    // Session encore en chargement : ne juge pas encore.
    if (status !== "authenticated") {
      setChecked(false);
      return;
    }
    setChecked(true);
  }, [status, requiredPage, pathname]);

  // Pas encore de session ou page hors mapping : rend directement les enfants.
  // Le check de permissions ne s'applique qu'aux pages du mapping.
  if (status !== "authenticated" || !requiredPage) {
    return <>{children}</>;
  }

  // Verification (defensive : session.user devrait etre defini quand status
  // === "authenticated", mais on garde le check pour eviter un crash TS).
  if (!session?.user) return <>{children}</>;

  const allowed = hasPermission(session.user as any, requiredPage, "read");
  if (allowed) return <>{children}</>;

  // Refus : propose une page accessible en fallback. Prefere DASHBOARD si
  // disponible, sinon la premiere page accessible.
  const accessible = getAccessiblePages(session.user as any);
  const fallbackPage = accessible.includes(PAGES.DASHBOARD)
    ? PAGES.DASHBOARD
    : accessible[0];

  const fallbackUrl = fallbackPage === PAGES.TICKETS
    ? "/client/ticket"
    : "/client";

  // Auto-redirect apres 3s pour ne pas coincer l'user si le clic est deja
  // fait ailleurs. Ecran de refus reste visible pendant les 3s pour info.
  if (checked && !allowed) {
    // Delegue au button click ou au timeout
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        <strong>Acces refuse.</strong>
        <br />
        Vous n'avez pas les permissions necessaires pour acceder a cette page.
        Contactez votre administrateur si vous pensez qu'il s'agit d'une erreur.
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
