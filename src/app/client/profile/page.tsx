"use client";

import React, { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  Collapse,
  Grid,
  IconButton,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  IconArrowRight,
  IconBuildingCommunity,
  IconCalendar,
  IconChevronDown,
  IconDeviceLaptop,
  IconEye,
  IconEyeOff,
  IconHeadset,
  IconLock,
  IconLockCog,
  IconLogout,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconSchool,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import DialogConfirmation from "@/components/shared/DialogConfirmation";
import {
  BORDER,
  BRAND_DEEP,
  BRAND_SOFT,
  INK,
  INK_MUTED,
  OK,
  OK_SOFT,
  SURFACE_MUTED,
  WARNING,
  WARNING_SOFT,
} from "@/lib/jetons";

/**
 * Mon profil (client).
 * -----------------------------------------------------------------------------
 * Refaite le 30/10/2026 : la grille tarifaire en accordéon est partie avec l'ancienne
 * tarification, et la page dit maintenant ce qu'un client cherche sur son compte :
 * son centre et ses produits, ce que son compte peut faire, ses connexions et son mot
 * de passe, où trouver de l'aide, et pour le compte principal tous les comptes ouverts
 * chez lui. Même langage visuel que les accueils de LyraeTalk et LyraeKonnect.
 *
 * Deux lectures : `/api/client` (identité, déjà lue par le reste de l'application) et
 * `/api/client/profil` (le reste, calculé pour le compte de la session).
 *
 * La page vit hors d'un écran de centre : le tutoriel n'y est pas disponible, on y
 * mène par l'accueil du produit (`?tutoriel=1`, cf. `ContexteTutoriel`).
 */

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

interface ClientData {
  id: number;
  name?: string | null;
  email: string;
  role: "ADMIN" | "CLIENT";
  centreRole?: "ADMIN_USER" | "USER" | null;
}

type Slug = "talk" | "konnect";

type CompteEquipe = {
  id: number;
  nom: string | null;
  email: string;
  genre: "principal" | "directeur" | "centre" | "sous_compte";
  droits: { ecriture: number; lecture: number } | null;
  derniereConnexion: string | null;
  bloque: boolean;
  creeLe: string;
};

interface Profil {
  compte: { sousCompte: boolean; creeLe: string };
  centre: { id: number; nom: string | null; adresse: string; numeros: string[] };
  produits: {
    slug: Slug;
    libelle: string;
    description: string;
    icone: string;
    depuis: string;
    accueil: string;
  }[];
  droits: { titre: string; pages: { libelle: string; niveau: "read" | "write" }[] }[] | null;
  securite: { connexions: string[]; refusees30j: number };
  support: { slug: Slug; libelle: string; chemin: string; ouverts: number }[];
  equipe: { centre: string; comptes: CompteEquipe[] }[] | null;
}

/* -------------------------------------------------------------------------- */
/*                                   Outils                                   */
/* -------------------------------------------------------------------------- */

const dateLongue = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const dateEtHeure = (iso: string) => {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)}, ${heure.replace(":", " h ")}`;
};

/** « aujourd'hui », « hier », « il y a 5 jours », sinon la date. */
function ilYa(iso: string | null): string {
  if (!iso) return "Aucune connexion depuis 30 jours";
  const d = new Date(iso);
  const debutDuJour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const jours = Math.round((debutDuJour(new Date()) - debutDuJour(d)) / 86_400_000);
  if (jours <= 0) return "Connecté aujourd'hui";
  if (jours === 1) return "Connecté hier";
  if (jours < 30) return `Connecté il y a ${jours} jours`;
  return `Connecté le ${d.toLocaleDateString("fr-FR")}`;
}

const initiales = (nom: string | null | undefined, email: string) => {
  const source = (nom || email.split("@")[0]).trim();
  const mots = source.split(/[\s._-]+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "") + (mots[1]?.[0] ?? "")).toUpperCase() || "?";
};

const LIBELLE_GENRE: Record<CompteEquipe["genre"], string> = {
  principal: "Compte principal",
  directeur: "Directeur de centre",
  centre: "Compte du centre",
  sous_compte: "Sous-compte",
};

/* -------------------------------------------------------------------------- */
/*                         Petits composants de la page                        */
/* -------------------------------------------------------------------------- */

/** Le titre d'une carte : pastille d'icône à l'accent, titre, phrase d'aide. */
function TitreCarte({
  icone,
  titre,
  aide,
  action,
}: {
  icone: React.ReactNode;
  titre: string;
  aide?: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "12px",
          display: "grid",
          placeItems: "center",
          bgcolor: "rgba(var(--accent-rgb), 0.12)",
          color: BRAND_DEEP,
          flexShrink: 0,
        }}
      >
        {icone}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} lineHeight={1.3}>
          {titre}
        </Typography>
        {aide && (
          <Typography variant="body2" color="text.secondary">
            {aide}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}

const carte = {
  p: { xs: 2.5, md: 3 },
  height: "100%",
  border: `1px solid ${BORDER}`,
  borderRadius: 2,
  boxShadow: "none",
} as const;

/** Une tuile cliquable, comme les accès rapides des accueils produit. */
function TuileLien({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: BORDER,
        borderRadius: 2,
        height: "100%",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 8px 24px rgba(var(--accent-rgb), 0.15)",
          borderColor: "rgba(var(--accent-rgb), 0.45)",
        },
        "@media (prefers-reduced-motion: reduce)": {
          transition: "border-color 180ms ease",
          "&:hover": { transform: "none" },
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: 2, height: "100%" }}>
        {children}
      </CardActionArea>
    </Card>
  );
}

function ChampMotDePasse({
  label,
  value,
  onChange,
  aide,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  aide?: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      size="small"
      autoComplete={autoComplete}
      helperText={aide}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              size="small"
              onClick={() => setVisible((v) => !v)}
              sx={{ color: "#91A3B7" }}
              aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Page Profil                                 */
/* -------------------------------------------------------------------------- */

const ProfilePage = () => {
  const { status } = useSession();
  const router = useRouter();

  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [erreurProfil, setErreurProfil] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formOuvert, setFormOuvert] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [confirmerPartout, setConfirmerPartout] = useState(false);
  const [partoutEnCours, setPartoutEnCours] = useState(false);
  const [partoutErreur, setPartoutErreur] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const [rClient, rProfil] = await Promise.all([
          fetch("/api/client"),
          fetch("/api/client/profil", { cache: "no-store" }),
        ]);
        if (rClient.ok) setClientData(await rClient.json());
        if (rProfil.ok) setProfil(await rProfil.json());
        else setErreurProfil(true);
      } catch (error) {
        console.error("Error fetching profile:", error);
        setErreurProfil(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: "var(--accent)" } }} />
      </Box>
    );
  }

  if (!clientData) {
    return (
      <Typography variant="h6" sx={{ mt: 4, textAlign: "center" }}>
        Votre profil n&apos;a pas pu être chargé. Rechargez la page.
      </Typography>
    );
  }

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Remplissez les trois champs.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les deux nouveaux mots de passe ne sont pas identiques.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch("/api/client/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(
          data.error ||
            "Le mot de passe n'a pas été modifié. Vérifiez le mot de passe actuel et réessayez."
        );
      } else {
        setPasswordSuccess(data.message || "Mot de passe modifié.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordError("Le serveur n'a pas répondu. Vérifiez votre connexion et réessayez.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const deconnecterPartout = async () => {
    setPartoutEnCours(true);
    setPartoutErreur(null);
    try {
      const r = await fetch("/api/client/deconnecter-partout", { method: "POST" });
      if (!r.ok) throw new Error();
      await signOut({ callbackUrl: "/authentication/signin" });
    } catch {
      setPartoutEnCours(false);
      setConfirmerPartout(false);
      setPartoutErreur(
        "Les appareils n'ont pas été déconnectés : le serveur n'a pas répondu. Réessayez."
      );
    }
  };

  const { name, email, centreRole } = clientData;
  const sousCompte = profil?.compte.sousCompte ?? false;
  const genre = sousCompte
    ? "Sous-compte"
    : centreRole === "ADMIN_USER"
    ? "Directeur de centre"
    : "Compte principal";
  const ouvrirTutoriel = (accueil: string) => router.push(`${accueil}?tutoriel=1`);
  const nbComptes = profil?.equipe?.reduce((n, g) => n + g.comptes.length, 0) ?? 0;

  return (
    <PageContainer title="Mon profil" description="Votre compte, votre centre et sa sécurité">
      <Box>
        <SectionHeader
          title="Mon profil"
          subtitle="Votre compte, votre centre, et ce que vous pouvez y faire."
        />

        {erreurProfil && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Une partie du profil n&apos;a pas pu être chargée (centre, droits, connexions).
            Rechargez la page.
          </Alert>
        )}

        {/* ========== Carte d'identité ========== */}
        <Card
          id="profil_compte"
          sx={{
            ...carte,
            height: "auto",
            mb: 3,
            position: "relative",
            overflow: "hidden",
            background:
              "linear-gradient(120deg, rgba(var(--accent-rgb), 0.10) 0%, rgba(var(--accent-rgb), 0.02) 55%, #fff 100%)",
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 2, sm: 2.5 }}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Avatar
              sx={{
                width: 64,
                height: 64,
                fontSize: 22,
                fontWeight: 800,
                bgcolor: "var(--accent)",
                color: "#fff",
                boxShadow: "0 0 0 4px rgba(var(--accent-rgb), 0.18)",
              }}
            >
              {initiales(name, email)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" fontWeight={800} sx={{ color: INK, lineHeight: 1.25 }}>
                {name || email}
              </Typography>
              <Typography variant="body2" sx={{ color: INK_MUTED, wordBreak: "break-all" }}>
                {email}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                <Chip
                  size="small"
                  label={genre}
                  sx={{ bgcolor: BRAND_SOFT, color: BRAND_DEEP, fontWeight: 700 }}
                />
                {!sousCompte && profil && (
                  <Chip
                    size="small"
                    icon={<IconShieldCheck size={14} />}
                    label="Accès complet à votre centre"
                    sx={{
                      bgcolor: OK_SOFT,
                      color: OK,
                      fontWeight: 600,
                      "& .MuiChip-icon": { color: OK },
                    }}
                  />
                )}
                {profil && (
                  <Chip
                    size="small"
                    variant="outlined"
                    icon={<IconCalendar size={14} />}
                    label={`Compte ouvert le ${dateLongue(profil.compte.creeLe)}`}
                    sx={{ borderColor: BORDER, color: INK_MUTED }}
                  />
                )}
              </Stack>
            </Box>
            <Button
              variant="outlined"
              startIcon={<IconLockCog size={18} />}
              onClick={() => {
                setFormOuvert(true);
                document
                  .getElementById("profil_securite")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              sx={{
                flexShrink: 0,
                borderColor: "var(--accent)",
                color: BRAND_DEEP,
                fontWeight: 600,
                bgcolor: "#fff",
                "&:hover": {
                  borderColor: "var(--accent-press)",
                  bgcolor: "rgba(var(--accent-rgb), 0.08)",
                },
              }}
            >
              Changer le mot de passe
            </Button>
          </Stack>
        </Card>

        {/* ========== Centre et produits | Aide ========== */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={7}>
            <Card id="profil_centre" sx={carte}>
              <TitreCarte
                icone={<IconBuildingCommunity size={20} />}
                titre={profil?.centre.nom || "Votre centre"}
                aide="Les produits Lyrae ouverts pour votre centre."
              />

              {!profil ? (
                <Skeleton variant="rounded" height={120} />
              ) : (
                <>
                  {(profil.centre.adresse || profil.centre.numeros.length > 0) && (
                    <Stack spacing={1} sx={{ mb: 2.5 }}>
                      {profil.centre.adresse && (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <IconMapPin size={16} color={INK_MUTED} />
                          <Typography variant="body2" sx={{ color: INK }}>
                            {profil.centre.adresse}
                          </Typography>
                        </Stack>
                      )}
                      {profil.centre.numeros.length > 0 && (
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <IconPhone size={16} color={INK_MUTED} />
                          <Typography variant="body2" sx={{ color: INK_MUTED }}>
                            {profil.centre.numeros.length > 1
                              ? "Numéros du robot :"
                              : "Numéro du robot :"}
                          </Typography>
                          {profil.centre.numeros.map((n) => (
                            <Chip
                              key={n}
                              size="small"
                              label={n}
                              sx={{
                                bgcolor: SURFACE_MUTED,
                                border: `1px solid ${BORDER}`,
                                fontWeight: 600,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            />
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  )}

                  {profil.produits.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Aucun produit n&apos;est ouvert pour votre centre. Contactez Neuracorp
                      pour en ouvrir un.
                    </Typography>
                  ) : (
                    <Grid container spacing={1.5}>
                      {profil.produits.map((p) => (
                        <Grid item xs={12} sm={profil.produits.length > 1 ? 6 : 12} key={p.slug}>
                          <TuileLien onClick={() => router.push(p.accueil)}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.icone} alt="" width={36} height={36} />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle2" fontWeight={800} noWrap>
                                  {p.libelle}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" component="div">
                                  {p.description}
                                </Typography>
                                <Typography variant="caption" sx={{ color: BRAND_DEEP, fontWeight: 600 }}>
                                  Depuis le {new Date(p.depuis).toLocaleDateString("fr-FR")}
                                </Typography>
                              </Box>
                              <IconArrowRight size={18} color="var(--accent-deep)" />
                            </Stack>
                          </TuileLien>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </>
              )}
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card id="profil_aide" sx={carte}>
              <TitreCarte
                icone={<IconHeadset size={20} />}
                titre="Aide"
                aide="Une question, un souci : le support répond par produit."
              />
              {!profil ? (
                <Skeleton variant="rounded" height={120} />
              ) : (
                <Stack spacing={1.5}>
                  {profil.support.map((s) => (
                    <TuileLien key={s.slug} onClick={() => router.push(s.chemin)}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <IconHeadset size={20} color="var(--accent-deep)" />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            Support {s.libelle}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {s.ouverts === 0
                              ? "Aucune demande en cours"
                              : `${s.ouverts} demande${s.ouverts > 1 ? "s" : ""} en cours`}
                          </Typography>
                        </Box>
                        {s.ouverts > 0 && (
                          <Chip
                            size="small"
                            label={s.ouverts}
                            sx={{
                              height: 22,
                              minWidth: 26,
                              bgcolor: "var(--accent)",
                              color: "#fff",
                              fontWeight: 700,
                            }}
                          />
                        )}
                        <IconArrowRight size={18} color="var(--accent-deep)" />
                      </Stack>
                    </TuileLien>
                  ))}
                  {profil.produits.map((p) => (
                    <TuileLien key={`tuto-${p.slug}`} onClick={() => ouvrirTutoriel(p.accueil)}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <IconSchool size={20} color="var(--accent-deep)" />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            Revoir le tutoriel {p.libelle}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Les écrans, chapitre par chapitre
                          </Typography>
                        </Box>
                        <IconArrowRight size={18} color="var(--accent-deep)" />
                      </Stack>
                    </TuileLien>
                  ))}
                </Stack>
              )}
            </Card>
          </Grid>
        </Grid>

        {/* ========== Ce que mon compte peut faire (sous-compte) ========== */}
        {profil?.droits && (
          <Card id="profil_droits" sx={{ ...carte, height: "auto", mb: 3 }}>
            <TitreCarte
              icone={<IconShieldCheck size={20} />}
              titre="Ce que votre compte peut faire"
              aide="Votre compte ouvre les écrans ci-dessous. Pour un accès en plus, demandez au responsable de votre centre."
            />
            {profil.droits.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aucun écran n&apos;est ouvert à votre compte pour l&apos;instant.
              </Typography>
            ) : (
              <Grid container spacing={2.5}>
                {profil.droits.map((g) => (
                  <Grid item xs={12} md={profil.droits!.length > 1 ? 6 : 12} key={g.titre}>
                    <Typography
                      variant="overline"
                      sx={{ color: BRAND_DEEP, fontWeight: 700, letterSpacing: 1 }}
                    >
                      {g.titre}
                    </Typography>
                    <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                      {g.pages.map((p) => (
                        <Stack
                          key={p.libelle}
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          sx={{
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 1.5,
                            bgcolor: SURFACE_MUTED,
                          }}
                        >
                          <Typography variant="body2" sx={{ flex: 1, color: INK }}>
                            {p.libelle}
                          </Typography>
                          <Chip
                            size="small"
                            icon={
                              p.niveau === "write" ? <IconPencil size={13} /> : <IconEye size={13} />
                            }
                            label={p.niveau === "write" ? "Modifier" : "Consulter"}
                            sx={{
                              height: 22,
                              fontWeight: 600,
                              fontSize: 11.5,
                              bgcolor: p.niveau === "write" ? BRAND_SOFT : "#EEF1F4",
                              color: p.niveau === "write" ? BRAND_DEEP : INK_MUTED,
                              "& .MuiChip-icon": { color: "inherit" },
                            }}
                          />
                        </Stack>
                      ))}
                    </Stack>
                  </Grid>
                ))}
              </Grid>
            )}
          </Card>
        )}

        {/* ========== Sécurité ========== */}
        <Card id="profil_securite" sx={{ ...carte, height: "auto", mb: 3, scrollMarginTop: 96 }}>
          <TitreCarte
            icone={<IconLock size={20} />}
            titre="Sécurité du compte"
            aide="Vos connexions des 30 derniers jours, et votre mot de passe."
          />

          {partoutErreur && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPartoutErreur(null)}>
              {partoutErreur}
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" fontWeight={700} sx={{ color: INK, mb: 1 }}>
                Dernières connexions
              </Typography>
              {!profil ? (
                <Skeleton variant="rounded" height={100} />
              ) : profil.securite.connexions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Aucune connexion enregistrée depuis 30 jours.
                </Typography>
              ) : (
                <Stack spacing={0.75}>
                  {profil.securite.connexions.map((c, i) => (
                    <Stack
                      key={c}
                      direction="row"
                      spacing={1.25}
                      alignItems="center"
                      sx={{ px: 1.5, py: 0.75, borderRadius: 1.5, bgcolor: SURFACE_MUTED }}
                    >
                      <IconDeviceLaptop size={16} color={i === 0 ? "var(--accent-deep)" : INK_MUTED} />
                      <Typography
                        variant="body2"
                        sx={{ color: INK, flex: 1, fontWeight: i === 0 ? 600 : 400 }}
                      >
                        {dateEtHeure(c)}
                      </Typography>
                      {i === 0 && (
                        <Typography variant="caption" sx={{ color: BRAND_DEEP, fontWeight: 600 }}>
                          La plus récente
                        </Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              )}

              {profil && (
                <Box
                  sx={{
                    mt: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.5,
                    bgcolor: profil.securite.refusees30j > 0 ? WARNING_SOFT : OK_SOFT,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: profil.securite.refusees30j > 0 ? WARNING : OK,
                      fontWeight: 600,
                    }}
                  >
                    {profil.securite.refusees30j === 0
                      ? "Aucune tentative de connexion refusée depuis 30 jours."
                      : `${profil.securite.refusees30j} tentative${
                          profil.securite.refusees30j > 1 ? "s" : ""
                        } refusée${profil.securite.refusees30j > 1 ? "s" : ""} depuis 30 jours (mauvais mot de passe).`}
                  </Typography>
                  {profil.securite.refusees30j > 0 && (
                    <Typography variant="caption" sx={{ color: WARNING, display: "block" }}>
                      Si ce n&apos;était pas vous, changez votre mot de passe et déconnectez vos
                      appareils.
                    </Typography>
                  )}
                </Box>
              )}

              <Button
                variant="text"
                startIcon={<IconLogout size={18} />}
                onClick={() => setConfirmerPartout(true)}
                sx={{ mt: 1.5, ml: -1, color: INK_MUTED, fontWeight: 600 }}
              >
                Déconnecter tous mes appareils
              </Button>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <Box
                  component="button"
                  type="button"
                  onClick={() => setFormOuvert((v) => !v)}
                  aria-expanded={formOuvert}
                  sx={{
                    all: "unset",
                    boxSizing: "border-box",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "rgba(var(--accent-rgb), 0.05)" },
                    "&:focus-visible": { outline: "2px solid var(--accent)", outlineOffset: -2 },
                  }}
                >
                  <IconLockCog size={20} color="var(--accent-deep)" />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ color: INK }}>
                      Changer le mot de passe
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Il faut votre mot de passe actuel pour le changer.
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      color: INK_MUTED,
                      transition: "transform 200ms ease",
                      transform: formOuvert ? "rotate(180deg)" : "none",
                    }}
                  >
                    <IconChevronDown size={18} />
                  </Box>
                </Box>

                <Collapse in={formOuvert} id="profil_mot_de_passe">
                  <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
                    {passwordError && (
                      <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPasswordError(null)}>
                        {passwordError}
                      </Alert>
                    )}
                    {passwordSuccess && (
                      <Alert
                        severity="success"
                        sx={{ mb: 2 }}
                        onClose={() => setPasswordSuccess(null)}
                      >
                        {passwordSuccess}
                      </Alert>
                    )}
                    <Stack spacing={2}>
                      <ChampMotDePasse
                        label="Mot de passe actuel"
                        value={currentPassword}
                        onChange={setCurrentPassword}
                        autoComplete="current-password"
                      />
                      <ChampMotDePasse
                        label="Nouveau mot de passe"
                        value={newPassword}
                        onChange={setNewPassword}
                        autoComplete="new-password"
                        aide="8 caractères au moins, avec une majuscule, une minuscule, un chiffre et un caractère spécial."
                      />
                      <ChampMotDePasse
                        label="Confirmer le nouveau mot de passe"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        autoComplete="new-password"
                      />
                      <Box>
                        <Button
                          variant="contained"
                          onClick={handleChangePassword}
                          disabled={passwordLoading}
                          sx={{
                            bgcolor: "var(--accent)",
                            fontWeight: 600,
                            minWidth: 220,
                            "&:hover": { bgcolor: "var(--accent-press)" },
                          }}
                        >
                          {passwordLoading ? (
                            <CircularProgress size={22} sx={{ color: "#fff" }} />
                          ) : (
                            "Modifier le mot de passe"
                          )}
                        </Button>
                      </Box>
                    </Stack>
                  </Box>
                </Collapse>
              </Box>
            </Grid>
          </Grid>
        </Card>

        {/* ========== Comptes du centre (compte principal, directeur) ========== */}
        {profil?.equipe && (
          <Card id="profil_comptes" sx={{ ...carte, height: "auto", mb: 3 }}>
            <TitreCarte
              icone={<IconUsers size={20} />}
              titre="Les comptes de votre centre"
              aide="Tous les comptes ouverts chez vous, et leur dernière connexion. Pour en ouvrir, en fermer ou changer leurs accès, écrivez au support."
              action={
                <Chip
                  label={`${nbComptes} compte${nbComptes > 1 ? "s" : ""}`}
                  sx={{ bgcolor: BRAND_SOFT, color: BRAND_DEEP, fontWeight: 700 }}
                />
              }
            />

            <Stack spacing={3}>
              {profil.equipe.map((groupe) => (
                <Box key={groupe.centre}>
                  {profil.equipe!.length > 1 && (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Box sx={{ width: 4, height: 18, borderRadius: 1, bgcolor: "var(--accent)" }} />
                      <Typography variant="subtitle2" fontWeight={800} sx={{ color: INK }}>
                        {groupe.centre}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {groupe.comptes.length} compte{groupe.comptes.length > 1 ? "s" : ""}
                      </Typography>
                    </Stack>
                  )}
                  <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
                    {groupe.comptes.map((c) => {
                      const moi = c.email.toLowerCase() === email.toLowerCase();
                      return (
                        <Stack
                          key={c.id}
                          direction={{ xs: "column", sm: "row" }}
                          spacing={{ xs: 1, sm: 2 }}
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          sx={{
                            px: 2,
                            py: 1.5,
                            borderBottom: `1px solid ${BORDER}`,
                            "&:last-of-type": { borderBottom: "none" },
                            "&:hover": { bgcolor: "rgba(var(--accent-rgb), 0.04)" },
                          }}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                            <Avatar
                              sx={{
                                width: 36,
                                height: 36,
                                fontSize: 13,
                                fontWeight: 700,
                                bgcolor: c.genre === "sous_compte" ? "#EEF1F4" : BRAND_SOFT,
                                color: c.genre === "sous_compte" ? INK_MUTED : BRAND_DEEP,
                              }}
                            >
                              {initiales(c.nom, c.email)}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={700} sx={{ color: INK }} noWrap>
                                {c.nom || c.email}
                                {moi && (
                                  <Box component="span" sx={{ color: INK_MUTED, fontWeight: 500 }}>
                                    {" "}(vous)
                                  </Box>
                                )}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", wordBreak: "break-all" }}
                              >
                                {c.email}
                              </Typography>
                            </Box>
                          </Stack>

                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            flexWrap="wrap"
                            useFlexGap
                            sx={{ pl: { xs: 6.5, sm: 0 }, width: { sm: 380 }, flexShrink: 0 }}
                          >
                            <Chip
                              size="small"
                              label={LIBELLE_GENRE[c.genre]}
                              sx={{
                                height: 22,
                                fontWeight: 600,
                                fontSize: 11.5,
                                bgcolor: c.genre === "sous_compte" ? "#EEF1F4" : BRAND_SOFT,
                                color: c.genre === "sous_compte" ? INK_MUTED : BRAND_DEEP,
                              }}
                            />
                            <Typography variant="caption" sx={{ color: INK_MUTED }}>
                              {c.droits === null
                                ? "Accès complet"
                                : `${c.droits.ecriture} écran${c.droits.ecriture > 1 ? "s" : ""} modifiable${
                                    c.droits.ecriture > 1 ? "s" : ""
                                  }, ${c.droits.lecture} en consultation`}
                            </Typography>
                            {c.bloque && (
                              <Chip
                                size="small"
                                label="Bloqué un moment (mots de passe faux)"
                                sx={{
                                  height: 22,
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  bgcolor: WARNING_SOFT,
                                  color: WARNING,
                                }}
                              />
                            )}
                          </Stack>

                          <Typography
                            variant="caption"
                            sx={{
                              color: c.derniereConnexion ? INK_MUTED : WARNING,
                              minWidth: { sm: 170 },
                              textAlign: { sm: "right" },
                              pl: { xs: 6.5, sm: 0 },
                            }}
                          >
                            {ilYa(c.derniereConnexion)}
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Stack>
          </Card>
        )}

        <DialogConfirmation
          ouvert={confirmerPartout}
          titre="Déconnecter tous vos appareils ?"
          texte="Toutes vos sessions se ferment, sur cet ordinateur aussi. Vous devrez vous reconnecter avec votre mot de passe."
          libelleAction="Déconnecter partout"
          destructif
          enCours={partoutEnCours}
          onConfirmer={deconnecterPartout}
          onAnnuler={() => setConfirmerPartout(false)}
        />
      </Box>
    </PageContainer>
  );
};

export default ProfilePage;
