"use client";

/**
 * Une conversation d'appel, avec ce qui y est reconnu : nom, date, examen, créneau...
 * -----------------------------------------------------------------------------
 * Remplace les trois copies du rendu d'un tour de parole (liste des appels, détail,
 * incidents). La détection vit dans `src/lib/entitesTranscription.ts`.
 *
 * Deux traits, parce que deux vérités différentes :
 *   - fond coloré : Lyrae l'a RETENU (`stats.entites`, appels depuis le 24/09/2026) ;
 *   - souligné pointillé : repéré dans le texte, sans savoir si Lyrae l'a compris.
 */

import { useMemo } from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import {
  IconArrowsLeftRight,
  IconBone,
  IconCake,
  IconCalendarEvent,
  IconClock,
  IconId,
  IconMapPin,
  IconPhone,
  IconScan,
  IconUser,
  IconUserCheck,
} from "@tabler/icons-react";
import {
  analyserConversation,
  libelleEntite,
  type EntiteRobot,
  type Segment,
  type TypeEntite,
} from "@/lib/entitesTranscription";
import { EXAM_TYPE_LABELS } from "@/components/shared/ExamTypeBadge";

type Famille = "identite" | "examen" | "quand" | "lieu";

const FAMILLE: Record<TypeEntite, Famille> = {
  nom: "identite",
  prenom: "identite",
  naissance: "identite",
  telephone: "identite",
  identite: "identite",
  examen: "examen",
  region: "examen",
  cote: "examen",
  date: "quand",
  heure: "quand",
  disponibilite: "quand",
  creneau: "quand",
  site: "lieu",
};

// Une teinte par famille : le fond à 14 %, le texte assombri pour rester lisible dessus.
const COULEUR: Record<Famille, { rgb: string; texte: string }> = {
  identite: { rgb: "124, 58, 237", texte: "#5b21b6" },
  examen: { rgb: "37, 99, 235", texte: "#1e40af" },
  quand: { rgb: "217, 119, 6", texte: "#92400e" },
  lieu: { rgb: "100, 116, 139", texte: "#334155" },
};

const ICONE: Record<TypeEntite, typeof IconUser> = {
  nom: IconUser,
  prenom: IconUser,
  naissance: IconCake,
  telephone: IconPhone,
  identite: IconUserCheck,
  examen: IconScan,
  region: IconBone,
  cote: IconArrowsLeftRight,
  date: IconCalendarEvent,
  heure: IconClock,
  disponibilite: IconCalendarEvent,
  creneau: IconCalendarEvent,
  site: IconMapPin,
};

const NOM_TYPE: Record<TypeEntite, string> = {
  nom: "Nom",
  prenom: "Prénom",
  naissance: "Date de naissance",
  telephone: "Téléphone",
  identite: "Identité",
  examen: "Examen",
  region: "Région du corps",
  cote: "Côté",
  date: "Date",
  heure: "Heure",
  disponibilite: "Disponibilités",
  creneau: "Créneau",
  site: "Site",
};

const NOM_STATUT: Record<EntiteRobot["statut"], string> = {
  compris: "compris",
  confirme: "confirmé",
  propose: "proposé",
  refuse: "refusé",
  choisi: "choisi",
};

const TYPE_ROBOT_AFFICHE: Record<EntiteRobot["type"], TypeEntite> = {
  nom: "nom",
  prenom: "prenom",
  naissance: "naissance",
  telephone: "telephone",
  identite: "identite",
  examen_type: "examen",
  examen: "examen",
  disponibilite: "disponibilite",
  creneau: "creneau",
  site: "site",
};

function infoBulle(e: NonNullable<Segment["entite"]>): string {
  if (e.origine === "retenu") {
    return `${NOM_TYPE[e.type]}, ${e.statut ? NOM_STATUT[e.statut] : "retenu"} par Lyrae`;
  }
  return `${NOM_TYPE[e.type]}, repéré dans le texte`;
}

function Entite({ segment }: { segment: Segment }) {
  const e = segment.entite!;
  const { rgb, texte } = COULEUR[FAMILLE[e.type]];
  const Icone = ICONE[e.type];
  const retenu = e.origine === "retenu";
  const refuse = e.statut === "refuse";

  return (
    <Tooltip title={infoBulle(e)} arrow disableInteractive>
      <Box
        component="mark"
        sx={{
          display: "inline",
          color: retenu ? texte : "inherit",
          bgcolor: `rgba(${rgb}, ${retenu ? 0.14 : 0.07})`,
          borderRadius: "4px",
          px: 0.4,
          py: 0.1,
          fontWeight: retenu ? 600 : "inherit",
          textDecoration: retenu ? (refuse ? "line-through" : "none") : "underline",
          textDecorationStyle: "dashed",
          textDecorationColor: `rgba(${rgb}, 0.8)`,
          textUnderlineOffset: "3px",
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          cursor: "help",
          // L'icône ne doit pas partir seule en fin de ligne ; une longue réponse, elle, se replie.
          whiteSpace: segment.texte.length <= 32 ? "nowrap" : "normal",
        }}
      >
        {retenu && (
          <Icone
            size={12}
            stroke={2.2}
            aria-hidden
            style={{ verticalAlign: "-1px", marginRight: 3, flexShrink: 0 }}
          />
        )}
        {segment.texte}
      </Box>
    </Tooltip>
  );
}

