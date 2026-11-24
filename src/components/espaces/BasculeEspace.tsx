"use client";

import { Button, ListItemIcon, ListItemText, MenuItem, Tooltip } from "@mui/material";
import { IconLayoutDashboard, IconNavigation } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { adresseDansSonEspace } from "@/lib/espaces";

/**
 * La bascule entre le Dashboard et Pilot, pour les comptes internes seulement
 * (ADMIN et SUPER_ADMIN). Un lien simple, pas une navigation du routeur : en
 * production les deux espaces ont chacun leur hôte, et la session les suit
 * (cookie partagé, `src/lib/cookieSession.ts`).
 *
 * `forme="bouton"` dans un en-tête, `forme="menu"` dans un menu de profil.
 */
export function useBascule() {
  const { data: session } = useSession();
  const chemin = usePathname() ?? "";
  const role = session?.user?.role;
  const interne = role === "ADMIN" || role === "SUPER_ADMIN";
  const dansPilot = /^\/pilot(\/|$)/.test(chemin);
  const cible = dansPilot ? "/admin" : "/pilot";
  return {
    visible: interne,
    dansPilot,
    href: adresseDansSonEspace(cible, dansPilot),
    libelle: dansPilot ? "Dashboard" : "Pilot",
    aide: dansPilot ? "Ouvrir le Dashboard : outils et statistiques internes" : "Ouvrir Pilot : le suivi des clients",
  };
}

export default function BasculeEspace({ forme = "bouton", onClick }: { forme?: "bouton" | "menu"; onClick?: () => void }) {
  const b = useBascule();
  if (!b.visible) return null;
  const Icone = b.dansPilot ? IconLayoutDashboard : IconNavigation;
  if (forme === "menu") {
    return (
      <MenuItem component="a" href={b.href} onClick={onClick}>
        <ListItemIcon><Icone width={20} /></ListItemIcon>
        <ListItemText primary={`Ouvrir ${b.libelle}`} />
      </MenuItem>
    );
  }
  return (
    <Tooltip title={b.aide}>
      <Button
        component="a"
        href={b.href}
        variant="outlined"
        size="small"
        startIcon={<Icone size={18} stroke={1.8} />}
        aria-label={b.aide}
        sx={{ flexShrink: 0, borderRadius: 999, textTransform: "none", fontWeight: 600, whiteSpace: "nowrap" }}
      >
        {b.libelle}
      </Button>
    </Tooltip>
  );
}
