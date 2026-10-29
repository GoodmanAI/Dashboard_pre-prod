"use client";

import Retour from "@/components/shared/Retour";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import EnTete, { SX_COLLEE_A_DROITE } from "@/components/shared/EnTeteTableau";
import TuileChiffre from "@/components/shared/TuileChiffre";
import DialogConfirmation from "@/components/shared/DialogConfirmation";
import { INK, INK_MUTED, BORDER, SURFACE, OK } from "@/lib/jetons";
import { useFiltresRecherche } from "@/lib/recherche/integre";
import { contientTousLesMots } from "@/lib/recherche/texte";

/**
 * Liste d'attente des patients LyraeKonnect (27/10/2026, lot L2). La page
 * `client/c/[userId]/konnect/liste-attente` la monte avec l'affiliation du centre.
 * Plan workspace `plans/2026-10-file-attente-konnect.md` (K12, K13).
 *
 * Quand un examen coché « File d'attente » n'a plus de créneau, le patient s'inscrit
 * dans le portail. Le moteur de Konnect lui propose par SMS la première place qui se
 * libère. La secrétaire, elle, voit des créneaux que le portail ne voit pas : elle
 * peut appeler un patient, lui donner une place et le marquer traité, ou le retirer.
 *
 * Une liste par code examen qui a au moins un patient, dans l'ordre de la file. La
 * page se relit toutes les 30 secondes et après chaque geste : le moteur peut avoir
 * proposé une place entre-temps. Chaque geste part tout de suite ; s'il arrive après
 * celui du moteur, le serveur le refuse et la page le dit.
 */

type Creneau = { codeSite: string; poste: string; date: string; heure: string };

type Patient = {
  id: number;
  rang: number;
  nom: string;
  prenom: string;
  dateNaissance: string;
  telephone: string;
  sites: string[];
  etat: string;
  creneau: Creneau | null;
  reponseAvant: string | null;
  createdAt: string;
};

type Code = { codeExamen: string; examenLibelle: string; patients: Patient[] };

type Stats = {
  inscrits: number;
  enFile: number;
  prisParLaFile: number;
  traitesSecretaire: number;
  jamaisPrisEnCharge: number;
  retiresSecretaire: number;
  plusBesoin: number;
  expires: number;
  smsEnvoyes: number;
  smsRepondus: number;
  smsSansReponse: number;
};

const RELECTURE_MS = 30_000;

function jjmmaaaa(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** « depuis 3 jours » : c'est l'attente qui compte, pas la date. */
function depuis(iso: string): string {
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `depuis ${jours} jours`;
}

function pourcentage(part: number, total: number): string | undefined {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : undefined;
}

/** Ce que la secrétaire doit savoir de l'état d'un patient. */
function Etat({ p }: { p: Patient }) {
  if (p.etat === "proposition" && p.creneau) {
    return (
      <Box>
        <Chip
          size="small"
          label="Place proposée par SMS"
          sx={{
            fontWeight: 600,
            fontSize: 11.5,
            color: "#B4602A",
            bgcolor: "#FCF0E6",
          }}
        />
        <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mt: 0.5 }}>
          {jjmmaaaa(p.creneau.date)} à {p.creneau.heure.replace(":", "h")},{" "}
          {p.creneau.codeSite}
          {p.reponseAvant
            ? `. Réponse attendue jusqu'à ${heure(p.reponseAvant)}`
            : ""}
        </Typography>
      </Box>
    );
  }
  if (p.etat === "confirmation_en_cours") {
    return (
      <Chip
        size="small"
        label="Confirme en ligne"
        sx={{ fontWeight: 600, fontSize: 11.5, color: OK, bgcolor: "#E5F5EE" }}
      />
    );
  }
  return (
    <Chip
      size="small"
      label="En attente"
      sx={{
        fontWeight: 600,
        fontSize: 11.5,
        color: INK_MUTED,
        bgcolor: "#F1F5F9",
      }}
    />
  );
}

