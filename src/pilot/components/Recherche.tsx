"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, ButtonBase, InputBase, ListItemButton, ListItemText, Typography } from "@mui/material";
import { IconSearch } from "@tabler/icons-react";
import type { ResultatsRecherche } from "@/pilot/lib/recherche";
import { JETONS } from "@/pilot/jetons";
import { GROUPES, deplacer, listerOptions, requetePropre } from "./recherche/navigation";

const VIDE: ResultatsRecherche = { organisations: [], contacts: [], centres: [] };
/** Pause de frappe avant l'appel : on n'interroge pas le serveur à chaque lettre. */
const PAUSE_MS = 200;
const ILOT = { bgcolor: JETONS.verreIlot, backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: JETONS.ombreIlot };

/**
 * La recherche vit dans la barre du haut (C-68 ; C-36 pour les règles de requête, C-55 pour la capsule).
 * Sous 600 px, une loupe ouvre le champ sur toute la largeur de la barre : `mobileOuvert` est
 * porté par la coquille, qui masque alors le logo.
 */
export function Recherche({ mobileOuvert, onMobile }: { mobileOuvert: boolean; onMobile: (ouvert: boolean) => void }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState(VIDE);
  const [actif, setActif] = useState(0);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);
  const racine = useId();
  const entree = useRef<HTMLInputElement>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const { propre, valide } = requetePropre(q);
  const options = useMemo(() => listerOptions(resultats, propre, valide && !chargement && !erreur), [resultats, propre, valide, chargement, erreur]);
  const panneau = ouvert && propre.length > 0;
  const idOption = (i: number) => racine + "-option-" + i;
  const actuel = useRef({ mobileOuvert, onMobile });
  actuel.current = { mobileOuvert, onMobile };

  // Ctrl+K ou Cmd+K : le curseur va dans le champ, qui s'ouvre d'abord sur téléphone.
  useEffect(() => {
    const raccourci = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) return;
      e.preventDefault();
      if (window.matchMedia("(max-width: 599.95px)").matches && !actuel.current.mobileOuvert) { actuel.current.onMobile(true); return; }
      entree.current?.focus();
      entree.current?.select();
    };
    window.addEventListener("keydown", raccourci);
    return () => window.removeEventListener("keydown", raccourci);
  }, []);
  // Le champ vient d'apparaître sur téléphone : le curseur y va.
  useEffect(() => { if (mobileOuvert) entree.current?.focus(); }, [mobileOuvert]);
  // Un clic hors du champ et de sa liste ferme la liste.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => { if (!conteneur.current?.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);
  // La requête part après une pause de frappe ; la précédente est annulée (C-36 : POST, rien dans l'adresse).
  useEffect(() => {
    if (!valide) { setResultats(VIDE); setChargement(false); setErreur(false); return; }
    const controle = new AbortController();
    const delai = window.setTimeout(async () => {
      try {
        const r = await fetch("/api/pilot/recherche", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: propre }), signal: controle.signal });
        if (!r.ok) throw new Error();
        const valeurs: ResultatsRecherche = await r.json();
        if (!controle.signal.aborted) setResultats(valeurs);
      } catch {
        if (!controle.signal.aborted) setErreur(true);
      } finally { if (!controle.signal.aborted) setChargement(false); }
    }, PAUSE_MS);
    return () => { clearTimeout(delai); controle.abort(); };
  }, [propre, valide]);
  useEffect(() => {
    if (panneau && options.length) document.getElementById(idOption(actif))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, options.length, panneau]);

  /** Vide le champ, rend le focus et referme la version téléphone. */
  function quitter() {
    setQ(""); setResultats(VIDE); setChargement(false); setErreur(false); setActif(0); setOuvert(false);
    entree.current?.blur();
    onMobile(false);
  }
  function saisir(valeur: string) {
    setQ(valeur); setOuvert(true);
    // Même requête (une espace de plus) : rien à relancer, on garde les résultats affichés.
    if (requetePropre(valeur).propre === propre) return;
    setResultats(VIDE); setActif(0); setErreur(false); setChargement(requetePropre(valeur).valide);
  }
  function aller(lien: string) { quitter(); router.push(lien); }
  function toucher(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { e.preventDefault(); quitter(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!panneau) setOuvert(true);
      else setActif((i) => deplacer(i, options.length, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (panneau && options[actif]) aller(options[actif].lien);
    }
  }

  const message = !valide ? "Tapez au moins deux lettres." : chargement ? "Recherche en cours…" :
    erreur ? "La recherche est indisponible. Réessayez." : !options.length || options[0]!.groupe === "creation" ? "Aucun résultat pour « " + propre + " »." : "";

  return <Box ref={conteneur} sx={{ position: "relative", display: "flex", alignItems: "center", gap: 1, minWidth: 0,
    flex: { xs: mobileOuvert ? "1 1 auto" : "0 0 auto", sm: "0 1 420px" }, ml: { xs: mobileOuvert ? 0 : "auto", sm: 0 } }}>
    <ButtonBase aria-label="Rechercher un client, un contact ou un centre" onClick={() => onMobile(true)}
      sx={{ display: { xs: mobileOuvert ? "none" : "flex", sm: "none" }, width: 44, height: 44, borderRadius: 999, color: "text.secondary", ...ILOT }}>
      <IconSearch size={18} stroke={2} />
    </ButtonBase>
    <Box sx={{ display: { xs: mobileOuvert ? "flex" : "none", sm: "flex" }, alignItems: "center", gap: 1, flex: 1, minWidth: 0, height: 44, px: 2, borderRadius: 999, color: "text.secondary",
      ...ILOT, "&:focus-within": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
      // Un clic sur la loupe ou la marge de la capsule garde le focus dans le champ : la liste reste ouverte.
      onMouseDown={(e) => { if (e.target !== entree.current) { e.preventDefault(); entree.current?.focus(); } }}>
      <IconSearch size={16} stroke={2} aria-hidden />
      <InputBase inputRef={entree} value={q} onChange={(e) => saisir(e.target.value)} onFocus={() => setOuvert(true)} onKeyDown={toucher}
        // Le focus qui reste dans la recherche (une option touchée sur téléphone) ne ferme pas la liste avant le clic ;
        // un toucher ailleurs est fermé par l'écouteur pointerdown.
        onBlur={(e) => { if (!conteneur.current?.contains(e.relatedTarget as Node | null)) setOuvert(false); }}
        placeholder="Client, contact ou centre" autoComplete="off" spellCheck={false}
        inputProps={{ maxLength: 80, role: "combobox", "aria-label": "Rechercher un client, un contact ou un centre", "aria-autocomplete": "list", "aria-haspopup": "listbox",
          "aria-expanded": panneau, "aria-controls": panneau && options.length ? racine + "-liste" : undefined,
          "aria-activedescendant": panneau && options[actif] ? idOption(actif) : undefined }}
        sx={{ flex: 1, minWidth: 0, fontSize: 15, color: "text.primary", "& input": { p: 0, textOverflow: "ellipsis" } }} />
      <Box component="kbd" aria-hidden sx={{ display: { xs: "none", sm: q ? "none" : "inline" }, fontFamily: "inherit", fontSize: 11, fontWeight: 500, color: "text.secondary", borderRadius: "6px", px: "6px", py: "1px",
        bgcolor: "background.paper", boxShadow: JETONS.ombre }}>Ctrl K</Box>
    </Box>
    <ButtonBase onClick={quitter} sx={{ display: { xs: mobileOuvert ? "inline-flex" : "none", sm: "none" }, height: 44, px: 1, fontSize: 15, fontWeight: 500, color: "primary.main", borderRadius: 999 }}>Fermer</ButtonBase>
    {panneau && <Box onMouseDown={(e) => e.preventDefault()} sx={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, p: 1, borderRadius: "20px",
      maxHeight: { xs: "calc(100vh - 190px)", sm: "min(70vh, 480px)" }, overflowY: "auto", overflowX: "hidden",
      bgcolor: "background.paper", boxShadow: JETONS.ombreIlot }}>
      <Typography role="status" aria-live="polite" sx={{ px: 1.5, py: message ? 1 : 0, fontSize: 14, color: "text.secondary" }}>{message}</Typography>
      {options.length > 0 && <Box role="listbox" id={racine + "-liste"} aria-label="Résultats">
        {Object.entries(GROUPES).map(([groupe, libelle]) => {
          const duGroupe = options.filter((o) => o.groupe === groupe);
          return duGroupe.length > 0 && <Box key={groupe} role="group" aria-labelledby={racine + "-" + groupe}>
            <Typography id={racine + "-" + groupe} sx={{ px: 1.5, pt: 1, pb: 0.5, fontSize: 12, fontWeight: 600, color: "text.secondary" }}>{libelle}</Typography>
            {duGroupe.map((o) => <Ligne key={o.cle} id={idOption(options.indexOf(o))} actif={actif === options.indexOf(o)} libelle={o.libelle} secondaire={o.secondaire}
              onSurvol={() => setActif(options.indexOf(o))} onChoisir={() => aller(o.lien)} />)}
          </Box>;
        })}
        {options.filter((o) => o.groupe === "creation").map((o) => <Ligne key={o.cle} id={idOption(options.indexOf(o))} actif={actif === options.indexOf(o)} libelle={o.libelle} secondaire={o.secondaire}
          onSurvol={() => setActif(options.indexOf(o))} onChoisir={() => aller(o.lien)} />)}
      </Box>}
    </Box>}
  </Box>;
}

function Ligne({ id, actif, libelle, secondaire, onSurvol, onChoisir }: { id: string; actif: boolean; libelle: string; secondaire: string; onSurvol: () => void; onChoisir: () => void }) {
  return <ListItemButton role="option" id={id} aria-selected={actif} selected={actif} tabIndex={-1} onMouseMove={() => { if (!actif) onSurvol(); }} onClick={onChoisir}
    sx={{ borderRadius: "12px", minHeight: 44 }}>
    <ListItemText primary={libelle} secondary={secondaire || undefined} primaryTypographyProps={{ noWrap: true }} secondaryTypographyProps={{ noWrap: true }} sx={{ m: 0, minWidth: 0 }} />
  </ListItemButton>;
}
