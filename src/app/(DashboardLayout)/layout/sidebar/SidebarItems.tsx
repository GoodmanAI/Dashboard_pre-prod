"use client";

import React, { useState, useEffect } from "react";
import { Box, List } from "@mui/material";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Menuitems from "./MenuItems";
import NavItem from "./NavItem";
import NavGroup from "./NavGroup";

/** Modèle minimal d’un item de menu latéral. */
type SideNavItem = {
  id?: string;
  navlabel?: boolean;
  subheader?: string;
  title?: string;
  icon?: React.ElementType;
  href?: string;
  disabled?: boolean;
  external?: boolean;
};

/** Propriétés du composant SidebarItems. */
type SidebarItemsProps = {
  /** Callback déclenché lors d’un clic menu (utile pour fermer le drawer mobile). */
  toggleMobileSidebar?: (event: React.MouseEvent<HTMLElement>) => void;
};

/**
 * Liste des éléments du menu latéral.
 * - Filtre dynamiquement les entrées selon le rôle de l’utilisateur.
 * - Calcule certains liens en fonction du rôle (ex: Dashboard, Support).
 */
const SidebarItems: React.FC<SidebarItemsProps> = ({ toggleMobileSidebar }) => {
  const pathname = usePathname();
  const pathDirect = pathname;
  const { data: session } = useSession();
  const userId = session?.user.id;
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;

      const res = await fetch(`/api/users/${userId}/products`);
      const data = await res.json();
      setProducts(data);
    };

    load();
  }, [userId]);
  /**
   * Filtrage du menu selon le rôle :
   * - Pour les ADMIN, on masque le groupe "Services" ainsi que tous les items LYRAE.
   * - Pour les autres rôles, on conserve l’intégralité du menu.
   */
  const filteredMenuItems = Menuitems.filter((item: SideNavItem) => {
    if (session?.user.role === "ADMIN") {
      if (item.navlabel && item.subheader === "Services") return false;
      if (item.title?.toUpperCase().includes("LYRAE")) return false;
    } else {
      if (item.href && item.href.includes("{TALK_ID}")) {
        const talk: any = products.find((el: any) => el.name == "LyraeTalk");
        if (!talk) return false;
        const talkId = talk.id;
        item.href = item.href.replace("{TALK_ID}", talkId);
      }
    }
    return true;
  });

  /**
   * Résolution de la destination des liens dépendants du rôle :
   * - "Dashboard" → /admin ou /client
   * - "Support" → /admin/ticket ou /client/ticket
   * - Autres → href statique tel que défini dans MenuItems
   */
  const getDynamicHref = (item: SideNavItem): string | undefined => {
    if (!session) return item.href;

    if (item.title === "Dashboard") {
      return session.user.role === "ADMIN" ? "/admin" : "/client";
    }
    if (item.title === "Support") {
      return session.user.role === "ADMIN" ? "/admin/ticket" : "/client/ticket";
    }
    return item.href;
  };

  return (
    <Box sx={{ px: 3 }}>
      <List sx={{ pt: 0 }} className="sidebarNav" component="div">
        {filteredMenuItems.map((item: SideNavItem) => {
          const href = getDynamicHref(item);
          const updatedItem = { ...item, href };

          // En-tête de section (ex: "Home", "Services")
          if (item.subheader) {
            return <NavGroup item={item} key={item.subheader} />;
          }

          // Élément de navigation cliquable
          return (
            <NavItem
              item={updatedItem}
              key={item.id ?? `${item.title}-${href}`}
              pathDirect={pathDirect}
              onClick={toggleMobileSidebar ?? (() => {})}
            />
          );
        })}
      </List>
    </Box>
  );
};

export default SidebarItems;
