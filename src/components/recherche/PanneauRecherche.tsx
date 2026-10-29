"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  InputBase,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { IconExternalLink, IconSearch, IconX } from "@tabler/icons-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { PRODUITS, type SlugProduit } from "@/lib/produits";
import { BORDER, INK, INK_MUTED, SURFACE_MUTED } from "@/lib/jetons";
import { FournisseurIntegre, filtresEnParametres } from "@/lib/recherche/integre";
import { precisionExamen } from "@/lib/recherche/texte";
import { libellePeriode } from "@/lib/recherche/periode";
import type { CleFiltre, Filtres } from "@/lib/recherche/moteur";
import type { ReponseRecherche, ResultatRecherche } from "@/app/api/recherche/route";
import { REGISTRE } from "./registre";
import BoutonDictee from "./BoutonDictee";

/**
 * Le panneau de la recherche centrale (plan `2026-10-recherche-centrale-dashboard.md`).
 *
 * Une phrase, de un à trois résultats, et sous le résultat choisi l'écran existant monté
 * préfiltré (R8), avec son vrai bouton Enregistrer : la barre ne modifie rien elle-même.
 *
 * Monté une seule fois, dans l'en-tête. La grande barre de l'accueil et `Ctrl+K`
 * l'ouvrent par `ouvrirRecherche()`, un évènement de fenêtre : ni l'une ni l'autre n'ont
 * besoin de partager un état avec l'en-tête.
 *
 * La phrase n'est gardée nulle part (pas d'historique) : elle peut porter un nom de patient.
 */

const EVENEMENT = "lyrae:recherche";

export function ouvrirRecherche(phrase?: string) {
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { phrase: phrase ?? "" } }));
}

const PRODUIT_LU: Record<SlugProduit, string> = {
  talk: "Robot téléphonique",
  konnect: "Portail patient",
} as Record<SlugProduit, string>;

/** Ce que le résultat est, quand ce n'est pas évident par son libellé. */
const GENRE_LU: Record<string, string> = {
  reglage: "réglage",
  statistique: "statistiques",
};

const TYPE_LU: Record<string, string> = {
  US: "Échographie",
  MG: "Mammographie",
  RX: "Radiographie",
  MR: "IRM",
  CT: "Scanner",
};
const ISSUE_LUE: Record<string, string> = {
  rdv_booked: "Rendez-vous pris",
  rdv_canceled: "Annulé",
  rdv_modified: "Modifié",
  transfert: "Transféré",
  raccroche: "Raccroché",
};
function valeurLue(cle: CleFiltre, v: string): string {
  if (cle === "periode") return libellePeriode(v);
  if (cle === "type") return TYPE_LU[v] ?? v;
  if (cle === "issue") return ISSUE_LUE[v] ?? v;
  if (cle === "etat") return v === "traite" ? "Traité" : "En attente";
  if (cle === "telephone") return v.replace(/(\d{2})(?=\d)/g, "$1 ");
  if (cle === "nom") return `patient ${v}`;
  return `« ${v} »`;
}

/** Couleurs du produit du résultat, posées sur l'écran monté (un écran Konnect garde son bleu). */
function accentDe(produit: SlugProduit): Record<string, string> {
  const a = PRODUITS[produit].accent;
  const rgb = [1, 3, 5].map((i) => parseInt(a.principal.slice(i, i + 2), 16)).join(", ");
  return {
    "--accent": a.principal,
    "--accent-rgb": rgb,
    "--accent-press": a.press,
    "--accent-deep": a.deep,
  };
}

/** L'adresse de l'écran complet, avec les mêmes filtres que le panneau. */
function lienComplet(r: ResultatRecherche): string {
  const [chemin, ancre] = r.href.split("#");
  return chemin + filtresEnParametres(r.filtres) + (ancre ? `#${ancre}` : "");
}

/** L'anneau qui désigne l'élément demandé (tuile, section) : le même pendant l'arrivée et après. */
const ANNEAU = "0 0 0 3px rgba(var(--accent-rgb), 0.55)";

