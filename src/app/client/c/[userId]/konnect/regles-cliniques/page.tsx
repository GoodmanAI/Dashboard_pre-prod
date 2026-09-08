"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import BarreEnregistrement from "@/components/shared/BarreEnregistrement";
import { useSuiviModifications } from "@/hooks/useSuiviModifications";

/**
 * Règles que le cabinet peut activer (lot B, `konnect.regles-etat`).
 *
 * POURQUOI UNE SEULE LIGNE. Konnect porte une vingtaine de règles cliniques
 * (`regles/catalogue.py`), et **une seule** est marquée `activable_par_cabinet`.
 * Les autres sont des garde-fous décidés globalement : les exposer laisserait
 * croire qu'un centre peut les éteindre. Cet écran est donc volontairement court,
 * et il le dit.
 *
 * Il est écrit générique quand même : le catalogue ci-dessous est une liste, et une
 * règle qui deviendrait activable s'y ajoute sans toucher au reste. Mais on ne lui
 * donne pas plus de place qu'une entrée de menu.
 *
 * ÉTEINT PAR DÉFAUT. `_normaliser_regle_etat` traite toute règle dont l'état n'est
 * pas dit explicitement comme inactive. Une règle absente du corps envoyé n'est donc
 * pas « laissée telle quelle » : elle est éteinte. On envoie toujours la liste
 * entière.
 */

const DOMAINE = "konnect.regles-etat";

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";

/**
 * Miroir des règles `activable_par_cabinet=True` de `regles/catalogue.py`.
 * `id` est la valeur de `RegleId` (`regles/schema.py`), pas son nom Python : c'est
 * elle que Konnect relit. La changer casserait silencieusement l'activation.
 */
const REGLES_ACTIVABLES = [
  {
    id: "contrainte_patient",
    titre: "Afficher les consignes de préparation",
    aide:
      "Quand votre logiciel indique une préparation pour un examen (venir à jeun, boire un demi-litre d'eau, retirer ses bijoux), le patient la voit au moment de réserver et dans son message de confirmation.",
    consequence:
      "Éteint, le patient n'est prévenu de rien. Il peut arriver sans avoir fait la préparation, et l'examen n'est pas réalisable ce jour-là.",
  },
] as const;

type Etats = Record<string, boolean>;

const DEFAUT: Etats = Object.fromEntries(REGLES_ACTIVABLES.map((r) => [r.id, false]));

export default function ReglesCliniquesKonnect() {
  const { userProductId } = useCentreProduit();

  const [etats, setEtats] = useState<Etats>(DEFAUT);
  const [initial, setInitial] = useState<Etats>(DEFAUT);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    if (!userProductId) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`
        );
        if (!r.ok) throw new Error("Chargement impossible.");
        const d = await r.json();
        if (annule) return;
        const items = Array.isArray(d?.valeur?.items) ? d.valeur.items : [];
        // On ne repart jamais de ce qui est stocké : on part du catalogue, et on y
        // reporte ce qui est connu. Une règle retirée du catalogue disparaît ainsi
        // de l'écran sans traîner, et une règle ajoutée arrive éteinte.
        const charges: Etats = { ...DEFAUT };
        for (const item of items) {
          const id = typeof item?.regle_id === "string" ? item.regle_id : null;
          if (id && id in charges) charges[id] = item?.active === true;
        }
        setEtats(charges);
        setInitial(charges);
      } catch {
        if (!annule) setErreur("Impossible de charger les règles.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const { modifications, marquerEnregistre } = useSuiviModifications(etats, !chargement);

  async function enregistrer() {
    setErreur(null);
    setEnregistrement(true);
    try {
      // La liste entière, toujours : une règle absente serait éteinte côté Konnect.
      const items = REGLES_ACTIVABLES.map((r) => ({
        regle_id: r.id,
        active: etats[r.id] === true,
      }));
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=${DOMAINE}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: { items } }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Enregistrement refusé.");
      setInitial(etats);
      marquerEnregistre();
      setSucces(true);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <PageContainer title="Règles" description="Ce que le portail dit au patient">
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "var(--accent)" }} />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Règles" description="Ce que le portail dit au patient">
      <Box>
        <SectionHeader
          title="Règles"
          subtitle="Ce que le portail dit au patient avant sa venue"
        />

        <Typography variant="body2" sx={{ color: INK_MUTED, mb: 2.5, maxWidth: 720 }}>
          Le portail applique des règles de sécurité que nous réglons pour tout le
          monde. Celles ci-dessous vous appartiennent : à vous de dire si le portail
          s&apos;en charge, ou si vous préférez le faire vous-même.
        </Typography>

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2 }}>
          {REGLES_ACTIVABLES.map((regle) => (
            <Stack
              key={regle.id}
              direction="row"
              alignItems="flex-start"
              spacing={2}
              sx={{
                px: 2,
                py: 1.75,
                borderBottom: `1px solid ${BORDER}`,
                "&:last-of-type": { borderBottom: "none" },
              }}
            >
              <Box sx={{ flexGrow: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                  {regle.titre}
                </Typography>
                <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 0.25 }}>
                  {regle.aide}
                </Typography>
                {etats[regle.id] !== true && (
                  <Typography sx={{ fontSize: 12, color: "#9B2226", mt: 0.5 }}>
                    {regle.consequence}
                  </Typography>
                )}
              </Box>
              <Switch
                checked={etats[regle.id] === true}
                onChange={(e) =>
                  setEtats((prec) => ({ ...prec, [regle.id]: e.target.checked }))
                }
              />
            </Stack>
          ))}
        </Paper>

        <Typography sx={{ fontSize: 12, color: INK_MUTED, mt: 2, maxWidth: 720 }}>
          Les autres règles du portail (contre-indications, seuils de poids, cohérence
          des informations du patient) ne se règlent pas ici. Elles s&apos;appliquent à
          tous les centres et se modifient avec nous.
        </Typography>

        {erreur && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erreur}
          </Alert>
        )}

        <BarreEnregistrement
          modifications={modifications}
          enregistrement={enregistrement}
          onEnregistrer={enregistrer}
          onAnnuler={() => setEtats(initial)}
          libelle="Enregistrer les règles"
        />

        <Snackbar
          open={succes}
          autoHideDuration={4000}
          onClose={() => setSucces(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setSucces(false)}>
            Règles enregistrées. Le portail patient les appliquera dans la minute.
          </Alert>
        </Snackbar>
      </Box>
    </PageContainer>
  );
}
