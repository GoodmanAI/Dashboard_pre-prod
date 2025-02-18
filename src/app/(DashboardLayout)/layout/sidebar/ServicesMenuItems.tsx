// src/components/Sidebar/ServicesMenuItems.tsx
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

interface Product {
  id: number;
  name: string;
}

const ServicesMenuItems: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const response = await fetch("/api/public/products");
        const data = await response.json();
        if (response.ok && data.products) {
          setProducts(data.products);
        } else {
          setError(data.error || "Failed to fetch products");
        }
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  if (loading) {
    return <CircularProgress size={24} />;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  return (
    <List>
      {products.map((product) => (
        <ListItem key={product.id} disablePadding>
          <ListItemButton component={Link} href={`/services/${product.id}`}>
            <ListItemText primary={product.name} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
};

export default ServicesMenuItems;
