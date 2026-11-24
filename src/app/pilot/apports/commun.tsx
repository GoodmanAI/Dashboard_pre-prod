"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, Chip, MenuItem, Stack, TextField, Typography, type ChipProps, type TextFieldProps } from "@mui/material";
import { envoyer } from "@/pilot/components/formulaires/DialogueFormulaire";
import { entierDepuisSaisie } from "@/pilot/lib/argent";
import { etapeCommande, RIS_CONNUS, risReconnu, type StatutCommande, type StatutFacture, STATUTS_FACTURE } from "@/pilot/lib/apports/referentiel";
import type { EtatDecision } from "@/pilot/lib/apports/calcul";

/**
 * Ce que partagent les onglets de l'apport d'affaires (CHOIX.md, C-63) : chaque
 * champ s'enregistre quand on le quitte, comme dans le calculateur, et un
 * indicateur dit si c'est fait.
 */

type Etat = { enCours: number; erreur: string | null; derniere: number | null };
const Contexte = createContext<{ etat: Etat; enregistrer: <T = unknown>(url: string, methode: string, corps?: unknown) => Promise<T | null>; effacerErreur: () => void } | null>(null);

export function FournisseurSauvegarde({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ enCours: 0, erreur: null, derniere: null });
  const enregistrer = useCallback(async <T,>(url: string, methode: string, corps?: unknown): Promise<T | null> => {
    setEtat((e) => ({ ...e, enCours: e.enCours + 1, erreur: null }));
    try {
      const r = await envoyer<T>(url, methode, undefined, corps);
      setEtat((e) => ({ ...e, enCours: e.enCours - 1, derniere: Date.now() }));
      router.refresh();
      return r;
    } catch (erreur) {
      setEtat((e) => ({ ...e, enCours: e.enCours - 1, erreur: erreur instanceof Error ? erreur.message : "L'enregistrement a échoué." }));
      router.refresh();
      return null;
    }
  }, [router]);
  return <Contexte.Provider value={{ etat, enregistrer, effacerErreur: () => setEtat((e) => ({ ...e, erreur: null })) }}>{children}</Contexte.Provider>;
}

export function useSauvegarde() {
  const c = useContext(Contexte);
  if (!c) throw new Error("FournisseurSauvegarde manquant.");
  return c;
}

/** « Enregistrement… », « Enregistré » ou l'erreur, avec sa pastille. */
export function EtatSauvegarde() {
  const { etat } = useSauvegarde();
  const [couleur, texte] = etat.erreur ? ["error.main", etat.erreur] : etat.enCours ? ["warning.main", "Enregistrement…"]
    : etat.derniere ? ["success.main", "Enregistré"] : ["text.disabled", "Chaque champ s'enregistre quand vous le quittez"];
  return <Stack direction="row" spacing={0.75} alignItems="center" aria-live="polite" sx={{ fontSize: 13, color: etat.erreur ? "error.main" : "text.secondary", minWidth: 0 }}>
    <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: couleur, flexShrink: 0 }} />
    <span>{texte}</span>
  </Stack>;
}

/**
 * Un champ qui garde sa saisie localement et l'enregistre en partant : la page
 * qui se recharge derrière ne l'écrase pas tant qu'il a le focus.
 */
export function ChampEnLigne({ valeur, enregistrer, desactive, type = "text", multiligne, ...props }: Omit<TextFieldProps, "value" | "onChange" | "onBlur" | "type"> & {
  valeur: string | null | undefined; enregistrer: (v: string) => void; desactive?: boolean; type?: "text" | "date" | "number" | "email" | "tel"; multiligne?: boolean;
}) {
  const [local, setLocal] = useState(valeur ?? "");
  const focus = useRef(false);
  useEffect(() => { if (!focus.current) setLocal(valeur ?? ""); }, [valeur]);
  const partir = () => { focus.current = false; if (local !== (valeur ?? "")) enregistrer(local); };
  return <TextField {...props} type={type} value={local} disabled={desactive} multiline={multiligne} minRows={multiligne ? 2 : undefined}
    onFocus={() => { focus.current = true; }} onChange={(e) => setLocal(e.target.value)} onBlur={partir}
    onKeyDown={(e) => { if (e.key === "Enter" && !multiligne) (e.target as HTMLInputElement).blur(); }}
    InputLabelProps={type === "date" ? { shrink: true } : props.InputLabelProps}
    inputProps={{ ...(type === "date" ? { min: "2000-01-01", max: "2100-12-31" } : {}), ...props.inputProps }} />;
}

