"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { IconPhoneCall, IconX } from "@tabler/icons-react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { cheminCentre } from "@/lib/cheminsCentre";
import { PRODUITS } from "@/lib/produits";
import { INK_MUTED, RAYON } from "@/lib/jetons";

/**
 * Bandeau « patients à rappeler » de Konnect, en tête de chaque page Talk (27/11/2026).
 *
 * POURQUOI. Au 27/11, Menton avait 53 demandes de rappel Konnect en attente et aucune
 * traitée : la secrétaire se connecte tous les jours, mais pour les écrans de Talk
 * (ordonnances manquantes), et n'ouvre jamais l'espace Konnect. Le bandeau porte la
 * file là où elle travaille déjà. Variante A, choisie par Enzo sur maquette.
 *
 * CE QU'IL LIT. `GET /api/konnect-demandes-rappel?resume=1` : un nombre et une date,
 * jamais un nom ni un numéro. Mêmes gardes que l'écran des demandes : un compte sans le
 * droit « Demandes de rappel », ou un centre sans Konnect, ne voit rien.
 *
 * MASQUAGE. La croix le cache pour la journée, sur ce poste et pour ce centre. Il
 * revient le lendemain tant qu'il reste des demandes.
 *
 * Couleur de Konnect en dur, et c'est voulu : sous Talk, `--accent` vaut la teinte de
 * Talk, or le bandeau doit dire « ceci vient de Konnect ».
 */

const KONNECT = PRODUITS.konnect.accent;
const FOND = "#E8F1FB";
const CONTOUR = "#C9DCF3";
const RAFRAICHIR_MS = 5 * 60 * 1000;

type Resume = { aRappeler: number; plusAncienne: string | null };

function cleMasquage(userId: number): string {
  const jour = new Date().toLocaleDateString("fr-CA"); // AAAA-MM-JJ, heure locale
  return `lyrae.bandeauRappelsKonnect.${userId}.${jour}`;
}

function estMasque(userId: number): boolean {
  try {
    return window.localStorage.getItem(cleMasquage(userId)) === "1";
  } catch {
    return false;
  }
}

/** « depuis aujourd'hui », « depuis hier », « depuis 18 jours ». */
function anciennete(iso: string | null): string | null {
  if (!iso) return null;
  const debut = new Date(iso);
  if (Number.isNaN(debut.getTime())) return null;
  const minuit = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const jours = Math.round((minuit(new Date()) - minuit(debut)) / 86_400_000);
  if (jours <= 0) return "depuis aujourd'hui";
  if (jours === 1) return "depuis hier";
  return `depuis ${jours} jours`;
}

export default function BandeauRappelsKonnect() {
  const { userId, produits } = useCentreProduit();
  const konnectId = produits.find((p) => p.slug === "konnect")?.userProductId ?? null;

  const [resume, setResume] = useState<Resume | null>(null);
  const [masque, setMasque] = useState(true);

  useEffect(() => {
    if (userId !== null) setMasque(estMasque(userId));
  }, [userId]);

  const charger = useCallback(async () => {
    if (!konnectId) return;
    try {
      const r = await fetch(`/api/konnect-demandes-rappel?userProductId=${konnectId}&resume=1`, {
        cache: "no-store",
      });
      // 403 (pas le droit) ou 404 (pas de Konnect) : rien à montrer, et ce n'est pas une panne.
      if (!r.ok) return setResume(null);
      const d = await r.json();
      setResume({
        aRappeler: Number(d?.aRappeler) || 0,
        plusAncienne: typeof d?.plusAncienne === "string" ? d.plusAncienne : null,
      });
    } catch {
      // Réseau coupé : on garde ce qu'on avait, la passe suivante réessaiera.
    }
  }, [konnectId]);

  useEffect(() => {
    if (!konnectId) return;
    charger();
    const minuterie = window.setInterval(charger, RAFRAICHIR_MS);
    return () => window.clearInterval(minuterie);
  }, [konnectId, charger]);

  if (userId === null || masque || !resume || resume.aRappeler <= 0) return null;

  const n = resume.aRappeler;
  const depuis = anciennete(resume.plusAncienne);
  const titre =
    n === 1
      ? "1 patient attend votre rappel sur Konnect"
      : `${n} patients attendent votre rappel sur Konnect`;

  const masquer = () => {
    try {
      window.localStorage.setItem(cleMasquage(userId), "1");
    } catch {
      // Stockage refusé : le bandeau se cache quand même jusqu'au prochain chargement.
    }
    setMasque(true);
  };

  return (
    <Box
      id="bandeau-rappels-konnect"
      role="status"
      sx={{
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        flexWrap: { xs: "wrap", sm: "nowrap" },
        gap: { xs: 1.5, sm: 2 },
        mb: 3,
        px: { xs: 1.75, sm: 2.25 },
        py: 1.5,
        bgcolor: FOND,
        border: `1px solid ${CONTOUR}`,
        borderLeft: `4px solid ${KONNECT.principal}`,
        borderRadius: RAYON,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 38,
          height: 38,
          flex: "none",
          borderRadius: "50%",
          bgcolor: KONNECT.principal,
          color: "#fff",
          display: "grid",
          placeItems: "center",
        }}
      >
        <IconPhoneCall size={20} stroke={1.8} />
      </Box>

      <Box sx={{ flex: 1, minWidth: { xs: "calc(100% - 100px)", sm: 0 } }}>
        <Typography sx={{ fontWeight: 700, color: KONNECT.press, fontSize: 15, lineHeight: 1.35 }}>
          {titre}
        </Typography>
        <Typography sx={{ color: INK_MUTED, fontSize: 13.5, lineHeight: 1.4, mt: 0.25 }}>
          {n === 1 ? "Il a demandé" : "Ils ont demandé"} un rendez-vous en ligne et laissé leur
          numéro.{depuis ? ` La plus ancienne demande attend ${depuis}.` : ""}
        </Typography>
      </Box>

      <Button
        component={Link}
        href={cheminCentre(userId, "konnect", "demandes-rappel")}
        variant="contained"
        disableElevation
        sx={{
          order: { xs: 3, sm: 0 },
          width: { xs: "100%", sm: "auto" },
          flex: "none",
          bgcolor: KONNECT.principal,
          "&:hover": { bgcolor: KONNECT.press },
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        Voir les demandes de rappel
      </Button>

      <IconButton
        onClick={masquer}
        aria-label="Masquer jusqu'à demain"
        title="Masquer jusqu'à demain"
        size="small"
        sx={{ color: INK_MUTED, flex: "none", ml: { xs: "auto", sm: 0 } }}
      >
        <IconX size={18} />
      </IconButton>
    </Box>
  );
}
