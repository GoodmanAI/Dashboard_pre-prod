"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Retour from "@/components/shared/Retour";
import ChampAvecVariables from "@/components/shared/ChampAvecVariables";
import {
  CLE_GABARIT_RDV_EN_LIGNE,
  MAX_SMS,
  SMS_RDV_EN_LIGNE_STANDARD,
  VARIABLES_RDV_EN_LIGNE,
  erreurVariablesRdvEnLigne,
  lienRdvEnLigneOuExemple,
  longueurRdvEnLigne,
  rendreSmsRdvEnLigne,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk, useTextesTalk } from "./textesTalk";
import { BulleSms } from "./SmsDepotOrdonnanceBloc";

/**
 * « Prise de rendez-vous en ligne » (18/11/2026, ponts de Talk vers Konnect). Plan
 * `lyrae/plans/2026-11-ponts-talk-konnect.md`, décisions d'Enzo du 16/11.
 *
 * Montée seulement pour un client qui a aussi Konnect. Le robot propose au patient
 * de recevoir par SMS le lien de la page de prise de RDV du site du centre, quand
 * c'est plus utile que le secrétariat (fermé, transfert, planning complet…). Le
 * client règle le texte de ce SMS ; l'adresse, elle, est saisie par l'équipe à
 * l'installation de Konnect et se lit ici. Clé `smsRdvEnLigneGabarit` de `talk.textes`.
 */
