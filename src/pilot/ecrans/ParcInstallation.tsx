"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { IconArrowRight } from "@tabler/icons-react";
import { adresseDansSonEspace } from "@/lib/espaces";
import { PRODUITS, ORDRE_PRODUITS, type SlugProduit } from "@/lib/produits";
import { ORDRE_STATUTS, STATUTS, type StatutCentre } from "@/lib/centreStatut";
import { JETONS } from "@/pilot/jetons";

/**
 * L'installation de chaque centre du Dashboard : son statut et ce qui manque à sa
 * configuration, un centre par produit. Section de la page « Parc » de Pilot depuis le
 * 27/11/2026 (ex-« Parc clients », plan lyrae/plans/2026-11-separation-dashboard-pilot.md).
 *
 * **En lecture seule.** Le statut se pose dans Pilot par la case « Mise en service
 * déclarée » du centre et l'étape de la fiche (`src/pilot/lib/centres/statutDashboard.ts`) ;
 * la configuration se règle au Dashboard, dans « Paramétrage d'un centre », où mène le
 * bouton de chaque ligne.
 */

type Ligne = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  produit: SlugProduit | null;
  produitNom: string;
  statut: StatutCentre;
  depuis: string | null;
  classe: boolean;
};

type Completude = { userProductId: number; bloquants: number; degrades: number; total: number; satisfaites: number };

function CelluleCompletude({ c }: { c: Completude | undefined }) {
  if (!c) return <Typography sx={{ fontSize: 13, color: JETONS.secondaire }}>-</Typography>;
  if (c.bloquants === 0 && c.degrades === 0) {
    return <Typography sx={{ fontSize: 13, color: "#186A3B", fontWeight: 600 }}>Complet</Typography>;
  }
  const n = c.bloquants;
  return (
    <Stack spacing={0.25}>
      <Typography sx={{ fontSize: 13, color: JETONS.encre, fontWeight: 600 }}>{c.satisfaites} sur {c.total}</Typography>
      <Typography sx={{ fontSize: 12, color: n > 0 ? "#9B2226" : JETONS.secondaire }}>
        {n > 0 ? `${n} information${n > 1 ? "s" : ""} essentielle${n > 1 ? "s" : ""} manquante${n > 1 ? "s" : ""}` : `${c.degrades} à compléter`}
      </Typography>
    </Stack>
  );
}

function PastilleStatut({ statut }: { statut: StatutCentre }) {
  const { libelle, couleur } = STATUTS[statut];
  return <Chip label={libelle} size="small" sx={{ bgcolor: couleur.fond, color: couleur.texte, fontWeight: 600, fontSize: 12 }} />;
}

function dateCourte(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}

export default function ParcInstallation() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [completudes, setCompletudes] = useState<Record<number, Completude>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<SlugProduit | "tous">("tous");

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/centre-statut");
        if (!r.ok) throw new Error();
        const d = await r.json();
        setLignes(Array.isArray(d.rows) ? d.rows : []);
      } catch {
        setErreur("Impossible de charger l'installation des centres. Rechargez la page.");
      } finally {
        setChargement(false);
      }
    })();
    // La complétude à part : son échec laisse la colonne vide, le reste s'affiche.
    void (async () => {
      try {
        const r = await fetch("/api/completude");
        if (!r.ok) return;
        const d = await r.json();
        const rows: Completude[] = Array.isArray(d.rows) ? d.rows : [];
        setCompletudes(Object.fromEntries(rows.map((c) => [c.userProductId, c])));
      } catch {
        // Colonne vide.
      }
    })();
  }, []);

  const visibles = useMemo(() => (filtre === "tous" ? lignes : lignes.filter((l) => l.produit === filtre)), [lignes, filtre]);
  const compteurs = useMemo(() => {
    const c: Record<StatutCentre, number> = { integration: 0, production: 0, arrete: 0 };
    visibles.forEach((l) => { c[l.statut] += 1; });
    return c;
  }, [visibles]);

  return (
    <Box id="installation">
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600, mb: 0.5 }}>Installation des centres</Typography>
      <Typography sx={{ fontSize: 13, color: JETONS.secondaire, mb: 2 }}>
        Le statut de chaque centre au Dashboard et ce qui manque à sa configuration. Le statut suit la case
        « Mise en service déclarée » de la page Intégrations et l&apos;étape de la fiche ; il décide des alertes
        affichées au client, rien d&apos;autre.
      </Typography>

      {erreur && <Alert severity="error" sx={{ mb: 2 }}>{erreur}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup size="small" exclusive value={filtre} onChange={(_, v) => v && setFiltre(v)}>
            <ToggleButton value="tous">Tous les produits</ToggleButton>
            {ORDRE_PRODUITS.map((slug) => <ToggleButton key={slug} value={slug}>{PRODUITS[slug].libelle}</ToggleButton>)}
          </ToggleButtonGroup>
          <Box sx={{ flexGrow: 1 }} />
          {ORDRE_STATUTS.map((s) => (
            <Stack key={s} direction="row" spacing={0.75} alignItems="center">
              <PastilleStatut statut={s} />
              <Typography sx={{ fontSize: 13, color: JETONS.encre, fontWeight: 600 }}>{compteurs[s]}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        {chargement ? (
          <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress size={22} /></Box>
        ) : visibles.length === 0 ? (
          <Box sx={{ p: 4 }}><Typography sx={{ fontSize: 13, color: JETONS.secondaire }}>Aucun centre pour ce filtre.</Typography></Box>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: JETONS.survolLigne }}>
                  <TableCell>Client</TableCell>
                  <TableCell>Produit</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Depuis</TableCell>
                  <TableCell>Complétude</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.map((l) => (
                  <TableRow key={l.userProductId} hover>
                    <TableCell>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: JETONS.encre }}>{l.clientNom ?? `Centre ${l.userProductId}`}</Typography>
                      <Typography sx={{ fontSize: 12, color: JETONS.secondaire }}>{l.clientEmail ?? ""}</Typography>
                    </TableCell>
                    <TableCell><Typography sx={{ fontSize: 13, color: JETONS.encre }}>{l.produit ? PRODUITS[l.produit].libelle : l.produitNom}</Typography></TableCell>
                    <TableCell><PastilleStatut statut={l.statut} /></TableCell>
                    <TableCell><Typography sx={{ fontSize: 13, color: JETONS.secondaire }}>{l.classe ? dateCourte(l.depuis) : "jamais classé"}</Typography></TableCell>
                    <TableCell><CelluleCompletude c={completudes[l.userProductId]} /></TableCell>
                    <TableCell align="right">
                      {/* La configuration reste au Dashboard : lien complet vers son hôte. */}
                      <Button
                        component="a"
                        href={adresseDansSonEspace(`/admin/parametrage?onglet=${l.produit === "konnect" ? "konnect" : "talk"}&centre=${l.userProductId}`, true)}
                        size="small"
                        endIcon={<IconArrowRight size={15} />}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        Paramétrer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
