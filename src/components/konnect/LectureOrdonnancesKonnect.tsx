"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import type { StrategieOcr } from "@/lib/konnectConfig";
import { BORDER, INK, INK_MUTED, OK, WARNING } from "@/lib/jetons";

/**
 * La façon de lire les ordonnances d'un centre Konnect (OCR v2, 30/10/2026).
 *
 * Réglage de l'exploitant, posé dans la page admin d'installation sous l'accord du centre
 * (la console de Konnect ne le règle plus, C-OCRV2.8.2). Le choix descend à Konnect par
 * `GET /api/konnect-configuration` (`ocr_strategy`) ; ce que le portail applique VRAIMENT
 * remonte par la section `ocr` de `POST /api/konnect-remontee`, et s'affiche dessous : une
 * stratégie vision choisie peut être ramenée à la lecture locale (pas d'accord, centre non
 * habilité, prestataire non configuré, Dashboard injoignable).
 */

const CHOIX: { valeur: StrategieOcr; titre: string; detail: string }[] = [
  {
    valeur: "tesseract_only",
    titre: "Sur nos serveurs seulement",
    detail:
      "Aucune image ne sort. La lecture reconnaît bien les ordonnances imprimées, moins bien les photos difficiles et le manuscrit.",
  },
  {
    valeur: "vision_shadow",
    titre: "Essai du prestataire, sans effet pour le patient",
    detail:
      "Le prestataire lit aussi la photo, pour comparer. Le patient voit toujours la lecture de nos serveurs. Sert à mesurer avant d'activer.",
  },
  {
    valeur: "vision_first",
    titre: "Lecture par le prestataire",
    detail:
      "Le prestataire lit la photo. S'il ne répond pas à temps, nos serveurs prennent le relais, puis la recherche guidée.",
  },
];

const LIBELLE_STRATEGIE: Record<string, string> = Object.fromEntries(
  CHOIX.map((c) => [c.valeur, c.titre])
);

const MOTIFS_RESTRICTION: Record<string, string> = {
  strategie_inconnue: "le portail ne connaît pas le réglage reçu",
  configuration_perimee: "le portail n'a pas pu relire ses réglages depuis plus de 24 heures",
  cabinet_non_habilite:
    "le centre n'est pas encore habilité sur le portail (liste KONNECT_VISION_TENANTS du serveur)",
  sans_consentement: "le centre n'a pas donné son accord",
  verrous_fermes: "le prestataire n'est pas configuré sur le portail (clé, adresse, fournisseur)",
};

const DISJONCTEUR: Record<string, string> = {
  ferme: "le prestataire répond normalement",
  ouvert: "le prestataire échoue trop souvent : lecture locale pendant 10 minutes",
  demi_ouvert: "reprise à l'essai après des échecs du prestataire",
};

type EtatOcr = {
  strategie_configuree?: string | null;
  strategie_effective?: string | null;
  motif_restriction?: string | null;
  fournisseur_vision?: string | null;
  disjoncteur_vision?: string | null;
  mois?: string | null;
  cout_vision_mois_centimes?: number | null;
};

type Props = {
  userProductId: number;
  /** L'accord du centre tel qu'enregistré (`null` : encore en lecture). */
  accordEnregistre: boolean | null;
};