export default function RdvEnLigneCard({
  userProductId,
  readOnly,
  centre,
}: {
  userProductId: number;
  readOnly: boolean;
  centre: string;
}) {
  const [infos, setInfos] = useState<{ konnect: boolean; url: string | null } | null>(
    null
  );
  const { valeur, erreurChargement } = useTextesTalk(userProductId);
  const [gabarit, setGabarit] = useState("");
  const [initial, setInitial] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch(`/api/talk-rdv-en-ligne?userProductId=${userProductId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivant && d) setInfos({ konnect: d.konnect === true, url: d.url ?? null });
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, [userProductId]);

  useEffect(() => {
    if (!valeur) return;
    const g =
      typeof valeur[CLE_GABARIT_RDV_EN_LIGNE] === "string"
        ? (valeur[CLE_GABARIT_RDV_EN_LIGNE] as string)
        : "";
    setGabarit(g);
    setInitial(g);
  }, [valeur]);

  const centreAffiche = centre.trim() || "notre centre";
  const gabaritEffectif = gabarit.trim() || SMS_RDV_EN_LIGNE_STANDARD;
  const erreurVariables = gabarit.trim() ? erreurVariablesRdvEnLigne(gabarit) : null;

  const { apercu, longueur } = useMemo(() => {
    if (erreurVariablesRdvEnLigne(gabaritEffectif)) return { apercu: "", longueur: 0 };
    return {
      apercu: rendreSmsRdvEnLigne(gabaritEffectif, {
        lien: lienRdvEnLigneOuExemple(infos?.url),
        centre: centreAffiche,
      }),
      longueur: longueurRdvEnLigne(gabaritEffectif, centreAffiche, infos?.url),
    };
  }, [gabaritEffectif, centreAffiche, infos?.url]);

  // Sans Konnect, le robot ne propose jamais le lien : la carte n'a rien à régler.
  if (!infos?.konnect) return null;

  const tropLong = Boolean(gabarit.trim()) && longueur > MAX_SMS;
  const modifie = gabarit.trim() !== initial.trim();
  const personnalise = Boolean(initial.trim());

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const v = await enregistrerTextesTalk(userProductId, {
        [CLE_GABARIT_RDV_EN_LIGNE]: gabarit.trim(),
      });
      const g =
        typeof v[CLE_GABARIT_RDV_EN_LIGNE] === "string"
          ? (v[CLE_GABARIT_RDV_EN_LIGNE] as string)
          : "";
      setGabarit(g);
      setInitial(g);
      setEnregistre(true);
    } catch (err: any) {
      setErreur(err?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Typography variant="h6">Prise de rendez-vous en ligne</Typography>
          <Chip
            size="small"
            label={!infos.url ? "Page à indiquer" : personnalise ? "Personnalisé" : "Texte standard"}
            sx={{
              bgcolor: infos.url && personnalise ? "rgba(var(--accent-rgb), 0.15)" : "rgba(0,0,0,0.06)",
              color: infos.url && personnalise ? "var(--accent-deep)" : "text.secondary",
              fontWeight: 700,
            }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {erreurChargement ? (
          <Alert severity="error">{erreurChargement}</Alert>
        ) : !valeur ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Quand le secrétariat est fermé, ne répond pas, ou que le planning est
              complet, le robot propose au patient de recevoir par SMS le lien de votre
              page de prise de rendez-vous en ligne. Il ne le fait que pour une prise de
              rendez-vous, et pour un examen réservable en ligne. Le SMS ne part
              qu&apos;avec l&apos;accord du patient.
            </Typography>

            {infos.url ? (
              <Typography variant="body2">
                Page envoyée au patient :{" "}
                <Typography component="span" variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                  {infos.url}
                </Typography>
              </Typography>
            ) : (
              <Alert severity="info">
                Le robot ne propose pas encore la prise de rendez-vous en ligne : la page
                de votre site n&apos;est pas indiquée. Envoyez son adresse à votre contact
                Lyrae.
              </Alert>
            )}

            <ChampAvecVariables
              label="SMS envoyé au patient"
              valeur={gabarit}
              onChange={setGabarit}
              variables={VARIABLES_RDV_EN_LIGNE}
              placeholder={SMS_RDV_EN_LIGNE_STANDARD}
              minRows={3}
              erreur={erreurVariables}
              aide={
                gabarit.trim()
                  ? "{lien} est obligatoire."
                  : "Vide : le robot envoie le texte standard, affiché en gris."
              }
              desactive={readOnly}
            />

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "flex-start" }}
            >
              <BulleSms
                legende="Ce que le patient reçoit"
                texte={apercu || "Corrigez les variables pour voir l'aperçu."}
              />
              <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: longueur > MAX_SMS ? "error.main" : "text.primary",
                  }}
                >
                  {apercu
                    ? `${longueur} / ${MAX_SMS} caractères`
                    : "Longueur affichée une fois les variables corrigées"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {infos.url
                    ? "Compté avec le nom de votre centre et l'adresse de votre page."
                    : "Compté avec le nom de votre centre et une adresse d'exemple de 62 caractères."}
                </Typography>
              </Stack>
            </Stack>

            {tropLong && (
              <Alert severity="error">
                Le SMS ne tient pas en un seul message. Retirez {longueur - MAX_SMS}{" "}
                caractères pour pouvoir l&apos;enregistrer.
              </Alert>
            )}
            {erreur && <Alert severity="error">{erreur}</Alert>}

            <Stack direction="row" spacing={1.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
              <Button
                variant="text"
                disabled={readOnly || enregistrement || !gabarit.trim()}
                onClick={() => setGabarit("")}
                sx={{ color: "text.secondary" }}
              >
                Revenir au texte standard
              </Button>
              <Button
                variant="contained"
                disableElevation
                disabled={
                  readOnly || enregistrement || !modifie || Boolean(erreurVariables) || tropLong
                }
                onClick={() => void enregistrer()}
                sx={{
                  bgcolor: "var(--accent)",
                  "&:hover": { bgcolor: "var(--accent-press)" },
                }}
              >
                {enregistrement ? "Enregistrement…" : "Enregistrer le SMS"}
              </Button>
            </Stack>
          </Stack>
        )}

        <Retour
          ouvert={enregistre && !modifie}
          message={<>SMS enregistré. Le robot l&apos;envoie dès le prochain appel.</>}
          gravite={"success"}
          onFermer={() => setEnregistre(false)}
        />
      </AccordionDetails>
    </Accordion>
  );
}
