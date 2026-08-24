"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Menu, MenuItem, Typography } from "@mui/material";
import { IconChevronDown, IconPhone, IconWorld, IconCheck } from "@tabler/icons-react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ORDRE_PRODUITS, PRODUITS, produitDepuisNom, type SlugProduit } from "@/lib/produits";

/**
 * Bascule entre les produits d'un même client (étape 5 du chantier multi-produit).
 *
 * **Ne s'affiche qu'à partir de deux produits.** Un client mono-produit — le cas
 * de la quasi-totalité d'entre eux — ne doit rien voir de nouveau : il ne
 * soupçonne même pas qu'un mécanisme multi-produit existe.
 *
 * **La couleur n'est jamais le seul signal du produit actif** : le nom et
 * l'icône le portent aussi. Un daltonien ne verrait pas la bascule si le bleu
 * de Konnect et le vert de Talk étaient la seule différence.
 *
 * Le produit actif se déduit de l'URL, qui fait autorité — un lien partagé reste
 * sans ambiguïté. Le dernier produit visité est mémorisé pour la redirection
 * racine, mais ne prime jamais sur l'URL.
 */

const CLE_MEMOIRE = "lyrae.produitActif";

const ICONES: Record<SlugProduit, React.ElementType> = {
  talk: IconPhone,
  konnect: IconWorld,
};

type ProduitClient = { slug: SlugProduit; libelle: string; userProductId: number };

/** Mémorise le produit visité — lu par la redirection racine. */
export function memoriserProduit(slug: SlugProduit) {
  try {
    window.localStorage.setItem(CLE_MEMOIRE, slug);
  } catch {
    // Navigation privée, stockage plein : sans mémoire on retombe simplement
    // sur le premier produit. Aucune raison d'interrompre l'utilisateur.
  }
}

export function lireProduitMemorise(): SlugProduit | null {
  try {
    const valeur = window.localStorage.getItem(CLE_MEMOIRE);
    return ORDRE_PRODUITS.includes(valeur as SlugProduit) ? (valeur as SlugProduit) : null;
  } catch {
    return null;
  }
}

export default function SelecteurProduit() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [produits, setProduits] = useState<ProduitClient[]>([]);
  const [ancre, setAncre] = useState<null | HTMLElement>(null);

  const estAdmin =
    session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";

  useEffect(() => {
    // Le sélecteur est une affaire de client : un admin navigue par centre, via
    // /admin/clients/{userProductId}, pas par produit.
    if (status !== "authenticated" || estAdmin) return;
    const userId = session?.user?.id;
    if (!userId) return;

    fetch(`/api/users/${userId}/products`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const resolus = data.flatMap((entree: any) => {
          const produit = produitDepuisNom(entree?.name);
          // `removedAt` : une affiliation retirée reste en base et ne doit plus
          // apparaître dans le sélecteur.
          if (!produit || entree?.removedAt) return [];
          return [{
            slug: produit.slug,
            libelle: produit.libelle,
            userProductId: entree.id as number,
          }];
        });
        // Ordre du catalogue, pas celui de la base : la position d'un produit
        // dans le menu ne doit pas changer d'un client à l'autre.
        resolus.sort(
          (a: ProduitClient, b: ProduitClient) =>
            ORDRE_PRODUITS.indexOf(a.slug) - ORDRE_PRODUITS.indexOf(b.slug)
        );
        setProduits(resolus);
      })
      .catch(() => setProduits([]));
  }, [status, estAdmin, session?.user?.id]);

  const actif = useMemo(() => {
    const segment = pathname?.split("/")[3];
    return produits.find((p) => PRODUITS[p.slug].segment === segment) ?? null;
  }, [pathname, produits]);

  useEffect(() => {
    if (actif) memoriserProduit(actif.slug);
  }, [actif]);

  // Un seul produit : rien à basculer, rien à afficher.
  if (produits.length < 2) return null;

  const IconeActive = actif ? ICONES[actif.slug] : IconWorld;

  const basculer = (produit: ProduitClient) => {
    setAncre(null);
    if (produit.slug === actif?.slug) return;
    memoriserProduit(produit.slug);
    router.push(`/client/services/${PRODUITS[produit.slug].segment}/${produit.userProductId}`);
  };

  return (
    <>
      <Button
        onClick={(e) => setAncre(e.currentTarget)}
        endIcon={<IconChevronDown size={16} />}
        startIcon={<IconeActive size={18} />}
        sx={{
          textTransform: "none",
          fontWeight: 600,
          color: "var(--accent-deep)",
          bgcolor: "rgba(var(--accent-rgb), 0.10)",
          px: 1.5,
          "&:hover": { bgcolor: "rgba(var(--accent-rgb), 0.18)" },
        }}
        aria-label={`Produit actif : ${actif?.libelle ?? "aucun"}. Changer de produit`}
      >
        {actif?.libelle ?? "Produits"}
      </Button>

      <Menu
        anchorEl={ancre}
        open={Boolean(ancre)}
        onClose={() => setAncre(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { minWidth: 220, borderRadius: 2 } }}
      >
        {produits.map((produit) => {
          const Icone = ICONES[produit.slug];
          const courant = produit.slug === actif?.slug;
          return (
            <MenuItem
              key={produit.slug}
              onClick={() => basculer(produit)}
              selected={courant}
              sx={{ py: 1.25, gap: 1.5 }}
            >
              <Icone size={18} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={courant ? 700 : 500}>
                  {produit.libelle}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {produit.slug === "talk"
                    ? "Robot vocal téléphonique"
                    : "Portail patient web"}
                </Typography>
              </Box>
              {courant && <IconCheck size={16} />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