/**
 * Garde l'élément demandé entouré tant que l'écran est là (« combien de prises de
 * rendez-vous hier » : la tuile des RDV pris, parmi les autres). Une règle CSS plutôt
 * qu'un style posé sur le nœud : l'écran recharge ses données et React remplace la tuile,
 * la règle s'applique à la nouvelle. Un onglet n'est pas entouré : il est sélectionné.
 */
function AncreMarquee({ ancre, portee }: { ancre: string | undefined; portee: string }) {
  if (!ancre || !/^[a-z_]+$/.test(ancre)) return null;
  // Une tuile de statistiques porte son ancre sur la case de grille, marges comprises :
  // l'anneau va à la carte qu'elle contient.
  const cible = `${portee} #${ancre}:not([role="tab"]):not(.MuiGrid-item), ${portee} #${ancre}.MuiGrid-item > *`;
  return <style>{`${cible} { box-shadow: ${ANNEAU}; border-radius: 8px; }`}</style>;
}

/**
 * Amène l'ancre d'une fiche à l'écran une fois l'écran chargé : sélectionne l'onglet, ou
 * déplie l'accordéon qui la porte, la fait défiler et la fait pulser à l'arrivée ;
 * `AncreMarquee` la garde ensuite entourée. Les données arrivent après le montage,
 * d'où l'attente (8 s au plus) ; une ancre absente (section vide) est laissée tranquille.
 */
