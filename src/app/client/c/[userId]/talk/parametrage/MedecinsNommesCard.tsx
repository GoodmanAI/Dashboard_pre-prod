"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import Retour from "@/components/shared/Retour";

/**
 * « Nom du médecin » (03/11/2026).
 *
 * Le patient peut demander au robot « c'est avec quel médecin ? ». Le centre décide :
 * une case pour autoriser le robot à donner un nom, puis, médecin par médecin, ceux
 * qu'il peut nommer. La liste vient du logiciel de gestion du centre (Xplore), relue
 * à l'ouverture si elle a plus de 7 jours. Un médecin nouveau arrive non nommé.
 * Plan `lyrae/plans/2026-10-questions-sur-le-rdv-lyraetalk.md`, §7.
 */

type Medecin = {
  code: string;
  prefixe: string;
  prenom: string;
  nom: string;
  nomme: boolean;
  pasUnePersonne: boolean;
  nouveau: boolean;
  absences: number;
};

type Reponse = {
  actif: boolean;
  reluLe: string | null;
  relectureActive: boolean;
  medecins: Medecin[];
  relecture?: { ok: boolean; message?: string; nouveaux?: number } | null;
  error?: string;
};

const MOTS_MINUSCULES = new Set(["de", "du", "des", "la", "le", "d", "van", "von", "da", "di"]);

