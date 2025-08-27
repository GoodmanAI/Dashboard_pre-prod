import React from "react";
import Link from "next/link";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  styled,
} from "@mui/material";

/**
 * Contrat de configuration pour un élément de navigation latérale.
 * - `icon` est un composant d’icône (ex. Tabler) recevant les props `stroke` et `size`.
 * - `href` peut être interne (Next.js) ou externe (avec `external: true`).
 */
export type NavItemConfig = {
  id?: string;
  title?: string;
  icon?: React.ElementType<any>;
  href?: string;
  disabled?: boolean;
  external?: boolean;
};

/**
 * Contrat des props du composant `NavItem`.
 * - `pathDirect` est l’URL actuelle (pour marquer l’item sélectionné).
 * - `level` permet de styliser différemment les sous-niveaux.
 * - `onClick` est invoqué au clic (fermeture du menu, tracking, etc.).
 */
type NavItemProps = {
  item: NavItemConfig;
  pathDirect: string;
  level?: number;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
};

/**
 * Style de l’élément de liste pour garantir :
 * - cohérence des espacements et rayons de bordure
 * - états hover/selected harmonisés
 * - gestion d’un style plus neutre pour les niveaux profonds
 */
const ListItemStyled = styled(ListItem, {
  shouldForwardProp: (prop) => prop !== "$level",
})<{ $level?: number }>(({ theme, $level }) => ({
  padding: 0,
  ".MuiButtonBase-root": {
    whiteSpace: "nowrap",
    marginBottom: "2px",
    padding: "8px 10px",
    borderRadius: "8px",
    backgroundColor: $level && $level > 1 ? "transparent !important" : "inherit",
    color: theme.palette.text.secondary,
    paddingLeft: "10px",
    "&:hover": {
      backgroundColor: theme.palette.primary.light,
      color: "#48C8AF",
    },
    "&.Mui-selected": {
      color: "white",
      backgroundColor: "#48C8AF",
      "&:hover": {
        backgroundColor: "#48C8AF",
        color: "white",
      },
    },
  },
}));

/**
 * Élément de navigation :
 * - rend un lien interne (Next Link) ou externe selon la config
 * - affiche une icône et un libellé
 * - gère l’état sélectionné en fonction de `pathDirect`
 */
const NavItem = ({ item, level, pathDirect, onClick }: NavItemProps) => {
  const Icon = item.icon as React.ElementType<any> | undefined;

  return (
    <List component="div" disablePadding key={item.id}>
      <ListItemStyled $level={level}>
        <ListItemButton
          component={Link}
          href={item.href || "#"}
          disabled={item.disabled}
          selected={Boolean(item.href) && pathDirect === item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          onClick={onClick}
        >
          {Icon && (
            <ListItemIcon sx={{ minWidth: "36px", p: "3px 0", color: "inherit" }}>
              <Icon stroke={1.5} size="1.3rem" />
            </ListItemIcon>
          )}

          <ListItemText primary={item.title} />
        </ListItemButton>
      </ListItemStyled>
    </List>
  );
};

export default NavItem;
