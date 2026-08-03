'use client'

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';
import { getFirstAccessiblePath, getClientPathForPage } from '@/lib/pageAccess';
import { PAGES } from '@/lib/permissions';

/**
 * Page de redirection principale du tableau de bord.
 *
 * Regles (chantier 3) :
 *   - ADMIN / SUPER_ADMIN -> /admin
 *   - CLIENT principal -> /client/services/talk/{talkId} (dashboard produit)
 *   - CLIENT sous-compte : premiere page accessible selon PAGE_PRIORITY, en
 *     resolvant le talkId du parent (heritage via managerId, cf. fix products)
 *
 * Si aucun talkId trouve OU aucune page accessible : fallback /client
 * (empty state ; ne devrait jamais arriver pour un sous-compte bien configure).
 */
const Dashboard = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [talkId, setTalkId] = useState<number | null>(null);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      try {
        const res = await fetch(`/api/users/${userId}/products`);
        const data = await res.json();
        if (Array.isArray(data)) {
          const talk = data.find((p: any) => p?.name === "LyraeTalk");
          setTalkId(talk?.id ?? null);
        }
      } catch (err) {
        console.error("Error fetching products for root redirect:", err);
      } finally {
        setProductsLoaded(true);
      }
    };
    load();
  }, [userId]);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      router.push("/authentication/signin");
      return;
    }

    if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
      router.push("/admin");
      return;
    }

    // CLIENT : attend que le fetch products soit termine pour connaitre le talkId
    if (!productsLoaded) return;

    // Compte principal sans permissions custom : redirect direct vers le
    // dashboard produit (comportement historique)
    if (session?.user && !(session.user as any).permissions) {
      const url = talkId != null
        ? getClientPathForPage(PAGES.DASHBOARD, talkId)
        : "/client";
      router.push(url ?? "/client");
      return;
    }

    // Sous-compte : premiere page accessible selon PAGE_PRIORITY
    const target = getFirstAccessiblePath(session?.user as any, talkId);
    router.push(target ?? "/client");
  }, [session, status, router, talkId, productsLoaded]);

  return (
    <PageContainer title="Dashboard" description="this is Dashboard">
      <div className="flex items-center justify-center h-screen">
        <p>Redirection en cours...</p>
      </div>
    </PageContainer>
  );
};

export default Dashboard;
