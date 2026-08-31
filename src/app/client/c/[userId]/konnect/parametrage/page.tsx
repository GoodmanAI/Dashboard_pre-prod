"use client";

import React, { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import CustomTextField from "@/app/(DashboardLayout)/components/forms/theme-elements/CustomTextField";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";

/**
 * Configuration LyraeKonnect d'un centre — le portail patient web.
 *
 * Bâti sur le même modèle que `talk/[id]/parametrage` : des accordéons, une
 * seule sauvegarde en bas. Le client qui utilise les deux produits retrouve la
 * même mécanique, seule la couleur change.
 *
 * Les valeurs vivent dans le Dashboard (`KonnectSettings`) : c'est lui qui fait
 * foi, exactement comme pour LyraeTalk. Konnect viendra les lire par
 * `GET /api/konnect-configuration?tenantId=…`.
 *
 * Les réglages internes (consentement OCR cloud, connexion RIS, messagerie)
 * n'apparaissent PAS ici : ils relèvent de la page technique réservée à
 * l'équipe, pas du client.
 */

type Config = {
  logo_url: string | null;
  depassement_honoraires: boolean;
  consignes_generales: string | null;
  telephone_secretariat: string | null;
  envoi_email: boolean;
  envoi_sms: boolean;
  ocr_actif: boolean;
  mode_saisie_examen: "traditionnel" | "anatomique";
  choix_radiologue_actif: boolean;
  multi_examen_actif: boolean;
  clinique_actif: boolean;
  poids_max_irm_kg: number | null;
  poids_max_scanner_kg: number | null;
  annulation_directe: boolean;
  sms_rappel_mode: "conditionnel" | "opt_out_si_ics" | "toujours";
  code_caracteristique_confirmation_xplore: string | null;
};

/** Interrupteur avec son explication — le motif visuel de l'écran Talk. */
function Reglage({
  titre,
  description,
  actif,
  onChange,
  disabled,
  avertissement,
}: {
  titre: string;
  description: string;
  actif: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  avertissement?: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 2,
        mb: 1.5,
        bgcolor: actif ? "rgba(var(--accent-rgb), 0.08)" : "rgba(0,0,0,0.02)",
        borderRadius: 2,
      }}
    >
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" fontWeight={600}>
          {titre}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p">
          {description}
        </Typography>
        {avertissement && actif && (
          <Typography variant="caption" color="warning.main" component="p" sx={{ mt: 0.5 }}>
            {avertissement}
          </Typography>
        )}
      </Box>
      <FormControlLabel
        sx={{ m: 0 }}
        control={
          <Switch
            checked={actif}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            sx={{
              "& .MuiSwitch-switchBase.Mui-checked": { color: "var(--accent)" },
              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                backgroundColor: "var(--accent)",
              },
            }}
          />
        }
        label=""
      />
    </Box>
  );
}

