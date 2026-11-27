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
  IconChartHistogram,
  IconCalendarOff,
  IconMessage2,
  IconFileAlert,
  IconHourglass,
  IconChecklist,
  IconListDetails,
  IconUserPlus,
  IconFileSpreadsheet,
  IconUsers,
  IconMapPin,
  IconPhoneCall,
  IconSortAscending,
  IconArrowsJoin,
  IconClockHour4,
  IconAbc,
  IconShieldCheck,
  IconKey,
  IconScan,
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
    title: "Correspondance des examens",
    icon: IconFilePencil,
    href: "/client/c/{USER_ID}/talk/parametrage/mapping_exam",
  },
  {
    id: uniqueId(),
    title: "Paramètres généraux",
    icon: IconSettings,
    href: "/client/c/{USER_ID}/talk/parametrage",
  },
  {
    id: uniqueId(),
    title: "Questions fréquentes",
    icon: IconQuestionMark,
    href: "/client/c/{USER_ID}/talk/informationnel",
  },
  {
    id: uniqueId(),
    title: "Questions par examen",
    icon: IconAdjustmentsAlt,
    href: "/client/c/{USER_ID}/talk/parametrage/questions_exam"
  },
  { navlabel: true, subheader: "Statistiques" },
  {
    id: uniqueId(),
    title: "Liste des appels",
    icon: IconPhone,
    href: "/client/c/{USER_ID}/talk/calls",
  },
  {
    id: uniqueId(),
    title: "Statistiques d'appels",
    icon: IconChartInfographic,
    href: "/client/c/{USER_ID}/talk/stats_appel",
  },
  {
    id: uniqueId(),
    title: "Examens non couverts",
    icon: IconCalendarOff,
    href: "/client/c/{USER_ID}/talk/planning-complet",
  },
  {
    id: uniqueId(),
    title: "Rendez-vous non honorés",
    icon: IconMessage2,
    href: "/client/c/{USER_ID}/talk/stats-no-show",
  },
  {
    id: uniqueId(),
    title: "Ordonnances manquantes",
    icon: IconFileAlert,
    href: "/client/c/{USER_ID}/talk/ordonnances-manquantes",
  },
  {
    id: uniqueId(),
    title: "Incidents",
    icon: IconAlertTriangle,
    href: "/client/c/{USER_ID}/talk/incidents",
  },
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
    href: "/client/c/{USER_ID}/talk/support",
  },
];

/**
 * Menu dédié aux ADMIN : 2 catégories (Admin / Client).
 * - Section "Admin" : pages globales admin (overview, actions).
 * - Section "Client" : pages relatives au centre sélectionné (les `{USER_ID}` sont
 *   résolus par `SidebarItems`).
 *
 * Ces entrées pointent vers `/client/c/...`, la même adresse que celle du client,
 * et non plus vers un `/admin/clients/...` qui n'était qu'un ré-export des mêmes
 * écrans. Ce qu'un admin voit de plus lui vient de sa session et de ce menu, pas
 * de son URL.
 */
// Parc clients, Facturation et Déploiements sont passés dans Pilot le 23/11/2026
// (plan lyrae/plans/2026-11-pilot-dans-le-dashboard.md) : bouton « Pilot » du header.
export const AdminMenuitems: SidebarItem[] = [
  // Deux blocs depuis le 27/11/2026 (plan lyrae/plans/2026-11-separation-dashboard-pilot.md) :
  // l'exploitation technique, puis les clients (leurs comptes, le paramétrage d'un centre).
  // Les assistants « Nouveau centre » partent de « Clients et comptes ». Le support des
  // clients se traite dans Pilot.
  { navlabel: true, subheader: "Exploitation" },
  {
    id: uniqueId(),
    title: "Vue d'ensemble",
    icon: IconDashboard,
    href: "/admin/overview",
  },
  {
    id: uniqueId(),
    title: "Statistiques produit",
    icon: IconChartHistogram,
    href: "/admin/analytics-internal",
  },
  {
    id: uniqueId(),
    title: "OCR de Konnect",
    icon: IconScan,
    href: "/admin/konnect-ocr",
  },
  { navlabel: true, subheader: "Clients" },
  {
    id: uniqueId(),
    title: "Clients et comptes",
    icon: IconUsers,
    href: "/admin/comptes",
  },
  {
    id: uniqueId(),
    title: "Paramétrage d'un centre",
    icon: IconAdjustmentsAlt,
    href: "/admin/parametrage",
  },
  { navlabel: true, subheader: "Client" },
  {
    id: uniqueId(),
    title: "Correspondance des examens",
    icon: IconFilePencil,
    href: "/client/c/{USER_ID}/talk/parametrage/mapping_exam",
  },
  {
    id: uniqueId(),
    title: "Paramètres généraux",
    icon: IconSettings,
    href: "/client/c/{USER_ID}/talk/parametrage",
  },
  {
    id: uniqueId(),
    title: "Questions fréquentes",
    icon: IconQuestionMark,
    href: "/client/c/{USER_ID}/talk/informationnel",
  },
  {
    id: uniqueId(),
    title: "Questions par examen",
    icon: IconAdjustmentsAlt,
    href: "/client/c/{USER_ID}/talk/parametrage/questions_exam",
  },
  {
    id: uniqueId(),
    title: "Liste des appels",
    icon: IconPhone,
    href: "/client/c/{USER_ID}/talk/calls",
  },
  {
    id: uniqueId(),
    title: "Statistiques d'appels",
    icon: IconChartInfographic,
    href: "/client/c/{USER_ID}/talk/stats_appel",
  },
  {
    id: uniqueId(),
    title: "Examens non couverts",
    icon: IconCalendarOff,
    href: "/client/c/{USER_ID}/talk/planning-complet",
  },
  {
    id: uniqueId(),
    title: "Rendez-vous non honorés",
    icon: IconMessage2,
    href: "/client/c/{USER_ID}/talk/stats-no-show",
  },
  {
    id: uniqueId(),
    title: "Ordonnances manquantes",
    icon: IconFileAlert,
    href: "/client/c/{USER_ID}/talk/ordonnances-manquantes",
  },
  {
    id: uniqueId(),
    title: "Incidents",
    icon: IconAlertTriangle,
    href: "/client/c/{USER_ID}/talk/incidents",
  },

];