function PastilleRobot({
  e,
  examLabelMap,
  onClick,
}: {
  e: EntiteRobot;
  examLabelMap: Record<string, string>;
  onClick?: () => void;
}) {
  const type = TYPE_ROBOT_AFFICHE[e.type] ?? "examen";
  const { rgb, texte } = COULEUR[FAMILLE[type]];
  const Icone = ICONE[type];
  const statut = e.type === "creneau" ? `${NOM_STATUT[e.statut][0].toUpperCase()}${NOM_STATUT[e.statut].slice(1)} : ` : "";
  return (
    <Chip
      size="small"
      icon={<Icone size={14} stroke={2} style={{ color: texte }} />}
      label={`${statut}${libelleEntite(e, examLabelMap)}`}
      onClick={onClick}
      sx={{
        bgcolor: `rgba(${rgb}, 0.1)`,
        color: texte,
        fontWeight: 600,
        textDecoration: e.statut === "refuse" ? "line-through" : "none",
        "&:hover": onClick ? { bgcolor: `rgba(${rgb}, 0.18)` } : undefined,
      }}
    />
  );
}

export type TranscriptionProps = {
  /** `CallConversation.steps` tel que stocké, WaitSound compris : les index de `stats.entites` y renvoient. */
  steps: Array<{ speaker?: string; text?: string } | string> | null | undefined;
  /** `stats.entites` de l'appel, absent sur les appels d'avant le 24/09/2026. */
  entites?: EntiteRobot[] | null;
  /** Diminutif ou code de type d'examen vers libellé (`construireExamLabelMap`). */
  examLabelMap?: Record<string, string>;
  /** Préfixe des ancres de tour, pour qu'il n'y ait pas de collision si deux conversations sont à l'écran. */
  idPrefixe?: string;
};

export default function Transcription({
  steps,
  entites,
  examLabelMap: examLabelMapCentre,
  idPrefixe = "tour",
}: TranscriptionProps) {
  // Le robot envoie le type canonique (US, MG...) ; le diminutif du centre en repli.
  const examLabelMap = useMemo(
    () => ({ ...EXAM_TYPE_LABELS, ...(examLabelMapCentre ?? {}) }),
    [examLabelMapCentre]
  );
  const tours = useMemo(() => analyserConversation(steps ?? [], entites), [steps, entites]);
  // Un nom épelé trois fois reste un nom : une pastille par chose retenue, la dernière gagne.
  const retenues = useMemo(() => {
    const parCle = new Map<string, EntiteRobot>();
    const liste = Array.isArray(entites) ? entites : [];
    // « Échographie » à côté de « Échographie du bras » ne dit rien de plus.
    const examenPrecis = liste.some((e) => e?.type === "examen");
    for (const e of liste) {
      if (!e || !Number.isInteger(e.tour)) continue;
      if (e.type === "examen_type" && examenPrecis) continue;
      parCle.set(`${e.type}|${e.statut}|${libelleEntite(e, examLabelMap)}`, e);
    }
    return [...parCle.values()].sort((a, b) => a.tour - b.tour);
  }, [entites, examLabelMap]);

  const allerAuTour = (index: number) => {
    const el = document.getElementById(`${idPrefixe}-${index}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate?.(
      [{ boxShadow: "0 0 0 3px rgba(var(--accent-rgb), 0.5)" }, { boxShadow: "0 0 0 0 rgba(var(--accent-rgb), 0)" }],
      { duration: 1200, easing: "ease-out" }
    );
  };

  const repere = tours.some((t) => t.segments.some((s) => s.entite?.origine === "repere"));

  return (
    <Box>
      {retenues.length > 0 && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 2,
            border: "1px solid #e5e7eb",
            bgcolor: "#fafafa",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block", mb: 1 }}>
            Ce que Lyrae a retenu
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {retenues.map((e, i) => (
              <PastilleRobot key={i} e={e} examLabelMap={examLabelMap} onClick={() => allerAuTour(e.tour)} />
            ))}
          </Box>
        </Box>
      )}

      {tours.map((tour) => {
        const lyrae = tour.locuteur === "Lyrae";
        return (
          <Box
            key={tour.index}
            sx={{ display: "flex", flexDirection: "column", alignItems: lyrae ? "flex-start" : "flex-end", mb: 1.25 }}
          >
            <Box
              id={`${idPrefixe}-${tour.index}`}
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: lyrae ? "rgba(var(--accent-rgb), 0.15)" : "#eee",
                maxWidth: "80%",
                scrollMarginTop: 80,
              }}
            >
              <Typography variant="body2" component="div" sx={{ lineHeight: 1.7, overflowWrap: "anywhere" }}>
                {tour.segments.map((s, i) => (s.entite ? <Entite key={i} segment={s} /> : <span key={i}>{s.texte}</span>))}
              </Typography>
            </Box>

            {tour.horsTexte.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5, justifyContent: lyrae ? "flex-start" : "flex-end" }}>
                {tour.horsTexte.map((e, i) => (
                  <PastilleRobot key={i} e={e} examLabelMap={examLabelMap} />
                ))}
              </Box>
            )}

            {tour.heure && (
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", mt: 0.25, px: 0.5, fontVariantNumeric: "tabular-nums", fontSize: 11 }}
              >
                {tour.heure}
              </Typography>
            )}
          </Box>
        );
      })}

      {(repere || retenues.length > 0) && (
        <Typography variant="caption" component="p" sx={{ color: "text.secondary", mt: 2 }}>
          Avec une icône : retenu par Lyrae. Souligné en pointillé : repéré dans le texte, sans savoir si Lyrae l&apos;a compris.
        </Typography>
      )}
    </Box>
  );
}
