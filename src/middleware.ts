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
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATTERNS.some((re) => re.test(pathname));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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

export const config = {
  matcher: ['/admin/:path*', '/client/:path*', '/api/:path*'],
};