export default function ListeAttenteEcran({
  userProductId,
}: {
  userProductId: number | null;
}) {
  const [codes, setCodes] = useState<Code[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState<number | null>(null);
  // Deux erreurs : la relecture efface la sienne quand elle réussit, pas celle d'un geste refusé.
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurGeste, setErreurGeste] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [aRetirer, setARetirer] = useState<Patient | null>(null);
  const premierChargement = useRef(true);
  // Patient nommé par la recherche centrale : ses listes s'ouvrent, sa ligne est soulignée.
  // L'écran n'a pas de champ de recherche, il ne masque donc personne.
  const nomCherche = useFiltresRecherche().nom;
  const nomChercheRef = useRef(nomCherche);
  const estCherche = useCallback(
    (p: Patient) => !!nomCherche && contientTousLesMots(`${p.prenom} ${p.nom}`, nomCherche),
    [nomCherche],
  );

  const charger = useCallback(async () => {
    if (!userProductId) return;
    try {
      const r = await fetch(
        `/api/konnect-file-attente/ecran?userProductId=${userProductId}`,
        {
          cache: "no-store",
        },
      );
      if (!r.ok) throw new Error();
      const data = await r.json();
      const liste: Code[] = Array.isArray(data.codes) ? data.codes : [];
      setCodes(liste);
      setStats(data.stats ?? null);
      // Une seule liste : on l'ouvre d'office. Plusieurs : la secrétaire choisit.
      if (premierChargement.current && nomChercheRef.current) {
        const nom = nomChercheRef.current;
        setOuverts(
          Object.fromEntries(
            liste
              .filter((c) => c.patients.some((p) => contientTousLesMots(`${p.prenom} ${p.nom}`, nom)))
              .map((c) => [c.codeExamen, true]),
          ),
        );
      } else if (premierChargement.current && liste.length === 1) {
        setOuverts({ [liste[0].codeExamen]: true });
      }
      premierChargement.current = false;
      setErreur(null);
    } catch {
      setErreur(
        "Impossible de charger la liste d'attente. La page réessaie dans 30 secondes.",
      );
    } finally {
      setChargement(false);
    }
  }, [userProductId]);

  useEffect(() => {
    void charger();
    const t = setInterval(() => void charger(), RELECTURE_MS);
    return () => clearInterval(t);
  }, [charger]);

  async function agir(p: Patient, geste: "traiter" | "retirer") {
    setEnCours(p.id);
    setErreurGeste(null);
    try {
      const r = await fetch(
        `/api/konnect-file-attente/ecran?userProductId=${userProductId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.id, geste }),
        },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(
          data?.error ?? "Le geste n'a pas été enregistré. Réessayez.",
        );
      setMessage(
        geste === "traiter"
          ? `Rendez-vous traité : ${p.prenom} ${p.nom} ne figure plus dans la liste.`
          : `${p.prenom} ${p.nom} ne figure plus dans la liste.`,
      );
    } catch (e: any) {
      setErreurGeste(
        e?.message ?? "Le geste n'a pas été enregistré. Réessayez.",
      );
    } finally {
      setEnCours(null);
      setARetirer(null);
      void charger();
    }
  }

  const total = useMemo(
    () => codes.reduce((n, c) => n + c.patients.length, 0),
    [codes],
  );

  if (chargement) {
    return (
      <PageContainer
        title="Liste d'attente"
        description="Les patients qui attendent une place"
      >
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Liste d'attente"
      description="Les patients qui attendent une place"
    >
      <Box>
        <SectionHeader
          title="Liste d'attente"
          subtitle="Les patients qui attendent qu'une place se libère, examen par examen"
          actions={
            <Chip
              label={
                total === 0
                  ? "Personne en attente"
                  : `${total} patient${total > 1 ? "s" : ""} en attente`
              }
              sx={{
                fontWeight: 600,
                color: total > 0 ? "#B4602A" : INK_MUTED,
                bgcolor: total > 0 ? "#FCF0E6" : "#F1F5F9",
              }}
            />
          }
        />

        <Typography
          variant="body2"
          sx={{ color: INK_MUTED, mb: 2.5, maxWidth: 820 }}
        >
          Ces patients n&apos;ont pas trouvé de créneau en ligne et se sont
          inscrits. Dès qu&apos;une place se libère, le premier de la liste la
          reçoit par SMS. Si vous avez une place à leur donner, appelez-les dans
          l&apos;ordre, prenez le rendez-vous et cliquez « Rendez-vous traité
          par la secrétaire ».
        </Typography>

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {erreur}
          </Alert>
        )}
        {erreurGeste && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            onClose={() => setErreurGeste(null)}
          >
            {erreurGeste}
          </Alert>
        )}

        {nomCherche &&
          codes.length > 0 &&
          !codes.some((c) => c.patients.some(estCherche)) && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Aucun patient nommé « {nomCherche} » dans la liste d&apos;attente. Il a
              peut-être déjà reçu une place ou été retiré.
            </Alert>
          )}

        {codes.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              borderColor: BORDER,
              borderRadius: 2,
              py: 6,
              px: 3,
              textAlign: "center",
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: INK }}>
              Personne en liste d&apos;attente.
            </Typography>
            <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.5 }}>
              La liste s&apos;ouvre examen par examen : cochez « File
              d&apos;attente » dans les examens du portail, pour un examen
              réservable en ligne.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={1.25}>
            {codes.map((c) => {
              const proposees = c.patients.filter(
                (p) => p.etat !== "en_file",
              ).length;
              return (
                <Accordion
                  key={c.codeExamen}
                  disableGutters
                  expanded={ouverts[c.codeExamen] === true}
                  onChange={(_, v) =>
                    setOuverts((o) => ({ ...o, [c.codeExamen]: v }))
                  }
                  sx={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: "8px !important",
                    boxShadow: "none",
                    "&:before": { display: "none" },
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ width: "100%", pr: 1 }}
                    >
                      <Typography
                        sx={{ fontSize: 14, fontWeight: 600, color: INK }}
                      >
                        {c.examenLibelle || c.codeExamen}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: INK_MUTED,
                          fontFamily: "monospace",
                        }}
                      >
                        {c.codeExamen}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      {proposees > 0 && (
                        <Chip
                          size="small"
                          label={`${proposees} place${proposees > 1 ? "s" : ""} proposée${proposees > 1 ? "s" : ""}`}
                          sx={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: "#B4602A",
                            bgcolor: "#FCF0E6",
                          }}
                        />
                      )}
                      <Chip
                        size="small"
                        label={`${c.patients.length} patient${c.patients.length > 1 ? "s" : ""}`}
                        sx={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: INK,
                          bgcolor: "#F1F5F9",
                        }}
                      />
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 0 }}>
                    <TableContainer
                      sx={{
                        overflowX: "auto",
                        borderTop: `1px solid ${BORDER}`,
                      }}
                    >
                      <Table size="small" sx={{ minWidth: 1100 }}>
                        <TableHead>
                          <TableRow>
                            <EnTete
                              largeur={56}
                              aide="Le rang dans la file : le premier reçoit la prochaine place."
                            >
                              Rang
                            </EnTete>
                            <EnTete largeur={210}>Patient</EnTete>
                            <EnTete largeur={110}>Né le</EnTete>
                            <EnTete
                              largeur={140}
                              aide="Cliquez pour composer depuis un poste équipé."
                            >
                              Téléphone
                            </EnTete>
                            <EnTete
                              largeur={150}
                              aide="Les sites que le patient accepte."
                            >
                              Sites
                            </EnTete>
                            <EnTete largeur={120}>Inscrit</EnTete>
                            <EnTete>État</EnTete>
                            <EnTete colle largeur={300}>Action</EnTete>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {c.patients.map((p) => {
                            // Pendant les quelques secondes où le patient confirme en
                            // ligne, le serveur refuserait le geste : on ne le propose pas.
                            const bloque =
                              p.etat === "confirmation_en_cours" ||
                              enCours === p.id;
                            return (
                              <TableRow
                                key={p.id}
                                hover
                                sx={{
                                  ...(estCherche(p) && { bgcolor: "rgba(var(--accent-rgb), 0.1)" }),
                                  "& > td": {
                                    borderBottom: `1px solid ${BORDER}`,
                                    py: 1,
                                  },
                                }}
                              >
                                <TableCell>
                                  <Typography
                                    sx={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: INK,
                                    }}
                                  >
                                    {p.rang}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography
                                    sx={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: INK,
                                    }}
                                  >
                                    {p.prenom} {p.nom}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography sx={{ fontSize: 13, color: INK }}>
                                    {jjmmaaaa(p.dateNaissance)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <MuiLink
                                    href={`tel:${p.telephone}`}
                                    underline="hover"
                                    sx={{
                                      fontSize: 13,
                                      fontFamily: "monospace",
                                      color: "var(--accent-press)",
                                    }}
                                  >
                                    {p.telephone}
                                  </MuiLink>
                                </TableCell>
                                <TableCell>
                                  <Typography
                                    sx={{ fontSize: 12.5, color: INK }}
                                  >
                                    {p.sites.length === 0
                                      ? "Tous les sites"
                                      : p.sites.join(", ")}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Typography sx={{ fontSize: 13, color: INK }}>
                                    {depuis(p.createdAt)}
                                  </Typography>
                                  <Typography
                                    sx={{ fontSize: 11.5, color: INK_MUTED }}
                                  >
                                    {jjmmaaaa(p.createdAt)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Etat p={p} />
                                </TableCell>
                                <TableCell sx={SX_COLLEE_A_DROITE}>
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    flexWrap="wrap"
                                    useFlexGap
                                  >
                                    <Button
                                      size="small"
                                      variant="contained"
                                      disableElevation
                                      disabled={bloque}
                                      onClick={() => void agir(p, "traiter")}
                                      sx={{
                                        fontSize: 12.5,
                                        bgcolor: "var(--accent)",
                                        "&:hover": {
                                          bgcolor: "var(--accent-press)",
                                        },
                                      }}
                                    >
                                      Rendez-vous traité par la secrétaire
                                    </Button>
                                    <Button
                                      size="small"
                                      disabled={bloque}
                                      onClick={() => setARetirer(p)}
                                      sx={{ fontSize: 12.5, color: INK_MUTED }}
                                    >
                                      Retirer de la file
                                    </Button>
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
        )}

        {stats && (
          <Box sx={{ mt: 4 }}>
            <Typography
              sx={{ fontSize: 15, fontWeight: 700, color: INK, mb: 0.5 }}
            >
              Statistiques
            </Typography>
            <Typography variant="body2" sx={{ color: INK_MUTED, mb: 1.5 }}>
              Depuis l&apos;ouverture de la liste d&apos;attente, tous examens
              confondus.
            </Typography>
            <Box
              sx={{
                display: "grid",
                gap: 1.25,
                gridTemplateColumns: {
                  xs: "1fr 1fr",
                  sm: "repeat(3, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
              }}
            >
              <TuileChiffre
                libelle="Inscrits"
                valeur={stats.inscrits}
                detail={`${stats.enFile} encore en attente`}
              />
              <TuileChiffre
                libelle="Rendez-vous pris par la file d'attente"
                valeur={stats.prisParLaFile}
                detail={pourcentage(stats.prisParLaFile, stats.inscrits)}
                couleur={OK}
              />
              <TuileChiffre
                libelle="Traités par la secrétaire"
                valeur={stats.traitesSecretaire}
                detail={pourcentage(stats.traitesSecretaire, stats.inscrits)}
              />
              <TuileChiffre
                libelle="Jamais pris en charge"
                valeur={stats.jamaisPrisEnCharge}
                aide="Sortis de la liste sans rendez-vous : plus besoin, sans réponse, dates refusées, 60 jours sans place, ou retirés par la secrétaire."
                detail={`dont ${stats.retiresSecretaire} retirés, ${stats.expires} après 60 jours`}
              />
              <TuileChiffre libelle="SMS envoyés" valeur={stats.smsEnvoyes} />
              <TuileChiffre
                libelle="SMS avec réponse"
                valeur={stats.smsRepondus}
                detail={pourcentage(stats.smsRepondus, stats.smsEnvoyes)}
              />
              <TuileChiffre
                libelle="SMS sans réponse"
                valeur={stats.smsSansReponse}
                detail={pourcentage(stats.smsSansReponse, stats.smsEnvoyes)}
                aide="Le délai pour confirmer est passé sans réponse. Au deuxième, le patient sort de la liste."
              />
            </Box>
          </Box>
        )}

        <Typography variant="body2" sx={{ color: INK_MUTED, mt: 3 }}>
          Un patient sorti de la liste est effacé au bout de 30 jours. Un
          patient inscrit depuis 60 jours sans place sort de la liste. Les
          statistiques restent.
        </Typography>

        <DialogConfirmation
          ouvert={aRetirer !== null}
          titre="Retirer ce patient de la liste ?"
          texte={
            aRetirer
              ? `${aRetirer.prenom} ${aRetirer.nom} ne recevra plus de place par SMS. Faites-le seulement s'il n'a plus besoin du rendez-vous ou s'il est pris en charge autrement.`
              : ""
          }
          libelleAction="Retirer de la file"
          enCours={aRetirer !== null && enCours === aRetirer.id}
          onConfirmer={() => aRetirer && void agir(aRetirer, "retirer")}
          onAnnuler={() => setARetirer(null)}
        />

        <Retour
          ouvert={message !== null}
          message={message}
          gravite={"success"}
          onFermer={() => setMessage(null)}
        />
      </Box>
    </PageContainer>
  );
}
