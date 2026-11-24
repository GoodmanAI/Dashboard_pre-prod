"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Menu, MenuItem, Typography } from "@mui/material";
import type { CrmEtapeCommerciale, CrmRaisonSortie } from "@prisma/client";
import { LIBELLES, ETAPES_SORTIE, transitionPermise } from "@/pilot/lib/pipeline";
import { changementEtape } from "@/pilot/lib/validation/organisation";
import type { OptionConcurrent } from "@/pilot/lib/concurrents/options";
import { DialogueSortie } from "./DialogueSortie";
import { DialogueDebutPoc } from "./Poc";
import { entreeCyclePoc } from "@/pilot/lib/organisations/poc";
import { CaseTerminerContrats } from "./CaseTerminerContrats";
import { DialogueFormulaire, envoyer } from "./DialogueFormulaire";

export function ChangerEtape({ org, concurrents, contratsActifs = 0 }: { org: {
  id: number; etape: CrmEtapeCommerciale; raisonSortie: string | null; raisonSortieCode: CrmRaisonSortie | null; reveilLe: string | null;
  concurrentGagnantId: number | null; pocDebuteLe?: string | null; pocCycleOuvert?: boolean;
  /** L'étape d'avant la sortie : le menu propose d'y revenir directement (C-86). */
  avantSortie?: CrmEtapeCommerciale | null;
}; concurrents: OptionConcurrent[];
  /** Les contrats actifs que ce compte peut terminer : 0 sans le droit « Modifier les montants ». */
  contratsActifs?: number;
}) {
  const router = useRouter();
  const [ancre, setAncre] = useState<HTMLElement | null>(null);
  const [sortie, setSortie] = useState<"PERDU" | "EN_SOMMEIL" | "POC_NON_TRANSFORME" | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [poc, setPoc] = useState(false);
  const [arret, setArret] = useState(false);
  return <Box>
    <Button variant="outlined" disabled={envoi} aria-haspopup="menu" aria-expanded={Boolean(ancre)} onClick={(e) => setAncre(e.currentTarget)}>Changer d&apos;étape</Button>
    <Menu anchorEl={ancre} open={Boolean(ancre)} onClose={() => setAncre(null)}>
      {(Object.keys(LIBELLES) as CrmEtapeCommerciale[]).filter((e) =>
        transitionPermise(org.etape, e, org.avantSortie ?? null) && (e !== org.etape || ETAPES_SORTIE.includes(e))).map((etape) =>
        <MenuItem key={etape} onClick={async () => {
          setAncre(null); setErreur(null);
          if (ETAPES_SORTIE.includes(etape)) { setSortie(etape as "PERDU" | "EN_SOMMEIL" | "POC_NON_TRANSFORME"); return; }
          if (entreeCyclePoc(org.etape, etape, org.avantSortie ?? null, org.pocCycleOuvert ?? false) === "NOUVEAU") { setPoc(true); return; }
          if (org.etape === "EN_POC" && etape === "SIGNE") { setErreur("Utilisez « Valider le POC et convertir en client » sur la fiche."); return; }
          if (etape === "ARRETE" && contratsActifs > 0) { setArret(true); return; }
          setEnvoi(true);
          try { await envoyer(`/api/pilot/organisations/${org.id}/etape`, "PATCH", changementEtape, { etape }); router.refresh(); }
          catch (e) { setErreur(e instanceof Error ? e.message : "Le changement a échoué."); }
          finally { setEnvoi(false); }
        }}>{etape === org.etape ? "Corriger la sortie" : etape === org.avantSortie ? `Reprendre en « ${LIBELLES[etape]} »` : LIBELLES[etape]}</MenuItem>)}
    </Menu>
    {erreur && <Alert severity="error" icon={false}>{erreur}</Alert>}
    {sortie && <DialogueSortie vers={sortie} valeurs={sortie === org.etape ? org : undefined} concurrents={concurrents} fermer={() => setSortie(null)}
      contratsActifs={sortie === "PERDU" && sortie !== org.etape ? contratsActifs : 0}
      enregistrer={async (valeurs) => {
        await envoyer(`/api/pilot/organisations/${org.id}/etape`, "PATCH", changementEtape, { etape: sortie, ...valeurs });
        setSortie(null); router.refresh();
      }} />}
    {poc && <DialogueDebutPoc fermer={() => setPoc(false)} enregistrer={async (pocDebuteLe) => {
      await envoyer(`/api/pilot/organisations/${org.id}/etape`, "PATCH", changementEtape, { etape: "EN_POC", pocDebuteLe });
      setPoc(false); router.refresh();
    }} />}
    {arret && <DialogueFormulaire titre="Contrat terminé" bouton="Confirmer" fermer={() => setArret(false)} soumettre={async (f) => {
      await envoyer(`/api/pilot/organisations/${org.id}/etape`, "PATCH", changementEtape, { etape: "ARRETE", terminerContrats: f.get("terminerContrats") === "on" });
      setArret(false); router.refresh();
    }}>
      <Typography variant="body2">Le client est parti. Ses centres ne lèvent plus d&apos;alerte de mise en service.</Typography>
      <CaseTerminerContrats nombre={contratsActifs} />
    </DialogueFormulaire>}
  </Box>;
}

