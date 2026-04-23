"use client";

import { usePathname } from "next/navigation";

export function useTalkBasePath(userProductId: number | string): string {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin/")) {
    return `/admin/clients/${userProductId}`;
  }
  return `/client/services/talk/${userProductId}`;
}

export function buildTalkBasePath(
  userProductId: number | string,
  isAdmin: boolean
): string {
  return isAdmin
    ? `/admin/clients/${userProductId}`
    : `/client/services/talk/${userProductId}`;
}
