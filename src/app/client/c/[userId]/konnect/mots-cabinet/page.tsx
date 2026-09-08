"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Mots propres au cabinet (lot B, `cabinet_synonyme`).
 *
 * Un même examen a plusieurs noms : le médecin écrit un terme savant, le patient en
 * connaît un autre, le cabinet en emploie un troisième. Quand le patient tape un mot
 * que le moteur ne connaît pas, il ne conclut pas que le moteur est limité : il
 * conclut que le centre ne fait pas cet examen, et il s'en va.
 *
 * CE QUE `cible` EST, ET N'EST PAS. Ce n'est pas un examen, ni un code : Konnect en
 * prend les mots (`tokens(cible)`, `pivot/service.py`) et cherche avec eux à la
 * place de ce que le patient a tapé. C'est une réécriture de recherche. Écrire
 * « arthroscanner genou » marche ; écrire un code RIS ne marcherait pas.
 *
 * Le cabinet est prioritaire sur le référentiel : un terme réglé ici l'emporte sur
 * le synonyme national de même nom (`_charger_synonymes`, cabinet écrase pivot).
 *
 * Le transport existait déjà des deux côtés du pont (`konnect.synonymes`,
 * `DOMAINES_TABLES`) : cet écran est la seule pièce qui manquait.
 */

const DOMAINE = "konnect.synonymes";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";

/** Miroir de `_normaliser_synonyme` : au-delà, Konnect tronque en silence. */
const MAX_TERME = 200;
const MAX_CIBLE = 200;

type Mot = { terme: string; cible: string };

/** Une ligne vide est le geste d'ajout : on ne l'enregistre jamais telle quelle. */
const LIGNE_VIDE: Mot = { terme: "", cible: "" };

export default function MotsCabinetKonnect() {
  const { userProductId } = useCentreProduit();

  const [mots, setMots] = useState<Mot[]>([]);
  const [initial, setInitial] = useState<Mot[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`
        );
        if (!r.ok) throw new Error("Chargement impossible.");
        const d = await r.json();
        if (annule) return;
        const bruts = Array.isArray(d?.valeur?.items) ? d.valeur.items : [];
        const charges: Mot[] = bruts
          .map((i: any) => ({
            terme: typeof i?.terme === "string" ? i.terme : "",
            cible: typeof i?.cible === "string" ? i.cible : "",
          }))
          .filter((m: Mot) => m.terme.trim() !== "");
        setMots(charges);
        setInitial(charges);
      } catch {
        if (!annule) setErreur("Impossible de charger les mots du cabinet.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  // Une entrée par ligne, indexée par position : c'est la convention des autres
  // écrans de liste (`regles-fusion`). Le hook attend un dictionnaire, pas un
  // tableau.
  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    mots.forEach((m, i) => {
      out[`mot:${i}`] = m;
    });
    return out;
  }, [mots]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  // Deux fois le même terme, ce sont deux réécritures concurrentes pour la même
  // recherche : Konnect en garderait une, sans dire laquelle.
  const doublons = useMemo(() => {
    const vus = new Map<string, number>();
    const en_double = new Set<number>();
    mots.forEach((m, i) => {
      const cle = m.terme.trim().toLowerCase();
      if (cle === "") return;
      const premier = vus.get(cle);
      if (premier !== undefined) {
        en_double.add(premier);
        en_double.add(i);
      } else {
        vus.set(cle, i);
      }
    });
    return en_double;
  }, [mots]);

  const incompletes = useMemo(
    () =>
      mots.some(
        (m) =>
          (m.terme.trim() === "") !== (m.cible.trim() === "") // l'un rempli, l'autre non
      ),
    [mots]
  );

  const majLigne = (index: number, champ: keyof Mot, valeur: string) =>
    setMots((prec) => prec.map((m, i) => (i === index ? { ...m, [champ]: valeur } : m)));

  const supprimer = (index: number) =>
    setMots((prec) => prec.filter((_, i) => i !== index));

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      // Les lignes entièrement vides partent sans bruit : c'est un ajout que
      // l'utilisateur n'a pas rempli, pas une erreur à lui signaler.
      const aEnvoyer = mots
        .map((m) => ({ terme: m.terme.trim(), cible: m.cible.trim() }))
        .filter((m) => m.terme !== "" && m.cible !== "");

      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { items: aEnvoyer } }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setMots(aEnvoyer);
      setInitial(aEnvoyer);
      marquerEnregistre();
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Mots du cabinet" description="Les mots que vos patients emploient">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Mots du cabinet" description="Les mots que vos patients emploient">
      <Box>
        <SectionHeader
          title="Mots du cabinet"
          subtitle="Ce que vos patients tapent, et ce qu'il faut chercher à la place"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5, maxWidth: 720 }}>
          Quand un patient cherche un examen avec un mot que le portail ne connaît pas,
          il n&apos;obtient aucun résultat et pense que vous ne faites pas cet examen.
          Ajoutez ici les mots qu&apos;on emploie chez vous, avec ce qu&apos;il faut
          chercher à leur place. Ce que vous mettez ici passe avant le vocabulaire
          général du portail.
        </Typography>

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2 }}>
          {mots.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: INK_MUTED, py: 2, textAlign: "center" }}>
              Aucun mot pour l&apos;instant. Le portail utilise son vocabulaire général.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={2} sx={{ px: 0.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: INK, flex: 1 }}>
                  Le mot tapé par le patient
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: INK, flex: 1 }}>
                  Ce qu&apos;il faut chercher à la place
                </Typography>
                <Box sx={{ width: 40 }} />
              </Stack>

              {mots.map((m, i) => (
                <Stack key={i} direction="row" spacing={2} alignItems="flex-start">
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="arthro genou"
                    value={m.terme}
                    error={doublons.has(i)}
                    helperText={doublons.has(i) ? "Ce mot est déjà dans la liste." : " "}
                    inputProps={{ maxLength: MAX_TERME }}
                    onChange={(e) => majLigne(i, "terme", e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="arthroscanner genou"
                    value={m.cible}
                    error={m.terme.trim() !== "" && m.cible.trim() === ""}
                    helperText={
                      m.terme.trim() !== "" && m.cible.trim() === ""
                        ? "Sans ça, la recherche ne mène nulle part."
                        : " "
                    }
                    inputProps={{ maxLength: MAX_CIBLE }}
                    onChange={(e) => majLigne(i, "cible", e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => supprimer(i)}
                    aria-label={`Supprimer le mot ${m.terme || "vide"}`}
                    sx={{ mt: 0.5 }}
                  >
                    <IconTrash size={17} />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}

          <Button
            size="small"
            startIcon={<IconPlus size={16} />}
            onClick={() => setMots((prec) => [...prec, { ...LIGNE_VIDE }])}
            sx={{ textTransform: "none", mt: mots.length === 0 ? 0 : 1 }}
          >
            Ajouter un mot
          </Button>
        </Paper>

        {doublons.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Deux lignes portent le même mot. Gardez-en une : sinon le portail en
            choisit une, et vous ne saurez pas laquelle.
          </Alert>
        )}

        {incompletes && doublons.size === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Une ligne n&apos;est remplie qu&apos;à moitié. Elle ne sera pas enregistrée.
          </Alert>
        )}

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={() => setMots(initial)}
          libelle="Enregistrer les mots"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Mots enregistrés. Le portail patient les appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