export default function ParametrageKonnectPage() {
  const { userProductId } = useCentreProduit();

  const [config, setConfig] = useState<Config | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(userProductId)) return;
    const run = async () => {
      setChargement(true);
      setErreur(null);
      try {
        const res = await fetch(
          `/api/konnect-configuration?userProductId=${userProductId}`
        );
        const data = await res.json();
        if (res.ok) setConfig(data);
        else setErreur(data.error || "Impossible de charger la configuration.");
      } catch {
        setErreur("Une erreur inattendue s'est produite.");
      } finally {
        setChargement(false);
      }
    };
    run();
  }, [userProductId]);

  const maj = <K extends keyof Config>(champ: K, valeur: Config[K]) =>
    setConfig((prev) => (prev ? { ...prev, [champ]: valeur } : prev));

  // Le formulaire parle snake_case (le vocabulaire de Konnect), l'API de
  // sauvegarde attend le camelCase du Dashboard : la traduction se fait ici.
  const enregistrer = async () => {
    if (!config) return;
    setEnregistrement(true);
    setErreur(null);
    try {
      const res = await fetch(
        `/api/konnect-configuration?userProductId=${userProductId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            logoUrl: config.logo_url,
            depassementHonoraires: config.depassement_honoraires,
            consignesGenerales: config.consignes_generales,
            telephoneSecretariat: config.telephone_secretariat,
            envoiEmail: config.envoi_email,
            envoiSms: config.envoi_sms,
            ocrActif: config.ocr_actif,
            modeSaisieExamen: config.mode_saisie_examen,
            choixRadiologueActif: config.choix_radiologue_actif,
            multiExamenActif: config.multi_examen_actif,
            cliniqueActif: config.clinique_actif,
            poidsMaxIrmKg: config.poids_max_irm_kg,
            poidsMaxScannerKg: config.poids_max_scanner_kg,
            annulationDirecte: config.annulation_directe,
            smsRappelMode: config.sms_rappel_mode,
            codeCaracteristiqueConfirmationXplore:
              config.code_caracteristique_confirmation_xplore,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setConfig(data);
        setSucces(true);
      } else {
        setErreur(data.error || "Échec de l'enregistrement.");
      }
    } catch {
      setErreur("Une erreur inattendue s'est produite.");
    } finally {
      setEnregistrement(false);
    }
  };

  if (chargement) {
    return (
      <PageContainer title="Paramètres LyraeKonnect" description="Configuration du portail patient">
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  if (!config) {
    return (
      <PageContainer title="Paramètres LyraeKonnect" description="Configuration du portail patient">
        <Alert severity="error">{erreur ?? "Configuration indisponible."}</Alert>
      </PageContainer>
    );
  }

  const secretariatManquant = !config.telephone_secretariat?.trim();

  return (
    <PageContainer title="Paramètres LyraeKonnect" description="Configuration du portail patient">
      {/* `PageContainer` type ses enfants `JSX.Element | JSX.Element[]` : un
          rendu conditionnel y produirait `false | Element`, que TypeScript
          refuse. D'où ce conteneur unique. */}
      <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Portail patient
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ce que voit et peut faire un patient qui prend rendez-vous en ligne.
          Les modifications s&apos;appliquent au prochain parcours démarré.
        </Typography>
      </Box>

      {/* ---------------- Identité du centre ---------------- */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Identité du centre</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2.5}>
            <CustomTextField
              label="Téléphone du secrétariat"
              variant="outlined"
              fullWidth
              value={config.telephone_secretariat ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                maj("telephone_secretariat", e.target.value)
              }
              helperText="Affiché au patient dont le rendez-vous est bloqué et qui doit vous appeler. Sans ce numéro, il se retrouve dans une impasse."
            />
            <CustomTextField
              label="URL du logo"
              variant="outlined"
              fullWidth
              value={config.logo_url ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                maj("logo_url", e.target.value)
              }
              helperText="Adresse d'une image déjà hébergée. Le fichier n'est pas stocké ici."
            />
            <CustomTextField
              label="Consignes générales"
              variant="outlined"
              fullWidth
              multiline
              minRows={3}
              value={config.consignes_generales ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                maj("consignes_generales", e.target.value)
              }
              helperText="Affichées au patient pendant sa prise de rendez-vous : accès, stationnement, pièces à apporter."
            />
            <Reglage
              titre="Dépassement d'honoraires"
              description="Signale au patient que le centre pratique un complément d'honoraires."
              actif={config.depassement_honoraires}
              onChange={(v) => maj("depassement_honoraires", v)}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* ---------------- Parcours patient ---------------- */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Parcours patient</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Reglage
            titre="Lecture automatique de l'ordonnance"
            description="Le patient photographie son ordonnance et les examens sont reconnus automatiquement. Désactivé, il saisit ses examens dans un parcours guidé. La photo reste demandée dans les deux cas."
            actif={config.ocr_actif}
            onChange={(v) => maj("ocr_actif", v)}
          />
          <Reglage
            titre="Choix du radiologue"
            description="Le patient choisit le praticien parmi ceux habilités à son examen. Rallonge le parcours et peut réduire les créneaux proposés."
            actif={config.choix_radiologue_actif}
            onChange={(v) => maj("choix_radiologue_actif", v)}
          />
          <Reglage
            titre="Bilan à deux examens"
            description="Autorise la réservation de deux examens en une seule prise de rendez-vous."
            actif={config.multi_examen_actif}
            onChange={(v) => maj("multi_examen_actif", v)}
          />

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
            Écran « partie du corps »
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
            Change uniquement la présentation. Les examens proposés sont les mêmes
            dans les deux cas.
          </Typography>
          <RadioGroup
            value={config.mode_saisie_examen}
            onChange={(e) =>
              maj("mode_saisie_examen", e.target.value as Config["mode_saisie_examen"])
            }
          >
            <FormControlLabel
              value="traditionnel"
              control={<Radio sx={{ "&.Mui-checked": { color: "var(--accent)" } }} />}
              label={
                <Box>
                  <Typography variant="body2">Liste</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Le patient choisit dans une liste déroulante.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="anatomique"
              control={<Radio sx={{ "&.Mui-checked": { color: "var(--accent)" } }} />}
              label={
                <Box>
                  <Typography variant="body2">Schéma du corps</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Le patient désigne la zone sur une silhouette.
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </AccordionDetails>
      </Accordion>

      {/* ---------------- Notifications ---------------- */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Notifications au patient</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Alert severity="info" sx={{ mb: 2 }}>
            Ces interrupteurs disent quels canaux vous <em>souhaitez</em> utiliser.
            Leur mise en service dépend de la configuration technique de la
            messagerie, gérée par l&apos;équipe Lyrae.
          </Alert>
          <Reglage
            titre="Email"
            description="Confirmation et rappels envoyés par email."
            actif={config.envoi_email}
            onChange={(v) => maj("envoi_email", v)}
          />
          <Reglage
            titre="SMS"
            description="Confirmation et rappels envoyés par SMS."
            actif={config.envoi_sms}
            onChange={(v) => maj("envoi_sms", v)}
            avertissement="Le crédit SMS est partagé avec les relances de LyraeTalk."
          />
        </AccordionDetails>
      </Accordion>

      {/* ---------------- Sécurité clinique ---------------- */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6">Sécurité clinique</Typography>
            {config.clinique_actif && (
              <Chip
                label="Questionnaire actif"
                size="small"
                sx={{
                  bgcolor: "rgba(var(--accent-rgb), 0.15)",
                  color: "var(--accent-deep)",
                  fontWeight: 600,
                }}
              />
            )}
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Reglage
            titre="Questionnaire clinique"
            description="Interroge le patient sur ses contre-indications avant de confirmer. Une contre-indication majeure n'annule jamais le rendez-vous : elle le renvoie à votre validation."
            actif={config.clinique_actif}
            onChange={(v) => maj("clinique_actif", v)}
            disabled={secretariatManquant && !config.clinique_actif}
            avertissement="À activer après relecture par un radiologue."
          />
          {secretariatManquant && !config.clinique_actif && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Renseignez d&apos;abord le téléphone du secrétariat : c&apos;est le
              numéro affiché au patient dont le rendez-vous est bloqué par le
              questionnaire.
            </Alert>
          )}

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
            Limites de gabarit
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
            Au-delà du seuil, le rendez-vous est bloqué et le patient invité à
            vous appeler. Laisser vide si la question ne se pose pas pour cette
            famille d&apos;examens.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <CustomTextField
              label="Poids maximum IRM (kg)"
              type="number"
              variant="outlined"
              fullWidth
              value={config.poids_max_irm_kg ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                maj(
                  "poids_max_irm_kg",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            />
            <CustomTextField
              label="Poids maximum scanner (kg)"
              type="number"
              variant="outlined"
              fullWidth
              value={config.poids_max_scanner_kg ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                maj(
                  "poids_max_scanner_kg",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Confirmation de rendez-vous. Ces trois réglages vivaient dans la console
          cabinet de Konnect ; ils arrivent ici avant sa fermeture, sans quoi plus
          rien ne permettrait de les régler. */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Confirmation de rendez-vous</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Reglage
            titre="Une annulation du patient retire le rendez-vous"
            description="Quand c'est actif, un patient qui répond « non » libère lui-même son créneau dans votre logiciel. Sinon vous recevez une alerte, et c'est vous qui décidez."
            actif={config.annulation_directe}
            onChange={(v) => maj("annulation_directe", v)}
            avertissement="Le créneau est rendu sans que personne ne le relise."
          />

          <Typography variant="body2" fontWeight={600} sx={{ mt: 2, mb: 0.5 }}>
            SMS de rappel de secours
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
            Quand envoyer le SMS qui redemande au patient s&apos;il vient.
          </Typography>
          <RadioGroup
            value={config.sms_rappel_mode}
            onChange={(e) =>
              maj("sms_rappel_mode", e.target.value as Config["sms_rappel_mode"])
            }
          >
            <FormControlLabel
              value="conditionnel"
              control={<Radio sx={{ "&.Mui-checked": { color: "var(--accent)" } }} />}
              label={
                <Box>
                  <Typography variant="body2">S&apos;il n&apos;a pas encore répondu</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Le choix le plus sobre : pas de SMS à qui a déjà confirmé.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="opt_out_si_ics"
              control={<Radio sx={{ "&.Mui-checked": { color: "var(--accent)" } }} />}
              label={
                <Box>
                  <Typography variant="body2">
                    Sauf s&apos;il a mis le rendez-vous dans son agenda
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    On considère qu&apos;il a son rappel.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="toujours"
              control={<Radio sx={{ "&.Mui-checked": { color: "var(--accent)" } }} />}
              label={
                <Box>
                  <Typography variant="body2">Dans tous les cas</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Un SMS part même si le patient a déjà répondu.
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>

          <Typography variant="body2" fontWeight={600} sx={{ mt: 3, mb: 0.5 }}>
            Code de confirmation dans votre logiciel
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
            Le code de la caractéristique de confirmation, paramétrée dans
            l&apos;administration de votre logiciel de gestion. Sans lui, la réponse du
            patient ne peut pas y être inscrite. Il vous est communiqué à
            l&apos;installation.
          </Typography>
          <CustomTextField
            label="Code de confirmation"
            variant="outlined"
            fullWidth
            value={config.code_caracteristique_confirmation_xplore ?? ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              maj(
                "code_caracteristique_confirmation_xplore",
                e.target.value.trim() === "" ? null : e.target.value
              )
            }
          />
        </AccordionDetails>
      </Accordion>

      {erreur && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {erreur}
        </Alert>
      )}

      <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          size="large"
          onClick={enregistrer}
          disabled={enregistrement}
          sx={{
            bgcolor: "var(--accent)",
            fontWeight: 600,
            "&:hover": { bgcolor: "var(--accent-press)" },
          }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </Box>

      <Snackbar
        open={succes}
        autoHideDuration={4000}
        onClose={() => setSucces(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setSucces(false)}>
          Configuration enregistrée.
        </Alert>
      </Snackbar>
      </Box>
    </PageContainer>
  );
}
