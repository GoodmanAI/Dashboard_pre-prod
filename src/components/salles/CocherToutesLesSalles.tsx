"use client";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { BORDER, INK, INK_MUTED, OK, WARNING } from "@/lib/jetons";

/**
 * « Cocher toutes les salles », première mise en production (02/11/2026).
 *
 * Pour chaque client, la route `/api/admin/salles/cocher-tout` relève ses salles dans
 * Xplore et coche chaque produit qu'il a. On passe d'abord à blanc et on lit le
 * tableau, puis on applique. Un client à la fois : le relevé d'AI2Xplore est plafonné
 * à 20 par minute, l'écran attend et reprend quand il est atteint.
 */

type Issue = "absent" | "deja_regle" | "coche" | "laisse" | "a_voir" | "sans_salle";

type Resultat = {
  userId: number;
  nom: string;
  erreur?: string;
  sitesEnEchec?: string[];
  plan?: {
    salles: number;
    sallesTalk: number;
    sallesKonnect: number;
    ajoutees: string[];
    sansModalite: string[];
    talk: Issue;
    konnect: Issue;
    modalitesSansSalle: string[];
  };
  aEcrire?: boolean;
  ecrit?: boolean;
};

const LIBELLE: Record<Issue, string> = {
  absent: "",
  deja_regle: "déjà réglé, inchangé",
  coche: "tout coché",
  laisse: "laissé tel quel",
  a_voir: "à régler à la main",
  sans_salle: "aucune salle relevée",
};

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function unClient(userId: number, appliquer: boolean): Promise<any> {
  for (let essai = 0; essai < 4; essai++) {
    const r = await fetch("/api/admin/salles/cocher-tout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, appliquer }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 429) {
      await attendre(30000);
      continue;
    }
    if (!r.ok) throw new Error(d?.error ?? "Le relevé a échoué.");
    return d;
  }
  throw new Error("Le relevé reste plafonné. Relancez dans une minute.");
}

function remarque(r: Resultat): string {
  if (r.erreur) return r.erreur;
  const p = r.plan;
  if (!p) return "";
  const morceaux: string[] = [];
  if (r.sitesEnEchec && r.sitesEnEchec.length > 0) {
    morceaux.push(`Xplore n'a pas répondu pour ${r.sitesEnEchec.join(", ")} : rien ne sera écrit.`);
  }
  if (p.talk === "laisse") {
    morceaux.push(`Talk accepte ${p.modalitesSansSalle.join(", ")} sans salle relevée : le cocher fermerait ces modalités au robot.`);
  }
  if (p.konnect === "a_voir") morceaux.push("Konnect avait des salles déclarées sans aucune ouverte.");
  if (p.sansModalite.length > 0) morceaux.push(`Modalité inconnue, non reprises : ${p.sansModalite.join(", ")}.`);
  return morceaux.join(" ");
}

export default function CocherToutesLesSalles({
  clients,
  onApplique,
}: {
  clients: { userId: number; nom: string }[];
  onApplique: () => void;
}) {
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [fait, setFait] = useState(0);
  const [enCours, setEnCours] = useState<null | "essai" | "application">(null);
  const [applique, setApplique] = useState(false);

  async function passer(appliquer: boolean) {
    const cibles = appliquer
      ? resultats.filter((r) => r.aEcrire).map((r) => ({ userId: r.userId, nom: r.nom }))
      : clients;
    setEnCours(appliquer ? "application" : "essai");
    setFait(0);
    if (!appliquer) {
      setResultats([]);
      setApplique(false);
    }
    const sortie: Resultat[] = appliquer ? [...resultats] : [];
    for (const c of cibles) {
      let res: Resultat;
      try {
        const d = await unClient(c.userId, appliquer);
        res = { userId: c.userId, nom: c.nom, sitesEnEchec: d.sitesEnEchec, plan: d.plan, aEcrire: d.aEcrire, ecrit: d.ecrit };
      } catch (e: any) {
        res = { userId: c.userId, nom: c.nom, erreur: e?.message ?? "Le relevé a échoué." };
      }
      const i = sortie.findIndex((x) => x.userId === c.userId);
      if (i >= 0) sortie[i] = res;
      else sortie.push(res);
      setResultats([...sortie]);
      setFait((n) => n + 1);
    }
    setEnCours(null);
    if (appliquer) {
      setApplique(true);
      onApplique();
    }
  }

  const aEcrire = resultats.filter((r) => r.aEcrire).length;
  const total = enCours === "application" ? resultats.filter((r) => r.aEcrire).length : clients.length;

  return (
    <Paper id="facturation-cocher-tout" variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK, mb: 0.5 }}>Cocher toutes les salles</Typography>
      <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mb: 1.5 }}>
        Relève les salles de chaque client dans Xplore et les coche pour Talk et pour Konnect. Les centres gardent
        toutes leurs salles, comme aujourd&apos;hui. Un produit déjà réglé n&apos;est pas touché. Lancez d&apos;abord
        l&apos;essai : rien n&apos;est enregistré avant « Appliquer ».
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: enCours || resultats.length ? 1.5 : 0 }}>
        <Button variant="outlined" disabled={enCours !== null || clients.length === 0} onClick={() => void passer(false)}>
          Lancer l&apos;essai
        </Button>
        <Button
          variant="contained"
          disableElevation
          disabled={enCours !== null || aEcrire === 0 || applique}
          onClick={() => void passer(true)}
          sx={{ bgcolor: "var(--accent)" }}
        >
          {aEcrire > 0 ? `Appliquer à ${aEcrire} client${aEcrire > 1 ? "s" : ""}` : "Appliquer"}
        </Button>
      </Stack>

      {enCours && (
        <Box sx={{ mb: 1.5 }}>
          <LinearProgress variant="determinate" value={total ? (fait / total) * 100 : 0} />
          <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 0.5 }}>
            {enCours === "essai" ? "Essai" : "Enregistrement"} : {fait} sur {total}. Le relevé peut marquer une pause
            de 30 secondes.
          </Typography>
        </Box>
      )}
      {applique && !enCours && (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          Salles enregistrées. Le tableau ci-dessous est à jour.
        </Alert>
      )}

      {resultats.length > 0 && (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Client</TableCell>
                <TableCell align="right">Salles</TableCell>
                <TableCell>Talk</TableCell>
                <TableCell>Konnect</TableCell>
                <TableCell>À savoir</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resultats.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell sx={{ fontSize: 13 }}>
                    {r.nom}
                    {r.ecrit && <Typography component="span" sx={{ fontSize: 11.5, color: OK, ml: 1 }}>enregistré</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: 13 }}>
                    {r.plan ? `${r.plan.salles} (+${r.plan.ajoutees.length})` : "-"}
                  </TableCell>
                  {(["talk", "konnect"] as const).map((p) => {
                    const issue = r.plan?.[p];
                    const n = p === "talk" ? r.plan?.sallesTalk : r.plan?.sallesKonnect;
                    const alerte = issue === "laisse" || issue === "a_voir" || issue === "sans_salle";
                    return (
                      <TableCell key={p} sx={{ fontSize: 13, color: alerte ? WARNING : INK }}>
                        {issue && issue !== "absent" ? `${LIBELLE[issue]}${n ? ` (${n})` : ""}` : "-"}
                      </TableCell>
                    );
                  })}
                  <TableCell sx={{ fontSize: 12.5, color: r.erreur ? WARNING : INK_MUTED, maxWidth: 420 }}>
                    {remarque(r)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}
