"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";

/**
 * Où les patients s'arrêtent dans le parcours (lot F).
 *
 * Point 10 de la revue du 02/09 : « Sept patients sur dix abandonnent à l'écran de
 * choix de la partie du corps. Personne ne le sait, donc personne ne corrige. Le
 * même écran continue de bloquer les mêmes patients mois après mois, et ce sont
 * surtout les plus âgés, ceux qui ont le plus besoin que ça marche. »
 *
 * UNE SEULE VUE, ET C'EST VOLONTAIRE. Konnect en expose douze. Celle-ci répond à la
 * question qu'un cabinet se pose vraiment : où ça casse. Les onze autres suivront
 * si celle-ci sert, pas avant.
 *
 * LA DONNÉE VIENT D'UNE REMONTÉE, PAS D'UNE LECTURE. Le Dashboard ne peut pas
 * interroger Konnect (VPN). Le portail pousse donc son funnel toutes les six heures,
 * et cet écran affiche la dernière valeur reçue, avec sa date. Deux conséquences
 * qu'il faut assumer à l'écran plutôt que masquer : un centre sans trafic ne remonte
 * rien, et le chiffre affiché a toujours quelques heures.
 *
 * PAS DE LIBRAIRIE DE GRAPHES. Des barres en pourcentage suffisent, et l'écran de
 * mapping vient de rappeler ce que coûte un import statique de trop : 139 ko pour
 * une page qu'on ouvre tous les jours.
 */

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const PERDU = "#C0563B";

type Etape = { libelle: string; atteint: number; taux: number; perdus: number };
type Funnel = {
  fenetre_jours: number;
  demandes: number;
  conversion_globale: number;
  abandons: number;
  sorties_humaines: number;
  etapes: Etape[];
};

function pourcent(v: number): string {
  return `${Math.round(v * 100)} %`;
}

function Chiffre({
  valeur,
  libelle,
  aide,
}: {
  valeur: string;
  libelle: string;
  aide?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ borderColor: BORDER, borderRadius: 2, p: 2, flex: 1, minWidth: 170 }}
    >
      <Typography sx={{ fontSize: 24, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
        {valeur}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, mt: 0.5 }}>
        {libelle}
      </Typography>
      {aide && (
        <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mt: 0.25 }}>{aide}</Typography>
      )}
    </Paper>
  );
}

export default function StatistiquesKonnect() {
  const { userProductId } = useCentreProduit();

  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [recuAt, setRecuAt] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/konnect-remontee?userProductId=${userProductId}`);
        if (!r.ok) throw new Error("Chargement impossible.");
        const d = await r.json();
        if (annule) return;
        const f = d?.charge?.funnel;
        if (f && Array.isArray(f.etapes)) setFunnel(f as Funnel);
        setRecuAt(d?.recuAt ?? null);
      } catch {
        if (!annule) setErreur("Impossible de charger les statistiques.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  /** L'étape où le plus de monde décroche. C'est la seule chose à faire ressortir. */
  const pireEtape = useMemo(() => {
    if (!funnel) return null;
    return funnel.etapes.reduce<Etape | null>(
      (pire, e) => (pire === null || e.perdus > pire.perdus ? e : pire),
      null
    );
  }, [funnel]);

  if (chargement) {
    return (
      <PageContainer title="Statistiques" description="Où les patients s'arrêtent">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Statistiques" description="Où les patients s'arrêtent">
      <Box>
        <SectionHeader
          title="Statistiques"
          subtitle="Où les patients s'arrêtent dans la prise de rendez-vous"
        />

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {erreur}
          </Alert>
        )}

        {!funnel ? (
          <Alert severity="info">
            {recuAt
              ? "Le portail n'a pas encore assez de demandes pour établir des statistiques. Elles apparaîtront dès que des patients auront commencé une prise de rendez-vous en ligne."
              : "Le portail ne nous a encore rien transmis. Les statistiques apparaissent après les premières prises de rendez-vous en ligne."}
          </Alert>
        ) : (
          <>
            <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5, maxWidth: 760 }}>
              Sur les {funnel.fenetre_jours} derniers jours. Chaque ligne montre combien
              de patients sont arrivés jusque-là. Ce qui compte, c&apos;est l&apos;écart
              entre deux lignes : c&apos;est là que vous perdez du monde.
            </Typography>

            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
              <Chiffre
                valeur={String(funnel.demandes)}
                libelle="Patients ont commencé"
                aide={`sur ${funnel.fenetre_jours} jours`}
              />
              <Chiffre
                valeur={pourcent(funnel.conversion_globale)}
                libelle="Sont allés au bout"
                aide="rendez-vous pris en ligne"
              />
              <Chiffre
                valeur={String(funnel.abandons)}
                libelle="Ont abandonné"
                aide="sans rien vous demander"
              />
              <Chiffre
                valeur={String(funnel.sorties_humaines)}
                libelle="Sont passés par vous"
                aide="demande à traiter au secrétariat"
              />
            </Stack>

            {pireEtape && pireEtape.perdus > 0 && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                C&apos;est juste avant « {pireEtape.libelle} » que vous perdez le plus de
                monde : {pireEtape.perdus} patient
                {pireEtape.perdus > 1 ? "s" : ""} s&apos;arrêtent là.
              </Alert>
            )}

            <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2 }}>
              {funnel.etapes.map((e, i) => (
                <Box key={e.libelle} sx={{ mb: i === funnel.etapes.length - 1 ? 0 : 2 }}>
                  <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK, flex: 1 }}>
                      {e.libelle}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: INK }}>{e.atteint}</Typography>
                    <Typography sx={{ fontSize: 12, color: INK_MUTED, minWidth: 46, textAlign: "right" }}>
                      {pourcent(e.taux)}
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      height: 10,
                      borderRadius: 5,
                      bgcolor: "rgba(0,0,0,0.06)",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        width: `${Math.max(0, Math.min(100, e.taux * 100))}%`,
                        height: "100%",
                        bgcolor: "var(--accent)",
                      }}
                    />
                  </Box>
                  {/* Le drop-off est l'information utile, pas la barre. On ne l'affiche
                      qu'entre deux étapes : « perdus avant la première » n'a pas de sens. */}
                  {i > 0 && e.perdus > 0 && (
                    <Typography sx={{ fontSize: 11.5, color: PERDU, mt: 0.5 }}>
                      {e.perdus} patient{e.perdus > 1 ? "s" : ""} perdu
                      {e.perdus > 1 ? "s" : ""} à cette étape
                    </Typography>
                  )}
                </Box>
              ))}
            </Paper>

            <Typography sx={{ fontSize: 11.5, color: INK_MUTED, mt: 2 }}>
              {recuAt
                ? `Relevé transmis par le portail le ${new Date(recuAt).toLocaleString("fr-FR")}. Il est recalculé plusieurs fois par jour.`
                : "Relevé transmis par le portail, recalculé plusieurs fois par jour."}
            </Typography>
          </>
        )}
      </Box>
    </PageContainer>
  );
}
