  "use client";

  import React, { useState, useEffect } from "react";
  import {
    Box,
    AppBar,
    Toolbar,
    styled,
    IconButton,
    Badge,
    Menu,
    MenuItem,
    ListItemText,
    Typography,
    Select,
    MenuItem as MuiMenuItem,
  } from "@mui/material";
  import { useSession } from "next-auth/react";
  import { usePathname, useRouter } from "next/navigation";
  import { IconBellRinging, IconFileAlert, IconMenu, IconX } from "@tabler/icons-react";
  import Profile from "./Profile";
  import { useCentre, ManagedUser } from "../../../context/CentreContext";
  import { usePrescriptionAlertsCount } from "@/hooks/usePrescriptionAlertsCount";

  /**
   * Header d’application (barre supérieure).
   * Responsabilités :
   *  - Afficher le breadcrumb (placeholder).
   *  - Gérer les notifications (liste + marquer comme lues).
   *  - Exposer un sélecteur de centre (pour ADMIN_USER) via CentreContext.
   *  - Afficher le menu profil utilisateur.
   */
  type HeaderProps = {
    /** Action transmise par le layout pour ouvrir/fermer la sidebar en mobile. */
    toggleMobileSidebar: () => void;
  };

  /** Modèle de notification renvoyé par `/api/notification/get-unread`. */
  interface Notification {
    id: number;
    message: string;
    createdAt: string;
  }

  /** Styles locaux, scindés pour limiter le bruit dans le JSX. */
  const AppBarStyled = styled(AppBar)(({ theme }) => ({
    boxShadow: "none",
    background: theme.palette.background.paper,
    backdropFilter: "blur(4px)",
  }));

  const ToolbarStyled = styled(Toolbar)(({ theme }) => ({
    width: "100%",
    color: theme.palette.text.secondary,
  }));

  const Header = ({ toggleMobileSidebar }: HeaderProps) => {
    // --- Contexte session & navigation
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const isAdmin = session?.user?.role === "ADMIN";

    // --- État local (UI notifications)
    const [anchorNotif, setAnchorNotif] = useState<null | HTMLElement>(null);
    const [notifications, setNotifications] = useState<Notification[]>([]);
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
            ? products.find((p: any) => p?.name === "LyraeTalk")
            : null;
          setTalkProductId(talk?.id ?? null);
        })
        .catch(() => setTalkProductId(null));
    }, [status, isAdmin, session?.user?.id]);

    const prescriptionScopeUserProductId: number | null = isAdmin
      ? selectedCentre?.userProductId ?? null
      : talkProductId;

    const { count: prescriptionAlertsCount, thresholdHours } =
      usePrescriptionAlertsCount(prescriptionScopeUserProductId);

    /**
     * Naviguer vers la page ordonnances-manquantes en un clic depuis l'icone
     * du header, en préservant la structure d'URL selon le rôle.
     */
    const goToOrdonnances = () => {
      if (isAdmin) {
        const upid = selectedCentre?.userProductId;
        if (upid) router.push(`/admin/clients/${upid}/ordonnances-manquantes`);
      } else if (talkProductId) {
        router.push(`/client/services/talk/${talkProductId}/ordonnances-manquantes`);
      }
    };

    /**
     * Chargement des notifications non lues à l’authentification.
     * - Récupération côté serveur
     * - Stockage local pour affichage badge + popover
     */
    useEffect(() => {
      if (status !== "authenticated") return;

      fetch("/api/notification/get-unread")
        .then((res) => res.json())
        .then((data) => setNotifications(data.notifications || []))
        .catch(console.error);
    }, [status]);

    /** Ouvre le popover notifications. */
    const handleNotifClick = (e: React.MouseEvent<HTMLElement>) => {
      setAnchorNotif(e.currentTarget);
    };

    /** Ferme le popover notifications. */
    const handleNotifClose = () => setAnchorNotif(null);

    /**
     * Marque une notification comme lue (optimiste).
     * - Appel API pour mise à jour serveur
     * - Filtrage local pour mise à jour instantanée
     */
    const markAsRead = async (notifId: number) => {
      try {
        await fetch("/api/notification/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: notifId }),
        });
      } finally {
        setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      }
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
            sx={{ display: { lg: "none", xs: "inline" } }}
          >
            <IconMenu width={20} height={20} />
          </IconButton>

          {/* Zone breadcrumb (placeholder) */}
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {generateBreadcrumb()}
            </Typography>
          </Box>

          {/* Zone à droite : notifications, sélecteur de centre, profil */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
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
                    ? `${prescriptionAlertsCount} patient(s) sans ordonnance depuis > ${thresholdHours}h — clic pour voir la liste`
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

            {/* Notifications */}
            <IconButton
              size="large"
              color="inherit"
              onClick={handleNotifClick}
              aria-label="Voir les notifications"
            >
              <Badge variant={notifications.length > 0 ? "dot" : undefined} color="primary">
                <IconBellRinging size={21} stroke={1.5} />
              </Badge>
            </IconButton>

            {/* Identité + sélecteur de centre si applicable */}
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
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
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    color: "#48C8AF",
                    "& .MuiSelect-icon": { color: "#48C8AF", fontSize: 18 },
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
                      {session?.user?.role === "ADMIN" ? `${label} · ID: ${upid}` : label}
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

        {/* Popover de notifications */}
        <Menu
          anchorEl={anchorNotif}
          open={Boolean(anchorNotif)}
          onClose={handleNotifClose}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          PaperProps={{ sx: { width: 600, maxHeight: 400, p: 1 } }}
        >
          {notifications.length === 0 ? (
            <MenuItem>
              <ListItemText primary="Aucune notification" />
            </MenuItem>
          ) : (
            notifications.map((notif) => (
              <MenuItem
                key={notif.id}
                sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <ListItemText
                  primary={notif.message}
                  secondary={new Date(notif.createdAt).toLocaleString()}
                  sx={{ pr: 2 }}
                />
                <IconButton onClick={() => markAsRead(notif.id)} size="small" aria-label="Marquer comme lue">
                  <IconX size={16} />
                </IconButton>
              </MenuItem>
            ))
          )}
        </Menu>
      </AppBarStyled>
    );
  };

  export default Header;
