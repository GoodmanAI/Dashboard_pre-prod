"use client";

import Retour from "@/components/shared/Retour";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Add,
  Archive,
  Delete,
  Edit,
  PictureAsPdf,
  UploadFile,
} from "@mui/icons-material";
import { useDroitPage } from "@/hooks/useDroitPage";
import { PAGES } from "@/lib/permissions";

/**
 * Bloc « Documents demandés aux patients » de la page /parametrage.
 *
 * Documents qu'un centre demande au patient en plus de l'ordonnance
 * (questionnaire IRM, questionnaire mineur...), sur le meme lien de depot.
 * Plan workspace plans/2026-10-documents-demandes.md, DECISIONS.md du
 * 11/10/2026.
 *
 * Partage des droits :
 *  - le client ne fait que mettre a disposition, ou non, chaque document.
 *    Ses interrupteurs passent par la barre d'enregistrement de l'ecran,
 *    comme les autres cartes (`enregistrer()`).
 *  - l'admin (equipe Lyrae), sur le meme ecran, ajoute un document, le
 *    modifie, depose son modele PDF et l'archive. Ces gestes-la partent
 *    tout de suite : un fichier ne s'enregistre pas « plus tard ».
 */

type ExamKey = "radiographie" | "irm" | "echographie" | "scanner" | "mammo";

const EXAM_TYPES: { key: ExamKey; label: string }[] = [
  { key: "radiographie", label: "Radiographie" },
  { key: "irm", label: "IRM" },
  { key: "echographie", label: "Échographie" },
  { key: "scanner", label: "Scanner" },
  { key: "mammo", label: "Mammographie" },
];

type DocumentVue = {
  id: number;
  libelle: string;
  typesExamen: ExamKey[];
  mineursSeulement: boolean;
  grossesseSeulement: boolean;
  disponible: boolean;
  modele: { nom: string | null; octets: number; maj: string | null } | null;
  archive: boolean;
};

type Brouillon = {
  libelle: string;
  typesExamen: ExamKey[];
  mineursSeulement: boolean;
  grossesseSeulement: boolean;
};

const BROUILLON_VIDE: Brouillon = {
  libelle: "",
  typesExamen: [],
  mineursSeulement: false,
  grossesseSeulement: false,
};

// « Pour qui » : deux booleens en base, qui s'excluent
// (plans/2026-10-attestation-grossesse.md).
type PourQui = "tous" | "mineurs" | "grossesse";

function pourQuiDe(b: Pick<Brouillon, "mineursSeulement" | "grossesseSeulement">): PourQui {
  if (b.mineursSeulement) return "mineurs";
  if (b.grossesseSeulement) return "grossesse";
  return "tous";
}

export type DocumentsDemandesHandle = {
  /** Rend `false` si rien n'a été enregistré. */
  enregistrer: () => Promise<boolean>;
};

function libelleTypes(types: ExamKey[]): string[] {
  return EXAM_TYPES.filter((t) => types.includes(t.key)).map((t) => t.label);
}

