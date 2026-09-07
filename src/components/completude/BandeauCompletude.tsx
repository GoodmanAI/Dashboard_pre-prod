"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertTitle, Box, Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useCentreProduit } from "@/hooks/useCentreProduit";
import { regimeAlertes, type StatutCentre } from "@/lib/centreStatut";
import type { Manque } from "@/lib/completude/types";
import type { SlugProduit } from "@/lib/produits";

/**
 * Ce qui manque au centre regardé, en haut de l'écran (lots 4 et 5 du plan
 * `2026-09-completude-config-centres.md`).
 *
 * DEUX FILTRES SE COMPOSENT, et l'ordre compte :
 *
 *   1. Le **statut** du centre décide s'il y a un bandeau, et lequel. Un centre
 *      en intégration ne montre qu'un message informatif, un centre arrêté ne
 *      montre rien. C'est ce qui évite que les quatre centres du groupe Quimper
 *      passent en rouge pour des manques parfaitement normaux.
 *   2. Le **propriétaire** de chaque information décide qui la voit. Le client
 *      ne voit jamais un manque qu'il ne peut pas corriger, et ce tri est fait
 *      côté serveur, pas ici : la liste des lacunes d'installation d'un centre
 *      ne descend pas jusqu'à son poste.
 *
 * Un seul composant pour les deux rôles, donc, puisque la route a déjà tranché.
 *
 * PORTÉE. Le bandeau ne s'affiche que sur les écrans d'un centre
 * (`/client/c/{userId}/{produit}/…`), et ne parle que du produit de l'URL : un
 * administrateur sur un écran Konnect ne voit pas les manques LyraeTalk. Sur les
 * pages `/admin/*`, `useCentreProduit` ne résout aucun centre et le composant ne
 * rend rien : c'est `/admin/parc` qui donne la vue d'ensemble.
 */

type Reponse = {
  userProductId: number;
  produit: SlugProduit;
  statut: StatutCentre;
  manques: Manque[];
  bloquants: number;
  degrades: number;
  autresCentresIncomplets: number;
};

/** Comment nommer le service dans une phrase adressée au client. */
function nomService(produit: SlugProduit | null): string {
  return produit === "konnect" ? "votre portail patient" : "votre robot";
}

/**
 * Clé de masquage d'un bandeau ambre.
 *
 * Elle inclut la liste des manques : si une information nouvelle apparaît, la
 * clé change et le bandeau revient. Masquer ne doit jamais rendre sourd à un
 * problème qui n'existait pas au moment du clic.
 */
function cleMasquage(userProductId: number, manques: Manque[]): string {
  const signature = manques.map((m) => m.cle).sort().join(",");
  return `completude:${userProductId}:${signature}`;
}

function ListeManques({ manques }: { manques: Manque[] }) {
  return (
    <Stack component="ul" spacing={0.75} sx={{ m: 0, mt: 1, pl: 2.5 }}>
      {manques.map((m) => (
        <li key={m.cle}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 0.25, sm: 1 }}
            alignItems={{ sm: "baseline" }}
          >
            <Typography sx={{ fontSize: 13.5 }}>
              <strong>{m.libelle}</strong> : {m.manque}
            </Typography>
            {/* Un manque « interne » n'est pas au client de le corriger, et son
                lien mene vers une page d'administration a laquelle il n'a pas
                acces. Seul un administrateur recoit ces lignes (le tri est fait
                par la route), mais il les lit sur l'ecran du client : sans
                cette etiquette, il croit voir ce que son client voit. */}
            {m.proprietaire === "admin" ? (
              <Typography
                component="span"
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  px: 0.75,
                  py: 0.15,
                  borderRadius: 0.75,
                  bgcolor: "rgba(0,0,0,0.10)",
                  whiteSpace: "nowrap",
                }}
              >
                interne
              </Typography>
            ) : null}
            <Button
              component={Link}
              href={m.href}
              size="small"
              sx={{
                textTransform: "none",
                p: 0,
                minWidth: 0,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Corriger
            </Button>
          </Stack>
        </li>
      ))}
    </Stack>
  );
}

/**
 * Un fond franc plutot que le pastel par defaut de MUI.
 *
 * Le `severity` seul donne un fond a peine teinte, que l'oeil glisse sans le
 * voir en haut d'un ecran deja charge. Une barre laterale epaisse, un fond plus
 * soutenu et un titre contraste rendent le bandeau lisible sans le rendre
 * criard : c'est une information, pas une alarme.
 */
const APPARENCE = {
  error: { bord: "#B3261E", fond: "#FDECEA", texte: "#5F1512" },
  warning: { bord: "#B26B00", fond: "#FFF4E5", texte: "#6B3F00" },
  info: { bord: "#1D4E7F", fond: "#E8F1FA", texte: "#123252" },
} as const;

function styleAlerte(niveau: keyof typeof APPARENCE) {
  const a = APPARENCE[niveau];
  return {
    borderLeft: `6px solid ${a.bord}`,
    bgcolor: a.fond,
    color: a.texte,
    borderRadius: 1.5,
    boxShadow: "0 1px 3px rgba(15,42,63,0.10)",
    alignItems: "flex-start",
    "& .MuiAlert-icon": { color: a.bord, opacity: 1, mt: 0.25 },
    "& .MuiAlertTitle-root": { color: a.texte, mb: 0.25 },
    "& a": { color: a.texte },
  };
}

