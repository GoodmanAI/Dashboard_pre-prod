"use client";

import Retour from "@/components/shared/Retour";
import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * Logo du centre, commun à Talk et Konnect (28/11/2026). Plan
 * `lyrae/plans/2026-11-logo-du-client.md`, route `/api/logo-client`.
 *
 * Il sert au portail Konnect et à l'aperçu des liens des SMS (relance no-show, dépôt
 * d'ordonnance) : Google Messages précharge le lien et montre une petite carte. L'aperçu
 * de l'écran montre cette carte, pour que le client voie ce que verra son patient. Les
 * aperçus de lien n'affichent pas le SVG : l'écran le dit.
 */

type Etat = { present: boolean; type: string | null; nom: string | null; dansLesSms: boolean };
const VIDE: Etat = { present: false, type: null, nom: null, dansLesSms: false };
const TYPES_SMS = ["image/png", "image/jpeg", "image/webp"];

export default function LogoDuCentreCard({
  userProductId,
  centre,
  readOnly = false,
}: {
  userProductId: number;
  centre: string;
  readOnly?: boolean;
}) {
  const [etat, setEtat] = useState<Etat>(VIDE);
  const [image, setImage] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [retour, setRetour] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);

  // L'URL d'objet est libérée à chaque remplacement et au démontage.
  const poserImage = (url: string | null) =>
    setImage((prec) => {
      if (prec) URL.revokeObjectURL(prec);
      return url;
    });
  useEffect(() => () => poserImage(null), []);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`/api/logo-client?userProductId=${userProductId}&infos=1`, { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        if (!vivant || !d) return;
        setEtat({ present: d.present, type: d.type, nom: d.nom, dansLesSms: d.dansLesSms });
        if (d.present) {
          const img = await fetch(`/api/logo-client?userProductId=${userProductId}`, { cache: "no-store" });
          if (vivant && img.ok) poserImage(URL.createObjectURL(await img.blob()));
        }
      } catch {
        if (vivant) setErreur("Le logo n'a pas pu être chargé. Rechargez la page.");
      } finally {
        if (vivant) setChargement(false);
      }
    })();
    return () => {
      vivant = false;
    };
  }, [userProductId]);

  async function deposer(fichier: File) {
    setEnvoi(true);
    setErreur(null);
    try {
      const corps = new FormData();
      corps.append("fichier", fichier);
      const r = await fetch(`/api/logo-client?userProductId=${userProductId}`, { method: "PUT", body: corps });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(d.error || "Le dépôt n'a pas abouti. Réessayez.");
        return;
      }
      setEtat({ present: true, type: d.type ?? fichier.type, nom: d.nom ?? fichier.name, dansLesSms: TYPES_SMS.includes(fichier.type) });
      poserImage(URL.createObjectURL(fichier));
      setRetour("Logo enregistré.");
    } catch {
      setErreur("Le dépôt n'a pas abouti. Réessayez.");
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = "";
    }
  }

  async function retirer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/logo-client?userProductId=${userProductId}`, { method: "DELETE" });
      if (!r.ok) {
        setErreur("Le retrait n'a pas abouti. Réessayez.");
        return;
      }
      setEtat(VIDE);
      poserImage(null);
      setRetour("Logo retiré.");
    } catch {
      setErreur("Le retrait n'a pas abouti. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  const nomCentre = centre.trim() || "Votre centre";
  const imageCarte = etat.present && etat.dansLesSms ? image : null;

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="h6">Logo du centre</Typography>
          <Chip
            size="small"
            label={etat.present ? "Déposé" : "Aucun logo"}
            sx={{
              bgcolor: etat.present ? "rgba(var(--accent-rgb), 0.15)" : "rgba(0,0,0,0.06)",
              color: etat.present ? "var(--accent-deep)" : "text.secondary",
              fontWeight: 700,
            }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {chargement ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={24} sx={{ color: "var(--accent)" }} />
          </Stack>
        ) : (
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
            <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary">
                Votre logo apparaît dans l&apos;aperçu des liens de vos SMS (rappel de rendez-vous,
                dépôt d&apos;ordonnance) sur les téléphones qui montrent cet aperçu, et dans le
                portail de prise de rendez-vous en ligne si vous l&apos;avez. Un seul logo pour
                tout votre centre.
              </Typography>
              <input
                ref={champ}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void deposer(f);
                }}
              />
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Button
                  variant="outlined"
                  disabled={readOnly || envoi}
                  onClick={() => champ.current?.click()}
                  sx={{ color: "var(--accent-deep)", borderColor: "rgba(var(--accent-rgb), 0.5)" }}
                >
                  {etat.present ? "Remplacer le logo" : "Déposer un logo"}
                </Button>
                {etat.present && (
                  <Button color="error" disabled={readOnly || envoi} onClick={() => void retirer()}>
                    Retirer
                  </Button>
                )}
                {envoi && <CircularProgress size={18} sx={{ color: "var(--accent)" }} />}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                PNG ou JPEG carré de 300 px au moins, 512 Ko au plus. Le fichier est gardé chez nous :
                il reste affiché même si votre site change.
              </Typography>
              {etat.nom && (
                <Typography variant="caption" color="text.secondary">
                  Fichier déposé : {etat.nom}
                </Typography>
              )}
              {etat.present && !etat.dansLesSms && (
                <Alert severity="warning">
                  Ce logo est en SVG : le portail l&apos;affiche, mais pas l&apos;aperçu des liens SMS,
                  qui garde le logo Neuracorp. Déposez un PNG ou un JPEG pour l&apos;y voir.
                </Alert>
              )}
              {erreur && <Alert severity="error">{erreur}</Alert>}
            </Stack>

            <Box sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                Aperçu du lien dans le SMS
              </Typography>
              <CarteLien image={imageCarte} centre={nomCentre} />
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                Tous les téléphones ne montrent pas cet aperçu : l&apos;iPhone le cache souvent quand
                l&apos;expéditeur n&apos;est pas dans les contacts.
              </Typography>
            </Box>
          </Stack>
        )}

        <Retour ouvert={retour !== null} message={<>{retour}</>} gravite="success" onFermer={() => setRetour(null)} />
      </AccordionDetails>
    </Accordion>
  );
}

/** La petite carte que Google Messages fabrique sous un lien. Une idée, pas une copie exacte. */
function CarteLien({ image, centre }: { image: string | null; centre: string }) {
  return (
    <Box
      sx={{
        borderRadius: "14px",
        overflow: "hidden",
        bgcolor: "rgba(0,0,0,0.05)",
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: "10px",
            flexShrink: 0,
            bgcolor: "#fff",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
          }}
        >
          <Box
            component="img"
            src={image ?? "/images/logos/neuracorp-ai-icon_fond.png"}
            alt={image ? `Logo de ${centre}` : "Logo Neuracorp"}
            sx={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.3,
            }}
          >
            Confirmation de rendez-vous : {centre}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="p">
            rdv.neuracorp.ai
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
