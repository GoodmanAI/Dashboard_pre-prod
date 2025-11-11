// app/dashboard-talk/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  TextField,
  Button,
  Stack,
  Snackbar,
  Alert,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

type FormState = {
  // Informations générales
  centreName: string;
  centreAddress: string;
  centreWebsite: string;

  // Accessibilité & transports
  accessModalities: string;
  accessibleEntrance: string;
  phonePhraseDirection: string;
  phonePhraseFindEntrance: string;
  accessDifficulties: string;
  pmrParking: string;
  patientParking: string;
  publicTransport: string;

  // Horaires & disponibilité
  openingHours: string;
  pauseHours: string;
  phoneHours: string;
  closedDays: string;

  // Contacts
  secretariatPhone: string;
  responsibleContact: string;
  infoEmail: string;
  rdvEmail: string;
  ordonnanceEmail: string;

  // Prise de rendez-vous
  onlineBooking: string;
  reminders: string;
  acceptNewPatients: string;
  waitlistSystem: string;
  cancellationFees: string;
  orientIfNoSlot: string;
  chooseRadiologist: string;

  // Examens
  performedExams: string;
  averageStayByExam: string;
  emergencyExams: string;
  presentWithoutAppointment: string;
  emergencyInstructionClosed: string;
  interventionalExams: string;
  openIrm: string;
  prepSheets: string;

  // Organisation médicale
  numberRadiologists: string;
  radiologistsList: string;
  subspecialties: string;
  onCallService: string;

  // Documents & résultats
  documentsToBring: string;
  resultDelay: string;
  cdBurning: string;
  printedFilms: string;
  onlineAccessResults: string;
  sendToReferrer: string;
  retrieveOldExams: string;
  forwardImagesToSpecialist: string;

  // Services & confort
  wifi: string;
  childrenArea: string;

  // Paiement & facturation
  paymentMethods: string;
  tiersPayant: string;
  extraFees: string;
  extraFeesAmount: string;

  // Réclamations
  complaintMethods: string;
};

const initialState: FormState = {
  centreName: "",
  centreAddress: "",
  centreWebsite: "",

  accessModalities: "",
  accessibleEntrance: "",
  phonePhraseDirection: "",
  phonePhraseFindEntrance: "",
  accessDifficulties: "",
  pmrParking: "",
  patientParking: "",
  publicTransport: "",

  openingHours: "",
  pauseHours: "",
  phoneHours: "",
  closedDays: "",

  secretariatPhone: "",
  responsibleContact: "",
  infoEmail: "",
  rdvEmail: "",
  ordonnanceEmail: "",

  onlineBooking: "",
  reminders: "",
  acceptNewPatients: "",
  waitlistSystem: "",
  cancellationFees: "",
  orientIfNoSlot: "",
  chooseRadiologist: "",

  performedExams: "",
  averageStayByExam: "",
  emergencyExams: "",
  presentWithoutAppointment: "",
  emergencyInstructionClosed: "",
  interventionalExams: "",
  openIrm: "",
  prepSheets: "",

  numberRadiologists: "",
  radiologistsList: "",
  subspecialties: "",
  onCallService: "",

  documentsToBring: "",
  resultDelay: "",
  cdBurning: "",
  printedFilms: "",
  onlineAccessResults: "",
  sendToReferrer: "",
  retrieveOldExams: "",
  forwardImagesToSpecialist: "",

  wifi: "",
  childrenArea: "",

  paymentMethods: "",
  tiersPayant: "",
  extraFees: "",
  extraFeesAmount: "",

  complaintMethods: "",
};

interface TalkPageProps {
    params: {
        id: string; // captured from the URL
    };
}

