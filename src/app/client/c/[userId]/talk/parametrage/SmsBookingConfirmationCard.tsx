"use client";

import Retour from "@/components/shared/Retour";
import ChampAvecVariables from "@/components/shared/ChampAvecVariables";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { io as ioClient, Socket } from "socket.io-client";
import {
  CLE_GABARIT_SMS,
  MAX_SMS,
  SMS_STANDARD,
  VARIABLES_SMS,
  donneesExemple,
  donneesPireCas,
  erreurGabarit,
  longueurGsm7,
  rendreSms,
} from "@/lib/talkTextes";
import { enregistrerTextesTalk, useTextesTalk } from "./textesTalk";
import SmsDepotOrdonnanceBloc, { BulleSms } from "./SmsDepotOrdonnanceBloc";

/**
 * Section "Confirmation de RDV par SMS" (à ne pas confondre avec la carte
 * "Rappel de RDV par SMS (No-show)").
 *
 * Un seul flag : au moment où le patient prend un RDV via le bot LyraeTalk,
 * on lui envoie (ou pas) un SMS de confirmation immédiate. Le bot lit le flag
 * via GET /api/configuration, la valeur est stockée dans la même table
 * SmsConfirmationConfig que les autres réglages SMS (colonne dédiée).
 *
 * Auto-save au toggle avec optimistic UI + rollback en cas d'échec.
 *
 * Dépendance métier : si au moins un type d'examen a une ordonnance activée,
 * le switch est **verrouillé sur ON** (le lien de dépôt patient est inclus
 * dans ce SMS, donc désactiver = casser silencieusement le flow ordonnance).
 * Le composant fetch la config prescription pour connaître l'état, et le
 * backend renforce la même règle avec un 409 explicite.
 *
 * Texte du SMS (08/10/2026) : le client écrit son propre gabarit, avec des
 * variables, dans le domaine `talk.textes` (`src/lib/talkTextes.ts`). Il doit
 * tenir en un seul SMS de 160 caractères, mesuré avec le nom et l'adresse du
 * centre. Le lien de dépôt d'ordonnance n'en fait plus partie : le robot
 * l'envoie dans un SMS séparé. Plan :
 * `lyrae/plans/2026-10-confirmation-personnalisable.md`.
 */

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