function tailleLisible(octets: number): string {
  return octets >= 1024 * 1024
    ? `${(octets / 1024 / 1024).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

const DocumentsDemandesCard = forwardRef<
  DocumentsDemandesHandle,
  {
    userProductId: number;
    admin: boolean;
    onDirtyChange?: (dirty: boolean) => void;
  }
>(function DocumentsDemandesCard({ userProductId, admin, onDirtyChange }, ref) {
  const { peutEcrire } = useDroitPage(PAGES.PARAMETRAGE);
  const readOnly = !peutEcrire;

  const [docs, setDocs] = useState<DocumentVue[]>([]);
  // Interrupteurs modifies, en attente de la barre d'enregistrement.
  const [disponibles, setDisponibles] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [ajout, setAjout] = useState<Brouillon | null>(null);
  const [edition, setEdition] = useState<{ id: number; brouillon: Brouillon } | null>(
    null
  );
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    sev: "success" | "error";
  }>({ open: false, msg: "", sev: "success" });
  const fichierRef = useRef<HTMLInputElement>(null);
  const [cibleModele, setCibleModele] = useState<number | null>(null);

  const dirty = Object.keys(disponibles).length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/documents-demandes?userProductId=${userProductId}${admin ? "&archives=1" : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocs(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.error("[DocumentsDemandesCard] lecture:", err);
      setSnack({
        open: true,
        msg: "Impossible de charger les documents demandés. Rechargez la page.",
        sev: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [userProductId, admin]);

  useEffect(() => {
    charger();
  }, [charger]);

  const dire = (msg: string, sev: "success" | "error" = "success") =>
    setSnack({ open: true, msg, sev });

  // ---- Client et admin : interrupteurs, via la barre d'enregistrement ----

  const enregistrer = useCallback(async (): Promise<boolean> => {
    const ids = Object.keys(disponibles).map(Number);
    if (ids.length === 0) return true;
    try {
      for (const id of ids) {
        const res = await fetch(`/api/documents-demandes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disponible: disponibles[id] }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      }
      setDisponibles({});
      await charger();
      return true;
    } catch (err: any) {
      dire(
        err?.message ||
          "Les documents demandés n'ont pas été enregistrés. Réessayez dans un instant.",
        "error"
      );
      return false;
    }
  }, [disponibles, charger]);

  useImperativeHandle(ref, () => ({ enregistrer }), [enregistrer]);

  function basculer(doc: DocumentVue, valeur: boolean) {
    setDisponibles((prev) => {
      const next = { ...prev };
      if (valeur === doc.disponible) delete next[doc.id];
      else next[doc.id] = valeur;
      return next;
    });
  }

  // ---- Admin : gestes immediats ----

  async function appeler(
    url: string,
    init: RequestInit,
    succes: string
  ): Promise<boolean> {
    setOccupe(true);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erreur ${res.status}. Réessayez.`);
      }
      await charger();
      dire(succes);
      return true;
    } catch (err: any) {
      dire(err?.message || "L'opération a échoué. Réessayez.", "error");
      return false;
    } finally {
      setOccupe(false);
    }
  }

  async function creer() {
    if (!ajout) return;
    const ok = await appeler(
      "/api/documents-demandes",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userProductId, ...ajout }),
      },
      `« ${ajout.libelle.trim()} » ajouté. Déposez son modèle, puis le centre le met à disposition.`
    );
    if (ok) setAjout(null);
  }

  async function modifier() {
    if (!edition) return;
    const ok = await appeler(
      `/api/documents-demandes/${edition.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edition.brouillon),
      },
      "Document modifié."
    );
    if (ok) setEdition(null);
  }

  function choisirModele(id: number) {
    setCibleModele(id);
    fichierRef.current?.click();
  }

  async function deposerModele(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier || cibleModele === null) return;
    const fd = new FormData();
    fd.append("fichier", fichier);
    await appeler(
      `/api/documents-demandes/${cibleModele}/modele`,
      { method: "PUT", body: fd },
      "Modèle déposé."
    );
    setCibleModele(null);
  }

  const actifs = docs.filter((d) => !d.archive);
  const archives = docs.filter((d) => d.archive);
  const nbDisponibles = actifs.filter((d) =>
    d.id in disponibles ? disponibles[d.id] : d.disponible
  ).length;

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="h6">Questionnaires et documents</Typography>
          <Chip
            size="small"
            label={
              actifs.length === 0
                ? "aucun document"
                : `${nbDisponibles} / ${actifs.length} mis à disposition`
            }
            sx={{
              bgcolor:
                nbDisponibles === 0
                  ? "rgba(0,0,0,0.06)"
                  : "rgba(var(--accent-rgb), 0.15)",
              color: nbDisponibles === 0 ? "text.secondary" : "var(--accent-deep)",
              fontWeight: 700,
            }}
          />
        </Stack>
      </AccordionSummary>

      <AccordionDetails>
        <input
          ref={fichierRef}
          type="file"
          hidden
          accept="application/pdf,.pdf"
          onChange={deposerModele}
        />
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Alert
              severity="info"
              variant="outlined"
              sx={{ borderColor: "rgba(var(--accent-rgb), 0.4)" }}
            >
              Ces documents sont demandés au patient sur le même lien que
              l&apos;ordonnance, selon l&apos;examen (et selon l&apos;âge ou le
              sexe, pour un document réservé aux mineurs ou aux femmes de 12 à
              55 ans). Le patient télécharge votre
              modèle, le remplit et le renvoie. Il est rattaché au rendez-vous
              dans votre logiciel de gestion. Ceux qui ne l&apos;ont pas renvoyé
              apparaissent dans « Questionnaires et documents », sur la page des
              ordonnances.
            </Alert>

            {actifs.length === 0 && !admin && (
              <Typography variant="body2" color="text.secondary">
                Aucun document n&apos;est prévu pour votre centre. Envoyez-nous
                vos questionnaires en PDF (IRM, patient mineur...) : nous les
                ajoutons ici, et vous choisissez ensuite de les mettre à
                disposition.
              </Typography>
            )}

            {actifs.map((d) => {
              const dispo = d.id in disponibles ? disponibles[d.id] : d.disponible;
              const enEdition = edition?.id === d.id;
              return (
                <Card key={d.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  {enEdition && edition ? (
                    <FormulaireDocument
                      brouillon={edition.brouillon}
                      onChange={(b) => setEdition({ id: d.id, brouillon: b })}
                      onValider={modifier}
                      onAnnuler={() => setEdition(null)}
                      occupe={occupe}
                      libelleValider="Enregistrer"
                    />
                  ) : (
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      justifyContent="space-between"
                      alignItems={{ xs: "stretch", md: "flex-start" }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {d.libelle}
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          useFlexGap
                          flexWrap="wrap"
                          sx={{ my: 1 }}
                        >
                          {libelleTypes(d.typesExamen).map((l) => (
                            <Chip key={l} size="small" label={l} />
                          ))}
                          {d.mineursSeulement && (
                            <Chip
                              size="small"
                              label="Patients mineurs seulement"
                              sx={{ bgcolor: "rgba(234,88,12,0.12)", color: "#9a3412" }}
                            />
                          )}
                          {d.grossesseSeulement && (
                            <Chip
                              size="small"
                              label="Femmes de 12 à 55 ans seulement"
                              sx={{ bgcolor: "rgba(234,88,12,0.12)", color: "#9a3412" }}
                            />
                          )}
                        </Stack>
                        {d.modele ? (
                          <Button
                            size="small"
                            component="a"
                            href={`/api/documents-demandes/${d.id}/modele`}
                            target="_blank"
                            rel="noopener"
                            startIcon={<PictureAsPdf />}
                            sx={{ px: 0, color: "var(--accent-deep)" }}
                          >
                            {d.modele.nom ?? "Modèle"} ({tailleLisible(d.modele.octets)})
                          </Button>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Sans modèle : le patient envoie ce document sans
                            rien télécharger.
                          </Typography>
                        )}

                        {admin && (
                          <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                            sx={{ mt: 1.5 }}
                          >
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<UploadFile />}
                              disabled={occupe}
                              onClick={() => choisirModele(d.id)}
                            >
                              {d.modele ? "Remplacer le modèle" : "Déposer le modèle (PDF)"}
                            </Button>
                            {d.modele && (
                              <Button
                                size="small"
                                startIcon={<Delete />}
                                disabled={occupe}
                                onClick={() =>
                                  appeler(
                                    `/api/documents-demandes/${d.id}/modele`,
                                    { method: "DELETE" },
                                    "Modèle retiré."
                                  )
                                }
                              >
                                Retirer le modèle
                              </Button>
                            )}
                            <Button
                              size="small"
                              startIcon={<Edit />}
                              disabled={occupe}
                              onClick={() =>
                                setEdition({
                                  id: d.id,
                                  brouillon: {
                                    libelle: d.libelle,
                                    typesExamen: d.typesExamen,
                                    mineursSeulement: d.mineursSeulement,
                                    grossesseSeulement: d.grossesseSeulement,
                                  },
                                })
                              }
                            >
                              Modifier
                            </Button>
                            <Button
                              size="small"
                              color="inherit"
                              startIcon={<Archive />}
                              disabled={occupe}
                              onClick={() =>
                                appeler(
                                  `/api/documents-demandes/${d.id}`,
                                  {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ archive: true }),
                                  },
                                  `« ${d.libelle} » archivé. Les liens déjà envoyés le gardent.`
                                )
                              }
                            >
                              Archiver
                            </Button>
                          </Stack>
                        )}
                      </Box>

                      <FormControlLabel
                        sx={{ flexShrink: 0, mr: 0 }}
                        control={
                          <Switch
                            checked={dispo}
                            disabled={readOnly}
                            onChange={(e) => basculer(d, e.target.checked)}
                          />
                        }
                        label="Mis à disposition des patients"
                      />
                    </Stack>
                  )}
                </Card>
              );
            })}

            {admin &&
              (ajout ? (
                <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <FormulaireDocument
                    brouillon={ajout}
                    onChange={setAjout}
                    onValider={creer}
                    onAnnuler={() => setAjout(null)}
                    occupe={occupe}
                    libelleValider="Ajouter"
                  />
                </Card>
              ) : (
                <Box>
                  <Button
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={() => setAjout({ ...BROUILLON_VIDE })}
                  >
                    Ajouter un document
                  </Button>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    Visible par l&apos;équipe Lyrae seulement. Le centre ne voit
                    que l&apos;interrupteur.
                  </Typography>
                </Box>
              ))}

            {admin && archives.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Archivés
                </Typography>
                <Stack spacing={1}>
                  {archives.map((d) => (
                    <Stack
                      key={d.id}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Typography variant="body2" color="text.secondary">
                        {d.libelle}
                      </Typography>
                      <Button
                        size="small"
                        disabled={occupe}
                        onClick={() =>
                          appeler(
                            `/api/documents-demandes/${d.id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ archive: false }),
                            },
                            `« ${d.libelle} » restauré. Il n'est pas mis à disposition.`
                          )
                        }
                      >
                        Restaurer
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}

        <Retour
          ouvert={snack.open}
          message={snack.msg}
          gravite={snack.sev}
          onFermer={() => setSnack((s) => ({ ...s, open: false }))}
        />
      </AccordionDetails>
    </Accordion>
  );
});

