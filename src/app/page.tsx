'use client'

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { Grid, Box } from '@mui/material';
import PageContainer from '@/app/(DashboardLayout)/components/container/PageContainer';

const Dashboard = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

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


  return (
    <PageContainer title="Dashboard" description="this is Dashboard">
       <div className="flex items-center justify-center h-screen">
        <p>Redirection en cours...</p>
      </div>
    </PageContainer>
  )
}

export default Dashboard;
