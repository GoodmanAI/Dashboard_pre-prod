"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
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
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import CheckIcon from "@mui/icons-material/Check";
import { useCentreProduit } from "@/hooks/useCentreProduit";
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
 * REPRISE D'ERGONOMIE DU 02/09/2026. La logique était jugée bonne, l'écran non :
 * dès deux examens choisis, la carte débordait de pastilles, poussait le reste de
 * la page, et rien ne disait comment finir la règle. Trois causes, trois réponses :
 *
 * 1. **Toutes les règles étaient dépliées en permanence.** Elles sont désormais
 *    repliées et résumées en une phrase (« IRM cérébrale et Scanner cérébral,
 *    jamais le même jour »), et une seule s'ouvre à la fois.
 * 2. **Le choix des examens tenait dans un menu déroulant multiple**, dont les
 *    pastilles grossissaient sans limite dans le champ. Il passe dans une boîte de
 *    dialogue avec recherche, à hauteur fixe.
 * 3. **Rien ne marquait la fin d'une règle.** Un bouton « Terminer cette règle »
 *    la referme. Il n'enregistre pas : la barre du bas reste la seule chose qui
 *    écrit, comme sur les autres écrans.
 *
 * Passe par le socle générique (`/api/product-config`).
 */

const DOMAINE = "konnect.regles-coexistence";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";
const DANGER = "#E1573B";

