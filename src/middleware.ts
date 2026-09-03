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
  // Module Info FAQ patient (chantier 2026-08-05) : endpoint public consomme
  // par la brique Azure Functions module_info. Auth via X-Api-Key
  // (MODULE_INFO_API_KEY) cote handler.
  //  - GET /api/module-info/[userProductId] : public + API key
  //  - /api/module-info/items[/id] : session admin, PAS whitelist ici
  /^\/api\/module-info\/\d+$/,
  // Confirmation de RDV par SMS :
  //  - /api/rdv/init, /api/rdv/pending-events, /api/rdv/ack → API key (handler)
  //  - /api/rdv/[token], /api/rdv/[token]/respond → public, protégés par le token
  /^\/api\/rdv(\/|$)/,
  // Config "envoi SMS par type d'examen" — auth mixte (API key OU session) côté handler.
  /^\/api\/sms-confirmation-config$/,
  // Dépôt d'ordonnance patient :
  //  - /api/prescriptions/init, /pending, /[id]/download, /[id]/ack → API key (handler)
  //  - /api/prescriptions/[token]/status, /upload → public, protégés par le token
  //  - /api/prescriptions/config → auth mixte (API key OU session) côté handler
  /^\/api\/prescriptions(\/|$)/,
  // Suivi de dérive de déploiement (chantier 2026-08-10) :
  //  - POST : sonde deploy/deployment-probe.js des 3 VMs → API key (handler)
  //  - GET  : page /admin/deployments (session admin) OU daily-report (API key),
  //           auth mixte côté handler. Whitelisté car l'appel cron n'a pas de session.
  /^\/api\/deployments$/,
  // Configuration LyraeKonnect (chantier multi-produit, 2026-08-24) :
  //  - GET  : Konnect vient lire la config de son cabinet → x-api-key
  //           KONNECT_API_KEY, distincte de BOT_API_KEY pour rester
  //           distinguable dans les logs d'audit. Il s'identifie par son
  //           tenant_id, traduit via KonnectTenantMapping.
  //  - PUT  : session uniquement (le handler refuse un appel par clé).
  // Whitelisté ici car l'appel de Konnect n'a pas de session ; l'authentification
  // réelle reste dans le handler.
  /^\/api\/konnect-configuration$/,
  // Résolution tenant_id → userProductId (lot A, 2026-08-26) : Konnect l'appelle
  // UNE FOIS puis retient le résultat, pour interroger ensuite le Dashboard par
  // userProductId, comme LyraeTalk. Clé API seule côté handler (pas de session :
  // la question n'est posée que par une brique).
  // ⚠️ Seule la sous-route `/resolve` est publique. La route parente
  // `/api/konnect-tenant-mapping` administre la correspondance et reste
  // réservée à une session admin — ne pas la whitelister.
  /^\/api\/konnect-tenant-mapping\/resolve$/,
  // Socle de configuration générique (lot B, 2026-08-26) : une brique vient lire
  // un domaine de configuration de son centre. La clé attendue DÉPEND du domaine
  // (KONNECT_API_KEY, BOT_API_KEY…) et est résolue dans le handler via le
  // registre `src/lib/productConfig.ts` — celle de Konnect n'ouvre pas les
  // domaines de LyraeTalk. Le PUT reste réservé à une session.
  /^\/api\/product-config$/,
  // Catalogue d'examens LyraeKonnect (lot C, 2026-08-26) : Konnect vient lire le
  // catalogue de son centre, dont le Dashboard est propriétaire. Lecture par clé,
  // écriture réservée à une session (le handler refuse un PUT par clé).
  /^\/api\/konnect-examens$/,
  // Sites du centre (lot C) : Konnect vient lire les adresses saisies par le
  // client, que le RIS n'expose pas. Lecture par cle, ecriture par session.
  /^\/api\/konnect-sites$/,
  // Demandes de rappel (2026-09-02) : la SEULE route `konnect-*` ou Konnect
  // ECRIT. Il y depose la demande d'un patient dont l'examen n'est pas reservable
  // en ligne, pour que le secretariat le rappelle. Lecture et mise a jour
  // reservees a une session.
  /^\/api\/konnect-demandes-rappel$/,
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
  // Assets statiques publics nécessaires au rendu de la page patient.
  // Sans ces règles le logo et les images inline renvoient 404 sur ce host.
  /^\/images\//,                // /images/logos/*, autres images publiques
  /^\/fonts\//,                 // /fonts/*.ttf (police Inter locale)
  /^\/_next\/data\//,            // payload React Server Components dynamiques
];

