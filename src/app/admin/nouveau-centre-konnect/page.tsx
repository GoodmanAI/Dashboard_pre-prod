"use client";

import Retour from "@/components/shared/Retour";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import Link from "next/link";
import {
  identifiantDepuisNom,
  lireFicheKonnect,
  reglagesPortail,
  sitesPortail,
  type FicheKonnect,
} from "@/lib/ficheOuvertureKonnect";
import { EXPEDITEUR_SMS_RE } from "@/lib/konnectConfig";
import { cheminCentre } from "@/lib/cheminsCentre";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import { PRODUITS } from "@/lib/produits";
import type { Manque } from "@/lib/completude/types";
import { INK, INK_MUTED, BORDER, BRAND } from "@/lib/jetons";

/**
 * Nouveau portail Konnect : l'assistant de mise en service d'un client LyraeKonnect
 * (30/10/2026, plan `2026-10-onboarding-konnect-fiche-et-assistant.md`).
 *
 * Le pendant de `/admin/nouveau-centre` (Talk), en plus court : il part de la fiche
 * d'ouverture Konnect, la version simple de celle de Talk, et préremplit le compte, les
 * réglages du portail, les sites et le code du site Xplore.
 *
 * Mêmes règles que l'assistant de Talk : **il n'écrit rien lui-même** (chaque page appelle
 * la route qui fait autorité, avec sa garde) et **chaque page enregistre seule** (le compte
 * existe dès la deuxième ; s'arrêter en route laisse un centre incomplet que l'écran
 * « Installation Konnect » reprend).
 *
 * Ce qu'il ne fait pas : l'accord de lecture des ordonnances par le prestataire, la façon
 * de lire et les salles ouvertes au portail (engagements, réglés sur « Installation
 * Konnect »), les identifiants Xplore et la messagerie (console technique du portail), et
 * la correspondance des examens (le client la vérifie avec le tutoriel).
 */

const BOUTON_ACTION = {
  textTransform: "none" as const,
  bgcolor: BRAND,
  "&:hover": { bgcolor: "var(--accent-press)" },
};

const ETAPES = [
  "La fiche",
  "Identité",
  "Le portail",
  "Sites et logiciel",
  "Récapitulatif",
];
const DERNIERE_PAGE_A_REMPLIR = ETAPES.length - 1;

type Portail = {
  telephoneSecretariat: string;
  envoiEmail: boolean;
  envoiSms: boolean;
  expediteurSms: string;
  expediteurNomMail: string;
  depassementHonoraires: boolean;
  consignesGenerales: string;
};

const PORTAIL_VIDE: Portail = {
  telephoneSecretariat: "",
  envoiEmail: true,
  envoiSms: true,
  expediteurSms: "",
  expediteurNomMail: "",
  depassementHonoraires: false,
  consignesGenerales: "",
};

type SitePortail = {
  site_id: string;
  libelle: string;
  code_postal: string;
  adresse: string;
};

const SITE_VIDE: SitePortail = {
  site_id: "",
  libelle: "",
  code_postal: "",
  adresse: "",
};

/** Un mot de passe lisible à dicter, et conforme à la politique du dépôt. */
function genererMotDePasse(): string {
  const maj = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const min = "abcdefghijkmnopqrstuvwxyz";
  const chiffres = "23456789";
  const speciaux = "!@#$%*";
  const tout = maj + min + chiffres + speciaux;
  const tirer = (s: string) => s[Math.floor(Math.random() * s.length)];
  const base = [tirer(maj), tirer(min), tirer(chiffres), tirer(speciaux)];
  for (let i = 0; i < 10; i++) base.push(tirer(tout));
  return base.sort(() => Math.random() - 0.5).join("");
}

