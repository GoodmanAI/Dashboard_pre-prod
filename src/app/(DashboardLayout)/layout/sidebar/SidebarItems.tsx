import React from "react";
import Menuitems from "./MenuItems";
import { usePathname } from "next/navigation";
import { Box, List } from "@mui/material";
import NavItem from "./NavItem";
import NavGroup from "./NavGroup";
import { useSession } from "next-auth/react";

const SidebarItems = ({ toggleMobileSidebar }: any) => {
  const pathname = usePathname();
  const pathDirect = pathname;
  const { data: session } = useSession();

  const filteredMenuItems = Menuitems.filter((item) => {
    if (session?.user.role === "ADMIN") {
      if (
        (item.navlabel && item.subheader === "Services") ||
        (!item.navlabel && (item.title === "Lyrae Explain" || item.title === "Lyrae Talk"))
      ) {
        return false;
      }
    }
    return true;
  });

  const getDynamicHref = (item: any) => {
    if (session) {
      if (item.title === "Dashboard") {
        return session.user.role === "ADMIN" ? "/admin" : "/client";
      } else if (item.title === "Ticket") {
        return session.user.role === "ADMIN" ? "/admin/ticket" : "/client/ticket";
      }
    }
    return item.href;
  };

  return (
    <Box sx={{ px: 3 }}>
      <List sx={{ pt: 0 }} className="sidebarNav" component="div">
        {filteredMenuItems.map((item) => {
          const href = getDynamicHref(item);
          const updatedItem = { ...item, href };

          // {/********SubHeader**********/}
          if (item.subheader) {
            return <NavGroup item={item} key={item.subheader} />;

            // {/********If Sub Menu**********/}
            /* eslint no-else-return: "off" */
          } else {
            return (
              <NavItem
                item={updatedItem}
                key={item.id}
                pathDirect={pathDirect}
                onClick={toggleMobileSidebar}
              />
            );
          }
        })}
      </List>
    </Box>
  );
};
export default SidebarItems;