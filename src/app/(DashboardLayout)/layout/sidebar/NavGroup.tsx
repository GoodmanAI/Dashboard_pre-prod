import { ListSubheader, styled } from "@mui/material";

/**
 * Contrat de prop pour l’en-tête de section du menu latéral.
 * `subheader` est le libellé affiché au-dessus d’un groupe d’items.
 */
type NavGroupProps = {
  item: {
    subheader?: string;
  };
};

/**
 * Style typographique et espacements de l’en-tête de section.
 * Centralise la personnalisation MUI pour garantir la cohérence visuelle.
 */
const StyledSubheader = styled(ListSubheader)(({ theme }) => ({
  ...theme.typography.overline,
  fontWeight: 700,
  marginTop: theme.spacing(3),
  marginBottom: theme.spacing(0),
  color: theme.palette.text.primary,
  lineHeight: "26px",
  padding: "3px 12px",
}));

/**
 * Composant d’en-tête de groupe dans la navigation latérale.
 * - Affiche un libellé non cliquable au-dessus d’un groupe d’entrées.
 * - `disableSticky` évite le collage en haut dans les conteneurs scrollables.
 */
const NavGroup = ({ item }: NavGroupProps) => {
  if (!item.subheader) return null;
  return <StyledSubheader disableSticky>{item.subheader}</StyledSubheader>;
};

export default NavGroup;
