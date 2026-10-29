"use client";

// Section « Robot V2 » de l'écran des statistiques internes : lit `v2` de la route
// (src/lib/statsInternesV2.ts), soit les appels en `stats.internal.version === 2`
// (LyraeTalk v2.62.0). Plan `2026-10-analyse-stats-internes.md` du workspace, point F.
import React from "react";
import {
  Box,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  IconBrain,
  IconMessage,
  IconClock,
  IconPhoneOutgoing,
  IconCalendarEvent,
  IconDoorEnter,
  IconCoin,
  IconCalendarPlus,
} from "@tabler/icons-react";
import type { StatsV2 } from "@/lib/statsInternesV2";
import { KpiCard, SectionCard } from "./cartes";

const TRANCHES = ["< 1,5 s", "1,5 à 2,5 s", "2,5 à 4 s", "> 4 s"];
const COULEURS_TRANCHES = ["#2a9d8f", "#8ab17d", "#e9c46a", "#e76f51"];

const ms = (v: number | null | undefined) =>
  v == null ? "-" : v >= 1000 ? `${(v / 1000).toFixed(2).replace(".", ",")} s` : `${Math.round(v)} ms`;
const pc = (v: number | null | undefined) => (v == null ? "-" : `${String(v).replace(".", ",")} %`);
const nb = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("fr-FR"));

/**
 * Écart à la période précédente, sous la valeur. `mieuxSiBas` : une latence ou un taux de
 * rejet qui baisse est une bonne nouvelle, en vert.
 */
function Ecart({ actuel, avant, mieuxSiBas = true, unite = "" }: { actuel: number | null | undefined; avant: number | null | undefined; mieuxSiBas?: boolean; unite?: string }) {
  if (actuel == null || avant == null || avant === 0) return null;
  const d = actuel - avant;
  if (Math.abs(d) < 0.05) return <Typography variant="caption" color="text.secondary">stable</Typography>;
  const bon = mieuxSiBas ? d < 0 : d > 0;
  const texte = unite === "%" ? `${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} pt` : `${d > 0 ? "+" : ""}${Math.round((100 * d) / avant)} %`;
  return (
    <Typography variant="caption" sx={{ color: bon ? "#2a6f64" : "#b5523b", fontWeight: 700 }}>
      {texte} sur la période précédente
    </Typography>
  );
}

