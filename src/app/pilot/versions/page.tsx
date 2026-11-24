import { utilisateurCourant } from "@/pilot/lib/session";
import VersionsEnLigne from "@/pilot/ecrans/VersionsEnLigne";

export const dynamic = "force-dynamic";

/**
 * Ce qui tourne sur chaque machine, comparé à ce qui est poussé (ex-écran
 * « Déploiements » de l'admin du Dashboard, passé dans Pilot le 23/11/2026).
 * La route `/api/deployments` ne change pas : les sondes et Daily Report l'appellent.
 */
export default async function PageVersions() {
  await utilisateurCourant();
  return <VersionsEnLigne />;
}
