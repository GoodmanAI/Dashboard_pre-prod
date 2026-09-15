"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Alert, Box, Button, Container } from "@mui/material";
import { getFirstAccessiblePath, verdictAcces } from "@/lib/pageAccess";
import { hasPermission } from "@/lib/permissions";
import { trouverProduit } from "@/lib/produits";

/**
 * PageAccessGuard (chantier 3, Lot B).
 * -----------------------------------------------------------------------------
 * Wrapper client qui garde les pages du dashboard selon les permissions
 * granulaires du user.
 *
 * Logique, revue le 15/09/2026 avec l'inversion du defaut :
 *   - `verdictAcces` classe le chemin en page / admin / exempt / inconnu
 *   - `page`    : rend les enfants si hasPermission(page, "read")
 *   - `admin`   : rend les enfants si le ROLE est ADMIN ou SUPER_ADMIN, jamais
 *                 sur un droit par page
 *   - `exempt`  : rend les enfants (connexion, profil, pages patient)
 *   - `inconnu` : REFUSE. C'est le changement. Avant, un chemin non reconnu
 *                 laissait passer, et c'est ce defaut ouvrant qui a laisse les
 *                 treize ecrans Konnect hors du modele de droits sans que rien ne
 *                 le signale.
 *   - Refus : message + retour vers la premiere page accessible (PAGE_PRIORITY,
 *     avec le vrai talkId resolu via /api/users/[id]/products, qui gere
 *     l'heritage parent pour les sous-comptes)
 *
 * ⚠️ **Cette garde est cote navigateur.** Elle ferme l'ecran et le menu, pas l'API :
 * les routes portent leur propre `requirePagePermission` depuis le 14/09/2026. Les
 * deux couches sont necessaires et aucune ne remplace l'autre.
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

  const verdict = useMemo(() => verdictAcces(pathname ?? ""), [pathname]);

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

  // Pas encore de session : on laisse le rendu se faire, la redirection vers la page
  // de connexion est l'affaire du middleware.
  if (status !== "authenticated" || !session?.user) {
    return <>{children}</>;
  }

  const role = (session.user as any)?.role;

  const fallbackUrl =
    getFirstAccessiblePath(session.user as any, (session.user as any)?.id ?? null) ?? "/client";

  const refus = (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        <strong>Accès refusé.</strong>
        <br />
        Vous n&apos;avez pas les droits pour ouvrir cette page. Demandez-les à votre
        administrateur si vous pensez que c&apos;est une erreur.
      </Alert>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button variant="contained" onClick={() => router.push(fallbackUrl)}>
          Retour à l&apos;accueil
        </Button>
        <Button variant="outlined" onClick={() => router.back()}>
          Page précédente
        </Button>
      </Box>
    </Container>
  );

  // Ecran explicitement hors du modele de droits (connexion, profil, pages patient).
  if (verdict.genre === "exempt") return <>{children}</>;

  // Espace d'administration : c'est le ROLE qui decide, jamais un droit par page. Le
  // middleware et `src/app/admin/layout.tsx` le gardent deja cote serveur ; ce test est
  // la troisieme couche, et il coute une comparaison.
  if (verdict.genre === "admin") {
    if (role === "ADMIN" || role === "SUPER_ADMIN") return <>{children}</>;
    return refus;
  }

  // Chemin inconnu : REFUS depuis le 15/09/2026, alors qu'il passait auparavant.
  // Un ecran non declare dans `PATH_MATCHERS` ni dans `CHEMINS_EXEMPTS` est un oubli,
  // et le laisser passer revient a le livrer sans protection en silence. C'est
  // exactement ce qui est arrive aux treize ecrans Konnect. Le refus se voit tout de
  // suite, en developpement, avant d'atteindre un client.
  if (verdict.genre === "inconnu") return refus;

  const allowed = hasPermission(session.user as any, verdict.page, "read");
  if (allowed) return <>{children}</>;

  return refus;
}
