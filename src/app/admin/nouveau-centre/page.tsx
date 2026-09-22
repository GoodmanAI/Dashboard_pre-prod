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
  Divider,
  FormControlLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { IconArrowLeft, IconArrowRight, IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import Horaires from "@/components/admin/nouveau-centre/Horaires";
import { ORDRE_PRODUITS, PRODUITS, type SlugProduit } from "@/lib/produits";
import type { Manque } from "@/lib/completude/types";
import {
  COMBOS,
  EXAMENS,
  libelleCombo,
  mailValide,
  numeroValide,
  reponsesVides,
  type ConduitePlanning,
  type ReponsesTalk,
} from "@/lib/questionnaireTalk";
import { INK, INK_MUTED, BORDER, BRAND } from "@/lib/jetons";

/**
 * Nouveau centre — l'assistant de mise en service (lots 4B et 4C, 15/09/2026).
 *
 * ## Ce qu'il remplace
 *
 * Mettre un client en service demandait douze étapes, deux outils et neuf écrans. Les
 * gestes existaient tous, mais rangés PAR GESTE et non par centre : il fallait les
 * connaître, et les faire dans le bon ordre.
 *
 * ## Il n'écrit rien lui-même
 *
 * Chaque étape appelle la route qui faisait déjà le travail, avec sa garde. Recopier une
 * garde ici créerait un second endroit où elle peut diverger, ce qui est exactement ce
 * qui a produit les trois écrans où l'on saisissait le même identifiant de cabinet.
 *
 * ## Chaque page enregistre seule
 *
 * Un assistant qui n'écrit qu'à la fin perd tout si on le quitte. Le compte existe dès la
 * première page ; les suivantes ne font que le compléter, et s'arrêter en route laisse un
 * centre incomplet mais cohérent, que l'écran d'installation reprend.
 *
 * ## Ce qu'il ne demande PAS, et c'est délibéré
 *
 * **Le module informationnel.** Ce contenu se rédige, il ne se coche pas : le mettre ici
 * ferait une page qu'on abandonne au milieu. Il est rappelé à la fin, avec le mapping
 * d'examens ; ce sont les deux seules choses que l'assistant ne peut pas faire à la place
 * du centre.
 *
 * Ni secret, ni consentement d'OCR cloud, ni `serviceEnabled`, ni `reconnaissance` : ce
 * sont des interrupteurs d'exploitation, pas des réglages d'installation.
 */

/**
 * Le style des boutons d'action.
 *
 * ⚠️ **`&:hover` n'est pas décoratif.** Poser `bgcolor` seul ne survit pas au survol ni
 * au focus : la règle de MUI pour l'état survolé porte sa propre couleur, plus
 * spécifique, et le bouton repasse au bleu du thème. Vu à l'écran le 15/09/2026.
 */
const BOUTON_ACTION = {
  textTransform: "none" as const,
  bgcolor: BRAND,
  "&:hover": { bgcolor: "var(--accent-press)" },
};

/**
 * Sept étapes, dont six à remplir.
 *
 * La demande était « max 5-6 pages ». La septième ne pose aucune question : elle dit ce
 * qui reste. La barre d'avancement ne la compte donc pas.
 */
const ETAPES = [
  "Identité",
  "Le centre",
  "Les examens",
  "Les horaires",
  "Le robot",
  "Raccordement",
  "Récapitulatif",
];

const DERNIERE_PAGE_A_REMPLIR = ETAPES.length - 1;

/** Un mot de passe lisible à dicter, et conforme à la politique du dépôt. */
function genererMotDePasse(): string {
  const maj = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const min = "abcdefghijkmnopqrstuvwxyz";
  const chiffres = "23456789";
  const speciaux = "!@#$%*";
  const tout = maj + min + chiffres + speciaux;
  const tirer = (s: string) => s[Math.floor(Math.random() * s.length)];
  // Une de chaque classe d'abord : la politique les exige toutes, et un tirage
  // purement aléatoire peut en oublier une.
  const base = [tirer(maj), tirer(min), tirer(chiffres), tirer(speciaux)];
  while (base.length < 14) base.push(tirer(tout));
  return base.sort(() => Math.random() - 0.5).join("");
}

type ProduitCree = { slug: SlugProduit; userProductId: number; libelle: string };

export default function NouveauCentrePage() {
  const { data: session, status } = useSession();
  const estSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const [etape, setEtape] = useState(0);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Page 1
  const [nom, setNom] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState(genererMotDePasse);
  const [produitsChoisis, setProduitsChoisis] = useState<SlugProduit[]>(["talk"]);
  const [catalogue, setCatalogue] = useState<{ id: number; slug: SlugProduit }[]>([]);
  /**
   * Le catalogue a-t-il fini d'être lu ?
   *
   * ⚠️ Sans ce drapeau, l'écran affichait « le catalogue n'a pas pu être lu, la création
   * échouera » PENDANT la lecture, c'est-à-dire à chaque ouverture. Une alerte qui
   * s'affiche puis disparaît toute seule apprend à ne plus lire les alertes. Vu à
   * l'écran le 15/09/2026.
   */
  const [catalogueLu, setCatalogueLu] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [produitsCrees, setProduitsCrees] = useState<ProduitCree[]>([]);

  // Pages 2 à 5
  const [rep, setRep] = useState<ReponsesTalk>(reponsesVides);

  // Page 6
  const [codesCentres, setCodesCentres] = useState("");
  /** Attribué par le Dashboard à l'affiliation (lot 4E). Affiché, jamais saisi. */
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [risBaseUrl, setRisBaseUrl] = useState("");
  const [risCodeSite, setRisCodeSite] = useState("");

  // Récapitulatif
  const [manques, setManques] = useState<Record<number, Manque[]>>({});

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/products");
        if (!r.ok) return; // le `finally` marquera quand même la lecture comme finie
        const liste = await r.json();
        const trouves: { id: number; slug: SlugProduit }[] = [];
        for (const slug of ORDRE_PRODUITS) {
          const p = (Array.isArray(liste) ? liste : []).find(
            (x: { name?: string }) =>
              (x.name ?? "").toLowerCase() === PRODUITS[slug].nom.toLowerCase()
          );
          if (p?.id) trouves.push({ id: Number(p.id), slug });
        }
        setCatalogue(trouves);
      } catch {
        /* le catalogue reste vide, la première page le dira */
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
    []
  );

  const konnect = produitsCrees.find((p) => p.slug === "konnect") ?? null;
  const talk = produitsCrees.find((p) => p.slug === "talk") ?? null;
  const acceptes = useMemo(
    () => EXAMENS.filter((e) => rep.examsAccepted[e.cle]),
    [rep.examsAccepted]
  );

  /**
   * Écrit dans `TalkSettings` les seuls champs passés.
   *
   * ⚠️ **On n'envoie QUE ce qu'on veut changer, et on ne relit rien pour fusionner.**
   * `POST /api/configuration` ignore les champs absents du corps (Prisma ignore les
   * `undefined`), donc la fusion est inutile. Et surtout elle serait DESTRUCTRICE : le
   * `GET` ne renvoie ni `reconnaissance`, ni `botName`, ni `emergencyOutOfHours`, ni
   * `callMode`, ni `specificNotes`. Un « je relis et je renvoie » les remettrait à vide.
   * C'est le défaut qu'avait la première version de cet écran.
   *
   * ⚠️ `reconnaissance` est le seul champ que la route EXIGE (400 sinon). On envoie
   * `false`, et c'est juste **ici seulement** : l'assistant n'écrit que sur un centre
   * qu'il vient de créer, dont la valeur par défaut en base est déjà `false`. Le même
   * code posé sur un centre existant écraserait un réglage.
   */
  const ecrireTalk = useCallback(
    async (champs: Record<string, unknown>, succes: string) => {
      if (!talk) return;
      await appeler(
        "/api/configuration",
        "POST",
        { userProductId: talk.userProductId, reconnaissance: false, ...champs },
        succes
      );
    },
    [talk, appeler]
  );

  /** Page 1 : le compte et ses produits. Tout le reste en dépend. */
  const creerLeCompte = async () => {
    const choisis = catalogue.filter((c) => produitsChoisis.includes(c.slug));
    if (choisis.length === 0) {
      setErreur("Choisissez au moins un produit.");
      return;
    }
    const d = await appeler(
      "/api/admin/create-client",
      "POST",
      {
        name: nom.trim(),
        email: identifiant.trim().toLowerCase(),
        password: motDePasse,
        products: choisis.map((c) => ({
          productId: c.id,
          assignedAt: new Date().toISOString(),
        })),
      },
      "Compte créé."
    );
    if (!d?.user?.id) return;

    // On relit les affiliations : `create-client` ne rend pas les `userProductId`, et
    // c'est eux qui identifient le centre dans tout le reste de l'assistant.
    const r = await fetch(`/api/admin/clients/${d.user.id}/products`);
    const liste = await r.json().catch(() => ({ rows: [] }));
    setUserId(d.user.id);
    setProduitsCrees(
      (liste.rows ?? [])
        .filter((x: any) => x.affilie && x.userProductId)
        .map((x: any) => ({
          slug: x.slug as SlugProduit,
          userProductId: x.userProductId as number,
          libelle: x.libelle as string,
        }))
    );
    // L'identifiant du cabinet est attribué par le Dashboard au moment de
    // l'affiliation : on le relève ici, on ne le demande plus.
    setTenantId(
      (liste.rows ?? []).find((x: any) => x.slug === "konnect")?.tenantId ?? null
    );
    setRep((p) => ({ ...p, centerName: nom.trim() }));
    setEtape(1);
  };

  /** Page 2 : les coordonnées, ce que le robot dit au patient qui demande où venir. */
  const enregistrerLeCentre = async () => {
    await ecrireTalk(
      {
        centerName: rep.centerName.trim(),
        address: rep.address.trim(),
        // ⚠️ Une seule colonne porte le code postal ET la ville.
        address2: rep.address2.trim(),
        centerPhone: rep.centerPhone.trim(),
        centerMail: rep.centerMail.trim(),
        centerWebsite: rep.centerWebsite.trim() || null,
      },
      "Coordonnées enregistrées."
    );
    if (konnect) {
      await appeler(
        `/api/konnect-configuration?userProductId=${konnect.userProductId}`,
        "PUT",
        { telephoneSecretariat: rep.centerPhone.trim() || null },
        "Téléphone du portail enregistré."
      );
    }
    setEtape(2);
  };

  /** Page 3 : les examens pris, et la conduite quand le planning est complet. */
  const enregistrerLesExamens = async () => {
    // Une conduite n'est écrite que pour un examen accepté : en garder une pour un
    // examen décoché laisserait une consigne qui ne s'applique à rien.
    const notes: Record<string, ConduitePlanning> = {};
    for (const e of acceptes) {
      notes[e.cle] = rep.fullPlanningNotes[e.cle] ?? { type: "fin_appel", message: "" };
    }
    await ecrireTalk(
      { examsAccepted: rep.examsAccepted, fullPlanningNotes: notes },
      "Examens enregistrés."
    );
    setEtape(3);
  };

  /** Page 4 : les horaires, qui vivent dans une AUTRE table et ont leur propre route. */
  const enregistrerLesHoraires = async () => {
    if (talk) {
      await appeler(
        "/api/configuration/informationnel/horaires",
        "POST",
        { userProductId: talk.userProductId, weeklyHours: rep.weeklyHours },
        "Horaires enregistrés."
      );
    }
    setEtape(4);
  };

  /**
   * Page 5 : ce que le robot demande au patient, et les doubles examens.
   *
   * ⚠️ `options` est une seule colonne JSON : l'écrire remplace l'objet ENTIER. On relit
   * donc l'existant pour ne pas perdre `serviceEnabled`, qui décide si le robot répond ou
   * transfère tous les appels, et qui ne se règle pas ici. C'est le seul endroit de
   * l'assistant où relire avant d'écrire est justifié.
   */
  const enregistrerLeRobot = async () => {
    if (talk) {
      let optionsActuelles: Record<string, unknown> = {};
      try {
        const r = await fetch(`/api/configuration?userProductId=${talk.userProductId}`);
        if (r.ok) {
          const d = await r.json();
          if (d?.options && typeof d.options === "object") optionsActuelles = d.options;
        }
      } catch {
        /* centre neuf : rien à préserver */
      }
      await ecrireTalk(
        {
          options: {
            ...optionsActuelles,
            motif: rep.motif,
            questions: rep.questions,
            menstruations: rep.menstruations,
          },
        },
        "Questions au patient enregistrées."
      );

      // Les doubles examens ont leur propre route, et son corps devient l'objet entier.
      if (Object.keys(rep.multiExamMapping).length > 0) {
        await appeler(
          `/api/configuration/mapping/double_exam?userProductId=${talk.userProductId}`,
          "POST",
          rep.multiExamMapping,
          "Doubles examens enregistrés."
        );
      }
    }
    setEtape(5);
  };

  /** Page 6 : ce qui relie le centre au reste de l'écosystème. */
  const enregistrerRaccordement = async () => {
    if (talk) {
      for (const code of codesCentres.split(",").map((c) => c.trim()).filter(Boolean)) {
        await appeler(
          "/api/external-center-mapping",
          "POST",
          { userProductId: talk.userProductId, externalCenterCode: code },
          `Code ${code} rattaché.`
        );
      }
    }
    if (konnect && (risBaseUrl.trim() || risCodeSite.trim())) {
      await appeler(
        `/api/product-config?userProductId=${konnect.userProductId}&domaine=konnect.ris-identite`,
        "PUT",
        {
          valeur: {
            base_url: risBaseUrl.trim().replace(/\/+$/, ""),
            code_site: risCodeSite.trim(),
          },
        },
        "Logiciel du centre rattaché."
      );
    }
    setEtape(6);
  };

  const chargerManques = useCallback(async () => {
    const parProduit: Record<number, Manque[]> = {};
    for (const p of produitsCrees) {
      try {
        const r = await fetch(`/api/completude?userProductId=${p.userProductId}`);
        if (!r.ok) continue;
        const d = await r.json();
        parProduit[p.userProductId] = d?.manques ?? [];
      } catch {
        /* on affiche ce qu'on a */
      }
    }
    setManques(parProduit);
  }, [produitsCrees]);

  useEffect(() => {
    if (etape === 6) void chargerManques();
  }, [etape, chargerManques]);

  const passerEnProduction = async () => {
    for (const p of produitsCrees) {
      await appeler(
        "/api/centre-statut",
        "PUT",
        { userProductId: p.userProductId, statut: "production" },
        `${p.libelle} passé en production.`
      );
    }
    await chargerManques();
  };

  const bloquants = useMemo(
    () => Object.values(manques).flat().filter((m) => m.criticite === "bloquant"),
    [manques]
  );

  /** Les combinaisons dont les DEUX membres sont pratiqués par ce centre. */
  const combosPossibles = useMemo(() => {
    const mots = new Set(acceptes.map((e) => e.combo));
    // `echomammaire` n'est pas un examen du catalogue : il n'a de sens qu'avec la
    // mammographie, on le propose donc dès qu'elle est pratiquée.
    if (mots.has("mammographie")) mots.add("echomammaire");
    return COMBOS.filter((c) => mots.has(c.a) && mots.has(c.b));
  }, [acceptes]);

  const centreComplet =
    rep.centerName.trim() !== "" &&
    rep.address.trim() !== "" &&
    rep.address2.trim() !== "" &&
    numeroValide(rep.centerPhone) &&
    mailValide(rep.centerMail);

  if (status === "loading") {
    return (
      <PageContainer title="Nouveau centre" description="Mise en service">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Nouveau centre" description="Mettre un client en service">
      <Box>
        <SectionHeader
          title="Nouveau centre"
          subtitle="Six pages, pas une de plus. Chacune s'enregistre seule, et vous pouvez en passer."
        />

        {!estSuperAdmin && (
          <Alert severity="warning" sx={{ mb: 2, maxWidth: 880 }}>
            Créer un compte client demande un accès super administrateur. Vous pouvez suivre
            les étapes, mais la création échouera.
          </Alert>
        )}

        {/*
          L'avancement est en haut, et il est double : les noms des pages disent où l'on
          est, la barre dit combien il en reste. La demande portait exactement là-dessus,
          « faire comprendre que ce ne sera pas long ».
        */}
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
          <Alert severity="error" sx={{ mb: 2, maxWidth: 880 }} onClose={() => setErreur(null)}>
            {erreur}
          </Alert>
        )}

        <Card sx={{ p: 3, border: `1px solid ${BORDER}`, maxWidth: 880 }}>
          {/* ───────────────────────────── 1. Identité ───────────────────────────── */}
          {etape === 0 && (
            <Stack spacing={2.5} sx={{ maxWidth: 560 }}>
              <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                Le compte existe dès cette page. Les suivantes ne font que le compléter.
              </Typography>
              <TextField
                label="Nom du centre"
                size="small"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                helperText="Deux centres peuvent porter le même nom."
              />
              <TextField
                label="Identifiant de connexion"
                size="small"
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
                helperText="Unique. C'est ce que le client saisira pour se connecter."
              />
              {/*
                Les deux boutons sont SOUS le champ, pas dedans. Placés en `endAdornment`,
                ils lui prenaient la moitié de sa largeur : un mot de passe de quatorze
                caractères touchait déjà « Régénérer », et l'administrateur ne pouvait pas
                relire en entier ce qu'il doit dicter au client. Vu à l'écran le 15/09/2026.
              */}
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
                    onClick={() => void navigator.clipboard?.writeText(motDePasse)}
                  >
                    Copier
                  </Button>
                </Stack>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, mb: 0.5 }}>
                  Produits
                </Typography>
                {ORDRE_PRODUITS.map((slug) => (
                  <FormControlLabel
                    key={slug}
                    control={
                      <Checkbox
                        checked={produitsChoisis.includes(slug)}
                        onChange={(_, v) =>
                          setProduitsChoisis((p) =>
                            v ? [...p, slug] : p.filter((s) => s !== slug)
                          )
                        }
                      />
                    }
                    label={PRODUITS[slug].libelle}
                  />
                ))}
                {catalogueLu && catalogue.length === 0 && (
                  <Typography sx={{ fontSize: 12, color: "#B3261E" }}>
                    Le catalogue des produits n&apos;a pas pu être lu. La création échouera.
                  </Typography>
                )}
              </Box>
              <Suite
                etape={etape}
                occupe={occupe}
                onRetour={() => setEtape((e) => Math.max(0, e - 1))}
                onSuivant={() => void creerLeCompte()}
                libelle="Créer le compte"
                actif={catalogueLu && nom.trim() !== "" && identifiant.trim().length >= 3}
              />
            </Stack>
          )}

          {/* ───────────────────────────── 2. Le centre ──────────────────────────── */}
          {etape === 1 && (
            <Stack spacing={2.5} sx={{ maxWidth: 620 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                  Les informations du centre
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                  C&apos;est ce que le robot dira au patient qui demande où se rendre. Tout
                  est obligatoire, sauf le site web.
                </Typography>
              </Box>
              <TextField
                label="Nom du centre"
                size="small"
                required
                value={rep.centerName}
                onChange={(e) => setRep((p) => ({ ...p, centerName: e.target.value }))}
              />
              <TextField
                label="Adresse"
                size="small"
                required
                value={rep.address}
                onChange={(e) => setRep((p) => ({ ...p, address: e.target.value }))}
              />
              <TextField
                label="Code postal et ville"
                size="small"
                required
                value={rep.address2}
                onChange={(e) => setRep((p) => ({ ...p, address2: e.target.value }))}
                helperText="Les deux dans le même champ, par exemple : 56300 Pontivy"
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Téléphone du centre"
                  size="small"
                  fullWidth
                  required
                  value={rep.centerPhone}
                  onChange={(e) => setRep((p) => ({ ...p, centerPhone: e.target.value }))}
                  error={rep.centerPhone !== "" && !numeroValide(rep.centerPhone)}
                  helperText="Dix chiffres, par exemple 0298952121"
                />
                <TextField
                  label="Adresse mail"
                  size="small"
                  fullWidth
                  required
                  value={rep.centerMail}
                  onChange={(e) => setRep((p) => ({ ...p, centerMail: e.target.value }))}
                  error={rep.centerMail !== "" && !mailValide(rep.centerMail)}
                />
              </Stack>
              <TextField
                label="Site web"
                size="small"
                value={rep.centerWebsite}
                onChange={(e) => setRep((p) => ({ ...p, centerWebsite: e.target.value }))}
                helperText="Facultatif."
              />
              <Suite
                etape={etape}
                occupe={occupe}
                onRetour={() => setEtape((e) => Math.max(0, e - 1))}
                onSuivant={() => void enregistrerLeCentre()}
                onPasser={() => setEtape(2)}
                actif={centreComplet}
              />
            </Stack>
          )}

          {/* ───────────────────────────── 3. Les examens ────────────────────────── */}
          {etape === 2 && (
            <Stack spacing={2.5} sx={{ maxWidth: 680 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                  Quels examens le centre confie-t-il au robot ?
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 1 }}>
                  Le robot ne prendra de rendez-vous que pour les examens cochés.
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap" }}>
                  {EXAMENS.map((e) => (
                    <FormControlLabel
                      key={e.cle}
                      control={
                        <Checkbox
                          checked={rep.examsAccepted[e.cle]}
                          onChange={(_, v) =>
                            setRep((p) => ({
                              ...p,
                              examsAccepted: { ...p.examsAccepted, [e.cle]: v },
                            }))
                          }
                        />
                      }
                      label={e.libelle}
                    />
                  ))}
                </Stack>
              </Box>

              {acceptes.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                      Et quand il n&apos;y a plus de créneau ?
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 1.5 }}>
                      Ce que le robot fait quand le planning est complet, examen par examen.
                    </Typography>
                    <Stack spacing={1.5}>
                      {acceptes.map((e) => {
                        const c: ConduitePlanning = rep.fullPlanningNotes[e.cle] ?? {
                          type: "fin_appel",
                          message: "",
                        };
                        const majConduite = (v: ConduitePlanning) =>
                          setRep((p) => ({
                            ...p,
                            fullPlanningNotes: { ...p.fullPlanningNotes, [e.cle]: v },
                          }));
                        return (
                          <Box
                            key={e.cle}
                            sx={{ border: `1px solid ${BORDER}`, borderRadius: 1.5, p: 1.5 }}
                          >
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                              {e.libelle}
                            </Typography>
                            <RadioGroup
                              row
                              value={c.type}
                              onChange={(_, v) =>
                                // Changer de conduite réinitialise l'autre champ : garder
                                // un numéro sous une fin d'appel laisserait une valeur que
                                // rien ne lit, et qui réapparaîtrait si on revient.
                                majConduite(
                                  v === "redirection"
                                    ? { type: "redirection", phone: "" }
                                    : { type: "fin_appel", message: "" }
                                )
                              }
                            >
                              <FormControlLabel
                                value="redirection"
                                control={<Radio size="small" />}
                                label={
                                  <Typography sx={{ fontSize: 13 }}>
                                    Transférer vers un numéro
                                  </Typography>
                                }
                              />
                              <FormControlLabel
                                value="fin_appel"
                                control={<Radio size="small" />}
                                label={
                                  <Typography sx={{ fontSize: 13 }}>
                                    Terminer l&apos;appel avec un message
                                  </Typography>
                                }
                              />
                            </RadioGroup>
                            {c.type === "redirection" ? (
                              <TextField
                                size="small"
                                fullWidth
                                label="Numéro de transfert"
                                value={c.phone}
                                onChange={(ev) =>
                                  majConduite({ type: "redirection", phone: ev.target.value })
                                }
                                error={c.phone !== "" && !numeroValide(c.phone)}
                                helperText="Dix chiffres."
                              />
                            ) : (
                              <TextField
                                size="small"
                                fullWidth
                                multiline
                                minRows={2}
                                label="Ce que le robot dit avant de raccrocher"
                                value={c.message}
                                onChange={(ev) =>
                                  majConduite({ type: "fin_appel", message: ev.target.value })
                                }
                              />
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                </>
              )}

              <Suite
                etape={etape}
                occupe={occupe}
                onRetour={() => setEtape((e) => Math.max(0, e - 1))}
                onSuivant={() => void enregistrerLesExamens()}
                onPasser={() => setEtape(3)}
                actif={acceptes.length > 0}
              />
            </Stack>
          )}

          {/* ───────────────────────────── 4. Les horaires ───────────────────────── */}
          {etape === 3 && (
            <Stack spacing={2} sx={{ maxWidth: 720 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                  Les horaires d&apos;ouverture
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                  Remplissez le lundi, puis reportez-le jusqu&apos;au vendredi d&apos;un
                  clic. Chaque jour reste modifiable après, pour le samedi matin par exemple.
                </Typography>
              </Box>
              <Horaires
                valeur={rep.weeklyHours}
                onChange={(v) => setRep((p) => ({ ...p, weeklyHours: v }))}
              />
              <Suite
                etape={etape}
                occupe={occupe}
                onRetour={() => setEtape((e) => Math.max(0, e - 1))}
                onSuivant={() => void enregistrerLesHoraires()}
                onPasser={() => setEtape(4)}
              />
            </Stack>
          )}

          {/* ───────────────────────────── 5. Le robot ───────────────────────────── */}
          {etape === 4 && (
            <Stack spacing={2.5} sx={{ maxWidth: 680 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK, mb: 1 }}>
                  Ce que le robot demande au patient
                </Typography>
                <Stack spacing={1.25}>
                  <Reglage
                    titre="Le motif écrit sur l'ordonnance"
                    aide="Le robot le demande, et il est noté dans le commentaire du rendez-vous."
                    actif={rep.motif}
                    onChange={(v) => setRep((p) => ({ ...p, motif: v }))}
                  />
                  <Reglage
                    titre="Les questions avant le rendez-vous"
                    aide="Posées en fin d'appel pour préparer la venue. Les réponses vont aussi dans le commentaire."
                    actif={rep.questions}
                    onChange={(v) => setRep((p) => ({ ...p, questions: v }))}
                  />
                  <Reglage
                    titre="La date des dernières règles, pour une mammographie"
                    aide="Permet de proposer un créneau à une période moins douloureuse."
                    actif={rep.menstruations}
                    onChange={(v) => setRep((p) => ({ ...p, menstruations: v }))}
                    desactive={!rep.examsAccepted.mammo}
                    raisonDesactive="Le centre ne fait pas de mammographie."
                  />
                </Stack>
              </Box>

              <Divider />
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                  Les examens pris dans la même visite
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 1 }}>
                  Cochez les paires que le centre accepte d&apos;enchaîner pour un même
                  patient. Seules les combinaisons qu&apos;il pratique sont proposées.
                </Typography>
                {combosPossibles.length === 0 ? (
                  <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                    Il faut au moins deux examens cochés à la page précédente pour
                    qu&apos;une combinaison soit possible.
                  </Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {combosPossibles.map((c) => (
                      <FormControlLabel
                        key={c.cle}
                        control={
                          <Checkbox
                            checked={Boolean(rep.multiExamMapping[c.cle]?.enabled)}
                            onChange={(_, coche) =>
                              setRep((p) => ({
                                ...p,
                                multiExamMapping: {
                                  ...p.multiExamMapping,
                                  // ⚠️ `mode` n'est PAS « activé ou non ». Il dit comment
                                  // le rendez-vous s'écrit dans le logiciel du centre :
                                  // « single » = un examen plus un commentaire, « double »
                                  // = deux examens distincts. L'assistant ne peut pas le
                                  // deviner, il laisse donc la valeur par défaut de
                                  // l'écran dédié, qui est la plus prudente.
                                  [c.cle]: { enabled: coche, mode: "single" },
                                },
                              }))
                            }
                          />
                        }
                        label={<Typography sx={{ fontSize: 13 }}>{libelleCombo(c)}</Typography>}
                      />
                    ))}
                  </Stack>
                )}
                {combosPossibles.length > 0 && (
                  <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 1 }}>
                    Une paire cochée est enregistrée en un seul rendez-vous avec un
                    commentaire. Pour qu&apos;elle crée deux rendez-vous distincts dans le
                    logiciel du centre, changez le mode sur l&apos;écran des multi-examens.
                  </Typography>
                )}
              </Box>

              <Suite
                etape={etape}
                occupe={occupe}
                onRetour={() => setEtape((e) => Math.max(0, e - 1))}
                onSuivant={() => void enregistrerLeRobot()}
                onPasser={() => setEtape(5)}
              />
            </Stack>
          )}

          {/* ───────────────────────────── 6. Raccordement ───────────────────────── */}
          {etape === 5 && (
            <Stack spacing={2.5} sx={{ maxWidth: 620 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                  Le raccordement
                </Typography>
                <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                  Ce qui relie le centre au reste : son logiciel de gestion, et son portail.
                </Typography>
              </Box>
              {talk && (
                <TextField
                  label="Codes centres du robot"
                  size="small"
                  value={codesCentres}
                  onChange={(e) => setCodesCentres(e.target.value)}
                  helperText="Séparés par des virgules. Ce sont les codes que le logiciel du centre emploie."
                />
              )}
              {konnect && (
                <>
                  {/*
                    ⚠️ CE CHAMP NE SE SAISIT PLUS (lot 4E, 15/09/2026). L'identifiant du
                    cabinet naissait chez le portail, se relevait par curl et se
                    recopiait ici : le Dashboard l'attribue maintenant à l'affiliation,
                    et le portail vient le lire. Il n'y a donc plus rien à taper, et plus
                    de copier-coller à rater.
                  */}
                  <Box
                    sx={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: 1.5,
                      p: 1.5,
                      bgcolor: "#FAFBFC",
                    }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                      Identifiant du cabinet dans le portail
                    </Typography>
                    <Typography
                      sx={{ fontSize: 13, fontFamily: "monospace", color: INK, mt: 0.5 }}
                    >
                      {tenantId ?? "pas encore attribué"}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 0.5 }}>
                      Attribué automatiquement. Le portail crée le cabinet de son côté à sa
                      prochaine synchronisation, vous n&apos;avez rien à saisir.
                    </Typography>
                  </Box>
                  <TextField
                    label="Adresse de la passerelle"
                    size="small"
                    value={risBaseUrl}
                    onChange={(e) => setRisBaseUrl(e.target.value)}
                  />
                  <TextField
                    label="Code site"
                    size="small"
                    value={risCodeSite}
                    onChange={(e) => setRisCodeSite(e.target.value)}
                  />
                  <Alert severity="info" sx={{ fontSize: 13 }}>
                    Le portail ne se connectera au logiciel du centre qu&apos;une fois son
                    identifiant de connexion renseigné dans son espace technique. Ce secret
                    ne passe pas par ici.
                  </Alert>
                </>
              )}
              <Suite
                etape={etape}
                occupe={occupe}
                onRetour={() => setEtape((e) => Math.max(0, e - 1))}
                onSuivant={() => void enregistrerRaccordement()}
                onPasser={() => setEtape(6)}
                libelle="Enregistrer et terminer"
              />
            </Stack>
          )}

          {/* ───────────────────────────── 7. Récapitulatif ──────────────────────── */}
          {etape === 6 && (
            <Stack spacing={2} sx={{ maxWidth: 780 }}>
              <Alert severity="info" icon={false}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 0.75 }}>
                  Deux choses restent à faire, et l&apos;assistant ne peut pas les faire à
                  votre place.
                </Typography>
                <Typography sx={{ fontSize: 13, mb: 0.75 }}>
                  <strong>Le mapping des examens.</strong> Saisissez en face de chaque ligne
                  le code que le logiciel du centre emploie. Sans lui, le robot annonce au
                  patient un examen qu&apos;il ne sait pas réserver. La liste se télécharge
                  en tableur et se réimporte, pour la faire remplir par le secrétariat.
                </Typography>
                <Typography sx={{ fontSize: 13 }}>
                  <strong>Le module informationnel.</strong> Les questions fréquentes, la
                  préparation des examens, les tarifs. Sans lui, le robot ne saura répondre à
                  aucune question d&apos;information.
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}>
                  {produitsCrees.map((p) => (
                    <Button
                      key={p.userProductId}
                      size="small"
                      variant="outlined"
                      href={
                        p.slug === "talk"
                          ? `/client/c/${userId}/talk/parametrage/mapping_exam`
                          : `/client/c/${userId}/konnect/examens`
                      }
                    >
                      Mapping {p.libelle}
                    </Button>
                  ))}
                  {talk && (
                    <Button
                      size="small"
                      variant="outlined"
                      href={`/client/c/${userId}/talk/informationnel`}
                    >
                      Questions fréquentes
                    </Button>
                  )}
                </Stack>
              </Alert>

              <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                Et voici ce que le registre de complétude signale encore. C&apos;est le même
                verdict que celui affiché au client.
              </Typography>

              {produitsCrees.map((p) => {
                const liste = manques[p.userProductId] ?? [];
                return (
                  <Box
                    key={p.userProductId}
                    sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, p: 2 }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                      <Typography sx={{ fontWeight: 700, color: INK }}>{p.libelle}</Typography>
                      <Chip
                        size="small"
                        label={liste.length === 0 ? "Rien ne manque" : `${liste.length} à faire`}
                        color={liste.length === 0 ? "success" : "default"}
                      />
                    </Stack>
                    {liste.length === 0 ? (
                      <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
                        Ce produit est prêt.
                      </Typography>
                    ) : (
                      <Stack spacing={0.75}>
                        {liste.map((m) => (
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
                                bgcolor: m.criticite === "bloquant" ? "#B3261E" : "#F5A623",
                              }}
                            />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
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
                    )}
                  </Box>
                );
              })}

              <Alert severity={bloquants.length > 0 ? "warning" : "success"}>
                {bloquants.length > 0
                  ? `${bloquants.length} point(s) bloquant(s) avant que le centre puisse prendre des patients.`
                  : "Rien ne bloque la mise en service."}
              </Alert>

              <Stack direction="row" spacing={1}>
                <Button
                  disabled={occupe}
                  startIcon={<IconArrowLeft size={15} />}
                  onClick={() => setEtape(5)}
                >
                  Retour
                </Button>
                <Button
                  variant="contained"
                  disableElevation
                  disabled={occupe}
                  startIcon={<IconCheck size={16} />}
                  onClick={() => void passerEnProduction()}
                  sx={BOUTON_ACTION}
                >
                  Passer en production
                </Button>
                <Button href="/admin/comptes">
                  Voir la fiche du client
                </Button>
              </Stack>
              <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                Tant qu&apos;un centre est en intégration, les informations manquantes ne
                déclenchent aucune alerte chez le client.
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

/**
 * Le pied de page d'une étape.
 *
 * ⚠️ Déclaré AU NIVEAU DU MODULE, pas dans le composant parent. Une fonction définie
 * dans le corps du rendu est une nouvelle référence à chaque frappe : React démonte et
 * remonte l'arbre, ce qui fait perdre le focus au champ en cours de saisie.
 */
function Suite({
  etape,
  occupe,
  onRetour,
  onSuivant,
  onPasser,
  libelle = "Enregistrer et continuer",
  actif = true,
}: {
  etape: number;
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
      {etape > 0 && (
        <Button
          startIcon={<IconArrowLeft size={15} />}
          disabled={occupe}
          onClick={onRetour}
        >
          Retour
        </Button>
      )}
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

/** Un interrupteur avec son explication, comme sur l'écran de paramétrage. */
function Reglage({
  titre,
  aide,
  actif,
  onChange,
  desactive,
  raisonDesactive,
}: {
  titre: string;
  aide: string;
  actif: boolean;
  onChange: (v: boolean) => void;
  desactive?: boolean;
  raisonDesactive?: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 1.5,
        borderRadius: 1.5,
        border: `1px solid ${BORDER}`,
        bgcolor: desactive ? "#FAFBFC" : "transparent",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ fontSize: 13, fontWeight: 600, color: desactive ? INK_MUTED : INK }}
        >
          {titre}
        </Typography>
        <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
          {desactive ? (raisonDesactive ?? aide) : aide}
        </Typography>
      </Box>
      <Switch
        checked={actif && !desactive}
        disabled={desactive}
        onChange={(_, v) => onChange(v)}
      />
    </Box>
  );
}
