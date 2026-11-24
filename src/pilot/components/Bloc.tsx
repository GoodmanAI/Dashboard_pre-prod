import type { ReactNode } from "react";
import Link from "next/link";
import { Box, Card, Stack, Typography } from "@mui/material";
import { JETONS, MOUVEMENT, type Teinte } from "@/pilot/jetons";
import { Tuile, type Icone as IconeTuile } from "./Tuile";

/** Titre d'écran, sous-titre et, à droite, ce qu'on peut y faire. Grand titre, comme sur iOS. */
export function EnTete({ titre, sousTitre, children }: { titre: ReactNode; sousTitre?: ReactNode; children?: ReactNode }) {
  return <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} alignItems="flex-end" sx={{ mb: 0.5 }}>
    <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
      <Typography variant="h1">{titre}</Typography>
      {sousTitre && <Typography sx={{ color: "text.secondary", fontSize: 15, mt: 0.75 }}>{sousTitre}</Typography>}
    </Box>
    {children}
  </Stack>;
}

/** Le contrôle segmenté « À moi, Toute l'équipe » : deux liens, l'écran se recharge sur la bonne vue. */
export function Bascule({ libelle, equipe, moi: lienMoi, tous }: { libelle: string; equipe: boolean; moi: string; tous: string }) {
  const segment = (actif: boolean) => ({
    display: "inline-flex", alignItems: "center", height: 30, px: 1.75, borderRadius: "8px", fontSize: 13, fontWeight: actif ? 600 : 500, whiteSpace: "nowrap",
    color: actif ? "text.primary" : "text.secondary", bgcolor: actif ? "background.paper" : "transparent",
    boxShadow: actif ? JETONS.ombreSegment : "none",
    transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}, box-shadow ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`,
    "&&:hover": { color: "text.primary" },
  });
  return <Box role="group" aria-label={libelle} sx={{ display: "inline-flex", bgcolor: JETONS.segment, borderRadius: "10px", p: "2px" }}>
    <Box component={Link} href={lienMoi} aria-pressed={!equipe} sx={segment(!equipe)}>À moi</Box>
    <Box component={Link} href={tous} aria-pressed={equipe} sx={segment(equipe)}>Toute l&apos;équipe</Box>
  </Box>;
}

/**
 * Une carte avec son titre, son compte et son lien. Toujours une section nommée.
 * `icone` et `teinte` posent une pastille de couleur devant le titre, comme les
 * listes de Rappels : on reconnaît la section avant de la lire.
 */
export function Bloc({ titre, nombre, lien, action, entete, vide, id, children, sx, icone, teinte = "bleu" }: {
  titre: string; nombre?: ReactNode; lien?: string; action?: string; entete?: ReactNode; vide?: ReactNode; id?: string; children?: ReactNode; sx?: object;
  icone?: IconeTuile; teinte?: Teinte;
}) {
  return <Card component="section" aria-label={titre} id={id} sx={sx}>
    <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1.25} alignItems="center" sx={{ px: 2.75, pt: 2.25, pb: 1.5 }}>
      {icone && <Tuile Icone={icone} teinte={teinte} taille={28} rond />}
      <Typography variant="h2">{titre}</Typography>
      {nombre !== undefined && (typeof nombre === "number" ? <Compte>{nombre}</Compte>
        : <Typography variant="body2" color="text.secondary">{nombre}</Typography>)}
      <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
        {entete}
        {lien && action && <LienAccent href={lien}>{action}</LienAccent>}
      </Box>
    </Stack>
    {vide ? <Typography variant="body2" color="text.secondary" sx={{ px: 2.75, pt: 0.25, pb: 2.75 }}>{vide}</Typography> : children}
  </Card>;
}

/** Le compte à côté d'un titre : une petite pastille grise. */
function Compte({ children }: { children: ReactNode }) {
  return <Box component="span" sx={{ display: "inline-flex", alignItems: "center", minWidth: 22, height: 22, px: 0.875, justifyContent: "center",
    borderRadius: 980, bgcolor: JETONS.gris, color: "text.secondary", fontSize: 12, fontWeight: 600 }}>{children}</Box>;
}

export function LienAccent({ href, children }: { href: string; children: ReactNode }) {
  return <Box component={Link} href={href} sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, fontSize: 14, fontWeight: 500, color: "primary.main",
    "&::after": { content: '"›"', fontSize: 18, lineHeight: 1, ml: 0.25, transition: `transform ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}` },
    "&&:hover": { color: "primary.dark" }, "&:hover::after": { transform: "translateX(2px)" } }}>{children}</Box>;
}

/**
 * Une ligne de carte : ce dont il s'agit, sa date, puis les actions, qui passent
 * dessous si la place manque. Le séparateur part du texte, comme une liste iOS.
 */
export function Ligne({ nom, detail, date, children, ...attributs }: { nom: ReactNode; detail?: ReactNode; date?: ReactNode; children?: ReactNode } & Record<`data-${string}`, string | number>) {
  return <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={2} rowGap={0.75} alignItems="center" {...attributs}
    sx={{ position: "relative", px: 2.75, py: 1.5, minHeight: 56,
      transition: `background-color ${MOUVEMENT.rapide} ${MOUVEMENT.courbe}`, "&:hover": { bgcolor: JETONS.survolLigne },
      "&::before": { content: '""', position: "absolute", top: 0, left: 22, right: 0, borderTop: `1px solid ${JETONS.filetInterne}` } }}>
    <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
      <Typography component="div" fontWeight={500}>{nom}</Typography>
      {detail && <Box sx={{ color: "text.secondary", fontSize: 13, mt: 0.25 }}>{detail}</Box>}
    </Box>
    {date && <Box sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0, textAlign: "right" }}>{date}</Box>}
    {children && <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} alignItems="center" sx={{ ml: "auto" }}>{children}</Stack>}
  </Stack>;
}

/** Une zone douce : ce qui manque, et pourquoi. */
export function Vide({ children }: { children: ReactNode }) {
  return <Box sx={{ bgcolor: JETONS.gris, borderRadius: "14px", px: 2, py: 2.75, color: "text.secondary", fontSize: 13, textAlign: "center" }}>{children}</Box>;
}
