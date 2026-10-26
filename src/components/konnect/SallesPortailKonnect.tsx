"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import Retour from "@/components/shared/Retour";
import { EXAM_TYPE_LABELS } from "@/components/shared/ExamTypeBadge";
import { EXAM_TYPES, type ExamType } from "@/lib/examTypes";
import {
  DOMAINE_SALLES_KONNECT,
  lireReleve,
  lireSallesKonnect,
  type SallesKonnect,
} from "@/lib/konnectSalles";
import { LIBELLE_SALLE_MAX, normaliserPoste } from "@/lib/sallesExamen";
import { BORDER, INK, INK_MUTED, OK, SURFACE_MUTED, WARNING } from "@/lib/jetons";

/**
 * Les salles ouvertes au portail Konnect d'un centre (26/10/2026), dans l'écran
 * d'installation. Plan : `lyrae/plans/2026-10-salles-ouvertes-konnect.md`.
 *
 * Konnect se facture par salle : l'équipe déclare les salles du centre et ouvre
 * celles qu'il a prises. Le centre ne voit que les salles ouvertes, dans sa
 * correspondance des examens, où il peut en choisir par examen.
 *
 * Le relevé vient de `GetInfos` d'Xplore (`paramsRVE.postesOpenRVE`), par
 * AI2Xplore : le Dashboard ne l'atteint pas (VM derrière le VPN), on le colle.
 */

type Rangee = { poste: string; libelle: string; type: ExamType | ""; ouverte: boolean };

function versRangees(config: SallesKonnect): Rangee[] {
  const ouvertes = new Set(config.ouvertes);
  const sortie: Rangee[] = [];
  for (const type of EXAM_TYPES) {
    for (const s of config.sallesParType[type] ?? []) {
      sortie.push({ ...s, type, ouverte: ouvertes.has(s.poste) });
    }
  }
  return sortie;
}

function versValeur(rangees: Rangee[]) {
  const sallesParType: Record<string, { poste: string; libelle: string }[]> = {};
  for (const r of rangees) {
    if (!r.type) continue;
    (sallesParType[r.type] ??= []).push({
      poste: normaliserPoste(r.poste),
      libelle: r.libelle.trim(),
    });
  }
  return {
    sallesParType,
    ouvertes: rangees.filter((r) => r.ouverte).map((r) => normaliserPoste(r.poste)),
  };
}

const nomType = (t: ExamType) => EXAM_TYPE_LABELS[t] ?? t;