/** Miroir du CHECK de `cabinet_regles_coexistence`, dit dans les mots du client. */
const TYPES = [
  {
    cle: "interdit_meme_jour",
    libelle: "À ne pas faire le même jour",
    aide: "Le patient devra prendre deux rendez-vous à des dates différentes.",
    /** Fin de la phrase de résumé, après la liste des examens. */
    resume: "jamais le même jour",
  },
  {
    cle: "meme_creneau_obligatoire",
    libelle: "À faire dans la même venue",
    aide: "Les examens sont posés à la suite, sur le même passage.",
    resume: "dans la même venue",
  },
  {
    cle: "sites_specifiques",
    libelle: "Seulement sur certains sites",
    aide: "L'examen n'est proposé que sur les sites que vous choisissez.",
    resume: "seulement sur certains sites",
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

/** « A », « A et B », « A, B et C ». Au-delà de trois, on compte le reste. */
function enumerer(noms: string[]): string {
  if (noms.length === 0) return "";
  if (noms.length === 1) return noms[0];
  if (noms.length <= 3) return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
  return `${noms.slice(0, 2).join(", ")} et ${noms.length - 2} autres`;
}

/** Boîte de dialogue de sélection, avec recherche. Sert aux examens et aux sites. */
function ChoixMultiple({
  ouvert,
  titre,
  aide,
  options,
  selection,
  onFermer,
  onValider,
}: {
  ouvert: boolean;
  titre: string;
  aide: string;
  options: { cle: string; libelle: string; sous: string; type?: string | null }[];
  selection: string[];
  onFermer: () => void;
  onValider: (cles: string[]) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [choix, setChoix] = useState<string[]>(selection);

  // Rouvrir la boîte doit repartir de ce qui est enregistré, pas du brouillon
  // abandonné la fois d'avant.
  useEffect(() => {
    if (ouvert) {
      setChoix(selection);
      setRecherche("");
    }
    // `selection` est volontairement hors dépendances : on ne veut resynchroniser
    // qu'à l'ouverture, sinon cocher une case la remettrait aussitôt à sa valeur
    // enregistrée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.libelle.toLowerCase().includes(q) || o.sous.toLowerCase().includes(q)
    );
  }, [options, recherche]);

  return (
    <Dialog open={ouvert} onClose={onFermer} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontSize: 17, fontWeight: 700, color: INK, pb: 0.5 }}>
        {titre}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography sx={{ fontSize: 13, color: INK_MUTED, mb: 1.5 }}>{aide}</Typography>
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="Rechercher"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: INK_MUTED }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5 }}
        />
        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2 }}>
          {/* Hauteur bornée : c'est ce qui empêche la liste de pousser la page,
              quel que soit le nombre d'examens du référentiel. */}
          <List dense sx={{ maxHeight: 340, overflowY: "auto", py: 0 }}>
            {visibles.map((o) => {
              const coche = choix.includes(o.cle);
              return (
                <ListItemButton
                  key={o.cle}
                  onClick={() =>
                    setChoix((p) => (coche ? p.filter((c) => c !== o.cle) : [...p, o.cle]))
                  }
                  sx={{ borderBottom: `1px solid ${BORDER}` }}
                >
                  <Checkbox size="small" edge="start" checked={coche} tabIndex={-1} disableRipple />
                  {o.type ? (
                    <ExamTypeBadge type={o.type} variant="compact" sx={{ mr: 1 }} />
                  ) : (
                    <Box sx={{ width: 26, mr: 1 }} />
                  )}
                  <ListItemText
                    primary={o.libelle}
                    secondary={o.sous}
                    primaryTypographyProps={{ fontSize: 13 }}
                    secondaryTypographyProps={{ fontSize: 11.5 }}
                  />
                </ListItemButton>
              );
            })}
            {visibles.length === 0 && (
              <Box sx={{ py: 4 }}>
                <Typography align="center" sx={{ fontSize: 13, color: INK_MUTED }}>
                  Rien ne correspond à cette recherche.
                </Typography>
              </Box>
            )}
          </List>
        </Paper>
        <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 1 }}>
          {choix.length} sélectionné{choix.length > 1 ? "s" : ""}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onFermer} sx={{ textTransform: "none", color: INK_MUTED }}>
          Annuler
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={() => onValider(choix)}
          sx={{
            textTransform: "none",
            bgcolor: "var(--accent)",
            "&:hover": { bgcolor: "var(--accent-press)" },
          }}
        >
          Valider la sélection
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ReglesCoexistenceKonnect() {
  const { userProductId } = useCentreProduit();

  const [regles, setRegles] = useState<Regle[]>([]);
  const [initial, setInitial] = useState<Regle[]>([]);
  const [examens, setExamens] = useState<Examen[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  /** Une seule règle ouverte à la fois : c'est ce qui garde la page lisible. */
  const [ouverte, setOuverte] = useState<number | null>(null);
  /** Quelle boîte de sélection est affichée, et pour quelle règle. */
  const [dialogue, setDialogue] = useState<{ index: number; champ: "examens" | "sites" } | null>(
    null
  );

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

  /** Ce qui manque à une règle pour être complète. `null` si elle l'est. */
  function manque(r: Regle): string | null {
    if (r.examens.length === 0) return "Choisissez au moins un examen.";
    if (r.type_regle === "sites_specifiques") {
      if (r.sites.length === 0) return "Choisissez au moins un site.";
      return null;
    }
    if (r.examens.length < 2) return "Cette règle compare des examens entre eux : il en faut deux.";
    return null;
  }

  const blocage = useMemo(() => {
    const i = regles.findIndex((r) => manque(r) !== null);
    return i >= 0 ? `Règle ${i + 1} : ${manque(regles[i])}` : null;
  }, [regles]);

  /** La phrase qui remplace la carte dépliée quand la règle est refermée. */
  function resumer(r: Regle): string {
    const type = TYPES.find((t) => t.cle === r.type_regle) ?? TYPES[0];
    const noms = enumerer(r.examens.map((c) => infoExamen(c).libelle));
    if (!noms) return "Règle à compléter";
    if (r.type_regle === "sites_specifiques") {
      const lieux = enumerer(r.sites.map(infoSite));
      return lieux ? `${noms}, seulement à ${lieux}` : `${noms}, ${type.resume}`;
    }
    return `${noms}, ${type.resume}`;
  }

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
      setOuverte(null);
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

  const regleDialogue = dialogue ? regles[dialogue.index] : null;

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
          dans la même venue, ou un examen réservé à certains de vos sites. Cliquez sur
          une règle pour la modifier, refermez-la quand elle vous convient, puis
          enregistrez en bas de page.
        </Typography>

        <Alert severity="info" sx={{ mb: 2.5 }}>
          Ces règles sont enregistrées et transmises au portail, mais elles ne
          changent pas encore la façon dont les créneaux sont proposés. Vous pouvez
          les préparer dès maintenant, elles s&apos;appliqueront d&apos;elles-mêmes
          quand la planification multi-examens sera livrée.
        </Alert>

        <Stack spacing={1.25}>
          {regles.map((r, i) => {
            const type = TYPES.find((t) => t.cle === r.type_regle) ?? TYPES[0];
            const ouverteIci = ouverte === i;
            const incomplete = manque(r);
            return (
              <Paper
                key={i}
                variant="outlined"
                sx={{
                  borderColor: ouverteIci ? "var(--accent)" : BORDER,
                  borderRadius: 2,
                  overflow: "hidden",
                  opacity: r.actif ? 1 : 0.6,
                }}
              >
                {/* --- Ligne repliée : le résumé, et rien d'autre --- */}
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    px: 2,
                    py: 1.25,
                    cursor: "pointer",
                    bgcolor: ouverteIci ? SURFACE_MUTED : SURFACE,
                    "&:hover": { bgcolor: SURFACE_MUTED },
                  }}
                  onClick={() => setOuverte(ouverteIci ? null : i)}
                >
                  <ExpandMoreIcon
                    fontSize="small"
                    sx={{
                      color: INK_MUTED,
                      transform: ouverteIci ? "rotate(180deg)" : "none",
                      transition: "transform 120ms",
                    }}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, color: INK, fontWeight: 600 }}>
                      {resumer(r)}
                    </Typography>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED }}>
                      {type.libelle}
                      {!r.actif && " · en pause"}
                      {r.description.trim() && ` · ${r.description.trim()}`}
                    </Typography>
                  </Box>
                  {incomplete && (
                    <Chip
                      size="small"
                      label="À compléter"
                      sx={{ fontSize: 11, fontWeight: 600, color: DANGER, bgcolor: "#FDECE8" }}
                    />
                  )}
                  <Tooltip title={r.actif ? "Règle appliquée" : "Règle en pause"}>
                    <Switch
                      size="small"
                      checked={r.actif}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => maj(i, "actif", e.target.checked)}
                    />
                  </Tooltip>
                  <Tooltip title="Supprimer cette règle">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRegles((p) => p.filter((_, j) => j !== i));
                        setOuverte(null);
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                {/* --- Carte dépliée : le détail modifiable --- */}
                <Collapse in={ouverteIci} unmountOnExit>
                  <Divider />
                  <Box sx={{ p: 2 }}>
                    <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                      Ce que dit la règle
                    </Typography>
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
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mb: 2 }}
                    >
                      {r.examens.map((code) => (
                        <Chip
                          key={code}
                          size="small"
                          label={infoExamen(code).libelle}
                          onDelete={() =>
                            maj(
                              i,
                              "examens",
                              r.examens.filter((c) => c !== code)
                            )
                          }
                          sx={{ height: 24, fontSize: 12 }}
                        />
                      ))}
                      <Button
                        size="small"
                        startIcon={r.examens.length ? <EditOutlinedIcon /> : <AddIcon />}
                        disabled={examens.length === 0}
                        onClick={() => setDialogue({ index: i, champ: "examens" })}
                        sx={{ textTransform: "none", fontSize: 12.5, color: INK }}
                      >
                        {r.examens.length ? "Modifier la liste" : "Choisir les examens"}
                      </Button>
                    </Stack>

                    {type.cle === "sites_specifiques" && (
                      <>
                        <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mb: 0.75 }}>
                          Les sites où ces examens sont proposés
                        </Typography>
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                          sx={{ mb: 2 }}
                        >
                          {r.sites.map((id) => (
                            <Chip
                              key={id}
                              size="small"
                              label={infoSite(id)}
                              onDelete={() =>
                                maj(
                                  i,
                                  "sites",
                                  r.sites.filter((s) => s !== id)
                                )
                              }
                              sx={{ height: 24, fontSize: 12 }}
                            />
                          ))}
                          <Button
                            size="small"
                            startIcon={r.sites.length ? <EditOutlinedIcon /> : <AddIcon />}
                            disabled={sites.length === 0}
                            onClick={() => setDialogue({ index: i, champ: "sites" })}
                            sx={{ textTransform: "none", fontSize: 12.5, color: INK }}
                          >
                            {r.sites.length ? "Modifier la liste" : "Choisir les sites"}
                          </Button>
                        </Stack>
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

                    <Stack direction="row" alignItems="center" sx={{ mt: 2 }} spacing={1.5}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CheckIcon />}
                        disabled={incomplete !== null}
                        onClick={() => setOuverte(null)}
                        sx={{
                          textTransform: "none",
                          fontSize: 12.5,
                          color: INK,
                          borderColor: BORDER,
                        }}
                      >
                        Terminer cette règle
                      </Button>
                      <Typography sx={{ fontSize: 11.5, color: incomplete ? DANGER : INK_MUTED }}>
                        {incomplete ??
                          "Rien n'est encore enregistré. Utilisez le bouton en bas de page."}
                      </Typography>
                    </Stack>
                  </Box>
                </Collapse>
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
            onClick={() => {
              // La nouvelle règle s'ouvre d'elle-même : c'est celle qu'on vient de
              // demander, la refermer aussitôt n'aurait aucun sens.
              setRegles((p) => [...p, { ...REGLE_VIDE }]);
              setOuverte(regles.length);
            }}
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

        {dialogue && regleDialogue && dialogue.champ === "examens" && (
          <ChoixMultiple
            ouvert
            titre="Les examens concernés"
            aide={
              regleDialogue.type_regle === "sites_specifiques"
                ? "Ces examens ne seront proposés que sur les sites que vous choisirez ensuite."
                : "La règle compare ces examens entre eux : il en faut au moins deux."
            }
            options={examens.map((e) => ({
              cle: e.code,
              libelle: e.libelle,
              sous: e.code,
              type: e.type,
            }))}
            selection={regleDialogue.examens}
            onFermer={() => setDialogue(null)}
            onValider={(cles) => {
              maj(dialogue.index, "examens", cles);
              setDialogue(null);
            }}
          />
        )}

        {dialogue && regleDialogue && dialogue.champ === "sites" && (
          <ChoixMultiple
            ouvert
            titre="Les sites où ces examens sont proposés"
            aide="Le patient ne verra de créneaux que sur ces sites."
            options={sites.map((s) => ({ cle: s.site_id, libelle: s.libelle, sous: s.site_id }))}
            selection={regleDialogue.sites}
            onFermer={() => setDialogue(null)}
            onValider={(cles) => {
              maj(dialogue.index, "sites", cles);
              setDialogue(null);
            }}
          />
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={() => {
            setRegles(initial);
            setOuverte(null);
          }}
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
