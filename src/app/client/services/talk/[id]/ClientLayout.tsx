// app/client/services/talk/[id]/ClientLayout.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { CentreProvider } from "@/app/context/CentreContext";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <CentreProvider>
        {children}
      </CentreProvider>
    </SessionProvider>
  );
}
