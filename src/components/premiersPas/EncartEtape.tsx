"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, AlertTitle, Button, Stack } from "@mui/material";
import { IconArrowLeft } from "@tabler/icons-react";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { usePremiersPas } from "@/hooks/usePremiersPas";
import { allerAAncre } from "@/components/recherche/PanneauRecherche";
import { cheminCentre } from "@/lib/cheminsCentre";
import {
  etapesDuProduit,
  PARAM_ETAPE,
  type EtapePremiersPas,
} from "@/lib/premiersPas";
import { usePremiersPasVisibles } from "./CartePremiersPas";

/**
 * L'encart « Étape n sur 4 » en haut d'une page d'arrivée des premiers pas (lot 2).
 *
 * Il ne paraît QUE si l'on vient de la carte (`?premiers_pas=n`), jamais à une visite
 * normale, et seulement pour les étapes que cette page porte (`chemins`) : la page de
 * paramétrage reçoit les étapes 3 et 4, l'écran de correspondance les 1 et 2.
 * L'élément visé est amené et entouré par le même code que la recherche centrale.
 *
 * Une étape sans verdict de complétude (les doubles examens) se coche ici, par
 * « J'ai compris ».
 */
export default function EncartEtape({ chemin }: { chemin: string }) {
  const params = useSearchParams();
  const { userId, produit } = useCentreProduit();
  const { etat, agir } = usePremiersPas();
  const visibles = usePremiersPasVisibles();

  const etapes = etapesDuProduit(produit);
  const n = Number(params?.get(PARAM_ETAPE));
  const etape = Number.isInteger(n) && n >= 1 ? etapes[n - 1] : undefined;
  const ici = !!etape && etape.chemin === chemin;

  useEffect(() => {
    if (!ici || !etape) return;
    return allerAAncre(document, etape.ancre);
  }, [ici, etape]);

  if (!ici || !etape || !visibles || !etat || userId === null || !produit)
    return null;

  return (
    <EncartEtapeVue
      numero={n}
      total={etapes.length}
      etape={etape}
      lue={etat.lus.includes(etape.cle)}
      onLu={() => void agir({ lu: etape.cle })}
      retour={`${cheminCentre(userId, produit)}#premiers_pas`}
    />
  );
}

/** L'encart seul, sans session ni réseau, pour la page d'aperçu. */
export function EncartEtapeVue({
  numero,
  total,
  etape,
  lue,
  onLu,
  retour,
}: {
  numero: number;
  total: number;
  etape: EtapePremiersPas;
  lue: boolean;
  onLu: () => void;
  retour: string;
}) {
  const sansVerdict = etape.completude.length === 0;

  return (
    <>
      {/* L'élément visé reste entouré tant que l'encart est là, comme après une recherche. */}
      <style>{`#${etape.ancre} { box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.55); border-radius: 8px; }`}</style>
      <Alert
        severity="info"
        variant="outlined"
        icon={false}
        sx={{
          mb: 2,
          borderRadius: 2,
          borderColor: "rgba(var(--accent-rgb), 0.4)",
        }}
      >
        <AlertTitle sx={{ fontWeight: 700 }}>
          Étape {numero} sur {total} : {etape.titre}
        </AlertTitle>
        {etape.consigne}
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{ mt: 1.5 }}
        >
          {sansVerdict && (
            <Button
              size="small"
              variant={lue ? "text" : "contained"}
              disabled={lue}
              onClick={onLu}
            >
              {lue ? "Étape cochée" : "J'ai compris"}
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            component={Link}
            href={retour}
            startIcon={<IconArrowLeft size={16} />}
          >
            Revenir aux premiers pas
          </Button>
        </Stack>
      </Alert>
    </>
  );
}
