"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Sites d'un centre LyraeKonnect.
 *
 * Le RIS distingue les lieux d'exercice par un identifiant, mais n'expose aucune
 * adresse. Le client la saisit ici, et le portail la dit au patient avant qu'il
 * confirme son rendez-vous.
 *
 * Même direction artistique que l'écran de mapping : constantes de couleur
 * communes, table dense, une seule sauvegarde qui remplace l'ensemble.
 */

const BRAND = "var(--accent)";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";

type Site = {
  site_id: string;
  libelle: string | null;
  code_postal: string;
  adresse: string | null;
};

const SITE_VIDE: Site = { site_id: "", libelle: "", code_postal: "", adresse: "" };

function EnTete({
  children,
  aide,
  largeur,
}: {
  children: React.ReactNode;
  aide: string;
  largeur?: number;
}) {
  return (
    <Tooltip title={aide} placement="top">
      <TableCell
        sx={{
          bgcolor: SURFACE_MUTED,
          color: INK_MUTED,
          fontWeight: 600,
          fontSize: 11.5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          borderBottom: `1px solid ${BORDER}`,
          width: largeur,
          whiteSpace: "nowrap",
          py: 1.25,
        }}
      >
        {children}
      </TableCell>
    </Tooltip>
  );
}

export default function SitesKonnect() {
  const { userProductId } = useCentreProduit();

  const [sites, setSites] = useState<Site[]>([]);
  const [initial, setInitial] = useState<Site[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/konnect-sites?userProductId=${userProductId}`);
        if (!r.ok) throw new Error("Chargement impossible.");
        const data = await r.json();
        if (!annule) {
          const chargees: Site[] = Array.isArray(data.sites) ? data.sites : [];
          setSites(chargees);
          setInitial(chargees);
        }
      } catch {
        if (!annule) setErreur("Impossible de charger les sites.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  function maj(index: number, champ: keyof Site, valeur: string) {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, [champ]: valeur } : s)));
  }

  const doublons = new Set(
    sites
      .map((s) => s.site_id.trim())
      .filter((id, i, tab) => id && tab.indexOf(id) !== i)
  );
  const sansIdentifiant = sites.some((s) => !s.site_id.trim());
  const cpInvalide = sites.some(
    (s) => s.code_postal.trim() && !/^[0-9]{5}$/.test(s.code_postal.trim())
  );

  /**
   * Une entrée par site, indexée sur son identifiant. Un site sans identifiant
   * prend sa position, le temps que l'utilisateur le renseigne : sans cela deux
   * lignes vides se confondraient et l'une des deux ne compterait pas.
   */
  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    sites.forEach((s, i) => {
      out[s.site_id.trim() || `#${i}`] = s;
    });
    return out;
  }, [sites]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  const blocage = doublons.size
    ? "Deux sites portent le même identifiant."
    : sansIdentifiant
      ? "Un site n'a pas d'identifiant."
      : cpInvalide
        ? "Un code postal ne fait pas 5 chiffres."
        : null;

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const r = await fetch(`/api/konnect-sites?userProductId=${userProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial(sites);
      marquerEnregistre();
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Sites" description="Vos lieux d'exercice">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: BRAND }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Sites" description="Vos lieux d'exercice">
      <Box>
        <SectionHeader
          title="Sites"
          subtitle="Les lieux où vos patients se présentent"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          L&apos;identifiant est celui de votre logiciel de gestion. L&apos;adresse,
          elle, n&apos;y figure pas : c&apos;est ici qu&apos;on la renseigne, pour
          l&apos;afficher au patient avant qu&apos;il confirme son rendez-vous. Le code
          postal sert aussi à proposer le site le plus proche lors des rappels de liste
          d&apos;attente.
        </Typography>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ overflowX: "auto", borderColor: BORDER, borderRadius: 2 }}
        >
          <Table size="small" sx={{ minWidth: 800 }}>
            <TableHead>
              <TableRow>
                <EnTete
                  aide="L'identifiant du site dans votre logiciel de gestion. Il doit correspondre exactement."
                  largeur={160}
                >
                  Identifiant
                </EnTete>
                <EnTete aide="Le nom du site tel que le patient le lit." largeur={240}>
                  Nom du site
                </EnTete>
                <EnTete aide="Numéro et rue. La ville se déduit du code postal." >
                  Adresse
                </EnTete>
                <EnTete aide="5 chiffres. Sert aussi au rapprochement géographique." largeur={130}>
                  Code postal
                </EnTete>
                <TableCell sx={{ width: 56, bgcolor: SURFACE_MUTED, borderBottom: `1px solid ${BORDER}` }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {sites.map((s, i) => {
                const enDouble = Boolean(s.site_id.trim()) && doublons.has(s.site_id.trim());
                const cpFaux =
                  Boolean(s.code_postal.trim()) && !/^[0-9]{5}$/.test(s.code_postal.trim());
                return (
                  <TableRow
                    key={i}
                    hover
                    sx={{
                      "&:nth-of-type(odd)": { bgcolor: "#FBFDFC" },
                      "& > td": { borderBottom: `1px solid ${BORDER}`, py: 1 },
                    }}
                  >
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={s.site_id}
                        error={enDouble || !s.site_id.trim()}
                        helperText={enDouble ? "Identifiant en double" : undefined}
                        onChange={(e) => maj(i, "site_id", e.target.value)}
                        sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, bgcolor: SURFACE } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={s.libelle ?? ""}
                        onChange={(e) => maj(i, "libelle", e.target.value)}
                        sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, bgcolor: SURFACE } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={s.adresse ?? ""}
                        onChange={(e) => maj(i, "adresse", e.target.value)}
                        sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, bgcolor: SURFACE } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={s.code_postal}
                        error={cpFaux}
                        helperText={cpFaux ? "5 chiffres" : undefined}
                        onChange={(e) => maj(i, "code_postal", e.target.value)}
                        sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, bgcolor: SURFACE } }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Retirer ce site">
                        <IconButton
                          size="small"
                          onClick={() => setSites((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sites.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" sx={{ color: INK_MUTED }}>
                      Aucun site. Ajoutez-en un pour que le patient sache où se rendre.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" sx={{ mt: 2 }}>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setSites((prev) => [...prev, { ...SITE_VIDE }])}
            sx={{ textTransform: "none", color: INK }}
          >
            Ajouter un site
          </Button>
        </Stack>

        {doublons.size > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Deux sites portent le même identifiant. Chacun doit être unique.
          </Alert>
        )}
        {sansIdentifiant && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            L&apos;identifiant du site est obligatoire : c&apos;est lui qui fait le lien
            avec votre logiciel de gestion.
          </Alert>
        )}
        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={() => setSites(initial)}
          blocage={blocage}
          libelle="Enregistrer les sites"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Sites enregistrés. Le portail patient les appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
