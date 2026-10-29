"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import { format, startOfWeek, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import TuileChiffre from "@/components/shared/TuileChiffre";
import { EXAM_TYPE_LABELS } from "@/components/shared/ExamTypeBadge";
import { useFiltresRecherche } from "@/lib/recherche/integre";
import { plageDePeriode, libellePeriode } from "@/lib/recherche/periode";
import { INK, INK_MUTED, BORDER, BRAND, BRAND_SOFT, WARNING } from "@/lib/jetons";

/**
 * Le suivi jour par jour du portail (C-STAT.1, lot 3 du plan workspace
 * `2026-10-konnect-stats-surveillance-ocr.md`).
 *
 * Konnect pousse chaque nuit ses compteurs des 14 derniers jours ; le Dashboard les garde
 * (`KonnectStatJour`) et l'historique s'allonge ici. Quatre questions, dans l'ordre où
 * une secrétaire se les pose : est-ce que ça monte, pourquoi des patients passent
 * encore par nous, pour quels examens, et à quelle heure ils réservent.
 *
 * Aucun chiffre de l'OCR : la route les écarte (D4, mesure interne).
 *
 * La période posée par la recherche (« ce mois », « la semaine dernière ») restreint les
 * trois dernières sections ; l'évolution montre toujours 12 semaines.
 */

const SEMAINES = 12;
const JOURS_PAR_DEFAUT = 30;

type Ligne = { jour: string; cle: string; valeur: number };

/** Pourquoi une demande passe au secrétariat, dit comme une secrétaire le dirait. */
const MOTIFS: Record<string, string> = {
  orientation: "L'examen se prend avec le secrétariat",
  examen_non_mappe: "Examen introuvable dans votre catalogue",
  multi_examen: "Plusieurs examens sur l'ordonnance",
  homonyme: "Doute sur l'identité du patient",
  blocage_clinique: "Une réponse au questionnaire demande votre avis",
  relecture_invalidee: "Ordonnance à relire",
  sans_motif: "Autre raison",
};

function somme(lignes: Ligne[], cle: string): number {
  return lignes.reduce((n, l) => (l.cle === cle ? n + l.valeur : n), 0);
}

function parPrefixe(lignes: Ligne[], prefixe: string): [string, number][] {
  const compte = new Map<string, number>();
  for (const l of lignes) {
    if (!l.cle.startsWith(prefixe)) continue;
    const suite = l.cle.slice(prefixe.length);
    compte.set(suite, (compte.get(suite) ?? 0) + l.valeur);
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1]);
}

function Bloc({
  id,
  titre,
  aide,
  children,
}: {
  id: string;
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper id={id} variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 3 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: INK }}>{titre}</Typography>
      {aide && (
        <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mt: 0.25, mb: 1.5 }}>{aide}</Typography>
      )}
      {children}
    </Paper>
  );
}

/** Une ligne libellé, nombre et barre, pour les répartitions. */
function Barre({ libelle, valeur, max }: { libelle: string; valeur: number; max: number }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
        <Typography sx={{ fontSize: 13, color: INK, flex: 1, minWidth: 0 }}>{libelle}</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, fontVariantNumeric: "tabular-nums" }}>
          {valeur}
        </Typography>
      </Stack>
      <Box sx={{ height: 8, borderRadius: 4, bgcolor: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <Box
          sx={{
            width: `${max > 0 ? Math.round((valeur / max) * 100) : 0}%`,
            height: "100%",
            bgcolor: BRAND,
          }}
        />
      </Box>
    </Box>
  );
}

type Semaine = { debut: Date; demandes: number; rdv: number; secretariat: number };

function semaines(lignes: Ligne[], maintenant: Date): Semaine[] {
  const lundi = startOfWeek(maintenant, { weekStartsOn: 1 });
  const liste: Semaine[] = [];
  for (let i = SEMAINES - 1; i >= 0; i--) {
    liste.push({ debut: subDays(lundi, i * 7), demandes: 0, rdv: 0, secretariat: 0 });
  }
  for (const l of lignes) {
    const jour = new Date(`${l.jour}T12:00:00`);
    const s = liste.find((x, i) => jour >= x.debut && (i === liste.length - 1 || jour < liste[i + 1].debut));
    if (!s) continue;
    if (l.cle === "demandes_deposees") s.demandes += l.valeur;
    else if (l.cle === "rdv_crees") s.rdv += l.valeur;
    else if (l.cle === "sorties_secretariat") s.secretariat += l.valeur;
  }
  return liste;
}

