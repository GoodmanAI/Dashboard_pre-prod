"use client";

import Retour from "@/components/shared/Retour";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  WarningAmber,
  CheckCircle,
  Phone,
  Event,
  MedicalServices,
  Send,
  MoveToInbox,
  TaskAlt,
  ErrorOutline,
  MailOutline,
  Assignment,
} from "@mui/icons-material";
import { IconInfoCircle, IconAlertTriangle } from "@tabler/icons-react";
import ExamTypeBadge, { toExamTypeCode } from "@/components/shared/ExamTypeBadge";
import { io as ioClient, Socket } from "socket.io-client";
import { BoutonSuivi, SuiviAffiche } from "@/components/prescriptions/SuiviCarte";
import type { StatutSuivi, SuiviCarte } from "@/lib/suiviCarte";
import SectionHeader from "@/components/admin/SectionHeader";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import RejectedPrescriptionsPanel from "@/components/prescriptions/RejectedPrescriptionsPanel";
import ParMailPrescriptionsPanel, { type ParMailItem } from "@/components/prescriptions/ParMailPrescriptionsPanel";
import {
  ALERT_AFTER_HOURS_MAX,
  ALERT_AFTER_HOURS_MIN,
  DEFAULT_ALERT_AFTER_HOURS,
  type CanalDepot,
} from "@/lib/prescriptionConfig";

/* =============================================================================
   Page "Ordonnances manquantes"
   -----------------------------------------------------------------------------
   Affiche les patients dont le lien de depot d'ordonnance a ete envoye il y a
   plus de X heures et qui n'ont toujours pas depose leur PDF (status=PENDING,
   alertResolvedAt IS NULL).

   Timeline dynamique :
     - Selecteur (dropdown des presets 24/48/72/96/168h + input libre borne)
     - Valeur par defaut = alertAfterHours de la config centre
     - Le changement recharge la liste immediatement
     - Ne persiste pas cote serveur (juste un filtre UI)

   Depuis le 11/10/2026 (documents demandes, plans/2026-10-documents-demandes.md
   du workspace), deux listes d'attente : « Ordonnances en attente » et
   « Questionnaires et documents ». Meme carte, meme delai, meme « Marquer
   traite » ; l'alerte vit sur la piece attendue, pas sur le lien.

   Depuis le 26/10/2026 (plans/2026-10-konnect-questionnaires-centre.md du
   workspace), le meme ecran sert la section Konnect (`canal="konnect"`) : les
   questionnaires que les patients du portail n'ont pas remplis par le lien de
   leur confirmation, avec le delai de Konnect. Un seul onglet (l'ordonnance
   part avec la reservation), et un bilan par patient a la place des KPI des
   ordonnances.

   Actions secretaire :
     - Cliquer sur le numero pour le copier
     - Appeler tel:xxx via le lien direct
     - "Marquer traité" -> POST /alerts/{id}/resolve (fait disparaitre la carte)
     - "Indiquer un suivi" -> PUT /alerts/{id}/suivi (28/10/2026) : statut
       « Contacté » ou « Injoignable » et note courte, la carte reste ; le
       socket recharge la liste chez les autres secretaires
============================================================================= */

const EXAM_LABELS: Record<string, string> = {
  scanner: "Scanner",
  irm: "IRM",
  mammo: "Mammographie",
  radiographie: "Radiographie",
  echographie: "Echographie",
};

/** Presets d'heures pour le selecteur rapide. */
const PRESET_HOURS = [24, 48, 72, 96, 168];

type AlertItem = {
  id: number;
  rdvId: string;
  phone: string;
  firstname: string;
  lastname: string;
  appointmentDate: string | null;
  examType: string | null;
  status: string;
  createdAt: string;
  alertRaisedAt: string | null;
  hoursSinceCreated: number;
  hoursSinceAlert: number | null;
  /** Libelles des pieces ouvertes de la section (« Questionnaire IRM »...). */
  pieces?: string[];
  /**
   * Section documents : reponses d'un questionnaire rempli en ligne qui
   * demandent l'oeil du secretariat (« Pacemaker ou défibrillateur : oui »).
   */
  reponses?: string[];
  /** Statut de suivi pose par une secretaire (28/10/2026), visible de toutes. */
  suivi?: SuiviCarte | null;
};

type Onglet = "pending" | "documents" | "par-mail" | "rejected";

/**
 * Split date + heure : la date est mise en valeur dans la card (typo forte)
 * alors que l'heure est presentee comme un chip discret a cote. Rend la
 * hierarchie visuelle plus lisible qu'un unique "lun. 30 juil. 2026, 14:30".
 */
