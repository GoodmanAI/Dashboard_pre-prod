"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { Close, CheckCircle } from "@mui/icons-material";
import {
  aujourdhuiIso,
  champVisible,
  elementsAEcrire,
  erreurDuChamp,
  type Champ,
  type FormulairePage,
  type Reponse,
  type Reponses,
} from "@/lib/formulaires";
import {
  BLOC_BORDER,
  BRAND_TEAL,
  BRAND_TEAL_DARK,
  BRAND_TEAL_SOFT,
  ENCRE,
  TEXT_MAIN,
  TEXT_MUTED,
} from "./charte";

/**
 * Questionnaire du centre rempli sur la page (lot B des documents demandes,
 * plans/2026-10-questionnaires-en-ligne.md, workspace).
 *
 * Parcours : les questions par etapes (une question visible ne s'affiche que
 * si sa condition est remplie), puis la signature, puis l'apercu du document
 * du centre avec les reponses dessinees aux memes places que dans le PDF
 * (`elementsAEcrire`, partage avec le serveur), puis « Confirmer et envoyer ».
 * Le serveur reverifie tout, ecrit le PDF et le range comme un depot.
 *
 * Plein ecran au telephone, fenetre au-dela.
 */

interface Donnees {
  libelle: string;
  formulaire: FormulairePage;
  prerempli: { nom: string; prenom: string; telephone: string };
}

type Fin = "EXPIRED" | "LOCKED";

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Espace insecable devant ? ! : ; » (le signe ne part pas seul a la ligne). */
function fr(t: string): string {
  return t.replace(/ ([?!:;»])/g, " $1").replace(/« /g, "« ");
}

/** 06 12 34 56 78, depuis +33612345678 ou 0612345678. */
function telephoneLisible(brut: string): string {
  let n = brut.replace(/[^\d+]/g, "");
  if (n.startsWith("+33")) n = "0" + n.slice(3);
  if (/^0\d{9}$/.test(n)) return n.replace(/(\d{2})(?=\d)/g, "$1 ");
  return brut;
}

function valeursProposees(d: Donnees): Reponses {
  const r: Reponses = {};
  for (const c of d.formulaire.champs) {
    if (c.type !== "texte" || !c.prerempli) continue;
    const v =
      c.prerempli === "nom" ? d.prerempli.nom
      : c.prerempli === "prenom" ? d.prerempli.prenom
      : c.prerempli === "nom_prenom" ? `${d.prerempli.nom} ${d.prerempli.prenom}`.trim()
      : telephoneLisible(d.prerempli.telephone);
    if (v) r[c.id] = v;
  }
  return r;
}

