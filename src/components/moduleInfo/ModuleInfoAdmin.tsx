"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  IconCheck,
  IconEyeOff,
  IconMessageDots,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

/**
 * ModuleInfoAdmin (refonte design 2026-08-06).
 * -----------------------------------------------------------------------------
 * UI d'edition des Q/R FAQ patient consommees par le bot IA d'accueil.
 * - Pas d'affichage du slug id (usage interne uniquement).
 * - Pas de champ categorie (retire de l'UI, reste en DB pour compat).
 * - Recherche full-text locale sur question + reponse.
 * - Actions par item : editer (inline), activer/desactiver, supprimer.
 * - Chaque mutation bumpe la version + webhook Azure warm-up en fire-and-forget.
 */

const BRAND = "#48C8AF";
const BRAND_DARK = "#2C9B85";
const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F7FAFB";
const SURFACE_HOVER = "#F1F7F5";
const BORDER = "#E4EAEE";
const DANGER = "#E1573B";

interface Item {
  id: string;
  question: string;
  reponse: string;
  categorie: string | null;
  enabled: boolean;
  order: number;
  updatedAt: string;
}

interface EditableItem extends Item {
  _draft?: { question: string; reponse: string };
  _saving?: boolean;
  _justSaved?: boolean;
}

export default function ModuleInfoAdmin({ userProductId }: { userProductId: number }) {
  const [items, setItems] = useState<EditableItem[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; kind: "success" | "error" } | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newReponse, setNewReponse] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(userProductId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/module-info/items?userProductId=${userProductId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setVersion(data.version ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [userProductId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.question.toLowerCase().includes(q) || it.reponse.toLowerCase().includes(q)
    );
  }, [items, query]);

  const activeCount = items.filter((i) => i.enabled).length;
  const inactiveCount = items.length - activeCount;

  const flashSaved = (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, _justSaved: true } : it)));
    setTimeout(() => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, _justSaved: false } : it))
      );
    }, 1600);
  };

  const handleCreate = async () => {
    if (!newQuestion.trim() || !newReponse.trim()) {
      setSnack({ msg: "Question et réponse requises", kind: "error" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/module-info/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProductId,
          question: newQuestion.trim(),
          reponse: newReponse.trim(),
          enabled: true,
          order: items.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNewQuestion("");
      setNewReponse("");
      setShowCreate(false);
      setSnack({ msg: "Q/R ajoutée", kind: "success" });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur création", kind: "error" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (item: EditableItem) => {
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, _saving: true } : it))
    );
    try {
      const res = await fetch(`/api/module-info/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
      flashSaved(item.id);
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur", kind: "error" });
      load();
    }
  };

  const startEdit = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, _draft: { question: it.question, reponse: it.reponse } }
          : it
      )
    );
  };

  const cancelEdit = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, _draft: undefined } : it))
    );
  };

  const updateDraft = (id: string, key: "question" | "reponse", value: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it._draft ? { ...it, _draft: { ...it._draft, [key]: value } } : it
      )
    );
  };

  const handleSave = async (item: EditableItem) => {
    if (!item._draft) return;
    if (!item._draft.question.trim() || !item._draft.reponse.trim()) {
      setSnack({ msg: "Question et réponse requises", kind: "error" });
      return;
    }
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, _saving: true } : it))
    );
    try {
      const res = await fetch(`/api/module-info/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: item._draft.question.trim(),
          reponse: item._draft.reponse.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
      flashSaved(item.id);
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur sauvegarde", kind: "error" });
      load();
    }
  };

  const handleDelete = async (item: EditableItem) => {
    if (
      !confirm(
        `Supprimer définitivement cette Q/R ?\n\n« ${item.question.slice(0, 120)}${
          item.question.length > 120 ? "…" : ""
        } »`
      )
    )
      return;
    try {
      const res = await fetch(`/api/module-info/items/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnack({ msg: "Q/R supprimée", kind: "success" });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur suppression", kind: "error" });
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h5"
          sx={{ fontWeight: 700, color: INK, letterSpacing: "-0.02em", mb: 0.5 }}
        >
          FAQ patient
        </Typography>
        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2, maxWidth: 620 }}>
          Ces questions/réponses sont utilisées par le bot d&apos;accueil pour répondre
          aux patients au téléphone. Chaque modification est prise en compte
          automatiquement.
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip
            size="small"
            label={`${activeCount} active${activeCount > 1 ? "s" : ""}`}
            sx={{
              bgcolor: BRAND,
              color: "#fff",
              fontWeight: 600,
              fontSize: 12,
              height: 24,
            }}
          />
          {inactiveCount > 0 && (
            <Chip
              size="small"
              label={`${inactiveCount} désactivée${inactiveCount > 1 ? "s" : ""}`}
              sx={{
                bgcolor: SURFACE_MUTED,
                color: INK_MUTED,
                fontWeight: 500,
                fontSize: 12,
                height: 24,
                border: `1px solid ${BORDER}`,
              }}
            />
          )}
        </Stack>
      </Box>

      {/* Barre : recherche + bouton */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Rechercher dans les questions ou réponses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <IconSearch size={16} color={INK_MUTED} />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setQuery("")}>
                  <IconX size={14} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              bgcolor: SURFACE,
              "& fieldset": { borderColor: BORDER },
              "&:hover fieldset": { borderColor: BRAND },
              "&.Mui-focused fieldset": { borderColor: BRAND, borderWidth: 2 },
            },
          }}
        />
        <Button
          variant="contained"
          startIcon={<IconPlus size={16} />}
          onClick={() => setShowCreate((v) => !v)}
          disableElevation
          sx={{
            bgcolor: showCreate ? INK_MUTED : BRAND,
            color: "#fff",
            fontWeight: 600,
            textTransform: "none",
            px: 2.5,
            whiteSpace: "nowrap",
            "&:hover": { bgcolor: showCreate ? INK : BRAND_DARK },
          }}
        >
          {showCreate ? "Fermer" : "Nouvelle Q/R"}
        </Button>
      </Stack>

      {/* Formulaire de creation */}
      {showCreate && (
        <Card
          elevation={0}
          sx={{
            p: 2.5,
            mb: 2.5,
            border: `1.5px solid ${BRAND}`,
            borderRadius: 2,
            bgcolor: "#F5FDFB",
          }}
        >
          <Typography variant="subtitle2" sx={{ color: INK, fontWeight: 700, mb: 1.5 }}>
            Nouvelle question/réponse
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              label="Question du patient"
              fullWidth
              multiline
              minRows={1}
              maxRows={3}
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Ex : Quels sont vos horaires ?"
              disabled={creating}
              size="small"
            />
            <TextField
              label="Réponse à donner par le bot"
              fullWidth
              multiline
              minRows={3}
              maxRows={10}
              value={newReponse}
              onChange={(e) => setNewReponse(e.target.value)}
              placeholder="Ex : Le centre est ouvert du lundi au vendredi de 8h à 19h et le samedi matin de 8h à 12h."
              disabled={creating}
              size="small"
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                onClick={() => {
                  setShowCreate(false);
                  setNewQuestion("");
                  setNewReponse("");
                }}
                disabled={creating}
                sx={{ textTransform: "none", color: INK_MUTED }}
              >
                Annuler
              </Button>
              <Button
                variant="contained"
                onClick={handleCreate}
                disableElevation
                disabled={creating || !newQuestion.trim() || !newReponse.trim()}
                sx={{
                  bgcolor: BRAND,
                  color: "#fff",
                  fontWeight: 600,
                  textTransform: "none",
                  px: 3,
                  "&:hover": { bgcolor: BRAND_DARK },
                }}
              >
                {creating ? "Ajout…" : "Ajouter"}
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} sx={{ color: BRAND }} />
        </Stack>
      )}

      {!loading && items.length === 0 && !error && (
        <Card
          elevation={0}
          sx={{
            p: 6,
            textAlign: "center",
            border: `1.5px dashed ${BORDER}`,
            borderRadius: 3,
            bgcolor: SURFACE_MUTED,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              bgcolor: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 1.5,
              border: `1px solid ${BORDER}`,
            }}
          >
            <IconMessageDots size={28} color={BRAND} />
          </Box>
          <Typography sx={{ color: INK, fontWeight: 600, mb: 0.5 }}>
            Aucune question pour le moment
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2 }}>
            Ajoutez la première question fréquemment posée par vos patients.
          </Typography>
          <Button
            variant="contained"
            startIcon={<IconPlus size={16} />}
            onClick={() => setShowCreate(true)}
            disableElevation
            sx={{
              bgcolor: BRAND,
              color: "#fff",
              fontWeight: 600,
              textTransform: "none",
              "&:hover": { bgcolor: BRAND_DARK },
            }}
          >
            Créer une Q/R
          </Button>
        </Card>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && (
        <Card
          elevation={0}
          sx={{
            p: 3,
            textAlign: "center",
            border: `1px dashed ${BORDER}`,
            borderRadius: 2,
            bgcolor: SURFACE_MUTED,
          }}
        >
          <Typography variant="body2" sx={{ color: INK_MUTED }}>
            Aucune Q/R ne correspond à « {query} ».
          </Typography>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <Stack spacing={1.5}>
          {filtered.map((item) => (
            <QRCard
              key={item.id}
              item={item}
              onToggle={handleToggle}
              onEdit={startEdit}
              onCancelEdit={cancelEdit}
              onUpdateDraft={updateDraft}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </Stack>
      )}

      {!loading && version && items.length > 0 && (
        <>
          <Divider sx={{ mt: 4, mb: 1.5 }} />
          <Typography
            variant="caption"
            sx={{ color: INK_MUTED, display: "block", textAlign: "center" }}
          >
            Dernière mise à jour :{" "}
            {new Date(version).toLocaleString("fr-FR", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </Typography>
        </>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snack?.kind ?? "success"}
          onClose={() => setSnack(null)}
          variant="filled"
          sx={{
            fontWeight: 500,
            bgcolor: snack?.kind === "error" ? DANGER : BRAND_DARK,
          }}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

interface QRCardProps {
  item: EditableItem;
  onToggle: (item: EditableItem) => void;
  onEdit: (id: string) => void;
  onCancelEdit: (id: string) => void;
  onUpdateDraft: (id: string, key: "question" | "reponse", value: string) => void;
  onSave: (item: EditableItem) => void;
  onDelete: (item: EditableItem) => void;
}

function QRCard({
  item,
  onToggle,
  onEdit,
  onCancelEdit,
  onUpdateDraft,
  onSave,
  onDelete,
}: QRCardProps) {
  const isEditing = !!item._draft;
  const hasChanges =
    isEditing &&
    item._draft &&
    (item._draft.question !== item.question || item._draft.reponse !== item.reponse);
  const isDisabled = !item.enabled;

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 2,
        border: `1px solid ${BORDER}`,
        bgcolor: SURFACE,
        transition: "all 0.15s ease",
        position: "relative",
        overflow: "visible",
        opacity: isDisabled && !isEditing ? 0.62 : 1,
        "&:hover": {
          borderColor: isEditing ? BRAND : "#C8D4DB",
          bgcolor: isEditing ? SURFACE : SURFACE_HOVER,
        },
        ...(isEditing && {
          borderColor: BRAND,
          borderWidth: 1.5,
          boxShadow: `0 0 0 3px rgba(72, 200, 175, 0.12)`,
        }),
      }}
    >
      {item._justSaved && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            bgcolor: BRAND,
            color: "#fff",
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontSize: 11,
            fontWeight: 600,
            zIndex: 1,
          }}
        >
          <IconCheck size={12} /> Enregistré
        </Box>
      )}

      <Box sx={{ p: 2.5, display: "flex", gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {isEditing && item._draft ? (
            <Stack spacing={1.5}>
              <TextField
                label="Question"
                fullWidth
                size="small"
                multiline
                maxRows={3}
                value={item._draft.question}
                onChange={(e) => onUpdateDraft(item.id, "question", e.target.value)}
                disabled={item._saving}
                autoFocus
              />
              <TextField
                label="Réponse"
                fullWidth
                size="small"
                multiline
                minRows={3}
                maxRows={12}
                value={item._draft.reponse}
                onChange={(e) => onUpdateDraft(item.id, "reponse", e.target.value)}
                disabled={item._saving}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => onSave(item)}
                  disabled={!hasChanges || item._saving}
                  disableElevation
                  sx={{
                    bgcolor: BRAND,
                    color: "#fff",
                    fontWeight: 600,
                    textTransform: "none",
                    px: 2.5,
                    "&:hover": { bgcolor: BRAND_DARK },
                    "&.Mui-disabled": { bgcolor: "#D5DFE5", color: "#8FA0AE" },
                  }}
                >
                  {item._saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button
                  size="small"
                  onClick={() => onCancelEdit(item.id)}
                  disabled={item._saving}
                  sx={{ textTransform: "none", color: INK_MUTED }}
                >
                  Annuler
                </Button>
              </Stack>
            </Stack>
          ) : (
            <>
              <Typography
                sx={{
                  fontWeight: 600,
                  color: INK,
                  fontSize: 15,
                  lineHeight: 1.4,
                  mb: 0.75,
                }}
              >
                {item.question}
              </Typography>
              <Typography
                sx={{
                  color: INK_MUTED,
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {item.reponse}
              </Typography>
            </>
          )}
        </Box>

        {!isEditing && (
          <Stack
            spacing={0.5}
            alignItems="center"
            sx={{ pl: 1, borderLeft: `1px solid ${BORDER}` }}
          >
            <Tooltip title={item.enabled ? "Désactiver" : "Activer"} placement="left">
              <Box>
                <Switch
                  size="small"
                  checked={item.enabled}
                  onChange={() => onToggle(item)}
                  disabled={item._saving}
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      bgcolor: BRAND,
                      opacity: 1,
                    },
                    "& .MuiSwitch-track": { bgcolor: "#CBD5DB", opacity: 1 },
                  }}
                />
              </Box>
            </Tooltip>
            <Tooltip title="Modifier" placement="left">
              <IconButton
                size="small"
                onClick={() => onEdit(item.id)}
                sx={{ color: INK_MUTED, "&:hover": { color: BRAND, bgcolor: SURFACE_HOVER } }}
              >
                <IconPencil size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Supprimer" placement="left">
              <IconButton
                size="small"
                onClick={() => onDelete(item)}
                sx={{
                  color: INK_MUTED,
                  "&:hover": { color: DANGER, bgcolor: "#FDF2EF" },
                }}
              >
                <IconTrash size={16} />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Box>

      {isDisabled && !isEditing && (
        <Box
          sx={{
            px: 2.5,
            py: 0.75,
            bgcolor: "#F5F7F9",
            borderTop: `1px solid ${BORDER}`,
            borderRadius: "0 0 8px 8px",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
          }}
        >
          <IconEyeOff size={13} color={INK_MUTED} />
          <Typography variant="caption" sx={{ color: INK_MUTED, fontWeight: 500 }}>
            Désactivée — invisible pour le bot
          </Typography>
        </Box>
      )}
    </Card>
  );
}
