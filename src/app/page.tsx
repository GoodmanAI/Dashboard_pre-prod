'use client'

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { Grid, Box } from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';

/**
 * Page de redirection principale du tableau de bord.
 * - Décide dynamiquement de la route cible selon l’état d’authentification et le rôle utilisateur.
 * - Expose un contenu minimal pendant la transition (message “Redirection en cours...”).
 * - Conserve le conteneur SEO (PageContainer) pour fournir title/description aux moteurs.
 */
const Dashboard = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  /**
   * Redirections côté client en fonction de l’état de session :
   * - loading : ne rien faire (évite une redirection prématurée)
   * - unauthenticated : vers la page de connexion
   * - ADMIN : vers l’espace d’administration
   * - tout autre rôle : vers l’espace client
   */
  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      router.push("/authentication/signin");
    } else if (session?.user?.role === "ADMIN") {
      router.push("/admin");
    } else {
      router.push("/client");
    }
  }, [session, status, router]);

  /**
   * Rendu minimal affiché le temps que la redirection s’effectue.
   * PageContainer conserve les métadonnées (title/description) pour l’accessibilité et le SEO.
   */
  return (
    <PageContainer title="Dashboard" description="this is Dashboard">
       <div className="flex items-center justify-center h-screen">
        <p>Redirection en cours...</p>
      </div>
    </PageContainer>
  )
}

export default Dashboard;
