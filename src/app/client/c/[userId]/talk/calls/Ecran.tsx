"use client";

import SectionHeader from "@/components/admin/SectionHeader";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  ListItemButton,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Drawer,
  Tabs,
  Tab,
  Checkbox,
  Popover,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
} from "@mui/material";
import { IconSearch, IconX, IconDownload, IconFlag, IconFlagFilled, IconAlertTriangle, IconPhone } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTalkBasePath } from "@/utils/talkRoutes";
import { io } from "socket.io-client";
import { subDays, startOfDay, endOfDay, subYears } from "date-fns";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import DateRangePresets from "@/components/DateRangePresets";
import { construireExamLabelMap, listerTypesExamen } from "@/lib/examLabels";
import Transcription from "@/components/transcription/Transcription";
import { useSignalement } from "@/components/shared/DialogSignalement";
import PastilleMineur from "@/components/transcription/PastilleMineur";
import Pastille, { TONS, TonPastille } from "@/components/shared/Pastille";
import { apercuConversation } from "@/lib/entitesTranscription";
import { exporterTranscriptionPdf, formatPhoneFR } from "@/lib/transcriptionPdf";

const states: any = { identification_birthdate: "- Etape Identification", identification_firstname: "- Etape Identification", identification_lastname: "- Etape Identification", identification_confirm: "- Etape Identification", identification_birthdate_light: "- Etape Identification", identification_firstname_light: "- Etape Identification", identification_lastname_light: "- Etape Identification", identification_confirm_light: "- Etape Identification", get_intent: "- Etape Intention", confirm_intent: "- Etape Intention", get_phone: "- Etape Téléphone", confirm_phone: "- Etape Téléphone", confirm_identity_rdv: "- Etape Identification", exam_type: "- Etape Intention Examen", confirm_exam: "- Etape Intention Examen", exam_questions: "- Etape Questions", define_mammo: "- Etape définir Mammo", irm_injection_flow: "- Etape injection IRM", scanner_injection_flow: "- Etape injection scanner", multi_exam_confirm: "- Etape multi-examens", multi_exam_get_region: "- Etape multi-examens", multi_exam_one_not_accepted: "- Etape multi-examens", multi_exam_validate: "- Etape multi-examens", get_motif: "- Etape motif", get_dispo: "- Etape Créneaux", get_dispo_double: "- Etape Créneaux", get_period: "- Etape période Mammo", get_period_double: "- Etape période Mammo", slot: "- Etape Créneaux", slot_double: "- Etape Créneaux", validate_exam: "- Etape validation RDV", validate_double_exam: "- Etape validation RDV", consultation: "- Etape Consultation", cancel_fetch: "- Etape Annulation", cancel_confirm: "- Etape Annulation", modify_fetch: "- Etape Modification", modify_confirm: "- Etape Modification", no_slot_modify_proposal: "- Etape Créneau" }

const ITEMS_PER_PAGE = 10;

// Labels et couleurs des transferReason centralisés dans
// `src/lib/transferReasons.ts` (utilisés via getTransferMeta + CATEGORY_META).

import {
  getTransferMeta,
  CATEGORY_META,
  estUnTransfert,
  estSansReponseDuSecretariat,
} from "@/lib/transferReasons";
import { getLanguageMeta, isNonDefaultLanguage } from "@/lib/languages";
import { getHangupContext } from "@/lib/hangupContext";
import { MENU_FILTRE } from "@/lib/menuFiltre";
import { useFiltresRecherche, useIntegre } from "@/lib/recherche/integre";
import { plageDePeriode } from "@/lib/recherche/periode";
import { signaler } from "@/lib/signaler";

/** Issue d'appel lue par la recherche (`VALEURS_ISSUE`), vers la valeur du filtre de statut. */
const STATUT_DE_L_ISSUE: Record<string, string> = {
  rdv_booked: "success",
  rdv_canceled: "canceled",
  rdv_modified: "rescheduled",
  transfert: "transfer:all",
  raccroche: "hung_up",
};

/**
 * Les pastilles d'un appel, dans l'ordre de lecture (16/11/2026) : d'abord ce que l'appel
 * a produit (rendez-vous, confirmation, modification, annulation), puis la demande
 * (renseignements, urgence), la redirection, et enfin le contexte (raccroché, à quelle
 * étape, langue). Teintes : `TONS` de `src/components/shared/Pastille.tsx`.
 */
