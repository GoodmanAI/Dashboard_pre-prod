"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import Link from "next/link";

/**
 * Modèle minimal d’un produit tel que renvoyé par l’API publique.
 */
interface Product {
  id: number;
  name: string;
}

/**
 * Liste des services/produits affichée dans la barre latérale.
 * - Récupère le catalogue public via l’API `/api/public/products`
 * - Gère les états de chargement et d’erreur
 * - Rend une entrée cliquable par produit
 */
const ServicesMenuItems: React.FC = () => {
  // État local du composant (catalogue, chargement, erreur)
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Effet de chargement du catalogue au montage.
   * - Protection contre les setState après un démontage grâce au drapeau `isMounted`.
   */
  useEffect(() => {
    let isMounted = true;

    async function fetchProducts() {
      setLoading(true);
      try {
        const response = await fetch("/api/public/products");
        const data = await response.json();

        if (!isMounted) return;

        if (response.ok && Array.isArray(data.products)) {
          setProducts(data.products);
          setError(null);
        } else {
          setError(data.error || "Échec lors de la récupération des produits.");
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Error fetching products:", err);
        setError("Une erreur inattendue est survenue.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      isMounted = false;
    };
  }, []);

  // État de chargement : indicateur visuel compact
  if (loading) {
    return <CircularProgress size={24} />;
  }

  // État d’erreur : message utile pour l’utilisateur
  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  /**
   * Rendu principal : liste cliquable des produits.
   * - Chaque élément redirige vers `/services/{id}`
   */
  return (
    <List>
      {products.map((product) => (
        <ListItem key={product.id} disablePadding>
          <ListItemButton component={Link} href={`/services/${product.id}`} aria-label={product.name}>
            <ListItemText primary={product.name} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
};

export default ServicesMenuItems;
