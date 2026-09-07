"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  IconCheck,
  IconAlertTriangle,
  IconArrowRight,
  IconPlus,
} from "@tabler/icons-react";
import Link from "next/link";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { cheminCentre } from "@/lib/cheminsCentre";
import SectionHeader from "@/components/admin/SectionHeader";
import { PRODUITS } from "@/lib/produits";
import type { Manque } from "@/lib/completude/types";
import { STATUTS, type StatutCentre } from "@/lib/centreStatut";

/**
 * Installer un centre LyraeTalk, de bout en bout (lot I2).
 *
 * Pendant de la page Konnect, même mécanique, mais les deux produits ne
 * s'installent pas pareil et cette page ne cherche pas à les faire ressembler.
 *
 * **LA DIFFÉRENCE QUI COMPTE : les codes centres.** Konnect rattache UN portail à un
 * compte. Talk accepte N codes centres pour un même compte, un client pouvant
 * exploiter plusieurs centres sous un seul contrat. La page gère donc une liste,
 * pas un champ.
 *
 * Et ces codes sont la clé de jointure avec AI2Xplore : une faute de frappe n'y
 * produit aucune erreur, les rendez-vous n'arrivent simplement jamais. Ils sont donc
 * affichés en clair, pour être relus, plutôt que résumés par un compteur.
 *
 * Même partage que la page Konnect : on installe, on ne paramètre pas. Les réglages
 * du robot, le mapping d'examens, les SMS, les ordonnances et la FAQ appartiennent
 * au client et sont affichés avec un renvoi.
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
  codesCentres: string[];
  numeros: string[];
  aDesReglages: boolean;
  botName: string | null;
  examensAttribues: number;
  aSmsConfirmation: boolean;
  aDepotOrdonnances: boolean;
  faq: number;
  statut: StatutCentre;
  manques: Manque[];
};

/**
 * Le manque portant cette clé, ou `undefined` si l'information est en place.
 *
 * Les blocs ci-dessous ne jugent plus par eux-mêmes : ils demandent au registre.
 * C'est ce qui garantit que cette page et le bandeau du client disent la même
 * chose — avant, chacun portait sa propre version de la règle, et le bloc
 * « Questions par examen » vérifiait en fait la présence des réglages du robot,
 * affichant en vert des centres qui n'avaient aucune question.
 */
function chercher(centre: Centre | null, cle: string): Manque | undefined {
  return centre?.manques?.find((m) => m.cle === cle);
}

/** Les clés déjà rendues par un bloc numéroté : le reste va au récapitulatif. */
const CLES_AVEC_BLOC = [
  "talk.codes-centres",
  "talk.numero-entrant",
  "talk.codes-examens",
  "talk.questions-examens",
  "talk.faq",
];

function Etat({ fait, children }: { fait: boolean; children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          borderRadius: "50%",
          flex: "0 0 auto",
          bgcolor: fait ? "#E8F5EE" : "#FDE8E8",
          color: fait ? OK : MANQUE,
        }}
      >
        {fait ? <IconCheck size={15} /> : <IconAlertTriangle size={14} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}

function Bloc({
  numero,
  titre,
  fait,
  manque,
  children,
}: {
  numero: number;
  titre: string;
  fait: boolean;
  manque: string;
  children?: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: children ? 1.5 : 0 }}>
        <Typography sx={{ fontSize: 12, color: INK_MUTED, minWidth: 16 }}>{numero}</Typography>
        <Etat fait={fait}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{titre}</Typography>
          {!fait && <Typography sx={{ fontSize: 12, color: MANQUE }}>{manque}</Typography>}
        </Etat>
      </Stack>
      {children}
    </Paper>
  );
}

function BlocRenvoi({
  numero,
  titre,
  fait,
  manque,
  detail,
  href,
}: {
  numero: number;
  titre: string;
  fait: boolean;
  manque: string;
  detail?: string;
  href: string;
}) {
  return (
    <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Typography sx={{ fontSize: 12, color: INK_MUTED, minWidth: 16 }}>{numero}</Typography>
        <Etat fait={fait}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{titre}</Typography>
          <Typography sx={{ fontSize: 12, color: fait ? INK_MUTED : MANQUE }}>
            {fait ? (detail ?? "Réglé") : manque}
          </Typography>
        </Etat>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          component={Link}
          href={href}
          size="small"
          endIcon={<IconArrowRight size={15} />}
          sx={{ textTransform: "none", whiteSpace: "nowrap" }}
        >
          Ouvrir
        </Button>
      </Stack>
    </Paper>
  );
}