export function getCallChips(
  call: any,
  examLabelMap: Record<string, string> = {},
): { libelle: string; ton: TonPastille }[] {
  const stats = call.stats ?? {};
  const intents: unknown[] = Array.isArray(stats.intents) ? stats.intents : [];
  const alertes: { libelle: string; ton: TonPastille }[] = [];
  const resultats: { libelle: string; ton: TonPastille }[] = [];
  const demandes: { libelle: string; ton: TonPastille }[] = [];
  const contexte: { libelle: string; ton: TonPastille }[] = [];

  // Service désactivé (kill switch côté config) : très rare, bien visible.
  if (stats.transferReason === "service_disabled") {
    alertes.push({ libelle: "Service désactivé", ton: TONS.desactive });
  }
  if (stats.transferReason === "emergency") {
    alertes.push({ libelle: "Appel d'urgence", ton: TONS.urgence });
  }

  // Ce que l'appel a produit.
  const statut: string | undefined = stats.rdv_status;
  if (statut === "success") {
    resultats.push({ libelle: "Rendez-vous", ton: TONS.rdv });
    const rawExamId = stats.exam_type_id;
    const examId = Array.isArray(rawExamId) ? rawExamId[0] : rawExamId;
    if (examId) {
      const baseExamLabel = examLabelMap[examId] || String(examId);
      resultats.push({
        libelle: stats.doppler_used === true ? `${baseExamLabel} + Doppler` : baseExamLabel,
        ton: TONS.examen,
      });
    }
  }
  if (statut === "confirmed") {
    resultats.push({ libelle: "Confirmation RDV", ton: TONS.confirme });
  }
  // `rescheduled` et `canceled` (anciens appels) ou `modified` et `cancelled` (LyraeTalk) :
  // une seule pastille, que le compteur ou le statut la donne.
  if (stats.rdv_modified > 0 || statut === "modified" || statut === "rescheduled") {
    resultats.push({ libelle: "Modifié", ton: TONS.modifie });
  }
  if (stats.rdv_canceled > 0 || statut === "cancelled" || statut === "canceled") {
    resultats.push({ libelle: "Annulé", ton: TONS.annule });
  }
  // Pas de créneau : teinte de la catégorie « Pas de créneau » des redirections.
  const planning = CATEGORY_META.pas_de_creneau;
  const tonPlanning: TonPastille = {
    fond: planning.bg,
    texte: planning.textColor,
    point: planning.color,
  };
  if (statut === "no_slot") {
    resultats.push({ libelle: "Pas de créneaux", ton: tonPlanning });
  }
  if (statut === "full_planning_end" || statut === "full_planning_redirect") {
    resultats.push({ libelle: "Planning complet", ton: tonPlanning });
  }
  if (statut === "not_performed") {
    resultats.push({ libelle: "Examen non pris en charge", ton: TONS.neutre });
  }

  // La demande.
  if (intents.includes("renseignements")) {
    demandes.push({ libelle: "Renseignements", ton: TONS.info });
  }

  // La redirection, à la teinte de sa catégorie (fond clair, texte foncé, point vif).
  if (estUnTransfert(stats)) {
    const dejaDite =
      stats.transferReason === "emergency" || stats.transferReason === "service_disabled";
    if (!dejaDite) {
      const meta = getTransferMeta(stats.transferReason);
      const cat = CATEGORY_META[meta.category];
      demandes.push({
        libelle: `Redirection : ${meta.label}`,
        ton: { fond: cat.bg, texte: cat.textColor, point: cat.color },
      });
    }
    if (estSansReponseDuSecretariat(stats)) {
      contexte.push({
        libelle: "Secrétariat sans réponse",
        ton: { ...TONS.contexte, point: "#EF4444" },
      });
    }
  }

  // Raccroché, et à quelle étape (`hangupContext.ts`). « Raccrochage indéterminé » et
  // « early_hangup » ne disent rien de plus que « Raccroché ».
  if (
    stats.rdv_booked === 0 &&
    stats.rdv_canceled === 0 &&
    stats.rdv_modified === 0 &&
    !estUnTransfert(stats)
  ) {
    contexte.push({ libelle: "Raccroché", ton: TONS.neutre });
    const ctx = getHangupContext(stats);
    if (ctx && ctx.key !== "unknown" && ctx.key !== "early_hangup") {
      contexte.push({ libelle: ctx.label, ton: { ...TONS.contexte, point: ctx.color } });
    }
  }

  // Langue, seulement quand ce n'est pas le français : sans drapeau (pas d'emoji à l'écran).
  if (isNonDefaultLanguage(stats.language)) {
    const langMeta = getLanguageMeta(stats.language);
    contexte.push({ libelle: langMeta.label, ton: { ...TONS.contexte, point: langMeta.color } });
  }

  return [...alertes, ...resultats, ...demandes, ...contexte];
}