/**
 * Menu du produit LyraeKonnect (étape 5 du chantier multi-produit).
 *
 * `{USER_ID}` est résolu par `SidebarItems` avec l'identifiant du CLIENT.
 *
 * Ces liens portaient le `userProductId`, l'affiliation du client à ce produit,
 * qui n'est pas la même ligne de `UserProduct` que celle de LyraeTalk : les
 * confondre envoyait sur la configuration du produit qu'on ne regarde pas. Depuis
 * le chantier U (une URL par client, 31/08/2026), l'URL porte le client et le
 * produit est un segment, ce qui rend la confusion impossible.
 *
 * La rubrique « Exploitation » porte les demandes de rappel des patients dont
 * l'examen n'est pas réservable en ligne (chantier `2026-09-konnect-deux-chemins`).
 * C'est le premier écran de cette brique à afficher de la donnée patient, et il le
 * fait sur décision explicite du 02/09/2026, Q33 et Q34 restant ouverts. Le reste
 * des files opérationnelles n'a pas suivi : elles restent chez Konnect.
 */
export const KonnectMenuitems: SidebarItem[] = [
  { navlabel: true, subheader: "Configuration" },
  {
    id: uniqueId(),
    title: "Paramètres du portail",
    icon: IconSettings,
    href: "/client/c/{USER_ID}/konnect/parametrage",
  },
  {
    id: uniqueId(),
    title: "Correspondance des examens",
    icon: IconListDetails,
    href: "/client/c/{USER_ID}/konnect/examens",
  },
  {
    id: uniqueId(),
    title: "Sites",
    icon: IconMapPin,
    href: "/client/c/{USER_ID}/konnect/sites",
  },
  {
    id: uniqueId(),
    title: "Ordre de l'entonnoir",
    icon: IconSortAscending,
    href: "/client/c/{USER_ID}/konnect/ordre-entonnoir",
  },
  {
    id: uniqueId(),
    title: "Règles de fusion",
    icon: IconArrowsJoin,
    href: "/client/c/{USER_ID}/konnect/regles-fusion",
  },
  {
    id: uniqueId(),
    title: "Ordre des créneaux",
    icon: IconClockHour4,
    href: "/client/c/{USER_ID}/konnect/ordre-creneaux",
  },
  {
    id: uniqueId(),
    title: "Multi examens",
    icon: IconArrowsJoin,
    href: "/client/c/{USER_ID}/konnect/paires-examens",
  },
  {
    id: uniqueId(),
    title: "Mots du cabinet",
    icon: IconAbc,
    href: "/client/c/{USER_ID}/konnect/mots-cabinet",
  },
  {
    id: uniqueId(),
    title: "Règles",
    icon: IconShieldCheck,
    href: "/client/c/{USER_ID}/konnect/regles-cliniques",
  },

  { navlabel: true, subheader: "Exploitation" },
  {
    id: uniqueId(),
    title: "Demandes de rappel",
    icon: IconPhoneCall,
    href: "/client/c/{USER_ID}/konnect/demandes-rappel",
  },
  {
    // 27/10/2026 : la file d'attente des examens sans créneau, par code examen.
    id: uniqueId(),
    title: "Liste d'attente",
    icon: IconHourglass,
    href: "/client/c/{USER_ID}/konnect/liste-attente",
  },
  {
    // 26/10/2026 : questionnaires du centre non remplis par le lien de la
    // confirmation, au-dela du delai du centre. Badge : SidebarItems, par le titre.
    id: uniqueId(),
    title: "Questionnaires des patients",
    icon: IconFileAlert,
    href: "/client/c/{USER_ID}/konnect/questionnaires",
  },
  {
    // Alimenté par la remontée du portail (lot E), pas par une lecture : le
    // Dashboard ne peut pas interroger Konnect, qui passe derrière un VPN.
    id: uniqueId(),
    title: "Statistiques",
    icon: IconChartHistogram,
    href: "/client/c/{USER_ID}/konnect/statistiques",
  },
  {
    // 18/09/2026 : les mêmes chiffres que « Stats No-Show » de LyraeTalk, les relances
    // étant celles du client.
    id: uniqueId(),
    title: "Relances no-show",
    icon: IconMessage2,
    href: "/client/c/{USER_ID}/konnect/relances-no-show",
  },

  { navlabel: true, subheader: "Assistance" },
  {
    id: uniqueId(),
    title: "Support",
    icon: IconLifebuoy,
    href: "/client/c/{USER_ID}/konnect/support",
  },
];

export default Menuitems;
