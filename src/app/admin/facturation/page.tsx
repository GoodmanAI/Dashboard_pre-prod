"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import TuileChiffre from "@/components/shared/TuileChiffre";
import Retour from "@/components/shared/Retour";
import SallesDuClient from "@/components/salles/SallesDuClient";
import { euros, type Tarifs } from "@/lib/sallesFacturees";
import { BORDER, INK, INK_MUTED, OK, WARNING } from "@/lib/jetons";

/**
 * Facturation à la salle, tous clients (02/11/2026). Plan :
 * `lyrae/plans/2026-11-salles-facturees-talk-konnect.md`.
 *
 * Le prix d'une salle par produit, le tableau client par site (salles et montant
 * mensuel TTC), l'export CSV, et le réglage des salles du client choisi. Les montants
 * sont par site Xplore : le regroupement de sites en un client viendra plus tard.
 */

type Ligne = {
  userId: number;
  nom: string;
  codeSite: string | null;
  talk: number;
  konnect: number;
  talkCts: number;
  konnectCts: number;
  totalCts: number;
  aRegler: ("talk" | "konnect")[];
};

type Donnees = { tarifs: Tarifs; lignes: Ligne[]; totalCts: number };

const enEuros = (cts: number) => String(cts / 100).replace(".", ",");

export default function FacturationPage() {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [saisie, setSaisie] = useState({ talk: "", konnect: "" });
  const [client, setClient] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const appliquer = useCallback((d: Donnees) => {
    setDonnees(d);
    setSaisie({ talk: enEuros(d.tarifs.talk), konnect: enEuros(d.tarifs.konnect) });
  }, []);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/facturation");
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error ?? "La facturation n'a pas pu être lue. Rechargez la page.");
      appliquer(d);
    } catch (e: any) {
      setErreur(e?.message ?? "La facturation n'a pas pu être lue. Rechargez la page.");
    }
  }, [appliquer]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Le client choisi a pu changer ses salles : on relit le tableau quand on le ferme.
  function choisir(userId: number | null) {
    setClient(userId);
    if (userId === null) void charger();
  }

  async function enregistrerTarifs() {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch("/api/admin/facturation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarifs: saisie }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Les prix n'ont pas été enregistrés.");
      appliquer(d);
      setSucces("Prix enregistrés.");
    } catch (e: any) {
      setErreur(e?.message ?? "Les prix n'ont pas été enregistrés. Réessayez.");
    } finally {
      setOccupe(false);
    }
  }

  const tarifsModifies =
    donnees !== null &&
    (saisie.talk !== enEuros(donnees.tarifs.talk) || saisie.konnect !== enEuros(donnees.tarifs.konnect));

  const totaux = (donnees?.lignes ?? []).reduce(
    (s, l) => ({
      talk: s.talk + l.talk,
      konnect: s.konnect + l.konnect,
      talkCts: s.talkCts + l.talkCts,
      konnectCts: s.konnectCts + l.konnectCts,
    }),
    { talk: 0, konnect: 0, talkCts: 0, konnectCts: 0 }
  );
  const aRegler = new Set((donnees?.lignes ?? []).filter((l) => l.aRegler.length > 0).map((l) => l.userId));

  return (
    <PageContainer title="Facturation" description="Salles facturées, tous clients">
      <Box>
        <SectionHeader
          title="Facturation"
          subtitle="Talk et Konnect se facturent à la salle. Montants mensuels TTC, par client et par site."
          actions={
            <Button
              variant="outlined"
              startIcon={<IconFileSpreadsheet size={16} />}
              href="/api/admin/facturation?format=csv"
            >
              Exporter en CSV
            </Button>
          }
        />

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur(null)}>
            {erreur}
          </Alert>
        )}

        {!donnees ? (
          <Typography sx={{ fontSize: 13, color: INK_MUTED }}>Lecture en cours…</Typography>
        ) : (
          <>
            <Box
              id="facturation-chiffres"
              sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5, mb: 2 }}
            >
              <TuileChiffre libelle="Total mensuel TTC" valeur={euros(donnees.totalCts)} couleur={OK} />
              <TuileChiffre
                libelle="Salles Talk"
                valeur={totaux.talk}
                detail={`${euros(totaux.talkCts)} par mois`}
              />
              <TuileChiffre
                libelle="Salles Konnect"
                valeur={totaux.konnect}
                detail={`${euros(totaux.konnectCts)} par mois`}
              />
            </Box>

            <Paper id="facturation-prix" variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK, mb: 1 }}>
                Prix d&apos;une salle, par mois, TTC
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                <TextField
                  size="small"
                  label="Talk (€)"
                  value={saisie.talk}
                  onChange={(e) => setSaisie((s) => ({ ...s, talk: e.target.value }))}
                  sx={{ width: { sm: 140 } }}
                />
                <TextField
                  size="small"
                  label="Konnect (€)"
                  value={saisie.konnect}
                  onChange={(e) => setSaisie((s) => ({ ...s, konnect: e.target.value }))}
                  sx={{ width: { sm: 140 } }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  disabled={occupe || !tarifsModifies}
                  onClick={() => void enregistrerTarifs()}
                  sx={{ bgcolor: "var(--accent)" }}
                >
                  Enregistrer les prix
                </Button>
              </Stack>
            </Paper>

            <Paper id="facturation-clients" variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, mb: 2, overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>Site</TableCell>
                    <TableCell align="right">Salles Talk</TableCell>
                    <TableCell align="right">Salles Konnect</TableCell>
                    <TableCell align="right">Par mois TTC</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {donnees.lignes.map((l, i) => (
                    <TableRow key={`${l.userId}-${l.codeSite ?? i}`} selected={client === l.userId}>
                      <TableCell sx={{ fontSize: 13 }}>
                        {l.nom}
                        {l.aRegler.length > 0 && (
                          <Chip
                            size="small"
                            label={`${l.aRegler.map((p) => (p === "talk" ? "Talk" : "Konnect")).join(" et ")} à régler`}
                            sx={{ ml: 1, color: WARNING, fontSize: 11 }}
                            variant="outlined"
                          />
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 13, fontFamily: "monospace" }}>{l.codeSite ?? "-"}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 13 }}>
                        {l.talk}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 13 }}>
                        {l.konnect}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 13, fontWeight: 600 }}>
                        {euros(l.totalCts)}
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => choisir(client === l.userId ? null : l.userId)}>
                          {client === l.userId ? "Fermer" : "Régler les salles"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            {aRegler.size > 0 && (
              <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mb: 2 }}>
                « À régler » : le client a le produit mais aucune salle cochée. Le produit cherche
                alors dans toutes ses salles et rien n&apos;est facturé.
              </Typography>
            )}

            {client !== null && <SallesDuClient key={client} userId={client} />}
          </>
        )}
      </Box>
      <Retour ouvert={succes !== null} message={succes ?? ""} gravite="success" onFermer={() => setSucces(null)} />
    </PageContainer>
  );
}