export function allerAAncre(racine: ParentNode, ancre: string, defilant?: HTMLElement | null) {
  let essais = 0;
  const id = window.setInterval(() => {
    const cible = racine.querySelector<HTMLElement>(`#${CSS.escape(ancre)}`);
    if (!cible && ++essais < 40) return;
    window.clearInterval(id);
    if (!cible) return;
    // Un onglet (ordonnances manquantes) : le sélectionner suffit.
    if (cible.getAttribute("role") === "tab") {
      if (cible.getAttribute("aria-selected") !== "true") cible.click();
      return;
    }
    const accordeon = cible.classList.contains("MuiAccordion-root")
      ? cible
      : cible.querySelector<HTMLElement>(".MuiAccordion-root");
    if (accordeon && !accordeon.classList.contains("Mui-expanded")) {
      accordeon.querySelector<HTMLElement>(".MuiAccordionSummary-root")?.click();
    }
    window.setTimeout(() => {
      if (defilant) {
        const haut =
          cible.getBoundingClientRect().top - defilant.getBoundingClientRect().top + defilant.scrollTop;
        defilant.scrollTo({ top: Math.max(0, haut - 16), behavior: "smooth" });
      } else {
        cible.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const carte = cible.classList.contains("MuiGrid-item")
        ? ((cible.firstElementChild as HTMLElement | null) ?? cible)
        : cible;
      carte.animate?.(
        [
          { boxShadow: "0 0 0 8px rgba(var(--accent-rgb), 0.25)", borderRadius: "8px" },
          { boxShadow: ANNEAU, borderRadius: "8px" },
        ],
        { duration: 900, easing: "ease-out" }
      );
    }, 250);
  }, 200);
  return () => window.clearInterval(id);
}

type Etat =
  | { phase: "vide" }
  | { phase: "cherche" }
  | { phase: "erreur"; message: string }
  | { phase: "reponse"; reponse: ReponseRecherche };

export default function PanneauRecherche({ userId }: { userId: number | null }) {
  const [ouvert, setOuvert] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [etat, setEtat] = useState<Etat>({ phase: "vide" });
  const [choix, setChoix] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const zoneEcran = useRef<HTMLDivElement>(null);

  const chercher = useCallback(
    async (texte: string) => {
      const p = texte.trim();
      if (!p || userId === null) return;
      setEtat({ phase: "cherche" });
      setChoix(0);
      try {
        const r = await fetch("/api/recherche", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, phrase: p }),
        });
        const corps = await r.json().catch(() => null);
        if (!r.ok) {
          setEtat({
            phase: "erreur",
            message: corps?.error ?? "La recherche n'a pas répondu. Réessayez dans un instant.",
          });
          return;
        }
        setEtat({ phase: "reponse", reponse: corps as ReponseRecherche });
      } catch {
        setEtat({
          phase: "erreur",
          message: "La recherche n'a pas répondu. Vérifiez la connexion, puis réessayez.",
        });
      }
    },
    [userId]
  );

  // Ouverture par la grande barre de l'accueil ou par l'en-tête.
  useEffect(() => {
    const ouvrir = (e: Event) => {
      const p = (e as CustomEvent<{ phrase: string }>).detail?.phrase ?? "";
      setOuvert(true);
      setPhrase(p);
      if (p.trim()) chercher(p);
      else setEtat({ phase: "vide" });
    };
    window.addEventListener(EVENEMENT, ouvrir);
    return () => window.removeEventListener(EVENEMENT, ouvrir);
  }, [chercher]);

  // Ctrl+K (Cmd+K sur Mac) ouvre le panneau depuis n'importe quel écran du client.
  useEffect(() => {
    if (userId === null) return;
    const touche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOuvert(true);
        window.setTimeout(() => champ.current?.select(), 50);
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [userId]);

  // « Ouvrir l'écran complet » mène à `…#ancre` : même geste sur la page entière.
  const pathname = usePathname();
  const [ancrePage, setAncrePage] = useState<string | undefined>();
  useEffect(() => {
    const ancre = decodeURIComponent(window.location.hash.slice(1));
    if (!/^[a-z_]+$/.test(ancre)) {
      setAncrePage(undefined);
      return;
    }
    setAncrePage(ancre);
    return allerAAncre(document, ancre);
  }, [pathname]);

  const reponse = etat.phase === "reponse" ? etat.reponse : null;
  const resultat = reponse?.resultats[choix] ?? null;
  const [chemin, ancre] = resultat ? resultat.cle.split("#") : [];
  const ecran = chemin ? REGISTRE[chemin] : undefined;

  useEffect(() => {
    if (!resultat || !ancre || !zoneEcran.current) return;
    return allerAAncre(zoneEcran.current, ancre, zoneEcran.current);
  }, [resultat, ancre]);

  if (userId === null) return null;

  const filtresVus = resultat
    ? (Object.entries(resultat.filtres) as [CleFiltre, string][]).filter(([, v]) => v)
    : [];
  const applique =
    ecran && !(ancre && ecran.ancresSansFiltre?.includes(ancre)) ? ecran.applique : [];
  const appliques = filtresVus.filter(([k]) => applique.includes(k));
  // « mammo » donne le type (appliqué) et l'examen « mammographie » : sans précision au-delà
  // de la modalité, l'examen ne dit rien de plus que le type.
  const nonAppliques = filtresVus.filter(
    ([k, v]) =>
      !applique.includes(k) &&
      !(k === "examen" && !precisionExamen(v) && applique.includes("type") && resultat?.filtres.type)
  );

  return (
    <>
      {/* « Ouvrir l'écran complet » : l'élément reste entouré sur la page entière. */}
      <AncreMarquee ancre={ancrePage} portee="body" />
      <Dialog
        open={ouvert}
        onClose={() => setOuvert(false)}
        fullWidth
        maxWidth="lg"
        TransitionProps={{ onEntered: () => champ.current?.focus() }}
        PaperProps={{
          sx: {
            height: { xs: "100%", md: "min(90vh, 960px)" },
            width: { xs: "100%", md: "calc(100% - 64px)" },
            m: { xs: 0, md: 4 },
            maxHeight: { xs: "100%", md: "calc(100% - 64px)" },
            borderRadius: { xs: 0, md: 3 },
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        }}
        aria-labelledby="recherche-titre"
      >
        {/* La phrase */}
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            chercher(phrase);
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: { xs: 2, md: 3 },
            py: 1.5,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <Typography id="recherche-titre" component="h2" sx={{ position: "absolute", left: -9999 }}>
            Rechercher dans votre espace
          </Typography>
          {etat.phase === "cherche" ? (
            <CircularProgress size={22} sx={{ color: "var(--accent)", flexShrink: 0 }} />
          ) : (
            <IconSearch size={22} color={INK_MUTED} style={{ flexShrink: 0 }} />
          )}
          <InputBase
            inputRef={champ}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="Ce que vous cherchez, en une phrase : « les appels transférés hier »"
            inputProps={{ "aria-label": "Ce que vous cherchez", maxLength: 300 }}
            sx={{ flex: 1, fontSize: { xs: 16, md: 19 }, color: INK, "& input": { py: 1 } }}
          />
          <BoutonDictee
            onTexte={(t) => {
              setPhrase(t);
              chercher(t);
            }}
            onErreur={(message) => setEtat({ phase: "erreur", message })}
          />
          <IconButton onClick={() => setOuvert(false)} aria-label="Fermer la recherche" size="small">
            <IconX size={20} />
          </IconButton>
        </Box>

        {/* Ce qui a été trouvé */}
        {etat.phase === "erreur" && (
          <Alert severity="error" sx={{ m: 2 }}>
            {etat.message}
          </Alert>
        )}
        {etat.phase === "vide" && <Exemples onChoisir={(p) => { setPhrase(p); chercher(p); }} />}
        {reponse && <Messages reponse={reponse} />}

        {reponse && reponse.resultats.length > 0 && (
          <Box sx={{ px: { xs: 2, md: 3 }, pt: 1.5, borderBottom: `1px solid ${BORDER}` }}>
            <Stack
              direction="row"
              role="tablist"
              aria-label="Résultats"
              sx={{ gap: 1, overflowX: "auto", pb: 0 }}
            >
              {reponse.resultats.map((r, i) => (
                <Onglet key={r.cle} resultat={r} actif={i === choix} onClick={() => setChoix(i)} />
              ))}
            </Stack>
          </Box>
        )}

        {resultat && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
              px: { xs: 2, md: 3 },
              py: 1.25,
              bgcolor: SURFACE_MUTED,
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            {appliques.map(([k, v]) => (
              <Chip
                key={k}
                size="small"
                label={valeurLue(k, v)}
                sx={{ bgcolor: "rgba(var(--accent-rgb), 0.15)", color: "var(--accent-deep)", fontWeight: 600 }}
              />
            ))}
            {nonAppliques.length > 0 && (
              <Typography variant="body2" sx={{ color: INK_MUTED }}>
                Pas filtré sur cet écran : {nonAppliques.map(([k, v]) => valeurLue(k, v)).join(", ")}.
              </Typography>
            )}
            {!resultat.modifiable && (
              <Typography variant="body2" sx={{ color: INK_MUTED }}>
                Vous pouvez le lire, pas le modifier.
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Link
              component={NextLink}
              href={lienComplet(resultat)}
              onClick={() => setOuvert(false)}
              underline="hover"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                fontWeight: 600,
                fontSize: 14,
                color: "var(--accent-deep)",
              }}
            >
              Ouvrir l&apos;écran complet
              <IconExternalLink size={16} />
            </Link>
          </Box>
        )}

        {/* L'écran, préfiltré */}
        <Box
          ref={zoneEcran}
          sx={{ flex: 1, overflow: "auto", px: { xs: 1.5, md: 3 }, py: 2 }}
          style={resultat ? (accentDe(resultat.produit) as React.CSSProperties) : undefined}
          data-produit={resultat?.produit}
          data-zone-recherche=""
        >
          <AncreMarquee ancre={ancre} portee="[data-zone-recherche]" />
          {resultat && ecran && (
            <FournisseurIntegre
              key={resultat.cle}
              value={{
                userId,
                produit: resultat.produit,
                filtres: resultat.filtres as Filtres,
                ancre,
              }}
            >
              <ecran.composant />
            </FournisseurIntegre>
          )}
          {resultat && !ecran && (
            <Typography sx={{ color: INK_MUTED }}>
              Cet écran ne s&apos;ouvre pas encore ici. Ouvrez-le en entier par le lien ci-dessus.
            </Typography>
          )}
        </Box>
      </Dialog>
    </>
  );
}