/** Même casse que celle que le robot dit (`casseNormale` du serveur). */
function casse(brut: string): string {
  const mots = brut.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return mots
    .map((m, i) =>
      i < mots.length - 1 && MOTS_MINUSCULES.has(m)
        ? m
        : m
            .split(/([-'])/)
            .map((p) => (p === "-" || p === "'" || !p ? p : p[0].toUpperCase() + p.slice(1)))
            .join(""),
    )
    .join(" ");
}

/** Ce que le robot dira : « le docteur Kenza Sahi », ou le nom seul. */
function nomDit(m: Medecin): string {
  const nom = [casse(m.prenom), casse(m.nom)].filter(Boolean).join(" ");
  return m.prefixe === "DR" ? `le docteur ${nom}` : nom;
}

function dateCourte(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function MedecinsNommesCard({
  userProductId,
  readOnly,
}: {
  userProductId: number;
  readOnly: boolean;
}) {
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [actif, setActif] = useState(false);
  const [nommes, setNommes] = useState<Record<string, boolean>>({});
  const [initial, setInitial] = useState("");
  const [enCours, setEnCours] = useState<"enregistrer" | "relire" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [retour, setRetour] = useState<string | null>(null);

  function prendre(d: Reponse) {
    setDonnees(d);
    setActif(d.actif);
    const n: Record<string, boolean> = {};
    for (const m of d.medecins) n[m.code] = m.nomme;
    setNommes(n);
    setInitial(JSON.stringify({ a: d.actif, n }));
  }

  useEffect(() => {
    if (!userProductId) return;
    let vivant = true;
    fetch(`/api/talk-medecins?userProductId=${userProductId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Reponse) => {
        if (!vivant) return;
        prendre(d);
        if (d.relecture && !d.relecture.ok && d.relecture.message) setErreur(d.relecture.message);
      })
      .catch(() => {
        if (vivant) setErreurChargement("La liste des médecins n'a pas pu être chargée. Rechargez la page.");
      });
    return () => {
      vivant = false;
    };
  }, [userProductId]);

  const modifie = JSON.stringify({ a: actif, n: nommes }) !== initial;
  const medecins = useMemo(() => donnees?.medecins ?? [], [donnees]);
  const personnes = useMemo(() => medecins.filter((m) => !m.pasUnePersonne), [medecins]);
  const autres = useMemo(() => medecins.filter((m) => m.pasUnePersonne), [medecins]);
  const combien = medecins.filter((m) => nommes[m.code]).length;
  const nouveaux = medecins.filter((m) => m.nouveau).length;

  function tous(valeur: boolean) {
    const n = { ...nommes };
    for (const m of personnes) n[m.code] = valeur;
    if (!valeur) for (const m of autres) n[m.code] = false;
    setNommes(n);
  }

  async function envoyer(methode: "PUT" | "POST") {
    setErreur(null);
    setEnCours(methode === "PUT" ? "enregistrer" : "relire");
    try {
      const r = await fetch("/api/talk-medecins", {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(methode === "PUT" ? { userProductId, actif, nommes } : { userProductId }),
      });
      const d: Reponse = await r.json().catch(() => ({}) as Reponse);
      if (!r.ok) throw new Error(d?.error || "L'opération n'a pas abouti. Réessayez.");
      if (methode === "POST" && modifie) {
        // Garder les choix en cours : seule la liste bouge.
        setDonnees(d);
        setNommes((p) => {
          const n: Record<string, boolean> = {};
          for (const m of d.medecins) n[m.code] = m.code in p ? p[m.code] : m.nomme;
          return n;
        });
      } else {
        prendre(d);
      }
      setRetour(
        methode === "PUT"
          ? "Choix enregistrés. Le robot les applique dès le prochain appel."
          : d.relecture?.nouveaux
            ? `Liste relue : ${d.relecture.nouveaux} médecin${d.relecture.nouveaux > 1 ? "s" : ""} ajouté${d.relecture.nouveaux > 1 ? "s" : ""}, non nommé${d.relecture.nouveaux > 1 ? "s" : ""}.`
            : "Liste relue, aucun nouveau médecin.",
      );
    } catch (e: any) {
      setErreur(e?.message ?? "L'opération n'a pas abouti. Réessayez.");
    } finally {
      setEnCours(null);
    }
  }

  function ligne(m: Medecin) {
    const coche = nommes[m.code] === true;
    return (
      <Stack
        key={m.code}
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ py: 0.75, px: 1, borderRadius: 1, "&:hover": { bgcolor: "rgba(0,0,0,0.03)" } }}
      >
        <Switch
          size="small"
          checked={coche}
          disabled={readOnly || !actif}
          onChange={(e) => setNommes((p) => ({ ...p, [m.code]: e.target.checked }))}
          inputProps={{ "aria-label": `Nommer ${nomDit(m)}` }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {[m.prefixe === "DR" ? "Dr" : "", casse(m.prenom), casse(m.nom)].filter(Boolean).join(" ") || m.code}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            Code {m.code}
            {coche && actif ? ` · le robot dit « ${nomDit(m)} »` : ""}
          </Typography>
        </Box>
        {m.nouveau && (
          <Chip size="small" label="Nouveau" sx={{ bgcolor: "rgba(var(--accent-rgb), 0.15)", color: "var(--accent-deep)", fontWeight: 700 }} />
        )}
        {m.absences >= 2 && <Chip size="small" label="Plus dans votre logiciel" variant="outlined" />}
      </Stack>
    );
  }

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 1 }}>
          <Typography variant="h6">Nom du médecin</Typography>
          {donnees && (
            <Chip
              size="small"
              label={
                !actif
                  ? "Le robot ne donne aucun nom"
                  : `${combien} médecin${combien > 1 ? "s" : ""} nommé${combien > 1 ? "s" : ""}`
              }
              sx={{
                bgcolor: actif ? "rgba(var(--accent-rgb), 0.15)" : "rgba(0,0,0,0.06)",
                color: actif ? "var(--accent-deep)" : "text.secondary",
                fontWeight: 700,
              }}
            />
          )}
          {nouveaux > 0 && (
            <Chip size="small" variant="outlined" label={`${nouveaux} nouveau${nouveaux > 1 ? "x" : ""}`} />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {erreurChargement ? (
          <Alert severity="error">{erreurChargement}</Alert>
        ) : !donnees ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Un patient peut demander au robot avec quel médecin il a rendez-vous. Le robot répond avec le
              médecin prévu sur le créneau, seulement si vous l&apos;avez nommé ici. Sinon, il répond que le
              centre ne communique pas le nom à l&apos;avance.
            </Typography>

            <FormControlLabel
              control={
                <Switch checked={actif} disabled={readOnly} onChange={(e) => setActif(e.target.checked)} />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Le robot peut donner au patient le nom du médecin prévu
                </Typography>
              }
            />
            {actif && (
              <Typography variant="caption" color="text.secondary">
                En cochant, vous confirmez que les médecins nommés ci-dessous sont bien ceux qui font les examens
                de leurs créneaux. Le jour même, le médecin peut changer : le robot dit « est prévu ».
              </Typography>
            )}

            <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
                {medecins.length
                  ? `${medecins.length} code${medecins.length > 1 ? "s" : ""} lus dans votre logiciel de gestion${donnees.reluLe ? `, le ${dateCourte(donnees.reluLe)}` : ""}.`
                  : "Aucun médecin lu pour l'instant."}
              </Typography>
              {donnees.relectureActive && (
                <Button
                  size="small"
                  startIcon={enCours === "relire" ? <CircularProgress size={14} /> : <RefreshIcon />}
                  disabled={enCours !== null}
                  onClick={() => void envoyer("POST")}
                  sx={{ color: "var(--accent-deep)" }}
                >
                  Relire la liste
                </Button>
              )}
            </Stack>

            {medecins.length > 0 && (
              <Box sx={{ opacity: actif ? 1 : 0.55, transition: "opacity 150ms ease" }}>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <Button size="small" disabled={readOnly || !actif} onClick={() => tous(true)}>
                    Nommer tous les médecins
                  </Button>
                  <Button size="small" disabled={readOnly || !actif} onClick={() => tous(false)} sx={{ color: "text.secondary" }}>
                    Ne nommer personne
                  </Button>
                </Stack>
                <Box sx={{ maxHeight: 420, overflowY: "auto", border: "1px solid #e0e0e0", borderRadius: 1.5, p: 0.5 }}>
                  {personnes.map(ligne)}
                  {autres.length > 0 && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 1, pb: 0.5 }}>
                        Ces codes ne semblent pas être des personnes (planning générique, téléradiologie). Le
                        robot ne les nomme que si vous les cochez.
                      </Typography>
                      {autres.map(ligne)}
                    </>
                  )}
                </Box>
              </Box>
            )}

            {erreur && <Alert severity="error">{erreur}</Alert>}

            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="contained"
                disableElevation
                disabled={readOnly || enCours !== null || !modifie}
                onClick={() => void envoyer("PUT")}
                sx={{ bgcolor: "var(--accent)", "&:hover": { bgcolor: "var(--accent-press)" } }}
              >
                {enCours === "enregistrer" ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </Stack>
          </Stack>
        )}

        <Retour ouvert={retour !== null} message={<>{retour}</>} gravite="success" onFermer={() => setRetour(null)} />
      </AccordionDetails>
    </Accordion>
  );
}
