"use client";

import React, { useState, useEffect } from "react";
import { Box, List } from "@mui/material";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Menuitems, { AdminMenuitems, KonnectMenuitems } from "./MenuItems";
import NavItem from "./NavItem";
import NavGroup from "./NavGroup";
import { useCentre } from "@/app/context/CentreContext";
import { usePrescriptionAlertsCount } from "@/hooks/usePrescriptionAlertsCount";
import { hasPermission } from "@/lib/permissions";
import { getPageFromHref } from "@/lib/pageAccess";
import { trouverProduit, ORDRE_PRODUITS, PRODUITS, type SlugProduit } from "@/lib/produits";
import { lireCheminCentre } from "@/lib/cheminsCentre";

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
   * Le produit affiché se déduit de l'URL et non d'un état mémorisé : un lien
   * partagé doit ouvrir le bon menu.
   *
   * VAUT AUSSI POUR UN ADMIN depuis le 31/08/2026. Il navigue par centre, mais une
   * fois DANS un centre il regarde forcément un produit : lui laisser le menu de
   * LyraeTalk pendant qu'il consulte un portail Konnect n'a pas de sens, et c'est
   * ce qui l'obligeait à connaître les chemins de mémoire.
   *
   * L'URL nomme le produit dans les deux formes encore en circulation :
   * `/client/c/{userId}/{segment}` (forme cible du chantier U) et
   * `/client/services/{segment}/{id}` (forme historique, que des liens déjà
   * envoyés portent encore et qui redirige vers la première).
   */
  const produitAffiche: SlugProduit | null = (() => {
    const cible = lireCheminCentre(pathname);
    if (cible) return cible.produit;

    const parts = pathname?.split("/") ?? [];
    if (parts[1] === "client" && parts[2] === "services") {
      return ORDRE_PRODUITS.find((slug) => PRODUITS[slug].segment === parts[3]) ?? null;
    }
    return null;
  })();

  /**
   * Résout le href d'un item contenant `{USER_ID}`.
   *
   * ON CHERCHE LE CLIENT, plus son affiliation à un produit. C'est tout le gain du
   * chantier U : il n'y a plus qu'un identifiant à trouver, le même quel que soit
   * le produit, alors qu'il fallait avant distinguer la ligne `UserProduct` de
   * Konnect de celle de Talk sous peine d'envoyer sur le mauvais produit.
   *
   * Trois sources, dans cet ordre :
   * 1. l'URL, qui le porte déjà et reste vraie avant même que le moindre fetch
   *    n'ait répondu ;
   * 2. le centre sélectionné, pour un admin qui arrive par une page `/admin/…`,
   *    et pour un CLIENT `ADMIN_USER` qui gère plusieurs centres. Ce second cas
   *    est la raison d'être de cette source : sans elle, un gestionnaire qui a
   *    choisi Fouesnant dans le sélecteur du header voyait le menu le ramener sur
   *    Quimper, son propre centre, à chaque clic (constaté le 05/08/2026) ;
   * 3. la session, pour un client ordinaire, dont le `userId` est le sien.
   */
  const resolveUserIdHref = (rawHref: string): string | null => {
    const userId =
      lireCheminCentre(pathname)?.userId ??
      selectedCentre?.id ??
      session?.user?.id ??
      null;
    if (userId === null) return null;
    return rawHref.replace("{USER_ID}", String(userId));
  };

  /**
   * Les entrées PUREMENT administratives : tout ce qui précède la section
   * « Client » d'`AdminMenuitems`. Ce menu mélange en effet les deux, et un admin
   * qui regarde un portail Konnect doit garder ses pages à lui sans hériter de
   * celles du robot vocal.
   *
   * Découpé sur le libellé de section plutôt que sur un index : ajouter une entrée
   * admin ne doit pas casser ce partage.
   */
  const entreesAdmin: SideNavItem[] = (() => {
    const i = AdminMenuitems.findIndex(
      (it: SideNavItem) => it.navlabel === true && it.subheader === "Client"
    );
    return i === -1 ? AdminMenuitems : AdminMenuitems.slice(0, i);
  })();

  /**
   * Choix du menu, selon le rôle ET le produit regardé :
   * - ADMIN hors d'un centre : `AdminMenuitems`, ses pages à lui.
   * - ADMIN dans un centre Konnect : ses pages, puis celles du portail.
   * - ADMIN dans un centre Talk : `AdminMenuitems`, qui les porte déjà.
   * - CLIENT : le menu de son produit.
   */
  const sourceMenu: SideNavItem[] = !isAdmin
    ? produitAffiche === "konnect"
      ? KonnectMenuitems
      : Menuitems
    : produitAffiche === "konnect"
      ? [...entreesAdmin, ...KonnectMenuitems]
      : AdminMenuitems;

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
   * - Items `{USER_ID}` → résolus via `resolveUserIdHref`
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
    if (item.href?.includes("{USER_ID}")) {
      return resolveUserIdHref(item.href);
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
