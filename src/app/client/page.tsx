"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
} from "@mui/material";
import { IconArrowRight } from "@tabler/icons-react";
import SectionHeader from "@/components/admin/SectionHeader";
import { produitDepuisNom } from "@/lib/produits";
import { cheminCentre, PRODUITS_MIGRES } from "@/lib/cheminsCentre";

/**
 * Types de données échangées avec l’API / structure locale.
 */
interface Product {
  id: number;
  name: string;
  description: string;
  assignedAt?: string;
  removedAt?: string;
}

/**
 * Page d’accueil Client.
 * - Récupère les produits de l’utilisateur courant directement depuis l’API dédiée.
 */
const ClientHomePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userProducts, setUserProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger les produits de l'utilisateur
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        // On utilise l'id de l'utilisateur de la session
        const userId = (session.user as any).id;
        const res = await fetch(`/api/users/${userId}/products`);
        if (!res.ok) throw new Error("Erreur lors de la récupération des produits.");
        const productsData = await res.json();
        if (!cancelled) setUserProducts(productsData);
      } catch (error) {
        console.error("Error fetching user products:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session]);

  // Redirection si non authentifié
  useEffect(() => {
    if (status === "unauthenticated") router.push("/authentication/signin");
  }, [status, router]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress sx={{ "& .MuiCircularProgress-svg": { color: "var(--accent)" } }} />
      </Box>
    );
  }

  if (!userProducts.length) {
    return (
      <Typography color="text.secondary">
        Aucun produit n&apos;est rattaché à votre compte. Contactez le support pour en ouvrir un.
      </Typography>
    );
  }

  // Tri stable par id, et on n'affiche QUE les produits du catalogue.
  // Liste blanche et non liste noire : un produit retiré du dashboard
  // (LyraeExplain) ou une ligne "Product" résiduelle en base disparaît d'office,
  // sans qu'il faille penser à l'ajouter à une exclusion.
  const sortedProducts = [...userProducts]
    .sort((a, b) => a.id - b.id)
    .filter((el) => produitDepuisNom(el.name) !== null);

  // « LyraeTalk » s'affiche « Lyrae Talk », la marque en avant.
  const renderProductName = (name: string) => {
    if (name.toLowerCase().startsWith("lyrae")) {
      return (
        <>
          <span style={{ fontWeight: 900 }}>Lyrae</span> {name.slice(5)}
        </>
      );
    }
    return name;
  };

  /**
   * Où mène la tuile d'un produit.
   *
   * Les produits migrés vers l'URL par client (chantier U) veulent le `userId` du
   * client, que la session porte. Les autres gardent leur chemin historique, sans
   * identifiant : c'est leur propre redirection qui le complète.
   */
  const getProductRoute = (name: string) => {
    const produit = produitDepuisNom(name);
    if (!produit) return "https://neuracorp.ai";
    if (PRODUITS_MIGRES.includes(produit.slug) && session?.user?.id) {
      return cheminCentre(session.user.id, produit.slug);
    }
    return `/client/services/${produit.segment}`;
  };

  return (
    <Box>
      <SectionHeader
        title={`Bienvenue${session?.user?.name ? `, ${session.user.name}` : ""}`}
        subtitle="Vos produits Lyrae. Le menu de gauche mène directement à chacun d'eux."
      />

      <Grid container spacing={2}>
        {sortedProducts.map((product) => {
          const isActive = !product.removedAt;
          const assignedDate = product.assignedAt
            ? new Date(product.assignedAt).toLocaleDateString("fr-FR")
            : "";
          const ouvrir = () => {
            const route = getProductRoute(product.name);
            if (route.startsWith("http")) window.open(route + `/${product.id}`, "_blank");
            else router.push(route + `/${product.id}`);
          };

          return (
            <Grid item xs={12} md={6} key={product.id}>
              {/* Même carte-lien que l'accueil Konnect : atteignable au clavier. */}
              <Card
                variant="outlined"
                sx={{
                  borderColor: "#E4EAEE",
                  borderRadius: 2,
                  height: "100%",
                  transition: "border-color .15s",
                  "&:hover": { borderColor: "var(--accent)" },
                }}
              >
                <CardActionArea onClick={ouvrir} sx={{ height: "100%", p: 2.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
                      {renderProductName(product.name)}
                    </Typography>
                    <Chip
                      size="small"
                      label={isActive ? "Actif" : "Inactif"}
                      sx={{
                        fontWeight: 600,
                        bgcolor: isActive ? "rgba(var(--accent-rgb), 0.15)" : "#EEF1F4",
                        color: isActive ? "var(--accent-deep)" : "text.secondary",
                      }}
                    />
                  </Box>
                  {product.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      {product.description}
                    </Typography>
                  )}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: "var(--accent-deep)", fontWeight: 600, flex: 1 }}
                    >
                      {isActive ? "Ouvrir" : "En savoir plus"}
                    </Typography>
                    {isActive && assignedDate && (
                      <Typography variant="caption" color="text.secondary">
                        Depuis le {assignedDate}
                      </Typography>
                    )}
                    <IconArrowRight size={18} color="var(--accent-deep)" />
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default ClientHomePage;