export default function NouveauPortailKonnectPage() {
  const { data: session, status } = useSession();
  const estSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const [etape, setEtape] = useState(0);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Page 0
  const [fiche, setFiche] = useState<FicheKonnect | null>(null);
  const [nomFichier, setNomFichier] = useState("");

  // Page 1
  const [nom, setNom] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState(genererMotDePasse);
  const [productId, setProductId] = useState<number | null>(null);
  const [catalogueLu, setCatalogueLu] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [userProductId, setUserProductId] = useState<number | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Pages 2 et 3
  const [portail, setPortail] = useState<Portail>(PORTAIL_VIDE);
  const [sites, setSites] = useState<SitePortail[]>([{ ...SITE_VIDE }]);
  const [risBaseUrl, setRisBaseUrl] = useState("");
  const [risCodeSite, setRisCodeSite] = useState("");

  // Récapitulatif
  const [manques, setManques] = useState<Manque[] | null>(null);
  const [manquesLus, setManquesLus] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/products");
        if (!r.ok) return;
        const liste = await r.json();
        const p = (Array.isArray(liste) ? liste : []).find(
          (x: { name?: string }) =>
            (x.name ?? "").toLowerCase() === PRODUITS.konnect.nom.toLowerCase(),
        );
        if (p?.id) setProductId(Number(p.id));
      } catch {
        /* la page Identité le dira */
      } finally {
        setCatalogueLu(true);
      }
    })();
  }, []);

  const appeler = useCallback(
    async (url: string, methode: string, corps: unknown, succes: string) => {
      setOccupe(true);
      setErreur(null);
      try {
        const r = await fetch(url, {
          method: methode,
          headers: { "Content-Type": "application/json" },
          body: corps === undefined ? undefined : JSON.stringify(corps),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErreur(d?.error ?? "L'enregistrement a échoué.");
          return null;
        }
        setMessage(succes);
        return d ?? {};
      } catch {
        setErreur("Impossible de joindre le serveur.");
        return null;
      } finally {
        setOccupe(false);
      }
    },
    [],
  );

  /** Page 0 : préremplit les pages suivantes. Rien n'est écrit ici. */
  const lireLeFichier = async (fichier: File) => {
    setErreur(null);
    try {
      const f = lireFicheKonnect(await fichier.text());
      setFiche(f);
      setNomFichier(fichier.name);
      setNom(f.centre.nom);
      if (identifiant.trim() === "")
        setIdentifiant(identifiantDepuisNom(f.centre.nom));
      const r = reglagesPortail(f);
      setPortail({
        ...PORTAIL_VIDE,
        telephoneSecretariat: (r.telephoneSecretariat as string) ?? "",
        envoiEmail: (r.envoiEmail as boolean) ?? true,
        envoiSms: (r.envoiSms as boolean) ?? true,
        // Repris tel quel, même invalide : l'admin le voit et le corrige à la page 2.
        expediteurSms: f.portail.expediteurSms,
        expediteurNomMail: (r.expediteurNomMail as string) ?? "",
        depassementHonoraires: (r.depassementHonoraires as boolean) ?? false,
        consignesGenerales: f.portail.consignes,
      });
      const s = sitesPortail(f).map((x) => ({
        site_id: x.site_id,
        libelle: x.libelle ?? "",
        code_postal: x.code_postal,
        adresse: x.adresse ?? "",
      }));
      setSites(s.length > 0 ? s : [{ ...SITE_VIDE }]);
      setRisCodeSite(s[0]?.site_id ?? "");
    } catch (e: any) {
      setFiche(null);
      setErreur(e?.message ?? "Le fichier n'a pas pu être lu.");
    }
  };

  /** Page 1 : le compte, avec le seul produit LyraeKonnect. */
  const creerLeCompte = async () => {
    if (productId === null) {
      setErreur("Le produit LyraeKonnect est introuvable dans le catalogue.");
      return;
    }
    const d = await appeler(
      "/api/admin/create-client",
      "POST",
      {
        name: nom.trim(),
        email: identifiant.trim().toLowerCase(),
        password: motDePasse,
        products: [{ productId, assignedAt: new Date().toISOString() }],
      },
      "Compte créé.",
    );
    if (!d?.user?.id) return;
    // `create-client` ne rend pas les `userProductId` : on relit les affiliations. Le
    // `tenantId` du portail est attribué par le Dashboard à l'affiliation.
    const r = await fetch(`/api/admin/clients/${d.user.id}/products`);
    const liste = await r.json().catch(() => ({ rows: [] }));
    const k = (liste.rows ?? []).find(
      (x: any) => x.slug === "konnect" && x.affilie && x.userProductId,
    );
    setUserId(d.user.id);
    setUserProductId(k?.userProductId ?? null);
    setTenantId(k?.tenantId ?? null);
    if (!portail.expediteurNomMail)
      setPortail((p) => ({ ...p, expediteurNomMail: nom.trim().slice(0, 60) }));
    setEtape(2);
  };

  const smsValide =
    portail.expediteurSms.trim() === "" ||
    EXPEDITEUR_SMS_RE.test(portail.expediteurSms.trim());

  /**
   * Page 2 : les réglages du portail. Le `PUT` fusionne sur l'existant : on n'envoie que
   * les champs de cette page.
   */
  const enregistrerLePortail = async () => {
    if (userProductId === null) return;
    const ok = await appeler(
      `/api/konnect-configuration?userProductId=${userProductId}`,
      "PUT",
      {
        telephoneSecretariat: portail.telephoneSecretariat.trim() || null,
        envoiEmail: portail.envoiEmail,
        envoiSms: portail.envoiSms,
        expediteurSms: portail.expediteurSms.trim() || null,
        expediteurNomMail: portail.expediteurNomMail.trim() || null,
        depassementHonoraires: portail.depassementHonoraires,
        consignesGenerales: portail.consignesGenerales.trim() || null,
      },
      "Réglages du portail enregistrés.",
    );
    if (ok) setEtape(3);
  };

  const sitesRemplis = sites.filter((s) => s.site_id.trim() !== "");

  /** Page 3 : les sites (le `PUT` remplace l'ensemble) et le rattachement à Xplore. */
  const enregistrerSitesEtLogiciel = async () => {
    if (userProductId === null) return;
    if (sitesRemplis.length > 0) {
      const ok = await appeler(
        `/api/konnect-sites?userProductId=${userProductId}`,
        "PUT",
        {
          sites: sitesRemplis.map((s) => ({
            site_id: s.site_id.trim().toUpperCase(),
            libelle: s.libelle,
            code_postal: s.code_postal,
            adresse: s.adresse,
          })),
        },
        "Sites enregistrés.",
      );
      if (!ok) return;
    }
    if (risBaseUrl.trim() && risCodeSite.trim()) {
      const ok = await appeler(
        `/api/product-config?userProductId=${userProductId}&domaine=konnect.ris-identite`,
        "PUT",
        {
          valeur: {
            base_url: risBaseUrl.trim().replace(/\/+$/, ""),
            code_site: risCodeSite.trim().toUpperCase(),
          },
        },
        "Logiciel du centre rattaché.",
      );
      if (!ok) return;
    }
    setEtape(4);
  };

  const chargerManques = useCallback(async () => {
    if (userProductId === null) return;
    setManquesLus(false);
    try {
      const r = await fetch(`/api/completude?userProductId=${userProductId}`);
      // Une lecture ratée n'est PAS « rien ne manque » : on le dit.
      if (!r.ok) {
        setManques(null);
        return;
      }
      const d = await r.json();
      setManques(Array.isArray(d?.manques) ? d.manques : null);
    } catch {
      setManques(null);
    } finally {
      setManquesLus(true);
    }
  }, [userProductId]);

  useEffect(() => {
    if (etape === 4) void chargerManques();
  }, [etape, chargerManques]);

  const passerEnProduction = async () => {
    if (userProductId === null) return;
    await appeler(
      "/api/centre-statut",
      "PUT",
      { userProductId, statut: "production" },
      "LyraeKonnect passé en production.",
    );
    await chargerManques();
  };

  const bloquants = useMemo(
    () => (manques ?? []).filter((m) => m.criticite === "bloquant"),
    [manques],
  );

  if (status === "loading") {
    return (
      <PageContainer
        title="Nouveau portail Konnect"
        description="Mise en service"
      >
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Nouveau portail Konnect"
      description="Mettre un client LyraeKonnect en service"
    >
      <Box>
        <SectionHeader
          title="Nouveau portail Konnect"
          subtitle="On part de la fiche d'ouverture Konnect du client. Chaque page s'enregistre seule."
        />

        {!estSuperAdmin && (
          <Alert severity="warning" sx={{ mb: 2, maxWidth: 880 }}>
            Créer un compte client demande un accès super administrateur. Vous
            pouvez suivre les étapes, mais la création échouera.
          </Alert>
        )}

        <Box sx={{ maxWidth: 880, mb: 2.5 }}>
          <Stepper activeStep={etape} alternativeLabel sx={{ mb: 1.5 }}>
            {ETAPES.map((e) => (
              <Step key={e}>
                <StepLabel>
                  <Typography sx={{ fontSize: 12 }}>{e}</Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (etape / DERNIERE_PAGE_A_REMPLIR) * 100)}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: "#EDF1F4",
              "& .MuiLinearProgress-bar": { bgcolor: BRAND, borderRadius: 3 },
            }}
          />
          <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 0.75 }}>
            {etape < DERNIERE_PAGE_A_REMPLIR
              ? `Page ${etape + 1} sur ${DERNIERE_PAGE_A_REMPLIR}`
              : "Les questions sont finies."}
          </Typography>
        </Box>

        {erreur && (
          <Alert
            severity="error"
            sx={{ mb: 2, maxWidth: 880 }}
            onClose={() => setErreur(null)}
          >
            {erreur}
          </Alert>
        )}

        <Card sx={{ p: 3, border: `1px solid ${BORDER}`, maxWidth: 880 }}>
          {/* ───────────────────────────── 0. La fiche ───────────────────────────── */}
          {etape === 0 && (
            <Stack spacing={2.5} sx={{ maxWidth: 680 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                  La fiche d&apos;ouverture Konnect du client
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                  Déposez la fiche que le client vous a renvoyée remplie. Elle
                  préremplit le compte, les réglages du portail et les sites.
                  Vous vérifiez à chaque page, rien n&apos;est écrit avant.
                </Typography>
              </Box>

              <Box>
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<IconUpload size={16} />}
                  sx={{ textTransform: "none" }}
                >
                  {fiche
                    ? "Déposer une autre fiche"
                    : "Déposer la fiche remplie"}
                  <input
                    hidden
                    type="file"
                    accept=".html,.htm,text/html"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void lireLeFichier(f);
                      e.target.value = "";
                    }}
                  />
                </Button>
              </Box>

              {fiche && (
                <Box
                  sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, p: 2 }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", mb: 1 }}
                  >
                    <IconCheck size={18} color="#186A3B" />
                    <Typography
                      sx={{ fontSize: 14, fontWeight: 700, color: INK }}
                    >
                      {fiche.centre.nom || "Fiche sans nom de centre"}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                    {nomFichier}
                    {fiche.rempliPar && ` · remplie par ${fiche.rempliPar}`}
                    {fiche.rempliLe && ` le ${fiche.rempliLe}`}
                  </Typography>
                  {fiche.xplore.version === "Plus ancienne que 8.2" && (
                    <Alert severity="warning" sx={{ mt: 1.5, fontSize: 13 }}>
                      Xplore est plus ancien que la version 8.2 : le portail ne
                      pourra pas réserver avant la mise à jour.
                    </Alert>
                  )}
                  <Typography
                    sx={{ fontSize: 13, color: INK, mt: 1.5, fontWeight: 600 }}
                  >
                    Prérempli
                  </Typography>
                  <Box
                    component="ul"
                    sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 13, color: INK }}
                  >
                    <li>Nom du compte : {nom || "à saisir"}</li>
                    <li>
                      Téléphone du secrétariat :{" "}
                      {portail.telephoneSecretariat || "à saisir"}
                    </li>
                    <li>
                      Sites :{" "}
                      {sitesRemplis.map((s) => s.site_id).join(", ") ||
                        "aucun code site"}
                    </li>
                    <li>
                      Examens réservables en ligne :{" "}
                      {fiche.portail.examens.join(", ") || "non précisés"}
                    </li>
                  </Box>
                </Box>
              )}

              <Stack
                direction="row"
                spacing={1.5}
                sx={{ justifyContent: "flex-end" }}
              >
                {!fiche && (
                  <Button
                    sx={{ textTransform: "none" }}
                    onClick={() => setEtape(1)}
                  >
                    Continuer sans fiche
                  </Button>
                )}
                <Button
                  variant="contained"
                  disabled={!fiche}
                  endIcon={<IconArrowRight size={16} />}
                  sx={BOUTON_ACTION}
                  onClick={() => setEtape(1)}
                >
                  Continuer
                </Button>
              </Stack>
              <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                Un client LyraeTalk ?{" "}
                <Link href="/admin/nouveau-centre">
                  Assistant « Nouveau centre »
                </Link>
                .
              </Typography>
            </Stack>
          )}

          {/* ───────────────────────────── 1. Identité ───────────────────────────── */}
          {etape === 1 && (
            <Stack spacing={2.5} sx={{ maxWidth: 560 }}>
              <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                Le compte existe dès cette page, avec le produit LyraeKonnect.
                L&apos;identifiant du portail lui est attribué tout seul.
              </Typography>
              <TextField
                label="Nom du centre"
                size="small"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                helperText="Affiché en haut du portail et dans l'espace du client."
              />
              <TextField
                label="Identifiant de connexion"
                size="small"
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
                helperText="Unique. C'est ce que le client saisira pour se connecter."
              />
              <Box>
                <TextField
                  label="Mot de passe"
                  size="small"
                  fullWidth
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  helperText="Généré pour vous. Notez-le : il ne sera plus affiché."
                  sx={{ "& input": { fontFamily: "monospace" } }}
                />
                <Stack direction="row" spacing={1} sx={{ mt: -1 }}>
                  <Button
                    size="small"
                    startIcon={<IconRefresh size={14} />}
                    onClick={() => setMotDePasse(genererMotDePasse())}
                  >
                    Régénérer
                  </Button>
                  <Button
                    size="small"
                    startIcon={<IconCopy size={14} />}
                    onClick={() =>
                      void navigator.clipboard?.writeText(motDePasse)
                    }
                  >
                    Copier
                  </Button>
                </Stack>
              </Box>
              {catalogueLu && productId === null && (
                <Typography sx={{ fontSize: 12, color: "#B3261E" }}>
                  Le produit LyraeKonnect est introuvable dans le catalogue. La
                  création échouera.
                </Typography>
              )}
              <Suite
                occupe={occupe}
                onRetour={() => setEtape(0)}
                onSuivant={() => void creerLeCompte()}
                libelle="Créer le compte"
                actif={
                  catalogueLu &&
                  nom.trim() !== "" &&
                  identifiant.trim().length >= 3
                }
              />
            </Stack>
          )}

          {/* ───────────────────────────── 2. Le portail ─────────────────────────── */}
          {etape === 2 && (
            <Stack spacing={2.5} sx={{ maxWidth: 620 }}>
              <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                Les réglages de départ. Le client les retrouve dans « Paramètres
                du portail » et peut les changer.
              </Typography>
              {userProductId === null && (
                <Alert severity="warning">
                  Le compte n&apos;a pas d&apos;affiliation LyraeKonnect : rien
                  ne pourra être enregistré. Revenez à la page précédente.
                </Alert>
              )}
              <TextField
                label="Téléphone du secrétariat"
                size="small"
                value={portail.telephoneSecretariat}
                onChange={(e) =>
                  setPortail((p) => ({
                    ...p,
                    telephoneSecretariat: e.target.value,
                  }))
                }
                helperText="Affiché au patient qui ne peut pas réserver seul."
              />
              <Stack direction="row" spacing={2}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={portail.envoiEmail}
                      onChange={(_, v) =>
                        setPortail((p) => ({ ...p, envoiEmail: v }))
                      }
                    />
                  }
                  label="Confirmation par mail"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={portail.envoiSms}
                      onChange={(_, v) =>
                        setPortail((p) => ({ ...p, envoiSms: v }))
                      }
                    />
                  }
                  label="Confirmation par SMS"
                />
              </Stack>
              <TextField
                label="Nom d'expéditeur des SMS"
                size="small"
                value={portail.expediteurSms}
                error={!smsValide}
                onChange={(e) =>
                  setPortail((p) => ({ ...p, expediteurSms: e.target.value }))
                }
                helperText={
                  smsValide
                    ? "De 3 à 11 lettres ou chiffres, sans espace. Vide : le nom par défaut."
                    : "Ce nom sera refusé : de 3 à 11 lettres ou chiffres, sans espace ni accent."
                }
              />
              <TextField
                label="Nom d'expéditeur des mails"
                size="small"
                value={portail.expediteurNomMail}
                inputProps={{ maxLength: 60 }}
                onChange={(e) =>
                  setPortail((p) => ({
                    ...p,
                    expediteurNomMail: e.target.value,
                  }))
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={portail.depassementHonoraires}
                    onChange={(_, v) =>
                      setPortail((p) => ({ ...p, depassementHonoraires: v }))
                    }
                  />
                }
                label="Des dépassements d'honoraires sont à signaler au patient"
              />
              <TextField
                label="Consigne donnée à tous les patients"
                size="small"
                multiline
                minRows={2}
                value={portail.consignesGenerales}
                onChange={(e) =>
                  setPortail((p) => ({
                    ...p,
                    consignesGenerales: e.target.value,
                  }))
                }
              />
              <Suite
                occupe={occupe}
                onRetour={() => setEtape(1)}
                onSuivant={() => void enregistrerLePortail()}
                onPasser={() => setEtape(3)}
                actif={userProductId !== null && smsValide}
              />
            </Stack>
          )}

          {/* ─────────────────────────── 3. Sites et logiciel ────────────────────── */}
          {etape === 3 && (
            <Stack spacing={2.5}>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: INK }}>
                  Les sites
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                  Le code site d&apos;Xplore et l&apos;adresse que le portail
                  donne au patient avant qu&apos;il confirme.
                </Typography>
              </Box>
              {sites.map((s, i) => (
                <Stack
                  key={i}
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.5}
                  sx={{ alignItems: { md: "center" } }}
                >
                  <TextField
                    label="Code site"
                    size="small"
                    value={s.site_id}
                    onChange={(e) =>
                      setSites((l) =>
                        l.map((x, j) =>
                          j === i ? { ...x, site_id: e.target.value } : x,
                        ),
                      )
                    }
                    sx={{ width: { md: 120 } }}
                  />
                  <TextField
                    label="Nom"
                    size="small"
                    value={s.libelle}
                    onChange={(e) =>
                      setSites((l) =>
                        l.map((x, j) =>
                          j === i ? { ...x, libelle: e.target.value } : x,
                        ),
                      )
                    }
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Adresse"
                    size="small"
                    value={s.adresse}
                    onChange={(e) =>
                      setSites((l) =>
                        l.map((x, j) =>
                          j === i ? { ...x, adresse: e.target.value } : x,
                        ),
                      )
                    }
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    label="Code postal"
                    size="small"
                    value={s.code_postal}
                    error={
                      s.code_postal !== "" && !/^\d{5}$/.test(s.code_postal)
                    }
                    onChange={(e) =>
                      setSites((l) =>
                        l.map((x, j) =>
                          j === i
                            ? { ...x, code_postal: e.target.value.trim() }
                            : x,
                        ),
                      )
                    }
                    sx={{ width: { md: 120 } }}
                  />
                  <IconButton
                    aria-label="Retirer ce site"
                    disabled={sites.length === 1}
                    onClick={() => setSites((l) => l.filter((_, j) => j !== i))}
                  >
                    <IconTrash size={16} />
                  </IconButton>
                </Stack>
              ))}
              <Box>
                <Button
                  size="small"
                  startIcon={<IconPlus size={14} />}
                  onClick={() => setSites((l) => [...l, { ...SITE_VIDE }])}
                >
                  Ajouter un site
                </Button>
              </Box>

              <Box sx={{ pt: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: INK }}>
                  Le logiciel du centre
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                  L&apos;adresse de l&apos;instance Xplore et le code du site,
                  communiqués par l&apos;éditeur. Laissez vide si vous ne les
                  avez pas encore : l&apos;écran « Installation Konnect » les
                  reprend.
                </Typography>
              </Box>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                <TextField
                  label="Adresse de l'instance"
                  placeholder="https://…/api"
                  size="small"
                  fullWidth
                  value={risBaseUrl}
                  onChange={(e) => setRisBaseUrl(e.target.value)}
                />
                <TextField
                  label="Code du site"
                  size="small"
                  value={risCodeSite}
                  onChange={(e) => setRisCodeSite(e.target.value)}
                  sx={{ minWidth: 160 }}
                />
              </Stack>
              <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                La connexion reste éteinte tant qu&apos;elle n&apos;est pas
                activée dans l&apos;espace technique du portail, avec les
                identifiants Xplore.
              </Typography>
              <Suite
                occupe={occupe}
                onRetour={() => setEtape(2)}
                onSuivant={() => void enregistrerSitesEtLogiciel()}
                onPasser={() => setEtape(4)}
                actif={
                  userProductId !== null &&
                  sitesRemplis.every(
                    (s) =>
                      s.code_postal === "" || /^\d{5}$/.test(s.code_postal),
                  )
                }
              />
            </Stack>
          )}

          {/* ───────────────────────────── 4. Récapitulatif ──────────────────────── */}
          {etape === 4 && (
            <Stack spacing={2} sx={{ maxWidth: 780 }}>
              {tenantId && (
                <Typography sx={{ fontSize: 13, color: INK }}>
                  Identifiant du portail :{" "}
                  <Box component="span" sx={{ fontFamily: "monospace" }}>
                    {tenantId}
                  </Box>
                </Typography>
              )}
              {fiche && <ResteDeLaFiche fiche={fiche} />}

              <Alert severity="info" icon={false}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 0.75 }}>
                  Ce que l&apos;assistant ne fait pas
                </Typography>
                <Typography sx={{ fontSize: 13, mb: 0.75 }}>
                  <strong>Les examens réservables en ligne.</strong> Cochez «
                  Réservable en ligne » sur les examens concernés
                  {fiche && fiche.portail.examens.length > 0
                    ? ` (la fiche dit : ${fiche.portail.examens.join(", ")})`
                    : ""}
                  , et vérifiez les codes Xplore.
                </Typography>
                <Typography sx={{ fontSize: 13, mb: 0.75 }}>
                  <strong>
                    Les salles, l&apos;accord de lecture des ordonnances et la
                    façon de lire.
                  </strong>{" "}
                  Sur l&apos;écran « Installation Konnect ».
                </Typography>
                <Typography sx={{ fontSize: 13 }}>
                  <strong>Le logo</strong>, joint au mail du client : dans «
                  Paramètres du portail ».
                </Typography>
                {userId !== null && (
                  <Stack
                    direction="row"
                    sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      href={cheminCentre(userId, "konnect", "examens")}
                    >
                      Correspondance des examens
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      href={cheminCentre(userId, "konnect", "parametrage")}
                    >
                      Paramètres du portail
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      href="/admin/konnect-installation"
                    >
                      Installation Konnect
                    </Button>
                  </Stack>
                )}
              </Alert>

              {userProductId === null ? (
                <Alert severity="warning" sx={{ fontSize: 13 }}>
                  Aucun compte créé : rien à vérifier.
                </Alert>
              ) : !manquesLus ? (
                <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                  Vérification en cours…
                </Typography>
              ) : manques === null ? (
                <Alert severity="warning" sx={{ fontSize: 13 }}>
                  Le registre de complétude n&apos;a pas répondu, rien n&apos;a
                  pu être vérifié. Rechargez la page, ou consultez «
                  Installation Konnect ».
                </Alert>
              ) : (
                <Box
                  sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, p: 2 }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", mb: 1 }}
                  >
                    <Typography sx={{ fontWeight: 700, color: INK }}>
                      LyraeKonnect
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        manques.length === 0
                          ? "Rien ne manque"
                          : `${manques.length} à faire`
                      }
                      color={manques.length === 0 ? "success" : "default"}
                    />
                  </Stack>
                  <Stack spacing={0.75}>
                    {manques.map((m) => (
                      <Stack
                        key={m.cle}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "flex-start" }}
                      >
                        <Box
                          sx={{
                            width: 7,
                            height: 7,
                            mt: 0.8,
                            borderRadius: "50%",
                            flex: "0 0 auto",
                            bgcolor:
                              m.criticite === "bloquant"
                                ? "#B3261E"
                                : "#F5A623",
                          }}
                        />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            sx={{ fontSize: 13, fontWeight: 600, color: INK }}
                          >
                            {m.libelle}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                            {m.manque}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          href={m.href}
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          Régler
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              {manques !== null && (
                <Alert severity={bloquants.length > 0 ? "warning" : "success"}>
                  {bloquants.length > 0
                    ? `${bloquants.length} point(s) bloquant(s) avant que le portail puisse prendre des patients.`
                    : "Rien ne bloque la mise en service."}
                </Alert>
              )}

              <Stack direction="row" spacing={1}>
                <Button
                  disabled={occupe}
                  startIcon={<IconArrowLeft size={15} />}
                  onClick={() => setEtape(3)}
                >
                  Retour
                </Button>
                <Button
                  variant="contained"
                  disableElevation
                  disabled={occupe || userProductId === null}
                  startIcon={<IconCheck size={16} />}
                  onClick={() => void passerEnProduction()}
                  sx={BOUTON_ACTION}
                >
                  Passer en production
                </Button>
                <Button href="/admin/comptes">Voir la fiche du client</Button>
              </Stack>
              <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                À sa première connexion, le client est guidé par le tutoriel
                LyraeKonnect.
              </Typography>
            </Stack>
          )}
        </Card>

        <Retour
          ouvert={message !== null}
          message={message ?? ""}
          gravite={"success"}
          onFermer={() => setMessage(null)}
        />
      </Box>
    </PageContainer>
  );
}

