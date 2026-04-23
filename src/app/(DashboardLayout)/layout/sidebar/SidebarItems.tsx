"use client";

import React, { useState, useEffect } from "react";
import { Box, List } from "@mui/material";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Menuitems, { AdminMenuitems } from "./MenuItems";
import NavItem from "./NavItem";
import NavGroup from "./NavGroup";
import { useCentre } from "@/app/context/CentreContext";

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
  const pathDirect: any = pathname;
  const { data: session } = useSession();
  const userId = session?.user.id;
  const { selectedCentre } = useCentre();
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

  const isAdmin = session?.user.role === "ADMIN";

  /**
   * Résout le href d'un item contenant `{TALK_ID}` selon le rôle :
   * - ADMIN : préfixe `/admin/clients/{userProductId}` (centre courant du contexte).
   * - CLIENT : préfixe `/client/services/talk/{talkProductId}` (produit LyraeTalk).
   * Retourne `null` si on ne peut pas résoudre (item à masquer).
   */
  const resolveTalkHref = (rawHref: string): string | null => {
    if (isAdmin) {
      const id = selectedCentre?.userProductId;
      if (!id) return null;
      return rawHref
        .replace("/client/services/talk/", "/admin/clients/")
        .replace("{TALK_ID}", String(id));
    }
    const talk: any = products.find((el: any) => el.name === "LyraeTalk");
    if (!talk) return null;
    return rawHref.replace("{TALK_ID}", String(talk.id));
  };

  /**
   * Choix du menu selon le rôle :
   * - ADMIN : `AdminMenuitems` (Admin + Client + Assistance).
   * - CLIENT (ou autre) : `Menuitems` classique.
   */
  const sourceMenu: SideNavItem[] = isAdmin ? AdminMenuitems : Menuitems;

  const filteredMenuItems = sourceMenu.filter((item: SideNavItem) => {
    // Items LYRAE (démos produits) : masqués pour tous les rôles par défaut.
    if (item.title?.toUpperCase().includes("LYRAE")) return false;
    return true;
  });

  /**
   * Résolution de la destination des liens dépendants du rôle :
   * - "Dashboard" → /admin ou /client
   * - "Support" → /admin/ticket ou /client/ticket
   * - Items `{TALK_ID}` → résolus via `resolveTalkHref`
   * - Autres → href statique tel que défini dans MenuItems
   */
  const getDynamicHref = (item: SideNavItem): string | null | undefined => {
    if (!session) return item.href;

    if (item.title === "Dashboard") {
      return isAdmin ? "/admin" : "/client";
    }
    if (item.title === "Support") {
      return isAdmin ? "/admin/ticket" : "/client/ticket";
    }
    if (item.href?.includes("{TALK_ID}")) {
      return resolveTalkHref(item.href);
    }
    return item.href;
  };

  return (
    <Box sx={{ px: 3 }}>
      <List sx={{ pt: 0 }} className="sidebarNav" component="div">
        {filteredMenuItems.map((item: SideNavItem) => {
          // En-tête de section (ex: "Home", "Services")
          if (item.subheader) {
            return <NavGroup item={item} key={item.subheader} />;
          }

          const href = getDynamicHref(item);
          if (href === null) return null;
          const updatedItem = { ...item, href: href ?? undefined };

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
