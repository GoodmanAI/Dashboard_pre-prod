"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { IconCheck, IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Où en est l'installation de chaque centre LyraeKonnect (lot G6).
 *
 * Installer un centre demande cinq gestes, et chacun conditionne le suivant. Ils se
 * font sur trois écrans différents, et personne ne pouvait dire d'un coup d'œil où
 * en était un client donné : il fallait ouvrir chaque écran et se souvenir.
 *
 * Cette page répond à cette question, et à elle seule. Elle ne règle rien : chaque
 * ligne renvoie vers l'écran qui règle, parce qu'un tableau de bord qui devient un
 * second endroit où saisir recrée le problème qu'on vient de fermer côté Konnect.
 *
 * L'ORDRE COMPTE, et l'écran le montre. Le rattachement est bloquant depuis le lot
 * G : un centre non rattaché n'a plus aucune interface de configuration, ni ici ni
 * dans Konnect. Tant qu'il manque, le reste ne sert à rien.
 */

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE_MUTED = "#F7FAFB";
const OK = "#186A3B";
const MANQUE = "#9B2226";

type Centre = {
  userProductId: number;
  userId: number;
  clientNom: string | null;
  clientEmail: string | null;
  tenantId: string | null;
  aDesParametres: boolean;
  examensAttribues: number;
  examensTotal: number;
  sites: number;
  telephoneSecretariat: string | null;
};

type Etape = {
  cle: string;
  titre: string;
  /** Fait, ou pas. Rien d'intermédiaire : une étape à moitié faite est à refaire. */
  fait: (c: Centre) => boolean;
  /** Ce qui manque, dit en clair. Affiché seulement quand l'étape ne l'est pas. */
  manque: string;
  /** L'écran qui règle. Une page d'état renvoie, elle ne saisit pas. */
  lien: (c: Centre) => string;
  /** Sans cette étape, les suivantes ne servent à rien. */
  bloquante?: boolean;
};

const ETAPES: Etape[] = [
  {
    cle: "rattachement",
    titre: "Rattachement",
    fait: (c) => Boolean(c.tenantId),
    manque: "Le portail ne sait pas à quel centre il parle. Rien d'autre ne s'appliquera.",
    lien: () => "/admin/external-mapping",
    bloquante: true,
  },
  {
    cle: "parametres",
    titre: "Paramètres",
    fait: (c) => c.aDesParametres,
    manque: "Le portail tourne sur les valeurs par défaut.",
    lien: (c) => `/client/services/konnect/${c.userProductId}/parametrage`,
  },
  {
    cle: "telephone",
    titre: "Téléphone",
    fait: (c) => Boolean(c.telephoneSecretariat?.trim()),
    manque: "Un patient bloqué n'a aucun numéro à appeler.",
    lien: (c) => `/client/services/konnect/${c.userProductId}/parametrage`,
  },
  {
    cle: "examens",
    titre: "Examens",
    fait: (c) => c.examensAttribues > 0,
    manque: "Aucun examen n'a de code : le patient ne pourra rien réserver.",
    lien: (c) => `/client/services/konnect/${c.userProductId}/examens`,
  },
  {
    cle: "sites",
    titre: "Sites",
    fait: (c) => c.sites > 0,
    manque: "Le patient ne saura pas où se présenter.",
    lien: (c) => `/client/services/konnect/${c.userProductId}/sites`,
  },
];

function Pastille({ fait }: { fait: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: "50%",
        bgcolor: fait ? "#E8F5EE" : "#FDE8E8",
        color: fait ? OK : MANQUE,
      }}
    >
      {fait ? <IconCheck size={16} /> : <IconAlertTriangle size={15} />}
    </Box>
  );
}

