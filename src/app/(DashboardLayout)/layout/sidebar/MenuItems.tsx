import {
  IconTicket,
  IconFilePencil,
  IconLayoutDashboard,
  IconLogin,
  IconPhone,
  IconAdjustmentsAlt,
  IconLifebuoy
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
    title: "LYRAE © Talk (Radiologie)",
    icon: IconPhone,
    href: "/client/services/talk",
  },
  {
    id: uniqueId(),
    title: "LYRAE © Talk (Dentisterie)",
    icon: IconPhone,
    href: "/client/services/talk-dentist",
  },
  {
    navlabel: true,
    subheader: "Assistance",
  },
  {
    id: uniqueId(),
    title: "Support",
    icon: IconLifebuoy,
    href: "/client/ticket",
  },
  {
    id: uniqueId(),
    title: "Paramètres",
    icon: IconAdjustmentsAlt,
    href: "/client/settings",
  },
];

export default Menuitems;
