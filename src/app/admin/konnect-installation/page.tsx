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
import { IconCheck, IconAlertTriangle, IconArrowRight, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import { cheminCentre } from "@/lib/cheminsCentre";
import SectionHeader from "@/components/admin/SectionHeader";
import { PRODUITS } from "@/lib/produits";

/**
 * Installer un centre LyraeKonnect, de bout en bout (lots G6 et I1).
 *
 * CE QUE CETTE PAGE PORTE, ET CE QU'ELLE NE PORTE PAS. Elle installe : ce qui se
 * fait une fois, par l'équipe, pour qu'un centre existe et fonctionne. Le compte,
 * le rattachement du portail, le rattachement au logiciel du centre.
 *
 * Elle ne paramètre pas. Les réglages du portail, les examens, les sites changent
 * au fil de l'eau et appartiennent au client : ils sont affichés ici avec leur
 * état, et un renvoi vers l'écran qui les règle. Dupliquer ces formulaires ferait
 * deux endroits à maintenir pour la même chose.
 *
 * La ligne de partage : fait une fois à l'installation, contre modifié au fil de
 * l'eau.
 *
 * AUCUNE ÉCRITURE DIRECTE. Chaque bloc appelle la route qui fait autorité, la même
 * que les écrans existants. On vient de fermer une double vérité côté Konnect, on
 * n'en ouvre pas une ici : deux vues du même endroit, pas deux endroits.
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
  risBaseUrl: string | null;
  risCodeSite: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Un bloc d'installation : son état, et de quoi le régler sur place. */
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
          {!fait && (
            <Typography sx={{ fontSize: 12, color: MANQUE }}>{manque}</Typography>
          )}
        </Etat>
      </Stack>
      {children}
    </Paper>
  );
}

/** Bloc en lecture seule : il appartient au client, on ne fait que le montrer. */
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