export default function InstallationTalk() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [selection, setSelection] = useState<number | "">("");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const [produitId, setProduitId] = useState<number | null>(null);
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  const [nouveauCode, setNouveauCode] = useState("");
  const [nouveauNumero, setNouveauNumero] = useState("");

  const recharger = useCallback(async (garder?: number) => {
    try {
      const r = await fetch("/api/talk-installation");
      if (!r.ok) throw new Error("Chargement impossible.");
      const d = await r.json();
      const liste: Centre[] = Array.isArray(d.centres) ? d.centres : [];
      setCentres(liste);
      setSelection((prec) => {
        const cible = garder ?? (typeof prec === "number" ? prec : liste[0]?.userProductId);
        return liste.some((c) => c.userProductId === cible) ? (cible as number) : "";
      });
    } catch {
      setErreur("Impossible de charger l'état des installations.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void recharger();
    void (async () => {
      try {
        const r = await fetch("/api/products");
        if (!r.ok) return;
        const liste = await r.json();
        const talk = (Array.isArray(liste) ? liste : []).find(
          (p: { name?: string }) => (p.name ?? "").toLowerCase() === PRODUITS.talk.nom.toLowerCase()
        );
        if (talk?.id) setProduitId(Number(talk.id));
      } catch {
        // Sans identifiant produit, seule la création est indisponible.
      }
    })();
  }, [recharger]);

  const centre = useMemo(
    () => centres.find((c) => c.userProductId === selection) ?? null,
    [centres, selection]
  );

  useEffect(() => {
    setNouveauCode("");
    setNouveauNumero("");
  }, [centre]);

  async function appeler(url: string, methode: string, corps: unknown, succes: string) {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch(url, {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setMessage(succes);
      return data ?? {};
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
      return null;
    } finally {
      setOccupe(false);
    }
  }

  async function creerCompte() {
    if (produitId === null) return;
    const data = await appeler(
      "/api/admin/create-client",
      "POST",
      {
        email: identifiant.trim(),
        password: motDePasse,
        name: nom.trim(),
        products: [{ productId: produitId, assignedAt: new Date().toISOString() }],
        isSecretary: false,
        centreRole: "ADMIN_USER",
      },
      "Compte créé. Ajoutez maintenant son code centre."
    );
    if (data) {
      setCreation(false);
      setNom("");
      setIdentifiant("");
      setMotDePasse("");
      await recharger();
    }
  }

  async function ajouterCode() {
    if (!centre) return;
    const ok = await appeler(
      "/api/external-center-mapping",
      "POST",
      { userProductId: centre.userProductId, externalCenterCode: nouveauCode.trim() },
      "Code centre ajouté."
    );
    if (ok) {
      setNouveauCode("");
      await recharger(centre.userProductId);
    }
  }

  async function ajouterNumero() {
    if (!centre) return;
    const ok = await appeler(
      `/api/admin/number/${centre.userId}`,
      "POST",
      { number: nouveauNumero.trim() },
      "Numéro ajouté."
    );
    if (ok) {
      setNouveauNumero("");
      await recharger(centre.userProductId);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Installation Talk" description="Installer un centre">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Installation Talk" description="Installer un centre">
      <Box>
        <SectionHeader
          title="Installation d'un centre"
          subtitle="Ce qu'il faut faire une fois pour que le robot réponde"
        />

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur(null)}>
            {erreur}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 3 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
            <Select
              size="small"
              displayEmpty
              fullWidth
              value={selection}
              onChange={(e) => setSelection(e.target.value === "" ? "" : Number(e.target.value))}
              sx={{ fontSize: 13, maxWidth: 480 }}
            >
              <MenuItem value="">
                <span style={{ color: INK_MUTED }}>Choisissez un centre</span>
              </MenuItem>
              {centres.map((c) => (
                <MenuItem key={c.userProductId} value={c.userProductId}>
                  {c.clientNom ?? `Centre ${c.userProductId}`}
                </MenuItem>
              ))}
            </Select>
            {/* Le statut change la portée de tout ce qui suit : un manque sur un
                centre en intégration est normal, sur un centre en production il
                est signalé au client. Se règle dans « Parc clients ». */}
            {centre && (
              <Chip
                label={STATUTS[centre.statut].libelle}
                size="small"
                component={Link}
                href="/admin/parc"
                clickable
                sx={{
                  bgcolor: STATUTS[centre.statut].couleur.fond,
                  color: STATUTS[centre.statut].couleur.texte,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              />
            )}
            <Button
              startIcon={<IconPlus size={16} />}
              onClick={() => setCreation((v) => !v)}
              sx={{ textTransform: "none", whiteSpace: "nowrap" }}
            >
              {creation ? "Annuler" : "Nouveau centre"}
            </Button>
          </Stack>

          {creation && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
                Le compte est créé avec le produit LyraeTalk déjà affilié.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  size="small"
                  fullWidth
                  label="Nom du centre"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Identifiant de connexion"
                  value={identifiant}
                  onChange={(e) => setIdentifiant(e.target.value)}
                />
                <TextField
                  size="small"
                  fullWidth
                  type="password"
                  label="Mot de passe"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
              </Stack>
              <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  disableElevation
                  disabled={
                    occupe ||
                    produitId === null ||
                    !nom.trim() ||
                    identifiant.trim().length < 3 ||
                    !motDePasse
                  }
                  onClick={() => void creerCompte()}
                  sx={{ textTransform: "none", bgcolor: "var(--accent)" }}
                >
                  Créer le centre
                </Button>
              </Box>
            </Box>
          )}
        </Paper>

        {centre && (
          <>
            <Bloc
              numero={1}
              titre="Codes centres"
              fait={!chercher(centre, "talk.codes-centres")}
              manque={chercher(centre, "talk.codes-centres")?.manque ?? ""}
            >
              <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
                Le code de chaque centre dans le logiciel de gestion. Un compte peut en
                exploiter plusieurs. <strong>Relisez-les</strong> : une faute de frappe ne
                déclenche aucune erreur, les rendez-vous n&apos;arrivent simplement jamais.
              </Typography>
              {centre.codesCentres.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  {centre.codesCentres.map((c) => (
                    <Chip
                      key={c}
                      label={c}
                      size="small"
                      sx={{ fontFamily: "monospace", fontSize: 12.5 }}
                    />
                  ))}
                </Stack>
              )}
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <TextField
                  size="small"
                  label="Ajouter un code centre"
                  value={nouveauCode}
                  onChange={(e) => setNouveauCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nouveauCode.trim()) void ajouterCode();
                  }}
                  sx={{ minWidth: 280 }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  disabled={
                    occupe ||
                    !nouveauCode.trim() ||
                    centre.codesCentres.includes(nouveauCode.trim())
                  }
                  onClick={() => void ajouterCode()}
                  sx={{ textTransform: "none", bgcolor: "var(--accent)", mt: 0.25 }}
                >
                  Ajouter
                </Button>
              </Stack>
            </Bloc>

            <Bloc
              numero={2}
              titre="Numéro d'appel"
              fait={!chercher(centre, "talk.numero-entrant")}
              manque={chercher(centre, "talk.numero-entrant")?.manque ?? ""}
            >
              <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
                Le numéro que les patients composent. C&apos;est lui qui identifie le centre
                à l&apos;arrivée d&apos;un appel.
              </Typography>
              {centre.numeros.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  {centre.numeros.map((n) => (
                    <Chip
                      key={n}
                      label={n}
                      size="small"
                      sx={{ fontFamily: "monospace", fontSize: 12.5 }}
                    />
                  ))}
                </Stack>
              )}
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <TextField
                  size="small"
                  label="Ajouter un numéro"
                  placeholder="+33…"
                  value={nouveauNumero}
                  onChange={(e) => setNouveauNumero(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nouveauNumero.trim()) void ajouterNumero();
                  }}
                  sx={{ minWidth: 280 }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  disabled={
                    occupe || !nouveauNumero.trim() || centre.numeros.includes(nouveauNumero.trim())
                  }
                  onClick={() => void ajouterNumero()}
                  sx={{ textTransform: "none", bgcolor: "var(--accent)", mt: 0.25 }}
                >
                  Ajouter
                </Button>
              </Stack>
            </Bloc>

            <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mt: 3, mb: 1.5 }}>
              Ce qui suit appartient au client et se règle dans son espace. Affiché ici
              pour savoir où il en est.
            </Typography>

            <BlocRenvoi
              numero={3}
              titre="Réglages du robot"
              fait={centre.aDesReglages}
              manque="Le robot tourne sur les valeurs par défaut."
              detail={centre.botName ?? undefined}
              href={cheminCentre(centre.userId, "talk", "parametrage")}
            />

            <BlocRenvoi
              numero={4}
              titre="Mapping d'examens"
              fait={!chercher(centre, "talk.codes-examens")}
              manque={chercher(centre, "talk.codes-examens")?.manque ?? ""}
              detail={`${centre.examensAttribues} examens attribués`}
              href={cheminCentre(centre.userId, "talk", "parametrage/mapping_exam")}
            />

            <BlocRenvoi
              numero={5}
              titre="Questions par examen"
              fait={!chercher(centre, "talk.questions-examens")}
              manque={chercher(centre, "talk.questions-examens")?.manque ?? ""}
              href={cheminCentre(centre.userId, "talk", "parametrage/questions_exam")}
            />

            <BlocRenvoi
              numero={6}
              titre="FAQ patient"
              fait={!chercher(centre, "talk.faq")}
              manque={chercher(centre, "talk.faq")?.manque ?? ""}
              detail={`${centre.faq} question${centre.faq > 1 ? "s" : ""}`}
              href={cheminCentre(centre.userId, "talk", "informationnel")}
            />

            {/* Les exigences du registre qui n'ont pas de bloc à elles : fiche du
                centre, redirections, codes courts des examens. Sans ce
                récapitulatif, sept des treize informations attendues seraient
                invisibles depuis cette page, alors qu'elle sert justement à voir
                d'un coup d'œil où en est un centre. */}
            {(() => {
              const autres = (centre.manques ?? []).filter(
                (m) => !CLES_AVEC_BLOC.includes(m.cle)
              );
              if (autres.length === 0) return null;
              return (
                <Paper
                  variant="outlined"
                  sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}
                >
                  <Typography
                    sx={{ fontSize: 13.5, fontWeight: 600, color: INK, mb: 1 }}
                  >
                    Autres informations à compléter
                  </Typography>
                  <Stack spacing={1}>
                    {autres.map((m) => (
                      <Etat key={m.cle} fait={false}>
                        <Typography sx={{ fontSize: 13, color: INK }}>
                          {m.libelle}
                          <Typography
                            component="span"
                            sx={{
                              fontSize: 11.5,
                              color: INK_MUTED,
                              ml: 1,
                            }}
                          >
                            {m.proprietaire === "client" ? "client" : "interne"}
                            {m.criticite === "bloquant" ? " · essentiel" : ""}
                          </Typography>
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: MANQUE }}>
                          {m.manque}
                        </Typography>
                      </Etat>
                    ))}
                  </Stack>
                </Paper>
              );
            })()}

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              <Chip
                size="small"
                label={centre.aSmsConfirmation ? "SMS de confirmation réglés" : "SMS de confirmation non réglés"}
                sx={{
                  height: 24,
                  fontSize: 11.5,
                  bgcolor: centre.aSmsConfirmation ? "#E8F5EE" : SURFACE_MUTED,
                  color: centre.aSmsConfirmation ? OK : INK_MUTED,
                }}
              />
              <Chip
                size="small"
                label={centre.aDepotOrdonnances ? "Dépôt d'ordonnances actif" : "Dépôt d'ordonnances inactif"}
                sx={{
                  height: 24,
                  fontSize: 11.5,
                  bgcolor: centre.aDepotOrdonnances ? "#E8F5EE" : SURFACE_MUTED,
                  color: centre.aDepotOrdonnances ? OK : INK_MUTED,
                }}
              />
            </Stack>
          </>
        )}

        {!centre && !creation && centres.length === 0 && (
          <Alert severity="info">
            Aucun centre n&apos;a le produit LyraeTalk. Créez-en un ci-dessus, ou affiliez
            le produit à un client existant depuis la gestion des clients.
          </Alert>
        )}

        <Snackbar
          open={Boolean(message)}
          autoHideDuration={4000}
          onClose={() => setMessage(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setMessage(null)}>
            {message}
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
