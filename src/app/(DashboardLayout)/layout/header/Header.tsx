  "use client";

  import React, { useEffect, useState } from "react";
  import {
    Box,
    AppBar,
    Toolbar,
    styled,
    IconButton,
    Badge,
    Typography,
    Select,
    MenuItem as MuiMenuItem,
  } from "@mui/material";
  import { useSession } from "next-auth/react";
  import { usePathname, useRouter } from "next/navigation";
  import { IconFileAlert, IconMenu } from "@tabler/icons-react";
  import Profile from "./Profile";
  import { useCentre, ManagedUser } from "../../../context/CentreContext";
  import { cheminCentre, lireCheminCentre } from "@/lib/cheminsCentre";
  import { usePrescriptionAlertsCount } from "@/hooks/usePrescriptionAlertsCount";
  import NotificationBell from "@/components/notifications/NotificationBell";
import { trouverProduit } from "@/lib/produits";
  import SelecteurProduit from "@/components/produits/SelecteurProduit";
  import BarreRecherche from "@/components/recherche/BarreRecherche";
  import PanneauRecherche from "@/components/recherche/PanneauRecherche";

  /**
   * Header d’application (barre supérieure).
   * Responsabilités :
   *  - Afficher un breadcrumb (placeholder pour l'instant).
   *  - Compteur d'ordonnances manquantes (raccourci vers la page dediee).
   *  - Sélecteur de centre (ADMIN_USER) via CentreContext.
   *  - Menu profil utilisateur.
   */
  type HeaderProps = {
    /** Action transmise par le layout pour ouvrir/fermer la sidebar en mobile. */
    toggleMobileSidebar: () => void;
  };

  /** Styles locaux, scindés pour limiter le bruit dans le JSX. */
  const AppBarStyled = styled(AppBar)(({ theme }) => ({
    boxShadow: "none",
    background: theme.palette.background.paper,
    backdropFilter: "blur(4px)",
  }));

  // Sur un téléphone (27/10/2026) : marges réduites et pas de retour à la ligne, la
  // barre doit tenir en 360 px sans que l'avatar sorte de l'écran.
  const ToolbarStyled = styled(Toolbar)(({ theme }) => ({
    width: "100%",
    color: theme.palette.text.secondary,
    gap: theme.spacing(0.5),
    [theme.breakpoints.down("sm")]: {
      paddingLeft: theme.spacing(1),
      paddingRight: theme.spacing(1),
    },
  }));

  const Header = ({ toggleMobileSidebar }: HeaderProps) => {
    // --- Contexte session & navigation
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";

    // --- Etat local
    const [talkProductId, setTalkProductId] = useState<number | null>(null);

    // --- Contexte centres (ADMIN_USER) : liste + centre sélectionné
    const { centres, selectedCentre, setSelectedCentreById } = useCentre();

    /**
     * Résolution du userProductId dont on veut afficher le compteur
     * d'alertes ordonnances :
     *  - ADMIN : centre courant sélectionné dans le header
     *  - CLIENT : produit LyraeTalk du user connecté (chargé une fois au mount)
     */
    useEffect(() => {
      if (status !== "authenticated" || isAdmin) return;
      const userId = session?.user?.id;
      if (!userId) return;
      fetch(`/api/users/${userId}/products`)
        .then((r) => r.json())
        .then((products) => {
          const talk = Array.isArray(products)
            ? trouverProduit<any>(products, "talk")
            : null;
          setTalkProductId(talk?.id ?? null);
        })
        .catch(() => setTalkProductId(null));
    }, [status, isAdmin, session?.user?.id]);

    /**
     * Le client dans lequel cherche la barre (recherche centrale, R0) : celui de l'URL
     * dans un écran de centre, sinon le compte connecté sur son accueil. Jamais une page
     * `/admin` : un admin cherche depuis la vue d'un client.
     */
    const rechercheUserId: number | null =
      lireCheminCentre(pathname)?.userId ??
      (!isAdmin && pathname?.startsWith("/client") && session?.user?.id
        ? Number(session.user.id)
        : null);

    const prescriptionScopeUserProductId: number | null = isAdmin
      ? selectedCentre?.userProductId ?? null
      : talkProductId;

    const { count: prescriptionAlertsCount, thresholdHours } =
      usePrescriptionAlertsCount(prescriptionScopeUserProductId);

    /**
     * Naviguer vers la page ordonnances-manquantes en un clic depuis l'icone
     * du header.
     *
     * L'URL porte le client depuis le chantier U (31/08/2026) : les deux rôles
     * partagent donc la même adresse, et il n'y a plus de préfixe à choisir.
     */
    const goToOrdonnances = () => {
      const userId = selectedCentre?.id ?? session?.user?.id;
      if (userId) router.push(cheminCentre(userId, "talk", "ordonnances-manquantes"));
    };

    /**
     * Génère le breadcrumb depuis `pathname`.
     * Remplacer par une implémentation métier dès que nécessaire.
     */
    const generateBreadcrumb = () => {
      const segments = pathname?.split("/").filter(Boolean);
      if (segments && segments[0] === "client") segments[0] = "Home";
      return []; // TODO: implémenter un vrai breadcrumb si requis
    };

    return (
      <AppBarStyled position="sticky" color="default">
        <ToolbarStyled>
          {/* Bouton de menu (affichage mobile) */}
          <IconButton
            color="inherit"
            aria-label="menu"
            onClick={toggleMobileSidebar}
            // `inline-flex` et non `inline` : en `inline`, le bouton gardait la hauteur
            // d'une ligne de texte et l'icône débordait sur le sélecteur de produit.
            sx={{ display: { lg: "none", xs: "inline-flex" } }}
          >
            <IconMenu width={20} height={20} />
          </IconButton>

          {/* Bascule entre produits, calee a gauche : c'est le contexte de tout
              ce qui est affiche en dessous, donc la premiere chose qu'on lit.
              Invisible pour un client mono-produit. */}
          <SelecteurProduit />

          {/* Recherche centrale : petite barre, Ctrl+K, et le panneau commun aux deux barres */}
          {rechercheUserId !== null && (
            <Box id="tuto_recherche" sx={{ ml: { xs: 0.5, md: 2 } }}>
              <BarreRecherche variante="entete" />
            </Box>
          )}
          <PanneauRecherche userId={rechercheUserId} />

          {/* Zone breadcrumb (placeholder) */}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {generateBreadcrumb()}
            </Typography>
          </Box>

          {/* Zone à droite : notifications support, compteur ordonnances, sélecteur de centre, profil */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 2 }, minWidth: 0 }}
          >
            {/* Cloche notifications support (tickets : nouveau message, prise en charge, resolution) */}
            <NotificationBell />

            {/* Compteur ordonnances manquantes — clic = raccourci vers la page */}
            {prescriptionScopeUserProductId !== null && (
              <IconButton
                size="large"
                color="inherit"
                onClick={goToOrdonnances}
                aria-label={
                  prescriptionAlertsCount > 0
                    ? `${prescriptionAlertsCount} ordonnance(s) manquante(s) depassant le seuil de ${thresholdHours}h`
                    : "Aucune ordonnance en attente"
                }
                title={
                  prescriptionAlertsCount > 0
                    ? `${prescriptionAlertsCount} patient(s) sans ordonnance depuis > ${thresholdHours}h : clic pour voir la liste`
                    : `Aucun patient en attente au-delà du seuil de ${thresholdHours}h`
                }
              >
                <Badge
                  badgeContent={
                    prescriptionAlertsCount > 99
                      ? "99+"
                      : prescriptionAlertsCount || undefined
                  }
                  color="error"
                  overlap="circular"
                >
                  <IconFileAlert size={21} stroke={1.5} />
                </Badge>
              </IconButton>
            )}

            {/* Identité + sélecteur de centre si applicable */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                minWidth: 0,
                // Le sélecteur de centre se tronque plutôt que de pousser l'avatar
                // hors de l'écran.
                maxWidth: { xs: 120, sm: 260 },
              }}
            >
              <Typography
                variant="body1"
                noWrap
                sx={{ fontWeight: 600, maxWidth: "100%", display: { xs: "none", sm: "block" } }}
              >
                {session?.user?.name ?? session?.user?.email}
              </Typography>

              {(centres.length > 0 && selectedCentre) && (
                <>
                <Select
                  value={(
                    selectedCentre?.userProductId ??
                    selectedCentre?.userProducts?.find((e: any) =>
                      e?.product?.name?.includes("Talk")
                    )?.id ??
                    ""
                  ).toString()}
                  onChange={(e) => setSelectedCentreById(Number(e.target.value))}
                  variant="standard"
                  disableUnderline
                  displayEmpty
                  aria-label="Sélection de centre"
                  sx={{
                    maxWidth: "100%",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    color: "var(--accent)",
                    "& .MuiSelect-select": { overflow: "hidden", textOverflow: "ellipsis" },
                    "& .MuiSelect-icon": { color: "var(--accent)", fontSize: 18 },
                  }}
                >
                {centres.map((c: any) => {
                  const upid =
                    c.userProductId ??
                    c.userProducts?.find((e: any) =>
                      e?.product?.name?.includes("Talk")
                    )?.id;
                  const label = c.name ?? c.email;
                  return (
                    <MuiMenuItem
                      key={upid}
                      value={upid}
                      sx={{ fontWeight: 500, fontSize: "0.85rem" }}
                    >
                      {(session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") ? `${label} · ID: ${upid}` : label}
                    </MuiMenuItem>
                  );
                })}
                </Select>
                </>
              )}
            </Box>

            {/* Menu profil (avatar, déconnexion, etc.) */}
            <Profile />
          </Box>
        </ToolbarStyled>
      </AppBarStyled>
    );
  };

  export default Header;