export default DocumentsDemandesCard;

/** Nom, types d'examen et « mineurs seulement » d'un document (admin). */
function FormulaireDocument({
  brouillon,
  onChange,
  onValider,
  onAnnuler,
  occupe,
  libelleValider,
}: {
  brouillon: Brouillon;
  onChange: (b: Brouillon) => void;
  onValider: () => void;
  onAnnuler: () => void;
  occupe: boolean;
  libelleValider: string;
}) {
  const valide =
    brouillon.libelle.trim().length > 0 && brouillon.typesExamen.length > 0;
  return (
    <Stack spacing={1.5}>
      <TextField
        size="small"
        label="Nom lu par le patient et la secrétaire"
        placeholder="Questionnaire IRM"
        value={brouillon.libelle}
        onChange={(e) => onChange({ ...brouillon, libelle: e.target.value })}
        inputProps={{ maxLength: 120 }}
        fullWidth
      />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Demandé pour
        </Typography>
        <Stack direction="row" useFlexGap flexWrap="wrap">
          {EXAM_TYPES.map((t) => (
            <FormControlLabel
              key={t.key}
              control={
                <Checkbox
                  size="small"
                  checked={brouillon.typesExamen.includes(t.key)}
                  onChange={(e) =>
                    onChange({
                      ...brouillon,
                      typesExamen: e.target.checked
                        ? [...brouillon.typesExamen, t.key]
                        : brouillon.typesExamen.filter((k) => k !== t.key),
                    })
                  }
                />
              }
              label={t.label}
            />
          ))}
        </Stack>
      </Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Pour qui
        </Typography>
        <RadioGroup
          value={pourQuiDe(brouillon)}
          onChange={(e) => {
            const v = e.target.value as PourQui;
            onChange({
              ...brouillon,
              mineursSeulement: v === "mineurs",
              grossesseSeulement: v === "grossesse",
            });
          }}
        >
          <FormControlLabel
            value="tous"
            control={<Radio size="small" />}
            label="Tous les patients"
          />
          <FormControlLabel
            value="mineurs"
            control={<Radio size="small" />}
            label="Seulement pour un patient mineur"
          />
          <FormControlLabel
            value="grossesse"
            control={<Radio size="small" />}
            label="Seulement pour une femme de 12 à 55 ans"
          />
        </RadioGroup>
        {brouillon.grossesseSeulement && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
            Si le robot ne connaît pas le sexe ou l&apos;âge du patient, le
            document part quand même.
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          disabled={!valide || occupe}
          onClick={onValider}
          sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
        >
          {libelleValider}
        </Button>
        <Button onClick={onAnnuler} disabled={occupe}>
          Annuler
        </Button>
      </Stack>
    </Stack>
  );
}