interface CallSummary {
  id: number;
  userProductId: number;
  centerId: number;
  steps: any;
  stats: any;
  createdAt: string;
  treated?: boolean;
  flagged?: boolean;
  flagComment?: string | null;
}

interface CallListPageProps {
  params: { id: string };
}

const formatCallTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

function formatDateFR(dateValue: string) {
  const date = new Date(dateValue);
  let formatted = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

  return formatted.replace(/\b([a-zà-ÿ])/i, (m) => m.toUpperCase());
}

export default function CallListPage({ params }: CallListPageProps) {

  const router = useRouter();
  const searchParams = useSearchParams();
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);
  // Monté dans le panneau de la recherche : filtres pris du résultat, URL laissée tranquille.
  const integre = useIntegre();
  const filtresRecherche = useFiltresRecherche();

  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [examTypeFilter, setExamTypeFilter] = useState("all");
  const [mineurFilter, setMineurFilter] = useState(false);
  const [tab, setTab] = useState("all");

  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [checkboxState, setCheckboxState] = useState<Record<number, boolean>>({});
  const [flaggedState, setFlaggedState] = useState<Record<number, boolean>>({});
  const { demanderCommentaire, dialogue: dialogueSignalement } = useSignalement();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  // Objet { US: { fr, diminutif }, ... } renvoyé par /api/configuration/mapping/type_exam.
  const [mapping, setMapping] = useState<Record<string, any>>({});

  // Diminutif du centre (ce que remonte `stats.exam_type_id`) vers le libellé
  // affiché. Le libellé vient du code canonique de la ligne, pas de la colonne
  // `fr` stockée : voir `src/lib/examLabels.ts`.
  const examLabelMap = useMemo(
    () => construireExamLabelMap(mapping),
    [mapping]
  );

  // Une entrée par type d'examen pour le filtre : sans ça, un centre dont le
  // diminutif diffère du code canonique apparaîtrait deux fois dans la liste.
  const examTypeOptions = useMemo(() => listerTypesExamen(mapping), [mapping]);

  // Le type d'examen de la recherche est un code robot (`MG`) ; le filtre attend la
  // valeur du centre, connue une fois le mapping chargé.
  const typeRecherche = useRef(filtresRecherche.type);
  useEffect(() => {
    const option = examTypeOptions.find((o) => o.code === typeRecherche.current);
    if (!option) return;
    typeRecherche.current = undefined;
    setExamTypeFilter(option.valeur);
  }, [examTypeOptions]);

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const plage = plageDePeriode(filtresRecherche.periode);
    if (plage) return plage;
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)),
      to: endOfDay(today),
    };
  });

  const [dateRangeDraft, setDateRangeDraft] = useState<DateRange>(dateRange);

  // Délai de conservation du centre, renvoyé par la route : au-delà, les appels sont
  // effacés et la liste s'arrête. Réglé par l'admin, affiché ici pour l'expliquer.
  const [conservation, setConservation] = useState<{ mois: number; depuis: string } | null>(null);

  // Recherche par numéro — input vs query (debouncé)
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const phoneSearchActive = phoneSearch.trim().length > 0;

  // URL → state (ou filtres de la recherche)
  useEffect(() => {
    const issue = filtresRecherche.issue && STATUT_DE_L_ISSUE[filtresRecherche.issue];
    if (issue) setStatusFilter(issue);
    if (filtresRecherche.telephone) {
      setPhoneInput(filtresRecherche.telephone);
      setPhoneSearch(filtresRecherche.telephone);
    }
    if (integre) return;

    const pageFromUrl: any = Number(searchParams?.get("page"));
    const statusFromUrl: any = searchParams?.get("status");
    const examTypeFromUrl: any = searchParams?.get("examType");
    const tabFromUrl: any = searchParams?.get("tab");
    const phoneFromUrl: any = searchParams?.get("phone");
    const mineurFromUrl = searchParams?.get("mineur");

    if (!isNaN(pageFromUrl) && pageFromUrl > 0) setPage(pageFromUrl);
    if (statusFromUrl) setStatusFilter(statusFromUrl);
    if (examTypeFromUrl) setExamTypeFilter(examTypeFromUrl);
    if (mineurFromUrl === "true") setMineurFilter(true);
    if (tabFromUrl) setTab(tabFromUrl);
    if (phoneFromUrl) {
      setPhoneInput(phoneFromUrl);
      setPhoneSearch(phoneFromUrl);
    }
  }, []);

  // Debounce de la recherche numéro (300ms) — évite de spammer l'API à chaque touche
  useEffect(() => {
    const t = setTimeout(() => {
      setPhoneSearch(phoneInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [phoneInput]);

  // Reset des autres filtres quand on démarre une nouvelle recherche numéro.
  // Les filtres restent ENSUITE modifiables pour affiner la recherche.
  const phoneWasActiveRef = useRef(false);
  useEffect(() => {
    const isActive = phoneSearch.trim().length > 0;
    if (isActive && !phoneWasActiveRef.current) {
      // Transition inactive → active : reset une fois
      setStatusFilter("all");
      setExamTypeFilter("all");
      setMineurFilter(false);
      setTab("all");
      const today = new Date();
      setDateRange({
        from: startOfDay(subYears(today, 5)),
        to: today,
      });
    }
    phoneWasActiveRef.current = isActive;
  }, [phoneSearch]);

  // Fetch mapping types d'examen
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/configuration/mapping/type_exam?userProductId=${userProductId}`);
        const data = await res.json();
        setMapping(data);
      } catch (err) {
        signaler("Erreur fetch mapping type_exam:", err);
      }
    })();
  }, [userProductId]);

  // state → URL
  useEffect(() => {
    if (integre) return;
    const paramsUrl = new URLSearchParams();

    paramsUrl.set("page", String(page));
    paramsUrl.set("status", statusFilter);
    paramsUrl.set("examType", examTypeFilter);
    paramsUrl.set("tab", tab);
    if (mineurFilter) paramsUrl.set("mineur", "true");
    if (phoneSearchActive) paramsUrl.set("phone", phoneSearch);

    router.replace(`${basePath}/calls?${paramsUrl.toString()}`, { scroll: false });

  }, [page, statusFilter, examTypeFilter, mineurFilter, tab, phoneSearch]);

  // FETCH
  useEffect(() => {

    if (!userProductId || isNaN(userProductId)) return;

    const controller = new AbortController();

    const fetchCalls = async () => {

      try {

        setLoading(true);
        setError(null);
        setCalls([]);

        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);

        const params = new URLSearchParams({
          userProductId: String(userProductId),
          page: String(page),
          limit: String(ITEMS_PER_PAGE),
          status: statusFilter,
          examTypeId: examTypeFilter,
          from: dateRange.from.toISOString(),
          to: toDate.toISOString(),
        });

        if (tab === "scanners") params.append("examType", "scanner");
        if (phoneSearchActive) params.append("phone", phoneSearch);
        if (mineurFilter) params.append("mineur", "true");

        const res = await fetch(`/api/calls?${params}`, { signal: controller.signal });

        if (!res.ok) throw new Error("Erreur lors du fetch des appels");

        const { data, total, conservation: delai } = await res.json();

        setCalls(data);
        setTotal(total);
        setConservation(delai ?? null);
        const initialCheckbox: Record<number, boolean> = {};
        const initialFlagged: Record<number, boolean> = {};

        data.forEach((call: CallSummary) => {
          initialCheckbox[call.id] = !!call.treated;
          initialFlagged[call.id] = !!call.flagged;
        });

        setCheckboxState(initialCheckbox);
        setFlaggedState(initialFlagged);

      } catch (err: any) {

        if (err.name !== "AbortError") setError(err.message);

      } finally {

        setLoading(false);

      }
    };

    fetchCalls();

    return () => controller.abort();

  }, [userProductId, page, statusFilter, examTypeFilter, mineurFilter, tab, dateRange, phoneSearch]);

  useEffect(() => {
    const init = async () => {
      await fetch("/api/socket"); // initialise le serveur

      const socket = io({
        path: "/api/socket",
      });

      socket.on("call-treated", ({ callId, treated }) => {
        setCheckboxState((prev) => ({
          ...prev,
          [callId]: treated,
        }));

        setCalls((prev) =>
          prev.map((c) =>
            c.id === callId ? { ...c, treated } : c
          )
        );
      });

      socket.on("call-flagged", ({ callId, flagged }) => {
        setFlaggedState((prev) => ({
          ...prev,
          [callId]: flagged,
        }));

        setCalls((prev) =>
          prev.map((c) =>
            c.id === callId ? { ...c, flagged } : c
          )
        );
      });
    };

    init();
  }, []);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const toggleFlag = async (call: CallSummary) => {
    const newValue = !flaggedState[call.id];
    // Signaler demande ce qui s'est mal passé (facultatif) ; retirer ne demande rien.
    let commentaire: string | null = null;
    if (newValue) {
      commentaire = await demanderCommentaire();
      if (commentaire === null) return;
    }

    setFlaggedState((prev) => ({
      ...prev,
      [call.id]: newValue,
    }));

    try {
      // Le drapeau est peint AVANT la reponse, pour que le clic soit instantane. Il
      // faut donc defaire la peinture si le serveur refuse : sans ce test (jusqu'au
      // 16/09/2026), un refus laissait le drapeau rouge a l'ecran, et le signalement
      // disparaissait au rechargement suivant sans que personne ne comprenne pourquoi.
      const res = await fetch(`/api/calls/${call.id}/flag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: newValue, flagComment: commentaire }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setCalls((prev) =>
        prev.map((c) =>
          c.id === call.id ? { ...c, flagged: newValue, flagComment: commentaire || null } : c
        )
      );
    } catch (e) {
      setFlaggedState((prev) => ({
        ...prev,
        [call.id]: !newValue,
      }));
      signaler("Erreur update flagged", e);
    }
  };

  const toggleCall = async (call: CallSummary) => {

    const newValue = !checkboxState[call.id];

    // UI immédiate
    setCheckboxState((prev) => ({
      ...prev,
      [call.id]: newValue
    }));

    try {

      // Meme piege que pour le drapeau : la case est cochee avant la reponse, donc un
      // refus doit la decocher. Le commentaire ci-dessous disait deja « seulement apres
      // succes » alors que rien ne verifiait le succes (corrige le 16/09/2026).
      const res = await fetch(`/api/calls/${call.id}/treated`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treated: newValue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // applique la transparence seulement après succès
      setCalls((prev) =>
        prev.map((c) =>
          c.id === call.id ? { ...c, treated: newValue } : c
        )
      );

    } catch (e) {

      // rollback UI si erreur
      setCheckboxState((prev) => ({
        ...prev,
        [call.id]: !newValue
      }));

      signaler("Erreur update treated", e);

    }
  };

  const filteredSteps =
    selectedCall?.steps?.filter(
      (line: any) => !String(line?.text ?? "").startsWith("WaitSound:")
    ) ?? [];

  return (
    <Box>
      <SectionHeader
        title="Liste des appels"
        subtitle="Tous les appels reçus par LyraeTalk, du plus récent au plus ancien."
        retour={{ libelle: "Retour à LyraeTalk", href: basePath }}
        actions={
          <Button
            variant="outlined"
            color="error"
            startIcon={<IconAlertTriangle size={18} />}
            onClick={() => router.push(`${basePath}/incidents`)}
          >
            Voir les incidents
          </Button>
        }
      />

      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center", flexWrap: "wrap" }}>

        <TextField
          placeholder="Rechercher par numéro (ex. 0612... ou +336...)"
          variant="outlined"
          size="small"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          sx={{ width: 340, bgcolor: "white" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <IconSearch size={18} />
              </InputAdornment>
            ),
            endAdornment: phoneInput ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => {
                    setPhoneInput("");
                  }}
                  aria-label="Effacer la recherche"
                >
                  <IconX size={16} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />

        <DateRangePresets
          range={dateRange}
          onChange={(r) => {
            setDateRange(r);
            setPage(1);
          }}
        />

        <Button
          variant="outlined"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            borderColor: "var(--accent)",
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          Du {dateRange.from.toLocaleDateString()} au {dateRange.to.toLocaleDateString()}
        </Button>

        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          PaperProps={{
            sx: {
              borderRadius: 2,
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
              border: "1px solid rgba(var(--accent-rgb), 0.15)",
            },
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Box sx={{ p: 2.5, pb: 1 }}>
            <Typography
              variant="overline"
              sx={{
                color: "var(--accent-deep)",
                fontWeight: 700,
                letterSpacing: 1,
                display: "block",
                mb: 1.5,
              }}
            >
              Sélectionner une période
            </Typography>

            <DateRangePicker
              value={dateRangeDraft}
              onChange={(range) => setDateRangeDraft(range)}
            />
          </Box>

          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
              borderTop: "1px solid #f0f0f0",
            }}
          >
            <Button
              variant="text"
              onClick={() => setAnchorEl(null)}
              sx={{ color: "text.secondary" }}
            >
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setDateRange(dateRangeDraft);
                setAnchorEl(null);
                setPage(1);
              }}
              sx={{
                bgcolor: "var(--accent)",
                fontWeight: 600,
                "&:hover": { bgcolor: "var(--accent-press)" },
              }}
            >
              Appliquer
            </Button>
          </Box>
        </Popover>

      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          setPage(1);
        }}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 3 }}
      >
        <Tab value="all" label="Tous les appels" />
        <Tab value="scanners" label="Scanners & IRM" />
      </Tabs>

      <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center", flexWrap: "wrap" }}>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel>Filtrer par statut</InputLabel>
          <Select
            value={statusFilter}
            label="Filtrer par statut"
            MenuProps={MENU_FILTRE}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="all">Tous</MenuItem>
            <MenuItem value="success">Rendez-vous</MenuItem>
            <MenuItem value="canceled">Annulé</MenuItem>
            <MenuItem value="rescheduled">Modifié</MenuItem>
            <MenuItem value="no_slot_api_retrieve">Planning complet</MenuItem>
            <MenuItem value="not_performed">Examen non pris en charge</MenuItem>
            <MenuItem value="hung_up">Raccroché</MenuItem>
            <MenuItem value="transfer:all">Toutes les redirections</MenuItem>
            <MenuItem value="resultats">Demandes de résultats</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel>Filtrer par type d&#39;examen</InputLabel>
          <Select
            value={examTypeFilter}
            label="Filtrer par type d&#39;examen"
            MenuProps={MENU_FILTRE}
            onChange={(e) => {
              setExamTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="all">Tous</MenuItem>
            {examTypeOptions.map((o) => (
              <MenuItem key={o.code} value={o.valeur}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Mêmes couleurs que la pastille des lignes : pleine quand le filtre est actif. */}
        <Chip
          label="MINEUR"
          variant={mineurFilter ? "filled" : "outlined"}
          aria-pressed={mineurFilter}
          onClick={() => {
            setMineurFilter((v) => !v);
            setPage(1);
          }}
          sx={{
            fontWeight: 700,
            letterSpacing: 0.5,
            borderColor: "#ea580c",
            color: mineurFilter ? "#fff" : "#ea580c",
            backgroundColor: mineurFilter ? "#ea580c" : "transparent",
            "&&:hover": { backgroundColor: mineurFilter ? "#c2410c" : "rgba(234, 88, 12, 0.08)" },
          }}
        />

        {phoneSearchActive && (
          <Chip
            size="small"
            label={`Recherche numéro : ${phoneInput}`}
            sx={{
              bgcolor: "rgba(var(--accent-rgb), 0.15)",
              color: "var(--accent-deep)",
              fontWeight: 600,
            }}
          />
        )}
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {conservation &&
        (phoneSearchActive || dateRange.from < new Date(conservation.depuis)) && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Les appels de plus de {conservation.mois} mois sont effacés. Leurs chiffres
            restent dans Statistiques d&apos;appels.
          </Alert>
        )}

      {!loading && calls.length === 0 && (
        <Alert severity="info">Aucun appel trouvé.</Alert>
      )}

      {!loading && calls.length > 0 && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              mb: 1,
              ml: 1
            }}
          >
            <Typography
              fontSize={12}
              fontWeight={600}
              color="text.secondary"
              sx={{ width: 42 }}
            >
              Traité
            </Typography>
          </Box>
          <List sx={{ bgcolor: "white", borderRadius: 2 }}>

            {calls.map((call, index) => {
              const apercu = apercuConversation(call.steps);

              return (

                <Box key={call.id}>

                  <ListItem
                    disablePadding
                    sx={{
                      opacity: call.treated ? 0.45 : 1,
                      transition: "opacity 0.2s"
                    }}
                  >

                    <Checkbox
                      checked={!!checkboxState[call.id]}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleCall(call)}
                      sx={{ ml: 1 }}
                    />

                    <ListItemButton
                      onClick={() => setSelectedCall(call)}
                      sx={{ py: 1.25, px: 2 }}
                    >
                      <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 0.75 }}>
                        {/* Ligne 1 : date · dernier état (si dispo) */}
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 2,
                            color: "text.secondary",
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {formatDateFR(call.createdAt)}
                            {call.stats.call_start_time && (
                              <> · {formatCallTime(call.stats.call_start_time)}</>
                            )}
                          </Typography>
                          {states[call.stats.last_state] && (
                            <Typography variant="caption">
                              Dernier état : {states[call.stats.last_state]}
                            </Typography>
                          )}
                        </Box>

                        {/* Ligne 2 : numéro mis en avant + chips */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          <Box
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 0.5,
                              // Le numéro n'est pas un statut : en texte, sans fond
                              // coloré (16/11/2026), pour que seules les pastilles
                              // portent une couleur qui veut dire quelque chose.
                              color: "#0F2A3F",
                              pr: 0.5,
                              fontWeight: 700,
                              fontSize: "0.8rem",
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: 0.3,
                              lineHeight: 1.6,
                            }}
                          >
                            <IconPhone size={13} aria-hidden />
                            {formatPhoneFR(call.stats.phoneNumber)}
                          </Box>

                          <PastilleMineur stats={call.stats} />

                          {flaggedState[call.id] && (
                            <Pastille
                              libelle="Incident"
                              ton={TONS.incident}
                              icone={<IconFlagFilled size={12} aria-hidden />}
                            />
                          )}

                          {getCallChips(call, examLabelMap).map((p, i) => (
                            <Pastille key={i} libelle={p.libelle} ton={p.ton} />
                          ))}
                        </Box>

                        {/* Ligne 3 : aperçu de la conversation */}
                        {apercu.lyrae && (
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{ color: "text.secondary", display: "block" }}
                          >
                            <strong>{apercu.lyrae}</strong>
                            {apercu.patient && <span>, {apercu.patient}</span>}
                          </Typography>
                        )}
                      </Box>
                    </ListItemButton>

                    <Divider
                      orientation="vertical"
                      flexItem
                      sx={{ mx: 1, my: 1.5, borderColor: "#e5e7eb" }}
                    />

                    <Tooltip
                      title={
                        flaggedState[call.id]
                          ? call.flagComment
                            ? `Signalé : ${call.flagComment}. Cliquer pour retirer le signalement.`
                            : "Retirer le signalement"
                          : "Signaler comme incident"
                      }
                    >
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFlag(call);
                        }}
                        sx={{ mr: 1, color: flaggedState[call.id] ? "#ef4444" : "#9ca3af" }}
                        aria-label="Signaler un incident"
                      >
                        {flaggedState[call.id] ? <IconFlagFilled size={20} /> : <IconFlag size={20} />}
                      </IconButton>
                    </Tooltip>

                  </ListItem>

                  {index < calls.length - 1 && <Divider />}

                </Box>

              );

            })}

          </List>

          {totalPages > 1 && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, v) => setPage(v)}
              />
            </Box>
          )}
        </>
      )}

      <Drawer
        anchor="right"
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 500 }, p: 3 } }}
      >

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6">Conversation</Typography>
            <PastilleMineur stats={selectedCall?.stats} />
          </Box>

          <Button
            size="small"
            variant="outlined"
            startIcon={<IconDownload size={16} />}
            disabled={!selectedCall || filteredSteps.length === 0}
            onClick={() => {
              if (selectedCall) exporterTranscriptionPdf(selectedCall, { titre: "Transcription d'appel", prefixeFichier: "appel" });
            }}
            sx={{
              borderColor: "var(--accent)",
              color: "var(--accent-deep)",
              fontWeight: 600,
              "&:hover": { borderColor: "var(--accent-press)", bgcolor: "rgba(var(--accent-rgb), 0.08)" },
            }}
          >
            Exporter PDF
          </Button>
        </Box>

        <Transcription
          steps={selectedCall?.steps}
          entites={selectedCall?.stats?.entites}
          examLabelMap={examLabelMap}
        />

      </Drawer>

      {dialogueSignalement}
    </Box>
  );
}