export default function BandeauCompletude() {
  const { userProductId, produit } = useCentreProduit();
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [masque, setMasque] = useState(false);

  useEffect(() => {
    if (!userProductId) {
      setDonnees(null);
      return;
    }
    let annule = false;
    (async () => {
      try {
        const r = await fetch(`/api/completude?userProductId=${userProductId}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!annule) setDonnees(d);
      } catch {
        // Le bandeau est une aide, pas une fonction : son échec ne doit rien
        // signaler ni bloquer l'écran que l'utilisateur est venu voir.
      }
    })();
    return () => {
      annule = true;
    };
  }, [userProductId]);

  const regime = donnees ? regimeAlertes(donnees.statut) : "aucune";

  // En intégration, on ne parle que de ce que le client peut fournir. Le reste
  // est notre travail d'installation, il ne le regarde pas et l'inquiéterait.
  const aMontrer = useMemo(() => {
    if (!donnees) return [];
    if (regime === "informative") {
      return donnees.manques.filter((m) => m.proprietaire === "client");
    }
    return donnees.manques.filter((m) => m.criticite !== "confort");
  }, [donnees, regime]);

  const bloquants = aMontrer.filter((m) => m.criticite === "bloquant");
  const degrades = aMontrer.filter((m) => m.criticite === "degrade");

  const cle = donnees ? cleMasquage(donnees.userProductId, aMontrer) : "";

  useEffect(() => {
    if (!cle) return;
    try {
      setMasque(sessionStorage.getItem(cle) === "1");
    } catch {
      // Navigation privée ou stockage refusé : le bandeau reste visible.
      setMasque(false);
    }
  }, [cle]);

  const masquer = useCallback(() => {
    setMasque(true);
    try {
      sessionStorage.setItem(cle, "1");
    } catch {
      // Sans stockage, le masquage ne dure que le temps de la page.
    }
  }, [cle]);

  if (!donnees || regime === "aucune" || aMontrer.length === 0) return null;

  const autres = donnees.autresCentresIncomplets;
  const lienAutres = autres > 0 && (
    <Typography sx={{ fontSize: 12.5, mt: 1 }}>
      {autres} autre{autres > 1 ? "s" : ""} centre{autres > 1 ? "s" : ""} en
      production {autres > 1 ? "ont" : "a"} une information essentielle
      manquante.{" "}
      <Link href="/admin/parc" style={{ color: "inherit" }}>
        Voir le parc
      </Link>
    </Typography>
  );

  const cadre = { px: 3, pt: 2 };

  // ── Centre en cours d'installation ─────────────────────────────────────────
  // Bleu, jamais rouge : le service n'a jamais tourné, parler de panne serait
  // faux et inquiétant pour un client qui découvre l'outil.
  if (regime === "informative") {
    return (
      <Box sx={cadre}>
        <Alert severity="info" sx={styleAlerte("info")}>
          <AlertTitle sx={{ fontWeight: 700 }}>
            {nomService(produit).replace(/^v/, "V")} est en cours d&apos;installation
          </AlertTitle>
          <Typography sx={{ fontSize: 13 }}>
            {produit === "konnect"
              ? "Il n'est pas encore ouvert aux patients."
              : "Il ne prend pas encore d'appels."}{" "}
            {aMontrer.length === 1
              ? "Une information nous manque de votre côté :"
              : `${aMontrer.length} informations nous manquent de votre côté :`}
          </Typography>
          <ListeManques manques={aMontrer} />
          {lienAutres}
        </Alert>
      </Box>
    );
  }

  // ── Centre en production ───────────────────────────────────────────────────
  if (bloquants.length > 0) {
    return (
      <Box sx={cadre}>
        <Alert severity="error" sx={styleAlerte("error")}>
          <AlertTitle sx={{ fontWeight: 700 }}>
            {bloquants.length === 1
              ? "Une information essentielle manque"
              : `${bloquants.length} informations essentielles manquent`}
          </AlertTitle>
          <ListeManques manques={bloquants} />
          {degrades.length > 0 && (
            <Typography sx={{ fontSize: 12.5, mt: 1 }}>
              {degrades.length} autre{degrades.length > 1 ? "s" : ""} réglage
              {degrades.length > 1 ? "s sont" : " est"} à compléter, sans
              empêcher {nomService(produit)} de fonctionner.
            </Typography>
          )}
          {lienAutres}
        </Alert>
      </Box>
    );
  }

  // Dégradés seuls : masquable pour la session en cours.
  if (masque) return null;

  return (
    <Box sx={cadre}>
      <Alert severity="warning" onClose={masquer} sx={styleAlerte("warning")}>
        <AlertTitle sx={{ fontWeight: 700 }}>
          {degrades.length === 1
            ? "Un réglage est à compléter"
            : `${degrades.length} réglages sont à compléter`}
        </AlertTitle>
        <ListeManques manques={degrades} />
        {lienAutres}
      </Alert>
    </Box>
  );
}
