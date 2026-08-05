"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
  IconDeviceFloppy,
  IconMessageCircleQuestion,
} from "@tabler/icons-react";

/**
 * ModuleInfoAdmin (chantier 2026-08-05).
 * -----------------------------------------------------------------------------
 * UI d'edition des Q/R FAQ patient consommees par le bot IA d'accueil
 * (Azure Functions module_info -> GET /api/module-info/[userProductId]).
 *
 * Actions supportees :
 *   - Ajouter une Q/R (bouton en tete)
 *   - Editer question / reponse / categorie inline (sauvegarde manuelle)
 *   - Toggle enabled (sauvegarde immediate)
 *   - Supprimer (avec confirm)
 *
 * Chaque mutation cote backend bump `moduleInfoVersion` du UserProduct et
 * declenche le webhook Azure warm-up en fire-and-forget.
 */

const BRAND_TEAL = "#48C8AF";
const TEXT_MAIN = "#1F3448";
const TEXT_MUTED = "#7A8FA6";

interface Item {
  id: string;
  question: string;
  reponse: string;
  categorie: string | null;
  enabled: boolean;
  order: number;
  updatedAt: string;
}

// Etat local d'edition : on garde la version originale pour detecter les
// modifications et afficher le bouton "Enregistrer" que quand necessaire.
interface EditableItem extends Item {
  _draft?: {
    question: string;
    reponse: string;
    categorie: string;
  };
  _saving?: boolean;
  _expanded?: boolean;
}