function formatFrDateOnly(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatFrTimeOnly(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFrDateShort(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhoneFr(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return raw;
}

interface Props {
  params: { id: string };
  /** `konnect` : les questionnaires des patients du portail. LyraeTalk par defaut. */
  canal?: CanalDepot;
}

/** Bilan des questionnaires de Konnect sur 30 jours (/api/prescriptions/questionnaires-stats). */
type BilanQuestionnaires = {
  demandes: number;
  remplis: number;
  aVerifier: number;
  enAttente: number;
};

export default function OrdonnancesManquantesPage({ params, canal = "talk" }: Props) {
  const userProductId = Number(params.id);
  const konnect = canal === "konnect";
  const [items, setItems] = useState<AlertItem[]>([]);
  // Questionnaires et documents demandes non recus (11/10/2026).
  const [docItems, setDocItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Set<number>>(new Set());
  const [suiviEnCours, setSuiviEnCours] = useState<Set<number>>(new Set());
  // Chantier prescriptions rejected 2026-08-04 : tab actif entre les 2 vues
  const [tab, setTab] = useState<Onglet>(konnect ? "documents" : "pending");
  const [rejectedCount, setRejectedCount] = useState<number>(0);
  // Patients sans portable invites par le robot a envoyer l'ordonnance par mail
  // (09/10/2026). Charges avec les alertes pour le compteur de l'onglet.
  const [parMailItems, setParMailItems] = useState<ParMailItem[]>([]);
  // Nombre d'alertes classees automatiquement par le serveur au dernier load
  // (RDV anterieur a aujourd'hui). Affiche pour que la disparition des cartes
  // ne soit pas silencieuse.
  const [autoResolvedCount, setAutoResolvedCount] = useState<number>(0);
  // Chantier 2026-08-05 : mini KPI 30j en haut de la page (integres ici
  // au lieu d'une page stats dediee)
  const [statsTotals, setStatsTotals] = useState<{
    requested: number;
    uploaded: number;
    acked: number;
    rejected: number;
  } | null>(null);
  const [bilanKonnect, setBilanKonnect] = useState<BilanQuestionnaires | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: "success" | "error" | "info" }>(
    { open: false, msg: "", sev: "success" }
  );

  // ---- Timeline UI ---------------------------------------------------------
  // seuilChoisi    = fenetre choisie sur la page ; null = celle du parametrage du
  //                  centre. Jamais conservee : en revenant sur la page, on repart
  //                  du parametrage (le serveur l'applique quand on n'envoie rien).
  //                  Avant le 30/09/2026, l'ecran envoyait toujours 48 h au premier
  //                  chargement, et le parametrage du centre n'etait jamais applique.
  // thresholdHours = seuil effectivement applique, tel que rendu par le serveur ;
  //                  null tant qu'il n'a pas repondu : on n'affiche aucun chiffre
  //                  plutot qu'un 48 h qui se corrigerait une seconde plus tard.
  // defaultHours   = alertAfterHours du centre (retourne par le serveur)
  // customInput    = valeur libre saisie par l'utilisateur (pour l'input "Autre")
  const [seuilChoisi, setSeuilChoisi] = useState<number | null>(null);
  const [thresholdHours, setThresholdHours] = useState<number | null>(null);
  const [defaultHours, setDefaultHours] = useState<number>(DEFAULT_ALERT_AFTER_HOURS);
  const [customInput, setCustomInput] = useState<string>("");
  const [selectValue, setSelectValue] = useState<string>("");

  // ---- Filtre type d'examen -----------------------------------------------
  // "all" = pas de filtre. Sinon la valeur brute d'examType (scanner, irm, etc.)
  // Applique cote client sur les items retournes par l'API.
  const [examFilter, setExamFilter] = useState<string>("all");

  const load = useCallback(
    async (hoursOverride?: number) => {
      if (!userProductId) return;
      const hours = hoursOverride ?? seuilChoisi;
      try {
        setLoading(true);
        setError(null);
        // Fetch en parallele : alertes pending + count rejected (pour le badge tab)
        const seuil = hours != null ? `&hoursThreshold=${hours}` : "";
        // Konnect : seulement les questionnaires de ses liens (26/10/2026).
        if (konnect) {
          const docsRes = await fetch(
            `/api/prescriptions/alerts?userProductId=${userProductId}${seuil}&section=documents&canal=konnect`,
            { cache: "no-store" }
          );
          if (!docsRes.ok) throw new Error(`HTTP ${docsRes.status}`);
          const docs = await docsRes.json();
          setDocItems(Array.isArray(docs?.items) ? docs.items : []);
          setAutoResolvedCount(
            Number.isFinite(docs?.autoResolvedCount) ? docs.autoResolvedCount : 0
          );
          if (Number.isFinite(docs?.defaultHours)) setDefaultHours(docs.defaultHours);
          if (Number.isFinite(docs?.thresholdHours)) setThresholdHours(docs.thresholdHours);
          return;
        }
        const [alertsRes, docsRes, countRes, parMailRes] = await Promise.all([
          fetch(
            `/api/prescriptions/alerts?userProductId=${userProductId}${seuil}`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/prescriptions/alerts?userProductId=${userProductId}${seuil}&section=documents`,
            { cache: "no-store" }
          ),
          fetch(`/api/prescriptions/alerts/count?userProductId=${userProductId}`, {
            cache: "no-store",
          }),
          fetch(`/api/prescriptions/par-mail?userProductId=${userProductId}`, {
            cache: "no-store",
          }),
        ]);
        if (!alertsRes.ok) throw new Error(`HTTP ${alertsRes.status}`);
        const data = await alertsRes.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        if (docsRes.ok) {
          const docs = await docsRes.json();
          setDocItems(Array.isArray(docs?.items) ? docs.items : []);
        }
        setAutoResolvedCount(
          Number.isFinite(data?.autoResolvedCount) ? data.autoResolvedCount : 0
        );
        if (Number.isFinite(data?.defaultHours)) {
          setDefaultHours(data.defaultHours);
        }
        if (Number.isFinite(data?.thresholdHours)) {
          setThresholdHours(data.thresholdHours);
        }
        if (parMailRes.ok) {
          const pm = await parMailRes.json();
          setParMailItems(Array.isArray(pm?.items) ? pm.items : []);
        }
        // Count rejected pour le badge du tab (non-bloquant)
        if (countRes.ok) {
          const cnt = await countRes.json();
          if (Number.isFinite(cnt?.rejectedCount)) {
            setRejectedCount(cnt.rejectedCount);
          }
        }
      } catch (err: any) {
        setError(err?.message || "Impossible de charger les alertes");
      } finally {
        setLoading(false);
      }
    },
    [userProductId, seuilChoisi, konnect]
  );

  useEffect(() => {
    load();
    // Poll fallback long : les uploads/resolves passent par websocket pour un
    // refresh instantane (voir hook plus bas), le poll capte seulement les
    // rows qui deviennent "actives" par vieillissement (createdAt franchit
    // le threshold sans autre event declenche).
    const interval = setInterval(() => load(), 5 * 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProductId, seuilChoisi]);

  // Chantier 2026-08-05 : fetch stats 30 derniers jours pour les KPI en tete
  // de page. On ne poll pas (les chiffres changent lentement, refresh au
  // reload de la page suffit).
  useEffect(() => {
    if (!userProductId) return;
    const controller = new AbortController();
    (async () => {
      try {
        if (konnect) {
          const res = await fetch(
            `/api/prescriptions/questionnaires-stats?userProductId=${userProductId}`,
            { signal: controller.signal, cache: "no-store" }
          );
          if (!res.ok) return;
          const data = await res.json();
          setBilanKonnect({
            demandes: Number(data?.demandes) || 0,
            remplis: Number(data?.remplis) || 0,
            aVerifier: Number(data?.aVerifier) || 0,
            enAttente: Number(data?.enAttente) || 0,
          });
          return;
        }
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 30);
        const fmtDay = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const url = `/api/prescriptions/stats?userProductId=${userProductId}&from=${fmtDay(from)}&to=${fmtDay(to)}`;
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.totals) {
          setStatsTotals({
            requested: Number(data.totals.requested) || 0,
            uploaded: Number(data.totals.uploaded) || 0,
            acked: Number(data.totals.acked) || 0,
            rejected: Number(data.totals.rejected) || 0,
          });
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Error fetching prescription stats:", err);
        }
      }
    })();
    return () => controller.abort();
  }, [userProductId, konnect]);

  // Websocket : refresh instantane sur upload/resolve emis par le backend
  // (meme event "prescription-alerts-updated" que le hook du badge navbar).
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!userProductId) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/socket");
        if (cancelled) return;
        const socket = ioClient({ path: "/api/socket" });
        socketRef.current = socket;
        socket.on("prescription-alerts-updated", () => {
          if (!cancelled) load();
        });
      } catch {
        // Socket KO : le poll 5min sert de fallback
      }
    })();
    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.off("prescription-alerts-updated");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userProductId, load]);

  // Le parametrage du centre figure toujours dans la liste, meme hors presets (2 h).
  const choixHeures = useMemo(
    () => Array.from(new Set([...PRESET_HOURS, defaultHours])).sort((a, b) => a - b),
    [defaultHours]
  );

  // Sync selectValue avec le seuil applique (parametrage du centre au chargement)
  useEffect(() => {
    if (thresholdHours == null) return;
    const val = String(thresholdHours);
    if (choixHeures.includes(thresholdHours)) {
      setSelectValue(val);
    } else {
      setSelectValue("custom");
      setCustomInput(val);
    }
  }, [thresholdHours, choixHeures]);

  const handleSelectChange = useCallback((newVal: string) => {
    setSelectValue(newVal);
    if (newVal === "custom") {
      // On attend la saisie de l'utilisateur avant de trigger un reload
      return;
    }
    const hours = Number.parseInt(newVal, 10);
    if (Number.isFinite(hours)) {
      setSeuilChoisi(hours);
    }
  }, []);

  const handleCustomApply = useCallback(() => {
    const n = Number.parseInt(customInput, 10);
    if (
      !Number.isFinite(n) ||
      n < ALERT_AFTER_HOURS_MIN ||
      n > ALERT_AFTER_HOURS_MAX
    ) {
      setSnack({
        open: true,
        msg: `Le délai doit être compris entre ${ALERT_AFTER_HOURS_MIN} et ${ALERT_AFTER_HOURS_MAX} heures.`,
        sev: "error",
      });
      return;
    }
    setSeuilChoisi(n);
  }, [customInput]);

  const handleResolve = useCallback(
    async (id: number, section: "ordonnances" | "documents") => {
      setResolving((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/prescriptions/alerts/${id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userProductId, section }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (section === "documents") {
          setDocItems((prev) => prev.filter((i) => i.id !== id));
        } else {
          setItems((prev) => prev.filter((i) => i.id !== id));
        }
        setSnack({ open: true, msg: "Alerte marquée comme traitée", sev: "success" });
      } catch (err: any) {
        setSnack({ open: true, msg: err?.message || "L'alerte n'a pas été mise à jour. Réessayez dans un instant.", sev: "error" });
      } finally {
        setResolving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [userProductId]
  );

  const handleSuivi = useCallback(
    async (
      id: number,
      section: "ordonnances" | "documents",
      statut: StatutSuivi | null,
      note: string
    ): Promise<boolean> => {
      setSuiviEnCours((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/prescriptions/alerts/${id}/suivi`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userProductId, section, statut, note }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404) load();
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const maj = (prev: AlertItem[]) =>
          prev.map((i) => (i.id === id ? { ...i, suivi: data.suivi ?? null } : i));
        if (section === "documents") setDocItems(maj);
        else setItems(maj);
        setSnack({
          open: true,
          msg: statut ? "Suivi enregistré, visible de vos collègues" : "Suivi retiré",
          sev: "success",
        });
        return true;
      } catch (err: any) {
        setSnack({
          open: true,
          msg: err?.message || "Le suivi n'a pas été enregistré. Réessayez dans un instant.",
          sev: "error",
        });
        return false;
      } finally {
        setSuiviEnCours((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [userProductId, load]
  );

  // Liste des types d'examens presents dans les items courants (source de
  // verite pour peupler le filtre — pas besoin d'aller chercher la config
  // centre, on ne montre que ce qui est reellement en attente).
  // La liste de l'onglet ouvert : ordonnances, ou questionnaires et documents.
  const enDocuments = tab === "documents";
  const listeOnglet = enDocuments ? docItems : items;

  const availableExamTypes = useMemo(() => {
    const set = new Set<string>();
    for (const it of listeOnglet) {
      if (it.examType) set.add(it.examType);
    }
    return Array.from(set).sort();
  }, [listeOnglet]);

  const ordonner = useCallback(
    (liste: AlertItem[]) => {
    const filtered =
      examFilter === "all"
        ? liste
        : liste.filter((it) => it.examType === examFilter);
    // Examen le plus proche en tete : les secretaires traitent d'abord les
    // RDV imminents. Sans date d'examen, en fin de liste ; a date egale,
    // le lien le plus ancien d'abord.
    const dateExamen = (it: AlertItem) => {
      const t = it.appointmentDate ? new Date(it.appointmentDate).getTime() : NaN;
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    // Une reponse a verifier (questionnaire en ligne) passe devant tout.
    const aVerifier = (it: AlertItem) => ((it.reponses?.length ?? 0) > 0 ? 0 : 1);
    return [...filtered].sort(
      (a, b) =>
        aVerifier(a) - aVerifier(b) ||
        dateExamen(a) - dateExamen(b) ||
        b.hoursSinceCreated - a.hoursSinceCreated
    );
    },
    [examFilter]
  );
  const orderedItems = useMemo(() => ordonner(items), [ordonner, items]);
  const orderedDocItems = useMemo(() => ordonner(docItems), [ordonner, docItems]);
  const listeAffichee = enDocuments ? orderedDocItems : orderedItems;

  return (
    <PageContainer
      title={konnect ? "Questionnaires des patients" : "Ordonnances manquantes"}
      description={
        konnect
          ? "Patients du portail qui n'ont pas rempli leurs questionnaires à temps"
          : "Rendez-vous pour lesquels aucune ordonnance n'a été déposée à temps"
      }
    >
      <Box>
        <SectionHeader
          title={konnect ? "Questionnaires des patients" : "Ordonnances manquantes"}
          subtitle={
            konnect
              ? `Les patients du portail qui ont reçu le lien de leurs questionnaires${thresholdHours != null ? ` il y a plus de ${thresholdHours} heures` : ""} et ne les ont pas remplis, et ceux dont une réponse est à vérifier.`
              : `Les patients qui ont reçu le lien de dépôt${thresholdHours != null ? ` il y a plus de ${thresholdHours} heures` : ""} et n'ont pas envoyé leur ordonnance ou leurs questionnaires, ceux sans portable qui les envoient par mail, et les documents refusés par votre logiciel de gestion.`
          }
          actions={
            tab === "pending" || tab === "documents" ? (
              <Chip
                size="small"
                label={loading ? "chargement…" : `${listeAffichee.length} en attente`}
                sx={{
                  bgcolor: listeAffichee.length > 0 ? "rgba(239,68,68,0.15)" : "rgba(var(--accent-rgb), 0.15)",
                  color: listeAffichee.length > 0 ? "#b91c1c" : "var(--accent-deep)",
                  fontWeight: 700,
                }}
              />
            ) : tab === "par-mail" ? (
              <Chip
                size="small"
                label={loading ? "chargement…" : `${parMailItems.length} à vérifier`}
                sx={{
                  bgcolor: parMailItems.length > 0 ? "rgba(59,130,246,0.15)" : "rgba(var(--accent-rgb), 0.15)",
                  color: parMailItems.length > 0 ? "#1d4ed8" : "var(--accent-deep)",
                  fontWeight: 700,
                }}
              />
            ) : (
              <Chip
                size="small"
                label={`${rejectedCount} refusée${rejectedCount > 1 ? "s" : ""}`}
                sx={{
                  bgcolor: rejectedCount > 0 ? "rgba(239,68,68,0.15)" : "rgba(var(--accent-rgb), 0.15)",
                  color: rejectedCount > 0 ? "#b91c1c" : "var(--accent-deep)",
                  fontWeight: 700,
                }}
              />
            )
          }
        />

        {/* Mini KPI 30 derniers jours (chantier 2026-08-05) : stats legeres
            en tete de page a la place d'une page stats dediee */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, 1fr)",
              sm: "repeat(4, 1fr)",
            },
            gap: 1.5,
            mb: 2,
          }}
        >
          {(konnect
            ? [
                {
                  label: "Questionnaires demandés",
                  value: bilanKonnect?.demandes,
                  color: "#3b82f6",
                  icon: <Send fontSize="inherit" />,
                  sub: undefined as string | undefined,
                },
                {
                  label: "Remplis",
                  value: bilanKonnect?.remplis,
                  color: "#16a34a",
                  icon: <TaskAlt fontSize="inherit" />,
                  sub:
                    bilanKonnect && bilanKonnect.demandes > 0
                      ? `${Math.round((bilanKonnect.remplis / bilanKonnect.demandes) * 100)}%`
                      : undefined,
                },
                {
                  label: "Réponses à vérifier",
                  value: bilanKonnect?.aVerifier,
                  color: "#ef4444",
                  icon: <ErrorOutline fontSize="inherit" />,
                  sub: undefined,
                },
                {
                  label: "En attente",
                  value: bilanKonnect?.enAttente,
                  color: "#EA580C",
                  icon: <WarningAmber fontSize="inherit" />,
                  sub: undefined,
                },
              ]
            : [
            {
              label: "Liens envoyés",
              value: statsTotals?.requested,
              color: "#3b82f6",
              icon: <Send fontSize="inherit" />,
            },
            {
              label: "Déposées par le patient",
              value: statsTotals?.uploaded,
              color: "var(--accent)",
              icon: <MoveToInbox fontSize="inherit" />,
              sub:
                statsTotals && statsTotals.requested > 0
                  ? `${Math.round((statsTotals.uploaded / statsTotals.requested) * 100)}%`
                  : undefined,
            },
            {
              label: "Acceptées",
              value: statsTotals?.acked,
              color: "#16a34a",
              icon: <TaskAlt fontSize="inherit" />,
              sub:
                statsTotals && statsTotals.uploaded > 0
                  ? `${Math.round((statsTotals.acked / statsTotals.uploaded) * 100)}%`
                  : undefined,
            },
            {
              label: "Refusées",
              value: statsTotals?.rejected,
              color: "#ef4444",
              icon: <ErrorOutline fontSize="inherit" />,
              sub:
                statsTotals && statsTotals.uploaded > 0
                  ? `${Math.round((statsTotals.rejected / statsTotals.uploaded) * 100)}%`
                  : undefined,
            },
          ]).map((kpi) => (
            <Card
              key={kpi.label}
              elevation={0}
              sx={{
                p: 1.5,
                border: "1px solid #e5e7eb",
                borderLeft: `3px solid ${kpi.color}`,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                minHeight: 68,
              }}
            >
              <Box sx={{ fontSize: 22, opacity: 0.85 }}>{kpi.icon}</Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", display: "block", lineHeight: 1.2 }}
                >
                  {kpi.label}
                </Typography>
                <Stack direction="row" alignItems="baseline" spacing={0.75}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "#1F3448" }}>
                    {kpi.value ?? "-"}
                  </Typography>
                  {kpi.sub && (
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", fontSize: 11 }}
                    >
                      ({kpi.sub})
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Card>
          ))}
        </Box>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2, ml: 0.5 }}>
          {konnect
            ? "Bilan sur les 30 derniers jours, par patient"
            : "Bilan sur les 30 derniers jours"}
        </Typography>

        {/* Tabs : En attente patient / Refusees par Xplore (chantier 2026-08-04).
            Konnect n'a qu'une liste : pas d'onglets. */}
        {!konnect && (
        <Card sx={{ mb: 2, borderRadius: 2 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => {
              setTab(v);
              setExamFilter("all");
            }}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              px: 2,
              "& .MuiTab-root": { fontWeight: 600, minHeight: 48 },
              "& .Mui-selected": { color: "var(--accent)" },
              "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
            }}
          >
            <Tab
              id="en_attente"
              value="pending"
              icon={<WarningAmber sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={`Ordonnances en attente (${orderedItems.length})`}
            />
            <Tab
              id="questionnaires"
              value="documents"
              icon={<Assignment sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={`Questionnaires et documents (${orderedDocItems.length})`}
            />
            <Tab
              id="par_mail"
              value="par-mail"
              icon={<MailOutline sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={`À vérifier dans la boîte mail (${parMailItems.length})`}
            />
            <Tab
              id="refusees"
              value="rejected"
              icon={<IconAlertTriangle size={18} />}
              iconPosition="start"
              label={`Refusées (${rejectedCount})`}
            />
          </Tabs>
        </Card>
        )}

        {tab === "par-mail" && (
          <ParMailPrescriptionsPanel
            userProductId={userProductId}
            items={parMailItems}
            loading={loading}
            onRangee={(id) => setParMailItems((prev) => prev.filter((i) => i.id !== id))}
          />
        )}

        {/* Contenu du tab REJECTED */}
        {tab === "rejected" && userProductId && (
          <RejectedPrescriptionsPanel userProductId={Number(userProductId)} />
        )}

        {/* Contenu des tabs PENDING et DOCUMENTS : meme carte, liste differente */}
        {(tab === "pending" || tab === "documents") && (
          <>

        {/* Barre de filtres : timeline + type d'examen */}
        <Card
          elevation={0}
          sx={{ p: 2, mb: 2, bgcolor: "#F0F7F5", border: "1px solid #d0e6df" }}
        >
          <Stack spacing={2}>
            {/* Timeline */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--accent-deep)", minWidth: 200 }}>
                Afficher les patients en attente depuis :
              </Typography>
              <Select
                size="small"
                value={selectValue}
                onChange={(e) => handleSelectChange(e.target.value as string)}
                sx={{ minWidth: 140, bgcolor: "#FFF" }}
              >
                {choixHeures.map((h) => (
                  <MenuItem key={h} value={String(h)}>
                    {h}h{h === defaultHours ? " (réglage du centre)" : ""}
                  </MenuItem>
                ))}
                <MenuItem value="custom">Autre…</MenuItem>
              </Select>
              {selectValue === "custom" && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    type="number"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    inputProps={{
                      min: ALERT_AFTER_HOURS_MIN,
                      max: ALERT_AFTER_HOURS_MAX,
                      step: 1,
                      style: { width: 70 },
                    }}
                    sx={{ bgcolor: "#FFF" }}
                    placeholder="heures"
                  />
                  <Typography variant="body2" color="text.secondary">
                    h
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleCustomApply}
                    sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
                  >
                    Appliquer
                  </Button>
                </Stack>
              )}
            </Stack>

            {/* Type d'examen : uniquement les types reellement en attente */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--accent-deep)", minWidth: 200 }}>
                Filtrer par type d&apos;examen :
              </Typography>
              <Select
                size="small"
                value={examFilter}
                onChange={(e) => setExamFilter(e.target.value as string)}
                sx={{ minWidth: 200, bgcolor: "#FFF" }}
                disabled={availableExamTypes.length === 0}
              >
                <MenuItem value="all">
                  Tous les examens ({listeOnglet.length})
                </MenuItem>
                {availableExamTypes.map((t) => {
                  const count = listeOnglet.filter((it) => it.examType === t).length;
                  return (
                    <MenuItem key={t} value={t}>
                      {EXAM_LABELS[t] ?? t} ({count})
                    </MenuItem>
                  );
                })}
              </Select>
            </Stack>
          </Stack>
        </Card>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Cloture auto des RDV passes : on l'annonce au lieu de laisser les
            cartes disparaitre sans trace (cf. src/lib/prescriptionAlerts.ts) */}
        {!loading && autoResolvedCount > 0 && (
          <Alert
            severity="success"
            icon={<CheckCircle sx={{ fontSize: 20 }} />}
            sx={{ mb: 2, borderRadius: 2 }}
          >
            {autoResolvedCount === 1
              ? "1 alerte a été classée automatiquement : le rendez-vous est déjà passé."
              : `${autoResolvedCount} alertes ont été classées automatiquement : leur rendez-vous est déjà passé.`}
          </Alert>
        )}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : listeAffichee.length === 0 ? (
          <Card elevation={1} sx={{ p: 5, textAlign: "center" }}>
            <CheckCircle sx={{ fontSize: 56, color: "#22C55E", mb: 1.5 }} />
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              Aucune alerte en cours
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {enDocuments
                ? thresholdHours != null
                  ? konnect
                    ? `Aucun patient n'a dépassé ${thresholdHours} heures sans remplir ses questionnaires.`
                    : `Aucun patient n'a dépassé ${thresholdHours} heures sans renvoyer ses questionnaires ou documents.`
                  : "Aucun patient n'attend de renvoyer un questionnaire ou un document."
                : thresholdHours != null
                  ? `Aucun patient n'a dépassé ${thresholdHours} heures sans déposer son ordonnance.`
                  : "Aucun patient n'attend de déposer son ordonnance."}
            </Typography>
          </Card>
        ) : (
          <Stack spacing={2}>
            <Alert
              severity="info"
              icon={<IconInfoCircle size={20} />}
              sx={{ borderRadius: 2 }}
            >
              Cliquez sur le numéro pour le copier. Une fois le patient rappelé, cliquez
              &laquo; Marquer traité &raquo; pour retirer la carte de la liste.{" "}
              {konnect
                ? "Chaque carte dit quels questionnaires manquent. Le patient a reçu le lien après sa réservation, par e-mail avec son code ou par SMS, et peut encore les remplir jusqu'à l'heure du rendez-vous. Une carte rouge « À vérifier » signale une réponse qui peut empêcher l'examen : rappelez le patient avant le rendez-vous."
                : enDocuments
                ? "Chaque carte dit quels questionnaires ou documents manquent. Le patient peut encore les déposer avec le lien reçu, jusqu'à l'heure du rendez-vous. Une carte rouge « À vérifier » signale une réponse du questionnaire rempli en ligne qui peut empêcher l'examen : rappelez le patient avant le rendez-vous."
                : "Le rendez-vous reste en attente d'ordonnance tant que le patient n'a pas déposé son document sur la plateforme."}{" "}
              Les rendez-vous déjà passés sont classés
              automatiquement : inutile de rappeler, l&apos;examen a eu lieu.
            </Alert>

            {listeAffichee.map((item) => {
              // Critical = 2x le seuil configure (ex: 48h de seuil -> critical > 96h).
              // Une reponse a verifier (questionnaire en ligne) est toujours critique.
              const aVerifier = enDocuments && (item.reponses?.length ?? 0) > 0;
              const manque = (item.pieces?.length ?? 0) > 0;
              const critical =
                aVerifier ||
                (thresholdHours != null && item.hoursSinceCreated > thresholdHours * 2);
              const examLabel = item.examType
                ? EXAM_LABELS[item.examType] ?? item.examType
                : "Examen non précisé";
              const formattedPhone = formatPhoneFr(item.phone);

              return (
                <Card
                  key={item.id}
                  elevation={1}
                  sx={{
                    borderLeft: `4px solid ${critical ? "#b91c1c" : "#EA580C"}`,
                    p: { xs: 2, sm: 2.5 },
                  }}
                >
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: "stretch", md: "center" }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Ligne 1 : nom + chip urgence */}
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}
                      >
                        <WarningAmber sx={{ color: critical ? "#b91c1c" : "#EA580C" }} />
                        <Typography variant="h6" fontWeight={700}>
                          {item.firstname} {item.lastname.toUpperCase()}
                        </Typography>
                        <Chip
                          size="small"
                          label={
                            aVerifier && !manque
                              ? "Questionnaire reçu, à vérifier"
                              : `${Math.round(item.hoursSinceCreated)} h sans dépôt`
                          }
                          sx={{
                            bgcolor: critical ? "rgba(185,28,28,0.15)" : "rgba(234,88,12,0.15)",
                            color: critical ? "#b91c1c" : "#c2410c",
                            fontWeight: 700,
                          }}
                        />
                      </Stack>

                      {/* Ligne 2 : icone tel + numero (non cliquable, selectable au clavier) */}
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                        <Phone sx={{ fontSize: 20, color: "var(--accent-deep)" }} />
                        <Typography
                          variant="body1"
                          sx={{
                            fontWeight: 700,
                            color: "var(--accent-deep)",
                            fontFamily: "monospace",
                            letterSpacing: 0.5,
                            userSelect: "all",
                          }}
                        >
                          {formattedPhone}
                        </Typography>
                      </Stack>

                      {/* Ligne 3 : type examen mis en avant + date RDV + heure en chip */}
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5 }}
                      >
                        {toExamTypeCode(item.examType) ? (
                          <ExamTypeBadge type={toExamTypeCode(item.examType)!} />
                        ) : (
                          <MedicalServices sx={{ fontSize: 20, color: "var(--accent)" }} />
                        )}
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 700, color: "#1F3448" }}
                        >
                          {examLabel}
                        </Typography>
                        <Typography variant="body2" sx={{ color: "#7A8FA6" }}>
                          ·
                        </Typography>
                        <Event sx={{ fontSize: 18, color: "#7A8FA6" }} />
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: "#1F3448" }}
                        >
                          {formatFrDateOnly(item.appointmentDate)}
                        </Typography>
                        {formatFrTimeOnly(item.appointmentDate) && (
                          <Chip
                            size="small"
                            label={formatFrTimeOnly(item.appointmentDate)}
                            sx={{
                              bgcolor: "#E6F7F3",
                              color: "var(--accent-deep)",
                              fontWeight: 700,
                              fontFamily: "monospace",
                              height: 22,
                            }}
                          />
                        )}
                      </Stack>

                      {aVerifier && (
                        <Stack
                          direction="row"
                          spacing={1}
                          useFlexGap
                          flexWrap="wrap"
                          sx={{ mb: 1, mt: 1 }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, color: "#1F3448" }}>
                            À vérifier :
                          </Typography>
                          {item.reponses!.map((libelle) => (
                            <Chip
                              key={libelle}
                              size="small"
                              icon={<WarningAmber sx={{ fontSize: 16 }} />}
                              label={libelle}
                              sx={{
                                bgcolor: "rgba(185,28,28,0.12)",
                                color: "#991b1b",
                                fontWeight: 600,
                                "& .MuiChip-icon": { color: "#b91c1c" },
                              }}
                            />
                          ))}
                        </Stack>
                      )}

                      {enDocuments && item.pieces && item.pieces.length > 0 && (
                        <Stack
                          direction="row"
                          spacing={1}
                          useFlexGap
                          flexWrap="wrap"
                          sx={{ mb: 1, mt: 1 }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, color: "#1F3448" }}>
                            Manque :
                          </Typography>
                          {item.pieces.map((libelle) => (
                            <Chip
                              key={libelle}
                              size="small"
                              icon={<Assignment sx={{ fontSize: 16 }} />}
                              label={libelle}
                              sx={{ bgcolor: "rgba(234,88,12,0.12)", color: "#9a3412", fontWeight: 600 }}
                            />
                          ))}
                        </Stack>
                      )}

                      <SuiviAffiche suivi={item.suivi} />

                      <Typography variant="caption" color="text.secondary">
                        {aVerifier && !manque
                          ? `Questionnaire reçu ${formatFrDateShort(item.createdAt)}, transmis à votre logiciel de gestion`
                          : `Lien envoyé ${formatFrDateShort(item.createdAt)}`}
                      </Typography>
                    </Box>

                    <Stack spacing={1} sx={{ flexShrink: 0 }}>
                      <BoutonSuivi
                        suivi={item.suivi}
                        enCours={suiviEnCours.has(item.id)}
                        onEnregistrer={(statut, note) =>
                          handleSuivi(item.id, enDocuments ? "documents" : "ordonnances", statut, note)
                        }
                      />
                      <Button
                        variant="contained"
                        disabled={resolving.has(item.id)}
                        onClick={() =>
                          handleResolve(item.id, enDocuments ? "documents" : "ordonnances")
                        }
                        sx={{
                          bgcolor: "var(--accent)",
                          "&:hover": { bgcolor: "var(--accent-press)" },
                          minWidth: 180,
                        }}
                      >
                        {resolving.has(item.id) ? (
                          <CircularProgress size={20} sx={{ color: "#FFF" }} />
                        ) : (
                          "Marquer traité"
                        )}
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
          </>
        )}

        <Retour
          ouvert={snack.open}
          message={snack.msg}
          gravite={snack.sev}
          onFermer={() => setSnack((s) => ({ ...s, open: false }))}
        />
      </Box>
    </PageContainer>
  );
}