export default function InstallationKonnect() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await fetch("/api/konnect-installation");
        if (!r.ok) throw new Error("Chargement impossible.");
        const d = await r.json();
        if (!annule) setCentres(Array.isArray(d.centres) ? d.centres : []);
      } catch {
        if (!annule) setErreur("Impossible de charger l'état des installations.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  const aFinir = useMemo(
    () => centres.filter((c) => ETAPES.some((e) => !e.fait(c))).length,
    [centres]
  );

  if (chargement) {
    return (
      <PageContainer title="Installation Konnect" description="Où en est chaque centre">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Installation Konnect" description="Où en est chaque centre">
      <Box>
        <SectionHeader
          title="Installation des centres"
          subtitle="Ce qui reste à faire pour que chaque portail fonctionne"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          Cinq étapes par centre, dans cet ordre. Cette page dit où en est chacun et
          renvoie vers l&apos;écran qui règle : elle ne modifie rien elle-même.
        </Typography>

        <Alert severity="info" sx={{ mb: 2.5 }}>
          Le rattachement conditionne tout le reste. Sans lui, le portail ne sait pas à
          quel centre il parle, et il n&apos;existe plus aucune autre interface pour le
          configurer.
        </Alert>

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {erreur}
          </Alert>
        )}

        {centres.length > 0 && (
          <Typography variant="body2" sx={{ color: INK_MUTED, mb: 1.5 }}>
            {aFinir === 0
              ? `${centres.length} centre${centres.length > 1 ? "s" : ""}, tout est en place.`
              : `${aFinir} centre${aFinir > 1 ? "s" : ""} sur ${centres.length} à finir.`}
          </Typography>
        )}

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ overflowX: "auto", borderColor: BORDER, borderRadius: 2 }}
        >
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    bgcolor: SURFACE_MUTED,
                    color: INK_MUTED,
                    fontWeight: 600,
                    fontSize: 11.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Centre
                </TableCell>
                {ETAPES.map((e) => (
                  <TableCell
                    key={e.cle}
                    align="center"
                    sx={{
                      bgcolor: SURFACE_MUTED,
                      color: INK_MUTED,
                      fontWeight: 600,
                      fontSize: 11.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: `1px solid ${BORDER}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.titre}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {centres.map((c) => {
                const premiereManquante = ETAPES.find((e) => !e.fait(c));
                return (
                  <TableRow
                    key={c.userProductId}
                    hover
                    sx={{
                      "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
                      "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1.25 },
                    }}
                  >
                    <TableCell>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                        {c.clientNom ?? `Centre ${c.userProductId}`}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
                        {c.clientEmail ?? `identifiant ${c.userProductId}`}
                      </Typography>
                      {premiereManquante && (
                        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.75 }}>
                          <Typography sx={{ fontSize: 11.5, color: MANQUE }}>
                            {premiereManquante.manque}
                          </Typography>
                          <Button
                            component={Link}
                            href={premiereManquante.lien(c)}
                            size="small"
                            endIcon={<IconArrowRight size={14} />}
                            sx={{ textTransform: "none", fontSize: 11.5, minWidth: 0, py: 0 }}
                          >
                            Régler
                          </Button>
                        </Stack>
                      )}
                    </TableCell>
                    {ETAPES.map((e) => {
                      const fait = e.fait(c);
                      return (
                        <TableCell key={e.cle} align="center">
                          <Tooltip title={fait ? "Fait" : e.manque} placement="top">
                            <Box component="span" sx={{ display: "inline-block" }}>
                              <Pastille fait={fait} />
                            </Box>
                          </Tooltip>
                          {e.cle === "examens" && c.examensTotal > 0 && (
                            <Typography sx={{ fontSize: 11, color: INK_MUTED, mt: 0.25 }}>
                              {c.examensAttribues}/{c.examensTotal}
                            </Typography>
                          )}
                          {e.cle === "sites" && c.sites > 0 && (
                            <Typography sx={{ fontSize: 11, color: INK_MUTED, mt: 0.25 }}>
                              {c.sites}
                            </Typography>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              {centres.length === 0 && !erreur && (
                <TableRow>
                  <TableCell colSpan={ETAPES.length + 1} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: INK_MUTED }}>
                      Aucun centre n&apos;a le produit LyraeKonnect. Affiliez-en un depuis
                      la gestion des clients.
                    </Typography>
                    <Button
                      component={Link}
                      href="/admin/manage-clients"
                      size="small"
                      sx={{ textTransform: "none", mt: 1 }}
                    >
                      Gérer les clients
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" fontWeight={600} sx={{ color: INK, mb: 0.5 }}>
            Ce qui ne se règle pas ici
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED }}>
            La connexion au logiciel de gestion du centre, son code de site et sa
            messagerie se paramètrent dans l&apos;espace technique de Konnect. Ces
            réglages portent des identifiants et des mots de passe, qui n&apos;ont pas
            leur place ici.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip label="Connexion RIS" size="small" sx={{ height: 22, fontSize: 11.5 }} />
            <Chip label="Code de site" size="small" sx={{ height: 22, fontSize: 11.5 }} />
            <Chip label="Messagerie" size="small" sx={{ height: 22, fontSize: 11.5 }} />
          </Stack>
        </Box>
      </Box>
    </PageContainer>
  );
}
