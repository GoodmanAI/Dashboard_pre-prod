import Link from "next/link";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { JETONS, MOUVEMENT } from "@/pilot/jetons";

export type EntreeFamille = { cle: string; nom: string; detail: string; href: string; compte: number };

/**
 * La barre segmentée de l'écran Prospects : la liste « À prospecter » (C-65),
 * puis les familles d'étapes du tableau. Partagée par les deux vues.
 */
export function NavFamilles({ entrees, actif }: { entrees: EntreeFamille[]; actif: string }) {
  return <Box component="nav" aria-label="Vues des prospects" sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, p: 0.5, borderRadius: "16px", bgcolor: JETONS.segment }}>
    {entrees.map(({ cle, nom, detail, href, compte }) => {
      const estActif = cle === actif;
      return <Box key={cle} component={Link} href={href} aria-current={estActif ? "true" : undefined}
        sx={{ flex: { xs: "1 1 100%", sm: "1 1 180px" }, minWidth: 0, px: 2, py: 1.25, borderRadius: "12px",
          bgcolor: estActif ? "background.paper" : "transparent", boxShadow: estActif ? JETONS.ombreSegment : "none",
          transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}, box-shadow ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`,
          "&:hover": { bgcolor: estActif ? "background.paper" : JETONS.survolPage }, "&&:hover": { color: "text.primary" } }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle1" component="span">{nom}</Typography>
          <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", bgcolor: JETONS.gris, borderRadius: 999, px: "7px", py: "1px" }}>{compte}</Box>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div">{detail}</Typography>
      </Box>;
    })}
  </Box>;
}
