"use client";

import { Helmet, HelmetProvider } from "react-helmet-async";
import { useProduitActif } from "@/hooks/useProduitActif";

type Props = {
  /** Balise meta description de la page (SEO). */
  description?: string;
  /** Contenu JSX de la page. */
  children: JSX.Element | JSX.Element[];
  /** Titre de la page (onglet + balise <title>). */
  title?: string;
};

/**
 * Conteneur de page commun :
 * - Fournit un `HelmetProvider` pour la gestion asynchrone du `<head>`.
 * - Injecte le titre et la meta description de la page via `Helmet`.
 * - Rend le contenu passé en enfants.
 *
 * Le titre de l'onglet est « Page | Produit ». Jusqu'au 22/09/2026 il valait
 * « LyraeTalk | Dashboard » partout, y compris sous Konnect : les 40 `title` passés
 * par les écrans n'étaient jamais lus.
 */
const PageContainer = ({ title, description, children }: Props) => {
  const produit = useProduitActif();
  const titreOnglet = title ? `${title} | ${produit.nom}` : produit.nom;
  return (
    // Fournisseur nécessaire pour l’utilisation de Helmet en environnement async/SSR.
    <HelmetProvider>
      <div>
        {/* Métadonnées de document (SEO) */}
        <Helmet>
          <title>{titreOnglet}</title>
          <meta name="description" content={description} />
        </Helmet>

        {/* Contenu de la page */}
        {children}
      </div>
    </HelmetProvider>
  );
};

export default PageContainer;