function Onglet({
  resultat,
  actif,
  onClick,
}: {
  resultat: ResultatRecherche;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      sx={{
        flexShrink: 0,
        display: "block",
        textAlign: "left",
        px: 1.5,
        pt: 0.75,
        pb: 1,
        borderRadius: "8px 8px 0 0",
        borderBottom: "3px solid",
        borderColor: actif ? PRODUITS[resultat.produit].accent.principal : "transparent",
        bgcolor: actif ? SURFACE_MUTED : "transparent",
        transition: "background-color .15s, border-color .15s",
        "&:hover": { bgcolor: SURFACE_MUTED },
        "&.Mui-focusVisible": { outline: "2px solid var(--accent)", outlineOffset: -2 },
      }}
    >
      <Typography sx={{ fontWeight: 700, color: INK, fontSize: 15, lineHeight: 1.3 }}>
        {resultat.libelle}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25 }}>
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: PRODUITS[resultat.produit].accent.principal,
          }}
        />
        <Typography variant="caption" sx={{ color: INK_MUTED }}>
          {PRODUIT_LU[resultat.produit]}
          {GENRE_LU[resultat.genre] ? `, ${GENRE_LU[resultat.genre]}` : ""}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

function Messages({ reponse }: { reponse: ReponseRecherche }) {
  const lignes: { cle: string; texte: string; grave?: boolean }[] = [];
  if (reponse.refus === "action") {
    lignes.push({
      cle: "action",
      grave: true,
      texte:
        "La recherche trouve, elle ne fait rien à votre place. Cherchez l'écran (« les demandes de rappel de Mme Roux ») puis faites le geste avec son bouton.",
    });
  } else if (reponse.refus === "hors_perimetre") {
    lignes.push({
      cle: "hors",
      grave: true,
      texte:
        "La recherche ne couvre pas cette demande. Votre profil, votre mot de passe et vos tickets sont dans le menu de votre compte, en haut à droite.",
    });
  } else if (!reponse.resultats.length) {
    lignes.push({
      cle: "rien",
      grave: true,
      texte:
        "Rien trouvé pour cette phrase. Essayez avec le nom de ce que vous voulez voir : « les horaires », « les appels d'hier », « le code de la mammographie ».",
    });
    if (reponse.etage2 === "indisponible") {
      lignes.push({
        cle: "etage2",
        texte: "La recherche par phrase libre ne répond pas pour le moment : seuls les mots des écrans sont compris.",
      });
    }
  }
  if (reponse.ignores.length) {
    const noms = reponse.ignores.map((i) => (i === "age" ? "l'âge" : i === "sexe" ? "le sexe" : i));
    const liste = noms.join(" et ");
    lignes.push({
      cle: "ignores",
      texte: `${liste.charAt(0).toUpperCase()}${liste.slice(1)}${noms.length > 1 ? " ne se filtrent pas dans les écrans : la recherche les a laissés" : " ne se filtre pas dans les écrans : la recherche l'a laissé"} de côté.`,
    });
  }
  if (!lignes.length) return null;
  return (
    <Stack spacing={0.5} sx={{ px: { xs: 2, md: 3 }, py: 1.5 }}>
      {lignes.map((l) => (
        <Typography key={l.cle} variant="body2" sx={{ color: l.grave ? INK : INK_MUTED, maxWidth: 760 }}>
          {l.texte}
        </Typography>
      ))}
    </Stack>
  );
}

/** Exemples de phrases, quand le panneau s'ouvre vide. Aucune recherche passée n'est gardée. */
export const EXEMPLES = [
  "Les appels transférés hier",
  "Modifier les horaires d'ouverture",
  "Combien de rendez-vous cette semaine",
  "Le code de la mammographie de dépistage",
  "Les examens non couverts du dernier mois",
];

function Exemples({ onChoisir }: { onChoisir: (p: string) => void }) {
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2.5 }}>
      <Typography variant="body2" sx={{ color: INK_MUTED, mb: 1.25 }}>
        Écrivez comme vous le diriez à une collègue. Par exemple :
      </Typography>
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
        {EXEMPLES.map((p) => (
          <Chip key={p} label={p} variant="outlined" onClick={() => onChoisir(p)} sx={{ borderColor: BORDER }} />
        ))}
      </Stack>
    </Box>
  );
}