/** Barre empilée des tranches de latence, avec la légende dessous. */
function Tranches({ titre, valeurs }: { titre: string; valeurs: number[] }) {
  const total = valeurs.reduce((s, v) => s + v, 0);
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary">
        {titre}
      </Typography>
      {total === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Pas encore de mesure sur la période.
        </Typography>
      ) : (
        <>
          <Box sx={{ display: "flex", height: 14, borderRadius: 1, overflow: "hidden", mt: 0.5 }}>
            {valeurs.map((v, i) => (
              <Box key={i} sx={{ width: `${v}%`, bgcolor: COULEURS_TRANCHES[i] }} title={`${TRANCHES[i]} : ${pc(v)}`} />
            ))}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 0.75 }}>
            {valeurs.map((v, i) => (
              <Typography key={i} variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box component="span" sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: COULEURS_TRANCHES[i] }} />
                {TRANCHES[i]} : {pc(v)}
              </Typography>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: (string | number)[][] }) {
  if (lignes.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Rien sur la période.
      </Typography>
    );
  }
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {entetes.map((e, i) => (
              <TableCell key={e} align={i === 0 ? "left" : "right"} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {e}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {lignes.map((l, j) => (
            <TableRow key={j}>
              {l.map((c, i) => (
                <TableCell key={i} align={i === 0 ? "left" : "right"} sx={{ whiteSpace: "nowrap" }}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function Kpi({ label, value, icon, ecart }: { label: string; value: string; icon: React.ReactNode; ecart?: React.ReactNode }) {
  return (
    <Box>
      <KpiCard label={label} value={value} icon={icon} />
      {ecart && <Box sx={{ mt: 0.5, pl: 0.5 }}>{ecart}</Box>}
    </Box>
  );
}

export default function SectionV2({ v2, precedente }: { v2: StatsV2; precedente: StatsV2 | null }) {
  const p = precedente && precedente.appels > 0 ? precedente : null;
  const profils = Object.entries(v2.cerveau.profils);

  return (
    <Box id="robot-v2" sx={{ mb: 3 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>
        Robot V2
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {nb(v2.appels)} appels mesurés par la nouvelle forme des stats (depuis la v2.62.0).
        {p ? ` Comparés à ${nb(p.appels)} appels de la période précédente.` : ""}
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Kpi
            label="Attente ressentie par tour"
            value={ms(v2.latence.voixMoyMs || null)}
            icon={<IconClock size={20} />}
            ecart={p && <Ecart actuel={v2.latence.voixMoyMs} avant={p.latence.voixMoyMs} />}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <Kpi
            label="Décision du cerveau"
            value={ms(v2.cerveau.latenceMoyMs || null)}
            icon={<IconBrain size={20} />}
            ecart={p && <Ecart actuel={v2.cerveau.latenceMoyMs} avant={p.cerveau.latenceMoyMs} />}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <Kpi
            label="Ponts non décrochés"
            value={pc(v2.transfert.pontsTentes ? v2.transfert.nonDecrochePct : null)}
            icon={<IconPhoneOutgoing size={20} />}
            ecart={p && <Ecart actuel={v2.transfert.nonDecrochePct} avant={p.transfert.nonDecrochePct} unite="%" />}
          />
        </Grid>
        <Grid item xs={6} md={3}>
          <Kpi
            label="Accusés rejetés (cible 5 %)"
            value={pc(v2.accuses.dit + v2.accuses.rejete ? v2.accuses.tauxRejetPct : null)}
            icon={<IconMessage size={20} />}
            ecart={p && <Ecart actuel={v2.accuses.tauxRejetPct} avant={p.accuses.tauxRejetPct} unite="%" />}
          />
        </Grid>
      </Grid>

      <Box id="robot-v2-cerveau" sx={{ mb: 3 }}>
        <SectionCard
          title="Cerveau"
          subtitle="Temps de décision par profil. « Modèle seul » : l'appel à Azure OpenAI, sans le réseau ni la Function."
          icon={<IconBrain size={22} />}
        >
          <Tableau
            entetes={["Profil", "Tours", "Décision", "Modèle seul", "Part modèle", "Neutres", "Relances", "Jetons (entrée / sortie)", "Cache"]}
            lignes={profils.map(([k, x]) => [
              k,
              nb(x.n),
              ms(x.latenceMoyMs),
              ms(x.llmMoyMs),
              pc(x.partLlmPct),
              pc(x.neutresPct),
              pc(x.relancesPct),
              `${nb(x.entreeMoy)} / ${nb(x.sortieMoy)}`,
              pc(x.cachePct),
            ])}
          />
        </SectionCard>
      </Box>

      <Box
        sx={{
          columnCount: { xs: 1, md: 2 },
          columnGap: "24px",
          "& > *": { breakInside: "avoid", display: "block", mb: 3 },
        }}
      >
        <Box id="robot-v2-latence">
          <SectionCard
            title="Latence"
            subtitle="Attente ressentie : de la fin de la phrase du patient au départ de la réponse."
            icon={<IconClock size={22} />}
          >
            <Tranches titre={`Attente ressentie (${nb(v2.latence.voixTours)} tours, ${ms(v2.latence.voixMoyMs || null)} en moyenne)`} valeurs={v2.latence.tranchesVoixPct} />
            <Tranches titre={`Réponse prête (${nb(v2.latence.tours)} tours, ${ms(v2.latence.tourMoyMs || null)} en moyenne)`} valeurs={v2.latence.tranchesTourPct} />
            <Typography variant="caption" color="text.secondary">
              Étapes les plus lentes
            </Typography>
            <Tableau entetes={["Étape", "Tours", "Moyenne"]} lignes={v2.latence.etatsLents.map((e) => [e.etat, nb(e.n), ms(e.moyMs)])} />
          </SectionCard>
        </Box>

        <Box id="robot-v2-accuses">
          <SectionCard
            title="Accusés de réception"
            subtitle="« Écarté » : le garde-fou de la décision n'en veut pas (hors sujet, peu sûr). « Rejeté » : le texte écrit par le modèle est fautif."
            icon={<IconMessage size={22} />}
          >
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              {[
                ["Dits", v2.accuses.dit],
                ["Écartés", v2.accuses.ecarte],
                ["Rejetés", v2.accuses.rejete],
                ["Sans objet", v2.accuses.inutile],
              ].map(([l, v]) => (
                <Grid item xs={6} sm={3} key={l as string}>
                  <Typography variant="caption" color="text.secondary">
                    {l}
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {nb(v as number)}
                  </Typography>
                </Grid>
              ))}
            </Grid>
            <Tableau entetes={["Raison", "Nombre"]} lignes={v2.accuses.raisons.map((r) => [r.raison, nb(r.n)])} />
          </SectionCard>
        </Box>

        <Box id="robot-v2-transferts">
          <SectionCard
            title="Transferts et ponts"
            subtitle="Un pont non décroché : le secrétariat n'a pas répondu, le patient repart sans rien."
            icon={<IconPhoneOutgoing size={22} />}
          >
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              {[
                ["Appels transférés", nb(v2.transfert.appelsTransferes)],
                ["Ponts tentés", nb(v2.transfert.pontsTentes)],
                ["Non décrochés", nb(v2.transfert.pontsNonDecroches)],
                ["Délai avant décroché", ms(v2.transfert.decrocheMoyMs)],
                ["Planning plein", nb(v2.transfert.planningPlein)],
              ].map(([l, v]) => (
                <Grid item xs={6} sm={4} key={l}>
                  <Typography variant="caption" color="text.secondary">
                    {l}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800}>
                    {v}
                  </Typography>
                </Grid>
              ))}
            </Grid>
            <Tableau entetes={["Motif", "Appels"]} lignes={v2.transfert.motifs.map((m) => [m.motif, nb(m.n)])} />
          </SectionCard>
        </Box>

        <Box id="robot-v2-creation">
          <SectionCard
            title="Création du RDV"
            subtitle="Ce que le patient attend après son « oui ». « Totale » comprend toutes les étapes."
            icon={<IconCalendarPlus size={22} />}
          >
            <Tableau
              entetes={["Étape", "Nombre", "Moyenne", "Maximum"]}
              lignes={v2.creation.etapes.map((e) => [e.etape, nb(e.n), ms(e.moyMs), ms(e.maxMs)])}
            />
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              Échecs : {nb(v2.creation.echecs)}. Relues après un délai : {nb(v2.creation.relues)}. Délais dépassés à la passerelle : {nb(v2.creation.delaisDepasses)}.
            </Typography>
          </SectionCard>
        </Box>

        <Box id="robot-v2-creneaux">
          <SectionCard
            title="Créneaux"
            subtitle="Tours passés sur les créneaux avant l'accord du patient."
            icon={<IconCalendarEvent size={22} />}
          >
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {nb(v2.creneaux.appelsAvecProposition)} appels avec une proposition, {String(v2.creneaux.propositionsMoy).replace(".", ",")} proposition(s) et{" "}
              {String(v2.creneaux.nouvellesRecherchesMoy).replace(".", ",")} nouvelle(s) recherche(s) par appel.
            </Typography>
            <Tableau
              entetes={["Tours refusés avant l'accord", "Appels"]}
              lignes={v2.creneaux.iterations.map((x) => [x.iterations, nb(x.n)])}
            />
          </SectionCard>
        </Box>

        <Box id="robot-v2-accueil">
          <SectionCard
            title="Accueil et demandes"
            subtitle="Appels perdus avant toute parole, et ce que les patients demandent en dehors du parcours."
            icon={<IconDoorEnter size={22} />}
          >
            <Tableau
              entetes={["Indicateur", "Valeur"]}
              lignes={[
                ["Raccroché sans avoir parlé", pc(v2.accueil.sansParolePct)],
                ["Fini sur la question de la langue", pc(v2.accueil.questionLanguePct)],
                ["Première parole du patient", v2.accueil.premiereParoleMoyS == null ? "-" : `${String(v2.accueil.premiereParoleMoyS).replace(".", ",")} s`],
                ["Demande à parler à quelqu'un", pc(v2.demandes.humainPct)],
                ["Urgence", pc(v2.demandes.urgencePct)],
                ["Plusieurs examens", pc(v2.demandes.multiExamenPct)],
              ]}
            />
          </SectionCard>
        </Box>

        <Box id="robot-v2-cout">
          <SectionCard title="Coût par appel" subtitle="En unités facturées, moyenne par appel." icon={<IconCoin size={22} />}>
            <Tableau
              entetes={["Unité", "Par appel"]}
              lignes={[
                ["Caractères synthétisés (hors cache)", nb(v2.cout.caracteresTtsMoy)],
                ["Jetons du cerveau en entrée", nb(v2.cout.jetonsEntreeMoy)],
                ["dont lus en cache", pc(v2.cout.cachePct)],
                ["Jetons du cerveau en sortie", nb(v2.cout.jetonsSortieMoy)],
                ["Durée de l'appel", `${nb(v2.cout.secondesMoy)} s`],
              ]}
            />
          </SectionCard>
        </Box>
      </Box>
    </Box>
  );
}
