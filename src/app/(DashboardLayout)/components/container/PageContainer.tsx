import { Helmet, HelmetProvider } from 'react-helmet-async';

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
 */
const PageContainer = ({ title, description, children }: Props) => (
  // Fournisseur nécessaire pour l’utilisation de Helmet en environnement async/SSR.
  <HelmetProvider>
    <div>
      {/* Métadonnées de document (SEO) */}
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Helmet>

      {/* Contenu de la page */}
      {children}
    </div>
  </HelmetProvider>
);

export default PageContainer;
