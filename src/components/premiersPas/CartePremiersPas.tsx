"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import {
  IconCircleCheckFilled,
  IconCircleDashed,
  IconChevronRight,
} from "@tabler/icons-react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { useDroitPage } from "@/hooks/useDroitPage";
import { usePremiersPas } from "@/hooks/usePremiersPas";
import { useIntegre } from "@/lib/recherche/integre";
import { PAGES } from "@/lib/permissions";
import { cheminCentre } from "@/lib/cheminsCentre";
import {
  etapeFaite,
  etapesDuProduit,
  PARAM_ETAPE,
  type EtapePremiersPas,
} from "@/lib/premiersPas";
import {
  BORDER,
  BRAND,
  BRAND_DEEP,
  BRAND_SOFT,
  INK,
  INK_MUTED,
  OK,
  SURFACE,
} from "@/lib/jetons";

/**
 * La carte « Premiers pas » en tête de l'accueil d'un produit (plan
 * `2026-10-onboarding-dashboard-talk.md`, lot 1).
 *
 * Elle ne paraît que pour un client (ou un sous-compte) qui peut écrire le paramétrage,
 * jamais pour un administrateur, jamais dans le panneau de la recherche, et pas une
 * fois rangée. Les étapes faites viennent de `/api/completude` : rien n'est coché à la
 * main, sauf l'étape sans verdict (doubles examens), par « J'ai compris » sur sa page.
 */

/**
 * Visible pour cette session sur cet écran ? Partagé avec l'encart d'étape.
 *
 * Dans le panneau de la recherche, seulement si c'est la carte qu'on a cherchée
 * (« par où commencer ») : sinon elle repousserait les chiffres demandés.
 */
export function usePremiersPasVisibles(): boolean {
  const integre = useIntegre();
  const { etat, admin } = usePremiersPas();
  const param = useDroitPage(PAGES.PARAMETRAGE);
  const mapping = useDroitPage(PAGES.MAPPING_EXAM);
  const demandee = integre?.ancre === "premiers_pas";
  return (
    (!integre || demandee) &&
    !!etat &&
    !admin &&
    (param.peutEcrire || mapping.peutEcrire)
  );
}

/** `id` : l'ancre de la recherche centrale, posée par l'écran (son contrôle la cherche là). */
export default function CartePremiersPas({ id }: { id: string }) {
  const { userId, userProductId, produit } = useCentreProduit();
  const { etat, agir } = usePremiersPas();
  const visibles = usePremiersPasVisibles();
  const integre = useIntegre();
  const [manques, setManques] = useState<Set<string> | null>(null);

  const etapes = etapesDuProduit(produit);
  // Cherchée par la recherche, la carte s'ouvre même rangée.
  const demandee = integre?.ancre === "premiers_pas";
  const afficher =
    visibles && !!etat && (!etat.masque || demandee) && etapes.length > 0;

  useEffect(() => {
    if (!afficher || !userProductId) return;
    let annule = false;
    fetch(`/api/completude?userProductId=${userProductId}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (annule) return;
        const cles = Array.isArray(d?.manques)
          ? d.manques.map((m: { cle: string }) => m.cle)
          : [];
        setManques(new Set(cles));
      })
      .catch(() => !annule && setManques(new Set()));
    return () => {
      annule = true;
    };
  }, [afficher, userProductId]);

  const faites = useMemo(
    () =>
      etat && manques ? etapes.map((e) => etapeFaite(e, etat, manques)) : [],
    [etapes, etat, manques],
  );

  if (!afficher || !etat || !manques || userId === null || !produit)
    return null;

  return (
    <CartePremiersPasVue
      id={id}
      etapes={etapes}
      faites={faites}
      hrefDe={(etape, i) =>
        `${cheminCentre(userId, produit, etape.chemin)}?${PARAM_ETAPE}=${i + 1}#${etape.ancre}`
      }
      onRanger={() => void agir({ masque: true })}
    />
  );
}

/**
 * La carte seule, sans session ni réseau : ce que la page d'aperçu monte avec des
 * données factices pour juger le rendu au navigateur.
 */
export function CartePremiersPasVue({
  id,
  etapes,
  faites,
  hrefDe,
  onRanger,
}: {
  id: string;
  etapes: EtapePremiersPas[];
  faites: boolean[];
  hrefDe: (etape: EtapePremiersPas, index: number) => string;
  onRanger: () => void;
}) {
  const nbFaites = faites.filter(Boolean).length;
  const toutFait = nbFaites === etapes.length;

  return (
    <Box
      id={id}
      sx={{
        mb: 3,
        p: { xs: 2, sm: 2.5 },
        bgcolor: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 2,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "flex-start" }}
        spacing={1}
      >
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 17, color: INK }}>
            {toutFait ? "Votre robot est prêt à répondre" : "Premiers pas"}
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.25 }}>
            {toutFait
              ? "Les quatre étapes sont faites. Vous pouvez ranger cette carte."
              : "Quatre étapes pour que le robot puisse prendre vos rendez-vous. Le reste peut attendre."}
          </Typography>
        </Box>
        <Button
          size="small"
          variant={toutFait ? "contained" : "text"}
          onClick={onRanger}
          sx={{ flexShrink: 0, alignSelf: { xs: "flex-start", sm: "auto" } }}
        >
          {toutFait ? "Ranger" : "Masquer"}
        </Button>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
        <LinearProgress
          variant="determinate"
          value={(nbFaites / etapes.length) * 100}
          aria-label="Avancement des premiers pas"
          sx={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            bgcolor: BRAND_SOFT,
            "& .MuiLinearProgress-bar": { bgcolor: BRAND, borderRadius: 3 },
          }}
        />
        <Typography
          variant="body2"
          sx={{ color: INK_MUTED, whiteSpace: "nowrap" }}
        >
          {nbFaites} sur {etapes.length}
        </Typography>
      </Stack>

      {!toutFait && (
        <Stack
          component="ol"
          spacing={1}
          sx={{ listStyle: "none", m: 0, mt: 2, p: 0 }}
        >
          {etapes.map((etape, i) => {
            const faite = faites[i];
            const href = hrefDe(etape, i);
            return (
              <Box
                component="li"
                key={etape.cle}
                sx={{
                  display: "flex",
                  // Écran étroit : le bouton passe sous le texte plutôt que de l'écraser.
                  flexWrap: "wrap",
                  columnGap: 1.5,
                  rowGap: 1,
                  alignItems: "flex-start",
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${BORDER}`,
                  bgcolor: faite
                    ? "transparent"
                    : "rgba(var(--accent-rgb), 0.04)",
                }}
              >
                <Box
                  sx={{
                    pt: "2px",
                    color: faite ? OK : BRAND_DEEP,
                    flexShrink: 0,
                  }}
                >
                  {faite ? (
                    <IconCircleCheckFilled size={20} />
                  ) : (
                    <IconCircleDashed size={20} />
                  )}
                </Box>
                <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontWeight: 600,
                      fontSize: 14.5,
                      color: faite ? INK_MUTED : INK,
                    }}
                  >
                    {i + 1}. {etape.titre}
                  </Typography>
                  {!faite && (
                    <Typography
                      variant="body2"
                      sx={{ color: INK_MUTED, mt: 0.25 }}
                    >
                      {etape.texte}
                    </Typography>
                  )}
                </Box>
                <Button
                  component={Link}
                  href={href}
                  size="small"
                  variant={faite ? "text" : "outlined"}
                  endIcon={<IconChevronRight size={16} />}
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", ml: "auto" }}
                >
                  {faite ? "Revoir" : "Ouvrir"}
                </Button>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
