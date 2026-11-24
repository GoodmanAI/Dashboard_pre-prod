"use client";

import { Box, Button, Checkbox, FormControlLabel, Stack, Typography } from "@mui/material";
import {
  GROUPES_ACCES, PAGES_DU_QUOTIDIEN, PREREGLAGES, libelleAcces, ouvreLeDashboard,
  type AccesInternes, type CleAcces,
} from "@/lib/accesInternes";

/** Ce qu'un compte ouvre au Dashboard, en une ligne pour la liste de l'équipe. */
export function resumeAccesDashboard(acces: AccesInternes | null): string {
  if (acces === null) return "Dashboard : tout, configuration comprise.";
  if (!ouvreLeDashboard(acces)) return "Dashboard : aucun écran, Pilot seul.";
  const n = Object.keys(acces).length;
  return `Dashboard : ${n} écran${n > 1 ? "s" : ""} ouvert${n > 1 ? "s" : ""}.`;
}

/**
 * Les écrans du Dashboard qu'un compte de l'équipe ouvre (24/11/2026,
 * `src/lib/accesInternes.ts`). Une case par écran ; pour les écrans du quotidien,
 * une seconde case permet de traiter ce qui s'y trouve. La configuration reste au
 * super-administrateur, quoi qu'on coche : l'écran le dit.
 */
export function ChampsAccesDashboard({ acces, changer }: { acces: AccesInternes; changer: (a: AccesInternes) => void }) {
  const ouvrir = (cle: CleAcces, coche: boolean) => {
    const suivant = { ...acces };
    if (coche) suivant[cle] = "read";
    else delete suivant[cle];
    changer(suivant);
  };
  const traiter = (cle: CleAcces, coche: boolean) => changer({ ...acces, [cle]: coche ? "write" : "read" });
  const groupe = (cles: CleAcces[], coche: boolean) => {
    const suivant = { ...acces };
    for (const cle of cles) {
      if (coche) suivant[cle] = suivant[cle] ?? "read";
      else delete suivant[cle];
    }
    changer(suivant);
  };

  return <Stack spacing={2.5}>
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Partez d&apos;un préréglage, puis cochez ou décochez écran par écran. La configuration des centres
        reste réservée au super-administrateur, quoi que vous cochiez.
      </Typography>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
        {PREREGLAGES.map((p) => <Button key={p.cle} size="small" variant="outlined" title={p.detail} onClick={() => changer(p.acces())}>
          {p.libelle}
        </Button>)}
      </Stack>
    </Box>
    {GROUPES_ACCES.map((g) => {
      const cochees = g.cles.filter((c) => acces[c]).length;
      return <Box key={g.titre} component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Typography component="legend" variant="subtitle2">{g.titre}</Typography>
          <Button size="small" onClick={() => groupe(g.cles, cochees < g.cles.length)}>
            {cochees < g.cles.length ? "Tout cocher" : "Tout décocher"}
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{g.detail}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2 }}>
          {g.cles.map((cle) => {
            const niveau = acces[cle];
            const quotidien = g.quotidien && PAGES_DU_QUOTIDIEN.has(cle);
            return <Box key={cle} sx={{ minWidth: 0 }}>
              <FormControlLabel sx={{ display: "flex", mr: 0 }}
                control={<Checkbox name={cle} checked={Boolean(niveau)} onChange={(e) => ouvrir(cle, e.target.checked)} />}
                label={libelleAcces(cle)} />
              {quotidien && niveau && <FormControlLabel sx={{ display: "flex", ml: 3.5, mt: -0.75, mr: 0 }}
                control={<Checkbox size="small" checked={niveau === "write"} onChange={(e) => traiter(cle, e.target.checked)} />}
                label={<Typography variant="body2" color="text.secondary">et traiter ce qui s&apos;y trouve</Typography>} />}
            </Box>;
          })}
        </Box>
      </Box>;
    })}
  </Stack>;
}