export default function SallesPortailKonnect({ userProductId }: { userProductId: number }) {
  const [rangees, setRangees] = useState<Rangee[]>([]);
  const [initial, setInitial] = useState("");
  const [releve, setReleve] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    setReleve("");
    (async () => {
      try {
        const r = await fetch(
          `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_SALLES_KONNECT}`
        );
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (annule) return;
        const lues = versRangees(lireSallesKonnect(d?.valeur));
        setRangees(lues);
        setInitial(JSON.stringify(versValeur(lues)));
      } catch {
        if (!annule) setErreur("Impossible de lire les salles du centre. Rechargez la page.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const modifie = JSON.stringify(versValeur(rangees)) !== initial;
  const incomplete = rangees.some(
    (r) => !normaliserPoste(r.poste) || !r.libelle.trim() || !r.type
  );

  /** Par type déclaré : les salles ouvertes, ou le rappel s'il n'y en a aucune. */
  const resume = useMemo(
    () =>
      EXAM_TYPES.map((type) => {
        const du = rangees.filter((r) => r.type === type);
        return { type, declarees: du.length, ouvertes: du.filter((r) => r.ouverte) };
      }).filter((t) => t.declarees > 0),
    [rangees]
  );
  const nbOuvertes = rangees.filter((r) => r.ouverte && r.type).length;

  function maj(index: number, champ: Partial<Rangee>) {
    setRangees((prev) => prev.map((r, i) => (i === index ? { ...r, ...champ } : r)));
  }

  function ajouterReleve() {
    const deja = new Set(rangees.map((r) => normaliserPoste(r.poste)));
    const nouvelles = lireReleve(releve)
      .filter((s) => !deja.has(s.poste))
      // Fermées par défaut : ouvrir une salle, c'est la facturer, cela se décide.
      .map((s): Rangee => ({ poste: s.poste, libelle: s.libelle, type: s.type ?? "", ouverte: false }));
    setRangees((prev) => [...prev, ...nouvelles]);
    setReleve("");
  }

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE_SALLES_KONNECT}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: versValeur(rangees) }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      const ecrites = versRangees(lireSallesKonnect(data?.valeur));
      setRangees(ecrites);
      setInitial(JSON.stringify(versValeur(ecrites)));
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK, mb: 0.5 }}>
        Salles ouvertes au portail
      </Typography>
      <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
        Le portail se facture par salle. Il ne propose que les créneaux des salles ouvertes ici,
        et refuse une réservation ailleurs. Un type sans salle déclarée n&apos;est pas filtré. Un
        type dont aucune salle n&apos;est ouverte passe au rappel : le patient laisse son numéro et
        le centre le rappelle. Le centre peut ensuite choisir, examen par examen, parmi les salles
        ouvertes.
      </Typography>

      {erreur && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {chargement ? (
        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>Lecture en cours…</Typography>
      ) : (
        <>
          <Box sx={{ p: 1.5, mb: 1.5, bgcolor: SURFACE_MUTED, borderRadius: 1.5 }}>
            <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1 }}>
              Collez le relevé du logiciel du centre : la liste <code>postesOpenRVE</code> que
              renvoie <code>getInfos</code> d&apos;AI2Xplore (par exemple
              « ME-CT1;ME-RX1;ME-RX2 »). Les salles arrivent fermées ; le type est deviné
              d&apos;après le code quand il le dit.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
              <TextField
                size="small"
                fullWidth
                placeholder="ME-CT1;ME-MG1;ME-MR1;ME-RX1;ME-RX2;ME-US1"
                value={releve}
                onChange={(e) => setReleve(e.target.value)}
                inputProps={{ style: { fontFamily: "monospace", fontSize: 13 } }}
              />
              <Button
                variant="outlined"
                disabled={!releve.trim()}
                onClick={ajouterReleve}
                sx={{ whiteSpace: "nowrap" }}
              >
                Ajouter ces salles
              </Button>
            </Stack>
          </Box>

          {rangees.length === 0 ? (
            <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mb: 1.5 }}>
              Aucune salle déclarée : le portail cherche dans toutes les salles du centre.
            </Typography>
          ) : (
            <Stack spacing={1} sx={{ mb: 1.5 }}>
              {rangees.map((r, i) => (
                <Stack
                  key={i}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  sx={{ borderBottom: `1px solid ${BORDER}`, pb: 1 }}
                >
                  <TextField
                    size="small"
                    label="Poste"
                    value={r.poste}
                    onChange={(e) => maj(i, { poste: e.target.value })}
                    inputProps={{ style: { fontFamily: "monospace", fontSize: 13 } }}
                    sx={{ width: { sm: 150 } }}
                  />
                  <TextField
                    size="small"
                    label="Nom"
                    value={r.libelle}
                    onChange={(e) => maj(i, { libelle: e.target.value })}
                    inputProps={{ maxLength: LIBELLE_SALLE_MAX }}
                    sx={{ width: { sm: 150 } }}
                  />
                  <Select
                    size="small"
                    displayEmpty
                    value={r.type}
                    onChange={(e) => maj(i, { type: e.target.value as ExamType | "" })}
                    sx={{ width: { sm: 210 }, fontSize: 13 }}
                  >
                    <MenuItem value="">
                      <span style={{ color: WARNING }}>Type à choisir</span>
                    </MenuItem>
                    {EXAM_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>
                        {nomType(t)} ({t})
                      </MenuItem>
                    ))}
                  </Select>
                  <Stack direction="row" alignItems="center" sx={{ flexGrow: 1 }}>
                    <Switch
                      checked={r.ouverte}
                      onChange={(e) => maj(i, { ouverte: e.target.checked })}
                    />
                    <Typography sx={{ fontSize: 13, color: r.ouverte ? OK : INK_MUTED }}>
                      {r.ouverte ? "Ouverte" : "Fermée"}
                    </Typography>
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

          {resume.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              {resume.map(({ type, ouvertes }) => (
                <Typography key={type} sx={{ fontSize: 12.5, color: ouvertes.length ? INK : WARNING }}>
                  {nomType(type)} :{" "}
                  {ouvertes.length
                    ? `${ouvertes.map((r) => r.libelle.trim() || r.poste).join(", ")} ${
                        ouvertes.length > 1 ? "ouvertes" : "ouverte"
                      }`
                    : "aucune salle ouverte, les examens passent au rappel"}
                </Typography>
              ))}
              <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mt: 0.5 }}>
                {nbOuvertes} salle{nbOuvertes > 1 ? "s" : ""} ouverte{nbOuvertes > 1 ? "s" : ""}{" "}
                sur {rangees.length}.
              </Typography>
            </Box>
          )}

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              startIcon={<IconPlus size={16} />}
              onClick={() =>
                setRangees((prev) => [...prev, { poste: "", libelle: "", type: "", ouverte: false }])
              }
            >
              Ajouter une salle
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            {incomplete && (
              <Typography sx={{ fontSize: 12, color: WARNING }}>
                Chaque salle a besoin d&apos;un poste, d&apos;un nom et d&apos;un type.
              </Typography>
            )}
            <Button
              variant="contained"
              disableElevation
              disabled={enregistrement || !modifie || incomplete}
              onClick={() => void enregistrer()}
              sx={{ bgcolor: "var(--accent)" }}
            >
              Enregistrer
            </Button>
          </Stack>
        </>
      )}

      <Retour
        ouvert={succes}
        message="Salles enregistrées. Le portail les applique à sa prochaine synchronisation."
        gravite="success"
        onFermer={() => setSucces(false)}
      />
    </Paper>
  );
}
