"use client";

import Retour from "@/components/shared/Retour";
import ChampAvecVariables from "@/components/shared/ChampAvecVariables";
import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import {
  CENTRE_RELANCE_MAX,
  CLE_GABARIT_RELANCE,
  CLE_GABARIT_RELANCE_ANNULATION,
  CLE_NOM_CENTRE_RELANCE,
  MAX_SMS,
  NOM_CENTRE_RELANCE_MAX,
  SMS_RELANCE_ANNULATION_STANDARD,
  SMS_RELANCE_STANDARD,
  VARIABLES_RELANCE,
  centreDuSmsRelance,
  donneesRelanceExemple,
  erreurNomCentreRelance,
  erreurVariablesRelance,
  longueurGsm7,
  longueurRelancePireCas,
  rendreSmsRelance,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk, useTextesTalk } from "./textesTalk";
import { BulleSms } from "./SmsDepotOrdonnanceBloc";

/**
 * Texte du SMS de rappel no-show (28/11/2026, demande de GH Pontivy). Plan
 * `lyrae/plans/2026-11-sms-relance-personnalisable.md`.
 *
 * Le client choisit le nom que prend `{centre}` (court pour garder de la place, ou complet
 * comme « Centre Hospitalier de Pontivy ») et écrit jusqu'à deux textes, selon « Ce que le
 * SMS propose au patient » : confirmer ou annuler, et annulation seule. On n'affiche que
 * ceux que le centre envoie. Tout est rangé dans `talk.textes` du produit qui porte les
 * relances (`porteurRelances`) et lu par AI2Xplore dans `GET /api/sms-confirmation-config`.
 *
 * Un seul SMS de 160 caractères, mesuré au pire cas avec le nom choisi tel quel (nom et
 * prénom du patient à 20). Le nom saisi est pris en compte dès la frappe dans chaque
 * aperçu ; il est enregistré avec son bouton ou avec un texte. Le serveur refuse ce qui
 * dépasse, texte standard compris.
 */