export default function SmsBookingConfirmationCard({
  userProductId,
  readOnly = false,
  centre = "",
  adresse = "",
}: {
  userProductId: number;
  readOnly?: boolean;
  /** Nom et adresse du centre tels qu'à l'écran, pour l'aperçu. */
  centre?: string;
  adresse?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Liste des types d'examens avec ordonnance active (source: PrescriptionConfig)
  // Utilisée pour verrouiller le switch et afficher l'explication contextuelle.
  const [prescriptionActiveTypes, setPrescriptionActiveTypes] = useState<string[]>(
    []
  );

  // Refetch de la seule config prescription (utilise apres event websocket
  // "prescription-alerts-updated" pour re-synchroniser le lock du switch sans
  // que l'user ait a rafraichir la page manuellement).
  const refetchPrescriptionState = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/prescriptions/config?userProductId=${userProductId}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      const enabledTypes: string[] = Object.entries(data.enabledExamTypes ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      setPrescriptionActiveTypes(enabledTypes);
    } catch {
      // Silencieux : garder l'etat courant plutot que casser l'UI
    }
  }, [userProductId]);

  // Fetch simultané des 2 configs (SMS + prescription) pour connaître l'état
  // et la dépendance dès le mount.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/sms-confirmation-config?userProductId=${userProductId}`).then(
        (r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      ),
      fetch(`/api/prescriptions/config?userProductId=${userProductId}`).then(
        (r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      ),
    ])
      .then(([smsData, prescData]) => {
        if (!alive) return;
        setEnabled(Boolean(smsData.sendConfirmationSms));
        const enabledTypes: string[] = Object.entries(
          prescData.enabledExamTypes ?? {}
        )
          .filter(([, v]) => v === true)
          .map(([k]) => k);
        setPrescriptionActiveTypes(enabledTypes);
      })
      .catch(() => {
        if (!alive) return;
        setError("Impossible de charger la configuration.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userProductId]);

  // Websocket : refresh instantane du lock quand la config prescription
  // change (meme event que le badge navbar/header). Sans ca, apres avoir
  // decoche toutes les ordonnances, le user devait recharger la page pour
  // que le switch se debloque.
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!userProductId) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/socket");
        if (cancelled) return;
        const socket = ioClient({ path: "/api/socket" });
        socketRef.current = socket;
        socket.on("prescription-alerts-updated", () => {
          if (!cancelled) refetchPrescriptionState();
        });
      } catch {
        // Socket KO : le user devra refresh manuellement. Comportement
        // acceptable en degrade.
      }
    })();
    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.off("prescription-alerts-updated");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userProductId, refetchPrescriptionState]);

  const prescriptionLocked = prescriptionActiveTypes.length > 0;
  const prescriptionLabels = prescriptionActiveTypes
    .map((k) => EXAM_LABELS[k] ?? k)
    .join(", ");

  async function toggle(value: boolean) {
    const prev = enabled;
    setEnabled(value);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sms-confirmation-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProductId,
          sendConfirmationSms: value,
        }),
      });
      if (!res.ok) {
        // Cas particulier du 409 (blocage prescription) : message dedie et
        // rollback local.
        if (res.status === 409) {
          const data = await res.json().catch(() => ({} as any));
          setEnabled(prev);
          setError(
            data?.error ??
              "Ce SMS ne peut pas être désactivé tant que le dépôt d'ordonnance est actif : il porte le lien de dépôt."
          );
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setEnabled(Boolean(data.sendConfirmationSms));
      setSavedAt(Date.now());
    } catch {
      setEnabled(prev);
      setError("Échec de l'enregistrement, modification annulée.");
    } finally {
      setSaving(false);
    }
  }

  const switchDisabled = readOnly || saving || (prescriptionLocked && enabled);

  // ── Texte du SMS ───────────────────────────────────────────────────────────
  const { valeur: textes, erreurChargement: erreurTextes } = useTextesTalk(userProductId);
  const [gabarit, setGabarit] = useState("");
  const [gabaritInitial, setGabaritInitial] = useState("");
  const [enregistrementTexte, setEnregistrementTexte] = useState(false);
  const [erreurTexte, setErreurTexte] = useState<string | null>(null);
  const [texteEnregistreA, setTexteEnregistreA] = useState<number | null>(null);

  useEffect(() => {
    if (!textes) return;
    const g = typeof textes[CLE_GABARIT_SMS] === "string" ? (textes[CLE_GABARIT_SMS] as string) : "";
    setGabarit(g);
    setGabaritInitial(g);
  }, [textes]);

  const centreAffiche = centre.trim() || "notre centre";
  const gabaritEffectif = gabarit.trim() || SMS_STANDARD;
  const erreurVariables = gabarit.trim() ? erreurGabarit(gabarit, VARIABLES_SMS) : null;
  const { apercu, longueurPire, longueurDouble } = useMemo(() => {
    if (erreurGabarit(gabaritEffectif, VARIABLES_SMS)) {
      return { apercu: "", longueurPire: 0, longueurDouble: 0 };
    }
    return {
      apercu: rendreSms(gabaritEffectif, donneesExemple(centreAffiche, adresse)),
      longueurPire: longueurGsm7(rendreSms(gabaritEffectif, donneesPireCas(centreAffiche, adresse))),
      longueurDouble: longueurGsm7(
        rendreSms(gabaritEffectif, donneesExemple(centreAffiche, adresse, true))
      ),
    };
  }, [gabaritEffectif, centreAffiche, adresse]);
  const tropLong = Boolean(gabarit.trim()) && longueurPire > MAX_SMS;
  const texteModifie = gabarit.trim() !== gabaritInitial.trim();

  async function enregistrerTexte() {
    setErreurTexte(null);
    setEnregistrementTexte(true);
    try {
      const v = await enregistrerTextesTalk(userProductId, { [CLE_GABARIT_SMS]: gabarit.trim() });
      const g = typeof v[CLE_GABARIT_SMS] === "string" ? (v[CLE_GABARIT_SMS] as string) : "";
      setGabarit(g);
      setGabaritInitial(g);
      setTexteEnregistreA(Date.now());
    } catch (err: any) {
      setErreurTexte(err?.message ?? "L'enregistrement n'a pas abouti. Réessayez.");
    } finally {
      setEnregistrementTexte(false);
    }
  }

  const tooltipTitle = prescriptionLocked
    ? `Toujours actif : le dépôt d'ordonnance est en service pour ${prescriptionLabels}, et ce SMS porte le lien de dépôt. Désactivez d'abord le dépôt d'ordonnance.`
    : "";

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="h6">Confirmation de RDV par SMS</Typography>
          <Chip
            size="small"
            label={enabled ? "Activé" : "Désactivé"}
            sx={{
              bgcolor: enabled ? "rgba(var(--accent-rgb), 0.15)" : "rgba(0,0,0,0.06)",
              color: enabled ? "var(--accent-deep)" : "text.secondary",
              fontWeight: 700,
            }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : (
            <>
              {prescriptionLocked && (
                <Alert
                  severity="info"
                  variant="outlined"
                  sx={{ borderColor: "rgba(var(--accent-rgb), 0.4)" }}
                >
                  Ce réglage reste <strong>toujours actif</strong> car le dépôt
                  d&apos;ordonnance est en service pour : <strong>{prescriptionLabels}</strong>.
                  Ce SMS porte le lien de dépôt du patient. Pour pouvoir le
                  désactiver, désactivez d&apos;abord le dépôt pour ces examens
                  dans la carte &laquo; Dépôt d&apos;ordonnance patient &raquo;.
                </Alert>
              )}

              <Tooltip title={tooltipTitle} placement="top" arrow>
                {/* span wrapper pour permettre au Tooltip de s'afficher meme
                    quand le control est disabled (MUI limitation connue) */}
                <Box component="span" sx={{ display: "inline-block", width: "fit-content" }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={enabled}
                        disabled={switchDisabled}
                        onChange={(e) => toggle(e.target.checked)}
                      />
                    }
                    label={
                      <Stack spacing={0.5}>
                        <Typography variant="body1">
                          Envoyer un SMS au patient quand il prend un RDV par le robot
                          pour lui confirmer.
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Le SMS part à la fin de l&apos;appel. Distinct des rappels
                          no-show configurés ci-dessous.
                        </Typography>
                      </Stack>
                    }
                  />
                </Box>
              </Tooltip>

              {enabled && (
                <Stack spacing={2} sx={{ pt: 1 }}>
                  <Typography variant="subtitle1">Texte du SMS</Typography>
                  {erreurTextes ? (
                    <Alert severity="error">{erreurTextes}</Alert>
                  ) : !textes ? (
                    <Stack alignItems="center" sx={{ py: 1 }}>
                      <CircularProgress size={20} sx={{ color: "var(--accent)" }} />
                    </Stack>
                  ) : (
                    <>
                      <ChampAvecVariables
                        label="Message envoyé au patient"
                        valeur={gabarit}
                        onChange={setGabarit}
                        variables={VARIABLES_SMS}
                        placeholder={SMS_STANDARD}
                        minRows={4}
                        erreur={erreurVariables}
                        aide={
                          gabarit.trim()
                            ? undefined
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
                          texte={apercu || "Corrigez les variables pour voir l'aperçu."}
                        />
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
                            Compté au plus long : nom et adresse de votre centre, nom et
                            prénom de vingt lettres. Les accents absents des SMS (ê, ç, î…)
                            sont remplacés par la lettre simple.
                          </Typography>
                        </Stack>
                      </Stack>

                      {tropLong && (
                        <Alert severity="error">
                          Le SMS ne tient pas en un seul message. Retirez{" "}
                          {longueurPire - MAX_SMS} caractères pour pouvoir l&apos;enregistrer.
                        </Alert>
                      )}
                      {!gabarit.trim() && longueurPire > MAX_SMS && (
                        <Alert severity="info">
                          Avec le nom et l&apos;adresse de votre centre, le texte standard peut
                          dépasser {MAX_SMS} caractères. Le robot retire alors l&apos;adresse
                          pour rester sur un seul SMS.
                        </Alert>
                      )}
                      {!tropLong && gabarit.trim() && longueurDouble > MAX_SMS && (
                        <Alert severity="warning">
                          Pour deux rendez-vous pris dans le même appel, ce texte dépasse{" "}
                          {MAX_SMS} caractères. Le robot enverra alors un texte standard plus
                          court, pour rester sur un seul SMS.
                        </Alert>
                      )}
                      {erreurTexte && <Alert severity="error">{erreurTexte}</Alert>}

                      <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                        <Button
                          variant="text"
                          disabled={readOnly || enregistrementTexte || !gabarit.trim()}
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
                            enregistrementTexte ||
                            !texteModifie ||
                            Boolean(erreurVariables) ||
                            tropLong
                          }
                          onClick={() => void enregistrerTexte()}
                          sx={{
                            bgcolor: "var(--accent)",
                            "&:hover": { bgcolor: "var(--accent-press)" },
                          }}
                        >
                          {enregistrementTexte ? "Enregistrement…" : "Enregistrer le texte"}
                        </Button>
                      </Stack>

                      {/* Lot 4 : le SMS de dépôt et son ordre, seulement si le dépôt
                          d'ordonnance est actif (même condition que le verrou). */}
                      {prescriptionLocked && (
                        <>
                          <Divider />
                          <SmsDepotOrdonnanceBloc
                            userProductId={userProductId}
                            textes={textes}
                            readOnly={readOnly}
                            centre={centre}
                            apercuConfirmation={apercu}
                          />
                        </>
                      )}
                    </>
                  )}
                </Stack>
              )}
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>

        <Retour
          ouvert={texteEnregistreA !== null}
          message={<>Texte du SMS enregistré.</>}
          gravite={"success"}
          onFermer={() => setTexteEnregistreA(null)}
        />
        <Retour
          ouvert={savedAt !== null}
          message={<>Enregistré</>}
          gravite={"success"}
          onFermer={() => setSavedAt(null)}
        />
      </AccordionDetails>
    </Accordion>
  );
}
