import { useEffect, useState } from "react";
import { useProduitActif } from "@/hooks/useProduitActif";
import { useMediaQuery, Box, Drawer } from "@mui/material";
import { Theme } from "@mui/material/styles";
import { Sidebar } from "react-mui-sidebar";
import { usePathname, useRouter } from 'next/navigation';
import SidebarItems from "./SidebarItems";
import { useSession } from "next-auth/react";
import { estProduit } from "@/lib/produits";
import { cheminCentre, lireCheminCentre } from "@/lib/cheminsCentre";
/**
 * Propriétés du composant MSidebar.
 * - `isMobileSidebarOpen` : état d’ouverture du tiroir sur mobiles.
 * - `onSidebarClose` : callback déclenché à la fermeture du tiroir mobile.
 * - `isSidebarOpen` : état d’ouverture du panneau latéral sur desktop.
 */
interface ItemType {
  isMobileSidebarOpen: boolean;
  onSidebarClose: (event: React.MouseEvent<HTMLElement>) => void;
  isSidebarOpen: boolean;
}

/**
 * Barre latérale applicative (desktop + mobile).
 * - Utilise un Drawer permanent sur desktop et temporaire sur mobile.
 * - Encapsule le composant `react-mui-sidebar` pour le rendu et la logique de collapse.
 * - Centralise la configuration (largeur, couleurs, scrollbars) pour un thème cohérent.
 */
const MSidebar = ({ isMobileSidebarOpen, onSidebarClose, isSidebarOpen }: ItemType) => {
  // Point de coupure pour basculer entre desktop et mobile
  
  const lgUp = useMediaQuery((theme: Theme) => theme.breakpoints.up("lg"));
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  // Logo et couleur d'accent suivent le produit affiché : la sidebar est rendue
  // par le layout parent, elle resterait sinon aux couleurs de LyraeTalk.
  const produit = useProduitActif();
  const [products, setProducts] = useState([]);
  const [talkId, setTalkId] = useState([]);

  const userId = session?.user.id;

  useEffect(() => {
    const load = async () => {
      if (!userId) return;

      const res = await fetch(`/api/users/${userId}/products`);
      const data = await res.json();
      setProducts(data);
    };

    load();
  }, [userId]);

  useEffect(() => {
    if (products && Array.isArray(products)) {
      products.forEach((product: any) => {
        if (estProduit(product?.name, "talk")) {
          setTalkId(product.id);
        }
      })
    }
  }, [products])

  /**
   * Où mène le clic sur le logo.
   *
   * Un admin retourne à sa console. Un client retourne à l'accueil du produit
   * qu'il est en train de consulter : cliquer sur le logo Konnect pour atterrir
   * sur LyraeTalk serait déroutant, d'autant que le logo porte maintenant la
   * couleur du produit.
   *
   * L'identifiant vient de l'URL courante, qui désigne déjà le bon centre. On
   * retombe sur le `userProductId` de LyraeTalk hors des pages produit, ou si
   * l'URL n'en porte pas : c'est le cas de la quasi-totalité des clients.
   */
  const accueilProduit = () => {
    if (session?.user.role === "ADMIN" || session?.user.role === "SUPER_ADMIN") {
      return "/admin";
    }
    // URL par client (chantier U) : l'accueil du produit est le chemin lui-même,
    // sans sous-chemin. Rien à reconstruire, tout est déjà dans l'adresse.
    const cible = lireCheminCentre(pathname);
    if (cible) return cheminCentre(cible.userId, cible.produit);

    const segments = pathname?.split("/") ?? [];
    const idDansUrl = segments[3] === produit.segment ? segments[4] : undefined;
    return `/client/services/${produit.segment}/${idDansUrl ?? talkId}`;
  };

  // Largeur fixe du panneau latéral
  const sidebarWidth = "270px";

  // Styles de barre de défilement compacts (WebKit)
  const scrollbarStyles = {
    "&::-webkit-scrollbar": { width: "7px" },
    "&::-webkit-scrollbar-thumb": { backgroundColor: "#eff2f7", borderRadius: "15px" },
  };

  // ----- Affichage desktop (Drawer permanent) -----
  if (lgUp) {
    return (
      <Box sx={{ width: sidebarWidth, flexShrink: 0 }}>
        <Drawer
          anchor="left"
          open={isSidebarOpen}
          variant="permanent"
          PaperProps={{ sx: { boxSizing: "border-box", ...scrollbarStyles } }}
        >
          <Box sx={{ height: "100%" }}>
            <Sidebar
              width={sidebarWidth}
              collapsewidth="80px"
              open={isSidebarOpen}
              themeColor="#5d87ff"
              themeSecondaryColor={produit.accent.principal}
              showProfile={false}
            >
              {/* Zone logo */}
              <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Box
                  component="img"
                  src={produit.interface.principal}
                  alt={produit.libelle}
                  sx={{ width: "210px", height: "auto", cursor: "pointer" }}
                  onClick={() => router.push(accueilProduit())}
                />
              </Box>

              {/* Navigation latérale */}
              {(session?.user.role === "ADMIN" || session?.user.role === "SUPER_ADMIN" || products.length > 0) &&
                <SidebarItems />
              }
            </Sidebar>
          </Box>
        </Drawer>
      </Box>
    );
  }

  // ----- Affichage mobile (Drawer temporaire) -----
  return (
    <Drawer
      anchor="left"
      open={isMobileSidebarOpen}
      onClose={onSidebarClose}
      variant="temporary"
      PaperProps={{ sx: (theme) => ({ boxShadow: theme.shadows[8], ...scrollbarStyles }) }}
    >
      <Box px={2}>
        <Sidebar
          width={sidebarWidth}
          collapsewidth="80px"
          isCollapse={false}
          mode="light"
          direction="ltr"
          themeColor="#5d87ff"
          themeSecondaryColor={produit.accent.principal}
          showProfile={false}
        >
          {/* Zone logo */}
          <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Box
              component="img"
              src={produit.interface.principal}
              alt={produit.libelle}
              sx={{ width: "210px", height: "auto" }}
            />
          </Box>

          {/* Navigation latérale */}
          <SidebarItems />
        </Sidebar>
      </Box>
    </Drawer>
  );
};

export default MSidebar;