function Evolution({ donnees }: { donnees: Semaine[] }) {
  const max = Math.max(1, ...donnees.map((s) => Math.max(s.demandes, s.rdv + s.secretariat)));
  const HAUTEUR = 120;
  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Legende couleur={BRAND} texte="RDV pris en ligne" />
        <Legende couleur={WARNING} texte="Passés par le secrétariat" />
        <Legende couleur={BRAND_SOFT} texte="Demandes commencées" bordure />
      </Stack>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: { xs: 0.5, sm: 1 }, height: HAUTEUR + 22 }}>
        {donnees.map((s, i) => (
          <Box
            key={s.debut.toISOString()}
            title={`Semaine du ${format(s.debut, "d MMMM", { locale: fr })} : ${s.demandes} demande(s), ${s.rdv} RDV en ligne, ${s.secretariat} par le secrétariat`}
            sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <Box sx={{ position: "relative", width: "100%", maxWidth: 34, height: HAUTEUR }}>
              <Box
                sx={{
                  position: "absolute",
                  bottom: 0,
                  width: "100%",
                  height: `${(s.demandes / max) * 100}%`,
                  bgcolor: BRAND_SOFT,
                  borderRadius: "4px 4px 0 0",
                }}
              />
              <Box sx={{ position: "absolute", bottom: 0, left: "20%", width: "60%", display: "flex", flexDirection: "column-reverse" }}>
                <Box sx={{ height: (s.rdv / max) * HAUTEUR, bgcolor: BRAND }} />
                <Box sx={{ height: (s.secretariat / max) * HAUTEUR, bgcolor: WARNING }} />
              </Box>
            </Box>
            {/* Une date sur trois : douze dates ne tiennent pas côte à côte sur un téléphone.
                Le détail de chaque semaine est dans l'info-bulle de la colonne. */}
            <Typography sx={{ fontSize: 10.5, color: INK_MUTED, mt: 0.5, whiteSpace: "nowrap", minHeight: 16 }}>
              {(donnees.length - 1 - i) % 3 === 0 ? format(s.debut, "dd/MM") : ""}
            </Typography>
          </Box>
        ))}
      </Box>
    </>
  );
}

function Legende({ couleur, texte, bordure }: { couleur: string; texte: string; bordure?: boolean }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: 0.5,
          bgcolor: couleur,
          border: bordure ? `1px solid ${BORDER}` : undefined,
        }}
      />
      <Typography sx={{ fontSize: 12, color: INK_MUTED }}>{texte}</Typography>
    </Stack>
  );
}

export default function SuiviJours({ userProductId }: { userProductId: number | null }) {
  const filtres = useFiltresRecherche();
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    fetch(`/api/konnect-stats-jours?userProductId=${userProductId}&semaines=${SEMAINES}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !annule && setLignes(Array.isArray(d?.lignes) ? d.lignes : []))
      .catch(() => !annule && setErreur(true));
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const maintenant = useMemo(() => new Date(), []);
  const plage = useMemo(() => plageDePeriode(filtres.periode, maintenant), [filtres.periode, maintenant]);
  const libelle = plage && filtres.periode ? libellePeriode(filtres.periode) : `Sur les ${JOURS_PAR_DEFAUT} derniers jours`;

  const surPeriode = useMemo(() => {
    if (!lignes) return [];
    const du = format(plage?.from ?? subDays(maintenant, JOURS_PAR_DEFAUT - 1), "yyyy-MM-dd");
    const au = format(plage?.to ?? maintenant, "yyyy-MM-dd");
    return lignes.filter((l) => l.jour >= du && l.jour <= au);
  }, [lignes, plage, maintenant]);

  if (erreur) {
    return <Alert severity="error">Impossible de charger le suivi jour par jour. Rechargez la page.</Alert>;
  }
  if (lignes === null) return null;
  if (lignes.length === 0) {
    return (
      <Alert severity="info" sx={{ mb: 3 }}>
        Le suivi semaine par semaine arrive la nuit qui suit les premières demandes en ligne.
      </Alert>
    );
  }

  const motifs = parPrefixe(surPeriode, "sortie.");
  const examens = parPrefixe(surPeriode, "rdv_type.");
  const rdv = somme(surPeriode, "rdv_crees");
  const soir = somme(surPeriode, "rdv_soir");
  const weekend = somme(surPeriode, "rdv_weekend");
  const horsHeures = soir + weekend;

  return (
    <Box sx={{ mt: 4 }}>
      <Bloc
        id="evolution"
        titre={`Évolution sur ${SEMAINES} semaines`}
        aide="Une colonne par semaine. Plus la part en ligne grandit, moins votre secrétariat a d'appels à traiter."
      >
        <Evolution donnees={semaines(lignes, maintenant)} />
      </Bloc>

      <Bloc
        id="motifs"
        titre="Pourquoi des patients passent par le secrétariat"
        aide={`${libelle}. Chaque demande compte une fois, le jour où elle vous arrive.`}
      >
        {motifs.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
            Aucune demande passée par le secrétariat sur cette période.
          </Typography>
        ) : (
          motifs.map(([motif, n]) => (
            <Barre key={motif} libelle={MOTIFS[motif] ?? motif} valeur={n} max={motifs[0][1]} />
          ))
        )}
      </Bloc>

      <Bloc id="examens" titre="Rendez-vous pris en ligne par examen" aide={libelle}>
        {examens.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: INK_MUTED }}>
            Aucun rendez-vous pris en ligne sur cette période.
          </Typography>
        ) : (
          examens.map(([type, n]) => (
            <Barre key={type} libelle={EXAM_TYPE_LABELS[type] ?? type} valeur={n} max={examens[0][1]} />
          ))
        )}
      </Bloc>

      <Bloc
        id="horaires"
        titre="Rendez-vous pris quand le secrétariat est fermé"
        aide={`${libelle}. Le soir : avant 8 h ou à partir de 19 h, en semaine.`}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, minmax(0, 1fr))" },
            gap: 1.5,
          }}
        >
          <TuileChiffre libelle="Le soir" valeur={soir} />
          <TuileChiffre libelle="Le week-end" valeur={weekend} />
          <TuileChiffre
            libelle="Part des RDV en ligne"
            valeur={rdv > 0 ? `${Math.round((horsHeures / rdv) * 100)} %` : "0 %"}
            detail={`${horsHeures} sur ${rdv}`}
          />
        </Box>
      </Bloc>
    </Box>
  );
}
