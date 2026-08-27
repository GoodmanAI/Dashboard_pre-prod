"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useParams } from "next/navigation";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import ExamTypeBadge, { toExamTypeCode } from "@/components/shared/ExamTypeBadge";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Règles de coexistence d'examens (lot E).
 *
 * Ce qui peut, ou ne peut pas, se faire ensemble quand un patient demande
 * plusieurs examens : deux examens interdits le même jour, deux examens à poser
 * sur le même créneau, un examen limité à certains sites.
 *
 * ⚠️ Le moteur de créneaux qui appliquera ces règles n'est pas encore écrit. Elles
 * sont transportées jusqu'à lui et exposées par l'API du portail, mais elles ne
 * changent encore rien au parcours. La forme des deux objets JSON est donc fixée
 * ici, faute de consommateur pour l'imposer, et devra être confirmée le jour où ce
 * moteur arrive.
 *
 * Passe par le socle générique (`/api/product-config`).
 */

const DOMAINE = "konnect.regles-coexistence";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";

/** Miroir du CHECK de `cabinet_regles_coexistence`, dit dans les mots du client. */
const TYPES = [
  {
    cle: "interdit_meme_jour",
    libelle: "À ne pas faire le même jour",
    aide: "Le patient devra prendre deux rendez-vous à des dates différentes.",
  },
  {
    cle: "meme_creneau_obligatoire",
    libelle: "À faire dans la même venue",
    aide: "Les examens sont posés à la suite, sur le même passage.",
  },
  {
    cle: "sites_specifiques",
    libelle: "Seulement sur certains sites",
    aide: "L'examen n'est proposé que sur les sites que vous choisissez.",
  },
] as const;

type Regle = {
  type_regle: string;
  examens: string[];
  sites: string[];
  description: string;
  actif: boolean;
};

type Examen = { code: string; libelle: string; type: string | null };
type Site = { site_id: string; libelle: string };

const REGLE_VIDE: Regle = {
  type_regle: "interdit_meme_jour",
  examens: [],
  sites: [],
  description: "",
  actif: true,
};

