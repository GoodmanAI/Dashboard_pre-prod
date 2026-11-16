"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Box, Skeleton, Typography } from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IconChartBar, IconListDetails, IconSettings } from "@tabler/icons-react";
import { useCentre } from "@/app/context/CentreContext";
import { useTalkBasePath } from "@/utils/talkRoutes";
import AccueilProduit from "@/components/accueil/AccueilProduit";
import { BORDER, INK, INK_MUTED, SURFACE_MUTED } from "@/lib/jetons";
import ClientLayout from "./ClientLayout";

/**
 * Accueil de LyraeTalk (16/11/2026) : la recherche centrale d'abord, trois accès directs,
 * puis une ligne qui rappelle la journée. L'histogramme des 14 jours et les tuiles
 * détaillées vivent dans Statistiques d'appels.
 *
 * La ligne du jour garde l'ancre `appels_aujourd_hui` : la fiche « Vue d'ensemble » de la
 * recherche et le tutoriel Talk y mènent.
 */

// Phrases que la recherche résout (corpus `scripts/recherche/corpus.json`).
const EXEMPLES_TALK = [
  "Les appels transférés ce matin",
  "Combien de prises de rendez-vous hier ?",
  "Changer le message d'accueil du robot",
];

type Jour = { total: number; urgences: number; rdvPris: number };

const isAbortError = (e: unknown) =>
  !!e && typeof e === "object" && (e as { name?: string }).name === "AbortError";

interface TalkPageProps {
  params: {
    id: string; // userProductId
  };
}

export default function TalkPage({ params }: TalkPageProps) {
  const { status } = useSession();
  const router = useRouter();
  const { selectedUserId } = useCentre();
  const userProductId = Number(params.id);
  const basePath = useTalkBasePath(userProductId);

  const [jour, setJour] = useState<Jour | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
  }, [status, router]);

  // Les chiffres du jour, calculés par la route (`mode=agregat`) : aucune ligne d'appel
  // ne descend dans le navigateur. La journée est celle du fuseau de la secrétaire.
  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    (async () => {
      try {
        setErreur(false);
        const debut = new Date();
        debut.setHours(0, 0, 0, 0);
        const fin = new Date();
        fin.setHours(23, 59, 59, 999);
        const q = new URLSearchParams({
          userProductId: String(userProductId),
          mode: "agregat",
          jourDebut: debut.toISOString(),
          jourFin: fin.toISOString(),
        });
        const res = await fetch(`/api/calls?${q.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("agregat");
        const agregat: { jour: Jour | null } = await res.json();
        setJour(agregat.jour ?? { total: 0, urgences: 0, rdvPris: 0 });
      } catch (e) {
        if (!isAbortError(e)) setErreur(true);
      }
    })();
    return () => controller.abort();
  }, [status, selectedUserId, userProductId]);

  return (
    <ClientLayout>
      <AccueilProduit
        titrePage="LyraeTalk"
        descriptionPage="Accueil du robot téléphonique"
        exemples={EXEMPLES_TALK}
        ancreTutoriel="premiers_pas"
        placeholder="Ce que vous cherchez"
        acces={[
          {
            titre: "Mapping des examens",
            description: "Les examens que le robot propose et leur code dans votre logiciel.",
            href: `${basePath}/parametrage/mapping_exam`,
            Icone: IconListDetails,
          },
          {
            titre: "Paramètres",
            description: "Horaires, message d'accueil, voix, questions posées aux patients.",
            href: `${basePath}/parametrage`,
            Icone: IconSettings,
          },
          {
            titre: "Statistiques",
            description: "Appels, rendez-vous pris, transferts et urgences, sur la période voulue.",
            href: `${basePath}/stats_appel`,
            Icone: IconChartBar,
          },
        ]}
      >
        <LigneDuJour jour={jour} erreur={erreur} statsHref={`${basePath}/stats_appel`} />
      </AccueilProduit>
    </ClientLayout>
  );
}

function pluriel(n: number, un: string, plusieurs: string) {
  return n > 1 ? plusieurs : un;
}

function LigneDuJour({
  jour,
  erreur,
  statsHref,
}: {
  jour: Jour | null;
  erreur: boolean;
  statsHref: string;
}) {
  const format = new Intl.NumberFormat("fr-FR");
  const chiffres = jour
    ? [
        { n: jour.total, libelle: pluriel(jour.total, "appel", "appels") },
        { n: jour.rdvPris, libelle: "rendez-vous pris" },
        { n: jour.urgences, libelle: pluriel(jour.urgences, "urgence", "urgences") },
      ]
    : null;

  return (
    <Box
      id="appels_aujourd_hui"
      aria-live="polite"
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: 3,
        rowGap: 1,
        px: 2.5,
        py: 1.5,
        minHeight: 52,
        borderRadius: 2.5,
        border: `1px solid ${BORDER}`,
        bgcolor: SURFACE_MUTED,
      }}
    >
      <Typography sx={{ color: INK_MUTED, fontSize: 13.5, fontWeight: 500 }}>Aujourd&apos;hui</Typography>

      {erreur ? (
        <Typography sx={{ color: INK_MUTED, fontSize: 14, flex: 1 }}>
          Les appels du jour n&apos;ont pas pu être chargés. Rechargez la page.
        </Typography>
      ) : chiffres ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 3, rowGap: 0.5, flex: 1 }}>
          {chiffres.map((c) => (
            <Typography key={c.libelle} sx={{ color: INK_MUTED, fontSize: 14 }}>
              <Box
                component="span"
                className="chiffre"
                sx={{ color: INK, fontWeight: 700, fontSize: 16, mr: 0.5 }}
              >
                {format.format(c.n)}
              </Box>
              {c.libelle}
            </Typography>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: "flex", gap: 3, flex: 1 }} aria-hidden>
          <Skeleton variant="text" width={80} height={24} />
          <Skeleton variant="text" width={130} height={24} />
          <Skeleton variant="text" width={90} height={24} />
        </Box>
      )}

      <Typography
        component={Link}
        href={statsHref}
        sx={{
          color: "var(--accent-deep)",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
          borderRadius: 1,
          "&:hover": { textDecoration: "underline", textUnderlineOffset: 3 },
          "&:focus-visible": { outline: "2px solid var(--accent)", outlineOffset: 2 },
        }}
      >
        Voir le détail
      </Typography>
    </Box>
  );
}
