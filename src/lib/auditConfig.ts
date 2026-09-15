import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * Journalise une écriture de configuration de centre.
 *
 * **Pourquoi ce raccourci existe** (15/09/2026). Le journal d'audit ne couvrait que
 * vingt-cinq routes sur quatre-vingt-seize : les écritures de configuration Konnect y
 * étaient, celles de LyraeTalk non. Tant que le compte principal était seul à écrire,
 * la question « qui a changé ça ? » avait une réponse évidente. Depuis que les
 * sous-comptes ont des droits d'écriture page par page, elle ne l'a plus.
 *
 * Le bloc d'appel faisait douze lignes et se recopiait à l'identique d'une route à
 * l'autre. Recopié quinze fois, il aurait fini par diverger.
 *
 * ⚠️ **Ne jamais y passer les valeurs écrites.** Ce journal part vers Grafana, qui
 * n'est pas un entrepôt de configuration client, et une ligne d'audit qui grossit
 * finit par porter ce qu'elle ne devrait pas. On journalise QUI, QUOI et QUAND : le
 * volume ou les noms de champs suffisent à reconstituer une chronologie, et c'est tout
 * ce qu'on demande à un audit. La règle vaut a fortiori pour toute donnée patient, qui
 * n'a rien à faire ici sous aucune forme.
 */
export function journaliserEcritureConfig(
  req: Request,
  session: any,
  action: string,
  userProductId: number | string | null,
  metadata?: Record<string, unknown>
): void {
  auditLog("data", action, {
    actor: {
      id: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      role: session?.user?.role ?? null,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata,
  });
}
