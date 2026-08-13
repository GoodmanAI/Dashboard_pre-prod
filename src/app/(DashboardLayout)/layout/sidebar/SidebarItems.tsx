"use client";

import React, { useState, useEffect } from "react";
import { Box, List } from "@mui/material";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Menuitems, { AdminMenuitems } from "./MenuItems";
import NavItem from "./NavItem";
import NavGroup from "./NavGroup";
import { useCentre } from "@/app/context/CentreContext";
import { usePrescriptionAlertsCount } from "@/hooks/usePrescriptionAlertsCount";
import { hasPermission } from "@/lib/permissions";
import { getPageFromHref } from "@/lib/pageAccess";
import { trouverProduit } from "@/lib/produits";

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
  badgeCount?: number;
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

  const isAdmin = session?.user.role === "ADMIN" || session?.user.role === "SUPER_ADMIN";

  // userProductId a passer au hook count :
  //  - ADMIN : userProductId du centre selectionne dans le CentreContext
  //  - CLIENT : id du produit "LyraeTalk" trouve dans les products du user
  const prescriptionScopeUserProductId: number | null = (() => {
    if (isAdmin) return selectedCentre?.userProductId ?? null;
    const talk: any = trouverProduit<any>(products, "talk");
    return talk?.id ?? null;
  })();

  const { count: prescriptionAlertsCount, thresholdHours } =
    usePrescriptionAlertsCount(prescriptionScopeUserProductId);

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

    // CLIENT : on utilise en priorite le userProductId du centre selectionne
    // (via CentreContext) pour supporter les CLIENT ADMIN_USER qui switchent
    // entre plusieurs centres via le selecteur du header.
    //
    // FIX 2026-08-05 : avant on ne regardait que products (fetch de /api/users/
    // [id]/products, qui retourne toujours les products du user CONNECTE),
    // donc pour un ADMIN_USER on rebasculait toujours sur son propre centre
    // (ex: Quimper) meme quand il avait selectionne Fouesnand dans le header.
    //
    // Priorite :
    //   1. selectedCentre.userProductId (venant de /api/admin/centres ADMIN)
    //   2. selectedCentre.userProducts[LyraeTalk].id (venant de /api/client
    //      ADMIN_USER — les managed users ont userProducts[] avec l'id)
    //   3. products[LyraeTalk].id (fallback pour CLIENT non-ADMIN_USER classique)
    const selectedTalkId =
      selectedCentre?.userProductId ??
      selectedCentre?.userProducts?.find(
        (p: any) => p?.product?.name?.includes("Talk")
      )?.id ??
      null;
    if (selectedTalkId) {
      return rawHref.replace("{TALK_ID}", String(selectedTalkId));
    }

    const talk: any = trouverProduit<any>(products, "talk");
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

    // Filtre par permissions granulaires (chantier 3, Lot B).
    // - Les headers de section (navlabel) restent visibles (peuvent contenir
    //   au moins un item accessible). On les nettoie apres coup.
    // - Les items sans page mapped (Support, Overview, Actions, etc.) sont
    //   toujours affiches si le role de base y a acces (ADMIN/SUPER_ADMIN
    //   ont deja acces a tout par role, CLIENT via la liste Menuitems).
    // - Les items avec page mapped : hidden si !hasPermission read.
    if (item.navlabel) return true;
    if (!item.href || !session?.user) return true;
    const page = getPageFromHref(item.href);
    if (!page) return true; // Item hors mapping = affiche par defaut
    return hasPermission(session.user as any, page, "read");
  });

  // Nettoyage : retire les headers de section (navlabel) qui n'ont plus
  // aucun item cliquable en dessous apres filtre permissions.
  const cleanedMenuItems = filteredMenuItems.filter((item, i, arr) => {
    if (!item.navlabel) return true;
    // Regarde s'il y a un item non-navlabel avant le prochain navlabel
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j].navlabel) return false;
      return true;
    }
    return false;
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
        {cleanedMenuItems.map((item: SideNavItem) => {
          // En-tête de section (ex: "Home", "Services")
          if (item.subheader) {
            return <NavGroup item={item} key={item.subheader} />;
          }

          const href = getDynamicHref(item);
          if (href === null) return null;
          const updatedItem: SideNavItem = { ...item, href: href ?? undefined };

          // Injecte le badge count pour l'item "Ordonnances manquantes"
          // (identifie via son titre car href resolu dynamiquement)
          if (item.title === "Ordonnances manquantes" && prescriptionAlertsCount > 0) {
            updatedItem.badgeCount = prescriptionAlertsCount;
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