export default function ReglesCoexistenceKonnect() {
  const params = useParams();
  const userProductId = Number(params?.id);

  const [regles, setRegles] = useState<Regle[]>([]);
  const [initial, setInitial] = useState<Regle[]>([]);
  const [examens, setExamens] = useState<Examen[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const [rConfig, rExamens, rSites] = await Promise.all([
          fetch(`/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`),
          fetch(`/api/konnect-examens?userProductId=${userProductId}`),
          fetch(`/api/konnect-sites?userProductId=${userProductId}`),
        ]);
        if (!rConfig.ok) throw new Error("Chargement impossible.");
        const dConfig = await rConfig.json();
        if (annule) return;

        const items: any[] = Array.isArray(dConfig?.valeur?.items) ? dConfig.valeur.items : [];
        const chargees: Regle[] = items.map((r) => ({
          type_regle: String(r?.type_regle ?? "interdit_meme_jour"),
          examens: Array.isArray(r?.modalites_ou_examens?.examens)
            ? r.modalites_ou_examens.examens.map(String)
            : [],
          sites: Array.isArray(r?.parametres?.sites) ? r.parametres.sites.map(String) : [],
          description: String(r?.description ?? ""),
          actif: r?.actif !== false,
        }));
        setRegles(chargees);
        setInitial(chargees);

        if (rExamens.ok) {
          const dEx = await rExamens.json();
          const brut: any[] = Array.isArray(dEx.examens) ? dEx.examens : [];
          setExamens(
            brut
              .filter((e) => e?.performed !== false && String(e?.codeExamen ?? "").trim())
              .map((e) => ({
                code: String(e.codeExamen).trim(),
                libelle:
                  String(e.libelleClient ?? "").trim() ||
                  String(e.libelle ?? "").trim() ||
                  String(e.codeExamen).trim(),
                type:
                  toExamTypeCode(String(e.typeExamenClient ?? "").trim()) ??
                  toExamTypeCode(String(e.typeExamen ?? "").trim()),
              }))
          );
        }
        if (rSites.ok) {
          const dS = await rSites.json();
          const brut: any[] = Array.isArray(dS.sites) ? dS.sites : [];
          setSites(
            brut.map((s) => ({
              site_id: String(s.site_id),
              libelle: String(s.libelle ?? "").trim() || String(s.site_id),
            }))
          );
        }
      } catch {
        if (!annule) setErreur("Impossible de charger les règles de coexistence.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const infoExamen = useMemo(() => {
    const m = new Map(examens.map((e) => [e.code, e]));
    return (code: string): Examen => m.get(code) ?? { code, libelle: code, type: null };
  }, [examens]);

  const infoSite = useMemo(() => {
    const m = new Map(sites.map((s) => [s.site_id, s.libelle]));
    return (id: string) => m.get(id) ?? id;
  }, [sites]);

  function maj(index: number, champ: keyof Regle, valeur: any) {
    setRegles((p) => p.map((r, i) => (i === index ? { ...r, [champ]: valeur } : r)));
  }

  const etatSuivi = useMemo(() => {
    const out: Record<string, unknown> = {};
    regles.forEach((r, i) => {
      out[`regle:${i}`] = r;
    });
    return out;
  }, [regles]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etatSuivi, !chargement);

  const blocage = useMemo(() => {
    const i = regles.findIndex((r) => r.examens.length === 0);
    if (i >= 0) return `La règle ${i + 1} ne vise aucun examen.`;
    const j = regles.findIndex(
      (r) => r.type_regle === "sites_specifiques" && r.sites.length === 0
    );
    if (j >= 0) return `La règle ${j + 1} doit nommer au moins un site.`;
    const k = regles.findIndex(
      (r) => r.type_regle !== "sites_specifiques" && r.examens.length < 2
    );
    if (k >= 0) return `La règle ${k + 1} compare des examens entre eux : il en faut deux.`;
    return null;
  }, [regles]);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      const items = regles.map((r) => ({
        type_regle: r.type_regle,
        modalites_ou_examens: { examens: r.examens },
        parametres: r.type_regle === "sites_specifiques" ? { sites: r.sites } : {},
        description: r.description.trim() || null,
        actif: r.actif,
      }));
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { items } }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial(regles);
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
      <PageContainer title="Règles de coexistence" description="Ce qui va ensemble, ou pas">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Règles de coexistence" description="Ce qui va ensemble, ou pas">
      <Box>
        <SectionHeader
          title="Règles de coexistence"
          subtitle="Ce qui peut se faire ensemble, et ce qui ne le peut pas"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5 }}>
          Quand un patient demande plusieurs examens, ces règles disent comment les
          placer : deux examens à ne pas faire le même jour, deux examens à enchaîner
          dans la même venue, ou un examen réservé à certains de vos sites.
        </Typography>

        <Alert severity="info" sx={{ mb: 2.5 }}>
          Ces règles sont enregistrées et transmises au portail, mais elles ne
          changent pas encore la façon dont les créneaux sont proposés. Vous pouvez
          les préparer dès maintenant, elles s&apos;appliqueront d&apos;elles-mêmes
          quand la planification multi-examens sera livrée.
        </Alert>

        <Stack spacing={2}>
          {regles.map((r, i) => {
            const type = TYPES.find((t) => t.cle === r.type_regle) ?? TYPES[0];
            return (
              <Paper
                key={i}
                variant="outlined"
                sx={{ borderColor: BORDER, borderRadius: 2, p: 2, opacity: r.actif ? 1 : 0.6 }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, flexGrow: 1 }}>
                    Règle {i + 1}
                  </Typography>
                  <Tooltip title={r.actif ? "Règle appliquée" : "Règle en pause"}>
                    <Switch
                      size="small"
                      checked={r.actif}
                      onChange={(e) => maj(i, "actif", e.target.checked)}
                    />
                  </Tooltip>
                  <Tooltip title="Supprimer cette règle">
                    <IconButton
                      size="small"
                      onClick={() => setRegles((p) => p.filter((_, j) => j !== i))}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                <Select
                  size="small"
                  fullWidth
                  value={r.type_regle}
                  onChange={(e) => maj(i, "type_regle", String(e.target.value))}
                  sx={{ fontSize: 13, bgcolor: SURFACE, mb: 2 }}
                >
                  {TYPES.map((t) => (
                    <MenuItem key={t.cle} value={t.cle}>
                      <Box>
                        <Typography sx={{ fontSize: 13 }}>{t.libelle}</Typography>
                        <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
                          {t.aide}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>

                <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                  {type.cle === "sites_specifiques"
                    ? "Les examens concernés"
                    : "Les examens concernés, au moins deux"}
                </Typography>
                <Select
                  multiple
                  size="small"
                  fullWidth
                  value={r.examens}
                  error={
                    r.examens.length === 0 ||
                    (type.cle !== "sites_specifiques" && r.examens.length < 2)
                  }
                  onChange={(e) =>
                    maj(
                      i,
                      "examens",
                      typeof e.target.value === "string"
                        ? e.target.value.split(",")
                        : e.target.value
                    )
                  }
                  sx={{ fontSize: 13, bgcolor: SURFACE, mb: 2 }}
                  renderValue={(selection) => (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {(selection as string[]).map((code) => (
                        <Chip
                          key={code}
                          size="small"
                          label={infoExamen(code).libelle}
                          sx={{ height: 22, fontSize: 11.5 }}
                        />
                      ))}
                    </Stack>
                  )}
                >
                  {examens.map((e) => (
                    <MenuItem key={e.code} value={e.code}>
                      <Checkbox size="small" checked={r.examens.includes(e.code)} />
                      {e.type ? (
                        <ExamTypeBadge type={e.type} variant="compact" sx={{ mr: 1 }} />
                      ) : (
                        <Box sx={{ width: 26, mr: 1 }} />
                      )}
                      <ListItemText
                        primary={e.libelle}
                        secondary={e.code}
                        primaryTypographyProps={{ fontSize: 13 }}
                        secondaryTypographyProps={{ fontSize: 11.5 }}
                      />
                    </MenuItem>
                  ))}
                </Select>

                {type.cle === "sites_specifiques" && (
                  <>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                      Les sites où ces examens sont proposés
                    </Typography>
                    <Select
                      multiple
                      size="small"
                      fullWidth
                      value={r.sites}
                      error={r.sites.length === 0}
                      onChange={(e) =>
                        maj(
                          i,
                          "sites",
                          typeof e.target.value === "string"
                            ? e.target.value.split(",")
                            : e.target.value
                        )
                      }
                      sx={{ fontSize: 13, bgcolor: SURFACE, mb: 2 }}
                      renderValue={(selection) => (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {(selection as string[]).map((id) => (
                            <Chip
                              key={id}
                              size="small"
                              label={infoSite(id)}
                              sx={{ height: 22, fontSize: 11.5 }}
                            />
                          ))}
                        </Stack>
                      )}
                    >
                      {sites.map((s) => (
                        <MenuItem key={s.site_id} value={s.site_id}>
                          <Checkbox size="small" checked={r.sites.includes(s.site_id)} />
                          <ListItemText
                            primary={s.libelle}
                            secondary={s.site_id}
                            primaryTypographyProps={{ fontSize: 13 }}
                            secondaryTypographyProps={{ fontSize: 11.5 }}
                          />
                        </MenuItem>
                      ))}
                    </Select>
                    {sites.length === 0 && (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        Aucun site enregistré. Renseignez vos sites pour pouvoir en
                        choisir ici.
                      </Alert>
                    )}
                  </>
                )}

                <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                  Une note pour vous, facultative
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  value={r.description}
                  placeholder="Pourquoi cette règle existe"
                  onChange={(e) => maj(i, "description", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { fontSize: 13, bgcolor: SURFACE } }}
                />
              </Paper>
            );
          })}
        </Stack>

        {regles.length === 0 && (
          <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, py: 5 }}>
            <Typography variant="body2" align="center" sx={{ color: INK_MUTED }}>
              Aucune règle. Tous les examens peuvent être demandés ensemble.
            </Typography>
          </Paper>
        )}

        <Stack direction="row" sx={{ mt: 2 }}>
          <Button
            startIcon={<AddIcon />}
            disabled={examens.length === 0}
            onClick={() => setRegles((p) => [...p, { ...REGLE_VIDE }])}
            sx={{ textTransform: "none", color: INK }}
          >
            Ajouter une règle
          </Button>
        </Stack>

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={() => setRegles(initial)}
          blocage={blocage}
          libelle="Enregistrer les règles"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Règles enregistrées. Le portail patient les recevra dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
