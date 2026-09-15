"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { IconDownload, IconUpload, IconCheck } from "@tabler/icons-react";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import { lireClasseur, telechargerClasseur, type Feuille } from "@/lib/pack/classeur";
import { ONGLETS, type Constat, type Ecriture } from "@/lib/pack/domaines";
import type { Pack } from "@/lib/pack/types";

/**
 * Le pack de configuration : exporter un centre, le remplir, le rendre (lot 4D).
 *
 * ## Ce que ça remplace
 *
 * Installer un centre demandait de remplir onze écrans à la main, et ouvrir un centre
 * frère du même groupe demandait de tout refaire. Le pack fait les deux : un classeur
 * par centre, qu'on remplit hors ligne et qu'on rend, ou qu'on prend chez un centre
 * modèle pour le poser sur un centre neuf.
 *
 * ## Il n'écrit rien lui-même
 *
 * Chaque onglet est appliqué par la route qui faisait déjà le travail, avec sa garde.
 * Cet écran ne fait que lire, rapprocher, montrer, puis appeler. C'est la même règle que
 * pour l'assistant de mise en service et l'écran des comptes.
 *
 * ## Rien n'est écrit avant que le rapport soit lu
 *
 * Le fichier est rapproché de l'état courant DANS LE NAVIGATEUR, le rapport dit onglet
 * par onglet ce qui va changer, et l'écriture n'part qu'au clic. Un import qui
 * écrirait directement priverait l'administrateur de la seule chose qui compte : voir
 * ce qui va changer avant que ça change.
 *
 * ## Une absence n'efface jamais
 *
 * Cellule vide, colonne absente, ligne absente, onglet absent : rien de tout cela n'est
 * lu comme une intention de supprimer. Voir `src/lib/pack/domaines.ts`.
 */

const BRAND = "var(--accent)";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";

const BOUTON_ACTION = {
  textTransform: "none" as const,
  bgcolor: BRAND,
  "&:hover": { bgcolor: "var(--accent-press)" },
};

type Client = { userId: number; nom: string | null; identifiant: string };

type RapportOnglet = Constat & { onglet: string; produit: string };

/** Un nom de fichier qui dit de qui vient le pack, et de quand. */
function nomDeFichier(client: Client | undefined): string {
  const base = (client?.nom ?? client?.identifiant ?? "centre")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const jour = new Date().toISOString().slice(0, 10);
  return `pack-${base || "centre"}-${jour}.xlsx`;
}

