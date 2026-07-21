import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Endpoints API publics (pas de session requise).
 * - `/api/auth/*` : routes NextAuth (signin, callback, session).
 * - `/api/calls/summary` : endpoint bot Lyrae, protégé par API key dans le handler.
 *
 * Toute autre route `/api/*` est refusée (401) sans session valide.
 */
const PUBLIC_API_PATTERNS: RegExp[] = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/calls\/summary$/,
  // Endpoints appelés aussi par le bot Lyrae (API key côté handler) :
  /^\/api\/configuration\/get\/mapping$/,
  /^\/api\/configuration\/get\/mapping\/getLibelle$/,
  /^\/api\/configuration\/get\/is_open$/,
  /^\/api\/configuration$/,
  // Ingestion heartbeats (services backend) — auth via header x-heartbeat-secret
  // côté handler. On exclut `status` qui reste protégé par session admin.
  /^\/api\/heartbeat\/(?!status$)[^/]+$/,
  // Confirmation de RDV par SMS :
  //  - /api/rdv/init, /api/rdv/pending-events, /api/rdv/ack → API key (handler)
  //  - /api/rdv/[token], /api/rdv/[token]/respond → public, protégés par le token
  /^\/api\/rdv(\/|$)/,
  // Config "envoi SMS par type d'examen" — auth mixte (API key OU session) côté handler.
  /^\/api\/sms-confirmation-config$/,
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Sous-domaine dédié aux liens SMS patient (rdv.neuracorp.ai).
 * Sur ce host on n'expose QUE les 2 pages publiques + leurs APIs internes,
 * pour éviter qu'un visiteur (ou un scanner) puisse atteindre le dashboard
 * admin en tapant simplement `rdv.neuracorp.ai/admin` ou `/client`.
 *
 * Tout chemin en dehors de cette whitelist renvoie une 404 immédiate.
 */
const RDV_SUBDOMAIN_HOST = 'rdv.neuracorp.ai';

const RDV_SUBDOMAIN_ALLOWED_PATTERNS: RegExp[] = [
  /^\/c\/[^/]+\/?$/,            // /c/{shortCode} — URL courte du SMS
  /^\/confirm\/[^/]+\/?$/,      // /confirm/{token} — URL longue (rétrocompat)
  /^\/api\/rdv\/[^/]+\/?$/,     // /api/rdv/{token} — GET infos RDV
  /^\/api\/rdv\/[^/]+\/respond\/?$/,  // /api/rdv/{token}/respond — POST réponse patient
];

function isAllowedOnRdvSubdomain(pathname: string): boolean {
  return RDV_SUBDOMAIN_ALLOWED_PATTERNS.some((re) => re.test(pathname));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Isolation du sous-domaine rdv.neuracorp.ai ----
  // Vérifié EN PREMIER : indépendant de l'auth, s'applique même aux assets.
  // Le host peut inclure un port (rare en prod, courant en dev) — on strip.
  const host = req.headers.get('host')?.split(':')[0].toLowerCase();
  if (host === RDV_SUBDOMAIN_HOST) {
    if (!isAllowedOnRdvSubdomain(pathname)) {
      // Renvoie 404 (pas 403) pour ne pas révéler qu'un dashboard existe
      // derrière le sous-domaine.
      return new NextResponse('Not Found', { status: 404 });
    }
    // Path autorisé sur rdv.neuracorp.ai → laisse passer sans checks admin/API.
    // (les endpoints /api/rdv/* ont leur propre auth par token côté handler)
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.JWT_SECRET });

  // ---- Protection des routes UI ----
  if (pathname.startsWith('/admin') || pathname.startsWith('/client')) {
    if (!token) {
      const signInUrl = new URL('/authentication/signin', req.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    if (pathname.startsWith('/admin') && token.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/client', req.url));
    }

    if (
      pathname.startsWith('/client') &&
      token.role !== 'CLIENT' &&
      token.role !== 'ADMIN'
    ) {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
  }

  // ---- Protection des routes API ----
  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Session valide : le handler peut ensuite appliquer les checks de rôle / ownership.
  }

  return NextResponse.next();
}

/**
 * Matcher élargi : on doit intercepter TOUTES les requêtes (y compris `/`,
 * les pages statiques, les assets, etc.) sur rdv.neuracorp.ai pour appliquer
 * l'isolation host. Sur les autres hosts, le middleware ne fait rien pour
 * les paths hors admin/client/api (donc coût négligeable).
 *
 * On exclut explicitement les assets Next.js internes et le favicon pour
 * éviter d'exécuter le middleware sur chaque fichier CSS/JS/image du build.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