export default function InstallationKonnect() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [selection, setSelection] = useState<number | "">("");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  // Création d'un compte. `Product.name` n'est connu que de `produits.ts` : on
  // résout son identifiant au chargement plutôt que de l'écrire en dur, sinon un
  // renommage en base casserait la création sans la moindre erreur.
  const [produitId, setProduitId] = useState<number | null>(null);
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  // Saisies des blocs actionnables.
  const [tenantId, setTenantId] = useState("");
  const [risBaseUrl, setRisBaseUrl] = useState("");
  const [risCodeSite, setRisCodeSite] = useState("");

  const recharger = useCallback(async (garder?: number) => {
    try {
      const r = await fetch("/api/konnect-installation");
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
        const konnect = (Array.isArray(liste) ? liste : []).find(
          (p: { name?: string }) =>
            (p.name ?? "").toLowerCase() === PRODUITS.konnect.nom.toLowerCase()
        );
        if (konnect?.id) setProduitId(Number(konnect.id));
      } catch {
        // Sans identifiant produit, la création est simplement désactivée : le
        // reste de la page fonctionne.
      }
    })();
  }, [recharger]);

  const centre = useMemo(
    () => centres.find((c) => c.userProductId === selection) ?? null,
    [centres, selection]
  );

  // Les champs suivent le centre choisi : on n'édite jamais à l'aveugle une valeur
  // qui appartient à un autre.
  useEffect(() => {
    setTenantId(centre?.tenantId ?? "");
    setRisBaseUrl(centre?.risBaseUrl ?? "");
    setRisCodeSite(centre?.risCodeSite ?? "");
  }, [centre]);

  async function appeler(url: string, methode: string, corps: unknown, succes: string) {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch(url, {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setMessage(succes);
      return data;
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
      "Compte créé. Rattachez maintenant le portail."
    );
    if (data) {
      setCreation(false);
      setNom("");
      setIdentifiant("");
      setMotDePasse("");
      await recharger();
    }
  }

  async function rattacher() {
    if (!centre) return;
    const ok = await appeler(
      "/api/konnect-tenant-mapping",
      "POST",
      { userProductId: centre.userProductId, tenantId: tenantId.trim().toLowerCase() },
      "Portail rattaché."
    );
    if (ok) await recharger(centre.userProductId);
  }

  async function enregistrerRis() {
    if (!centre) return;
    const ok = await appeler(
      `/api/product-config?userProductId=${centre.userProductId}&domaine=konnect.ris-identite`,
      "PUT",
      {
        valeur: {
          base_url: risBaseUrl.trim().replace(/\/+$/, ""),
          code_site: risCodeSite.trim(),
        },
      },
      "Rattachement au logiciel du centre enregistré."
    );
    if (ok) await recharger(centre.userProductId);
  }

  if (chargement) {
    return (
      <PageContainer title="Installation Konnect" description="Installer un centre">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  const tenantValide = UUID_RE.test(tenantId.trim());
  const risComplet = Boolean(risBaseUrl.trim()) && Boolean(risCodeSite.trim());

  return (
    <PageContainer title="Installation Konnect" description="Installer un centre">
      <Box>
        <SectionHeader
          title="Installation d'un centre"
          subtitle="Ce qu'il faut faire une fois pour qu'un portail fonctionne"
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
                Le compte est créé avec le produit LyraeKonnect déjà affilié. Le mot de
                passe suit la politique du Dashboard, et le client pourra le changer.
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
              titre="Rattachement du portail"
              fait={Boolean(centre.tenantId)}
              manque="Le portail ne sait pas à quel centre il parle. Rien d'autre ne s'appliquera."
            >
              <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
                L&apos;identifiant technique du portail, communiqué à son installation. Il
                relie ce compte au portail patient : sans lui, aucun réglage de cette page
                n&apos;atteint le centre.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
                <TextField
                  size="small"
                  fullWidth
                  label="Identifiant du portail"
                  placeholder="11111111-1111-1111-1111-111111111111"
                  value={tenantId}
                  error={tenantId.trim() !== "" && !tenantValide}
                  helperText={
                    tenantId.trim() !== "" && !tenantValide ? "Format attendu : un UUID." : " "
                  }
                  onChange={(e) => setTenantId(e.target.value)}
                  sx={{ maxWidth: 420 }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  disabled={occupe || !tenantValide || tenantId.trim() === centre.tenantId}
                  onClick={() => void rattacher()}
                  sx={{ textTransform: "none", bgcolor: "var(--accent)", mt: 0.25 }}
                >
                  Rattacher
                </Button>
              </Stack>
            </Bloc>

            <Bloc
              numero={2}
              titre="Logiciel de gestion du centre"
              fait={Boolean(centre.risBaseUrl && centre.risCodeSite)}
              manque="Sans lui, aucun créneau ne peut être cherché ni réservé."
            >
              <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: 1.5 }}>
                L&apos;adresse de l&apos;instance et le code du site, communiqués par
                l&apos;éditeur du logiciel. Les identifiants de connexion, eux, se
                saisissent dans l&apos;espace technique du portail : ils ne sont pas
                stockés ici.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
                <TextField
                  size="small"
                  fullWidth
                  label="Adresse de l'instance"
                  placeholder="https://…/api"
                  value={risBaseUrl}
                  onChange={(e) => setRisBaseUrl(e.target.value)}
                />
                <TextField
                  size="small"
                  label="Code du site"
                  placeholder="N01"
                  value={risCodeSite}
                  onChange={(e) => setRisCodeSite(e.target.value)}
                  sx={{ minWidth: 160 }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  disabled={
                    occupe ||
                    !risComplet ||
                    (risBaseUrl.trim().replace(/\/+$/, "") === (centre.risBaseUrl ?? "") &&
                      risCodeSite.trim() === (centre.risCodeSite ?? ""))
                  }
                  onClick={() => void enregistrerRis()}
                  sx={{ textTransform: "none", bgcolor: "var(--accent)", mt: 0.25 }}
                >
                  Enregistrer
                </Button>
              </Stack>
              <Alert severity="info" sx={{ mt: 2 }}>
                La connexion reste éteinte tant qu&apos;elle n&apos;a pas été activée dans
                l&apos;espace technique du portail. C&apos;est voulu : un rattachement saisi
                ici ne déclenche jamais d&apos;appel vers le logiciel d&apos;un centre.
              </Alert>
            </Bloc>

            <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mt: 3, mb: 1.5 }}>
              Ce qui suit appartient au client et se règle dans son espace. Affiché ici
              pour savoir où il en est.
            </Typography>

            <BlocRenvoi
              numero={3}
              titre="Paramètres du portail"
              fait={centre.aDesParametres && Boolean(centre.telephoneSecretariat?.trim())}
              manque={
                centre.aDesParametres
                  ? "Pas de numéro de secrétariat : un patient bloqué n'a personne à appeler."
                  : "Le portail tourne sur les valeurs par défaut."
              }
              detail={centre.telephoneSecretariat ?? undefined}
              href={cheminCentre(centre.userId, "konnect", "parametrage")}
            />

            <BlocRenvoi
              numero={4}
              titre="Codes d'examens"
              fait={centre.examensAttribues > 0}
              manque="Aucun examen n'a de code : le patient ne pourra rien réserver."
              detail={`${centre.examensAttribues} examens sur ${centre.examensTotal}`}
              href={cheminCentre(centre.userId, "konnect", "examens")}
            />

            <BlocRenvoi
              numero={5}
              titre="Sites"
              fait={centre.sites > 0}
              manque="Le patient ne saura pas où se présenter."
              detail={`${centre.sites} site${centre.sites > 1 ? "s" : ""}`}
              href={cheminCentre(centre.userId, "konnect", "sites")}
            />
          </>
        )}

        {!centre && !creation && centres.length === 0 && (
          <Alert severity="info">
            Aucun centre n&apos;a le produit LyraeKonnect. Créez-en un ci-dessus, ou
            affiliez le produit à un client existant depuis la gestion des clients.
          </Alert>
        )}

        <Box sx={{ mt: 4, p: 2, bgcolor: SURFACE_MUTED, borderRadius: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ color: INK, mb: 0.5 }}>
            Ce qui ne se règle pas ici
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED }}>
            Les identifiants de connexion au logiciel du centre, sa messagerie et
            l&apos;activation de la connexion se font dans l&apos;espace technique du
            portail. Ces réglages portent des mots de passe, qui n&apos;ont pas leur place
            ici.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <Chip label="Identifiants RIS" size="small" sx={{ height: 22, fontSize: 11.5 }} />
            <Chip label="Activation de la connexion" size="small" sx={{ height: 22, fontSize: 11.5 }} />
            <Chip label="Messagerie" size="small" sx={{ height: 22, fontSize: 11.5 }} />
          </Stack>
        </Box>

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
