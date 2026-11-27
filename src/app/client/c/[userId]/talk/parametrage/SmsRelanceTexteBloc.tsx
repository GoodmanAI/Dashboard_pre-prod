"use client";

import Retour from "@/components/shared/Retour";
import ChampAvecVariables from "@/components/shared/ChampAvecVariables";
import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import {
  CENTRE_RELANCE_MAX,
  CLE_GABARIT_RELANCE,
  CLE_GABARIT_RELANCE_ANNULATION,
  MAX_SMS,
  SMS_RELANCE_ANNULATION_STANDARD,
  SMS_RELANCE_STANDARD,
  VARIABLES_RELANCE,
  donneesRelanceExemple,
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
 * Deux textes possibles, selon « Ce que le SMS propose au patient » : confirmer ou
 * annuler, et annulation seule. On n'affiche que ceux que le centre envoie vraiment.
 * Rangés dans `talk.textes` du produit qui porte les relances (`porteurRelances`), lus
 * par AI2Xplore dans `GET /api/sms-confirmation-config`. Un seul SMS de 160 caractères,
 * mesuré au pire cas (nom du centre à 25, nom et prénom à 20) : le serveur refuse le
 * reste, l'écran le dit avant.
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
  centre: string;
  avecConfirmation: boolean;
  avecAnnulationSeule: boolean;
  readOnly: boolean;
}) {
  const { valeur: textes, erreurChargement } = useTextesTalk(porteurId);

  if (erreurChargement) return <Alert severity="error">{erreurChargement}</Alert>;
  if (!textes) {
    return (
      <Stack alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={20} sx={{ color: "var(--accent)" }} />
      </Stack>
    );
  }
  const deux = avecConfirmation && avecAnnulationSeule;
  return (
    <Stack spacing={3} id="texte_sms_rappel">
      <Box>
        <Typography variant="subtitle1">Texte du SMS</Typography>
        <Typography variant="body2" color="text.secondary">
          Vous pouvez écrire le nom de votre centre en toutes lettres à la place de{" "}
          {"{centre}"}. Un SMS compte 160 caractères au plus : au-delà, chaque relance coûte
          deux SMS, et l&apos;écran refuse de l&apos;enregistrer.
        </Typography>
      </Box>
      {avecConfirmation && (
        <EditeurRelance
          porteurId={porteurId}
          textes={textes}
          cle={CLE_GABARIT_RELANCE}
          standard={SMS_RELANCE_STANDARD}
          titre={deux ? "Quand le patient peut confirmer ou annuler" : undefined}
          centre={centre}
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
          centre={centre}
          readOnly={readOnly}
        />
      )}
    </Stack>
  );
}

function EditeurRelance({
  porteurId,
  textes,
  cle,
  standard,
  titre,
  centre,
  readOnly,
}: {
  porteurId: number;
  textes: Record<string, unknown>;
  cle: string;
  standard: string;
  titre?: string;
  centre: string;
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

  const centreAffiche = centre.trim() || "Votre centre";
  const effectif = gabarit.trim() || standard;
  const erreurVariables = gabarit.trim() ? erreurVariablesRelance(gabarit) : null;
  const { apercu, longueurApercu, longueurPire } = useMemo(() => {
    if (erreurVariablesRelance(effectif)) return { apercu: "", longueurApercu: 0, longueurPire: 0 };
    const a = rendreSmsRelance(effectif, donneesRelanceExemple(centreAffiche));
    return { apercu: a, longueurApercu: longueurGsm7(a), longueurPire: longueurRelancePireCas(effectif) };
  }, [effectif, centreAffiche]);
  const tropLong = Boolean(gabarit.trim()) && longueurPire > MAX_SMS;
  const modifie = gabarit.trim() !== initial.trim();
  const centreCoupe = /\{centre\}/.test(effectif) && centreAffiche.length > CENTRE_RELANCE_MAX;

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const v = await enregistrerTextesTalk(porteurId, { [cle]: gabarit.trim() });
      const g = typeof v[cle] === "string" ? (v[cle] as string) : "";
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
            Compté au plus long : nom du centre de {CENTRE_RELANCE_MAX} caractères, nom et prénom
            de vingt lettres. « à », « é », « è » et « ù » restent tels quels ; les autres accents
            (ê, ç, î…) sont remplacés par la lettre simple, pour rester sur un seul SMS.
          </Typography>
        </Stack>
      </Stack>

      {centreCoupe && (
        <Alert severity="info">
          Le nom de votre centre dépasse {CENTRE_RELANCE_MAX} caractères : {"{centre}"} sera coupé.
          Pour l&apos;avoir en entier, écrivez-le en toutes lettres dans le message.
        </Alert>
      )}
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
