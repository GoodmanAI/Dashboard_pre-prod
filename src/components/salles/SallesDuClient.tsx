"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconDownload, IconPlus, IconTrash } from "@tabler/icons-react";

import Retour from "@/components/shared/Retour";
import { EXAM_TYPE_LABELS } from "@/components/shared/ExamTypeBadge";
import { EXAM_TYPES, type ExamType } from "@/lib/examTypes";
import { lireReleve } from "@/lib/konnectSalles";
import { LIBELLE_SALLE_MAX, normaliserPoste } from "@/lib/sallesExamen";
import { euros, facturer, type LigneSalle, type Tarifs } from "@/lib/sallesFacturees";
import { BORDER, INK, INK_MUTED, OK, SURFACE_MUTED, WARNING } from "@/lib/jetons";

/**
 * Les salles d'un client et celles qu'il paie, par produit (02/11/2026). Plan :
 * `lyrae/plans/2026-11-salles-facturees-talk-konnect.md`.
 *
 * Une salle est déclarée une fois, avec une case Talk et une case Konnect. Talk et
 * Konnect ne prennent de RDV que dans les salles cochées pour eux ; tant qu'aucune
 * case d'un produit n'est cochée, ce produit cherche partout, comme avant.
 *
 * Remplace le bloc « Salles ouvertes au portail » de Konnect, dont il reprend la
 * forme, et la saisie JSON de `talk.site.sallesParType`.
 */

type Rangee = {
  codeSite: string;
  poste: string;
  libelle: string;
  type: ExamType | "";
  talk: boolean;
  konnect: boolean;
};

type Etat = {
  client: {
    userId: number;
    nom: string;
    produits: { talk: number | null; konnect: number | null };
    sites: string[];
  };
  salles: LigneSalle[];
  tarifs: Tarifs;
  releve: boolean;
  tableAbsente: boolean;
};

const nomType = (t: ExamType) => EXAM_TYPE_LABELS[t] ?? t;

function versRangees(salles: LigneSalle[]): Rangee[] {
  return salles.map((s) => ({
    codeSite: s.codeSite ?? "",
    poste: s.poste,
    libelle: s.libelle,
    type: s.typeExamen,
    talk: s.talk,
    konnect: s.konnect,
  }));
}

function versEnvoi(rangees: Rangee[]) {
  return rangees.map((r) => ({
    codeSite: r.codeSite.trim() || null,
    poste: normaliserPoste(r.poste),
    typeExamen: r.type,
    libelle: r.libelle.trim(),
    talk: r.talk,
    konnect: r.konnect,
  }));
}