export default function ModuleInfoAdmin({ userProductId }: { userProductId: number }) {
  const [items, setItems] = useState<EditableItem[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; kind: "success" | "error" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newReponse, setNewReponse] = useState("");
  const [newCategorie, setNewCategorie] = useState("");
  const [showCreate, setShowCreate] = useState(false);

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

  const handleCreate = async () => {
    if (!newQuestion.trim() || !newReponse.trim()) {
      setSnack({ msg: "Question et reponse requises", kind: "error" });
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
          categorie: newCategorie.trim() || null,
          enabled: true,
          order: items.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNewQuestion("");
      setNewReponse("");
      setNewCategorie("");
      setShowCreate(false);
      setSnack({ msg: "Q/R ajoutee. Azure sera notifie.", kind: "success" });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur creation", kind: "error" });
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
      setSnack({
        msg: !item.enabled ? "Q/R activee." : "Q/R desactivee (invisible pour le bot).",
        kind: "success",
      });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur toggle", kind: "error" });
      load();
    }
  };

  const startEdit = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              _expanded: true,
              _draft: {
                question: it.question,
                reponse: it.reponse,
                categorie: it.categorie ?? "",
              },
            }
          : it
      )
    );
  };

  const cancelEdit = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, _draft: undefined, _expanded: false } : it
      )
    );
  };

  const updateDraft = (id: string, key: "question" | "reponse" | "categorie", value: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it._draft
          ? { ...it, _draft: { ...it._draft, [key]: value } }
          : it
      )
    );
  };

  const handleSave = async (item: EditableItem) => {
    if (!item._draft) return;
    if (!item._draft.question.trim() || !item._draft.reponse.trim()) {
      setSnack({ msg: "Question et reponse requises", kind: "error" });
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
          categorie: item._draft.categorie.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnack({ msg: "Q/R sauvegardee. Azure sera notifie.", kind: "success" });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur sauvegarde", kind: "error" });
      load();
    }
  };

  const handleDelete = async (item: EditableItem) => {
    if (!confirm(`Supprimer definitivement cette Q/R ?\n\n"${item.question.slice(0, 100)}..."`)) return;
    try {
      const res = await fetch(`/api/module-info/items/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnack({ msg: "Q/R supprimee. Azure sera notifie.", kind: "success" });
      load();
    } catch (e: any) {
      setSnack({ msg: e?.message ?? "Erreur suppression", kind: "error" });
    }
  };

  return (
    <Box>
      {/* Header : titre + version + bouton Ajouter */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: TEXT_MAIN, mb: 0.5 }}>
            <IconMessageCircleQuestion
              size={20}
              style={{ verticalAlign: "middle", marginRight: 8, color: BRAND_TEAL }}
            />
            FAQ patient (bot d&apos;accueil)
          </Typography>
          <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
            Ces Q/R sont utilisees par le bot vocal pour repondre aux questions
            des patients. Toute modification declenche une notification a Azure
            pour reconstruire la base de connaissances.
            {version && (
              <>
                {" "}Version courante : <code style={{ fontSize: 11 }}>{new Date(version).toLocaleString("fr-FR")}</code>
              </>
            )}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<IconPlus size={16} />}
          onClick={() => setShowCreate(!showCreate)}
          sx={{
            bgcolor: BRAND_TEAL,
            "&:hover": { bgcolor: "#3aa896" },
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          Ajouter une Q/R
        </Button>
      </Stack>

      {/* Formulaire creation */}
      {showCreate && (
        <Card sx={{ p: 2, mb: 2, border: `2px dashed ${BRAND_TEAL}` }}>
          <Stack spacing={2}>
            <TextField
              label="Question"
              fullWidth
              multiline
              minRows={1}
              maxRows={3}
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Ex : En cas d'examen demande en urgence, est-il possible..."
              disabled={creating}
            />
            <TextField
              label="Reponse"
              fullWidth
              multiline
              minRows={2}
              maxRows={8}
              value={newReponse}
              onChange={(e) => setNewReponse(e.target.value)}
              placeholder="Ex : Non, tous les examens sont realises uniquement sur rendez-vous."
              disabled={creating}
            />
            <TextField
              label="Categorie (optionnel)"
              size="small"
              value={newCategorie}
              onChange={(e) => setNewCategorie(e.target.value)}
              placeholder="Ex : Rendez-vous, Acces, Preparation..."
              disabled={creating}
              sx={{ maxWidth: 400 }}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="text"
                onClick={() => {
                  setShowCreate(false);
                  setNewQuestion("");
                  setNewReponse("");
                  setNewCategorie("");
                }}
                disabled={creating}
              >
                Annuler
              </Button>
              <Button
                variant="contained"
                onClick={handleCreate}
                disabled={creating || !newQuestion.trim() || !newReponse.trim()}
                sx={{ bgcolor: BRAND_TEAL, "&:hover": { bgcolor: "#3aa896" } }}
              >
                {creating ? "Ajout..." : "Ajouter"}
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      {/* Erreur */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: BRAND_TEAL } }} />
        </Stack>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <Card sx={{ p: 4, textAlign: "center", bgcolor: "#F8FAFC" }}>
          <IconMessageCircleQuestion size={40} color={TEXT_MUTED} style={{ opacity: 0.4 }} />
          <Typography sx={{ mt: 1, color: TEXT_MUTED }}>
            Aucune Q/R pour le moment. Ajoute la premiere via le bouton ci-dessus.
          </Typography>
        </Card>
      )}

      {/* Liste des items */}
      {!loading && items.length > 0 && (
        <Stack spacing={1.5}>
          {items.map((item) => {
            const isEditing = !!item._draft;
            const hasChanges =
              isEditing &&
              item._draft &&
              (item._draft.question !== item.question ||
                item._draft.reponse !== item.reponse ||
                (item._draft.categorie ?? "") !== (item.categorie ?? ""));

            return (
              <Card
                key={item.id}
                sx={{
                  p: 2,
                  borderLeft: `4px solid ${item.enabled ? BRAND_TEAL : "#cbd5e1"}`,
                  opacity: item.enabled ? 1 : 0.7,
                  transition: "opacity 0.15s",
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Categorie chip + toggle */}
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      {item.categorie && !isEditing && (
                        <Chip
                          size="small"
                          label={item.categorie}
                          sx={{ bgcolor: "#F1F5F9", fontSize: 11 }}
                        />
                      )}
                      {!item.enabled && (
                        <Chip
                          size="small"
                          label="Desactive"
                          sx={{ bgcolor: "#e5e7eb", color: TEXT_MUTED, fontSize: 11 }}
                        />
                      )}
                      <code style={{ fontSize: 10, color: TEXT_MUTED }}>{item.id}</code>
                    </Stack>

                    {/* Mode lecture */}
                    {!isEditing && (
                      <>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 700, color: TEXT_MAIN, mb: 0.5 }}
                        >
                          {item.question}
                        </Typography>
                        <Typography variant="body2" sx={{ color: TEXT_MUTED, whiteSpace: "pre-wrap" }}>
                          {item._expanded
                            ? item.reponse
                            : item.reponse.length > 200
                            ? item.reponse.slice(0, 200) + "…"
                            : item.reponse}
                        </Typography>
                        {item.reponse.length > 200 && (
                          <Button
                            size="small"
                            startIcon={item._expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                            onClick={() =>
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === item.id ? { ...it, _expanded: !it._expanded } : it
                                )
                              )
                            }
                            sx={{ textTransform: "none", color: TEXT_MUTED, mt: 0.5, px: 0 }}
                          >
                            {item._expanded ? "Voir moins" : "Voir plus"}
                          </Button>
                        )}
                      </>
                    )}

                    {/* Mode edition */}
                    {isEditing && item._draft && (
                      <Stack spacing={1.5}>
                        <TextField
                          label="Question"
                          fullWidth
                          size="small"
                          multiline
                          maxRows={3}
                          value={item._draft.question}
                          onChange={(e) => updateDraft(item.id, "question", e.target.value)}
                          disabled={item._saving}
                        />
                        <TextField
                          label="Reponse"
                          fullWidth
                          size="small"
                          multiline
                          minRows={2}
                          maxRows={10}
                          value={item._draft.reponse}
                          onChange={(e) => updateDraft(item.id, "reponse", e.target.value)}
                          disabled={item._saving}
                        />
                        <TextField
                          label="Categorie"
                          size="small"
                          value={item._draft.categorie}
                          onChange={(e) => updateDraft(item.id, "categorie", e.target.value)}
                          disabled={item._saving}
                          sx={{ maxWidth: 400 }}
                        />
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<IconDeviceFloppy size={16} />}
                            onClick={() => handleSave(item)}
                            disabled={!hasChanges || item._saving}
                            sx={{
                              bgcolor: BRAND_TEAL,
                              "&:hover": { bgcolor: "#3aa896" },
                              textTransform: "none",
                              fontWeight: 600,
                            }}
                          >
                            {item._saving ? "Sauvegarde..." : "Enregistrer"}
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => cancelEdit(item.id)}
                            disabled={item._saving}
                          >
                            Annuler
                          </Button>
                        </Stack>
                      </Stack>
                    )}
                  </Box>

                  {/* Actions (right) */}
                  <Stack spacing={0.5} alignItems="center">
                    <Switch
                      size="small"
                      checked={item.enabled}
                      onChange={() => handleToggle(item)}
                      disabled={item._saving}
                      sx={{
                        "& .MuiSwitch-switchBase.Mui-checked": { color: BRAND_TEAL },
                        "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                          bgcolor: BRAND_TEAL,
                        },
                      }}
                    />
                    {!isEditing && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => startEdit(item.id)}
                        sx={{ textTransform: "none", fontSize: 11, minWidth: 0, px: 1 }}
                      >
                        Editer
                      </Button>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(item)}
                      sx={{ color: "#dc2626" }}
                    >
                      <IconTrash size={16} />
                    </IconButton>
                  </Stack>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snack?.kind ?? "success"}
          onClose={() => setSnack(null)}
          sx={{ width: "100%" }}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
