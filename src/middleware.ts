import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Récupérer le token (qui doit contenir la propriété role)
  const token = await getToken({ req, secret: process.env.JWT_SECRET });

  // Liste des routes protégées
  const protectedRoutes = ['/admin', '/client'];

  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!token) {
      // Rediriger vers la page de connexion si non authentifié
      const signInUrl = new URL('/authentication/signin', req.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    // Pour les routes /admin, seul l'admin est autorisé
    if (pathname.startsWith('/admin') && token.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/client', req.url));
    }

    // Pour les routes /client, seul le client est autorisé
    if (pathname.startsWith('/client') && token.role !== 'CLIENT') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/client/:path*'],
};