export default function DashboardTalkForm({ params }: TalkPageProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });
  const userProductId = Number(params.id);

  useEffect(() => {
    async function loadConfig() {
      const res = await fetch(`/api/configuration/informationnel?userProductId=${userProductId}`);
      const json = await res.json();
      if (json.success) {
        setForm((prev) => ({ ...prev, ...json.data }));
      }
    }
    loadConfig();
  }, []);

  const handleChange =
    (key: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log(JSON.stringify(form));

    try {
      const res = await fetch("/api/configuration/informationnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({userProductId: userProductId, ...form}),
      });

      if (!res.ok) throw new Error(`Erreur serveur: ${res.status}`);

      setSnack({ open: true, message: "Configuration enregistrée avec succès.", severity: "success" });
    } catch (err) {
      console.error("Erreur lors de l’envoi :", err);
      setSnack({
        open: true,
        message: "Erreur lors de l’enregistrement. Vérifiez la console.",
        severity: "error",
      });
    }
  };


  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", my: 6, px: 2 }}>
      <Typography variant="h4" align="center" gutterBottom>
        Fiche client — Paramétrage Lyrae Talk
      </Typography>

      <form onSubmit={handleSubmit}>
        {/* Informations générales */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Informations générales</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Nom complet du centre"
                  value={form.centreName}
                  onChange={handleChange("centreName")}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Adresse complète du centre"
                  value={form.centreAddress}
                  onChange={handleChange("centreAddress")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Site web (lien)"
                  value={form.centreWebsite}
                  onChange={handleChange("centreWebsite")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Accessibilité & transports */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Accessibilité & transports</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Modalités d’accès (entrée principale, étage, interphone...)"
                  value={form.accessModalities}
                  onChange={handleChange("accessModalities")}
                  multiline
                  rows={3}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Entrée recommandée pour personnes à mobilité réduite"
                  value={form.accessibleEntrance}
                  onChange={handleChange("accessibleEntrance")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Phrase dite au téléphone pour expliquer l’accès"
                  value={form.phonePhraseDirection}
                  onChange={handleChange("phonePhraseDirection")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Phrase dite au téléphone pour expliquer où trouver l'entrée"
                  value={form.phonePhraseFindEntrance}
                  onChange={handleChange("phonePhraseFindEntrance")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Difficultés particulières d'accès (ex. cabinet caché, travaux...)"
                  value={form.accessDifficulties}
                  onChange={handleChange("accessDifficulties")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Places PMR (oui/non + détails)"
                  value={form.pmrParking}
                  onChange={handleChange("pmrParking")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Parking pour patients (oui/non + détails)"
                  value={form.patientParking}
                  onChange={handleChange("patientParking")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Transports en commun desservant le centre"
                  value={form.publicTransport}
                  onChange={handleChange("publicTransport")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Horaires & disponibilité */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Horaires & disponibilité</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Heures d’ouverture"
                  value={form.openingHours}
                  onChange={handleChange("openingHours")}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Heures de pause/fermeture quotidienne (ex. midi)"
                  value={form.pauseHours}
                  onChange={handleChange("pauseHours")}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Horaires de disponibilité téléphonique des secrétaires"
                  value={form.phoneHours}
                  onChange={handleChange("phoneHours")}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Jours/périodes de fermeture régulière"
                  value={form.closedDays}
                  onChange={handleChange("closedDays")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Contacts */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Contacts</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Numéro secrétariat"
                  value={form.secretariatPhone}
                  onChange={handleChange("secretariatPhone")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Numéro et email responsable du service"
                  value={form.responsibleContact}
                  onChange={handleChange("responsibleContact")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Email pour demandes d'information générale"
                  value={form.infoEmail}
                  onChange={handleChange("infoEmail")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Email pour demandes de RDV d'examen"
                  value={form.rdvEmail}
                  onChange={handleChange("rdvEmail")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Email pour envoi d'ordonnances"
                  value={form.ordonnanceEmail}
                  onChange={handleChange("ordonnanceEmail")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Prise de rendez-vous */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Prise de rendez-vous</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Prise de rendez-vous en ligne ? (oui/non + lien)"
                  value={form.onlineBooking}
                  onChange={handleChange("onlineBooking")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Rappel/confirmation par SMS ou email ?"
                  value={form.reminders}
                  onChange={handleChange("reminders")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Acceptez-vous les nouveaux patients ?"
                  value={form.acceptNewPatients}
                  onChange={handleChange("acceptNewPatients")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Liste d'attente / système de rappel (forme ?)"
                  value={form.waitlistSystem}
                  onChange={handleChange("waitlistSystem")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Frais en cas d'annulation tardive ou absence ?"
                  value={form.cancellationFees}
                  onChange={handleChange("cancellationFees")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Orientation en cas d'absence de créneau (autres centres)"
                  value={form.orientIfNoSlot}
                  onChange={handleChange("orientIfNoSlot")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Possibilité de choisir son radiologue ?"
                  value={form.chooseRadiologist}
                  onChange={handleChange("chooseRadiologist")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Examens */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Examens</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Examens pratiqués (liste)"
                  value={form.performedExams}
                  onChange={handleChange("performedExams")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Durée moyenne sur place par examen"
                  value={form.averageStayByExam}
                  onChange={handleChange("averageStayByExam")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Réalisation d'examens en urgence ?"
                  value={form.emergencyExams}
                  onChange={handleChange("emergencyExams")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Présentation sans RDV possible en urgence ?"
                  value={form.presentWithoutAppointment}
                  onChange={handleChange("presentWithoutAppointment")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Consigne en cas d'urgence médicale hors secrétariat"
                  value={form.emergencyInstructionClosed}
                  onChange={handleChange("emergencyInstructionClosed")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Examens interventionnels proposés ?"
                  value={form.interventionalExams}
                  onChange={handleChange("interventionalExams")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="IRM ouvert/ semi-ouvert disponible ?"
                  value={form.openIrm}
                  onChange={handleChange("openIrm")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Fiches de consignes pratiques à transmettre ?"
                  value={form.prepSheets}
                  onChange={handleChange("prepSheets")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Organisation médicale */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Organisation médicale</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Nombre de radiologues"
                  value={form.numberRadiologists}
                  onChange={handleChange("numberRadiologists")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={8}>
                <TextField
                  label="Liste des radiologues"
                  value={form.radiologistsList}
                  onChange={handleChange("radiologistsList")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Surspécialisations (si oui : lesquelles)"
                  value={form.subspecialties}
                  onChange={handleChange("subspecialties")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Service d'imagerie de garde (soir/nuit/week-end) ?"
                  value={form.onCallService}
                  onChange={handleChange("onCallService")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Documents & résultats */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Documents & résultats</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Documents à apporter pour un examen"
                  value={form.documentsToBring}
                  onChange={handleChange("documentsToBring")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Délai pour recevoir les résultats"
                  value={form.resultDelay}
                  onChange={handleChange("resultDelay")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Proposez-vous la gravure de CD ?"
                  value={form.cdBurning}
                  onChange={handleChange("cdBurning")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Impression des clichés sur film ?"
                  value={form.printedFilms}
                  onChange={handleChange("printedFilms")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Accès aux résultats sur internet (comment)"
                  value={form.onlineAccessResults}
                  onChange={handleChange("onlineAccessResults")}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Le compte-rendu est-il envoyé automatiquement au médecin traitant ?"
                  value={form.sendToReferrer}
                  onChange={handleChange("sendToReferrer")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Comment récupérer une copie d'anciens examens ?"
                  value={form.retrieveOldExams}
                  onChange={handleChange("retrieveOldExams")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Possibilité d'envoyer les images à un spécialiste (réseau informatique) ?"
                  value={form.forwardImagesToSpecialist}
                  onChange={handleChange("forwardImagesToSpecialist")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Services & confort */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Services & confort</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Wi-Fi pour les patients ?"
                  value={form.wifi}
                  onChange={handleChange("wifi")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Salle d'attente adaptée aux enfants ?"
                  value={form.childrenArea}
                  onChange={handleChange("childrenArea")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Paiement & facturation */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Paiement & facturation</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Modes de paiement acceptés"
                  value={form.paymentMethods}
                  onChange={handleChange("paymentMethods")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Tiers payant (sécurité sociale / mutuelle) ?"
                  value={form.tiersPayant}
                  onChange={handleChange("tiersPayant")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Dépassements d'honoraires (oui/non)"
                  value={form.extraFees}
                  onChange={handleChange("extraFees")}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Montants pratiqués si dépassements"
                  value={form.extraFeesAmount}
                  onChange={handleChange("extraFeesAmount")}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Réclamations */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Réclamations</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TextField
              label="Moyens pour déposer une réclamation (email, courrier...)"
              value={form.complaintMethods}
              onChange={handleChange("complaintMethods")}
              multiline
              rows={3}
              fullWidth
            />
          </AccordionDetails>
        </Accordion>

        <Stack direction="row" justifyContent="center" spacing={2} mt={3}>
          <Button variant="contained" color="primary" type="submit">
            Enregistrer la fiche client
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setForm(initialState);
            }}
          >
            Réinitialiser
          </Button>
        </Stack>
      </form>

       <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
