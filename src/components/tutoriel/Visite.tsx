"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { IconArrowLeft, IconArrowRight, IconX } from "@tabler/icons-react";
import { BRAND, INK, INK_MUTED } from "@/lib/jetons";
import { texteEtape } from "@/lib/tutoriel/types";
import { useTutoriel } from "./ContexteTutoriel";

/**
 * La visite à l'écran : l'écran s'assombrit, l'élément de l'étape reste éclairé et
 * entouré, une bulle explique.
 *
 * - **L'élément est retrouvé par son ancre**, avec patience : un écran charge ses
 *   données après son affichage (8 s au plus, comme la recherche centrale). S'il ne
 *   vient pas (téléphone sans tableau, section absente), la bulle s'affiche au centre
 *   sans rien entourer : la visite ne reste jamais bloquée.
 * - **Un accordéon fermé est ouvert** pour montrer la section qu'il porte.
 * - **Les clics hors de la bulle sont arrêtés** : la visite montre, elle ne fait pas
 *   modifier l'écran pendant qu'on lit. Échap ou la croix la quitte.
 * - **Au téléphone**, la bulle passe en bas de l'écran, pleine largeur.
 */

type Cadre = { top: number; left: number; width: number; height: number };

const MARGE = 6;
const LARGEUR_BULLE = 380;
const Z = 1500; // au-dessus de l'en-tête (1100) et des tiroirs MUI (1200)

function ouvrirAccordeon(cible: HTMLElement) {
  const accordeon = cible.classList.contains("MuiAccordion-root")
    ? cible
    : cible.querySelector<HTMLElement>(".MuiAccordion-root");
  if (accordeon && !accordeon.classList.contains("Mui-expanded")) {
    accordeon.querySelector<HTMLElement>(".MuiAccordionSummary-root")?.click();
  }
}

