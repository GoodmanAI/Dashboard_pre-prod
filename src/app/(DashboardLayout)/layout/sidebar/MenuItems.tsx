import {
  IconTicket,
  IconFilePencil,
  IconLayoutDashboard,
  IconLogin,
  IconPhone
} from "@tabler/icons-react";

import { uniqueId } from "lodash";

const Menuitems = [
  {
    navlabel: true,
    subheader: "Home",
  },

  {
    id: uniqueId(),
    title: "Dashboard",
    icon: IconLayoutDashboard,
    href: "/client",
  },
  {
    navlabel: true,
    subheader: "Services",
  },
  {
    id: uniqueId(),
    title: "LYRAE © Explain + Satisfy",
    icon: IconFilePencil,
    href: "/client/services/explain",
  },
  {
    id: uniqueId(),
    title: "LYRAE © Talk",
    icon: IconPhone,
    href: "/client/services/talk",
  },
  {
    navlabel: true,
    subheader: "Support",
  },
  {
    id: uniqueId(),
    title: "Ticket",
    icon: IconTicket,
    href: "/client/ticket",
  },
];

export default Menuitems;
