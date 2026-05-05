import type { ElementType } from "react";
import {
  IconFilePencil,
  IconLayoutDashboard,
  IconPhone,
  IconLifebuoy,
  IconQuestionMark,
  IconAdjustmentsAlt,
  IconSettings,
  IconChartInfographic,
  IconDashboard,
  IconBolt,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { uniqueId } from "lodash";
import { useSession } from "next-auth/react";

/**
 * Typages des éléments de menu :
 * - NavLabel : en-tête de section non cliquable.
 * - MenuLink : entrée de navigation cliquable avec icône.
 */
type NavLabel = {
  navlabel: true;
  subheader: string;
};

type MenuLink = {
  id: string;
  title: string;
  icon: ElementType;
  href: string;
};

export type SidebarItem = NavLabel | MenuLink;

/**
 * Configuration centralisée du menu latéral (espace client).
 * ----------------------------------------------------------------
 * Rôle :
 *  - Définir de manière déclarative l’arborescence des entrées.
 *  - Garantir la cohérence des routes et des libellés.
 *  - Faciliter l’ajout/la suppression d’items sans toucher au rendu.
 *
 * Convention :
 *  - Les séparateurs de section utilisent `navlabel: true`.
 *  - Les éléments cliquables possèdent un `id` unique, un `title`,
 *    une `icon` Tabler et une `href` absolue vers la page cible.
 */

const Menuitems: SidebarItem[] = [
  // === Section : Accueil ===
  // { navlabel: true, subheader: "Home" },
  // {
  //   id: uniqueId(),
  //   title: "Dashboard",
  //   icon: IconLayoutDashboard,
  //   href: "/client",
  // },

  // // === Section : Services ===
  { navlabel: true, subheader: "Configuration" },
   {
    id: uniqueId(),
    title: "Mapping des examens",
    icon: IconFilePencil,
    href: "/client/services/talk/{TALK_ID}/parametrage/mapping_exam",
  },
  {
    id: uniqueId(),
    title: "Paramètres généraux",
    icon: IconSettings,
    href: "/client/services/talk/{TALK_ID}/parametrage",
  },
  {
    id: uniqueId(),
    title: "Module informationnel",
    icon: IconQuestionMark,
    href: "/client/services/talk/{TALK_ID}/informationnel",
  },
  {
    id: uniqueId(),
    title: "Questions par examen",
    icon: IconAdjustmentsAlt,
    href: "/client/services/talk/{TALK_ID}/parametrage/questions_exam"
  },
  { navlabel: true, subheader: "Statistiques" },
  {
    id: uniqueId(),
    title: "Liste des appels",
    icon: IconPhone,
    href: "/client/services/talk/{TALK_ID}/calls",
  },
  {
    id: uniqueId(),
    title: "Incidents",
    icon: IconAlertTriangle,
    href: "/client/services/talk/{TALK_ID}/incidents",
  },
  {
    id: uniqueId(),
    title: "Statistiques d'appels",
    icon: IconChartInfographic,
    href: "/client/services/talk/{TALK_ID}/stats_appel",
  },
  // {
  //   id: uniqueId(),
  //   title: "LYRAE © Explain + Satisfy",
  //   icon: IconFilePencil,
  //   href: "/client/services/explain",
  // },
  // {
  //   id: uniqueId(),
  //   title: "LYRAE © Talk (Radiologie)",
  //   icon: IconPhone,
  //   href: "/client/services/talk",
  // },
  // {
  //   id: uniqueId(),
  //   title: "LYRAE © Talk (Dentisterie)",
  //   icon: IconPhone,
  //   href: "/client/services/talk-dentist",
  // },

  // === Section : Assistance ===
  { navlabel: true, subheader: "Assistance" },
  {
    id: uniqueId(),
    title: "Support",
    icon: IconLifebuoy,
    href: "/client/ticket",
  },
];

/**
 * Menu dédié aux ADMIN : 2 catégories (Admin / Client).
 * - Section "Admin" : pages globales admin (overview, actions).
 * - Section "Client" : pages relatives au centre sélectionné (les `{TALK_ID}` sont résolus
 *   en URL `/admin/clients/{userProductId}/...` par `SidebarItems`).
 */
export const AdminMenuitems: SidebarItem[] = [
  { navlabel: true, subheader: "Admin" },
  {
    id: uniqueId(),
    title: "Overview",
    icon: IconDashboard,
    href: "/admin/overview",
  },
  {
    id: uniqueId(),
    title: "Actions",
    icon: IconBolt,
    href: "/admin/actions",
  },

  { navlabel: true, subheader: "Client" },
  {
    id: uniqueId(),
    title: "Mapping des examens",
    icon: IconFilePencil,
    href: "/client/services/talk/{TALK_ID}/parametrage/mapping_exam",
  },
  {
    id: uniqueId(),
    title: "Paramètres généraux",
    icon: IconSettings,
    href: "/client/services/talk/{TALK_ID}/parametrage",
  },
  {
    id: uniqueId(),
    title: "Module informationnel",
    icon: IconQuestionMark,
    href: "/client/services/talk/{TALK_ID}/informationnel",
  },
  {
    id: uniqueId(),
    title: "Questions par examen",
    icon: IconAdjustmentsAlt,
    href: "/client/services/talk/{TALK_ID}/parametrage/questions_exam",
  },
  {
    id: uniqueId(),
    title: "Liste des appels",
    icon: IconPhone,
    href: "/client/services/talk/{TALK_ID}/calls",
  },
  {
    id: uniqueId(),
    title: "Incidents",
    icon: IconAlertTriangle,
    href: "/client/services/talk/{TALK_ID}/incidents",
  },
  {
    id: uniqueId(),
    title: "Statistiques d'appels",
    icon: IconChartInfographic,
    href: "/client/services/talk/{TALK_ID}/stats_appel",
  },

  { navlabel: true, subheader: "Assistance" },
  {
    id: uniqueId(),
    title: "Support",
    icon: IconLifebuoy,
    href: "/admin/ticket",
  },
];

export default Menuitems;
