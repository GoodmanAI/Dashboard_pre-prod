"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { INK, INK_MUTED, BORDER } from "@/lib/jetons";

/**
 * Liste d'attente : place tenue, site par site (27/10/2026, lot L2).
 * Plan workspace `plans/2026-10-file-attente-konnect.md` (K7).
 *
 * Domaine `konnect.file-attente` : `{ sites: { [codeSite]: { placeTenue, caracteristique } } }`,
 * validé par `src/lib/konnectFileAttente.ts`.
 *
 * Coché, quand une place se libère, le portail la réserve dans le logiciel du centre
 * au nom du patient, avec la caractéristique « liste d'attente » du centre, pendant
 * que le patient a le temps de répondre. Personne d'autre ne peut la prendre. Décoché,
 * la place est seulement annoncée au patient, et un autre canal peut la prendre avant
 * lui. Ce qui décide : l'outil SMS du centre réagit-il à la création d'un rendez-vous ?
 * S'il envoie une confirmation, le patient la recevrait avant d'avoir dit oui.
 *
 * Il porte son propre bouton, comme le reste de l'écran « Paramètres du portail ».
 */

const DOMAINE = "konnect.file-attente";

type Site = { siteId: string; libelle: string };
type Reglage = { placeTenue: boolean; caracteristique: string };

export default function FileAttenteKonnect({
  userProductId,
  lectureSeule,
}: {
  userProductId: number | null;
  lectureSeule: string | null;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [reglages, setReglages] = useState<Record<string, Reglage>>({});
  const [initiales, setInitiales] = useState("{}");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const [rs, rc] = await Promise.all([
          fetch(`/api/konnect-sites?userProductId=${userProductId}`),
          fetch(
            `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
          ),
        ]);
        if (!rs.ok || !rc.ok) throw new Error();
        const ds = await rs.json();
        const dc = await rc.json();
        if (annule) return;
        const liste: Site[] = (Array.isArray(ds?.sites) ? ds.sites : []).map(
          (s: any) => ({
            siteId: String(s.site_id ?? "").toUpperCase(),
            libelle: String(s.libelle ?? ""),
          }),
        );
        const brut = dc?.valeur?.sites ?? {};
        const lus: Record<string, Reglage> = {};
        for (const s of liste) {
          const r = brut[s.siteId];
          lus[s.siteId] = {
            placeTenue: r?.placeTenue === true,
            caracteristique:
              typeof r?.caracteristique === "string" ? r.caracteristique : "",
          };
        }
        setSites(liste);
        setReglages(lus);
        setInitiales(JSON.stringify(lus));
      } catch {
        if (!annule)
          setErreur(
            "Impossible de charger les réglages de la liste d'attente.",
          );
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const modifie = useMemo(
    () => JSON.stringify(reglages) !== initiales,
    [reglages, initiales],
  );
  const codeManquant = sites.find(
    (s) =>
      reglages[s.siteId]?.placeTenue &&
      !reglages[s.siteId]?.caracteristique.trim(),
  );

  const maj = (siteId: string, champ: Partial<Reglage>) =>
    setReglages((p) => ({
      ...p,
      [siteId]: {
        ...(p[siteId] ?? { placeTenue: false, caracteristique: "" }),
        ...champ,
      },
    }));

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { sites: reglages } }),
        },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(data?.error ?? "L'enregistrement a été refusé.");
      setInitiales(JSON.stringify(reglages));
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        La liste d&apos;attente s&apos;ouvre examen par examen, dans les examens
        du portail. Ici, vous choisissez pour chaque site ce qui se passe quand
        une place se libère.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        <strong>Place réservée pendant la réponse</strong> : le portail prend le
        rendez-vous dans votre logiciel au nom du patient, avec votre
        caractéristique « liste d&apos;attente », le temps qu&apos;il réponde.
        Personne d&apos;autre ne peut la prendre. À n&apos;activer que si votre
        outil d&apos;envoi de SMS n&apos;écrit pas au patient quand un
        rendez-vous porte cette caractéristique. Sinon, la place est seulement
        annoncée au patient.
      </Typography>

      {sites.length === 0 ? (
        <Alert severity="info">
          Aucun site déclaré pour le portail. Ajoutez vos sites dans « Sites »
          pour régler la liste d&apos;attente.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {sites.map((s) => {
            const r = reglages[s.siteId] ?? {
              placeTenue: false,
              caracteristique: "",
            };
            const manque = r.placeTenue && !r.caracteristique.trim();
            return (
              <Stack
                key={s.siteId}
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems={{ xs: "flex-start", sm: "center" }}
                sx={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 2,
                  px: 2,
                  py: 1.25,
                }}
              >
                <Box sx={{ minWidth: 200, flex: 1 }}>
                  <Typography
                    sx={{ fontSize: 13.5, fontWeight: 600, color: INK }}
                  >
                    {s.libelle || s.siteId}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: INK_MUTED,
                      fontFamily: "monospace",
                    }}
                  >
                    {s.siteId}
                  </Typography>
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={r.placeTenue}
                      disabled={Boolean(lectureSeule)}
                      onChange={(e) =>
                        maj(s.siteId, { placeTenue: e.target.checked })
                      }
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: 13 }}>
                      Place réservée pendant la réponse
                    </Typography>
                  }
                />
                <TextField
                  size="small"
                  label="Code de la caractéristique"
                  placeholder="ATT"
                  value={r.caracteristique}
                  disabled={Boolean(lectureSeule) || !r.placeTenue}
                  error={manque}
                  helperText={
                    manque ? "Indiquez le code, par exemple ATT." : " "
                  }
                  inputProps={{
                    maxLength: 20,
                    style: { textTransform: "uppercase" },
                  }}
                  onChange={(e) =>
                    maj(s.siteId, {
                      caracteristique: e.target.value.toUpperCase(),
                    })
                  }
                  sx={{ width: 220 }}
                />
              </Stack>
            );
          })}
        </Stack>
      )}

      {erreur && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {erreur}
        </Alert>
      )}
      {succes && !modifie && (
        <Alert
          severity="success"
          sx={{ mt: 2 }}
          onClose={() => setSucces(false)}
        >
          Réglages enregistrés. Le portail les reprend à sa prochaine
          synchronisation.
        </Alert>
      )}

      {sites.length > 0 && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button
            variant="contained"
            disableElevation
            disabled={
              !modifie ||
              enregistrement ||
              Boolean(lectureSeule) ||
              Boolean(codeManquant)
            }
            onClick={() => void enregistrer()}
            sx={{
              bgcolor: "var(--accent)",
              "&:hover": { bgcolor: "var(--accent-press)" },
            }}
          >
            {enregistrement ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
