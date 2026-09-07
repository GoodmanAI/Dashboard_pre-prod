"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import PageContainer from "@/app/(DashboardLayout)/components/container/PageContainer";
import SectionHeader from "@/components/admin/SectionHeader";
import {
  CHAMPS_SITE,
  SECTIONS_SITE,
  construireValeur,
  lireChemin,
  type ChampSite,
} from "@/lib/talkSiteChamps";

/**
 * Configuration du robot par centre, celle qui vivait dans son code.
 *
 * Édite le domaine `talk.site` de `ProductConfig`, que `/api/configuration`
 * descend au robot dans un bloc `site` (`contracts/shared/init-config.md`).
 *
 * ── CE QUI REND CET ÉCRAN PARTICULIER ────────────────────────────────────────
 *
 * Un champ éteint n'est pas un champ vide : il est **absent** du JSON, et le
 * robot garde alors sa valeur en dur. C'est pour cela qu'il y a un interrupteur
 * par réglage plutôt qu'un formulaire toujours rempli. Sans lui, on ne pourrait
 * jamais revenir au comportement d'origine une fois un champ saisi, et la
 * migration cesserait d'être réversible.
 *
 * Les champs sont déclarés dans `src/lib/talkSiteChamps.ts`, jamais ici : c'est
 * ce qui permettra d'ajouter les seize réglages restants sans retoucher cet
 * écran.
 */

const INK = "#0F2A3F";
const INK_MUTED = "#5A6B7B";
const BORDER = "#E4EAEE";
const SURFACE_MUTED = "#F7FAFB";

type Centre = { userProductId: number; clientNom: string | null };