function isAllowedOnRdvSubdomain(pathname: string): boolean {
  return RDV_SUBDOMAIN_ALLOWED_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Sous-domaine dédié au dépôt d'ordonnance patient (depot-ordonnances.neuracorp.ai).
 * Même logique d'isolation que rdv.neuracorp.ai : seules les 2 routes patient
 * (page upload + endpoints du token) sont accessibles, tout le reste → 404.
 *
 * IMPORTANT : les endpoints M2M (/init, /pending, /[id]/download, /[id]/ack,
 * /config) ne sont PAS whitelistés ici — ils sont réservés à dashboard.neuracorp.ai
 * pour minimiser la surface d'attaque du sous-domaine patient.
 */
const DEPOT_ORDONNANCES_SUBDOMAIN_HOST = 'depot-ordonnances.neuracorp.ai';

const DEPOT_ORDONNANCES_ALLOWED_PATTERNS: RegExp[] = [
  /^\/d\/[^/]+\/?$/,                              // /d/{shortCode} — page upload patient
  /^\/api\/prescriptions\/[^/]+\/status\/?$/,     // GET statut public (via token)
  /^\/api\/prescriptions\/[^/]+\/upload\/?$/,     // POST upload PDF (via token)
  // Assets statiques publics pour le rendu de la page upload.
  /^\/images\//,
  /^\/fonts\//,
  /^\/_next\/data\//,
];

function isAllowedOnDepotOrdonnancesSubdomain(pathname: string): boolean {
  return DEPOT_ORDONNANCES_ALLOWED_PATTERNS.some((re) => re.test(pathname));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Isolation des sous-domaines patient ----
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

  if (host === DEPOT_ORDONNANCES_SUBDOMAIN_HOST) {
    if (!isAllowedOnDepotOrdonnancesSubdomain(pathname)) {
      return new NextResponse('Not Found', { status: 404 });
    }
    // Path autorisé sur depot-ordonnances.neuracorp.ai → laisse passer.
    // (les endpoints /api/prescriptions/[token]/* ont leur propre auth par
    //  token + verificationCode côté handler)
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.JWT_SECRET });

  // ---- Protection des routes UI ----
  if (pathname.startsWith('/admin') || pathname.startsWith('/client')) {
    // Token absent OU vide (revoque par tokenVersion bump / user supprime) :
    // le callback jwt renvoie {} dans ces cas. On force le signin.
    if (!token || !token.id) {
      const signInUrl = new URL('/authentication/signin', req.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    if (pathname.startsWith('/admin') && token.role !== 'ADMIN' && token.role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/client', req.url));
    }

    if (
      pathname.startsWith('/client') &&
      token.role !== 'CLIENT' &&
      token.role !== 'ADMIN' &&
      token.role !== 'SUPER_ADMIN'
    ) {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
  }

  // ---- Protection des routes API ----
  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }
    // Token absent OU vide (revoque) : refuse l'API. Comme pour l'UI, un
    // token vide veut dire que jwt callback a rejete la session (user
    // supprime ou tokenVersion bump).
    if (!token || !token.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Session valide : le handler peut ensuite appliquer les checks de rôle / ownership.
  }

  return NextResponse.next();
}

/**
 * Matcher élargi : on doit intercepter TOUTES les requêtes (y compris `/`,
 * les pages statiques, les assets, etc.) sur les sous-domaines patient
 * (rdv.neuracorp.ai, depot-ordonnances.neuracorp.ai) pour appliquer
 * l'isolation host. Sur les autres hosts, le middleware ne fait rien pour
 * les paths hors admin/client/api (donc coût négligeable).
 *
 * On exclut explicitement les assets Next.js internes et le favicon pour
 * éviter d'exécuter le middleware sur chaque fichier CSS/JS/image du build.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