export default function QuestionnaireEnLigne({
  token,
  pieceId,
  code,
  ouvert,
  onFermer,
  onEnvoye,
  onCodeRefuse,
  onFin,
}: {
  token: string;
  pieceId: number;
  code: string;
  ouvert: boolean;
  onFermer: () => void;
  onEnvoye: () => void;
  onCodeRefuse: (attemptsLeft: number) => void;
  onFin: (s: Fin) => void;
}) {
  const pleinEcran = useMediaQuery("(max-width:600px)");
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [reponses, setReponses] = useState<Reponses>({});
  const [etape, setEtape] = useState(0);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const haut = useRef<HTMLDivElement>(null);

  // Ouverture : le code du SMS est verifie par le serveur, qui renvoie les
  // questions et les valeurs proposees. Les reponses deja donnees restent si
  // le patient ferme puis rouvre.
  useEffect(() => {
    if (!ouvert || donnees) return;
    let vivant = true;
    setErreurChargement(null);
    fetch(`/api/prescriptions/${token}/formulaire/${pieceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!vivant) return;
        if (!res.ok) {
          if (data.status === "LOCKED" || data.status === "EXPIRED") onFin(data.status);
          else if (typeof data.attemptsLeft === "number") onCodeRefuse(data.attemptsLeft);
          setErreurChargement(
            res.status === 422
              ? "Le code n'est pas le bon. Vérifiez-le en haut de la page, puis réessayez."
              : (data.error ?? "Le questionnaire n'a pas pu s'ouvrir. Réessayez.")
          );
          return;
        }
        setDonnees(data);
        setReponses((prev) => ({ ...valeursProposees(data), ...prev }));
      })
      .catch(() => {
        if (vivant) setErreurChargement("La connexion a été coupée. Vérifiez votre réseau et réessayez.");
      });
    return () => {
      vivant = false;
    };
  }, [ouvert, donnees, token, pieceId, code, onFin, onCodeRefuse]);

  const etapes = donnees?.formulaire.etapes ?? [];
  const aSignature = !!donnees?.formulaire.champs.some((c) => c.type === "signature");
  const indexSignature = etapes.length;
  const indexApercu = etapes.length + (aSignature ? 1 : 0);
  const total = indexApercu + 1;

  /** Les champs poses a l'etape i, compte tenu des reponses deja donnees. */
  function champsDeLEtape(i: number): Champ[] {
    if (!donnees) return [];
    return (etapes[i]?.champs ?? [])
      .map((id) => donnees.formulaire.champs.find((c) => c.id === id))
      .filter((c): c is Champ => !!c && champVisible(donnees.formulaire, c, reponses));
  }

  function repondre(id: string, v: Reponse) {
    setReponses((prev) => ({ ...prev, [id]: v }));
    setErreurs((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _retire, ...reste } = prev;
      return reste;
    });
  }

  function allerA(i: number) {
    setEtape(i);
    setErreurEnvoi(null);
    haut.current?.scrollTo({ top: 0 });
  }

  function continuer() {
    if (etape < etapes.length) {
      const e: Record<string, string> = {};
      for (const c of champsDeLEtape(etape)) {
        const m = erreurDuChamp(c, reponses[c.id]);
        if (m) e[c.id] = m;
      }
      setErreurs(e);
      if (Object.keys(e).length > 0) return;
    }
    if (etape === indexSignature && aSignature && !signature) {
      setErreurEnvoi("Signez dans le cadre pour continuer.");
      return;
    }
    allerA(etape + 1);
  }

  async function envoyer() {
    if (!donnees) return;
    setEnvoi(true);
    setErreurEnvoi(null);
    try {
      const res = await fetch(`/api/prescriptions/${token}/formulaire/${pieceId}/envoyer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), reponses, signature }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.status === "LOCKED" || data.status === "EXPIRED") {
          onFin(data.status);
          return;
        }
        if (typeof data.attemptsLeft === "number") onCodeRefuse(data.attemptsLeft);
        if (data.erreurs && typeof data.erreurs === "object") {
          setErreurs(data.erreurs);
          const premiere = etapes.findIndex((e) => e.champs.some((id) => data.erreurs[id]));
          if (premiere >= 0) {
            allerA(premiere);
            return;
          }
        }
        setErreurEnvoi(data.error ?? `L'envoi a échoué (erreur ${res.status}). Réessayez.`);
        return;
      }
      // Un nouveau remplissage repart de la premiere etape, reponses gardees.
      setEtape(0);
      onEnvoye();
    } catch {
      setErreurEnvoi("La connexion a été coupée. Vérifiez votre réseau et réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  const titreEtape =
    etape < etapes.length
      ? etapes[etape].titre
      : etape === indexSignature && aSignature
        ? "Votre signature"
        : "Vérifiez avant d'envoyer";

  return (
    <Dialog
      open={ouvert}
      onClose={envoi ? undefined : onFermer}
      fullScreen={pleinEcran}
      fullWidth
      maxWidth="sm"
      aria-labelledby="questionnaire-titre"
    >
      <Stack sx={{ height: pleinEcran ? "100%" : "min(860px, 90vh)" }}>
        {/* En-tete : document, etape, progression, fermer */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: `1px solid ${BLOC_BORDER}` }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: TEXT_MUTED, display: "block" }}>
                {donnees?.libelle ?? "Questionnaire"}
                {donnees ? `, étape ${Math.min(etape + 1, total)} sur ${total}` : ""}
              </Typography>
              <Typography
                id="questionnaire-titre"
                variant="h6"
                component="h2"
                sx={{ color: TEXT_MAIN, fontWeight: 700, lineHeight: 1.3 }}
              >
                {donnees ? titreEtape : "Ouverture du questionnaire"}
              </Typography>
            </Box>
            <IconButton
              onClick={onFermer}
              disabled={envoi}
              aria-label="Fermer le questionnaire"
              sx={{ mr: -1, mt: -0.5 }}
            >
              <Close />
            </IconButton>
          </Stack>
          {donnees && (
            <LinearProgress
              variant="determinate"
              value={((etape + 1) / total) * 100}
              sx={{
                mt: 1.5,
                height: 6,
                borderRadius: 3,
                bgcolor: BRAND_TEAL_SOFT,
                "& .MuiLinearProgress-bar": { bgcolor: BRAND_TEAL, borderRadius: 3 },
              }}
            />
          )}
        </Box>

        {/* Corps */}
        <Box ref={haut} sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>
          {!donnees && !erreurChargement && (
            <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
              <CircularProgress sx={{ color: BRAND_TEAL }} />
            </Stack>
          )}
          {erreurChargement && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {erreurChargement}
            </Alert>
          )}

          {donnees && etape < etapes.length && (
            <Stack spacing={3}>
              {etapes[etape].aide && (
                <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
                  {fr(etapes[etape].aide)}
                </Typography>
              )}
              {champsDeLEtape(etape).map((c) => (
                <ChampSaisi
                  key={c.id}
                  champ={c}
                  valeur={reponses[c.id]}
                  erreur={erreurs[c.id]}
                  onChange={(v) => repondre(c.id, v)}
                />
              ))}
            </Stack>
          )}

          {donnees && aSignature && etape === indexSignature && (
            <Stack spacing={1.5}>
              <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
                Signez dans le cadre avec le doigt, ou avec la souris sur un ordinateur.
                La date du jour est ajoutée au document.
              </Typography>
              <PadSignature valeur={signature} onChange={(s) => { setSignature(s); setErreurEnvoi(null); }} />
            </Stack>
          )}

          {donnees && etape === indexApercu && (
            <Stack spacing={1.5}>
              <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
                Voici le document qui sera envoyé au centre. Vérifiez vos réponses. Pour
                corriger, revenez en arrière.
              </Typography>
              <Apercu
                token={token}
                pieceId={pieceId}
                formulaire={donnees.formulaire}
                reponses={reponses}
                signature={signature}
              />
            </Stack>
          )}

          {erreurEnvoi && (
            <Alert severity="error" sx={{ borderRadius: 2, mt: 2 }}>
              {erreurEnvoi}
            </Alert>
          )}
        </Box>

        {/* Pied : retour, continuer ou envoyer */}
        {donnees && (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              px: 2.5,
              py: 1.5,
              borderTop: `1px solid ${BLOC_BORDER}`,
              pb: pleinEcran ? "max(12px, env(safe-area-inset-bottom))" : 1.5,
            }}
          >
            {etape > 0 && (
              <Button
                onClick={() => allerA(etape - 1)}
                disabled={envoi}
                sx={{ color: BRAND_TEAL_DARK, px: 2, minHeight: 48 }}
              >
                Retour
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            {etape < indexApercu ? (
              <Button
                variant="contained"
                onClick={continuer}
                sx={{
                  minHeight: 48,
                  px: 4,
                  bgcolor: BRAND_TEAL,
                  "&:hover": { bgcolor: BRAND_TEAL_DARK },
                }}
              >
                Continuer
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={envoyer}
                disabled={envoi}
                startIcon={envoi ? undefined : <CheckCircle />}
                sx={{
                  minHeight: 48,
                  px: 3,
                  bgcolor: BRAND_TEAL,
                  "&:hover": { bgcolor: BRAND_TEAL_DARK },
                  "&.Mui-disabled": { bgcolor: "#CFE9E1", color: "#FFF" },
                }}
              >
                {envoi ? (
                  <>
                    <CircularProgress size={20} sx={{ color: "#FFF", mr: 1 }} />
                    Envoi en cours…
                  </>
                ) : (
                  "Confirmer et envoyer"
                )}
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Un champ
// ---------------------------------------------------------------------------

function ChampSaisi({
  champ: c,
  valeur,
  erreur,
  onChange,
}: {
  champ: Champ;
  valeur: Reponse | undefined;
  erreur?: string;
  onChange: (v: Reponse) => void;
}) {
  switch (c.type) {
    case "texte":
      return (
        <TextField
          label={c.libelle}
          value={typeof valeur === "string" ? valeur : ""}
          onChange={(e) => onChange(e.target.value)}
          error={!!erreur}
          helperText={erreur ?? c.aide}
          required={c.requis}
          fullWidth
          type={c.format === "mail" ? "email" : c.format === "telephone" ? "tel" : "text"}
          inputProps={{
            maxLength: c.max ?? 120,
            inputMode:
              c.format === "nombre" ? "decimal"
              : c.format === "telephone" ? "tel"
              : c.format === "mail" ? "email"
              : "text",
            autoComplete:
              c.format === "mail" ? "email"
              : c.format === "telephone" ? "tel"
              : "off",
          }}
          InputProps={
            c.unite
              ? { endAdornment: <InputAdornment position="end">{c.unite}</InputAdornment> }
              : undefined
          }
        />
      );
    case "date":
      return <ChampDate champ={c} valeur={valeur} erreur={erreur} onChange={onChange} />;
    case "choix":
      return <ChampChoix champ={c} valeur={valeur} erreur={erreur} onChange={onChange} />;
    case "case":
      return (
        <Box>
          {c.aide && (
            <Typography variant="body2" sx={{ color: TEXT_MUTED, mb: 1.5 }}>
              {fr(c.aide)}
            </Typography>
          )}
          <Box
            component="label"
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
              p: 1.5,
              pr: 2,
              borderRadius: 2,
              cursor: "pointer",
              border: `1.5px solid ${erreur ? "#D32F2F" : valeur === true ? BRAND_TEAL : BLOC_BORDER}`,
              bgcolor: valeur === true ? BRAND_TEAL_SOFT : "transparent",
              transition: "background-color 120ms, border-color 120ms",
            }}
          >
            <Checkbox
              checked={valeur === true}
              onChange={(e) => onChange(e.target.checked)}
              sx={{ p: 0.5, color: BRAND_TEAL_DARK, "&.Mui-checked": { color: BRAND_TEAL_DARK } }}
            />
            <Typography variant="body1" sx={{ color: TEXT_MAIN, pt: 0.5 }}>
              {fr(c.libelle)}
            </Typography>
          </Box>
          {erreur && (
            <Typography variant="caption" sx={{ color: "#D32F2F", display: "block", mt: 0.5, ml: 1.5 }}>
              {erreur}
            </Typography>
          )}
        </Box>
      );
    default:
      return null;
  }
}

/** Oui, non, ne sait pas... en gros boutons ; plusieurs choix en liste. */
function ChampChoix({
  champ: c,
  valeur,
  erreur,
  onChange,
}: {
  champ: Extract<Champ, { type: "choix" }>;
  valeur: Reponse | undefined;
  erreur?: string;
  onChange: (v: Reponse) => void;
}) {
  const choisies = Array.isArray(valeur) ? valeur : typeof valeur === "string" ? [valeur] : [];
  // Des reponses courtes (Oui, Non) tiennent sur une ligne ; des phrases vont
  // l'une sous l'autre.
  const enLigne = !c.multiple && c.options.every((o) => o.libelle.length <= 16);

  function basculer(v: string) {
    if (!c.multiple) return onChange(v);
    onChange(choisies.includes(v) ? choisies.filter((x) => x !== v) : [...choisies, v]);
  }

  return (
    <Box role="group" aria-label={c.libelle}>
      <Typography variant="body1" sx={{ color: TEXT_MAIN, fontWeight: 600, mb: c.aide ? 0.5 : 1.25 }}>
        {fr(c.libelle)}
      </Typography>
      {c.aide && (
        <Typography variant="body2" sx={{ color: TEXT_MUTED, mb: 1.25 }}>
          {fr(c.aide)}
        </Typography>
      )}
      <Stack direction={enLigne ? "row" : "column"} spacing={1}>
        {c.options.map((o) => {
          const actif = choisies.includes(o.valeur);
          return (
            <Button
              key={o.valeur}
              onClick={() => basculer(o.valeur)}
              variant="outlined"
              aria-pressed={actif}
              disableFocusRipple
              fullWidth={enLigne}
              sx={{
                minHeight: 48,
                justifyContent: enLigne ? "center" : "flex-start",
                textAlign: "left",
                textTransform: "none",
                fontSize: "1rem",
                fontWeight: actif ? 700 : 500,
                px: 2,
                borderWidth: 1.5,
                borderRadius: 2,
                color: actif ? BRAND_TEAL_DARK : TEXT_MAIN,
                bgcolor: actif ? BRAND_TEAL_SOFT : "#FFF",
                borderColor: erreur ? "#D32F2F" : actif ? BRAND_TEAL : BLOC_BORDER,
                transition: "background-color 120ms, border-color 120ms, transform 80ms",
                "&:hover": {
                  borderWidth: 1.5,
                  borderColor: BRAND_TEAL,
                  bgcolor: actif ? BRAND_TEAL_SOFT : "#F7FBFA",
                },
                "&:active": { transform: "scale(0.98)" },
                "&.Mui-focusVisible": { outline: `2px solid ${BRAND_TEAL}`, outlineOffset: 2 },
              }}
            >
              {c.multiple && (
                <Checkbox
                  checked={actif}
                  tabIndex={-1}
                  disableRipple
                  sx={{ p: 0, mr: 1, color: BRAND_TEAL_DARK, "&.Mui-checked": { color: BRAND_TEAL_DARK } }}
                />
              )}
              {o.libelle}
            </Button>
          );
        })}
      </Stack>
      {erreur && (
        <Typography variant="caption" sx={{ color: "#D32F2F", display: "block", mt: 0.75, ml: 1.5 }}>
          {erreur}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Date en jj/mm/aaaa, chiffres seulement : les barres s'ajoutent seules. Un
 * calendrier est penible pour une date de naissance. La reponse vaut la date
 * ISO quand elle est complete, sinon le texte saisi (refuse a la verification).
 */
function ChampDate({
  champ: c,
  valeur,
  erreur,
  onChange,
}: {
  champ: Extract<Champ, { type: "date" }>;
  valeur: Reponse | undefined;
  erreur?: string;
  onChange: (v: Reponse) => void;
}) {
  const depuisValeur = (v: Reponse | undefined) =>
    typeof v === "string" && DATE_ISO.test(v) ? v.split("-").reverse().join("/") : typeof v === "string" ? v : "";
  const [texte, setTexte] = useState(() => depuisValeur(valeur));

  function saisir(brut: string) {
    const chiffres = brut.replace(/\D/g, "").slice(0, 8);
    const t = [chiffres.slice(0, 2), chiffres.slice(2, 4), chiffres.slice(4)].filter(Boolean).join("/");
    setTexte(t);
    onChange(chiffres.length === 8 ? `${chiffres.slice(4)}-${chiffres.slice(2, 4)}-${chiffres.slice(0, 2)}` : t);
  }

  const incomplete = !!erreur && texte.length > 0 && texte.length < 10;
  return (
    <TextField
      label={c.libelle}
      value={texte}
      onChange={(e) => saisir(e.target.value)}
      placeholder="jj/mm/aaaa"
      error={!!erreur}
      helperText={incomplete ? "Écrivez la date en entier, par exemple 23/04/1987." : (erreur ?? c.aide)}
      required={c.requis}
      fullWidth
      inputProps={{ inputMode: "numeric", autoComplete: "off", maxLength: 10 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

/**
 * Cadre de signature au doigt ou a la souris. Le trace est rendu en PNG
 * recadre sur ce qui a ete dessine (le serveur l'ajuste au cadre du document).
 */
function PadSignature({
  valeur,
  onChange,
}: {
  valeur: string | null;
  onChange: (s: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dessin = useRef<{ actif: boolean; x: number; y: number }>({ actif: false, x: 0, y: 0 });
  const bornes = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [vide, setVide] = useState(!valeur);

  // Taille reelle du cadre a l'ecran, en pixels physiques.
  useLayoutEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ratio = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * ratio);
    cv.height = Math.round(r.height * ratio);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ENCRE;
    // Une signature deja faite (retour depuis l'apercu) se redessine.
    if (valeur) {
      const img = new Image();
      img.onload = () => {
        const echelle = Math.min(r.width / img.width, r.height / img.height, 1);
        ctx.drawImage(img, 8, 8, img.width * echelle, img.height * echelle);
      };
      img.src = valeur;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function etendre(x: number, y: number) {
    const b = bornes.current;
    bornes.current = b
      ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) }
      : { x0: x, y0: y, x1: x, y1: y };
  }

  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    dessin.current = { actif: true, ...p };
    etendre(p.x, p.y);
    const ctx = e.currentTarget.getContext("2d");
    ctx?.beginPath();
    ctx?.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx?.fill();
  }

  function trace(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dessin.current.actif) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(dessin.current.x, dessin.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dessin.current = { actif: true, ...p };
    etendre(p.x, p.y);
    setVide(false);
  }

  function fin() {
    if (!dessin.current.actif) return;
    dessin.current.actif = false;
    const cv = canvas.current;
    const b = bornes.current;
    if (!cv || !b) return;
    // Recadrage sur le trace, avec une marge.
    const ratio = window.devicePixelRatio || 1;
    const marge = 6;
    const x = Math.max(0, (b.x0 - marge) * ratio);
    const y = Math.max(0, (b.y0 - marge) * ratio);
    const l = Math.min(cv.width - x, (b.x1 - b.x0 + 2 * marge) * ratio);
    const h = Math.min(cv.height - y, (b.y1 - b.y0 + 2 * marge) * ratio);
    if (l < 4 || h < 4) return;
    const sortie = document.createElement("canvas");
    // Au plus 600 px de large : assez net sur le document, leger a envoyer.
    const echelle = Math.min(1, 600 / l);
    sortie.width = Math.round(l * echelle);
    sortie.height = Math.round(h * echelle);
    sortie.getContext("2d")?.drawImage(cv, x, y, l, h, 0, 0, sortie.width, sortie.height);
    onChange(sortie.toDataURL("image/png"));
  }

  function effacer() {
    const cv = canvas.current;
    cv?.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
    bornes.current = null;
    setVide(true);
    onChange(null);
  }

  return (
    <Box>
      <Box
        sx={{
          position: "relative",
          border: `1.5px dashed ${vide ? BLOC_BORDER : BRAND_TEAL}`,
          borderRadius: 2,
          bgcolor: "#FFF",
        }}
      >
        <canvas
          ref={canvas}
          onPointerDown={debut}
          onPointerMove={trace}
          onPointerUp={fin}
          onPointerCancel={fin}
          aria-label="Cadre de signature"
          style={{ display: "block", width: "100%", height: 200, touchAction: "none", cursor: "crosshair" }}
        />
        {vide && (
          <Typography
            variant="body2"
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: TEXT_MUTED,
              pointerEvents: "none",
            }}
          >
            Signez ici
          </Typography>
        )}
        <Box sx={{ position: "absolute", left: 24, right: 24, bottom: 44, borderBottom: `1px solid ${BLOC_BORDER}`, pointerEvents: "none" }} />
      </Box>
      <Button onClick={effacer} disabled={vide} sx={{ mt: 1, color: BRAND_TEAL_DARK, px: 1 }}>
        Effacer et recommencer
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Apercu
// ---------------------------------------------------------------------------

/**
 * Le document du centre avec les reponses aux places du PDF. SVG aux
 * dimensions de la page en points : les coordonnees du formulaire s'y posent
 * telles quelles (texte sur sa ligne de base, cases par leur coin haut gauche).
 */
function Apercu({
  token,
  pieceId,
  formulaire,
  reponses,
  signature,
}: {
  token: string;
  pieceId: number;
  formulaire: FormulairePage;
  reponses: Reponses;
  signature: string | null;
}) {
  const elements = useMemo(
    () => elementsAEcrire(formulaire, reponses, aujourdhuiIso()),
    [formulaire, reponses]
  );
  return (
    <Stack spacing={1.5}>
      {formulaire.pages.map((p, i) => (
        <Box
          key={i}
          sx={{
            border: `1px solid ${BLOC_BORDER}`,
            borderRadius: 1,
            overflow: "hidden",
            boxShadow: "0 2px 12px rgba(31, 52, 72, 0.08)",
          }}
        >
          <svg
            viewBox={`0 0 ${p.largeur} ${p.hauteur}`}
            role="img"
            aria-label={`Page ${i + 1} du document rempli`}
            style={{ display: "block", width: "100%", height: "auto" }}
          >
            <image
              href={`/api/prescriptions/${token}/formulaire/${pieceId}/fond/${i + 1}`}
              x={0}
              y={0}
              width={p.largeur}
              height={p.hauteur}
            />
            {elements
              .filter((e) => e.page === i + 1)
              .map((e, k) => {
                if (e.sorte === "texte") {
                  const tropLong = e.largeur && e.texte.length * e.taille * 0.52 > e.largeur;
                  return (
                    <text
                      key={k}
                      x={e.x}
                      y={e.y}
                      fontSize={e.taille}
                      fontFamily="Helvetica, Arial, sans-serif"
                      fill={ENCRE}
                      {...(tropLong ? { textLength: e.largeur, lengthAdjust: "spacingAndGlyphs" } : {})}
                    >
                      {e.texte}
                    </text>
                  );
                }
                if (e.sorte === "croix") {
                  const m = e.taille * 0.15;
                  const ep = Math.max(1, e.taille / 8);
                  return (
                    <g key={k} stroke={ENCRE} strokeWidth={ep} strokeLinecap="round">
                      <line x1={e.x + m} y1={e.y + m} x2={e.x + e.taille - m} y2={e.y + e.taille - m} />
                      <line x1={e.x + m} y1={e.y + e.taille - m} x2={e.x + e.taille - m} y2={e.y + m} />
                    </g>
                  );
                }
                return signature ? (
                  <image
                    key={k}
                    href={signature}
                    x={e.x}
                    y={e.y}
                    width={e.largeur}
                    height={e.hauteur}
                    preserveAspectRatio="xMinYMin meet"
                  />
                ) : null;
              })}
          </svg>
        </Box>
      ))}
    </Stack>
  );
}