/** Le RIS en place : une liste connue, ou « Autre » saisi en clair. Vide hérite. */
export function ChampRis({ valeur, enregistrer, libelleVide = "Non renseigné", label = "RIS en place", size = "small" }: {
  valeur: string | null; enregistrer: (v: string) => void; libelleVide?: string; label?: string; size?: "small" | "medium";
}) {
  const reconnu = risReconnu(valeur);
  const [autre, setAutre] = useState(Boolean(valeur && !reconnu));
  useEffect(() => { setAutre(Boolean(valeur && !risReconnu(valeur))); }, [valeur]);
  const choix = autre ? "AUTRE" : reconnu ?? "";
  return <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ minWidth: 0 }}>
    <TextField select size={size} label={label} value={choix} sx={{ flex: "1 1 200px", minWidth: 0 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "AUTRE") { setAutre(true); return; }
        setAutre(false);
        enregistrer(v);
      }}>
      <MenuItem value=""><em>{libelleVide}</em></MenuItem>
      {RIS_CONNUS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
      <MenuItem value="AUTRE">Autre</MenuItem>
    </TextField>
    {autre && <ChampEnLigne size={size} label="Nom du RIS et de l'éditeur" valeur={reconnu ? "" : valeur} enregistrer={enregistrer} sx={{ flex: "1 1 200px", minWidth: 0 }} />}
  </Stack>;
}

/** Une pastille passe à la ligne plutôt que d'être tronquée. */
const SOUPLE = { height: "auto", minHeight: 24, maxWidth: "100%", "& .MuiChip-label": { whiteSpace: "normal", py: 0.25 } } as const;

const COULEURS_STATUT: Record<StatutCommande, ChipProps["color"]> = { prospect: "default", envoyee: "info", validee: "warning", installee: "success" };
export function PastilleStatut({ statut, date, court }: { statut: StatutCommande; date?: string | null; court?: boolean }) {
  const e = etapeCommande(statut);
  return <Chip size="small" sx={SOUPLE} color={COULEURS_STATUT[statut]} label={`${court ? e.court : e.libelle}${date ? " " + date : ""}`} />;
}

const COULEURS_DECISION: Record<EtatDecision["cle"], ChipProps["color"]> = { attente: "default", soumis: "info", valide: "success", refuse: "error", caduc: "error", alerte: "warning" };
export function PastilleDecision({ etat }: { etat: EtatDecision }) {
  return <Chip size="small" sx={SOUPLE} color={COULEURS_DECISION[etat.cle]} label={etat.libelle} />;
}

const COULEURS_FACTURE: Record<StatutFacture, ChipProps["color"]> = { a_emettre: "warning", emise: "info", payee: "success", encours: "default", retard: "error" };
export function PastilleFacture({ statut }: { statut: StatutFacture }) {
  return <Chip size="small" sx={SOUPLE} color={COULEURS_FACTURE[statut]} label={STATUTS_FACTURE[statut]} />;
}

/** Un taux en points de base (pour dix mille), écrit en pourcentage pour préremplir un champ : 1250 donne « 12,5 ». */
export const saisiePourcent = (pdm: number) => (pdm / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2, useGrouping: false });
/**
 * Saisie en euros vers centimes, en entier, ou null si elle est illisible. Le retour vers la saisie est
 * `eurosCourts` (`@/lib/argent`, arithmétique entière). Un pourcentage se relit de même en points de base.
 */
export function lireEuros(saisie: string): number | null {
  try { return entierDepuisSaisie(saisie || "0", 2, "Montant"); } catch { return null; }
}
export const lirePourcent = lireEuros;

/** Un petit libellé gris au-dessus d'une valeur. */
export function Fait({ libelle, children }: { libelle: string; children: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" component="div">{libelle}</Typography>
    <Box sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{children}</Box>
  </Box>;
}

/** Nom court d'un apporteur : « M. Lorimier » pour « Matthieu LORIMIER ». */
export function nomCourt(nom: string | undefined): string {
  if (!nom) return "Apporteur retiré";
  const p = nom.trim().split(/\s+/);
  return p.length > 1 && /[a-zà-ÿ]/.test(p[0]) ? `${p[0][0]}. ${p.slice(1).join(" ")}` : nom;
}

/** Les adresses des documents imprimables (route documents). */
export const urlDocument = (type: string, params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  return `/api/pilot/apports/documents/${type}?${q}`;
};
