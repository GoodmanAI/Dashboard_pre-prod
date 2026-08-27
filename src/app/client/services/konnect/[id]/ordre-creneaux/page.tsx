"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Ordre de proposition des créneaux (lot E, `cabinet_slot_ranking`).
 *
 * Éteint par défaut : sans rien cocher, le portail propose les créneaux dans
 * l'ordre chronologique. Les deux réglages ci-dessous changent la façon de trier,
 * jamais ce qui est proposé : aucun créneau n'est retiré au patient.
 *
 * Seul domaine du registre qui porte **une seule ligne par cabinet**, d'où la forme
 * de la valeur enregistrée : l'objet est la configuration, pas une liste.
 *
 * Les curseurs avancés de Konnect (poids détaillés, bonus par jour et par heure) ne
 * sont pas exposés ici, et l'écran le dit : ils repartent à leurs valeurs
 * prédéfinies au premier enregistrement depuis le Dashboard.
 */

const DOMAINE = "konnect.slot-ranking";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";

/** Miroir de `TOLERANCES_VALIDES` (`slot_ranking/api.py`). */
const TOLERANCES = [
  { valeur: 0, libelle: "Le premier jour disponible seulement" },
  { valeur: 1, libelle: "Jusqu'au lendemain du premier disponible" },
  { valeur: 2, libelle: "Jusqu'à 2 jours après" },
  { valeur: 3, libelle: "Jusqu'à 3 jours après" },
  { valeur: 7, libelle: "Jusqu'à une semaine après" },
];

type Config = { compacter: boolean; desirabilite: boolean; tolerance_jours: number };

const DEFAUT: Config = { compacter: false, desirabilite: false, tolerance_jours: 1 };

function Reglage({
  titre,
  aide,
  actif,
  onChange,
}: {
  titre: string;
  aide: string;
  actif: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Stack
      direction="row"
      alignItems="flex-start"
      spacing={2}
      sx={{ px: 2, py: 1.75, borderBottom: `1px solid ${BORDER}`, "&:last-of-type": { borderBottom: "none" } }}
    >
      <Box sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>{titre}</Typography>
        <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 0.25 }}>{aide}</Typography>
      </Box>
      <Switch checked={actif} onChange={(e) => onChange(e.target.checked)} />
    </Stack>
  );
}

export default function OrdreCreneauxKonnect() {
  const params = useParams();
  const userProductId = Number(params?.id);

  const [config, setConfig] = useState<Config>(DEFAUT);
  const [initial, setInitial] = useState<Config>(DEFAUT);
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
        const v = d?.valeur ?? {};
        const charge: Config = {
          compacter: v.compacter === true,
          desirabilite: v.desirabilite === true,
          tolerance_jours: TOLERANCES.some((t) => t.valeur === v.tolerance_jours)
            ? v.tolerance_jours
            : 1,
        };
        setConfig(charge);
        setInitial(charge);
      } catch {
        if (!annule) setErreur("Impossible de charger l'ordre des créneaux.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const etatSuivi = useMemo(
    () => ({
      compacter: config.compacter,
      desirabilite: config.desirabilite,
      tolerance: config.tolerance_jours,
    }),
    [config]
  );

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: config }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial(config);
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
      <PageContainer title="Ordre des créneaux" description="Comment les horaires sont proposés">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Ordre des créneaux" description="Comment les horaires sont proposés">
      <Box>
        <SectionHeader
          title="Ordre des créneaux"
          subtitle="Dans quel ordre les horaires sont proposés au patient"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          Par défaut, le portail propose les créneaux du plus tôt au plus tard. Les
          deux réglages ci-dessous changent l&apos;ordre, jamais ce qui est proposé :
          aucun créneau n&apos;est retiré au patient.
        </Typography>

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2 }}>
          <Reglage
            titre="Grouper les rendez-vous"
            aide="Met en avant les horaires qui se collent à ceux déjà pris, pour éviter les trous dans votre planning."
            actif={config.compacter}
            onChange={(v) => setConfig((c) => ({ ...c, compacter: v }))}
          />
          <Reglage
            titre="Tenir compte des horaires qui partent mal"
            aide="Fait remonter les créneaux que les patients choisissent rarement, d'après ce qui a été observé chez vous."
            actif={config.desirabilite}
            onChange={(v) => setConfig((c) => ({ ...c, desirabilite: v }))}
          />
        </Paper>

        <Box sx={{ mt: 3 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, mb: 0.5 }}>
            Jusqu&apos;où chercher
          </Typography>
          <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1 }}>
            Le créneau mis en avant ne sera jamais plus tard que ça. Au delà, le
            patient garde la main sur la liste complète.
          </Typography>
          <Select
            size="small"
            value={config.tolerance_jours}
            onChange={(e) =>
              setConfig((c) => ({ ...c, tolerance_jours: Number(e.target.value) }))
            }
            sx={{ minWidth: 380, fontSize: 13, bgcolor: SURFACE }}
          >
            {TOLERANCES.map((t) => (
              <MenuItem key={t.valeur} value={t.valeur}>
                {t.libelle}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {(config.compacter || config.desirabilite) && (
          <Alert severity="info" sx={{ mt: 3 }}>
            Si vous aviez réglé les curseurs détaillés depuis le portail, ils
            reviennent à leurs valeurs conseillées en enregistrant ici. Ce sont ces
            valeurs qui s&apos;appliquent, et elles conviennent dans la plupart des
            cas.
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
          onAnnuler={() => setConfig(initial)}
          libelle="Enregistrer l'ordre"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Ordre enregistré. Le portail patient l&apos;appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