export default function PackPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [sourceId, setSourceId] = useState<number | "">("");
  const [cibleId, setCibleId] = useState<number | "">("");

  const [rapports, setRapports] = useState<RapportOnglet[] | null>(null);
  const [onglestAbsents, setOngletsAbsents] = useState<string[]>([]);
  const [nomFichierLu, setNomFichierLu] = useState<string | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/clients-comptes");
        if (!r.ok) {
          setErreur("La liste des clients n'a pas pu être lue.");
          return;
        }
        const d = await r.json();
        setClients(
          (d.lignes ?? []).map((l: any) => ({
            userId: l.userId,
            nom: l.nom,
            identifiant: l.identifiant,
          }))
        );
      } catch {
        setErreur("Impossible de joindre le serveur.");
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const lirePack = useCallback(async (userId: number): Promise<Pack | null> => {
    const r = await fetch(`/api/admin/pack?userId=${userId}`);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErreur(d?.error ?? "La configuration du centre n'a pas pu être lue.");
      return null;
    }
    return (await r.json()) as Pack;
  }, []);

  const exporter = async () => {
    if (sourceId === "") return;
    setOccupe(true);
    setErreur(null);
    try {
      const pack = await lirePack(Number(sourceId));
      if (!pack) return;
      const feuilles: Feuille[] = [];
      for (const onglet of ONGLETS) {
        const lignes = onglet.exporter(pack);
        // Un onglet d'un produit que le centre n'a pas est ABSENT du classeur, pas vide :
        // une feuille vide se remplirait, et l'import n'aurait nulle part où l'écrire.
        if (lignes === null) continue;
        feuilles.push({ nom: onglet.nom, colonnes: onglet.colonnes, lignes });
      }
      if (feuilles.length === 0) {
        setErreur("Ce client n'a aucun produit affilié : il n'y a rien à exporter.");
        return;
      }
      await telechargerClasseur(
        feuilles,
        nomDeFichier(clients.find((c) => c.userId === Number(sourceId)))
      );
      setSucces(`Classeur de ${feuilles.length} onglets téléchargé.`);
    } finally {
      setOccupe(false);
    }
  };

  const rapprocher = async (fichier: File) => {
    if (cibleId === "") return;
    setOccupe(true);
    setErreur(null);
    setRapports(null);
    try {
      const [feuilles, pack] = await Promise.all([lireClasseur(fichier), lirePack(Number(cibleId))]);
      if (!pack) return;

      const resultats: RapportOnglet[] = [];
      const absents: string[] = [];
      for (const onglet of ONGLETS) {
        const feuille = feuilles.get(onglet.nom);
        if (!feuille) {
          // Un onglet absent du fichier ne change rien. On le dit quand même : un
          // classeur tronqué ne doit pas passer pour complet.
          if (onglet.exporter(pack) !== null) absents.push(onglet.nom);
          continue;
        }
        const constat = onglet.importer(feuille.lignes, feuille.colonnes, pack);
        if (constat === null) {
          absents.push(`${onglet.nom} (le centre n'a pas ce produit)`);
          continue;
        }
        resultats.push({ ...constat, onglet: onglet.nom, produit: onglet.produit });
      }
      setNomFichierLu(fichier.name);
      setOngletsAbsents(absents);
      setRapports(resultats);
    } catch {
      setErreur("Fichier illisible. Attendu : un classeur .xlsx.");
    } finally {
      setOccupe(false);
    }
  };

  const ecritures: Ecriture[] = useMemo(
    () => (rapports ?? []).flatMap((r) => r.ecritures),
    [rapports]
  );
  const totalModifie = useMemo(
    () => (rapports ?? []).reduce((n, r) => n + r.modifiees, 0),
    [rapports]
  );

  const appliquer = async () => {
    setOccupe(true);
    setErreur(null);
    const echecs: string[] = [];
    try {
      // En SÉRIE, jamais en parallèle. Deux onglets peuvent viser la même table
      // (`Centre` et `Examens` écrivent tous deux `TalkSettings`), et deux écritures
      // concurrentes y laisseraient la dernière arrivée écraser l'autre.
      for (const e of ecritures) {
        const r = await fetch(e.url, {
          method: e.methode,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(e.corps),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          echecs.push(`${e.url.split("?")[0]} : ${d?.error ?? r.status}`);
        }
      }
      if (echecs.length > 0) {
        setErreur(
          `${ecritures.length - echecs.length} écriture(s) appliquée(s), ${echecs.length} refusée(s). ` +
            echecs.slice(0, 3).join(" · ")
        );
      } else {
        setSucces(`${ecritures.length} onglet(s) appliqué(s).`);
      }
      setRapports(null);
    } finally {
      setOccupe(false);
    }
  };

  if (chargement) {
    return (
      <PageContainer title="Pack de configuration" description="Exporter et importer un centre">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Box>
      </PageContainer>
    );
  }

  const nomClient = (c: Client) => c.nom?.trim() || c.identifiant;

  return (
    <PageContainer title="Pack de configuration" description="Exporter et importer la configuration d'un centre">
      <Box>
        <SectionHeader
          title="Pack de configuration"
          subtitle="Un classeur par centre. Exportez-le pour le faire remplir, ou prenez celui d'un centre modèle pour installer un centre neuf."
        />

        {erreur && (
          <Alert severity="error" sx={{ mb: 2, maxWidth: 900 }} onClose={() => setErreur(null)}>
            {erreur}
          </Alert>
        )}
        {succes && (
          <Alert severity="success" sx={{ mb: 2, maxWidth: 900 }} onClose={() => setSucces(null)}>
            {succes}
          </Alert>
        )}

        <Stack spacing={2} sx={{ maxWidth: 900 }}>
          {/* ─────────────────────── Exporter ─────────────────────── */}
          <Card sx={{ p: 3, border: `1px solid ${BORDER}` }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK, mb: 0.5 }}>
              Exporter un centre
            </Typography>
            <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 2 }}>
              Le classeur porte tout ce qui se configure. Ni secret, ni identifiant de
              cabinet, ni consentement : ces choses-là ne se recopient pas.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: "center" }}>
              <TextField
                select
                size="small"
                label="Centre"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value === "" ? "" : Number(e.target.value))}
                sx={{ minWidth: 320 }}
              >
                {clients.map((c) => (
                  <MenuItem key={c.userId} value={c.userId}>
                    {nomClient(c)}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                disableElevation
                disabled={occupe || sourceId === ""}
                startIcon={<IconDownload size={16} />}
                onClick={() => void exporter()}
                sx={BOUTON_ACTION}
              >
                Télécharger le classeur
              </Button>
            </Stack>
          </Card>

          {/* ─────────────────────── Importer ─────────────────────── */}
          <Card sx={{ p: 3, border: `1px solid ${BORDER}` }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK, mb: 0.5 }}>
              Appliquer un classeur à un centre
            </Typography>
            <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 2 }}>
              Rien n&apos;est enregistré tant que vous n&apos;avez pas lu le rapport. Une
              case vide, une colonne ou une ligne absente ne suppriment jamais rien.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: "center" }}>
              <TextField
                select
                size="small"
                label="Centre à configurer"
                value={cibleId}
                onChange={(e) => {
                  setCibleId(e.target.value === "" ? "" : Number(e.target.value));
                  setRapports(null);
                }}
                sx={{ minWidth: 320 }}
              >
                {clients.map((c) => (
                  <MenuItem key={c.userId} value={c.userId}>
                    {nomClient(c)}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                disabled={occupe || cibleId === ""}
                startIcon={<IconUpload size={16} />}
                onClick={() => champFichier.current?.click()}
                sx={{ textTransform: "none" }}
              >
                Choisir un classeur
              </Button>
              <input
                ref={champFichier}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Sans cette remise à zéro, réimporter le même fichier après
                  // correction ne déclenche aucun événement.
                  e.target.value = "";
                  if (f) void rapprocher(f);
                }}
              />
            </Stack>
          </Card>

          {/* ─────────────────────── Le rapport ─────────────────────── */}
          {rapports && (
            <Card sx={{ p: 3, border: `1px solid ${BORDER}` }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>
                Ce qui va changer
              </Typography>
              <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 2 }}>
                {nomFichierLu}, rapproché de la configuration actuelle du centre.
              </Typography>

              <Stack spacing={1}>
                {rapports.map((r) => (
                  <Box
                    key={r.onglet}
                    sx={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: 1.5,
                      p: 1.5,
                      bgcolor: r.modifiees > 0 ? "rgba(var(--accent-rgb), 0.05)" : "transparent",
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.25 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                        {r.onglet}
                      </Typography>
                      <Chip
                        size="small"
                        label={
                          r.modifiees > 0
                            ? `${r.modifiees} modification${r.modifiees > 1 ? "s" : ""}`
                            : "Rien à changer"
                        }
                        color={r.modifiees > 0 ? "primary" : "default"}
                      />
                      <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                        {r.lues} ligne{r.lues > 1 ? "s" : ""} lue{r.lues > 1 ? "s" : ""}
                      </Typography>
                    </Stack>
                    {r.colonnesManquantes.length > 0 && (
                      <Typography sx={{ fontSize: 12, color: INK_MUTED }}>
                        Colonnes absentes du fichier, laissées en place :{" "}
                        {r.colonnesManquantes.join(", ")}
                      </Typography>
                    )}
                    {r.inconnues.length > 0 && (
                      <Typography sx={{ fontSize: 12, color: "#B26A00" }}>
                        Ignorées, elles ne correspondent à rien : {r.inconnues.slice(0, 6).join(" · ")}
                        {r.inconnues.length > 6 ? ` et ${r.inconnues.length - 6} autre(s)` : ""}
                      </Typography>
                    )}
                    {r.remarques.map((m, i) => (
                      <Typography key={i} sx={{ fontSize: 12, color: INK_MUTED }}>
                        {m}
                      </Typography>
                    ))}
                  </Box>
                ))}
              </Stack>

              {onglestAbsents.length > 0 && (
                <Alert severity="info" sx={{ mt: 2, fontSize: 13 }}>
                  Onglets absents du fichier, donc inchangés : {onglestAbsents.join(", ")}.
                </Alert>
              )}

              <Divider sx={{ my: 2 }} />

              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button
                  variant="contained"
                  disableElevation
                  disabled={occupe || totalModifie === 0}
                  startIcon={<IconCheck size={16} />}
                  onClick={() => void appliquer()}
                  sx={BOUTON_ACTION}
                >
                  {totalModifie === 0
                    ? "Rien à appliquer"
                    : `Appliquer ${totalModifie} modification${totalModifie > 1 ? "s" : ""}`}
                </Button>
                <Button disabled={occupe} onClick={() => setRapports(null)} sx={{ textTransform: "none" }}>
                  Annuler
                </Button>
                {occupe && <CircularProgress size={18} sx={{ color: BRAND }} />}
              </Stack>
            </Card>
          )}
        </Stack>
      </Box>
    </PageContainer>
  );
}
