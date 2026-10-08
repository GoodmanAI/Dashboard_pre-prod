"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import ChampAvecVariables from "@/components/shared/ChampAvecVariables";
import {
  CLE_DEPOT_AVANT,
  CLE_GABARIT_DEPOT,
  MAX_SMS,
  SMS_DEPOT_STANDARD,
  VARIABLES_DEPOT,
  donneesDepotExemple,
  erreurVariablesDepot,
  longueurDepotPireCas,
  rendreSmsDepot,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk } from "./textesTalk";

/**
 * SMS de dépôt d'ordonnance (lot 4, 08/10/2026). Plan :
 * `lyrae/plans/2026-10-confirmation-personnalisable.md`, section « Lot 4 ».
 *
 * Monté dans la carte « Confirmation de RDV par SMS », seulement quand le dépôt
 * d'ordonnance est actif pour le centre. Le client règle le texte (`{lien}` et
 * `{code}` obligatoires) et l'ordre des deux SMS. Domaine `talk.textes`, clés
 * `smsDepotGabarit` et `smsDepotAvantConfirmation`.
 */

/** Une bulle de SMS, telle que le patient la voit sur son téléphone. */
export function BulleSms({
  texte,
  legende,
  attenue = false,
}: {
  texte: string;
  legende?: string;
  attenue?: boolean;
}) {
  return (
    <Box sx={{ width: { xs: "100%", sm: 320 }, flexShrink: 0 }}>
      {legende && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          {legende}
        </Typography>
      )}
      <Box
        sx={{
          boxSizing: "border-box",
          p: 1.5,
          borderRadius: "16px 16px 16px 4px",
          bgcolor: "rgba(0,0,0,0.05)",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontSize: 14,
          lineHeight: 1.5,
          minHeight: 48,
          opacity: attenue ? 0.55 : 1,
        }}
      >
        {texte}
      </Box>
    </Box>
  );
}