/** Ce que la fiche dit et que rien n'écrit : à traiter à la main. */
function ResteDeLaFiche({ fiche }: { fiche: FicheKonnect }) {
  const lignes: [string, string][] = [
    [
      "Suit le projet",
      [
        fiche.contact.nom,
        fiche.contact.fonction,
        fiche.contact.mail,
        fiche.contact.tel,
      ]
        .filter(Boolean)
        .join(", "),
    ],
    [
      "Informatique",
      [fiche.informatique.nom, fiche.informatique.mail]
        .filter(Boolean)
        .join(", "),
    ],
    ["Xplore", fiche.xplore.version],
    ["Ouvre l'accès réseau", fiche.xplore.acces],
    ["Site internet", fiche.web.adresse],
    ["Gère le site (guide d'intégration)", fiche.web.prestataire],
    ["Remarques", fiche.remarques],
  ];
  const remplies = lignes.filter(([, v]) => v.trim() !== "");
  return (
    <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, p: 2 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: INK, mb: 0.5 }}>
        Ce que la fiche dit encore
      </Typography>
      <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 1 }}>
        Rien de ceci n&apos;a été enregistré : c&apos;est à traiter à la main.
      </Typography>
      {remplies.map(([libelle, v]) => (
        <Typography key={libelle} sx={{ fontSize: 13, color: INK }}>
          <strong>{libelle} :</strong> {v}
        </Typography>
      ))}
      {fiche.comptes.length > 0 && (
        <>
          <Typography
            sx={{ fontSize: 13, fontWeight: 700, color: INK, mt: 1.5 }}
          >
            Comptes à créer dans « Clients et comptes »
          </Typography>
          {fiche.comptes.map((c, i) => (
            <Typography key={i} sx={{ fontSize: 13, color: INK }}>
              {[c.nom, c.mail, c.acces].filter(Boolean).join(", ")}
            </Typography>
          ))}
        </>
      )}
    </Box>
  );
}

/**
 * Le pied de page d'une étape. Déclaré au niveau du module : défini dans le rendu, il
 * serait remonté à chaque frappe et le champ en cours perdrait le focus.
 */
function Suite({
  occupe,
  onRetour,
  onSuivant,
  onPasser,
  libelle = "Enregistrer et continuer",
  actif = true,
}: {
  occupe: boolean;
  onRetour: () => void;
  onSuivant: () => void;
  /** Absent = page non passable. Présent = avance SANS rien écrire. */
  onPasser?: () => void;
  libelle?: string;
  actif?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", pt: 1 }}>
      <Button
        startIcon={<IconArrowLeft size={15} />}
        disabled={occupe}
        onClick={onRetour}
      >
        Retour
      </Button>
      <Button
        variant="contained"
        disableElevation
        disabled={occupe || !actif}
        onClick={onSuivant}
        endIcon={<IconArrowRight size={16} />}
        sx={BOUTON_ACTION}
      >
        {libelle}
      </Button>
      {onPasser && (
        <Button disabled={occupe} onClick={onPasser}>
          Passer
        </Button>
      )}
    </Stack>
  );
}