export default function LectureOrdonnancesKonnect({ userProductId, accordEnregistre }: Props) {
  const [choix, setChoix] = useState<StrategieOcr | null>(null);
  const [enregistre, setEnregistre] = useState<StrategieOcr | null>(null);
  const [charge, setCharge] = useState(true);
  const [etat, setEtat] = useState<EtatOcr | null>(null);
  const [recuAt, setRecuAt] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let abandonne = false;
    setCharge(true);
    void (async () => {
      try {
        const [rc, rr] = await Promise.all([
          fetch(`/api/konnect-configuration?userProductId=${userProductId}`),
          fetch(`/api/konnect-remontee?userProductId=${userProductId}`),
        ]);
        const config = rc.ok ? await rc.json() : null;
        const remontee = rr.ok ? await rr.json() : null;
        if (abandonne) return;
        const s = (config?.ocr_strategy ?? null) as StrategieOcr | null;
        setChoix(s ?? "tesseract_only");
        setEnregistre(s ?? "tesseract_only");
        setEtat((remontee?.charge?.ocr as EtatOcr | undefined) ?? null);
        setRecuAt(remontee?.recuAt ?? null);
      } finally {
        if (!abandonne) setCharge(false);
      }
    })();
    return () => {
      abandonne = true;
    };
  }, [userProductId]);

  async function enregistrer() {
    if (!choix) return;
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      // Un seul champ : le `PUT` fusionne sur l'existant, le reste appartient au client.
      const r = await fetch(`/api/konnect-configuration?userProductId=${userProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrStrategy: choix }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setEnregistre(choix);
      setMessage(
        "Réglage enregistré. Le portail l'applique à sa prochaine synchronisation, en quelques minutes."
      );
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setOccupe(false);
    }
  }

  const sansAccord = accordEnregistre === false;
  const effective = etat?.strategie_effective ?? null;
  const restreinte = Boolean(etat?.motif_restriction);

  return (
    <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK, mb: 0.5 }}>
        Façon de lire les ordonnances
      </Typography>
      <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
        Se règle ici, plus dans la console du portail. Les deux lectures par le prestataire
        demandent l&apos;accord du centre ci-dessus.
      </Typography>

      {charge || choix === null ? (
        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>Lecture en cours…</Typography>
      ) : (
        <>
          <RadioGroup
            value={choix}
            onChange={(e) => setChoix(e.target.value as StrategieOcr)}
            sx={{ gap: 0.5 }}
          >
            {CHOIX.map((c) => {
              const bloque = c.valeur !== "tesseract_only" && sansAccord;
              return (
                <FormControlLabel
                  key={c.valeur}
                  value={c.valeur}
                  disabled={occupe || bloque}
                  control={<Radio size="small" />}
                  sx={{ alignItems: "flex-start", m: 0 }}
                  label={
                    <Box sx={{ pt: 0.75 }}>
                      <Typography sx={{ fontSize: 13, color: INK, fontWeight: 500 }}>
                        {c.titre}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                        {bloque ? "Demande l'accord du centre." : c.detail}
                      </Typography>
                    </Box>
                  }
                />
              );
            })}
          </RadioGroup>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }}>
            <Button
              variant="contained"
              disableElevation
              disabled={occupe || choix === enregistre}
              onClick={() => void enregistrer()}
              sx={{ bgcolor: "var(--accent)" }}
            >
              Enregistrer
            </Button>
          </Stack>
          {message && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {message}
            </Alert>
          )}
          {erreur && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {erreur}
            </Alert>
          )}

          <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${BORDER}` }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: INK, mb: 0.5 }}>
              Ce que le portail applique
            </Typography>
            {!etat ? (
              <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                Le portail n&apos;a encore rien remonté sur sa lecture. Il le fait toutes les
                six heures environ.
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                <Typography sx={{ fontSize: 12.5, color: restreinte ? WARNING : OK }}>
                  {LIBELLE_STRATEGIE[effective ?? ""] ?? effective ?? "Inconnu"}
                  {restreinte &&
                    ` : ramené à la lecture sur nos serveurs, parce que ${
                      MOTIFS_RESTRICTION[etat.motif_restriction ?? ""] ?? etat.motif_restriction
                    }.`}
                </Typography>
                {etat.fournisseur_vision && (
                  <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                    Prestataire : {etat.fournisseur_vision}
                    {etat.disjoncteur_vision &&
                      `, ${DISJONCTEUR[etat.disjoncteur_vision] ?? etat.disjoncteur_vision}`}
                    .
                  </Typography>
                )}
                {typeof etat.cout_vision_mois_centimes === "number" &&
                  etat.cout_vision_mois_centimes > 0 && (
                    <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                      Coût estimé du prestataire{etat.mois ? ` en ${etat.mois}` : ""} :{" "}
                      {(etat.cout_vision_mois_centimes / 100).toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                      .
                    </Typography>
                  )}
                {recuAt && (
                  <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
                    Relevé le {new Date(recuAt).toLocaleString("fr-FR")}.
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
}
