/**
 * Handler NextAuth (routes GET/POST /api/auth/*).
 *
 * DOIT utiliser `authOptions` importé depuis `@/lib/authOptions` — sinon les
 * paramètres de session (maxAge, debug, callbacks, providers…) divergent
 * silencieusement entre les endpoints qui lisent la session
 * (`getServerSession(authOptions)`) et le handler qui l'écrit. Bug déjà vu
 * dans l'historique de ce fichier.
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