export default function SallesDuClient({ userId }: { userId: number }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [rangees, setRangees] = useState<Rangee[]>([]);
  const [initial, setInitial] = useState("");
  const [colle, setColle] = useState("");
  const [siteReleve, setSiteReleve] = useState("");
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const appliquer = useCallback((d: Etat) => {
    setEtat(d);
    const r = versRangees(d.salles);
    setRangees(r);
    setInitial(JSON.stringify(versEnvoi(r)));
    setSiteReleve((s) => s || d.client.sites[0] || "");
  }, []);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    (async () => {
      try {
        const r = await fetch(`/api/admin/salles?userId=${userId}`);
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error ?? "Impossible de lire les salles du client. Rechargez la page.");
        if (!annule) appliquer(d);
      } catch (e: any) {
        if (!annule) setErreur(e?.message ?? "Impossible de lire les salles du client. Rechargez la page.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userId, appliquer]);

  const produits = etat?.client.produits ?? { talk: null, konnect: null };
  const modifie = JSON.stringify(versEnvoi(rangees)) !== initial;
  const incomplete = rangees.some((r) => !normaliserPoste(r.poste) || !r.libelle.trim() || !r.type);

  // Ce que l'écran facturera une fois enregistré : calculé sur la saisie en cours.
  const apercu = useMemo(() => {
    if (!etat) return null;
    const lignes = rangees
      .filter((r) => r.type)
      .map((r, i) => ({
        id: i,
        codeSite: r.codeSite.trim() || null,
        poste: normaliserPoste(r.poste),
        typeExamen: r.type as ExamType,
        libelle: r.libelle,
        talk: r.talk,
        konnect: r.konnect,
      }));
    const facture = facturer(lignes, etat.tarifs);
    const total = facture.reduce(
      (s, f) => ({
        talk: s.talk + f.salles.talk,
        konnect: s.konnect + f.salles.konnect,
        cts: s.cts + f.totalCts,
      }),
      { talk: 0, konnect: 0, cts: 0 }
    );
    return { facture, total };
  }, [rangees, etat]);

  /** Par produit actif : les modalités sans salle cochée, fermées à la prise de RDV. */
  const fermes = useMemo(() => {
    const sortie: { produit: "talk" | "konnect"; types: ExamType[] }[] = [];
    for (const p of ["talk", "konnect"] as const) {
      if (!rangees.some((r) => r[p])) continue;
      sortie.push({
        produit: p,
        types: EXAM_TYPES.filter((t) => !rangees.some((r) => r.type === t && r[p])),
      });
    }
    return sortie;
  }, [rangees]);

  function maj(index: number, champ: Partial<Rangee>) {
    setRangees((prev) => prev.map((r, i) => (i === index ? { ...r, ...champ } : r)));
  }

  /**
   * Ajoute les salles relevées qui manquent. Cochées pour les produits du client : au
   * départ, toutes les salles ouvertes en ligne sont validées (Enzo, 02/11/2026). Rien
   * n'est enregistré avant le clic sur « Enregistrer ».
   */
  function ajouter(salles: { poste: string; libelle: string; type: ExamType | null }[], codeSite: string) {
    const deja = new Set(rangees.map((r) => normaliserPoste(r.poste)));
    const nouvelles = salles
      .filter((s) => !deja.has(s.poste))
      .map(
        (s): Rangee => ({
          codeSite,
          poste: s.poste,
          libelle: s.libelle,
          type: s.type ?? "",
          talk: produits.talk !== null,
          konnect: produits.konnect !== null,
        })
      );
    setRangees((prev) => [...prev, ...nouvelles]);
    return nouvelles.length;
  }

  async function relever() {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch("/api/admin/salles/releve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeSite: siteReleve }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Le relevé n'a pas abouti. Réessayez.");
      const n = ajouter(d.salles ?? [], d.codeSite ?? siteReleve);
      setSucces(
        n > 0
          ? `${n} salle${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""}. Relisez puis enregistrez.`
          : "Aucune salle nouvelle : toutes celles d'Xplore sont déjà dans la liste."
      );
    } catch (e: any) {
      setErreur(e?.message ?? "Le relevé n'a pas abouti. Réessayez.");
    } finally {
      setOccupe(false);
    }
  }

  async function enregistrer() {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch("/api/admin/salles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, salles: versEnvoi(rangees) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "L'enregistrement a été refusé.");
      appliquer(d);
      setSucces("Salles enregistrées. Talk les applique au prochain appel, Konnect à sa prochaine synchronisation.");
    } catch (e: any) {
      setErreur(e?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Paper id="salles-du-client" variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK, mb: 0.5 }}>
        Salles facturées{etat ? ` : ${etat.client.nom}` : ""}
      </Typography>
      <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
        Talk et Konnect se facturent à la salle. Chaque produit ne prend de rendez-vous que dans
        les salles cochées pour lui. Une modalité sans salle cochée est fermée : Talk transfère au
        secrétariat, Konnect propose le rappel. Tant qu&apos;aucune salle n&apos;est cochée pour un
        produit, il cherche dans toutes les salles, comme avant.
      </Typography>

      {erreur && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}
      {etat?.tableAbsente && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          La table des salles n&apos;existe pas encore sur ce serveur. Passez le SQL du 02/11 avant
          d&apos;enregistrer.
        </Alert>
      )}

      {chargement || !etat ? (
        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>Lecture en cours…</Typography>
      ) : (
        <>
          <Box sx={{ p: 1.5, mb: 1.5, bgcolor: SURFACE_MUTED, borderRadius: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1 }}>
              Relevez les salles ouvertes à la prise de rendez-vous en ligne dans Xplore. Elles
              arrivent cochées pour les produits du client ; décochez celles qu&apos;il ne prend pas.
              Xplore rend toutes les salles de sa base : vérifiez le site de chacune.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ mb: 1 }}>
              <TextField
                size="small"
                label="Site Xplore"
                value={siteReleve}
                onChange={(e) => setSiteReleve(e.target.value.toUpperCase())}
                inputProps={{ list: "sites-du-client", style: { fontFamily: "monospace", fontSize: 13 } }}
                sx={{ width: { sm: 160 } }}
              />
              <datalist id="sites-du-client">
                {etat.client.sites.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Button
                variant="outlined"
                startIcon={<IconDownload size={16} />}
                disabled={!etat.releve || !siteReleve.trim() || occupe}
                onClick={() => void relever()}
                sx={{ whiteSpace: "nowrap" }}
              >
                Relever depuis Xplore
              </Button>
              {!etat.releve && (
                <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                  Relevé automatique indisponible sur ce serveur : collez la liste ci-dessous.
                </Typography>
              )}
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
              <TextField
                size="small"
                fullWidth
                placeholder="Ou collez la liste : ME-CT1;ME-MG1;ME-RX1;ME-RX2"
                value={colle}
                onChange={(e) => setColle(e.target.value)}
                inputProps={{ style: { fontFamily: "monospace", fontSize: 13 } }}
              />
              <Button
                variant="outlined"
                disabled={!colle.trim()}
                onClick={() => {
                  ajouter(lireReleve(colle), siteReleve.trim());
                  setColle("");
                }}
                sx={{ whiteSpace: "nowrap" }}
              >
                Ajouter ces salles
              </Button>
            </Stack>
          </Box>

          {rangees.length === 0 ? (
            <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mb: 1.5 }}>
              Aucune salle déclarée : Talk et Konnect cherchent dans toutes les salles du centre.
            </Typography>
          ) : (
            <Stack spacing={1} sx={{ mb: 1.5 }}>
              {rangees.map((r, i) => (
                <Stack
                  key={i}
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", md: "center" }}
                  sx={{ borderBottom: `1px solid ${BORDER}`, pb: 1 }}
                >
                  <TextField
                    size="small"
                    label="Site"
                    value={r.codeSite}
                    onChange={(e) => maj(i, { codeSite: e.target.value.toUpperCase() })}
                    inputProps={{ list: "sites-du-client", style: { fontFamily: "monospace", fontSize: 13 } }}
                    sx={{ width: { md: 100 } }}
                  />
                  <TextField
                    size="small"
                    label="Poste"
                    value={r.poste}
                    onChange={(e) => maj(i, { poste: e.target.value })}
                    inputProps={{ style: { fontFamily: "monospace", fontSize: 13 } }}
                    sx={{ width: { md: 130 } }}
                  />
                  <TextField
                    size="small"
                    label="Nom"
                    value={r.libelle}
                    onChange={(e) => maj(i, { libelle: e.target.value })}
                    inputProps={{ maxLength: LIBELLE_SALLE_MAX }}
                    sx={{ width: { md: 130 } }}
                  />
                  <Select
                    size="small"
                    displayEmpty
                    value={r.type}
                    onChange={(e) => maj(i, { type: e.target.value as ExamType | "" })}
                    sx={{ width: { md: 190 }, fontSize: 13 }}
                  >
                    <MenuItem value="">
                      <span style={{ color: WARNING }}>Modalité à choisir</span>
                    </MenuItem>
                    {EXAM_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>
                        {nomType(t)} ({t})
                      </MenuItem>
                    ))}
                  </Select>
                  <Stack direction="row" alignItems="center" sx={{ flexGrow: 1 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={r.talk}
                          disabled={produits.talk === null}
                          onChange={(e) => maj(i, { talk: e.target.checked })}
                        />
                      }
                      label={<Typography sx={{ fontSize: 13 }}>Talk</Typography>}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={r.konnect}
                          disabled={produits.konnect === null}
                          onChange={(e) => maj(i, { konnect: e.target.checked })}
                        />
                      }
                      label={<Typography sx={{ fontSize: 13 }}>Konnect</Typography>}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <Tooltip title="Retirer cette salle" arrow>
                      <IconButton
                        size="small"
                        aria-label={`Retirer ${r.poste || "cette salle"}`}
                        onClick={() => setRangees((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <IconTrash size={16} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}

          {fermes.map(({ produit, types }) =>
            types.length === 0 ? null : (
              <Typography key={produit} sx={{ fontSize: 12.5, color: WARNING }}>
                {produit === "talk" ? "Talk" : "Konnect"} : {types.map(nomType).join(", ")}{" "}
                {types.length > 1 ? "fermés" : "fermé"}{" "}
                {produit === "talk" ? "(transfert au secrétariat)" : "(rappel du patient)"}.
              </Typography>
            )
          )}

          {apercu && (
            <Box sx={{ my: 1.5 }}>
              {apercu.facture.map((f) => (
                <Typography key={f.codeSite ?? "-"} sx={{ fontSize: 12.5, color: INK }}>
                  {f.codeSite ?? "Site non précisé"} : {f.salles.talk} salle{f.salles.talk > 1 ? "s" : ""} Talk (
                  {euros(f.montantCts.talk)}), {f.salles.konnect} salle{f.salles.konnect > 1 ? "s" : ""} Konnect (
                  {euros(f.montantCts.konnect)}), {euros(f.totalCts)} par mois
                </Typography>
              ))}
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: apercu.total.cts ? OK : INK_MUTED, mt: 0.5 }}>
                Total : {euros(apercu.total.cts)} TTC par mois
              </Typography>
            </Box>
          )}

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              startIcon={<IconPlus size={16} />}
              onClick={() =>
                setRangees((prev) => [
                  ...prev,
                  { codeSite: siteReleve, poste: "", libelle: "", type: "", talk: false, konnect: false },
                ])
              }
            >
              Ajouter une salle
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            {incomplete && (
              <Typography sx={{ fontSize: 12, color: WARNING }}>
                Chaque salle a besoin d&apos;un poste, d&apos;un nom et d&apos;une modalité.
              </Typography>
            )}
            <Button
              variant="contained"
              disableElevation
              disabled={occupe || !modifie || incomplete || etat.tableAbsente}
              onClick={() => void enregistrer()}
              sx={{ bgcolor: "var(--accent)" }}
            >
              Enregistrer
            </Button>
          </Stack>
        </>
      )}

      <Retour
        ouvert={succes !== null}
        message={succes ?? ""}
        gravite="success"
        onFermer={() => setSucces(null)}
      />
    </Paper>
  );
}