export default function SmsRelanceTexteBloc({
  porteurId,
  centre,
  avecConfirmation,
  avecAnnulationSeule,
  readOnly,
}: {
  /** Produit qui porte les relances : c'est là qu'AI2Xplore lit les textes. */
  porteurId: number;
  /** Nom du centre de la fiche, pour l'aperçu quand aucun nom n'est choisi. */
  centre: string;
  avecConfirmation: boolean;
  avecAnnulationSeule: boolean;
  readOnly: boolean;
}) {
  const { valeur: textes, erreurChargement } = useTextesTalk(porteurId);
  const [nom, setNom] = useState("");
  const [nomInitial, setNomInitial] = useState("");
  const [enregistrementNom, setEnregistrementNom] = useState(false);
  const [erreurNom, setErreurNom] = useState<string | null>(null);
  const [nomEnregistre, setNomEnregistre] = useState(false);

  useEffect(() => {
    if (!textes) return;
    const n = typeof textes[CLE_NOM_CENTRE_RELANCE] === "string" ? (textes[CLE_NOM_CENTRE_RELANCE] as string) : "";
    setNom(n);
    setNomInitial(n);
  }, [textes]);

  if (erreurChargement) return <Alert severity="error">{erreurChargement}</Alert>;
  if (!textes) {
    return (
      <Stack alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={20} sx={{ color: "var(--accent)" }} />
      </Stack>
    );
  }

  const nomPropre = nom.trim();
  const erreurFormatNom = nomPropre ? erreurNomCentreRelance(nomPropre) : null;
  const nomModifie = nomPropre !== nomInitial.trim();
  const centreDuSms = centreDuSmsRelance(nomPropre, centre.trim() || "Votre centre");

  // Le nom fait-il déborder un texte envoyé (le texte du client, sinon le standard) ?
  const textesEnvoyes: { libelle: string; gabarit: string }[] = [];
  if (avecConfirmation)
    textesEnvoyes.push({
      libelle: "confirmer ou annuler",
      gabarit: (textes[CLE_GABARIT_RELANCE] as string) || SMS_RELANCE_STANDARD,
    });
  if (avecAnnulationSeule)
    textesEnvoyes.push({
      libelle: "annulation seule",
      gabarit: (textes[CLE_GABARIT_RELANCE_ANNULATION] as string) || SMS_RELANCE_ANNULATION_STANDARD,
    });
  const debordements = nomPropre
    ? textesEnvoyes
        .map((t) => ({ ...t, n: longueurRelancePireCas(t.gabarit, nomPropre) }))
        .filter((t) => t.n > MAX_SMS)
    : [];

  async function enregistrerNom() {
    setErreurNom(null);
    setEnregistrementNom(true);
    try {
      const v = await enregistrerTextesTalk(porteurId, { [CLE_NOM_CENTRE_RELANCE]: nomPropre });
      const n = typeof v[CLE_NOM_CENTRE_RELANCE] === "string" ? (v[CLE_NOM_CENTRE_RELANCE] as string) : "";
      setNom(n);
      setNomInitial(n);
      setNomEnregistre(true);
    } catch (err: any) {
      setErreurNom(err?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrementNom(false);
    }
  }

  const deux = avecConfirmation && avecAnnulationSeule;
  return (
    <Stack spacing={3} id="texte_sms_rappel">
      <Box>
        <Typography variant="subtitle1">Texte du SMS</Typography>
        <Typography variant="body2" color="text.secondary">
          Un SMS compte 160 caractères au plus : au-delà, chaque relance coûte deux SMS. Le compteur
          mesure le message le plus long possible, et l&apos;écran refuse d&apos;enregistrer ce qui dépasse.
        </Typography>
      </Box>

      <Stack spacing={1.5} id="nom_centre_sms_rappel">
        <Typography variant="subtitle2">Nom du centre dans le SMS</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "flex-start" }}>
          <TextField
            size="small"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            disabled={readOnly}
            placeholder={centre.trim() || "Centre d'imagerie"}
            error={Boolean(erreurFormatNom)}
            helperText={
              erreurFormatNom ??
              (nomPropre
                ? `${nomPropre.length} / ${NOM_CENTRE_RELANCE_MAX} caractères. C'est ce que {centre} affiche dans le SMS.`
                : `Vide : le nom enregistré dans votre logiciel de gestion, coupé à ${CENTRE_RELANCE_MAX} caractères.`)
            }
            inputProps={{ maxLength: NOM_CENTRE_RELANCE_MAX + 10 }}
            sx={{ flex: 1, maxWidth: { sm: 420 } }}
          />
          <Button
            variant="outlined"
            disabled={readOnly || enregistrementNom || !nomModifie || Boolean(erreurFormatNom) || debordements.length > 0}
            onClick={() => void enregistrerNom()}
            sx={{ whiteSpace: "nowrap", color: "var(--accent-deep)", borderColor: "rgba(var(--accent-rgb), 0.5)" }}
          >
            {enregistrementNom ? "Enregistrement…" : "Enregistrer le nom"}
          </Button>
        </Stack>
        {debordements.map((d) => (
          <Alert severity="error" key={d.libelle}>
            Avec ce nom, le SMS « {d.libelle} » peut atteindre {d.n} caractères. Raccourcissez le nom
            ou le texte de {d.n - MAX_SMS} caractères.
          </Alert>
        ))}
        {erreurNom && <Alert severity="error">{erreurNom}</Alert>}
      </Stack>

      {avecConfirmation && (
        <EditeurRelance
          porteurId={porteurId}
          textes={textes}
          cle={CLE_GABARIT_RELANCE}
          standard={SMS_RELANCE_STANDARD}
          titre={deux ? "Quand le patient peut confirmer ou annuler" : undefined}
          nomChoisi={nomPropre}
          centreDuSms={centreDuSms}
          onNomEnregistre={(n) => {
            setNom(n);
            setNomInitial(n);
          }}
          readOnly={readOnly}
        />
      )}
      {avecAnnulationSeule && (
        <EditeurRelance
          porteurId={porteurId}
          textes={textes}
          cle={CLE_GABARIT_RELANCE_ANNULATION}
          standard={SMS_RELANCE_ANNULATION_STANDARD}
          titre={deux ? "Quand le patient peut seulement annuler" : undefined}
          nomChoisi={nomPropre}
          centreDuSms={centreDuSms}
          onNomEnregistre={(n) => {
            setNom(n);
            setNomInitial(n);
          }}
          readOnly={readOnly}
        />
      )}

      <Retour
        ouvert={nomEnregistre}
        message={<>Nom du centre enregistré.</>}
        gravite={"success"}
        onFermer={() => setNomEnregistre(false)}
      />
    </Stack>
  );
}