export default function SmsDepotOrdonnanceBloc({
  userProductId,
  textes,
  readOnly,
  centre,
  apercuConfirmation,
}: {
  userProductId: number;
  /** Valeur courante de `talk.textes`, déjà chargée par la carte. */
  textes: Record<string, unknown>;
  readOnly: boolean;
  centre: string;
  /** Le SMS de confirmation tel qu'il s'affiche dans l'aperçu de la carte. */
  apercuConfirmation: string;
}) {
  const [gabarit, setGabarit] = useState("");
  const [avant, setAvant] = useState(false);
  const [initial, setInitial] = useState({ gabarit: "", avant: false });
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    const g =
      typeof textes[CLE_GABARIT_DEPOT] === "string"
        ? (textes[CLE_GABARIT_DEPOT] as string)
        : "";
    const a = textes[CLE_DEPOT_AVANT] === true;
    setGabarit(g);
    setAvant(a);
    setInitial({ gabarit: g, avant: a });
  }, [textes]);

  const centreAffiche = centre.trim() || "notre centre";
  const gabaritEffectif = gabarit.trim() || SMS_DEPOT_STANDARD;
  const erreurVariables = gabarit.trim() ? erreurVariablesDepot(gabarit) : null;

  const { apercu, longueurPire } = useMemo(() => {
    if (erreurVariablesDepot(gabaritEffectif))
      return { apercu: "", longueurPire: 0 };
    return {
      apercu: rendreSmsDepot(
        gabaritEffectif,
        donneesDepotExemple(centreAffiche),
      ),
      longueurPire: longueurDepotPireCas(gabaritEffectif, centreAffiche),
    };
  }, [gabaritEffectif, centreAffiche]);

  const tropLong = Boolean(gabarit.trim()) && longueurPire > MAX_SMS;
  const modifie =
    gabarit.trim() !== initial.gabarit.trim() || avant !== initial.avant;

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const v = await enregistrerTextesTalk(userProductId, {
        [CLE_GABARIT_DEPOT]: gabarit.trim(),
        [CLE_DEPOT_AVANT]: avant,
      });
      const g =
        typeof v[CLE_GABARIT_DEPOT] === "string"
          ? (v[CLE_GABARIT_DEPOT] as string)
          : "";
      const a = v[CLE_DEPOT_AVANT] === true;
      setGabarit(g);
      setAvant(a);
      setInitial({ gabarit: g, avant: a });
      setEnregistre(true);
    } catch (err: any) {
      setErreur(err?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  const bulleDepot = (
    <BulleSms
      key="depot"
      legende="SMS de dépôt"
      texte={apercu || "Corrigez les variables pour voir l'aperçu."}
    />
  );
  const bulleConfirmation = (
    <BulleSms
      key="confirmation"
      legende="SMS de confirmation"
      texte={
        apercuConfirmation ||
        "Corrigez le SMS de confirmation pour voir l'aperçu."
      }
      attenue
    />
  );

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle1">
          SMS de dépôt d&apos;ordonnance
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Le dépôt d&apos;ordonnance est actif : le patient reçoit un second SMS
          avec le lien et le code pour déposer son ordonnance, un par
          rendez-vous concerné.
        </Typography>
      </Box>

      <RadioGroup
        value={avant ? "avant" : "apres"}
        onChange={(e) => setAvant(e.target.value === "avant")}
      >
        <FormControlLabel
          value="apres"
          control={<Radio size="small" />}
          label="Après le SMS de confirmation"
          disabled={readOnly}
        />
        <FormControlLabel
          value="avant"
          control={<Radio size="small" />}
          label="Avant le SMS de confirmation"
          disabled={readOnly}
        />
      </RadioGroup>

      <ChampAvecVariables
        label="Message de dépôt envoyé au patient"
        valeur={gabarit}
        onChange={setGabarit}
        variables={VARIABLES_DEPOT}
        placeholder={SMS_DEPOT_STANDARD}
        minRows={3}
        erreur={erreurVariables}
        aide={
          gabarit.trim()
            ? "{lien} et {code} sont obligatoires."
            : "Vide : le robot envoie le texte standard, affiché en gris."
        }
        desactive={readOnly}
      />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", sm: "flex-start" }}
      >
        <Stack
          spacing={1.5}
          sx={{ width: { xs: "100%", sm: 320 }, flexShrink: 0 }}
        >
          {avant
            ? [bulleDepot, bulleConfirmation]
            : [bulleConfirmation, bulleDepot]}
        </Stack>
        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: longueurPire > MAX_SMS ? "error.main" : "text.primary",
            }}
          >
            {apercu
              ? `${longueurPire} / ${MAX_SMS} caractères`
              : "Longueur affichée une fois les variables corrigées"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Compté au plus long : lien de dépôt complet, code à six chiffres,
            délai d&apos;une semaine, nom de votre centre, nom et prénom de
            vingt lettres.
          </Typography>
        </Stack>
      </Stack>

      {tropLong && (
        <Alert severity="error">
          Le SMS de dépôt ne tient pas en un seul message. Retirez{" "}
          {longueurPire - MAX_SMS} caractères pour pouvoir l&apos;enregistrer.
        </Alert>
      )}
      {erreur && <Alert severity="error">{erreur}</Alert>}
      {enregistre && !modifie && (
        <Alert severity="success" onClose={() => setEnregistre(false)}>
          SMS de dépôt enregistré.
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} justifyContent="flex-end">
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
            readOnly ||
            enregistrement ||
            !modifie ||
            Boolean(erreurVariables) ||
            tropLong
          }
          onClick={() => void enregistrer()}
          sx={{
            bgcolor: "var(--accent)",
            "&:hover": { bgcolor: "var(--accent-press)" },
          }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer le SMS de dépôt"}
        </Button>
      </Stack>
    </Stack>
  );
}