export default function Visite({ cheminVoulu }: { cheminVoulu: string }) {
  const tuto = useTutoriel();
  const pathname = usePathname();
  const telephone = useMediaQuery("(max-width:600px)");
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [cherche, setCherche] = useState(true);
  const cible = useRef<HTMLElement | null>(null);
  const bulle = useRef<HTMLDivElement | null>(null);
  const [hauteurBulle, setHauteurBulle] = useState(200);

  const visite = tuto?.visite ?? null;
  const etape = visite ? visite.etapes[visite.index] : null;
  const surLaBonnePage = pathname === cheminVoulu;

  // Retrouver l'élément de l'étape, une fois sur la bonne page.
  useEffect(() => {
    setCadre(null);
    cible.current = null;
    if (!etape || !surLaBonnePage) return;
    if (!etape.cible) {
      setCherche(false);
      return;
    }
    setCherche(true);
    let essais = 0;
    const id = window.setInterval(() => {
      const el = document.querySelector<HTMLElement>(etape.cible!);
      if (!el && ++essais < 40) return;
      window.clearInterval(id);
      setCherche(false);
      if (!el) return;
      ouvrirAccordeon(el);
      cible.current = el;
      window.setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(mesurer, 350);
      }, 200);
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape, surLaBonnePage]);

  function mesurer() {
    const el = cible.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return setCadre(null);
    setCadre({
      top: r.top - MARGE,
      left: r.left - MARGE,
      width: r.width + 2 * MARGE,
      height: r.height + 2 * MARGE,
    });
  }

  // L'élément bouge avec le défilement et le redimensionnement : le cadre le suit.
  useEffect(() => {
    let rendu = 0;
    const suivre = () => {
      cancelAnimationFrame(rendu);
      rendu = requestAnimationFrame(mesurer);
    };
    window.addEventListener("scroll", suivre, true);
    window.addEventListener("resize", suivre);
    return () => {
      window.removeEventListener("scroll", suivre, true);
      window.removeEventListener("resize", suivre);
      cancelAnimationFrame(rendu);
    };
  }, []);

  // La hauteur de la bulle décide si elle tient sous l'élément : relue à chaque étape.
  useLayoutEffect(() => {
    if (bulle.current) setHauteurBulle(bulle.current.offsetHeight);
  }, [etape, cadre, cherche, telephone]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") tuto?.quitter();
      if (e.key === "ArrowRight" && visite) tuto?.aller(visite.index + 1);
      if (e.key === "ArrowLeft" && visite) tuto?.aller(visite.index - 1);
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [tuto, visite]);

  if (!tuto || !visite || !etape || typeof document === "undefined")
    return null;

  const etat = tuto.etats[visite.chapitre.cle] ?? null;
  const derniere = visite.index === visite.etapes.length - 1;

  // Placement de la bulle : sous l'élément s'il reste la place, sinon au-dessus,
  // sinon au centre. Au téléphone, toujours en bas.
  let position: React.CSSProperties;
  if (telephone) {
    position = { left: 8, right: 8, bottom: 8 };
  } else if (cadre) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const left = Math.min(Math.max(16, cadre.left), vw - LARGEUR_BULLE - 16);
    if (cadre.top + cadre.height + 12 + hauteurBulle < vh - 16) {
      position = {
        top: cadre.top + cadre.height + 12,
        left,
        width: LARGEUR_BULLE,
      };
    } else if (cadre.top - 12 - hauteurBulle > 16) {
      position = {
        top: cadre.top - 12 - hauteurBulle,
        left,
        width: LARGEUR_BULLE,
      };
    } else {
      position = { bottom: 24, right: 24, width: LARGEUR_BULLE };
    }
  } else {
    position = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: LARGEUR_BULLE + 40,
    };
  }

  return createPortal(
    <>
      {/* Le voile : il arrête les clics. Avec un cadre, c'est l'ombre du cadre qui
          assombrit, et le voile reste transparent. */}
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: Z,
          bgcolor: cadre ? "transparent" : "rgba(15, 42, 63, 0.55)",
        }}
      />
      {cadre && (
        <Box
          aria-hidden
          sx={{
            position: "fixed",
            zIndex: Z + 1,
            pointerEvents: "none",
            top: cadre.top,
            left: cadre.left,
            width: cadre.width,
            height: cadre.height,
            borderRadius: "10px",
            boxShadow:
              "0 0 0 3px var(--accent), 0 0 0 9999px rgba(15, 42, 63, 0.55)",
            transition: "all .25s ease",
          }}
        />
      )}
      <Paper
        ref={bulle}
        role="dialog"
        aria-label={`Tutoriel, ${visite.chapitre.titre}`}
        elevation={8}
        sx={{
          position: "fixed",
          zIndex: Z + 2,
          p: 2.25,
          borderRadius: 2.5,
          ...position,
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={1}
        >
          <Typography sx={{ fontSize: 12, color: INK_MUTED, fontWeight: 600 }}>
            {visite.chapitre.titre} · {visite.index + 1} sur{" "}
            {visite.etapes.length}
          </Typography>
          <IconButton
            size="small"
            aria-label="Quitter le tutoriel"
            onClick={tuto.quitter}
            sx={{ mt: -0.75, mr: -0.75 }}
          >
            <IconX size={16} />
          </IconButton>
        </Stack>
        <Typography
          sx={{ fontSize: 16, fontWeight: 700, color: INK, mt: 0.25 }}
        >
          {etape.titre}
        </Typography>
        <Typography
          sx={{ fontSize: 14, color: INK, mt: 0.75, lineHeight: 1.55 }}
        >
          {cherche && etape.cible ? "…" : texteEtape(etape, etat)}
        </Typography>
        {visite.chapitre.primordial &&
          etat === "a_faire" &&
          visite.index === 0 && (
            <Typography
              sx={{ fontSize: 13, color: "#B4602A", fontWeight: 600, mt: 1 }}
            >
              Étape primordiale : à faire avant tout le reste.
            </Typography>
          )}
        <Stack
          direction="row"
          spacing={1}
          justifyContent="flex-end"
          sx={{ mt: 2 }}
        >
          {visite.index > 0 && (
            <Button
              size="small"
              startIcon={<IconArrowLeft size={16} />}
              onClick={() => tuto.aller(visite.index - 1)}
              sx={{ textTransform: "none" }}
            >
              Précédent
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            endIcon={derniere ? undefined : <IconArrowRight size={16} />}
            onClick={() => tuto.aller(visite.index + 1)}
            sx={{
              textTransform: "none",
              bgcolor: BRAND,
              "&:hover": { bgcolor: "var(--accent-press)" },
            }}
          >
            {derniere ? "Terminer" : "Suivant"}
          </Button>
        </Stack>
      </Paper>
    </>,
    document.body,
  );
}
