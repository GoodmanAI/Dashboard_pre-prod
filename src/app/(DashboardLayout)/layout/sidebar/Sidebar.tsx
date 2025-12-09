import { useEffect, useState } from "react";
import { useMediaQuery, Box, Drawer } from "@mui/material";
import { Theme } from "@mui/material/styles";
import { Sidebar } from "react-mui-sidebar";
import { useRouter } from 'next/navigation';
import SidebarItems from "./SidebarItems";
import { useSession } from "next-auth/react";
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
  const { data: session } = useSession();
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
    if (products) {
      products.forEach((product: any) => {
        if (product.name === "LyraeTalk") {
          setTalkId(product.id);
        }
      })
    }
  }, [products])

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
              themeSecondaryColor="#48C8AF"
              showProfile={false}
            >
              {/* Zone logo */}
              <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Box
                  component="img"
                  src="/images/logos/neuracorp_logo.png"
                  alt="Logo Neuracorp"
                  sx={{ width: "210px", height: "auto", cursor: "pointer" }}
                  onClick={() => router.push(`/client/services/talk/${talkId}`)}
                />
              </Box>

              {/* Navigation latérale */}
              <SidebarItems />
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
          themeSecondaryColor="#48C8AF"
          showProfile={false}
        >
          {/* Zone logo */}
          <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Box
              component="img"
              src="/images/logos/neuracorp_logo.png"
              alt="Logo Neuracorp"
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