export default function TalkConfigPage() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [selection, setSelection] = useState<number | "">("");
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [actifs, setActifs] = useState<Record<string, boolean>>({});
  const [saisies, setSaisies] = useState<Record<string, any>>({});

  // La liste des centres vient du parc : c'est déjà la vue de tous les centres
  // LyraeTalk, inutile d'en ouvrir une seconde.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/centre-statut");
        const d = await r.json();
        const liste: Centre[] = (Array.isArray(d.rows) ? d.rows : [])
          .filter((x: any) => x.produit === "talk")
          .map((x: any) => ({
            userProductId: x.userProductId,
            clientNom: x.clientNom,
          }));
        setCentres(liste);
        if (liste[0]) setSelection(liste[0].userProductId);
      } catch {
        setErreur("Impossible de charger la liste des centres.");
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const charger = useCallback(async (userProductId: number) => {
    setErreur(null);
    try {
      const r = await fetch(
        `/api/product-config?userProductId=${userProductId}&domaine=talk.site`
      );
      // 404 = aucune configuration pour ce centre, ce qui est l'état normal
      // d'un centre qui n'a pas encore été migré. Tous les champs sont éteints.
      const valeur =
        r.status === 200 ? ((await r.json())?.valeur ?? null) : null;

      const a: Record<string, boolean> = {};
      const s: Record<string, any> = {};
      for (const champ of CHAMPS_SITE) {
        const v = lireChemin(valeur, champ.chemin);
        a[champ.chemin] = v !== undefined;
        s[champ.chemin] =
          v !== undefined ? (champ.type === "liste" ? (v as string[]).join(", ") : v) : "";
      }
      setActifs(a);
      setSaisies(s);
    } catch {
      setErreur("Impossible de charger la configuration de ce centre.");
    }
  }, []);

  useEffect(() => {
    if (typeof selection === "number") void charger(selection);
  }, [selection, charger]);

  const nbActifs = useMemo(
    () => Object.values(actifs).filter(Boolean).length,
    [actifs]
  );

  const enregistrer = useCallback(async () => {
    if (typeof selection !== "number") return;
    setOccupe(true);
    setErreur(null);
    try {
      // Les listes sont saisies en texte, converties ici seulement.
      const converties: Record<string, unknown> = {};
      for (const champ of CHAMPS_SITE) {
        const brut = saisies[champ.chemin];
        converties[champ.chemin] =
          champ.type === "liste"
            ? String(brut ?? "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : champ.type === "nombre"
              ? Number(brut)
              : brut;
      }

      const r = await fetch(
        `/api/product-config?userProductId=${selection}&domaine=talk.site`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeur: construireValeur(actifs, converties) }),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Enregistrement impossible.");
      setMessage(
        nbActifs === 0
          ? "Configuration vidée. Le robot reprend ses valeurs par défaut."
          : "Configuration enregistrée. Elle s'applique au prochain appel."
      );
      await charger(selection);
    } catch (e: any) {
      setErreur(e?.message ?? "Enregistrement impossible.");
    } finally {
      setOccupe(false);
    }
  }, [selection, actifs, saisies, nbActifs, charger]);

  function Champ({ champ }: { champ: ChampSite }) {
    const actif = actifs[champ.chemin] === true;
    return (
      <Box sx={{ py: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Switch
            size="small"
            checked={actif}
            onChange={(e) =>
              setActifs((p) => ({ ...p, [champ.chemin]: e.target.checked }))
            }
            sx={{ mt: 0.25 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                {champ.libelle}
              </Typography>
              <Typography
                component="code"
                sx={{ fontSize: 11.5, color: INK_MUTED, fontFamily: "monospace" }}
              >
                {champ.chemin}
              </Typography>
              {champ.proprietaire === "client" && (
                <Typography sx={{ fontSize: 11, color: INK_MUTED }}>
                  (réglage client)
                </Typography>
              )}
            </Stack>

            <Typography sx={{ fontSize: 12, color: INK_MUTED, mb: actif ? 1 : 0 }}>
              {champ.aide}
            </Typography>

            {actif ? (
              champ.type === "booleen" ? (
                <Switch
                  size="small"
                  checked={saisies[champ.chemin] === true}
                  onChange={(e) =>
                    setSaisies((p) => ({ ...p, [champ.chemin]: e.target.checked }))
                  }
                />
              ) : (
                <TextField
                  size="small"
                  fullWidth={champ.type === "texte-long"}
                  multiline={champ.type === "texte-long"}
                  minRows={champ.type === "texte-long" ? 2 : undefined}
                  type={champ.type === "nombre" ? "number" : "text"}
                  inputProps={
                    champ.type === "nombre"
                      ? { min: champ.min, max: champ.max }
                      : undefined
                  }
                  value={saisies[champ.chemin] ?? ""}
                  onChange={(e) =>
                    setSaisies((p) => ({ ...p, [champ.chemin]: e.target.value }))
                  }
                  sx={{ maxWidth: champ.type === "texte-long" ? "100%" : 320 }}
                />
              )
            ) : (
              <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>
                Le robot applique : <strong>{champ.defautRobot}</strong>
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>
    );
  }

  return (
    <PageContainer title="Configuration du robot" description="Réglages par centre">
      <Box>
        <SectionHeader
          title="Configuration du robot"
          subtitle="Les réglages qui vivaient dans le code du robot. Un réglage éteint laisse le robot appliquer sa valeur d'origine."
        />

        {erreur && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur(null)}>
            {erreur}
          </Alert>
        )}

        <Paper variant="outlined" sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Select
              size="small"
              displayEmpty
              value={selection}
              onChange={(e) =>
                setSelection(e.target.value === "" ? "" : Number(e.target.value))
              }
              sx={{ fontSize: 13, minWidth: 300 }}
            >
              <MenuItem value="">
                <span style={{ color: INK_MUTED }}>Choisissez un centre</span>
              </MenuItem>
              {centres.map((c) => (
                <MenuItem key={c.userProductId} value={c.userProductId}>
                  {c.clientNom ?? `Centre ${c.userProductId}`}
                </MenuItem>
              ))}
            </Select>
            <Box sx={{ flexGrow: 1 }} />
            <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>
              {nbActifs} réglage{nbActifs > 1 ? "s" : ""} défini
              {nbActifs > 1 ? "s" : ""} ici, {CHAMPS_SITE.length - nbActifs} laissé
              {CHAMPS_SITE.length - nbActifs > 1 ? "s" : ""} au robot
            </Typography>
            <Button
              variant="contained"
              disableElevation
              disabled={occupe || typeof selection !== "number"}
              onClick={() => void enregistrer()}
              sx={{ textTransform: "none", bgcolor: "var(--accent)" }}
            >
              Enregistrer
            </Button>
          </Stack>
        </Paper>

        {chargement ? (
          <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
            <CircularProgress size={22} />
          </Box>
        ) : typeof selection !== "number" ? null : (
          SECTIONS_SITE.map((section) => (
            <Paper
              key={section.titre}
              variant="outlined"
              sx={{ borderColor: BORDER, borderRadius: 2, p: 2, mb: 2 }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: INK }}>
                {section.titre}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: INK_MUTED, mb: 1 }}>
                {section.description}
              </Typography>
              <Divider />
              {section.champs.map((champ, i) => (
                <React.Fragment key={champ.chemin}>
                  {i > 0 && <Divider />}
                  <Champ champ={champ} />
                </React.Fragment>
              ))}
            </Paper>
          ))
        )}

        <Box sx={{ bgcolor: SURFACE_MUTED, borderRadius: 2, p: 2 }}>
          <Typography sx={{ fontSize: 12.5, color: INK_MUTED }}>
            Ces réglages descendent au robot au décrochage de chaque appel, dans le bloc{" "}
            <code>site</code>. Un appel déjà en cours garde la configuration qu&apos;il a
            reçue. Le reste de la configuration du robot vit encore dans son code et
            rejoindra cet écran au fur et à mesure.
          </Typography>
        </Box>
      </Box>

      <Snackbar
        open={message !== null}
        autoHideDuration={4000}
        onClose={() => setMessage(null)}
        message={message ?? ""}
      />
    </PageContainer>
  );
}
