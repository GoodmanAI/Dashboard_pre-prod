"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Menu, MenuItem, Typography } from "@mui/material";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
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

  // Le `userProductId` porté par l'URL, quand il y en a un. Deux formes existent :
  // `/client/services/{produit}/{id}/…` et `/admin/clients/{id}/…`. Les deux
  // désignent un centre POUR UN PRODUIT, jamais le client lui-même.
  const userProductIdUrl = useMemo(() => {
    const parts = pathname?.split("/") ?? [];
    const brut =
      parts[1] === "client" && parts[2] === "services" ? parts[4] : parts[1] === "admin" && parts[2] === "clients" ? parts[3] : null;
    const n = Number(brut);
    return brut && Number.isFinite(n) && n > 0 ? n : null;
  }, [pathname]);

  useEffect(() => {
    if (status !== "authenticated") return;

    // ADMIN. Il navigue par centre, pas par produit : sur une page de client, le
    // sélecteur doit montrer les produits DE CE CLIENT, pas les siens. Hors d'une
    // page de client (overview, réglages, installation), il n'y a aucun centre en
    // vue et le sélecteur n'a rien à proposer.
    if (estAdmin) {
      if (userProductIdUrl === null) {
        setProduits([]);
        return;
      }
      fetch(`/api/admin/produits-du-centre?userProductId=${userProductIdUrl}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const liste: ProduitClient[] = Array.isArray(data?.produits) ? data.produits : [];
          liste.sort(
            (a, b) => ORDRE_PRODUITS.indexOf(a.slug) - ORDRE_PRODUITS.indexOf(b.slug)
          );
          setProduits(liste);
        })
        .catch(() => setProduits([]));
      return;
    }

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
  }, [status, estAdmin, session?.user?.id, userProductIdUrl]);

  const actif = useMemo(() => {
    const parts = pathname?.split("/") ?? [];
    // `/client/services/{segment}/{id}` : le segment produit est le troisième.
    const segment = parts[1] === "client" && parts[2] === "services" ? parts[3] : null;
    if (segment) {
      return produits.find((p) => PRODUITS[p.slug].segment === segment) ?? null;
    }
    // `/admin/clients/{id}` ne nomme aucun produit : ces écrans sont ceux de
    // LyraeTalk, et c'est l'identifiant lui-même qui dit lequel des deux on
    // regarde. Sans ça, le sélecteur afficherait « aucun produit » sur une page
    // où l'on est manifestement dans un produit.
    return produits.find((p) => p.userProductId === userProductIdUrl) ?? null;
  }, [pathname, produits, userProductIdUrl]);

  useEffect(() => {
    if (actif) memoriserProduit(actif.slug);
  }, [actif]);

  // Un seul produit : rien à basculer, rien à afficher.
  if (produits.length < 2) return null;

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
        endIcon={<IconChevronDown size={18} />}
        sx={{
          textTransform: "none",
          color: "var(--accent-deep)",
          bgcolor: "rgba(var(--accent-rgb), 0.10)",
          px: 1.75,
          py: 1,
          borderRadius: 2,
          "&:hover": { bgcolor: "rgba(var(--accent-rgb), 0.18)" },
        }}
        aria-label={`Produit actif : ${actif?.libelle ?? "aucun"}. Changer de produit`}
      >
        {actif ? (
          // `<img>` et non `next/image` : ces logos sont des SVG locaux de moins
          // d'un kilo-octet. Les optimiser n'apporte rien, et `next/image` refuse
          // les SVG tant qu'on n'a pas activé `dangerouslyAllowSVG`.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={PRODUITS[actif.slug].logos.lockup}
            alt={PRODUITS[actif.slug].libelle}
            // Hauteur imposée, largeur libre : les deux noms de produit n'ont pas
            // la même longueur, les figer à la même largeur en déformerait un.
            style={{ height: 30, width: "auto", display: "block" }}
          />
        ) : (
          <Typography fontWeight={600}>Produits</Typography>
        )}
      </Button>

      <Menu
        anchorEl={ancre}
        open={Boolean(ancre)}
        onClose={() => setAncre(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{ sx: { minWidth: 280, borderRadius: 2, mt: 0.5 } }}
      >
        {produits.map((produit) => {
          const courant = produit.slug === actif?.slug;
          const config = PRODUITS[produit.slug];
          return (
            <MenuItem
              key={produit.slug}
              onClick={() => basculer(produit)}
              selected={courant}
              sx={{ py: 1.5, gap: 1.5 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={config.logos.symbole}
                alt=""
                style={{ height: 28, width: 28, display: "block" }}
              />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={courant ? 700 : 500}>
                  {config.libelle}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {config.description}
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
