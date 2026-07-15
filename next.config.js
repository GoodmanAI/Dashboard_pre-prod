/** @type {import('next').NextConfig} */

// Content Security Policy — définie sur une seule ligne (les navigateurs
// n'acceptent pas les newlines dans le header). On la génère à partir d'un
// objet pour rester lisible.
//
// Choix (validés 2026-07-15) :
//   - default-src 'self'              : rien depuis un autre domaine par défaut
//   - script-src 'unsafe-inline' 'unsafe-eval' : requis par Next.js
//     (hydration + certaines librairies MUI/Recharts). Version light.
//     Renforcement possible plus tard via nonces (chantier séparé).
//   - style-src 'unsafe-inline'       : MUI/emotion injecte des styles inline.
//   - img-src 'self' data: blob:      : icônes SVG inline, uploads, previews.
//   - font-src 'self' data:           : fonts locales + inline base64.
//   - connect-src 'self'              : tous les fetch sont relatifs (/api/*)
//   - frame-src 'self' https://tabler-icons.io : autorise l'iframe de
//     /icons (démo admin des icônes Tabler).
//   - frame-ancestors 'self'          : équivalent CSP de X-Frame-Options
//     SAMEORIGIN, empêche l'iframe du dashboard depuis un autre domaine.
//   - base-uri 'self' / form-action 'self' / object-src 'none' : durcissements
//     standards recommandés OWASP.
const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "frame-src": ["'self'", "https://tabler-icons.io"],
  "frame-ancestors": ["'self'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "object-src": ["'none'"],
};

const cspHeader = Object.entries(cspDirectives)
  .map(([key, values]) => `${key} ${values.join(" ")}`)
  .join("; ");

const securityHeaders = [
  {
    // Force HTTPS pour 2 ans sur ce domaine + sous-domaines. `preload` est
    // volontairement omis pour l'instant : c'est un engagement fort (le
    // domaine peut être soumis à hstspreload.org une fois qu'on est sûr que
    // TOUT tourne en HTTPS, y compris chaque sous-domaine, sans exception).
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    // Force le navigateur à respecter le Content-Type retourné par le serveur.
    // Bloque une classe entière d'attaques XSS via mimetype confusion.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Empêche le dashboard d'être iframé depuis un autre domaine (anti-
    // clickjacking). SAMEORIGIN autorise l'iframe depuis nos propres pages.
    // Redondant avec CSP frame-ancestors mais nécessaire pour les vieux
    // navigateurs qui n'implémentent pas CSP niveau 2.
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    // Le referrer complet (avec query string) n'est jamais envoyé cross-origin.
    // Envoie seulement l'origin cross-origin, référence complète same-origin.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Désactive explicitement les API sensibles du navigateur qu'on n'utilise
    // pas. Un XSS injecté ne pourra pas déclencher caméra/micro/géoloc.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: cspHeader,
  },
];

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Appliquer les headers de sécurité à toutes les routes.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