function EditeurRelance({
  porteurId,
  textes,
  cle,
  standard,
  titre,
  nomChoisi,
  centreDuSms,
  onNomEnregistre,
  readOnly,
}: {
  porteurId: number;
  textes: Record<string, unknown>;
  cle: string;
  standard: string;
  titre?: string;
  /** Nom saisi (même pas encore enregistré) : il compte dans la longueur et part avec le texte. */
  nomChoisi: string;
  centreDuSms: string;
  onNomEnregistre: (nom: string) => void;
  readOnly: boolean;
}) {
  const [gabarit, setGabarit] = useState("");
  const [initial, setInitial] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    const g = typeof textes[cle] === "string" ? (textes[cle] as string) : "";
    setGabarit(g);
    setInitial(g);
  }, [textes, cle]);

  const effectif = gabarit.trim() || standard;
  const erreurVariables = gabarit.trim() ? erreurVariablesRelance(gabarit) : null;
  const { apercu, longueurApercu, longueurPire } = useMemo(() => {
    if (erreurVariablesRelance(effectif)) return { apercu: "", longueurApercu: 0, longueurPire: 0 };
    const a = rendreSmsRelance(effectif, donneesRelanceExemple(centreDuSms));
    return {
      apercu: a,
      longueurApercu: longueurGsm7(a),
      longueurPire: longueurRelancePireCas(effectif, nomChoisi),
    };
  }, [effectif, centreDuSms, nomChoisi]);
  const tropLong = Boolean(gabarit.trim()) && longueurPire > MAX_SMS;
  const modifie = gabarit.trim() !== initial.trim();
  const avecNomPatient = /\{(prenom|nom)\}/.test(effectif);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      // Le nom saisi part avec le texte : le texte a été mesuré avec lui.
      const v = await enregistrerTextesTalk(porteurId, {
        [cle]: gabarit.trim(),
        [CLE_NOM_CENTRE_RELANCE]: nomChoisi,
      });
      const g = typeof v[cle] === "string" ? (v[cle] as string) : "";
      setGabarit(g);
      setInitial(g);
      onNomEnregistre(typeof v[CLE_NOM_CENTRE_RELANCE] === "string" ? (v[CLE_NOM_CENTRE_RELANCE] as string) : "");
      setEnregistre(true);
    } catch (err: any) {
      setErreur(err?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <Stack spacing={2}>
      {titre && <Typography variant="subtitle2">{titre}</Typography>}
      <ChampAvecVariables
        label="Message envoyé au patient"
        valeur={gabarit}
        onChange={setGabarit}
        variables={VARIABLES_RELANCE}
        placeholder={standard}
        minRows={4}
        erreur={erreurVariables}
        aide={gabarit.trim() ? undefined : "Vide : le patient reçoit le texte standard, affiché en gris."}
        desactive={readOnly}
      />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", sm: "flex-start" }}
      >
        <BulleSms texte={apercu || "Corrigez les variables pour voir l'aperçu."} />
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
              ? `${longueurPire} / ${MAX_SMS} caractères au plus long`
              : "Longueur affichée une fois les variables corrigées"}
          </Typography>
          {apercu && (
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {longueurApercu} caractères pour cet exemple.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {nomChoisi
              ? "Compté avec le nom du centre choisi ci-dessus"
              : `Compté avec un nom de centre de ${CENTRE_RELANCE_MAX} caractères`}
            {avecNomPatient ? ", et un nom et un prénom de patient de vingt lettres." : "."} « à », « é »,
            « è » et « ù » restent tels quels ; les autres accents (ê, ç, î…) sont remplacés par la
            lettre simple, pour rester sur un seul SMS.
          </Typography>
        </Stack>
      </Stack>

      {tropLong && (
        <Alert severity="error">
          Le SMS ne tient pas en un seul message. Retirez {longueurPire - MAX_SMS} caractères pour
          pouvoir l&apos;enregistrer.
        </Alert>
      )}
      {erreur && <Alert severity="error">{erreur}</Alert>}

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
          disabled={readOnly || enregistrement || !modifie || Boolean(erreurVariables) || tropLong}
          onClick={() => void enregistrer()}
          sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer le texte"}
        </Button>
      </Stack>

      <Retour
        ouvert={enregistre}
        message={<>Texte du SMS de rappel enregistré.</>}
        gravite={"success"}
        onFermer={() => setEnregistre(false)}
      />
    </Stack>
  );
}
