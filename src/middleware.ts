import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import {
  estHotePilot,
  estCheminPilot,
  partageSurPilot,
  ecritureRefuseeAuxAdmin,
  MESSAGE_LECTURE_SEULE,
} from '@/lib/espaces';
import { origineDe, origineRefusee } from '@/pilot/lib/requete';
import { ENTETE_CHEMIN } from '@/pilot/lib/refusSession';
import { nomCookieSession } from '@/lib/cookieSession';
import {
  ENTETE_CHEMIN_ADMIN,
  MESSAGE_ACCES_INTERNE,
  apiPermiseAInterne,
  lireAccesInternes,
  ouvreLeDashboard,
} from '@/lib/accesInternes';
import { hasPermission } from '@/lib/permissions';
import { peutOuvrirAdmin, verdictAcces } from '@/lib/pageAccess';

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
  //  - /api/rdv/sante → DAILY_REPORT_API_KEY (handler), sonde de Daily Report (16/11/2026)
  //  - /api/rdv/[token], /api/rdv/[token]/respond → public, protégés par le token
  //
  // ⚠️ Ce bloc remplace `/^\/api\/rdv(\/|$)/`, un motif de BRANCHE qui whitelistait
  // toute route ajoutée dessous. C'est lui qui a laissé `/api/rdv/dev-seed`
  // joignable sans session jusqu'au 14/09/2026, alors qu'elle écrit en base et
  // renvoie le nom et la ville du centre.
  //
  // ⚠️ RISQUE RÉSIDUEL, à connaître avant d'ajouter une route ici : le motif de
  // jeton ci-dessous accepte n'importe quel segment unique, faute de pouvoir
  // distinguer un jeton d'un nom de route. Toute nouvelle route
  // `/api/rdv/<quelque-chose>` sera donc whitelistée par accident. Si tu en
  // ajoutes une, ajoute-la à la liste d'exclusion du `(?!…)`, ou garde-la
  // toi-même dans son handler.
  /^\/api\/rdv\/(?:init|ack|pending-events|reminder-sent|stats|sante)$/,
  /^\/api\/rdv\/(?!dev-seed$)[^/]+$/,
  /^\/api\/rdv\/(?!dev-seed$)[^/]+\/respond$/,
  // Config "envoi SMS par type d'examen" — auth mixte (API key OU session) côté handler.
  /^\/api\/sms-confirmation-config$/,
  // Dépôt d'ordonnance patient :
  //  - /api/prescriptions/init, /pending, /download/[id], /ack/[id] → API key (handler)
  //  - /api/prescriptions/[token]/status, /upload → public, protégés par le token
  //
  // ⚠️ Ce bloc remplace `/^\/api\/prescriptions(\/|$)/`, même motif de branche que
  // pour `rdv` et même risque. Le commentaire précédent annonçait `config` en
  // « auth mixte » : c'est faux, `config/route.ts` appelle `requireAuth`, qui est
  // session seule. `config`, `alerts`, `alerts/count`, `alerts/[id]`, `rejected`
  // et `stats` sont donc SORTIS de la whitelist : leur handler exigeait déjà une
  // session, le middleware la refuse maintenant plus tôt. Aucun appelant par clé
  // ne peut régresser, puisqu'aucun ne passait le handler.
  /^\/api\/prescriptions\/(?:init|pending)$/,
  // Ordonnance a envoyer par mail (patient sans mobile) : LyraeTalk, API key (handler).
  /^\/api\/prescriptions\/par-mail\/init$/,
  // Alertes ouvertes, RDV supprimes ou deplaces dans Xplore : cron d'AI2Xplore, API key (handler).
  /^\/api\/prescriptions\/alerts\/(?:open|rdv-supprimes|rdv-deplaces)$/,
  /^\/api\/prescriptions\/(?:ack|download)\/[^/]+$/,
  /^\/api\/prescriptions\/[^/]+\/(?:status|upload)$/,
  // Modele vierge d'un document demande (questionnaire du centre) : public, protege par le token.
  /^\/api\/prescriptions\/[^/]+\/modele\/\d+$/,
  // Questionnaire rempli en ligne (ouvrir avec le code, fond de l'apercu, envoyer) : public, protege par le token (et le code).
  /^\/api\/prescriptions\/[^/]+\/formulaire\/\d+(?:\/envoyer|\/fond\/\d+)?$/,
  // Suivi de dérive de déploiement (chantier 2026-08-10) :
  //  - POST : sonde deploy/deployment-probe.js des 3 VMs → API key (handler)
  //  - GET  : page /admin/deployments (session admin) OU daily-report (API key),
  //           auth mixte côté handler. Whitelisté car l'appel cron n'a pas de session.
  /^\/api\/deployments$/,
  // Appels signalés par les clients (lot 0 de l'amélioration continue, 28/10/2026) :
  // daily-report les lit chaque matin. Clé API SEULE côté handler
  // (DAILY_REPORT_API_KEY, lecture seule) : la liste couvre tout le parc.
  /^\/api\/incidents-signales$/,
  // Rapport hebdomadaire de Konnect (daily-report, DAILY_REPORT_API_KEY vérifiée dans le handler).
  /^\/api\/konnect-stats-hebdo$/,
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
  // Les cabinets que le Dashboard attend (lot 4E, 2026-09-15). Konnect tire cette
  // liste et cree les cabinets manquants lui-meme : c'est ainsi que l'identifiant de
  // cabinet nait ici sans que le Dashboard ait a appeler Konnect, ce qu'il ne peut
  // pas faire (VPN, decision du 2026-09-08).
  // Cle API SEULE cote handler, jamais une session : la liste couvre tout le parc,
  // et `requireAuthOrApiKey` l'ouvrirait a n'importe quel compte client.
  /^\/api\/konnect-tenants-attendus$/,
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
  // Demandes de rappel (2026-09-02) : la PREMIERE des deux routes `konnect-*` ou
  // Konnect ECRIT, et la seule qui porte de la donnee patient. Il y depose la
  // demande d'un patient dont l'examen n'est pas reservable en ligne, pour que le
  // secretariat le rappelle. Lecture et mise a jour reservees a une session.
  // (Ce commentaire disait « la SEULE » jusqu'au 14/09/2026, ce que celui de
  // `konnect-remontee`, huit lignes plus bas, dementait deja.)
  /^\/api\/konnect-demandes-rappel$/,
  // Remontee d'etat (2026-09-08, lot E) : la SECONDE et derniere route ou Konnect
  // ECRIT. Il y depose ce qu'il observe et que le Dashboard ne peut pas deduire
  // (canaux d'envoi reellement en service, agregats de parcours). Konnect passe
  // derriere un VPN : le Dashboard ne peut pas aller le lire, d'ou ce push.
  // Aucune configuration ni donnee patient n'entre par la. Lecture par session.
  /^\/api\/konnect-remontee$/,
  // File d'attente (2026-10-27) : le QUATRIEME flux montant, et le seul ou Konnect
  // relit ce qu'il a ecrit. La file ne vit qu'ici ; Konnect y inscrit le patient, la
  // relit a chaque passage de son moteur et y demande chaque changement d'etat.
  // Donnee patient. L'ecran (`/ecran`) reste derriere la session.
  /^\/api\/konnect-file-attente$/,
  /^\/api\/konnect-file-attente\/transition$/,
  // Logo du cabinet (2026-09-09) : Konnect TIRE le binaire et le sert ensuite depuis
  // sa propre origine. Il ne peut pas faire autrement, la CSP de son iframe est
  // `img-src 'self'` : une image servie par le Dashboard serait bloquee dans le
  // navigateur du patient. Lecture par cle, depot et retrait reserves a une session.
  /^\/api\/konnect-logo$/,
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Les routes que la session ne regarde pas : la connexion, et les routes à clé ou à
 * jeton patient, que le handler protège seul. Un compte interne n'en a pas besoin,
 * sauf la connexion ; elles restent refusées s'il n'en a pas la page.
 */
function isPublicApiPourInterne(pathname: string): boolean {
  return /^\/api\/auth(\/|$)/.test(pathname);
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
  /^\/api\/prescriptions\/[^/]+\/modele\/\d+\/?$/, // GET modele d'un document demande (via token)
  /^\/api\/prescriptions\/[^/]+\/formulaire\/\d+(?:\/envoyer|\/fond\/\d+)?\/?$/, // questionnaire en ligne (via token + code)
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

  // ---- Pilot, CRM interne, sur son propre hôte (pilote.dashboard.neuracorp.ai) ----
  // Même process, même base, même session : l'hôte ne sert que Pilot et ce qu'il
  // partage avec le Dashboard (connexion, cloche, fichiers). Tout le reste renvoie
  // au Dashboard, pour qu'une adresse /admin tapée sur pilote ne montre rien.
  const surPilot = estHotePilot(host);
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || req.nextUrl.protocol.replace(/:$/, '');
  // L'adresse publique de la requête : derrière nginx, `req.url` peut porter l'hôte
  // d'écoute (127.0.0.1:3000) et non celui que le navigateur a demandé.
  const basePublique = origineDe(proto, req.headers.get('x-forwarded-host') ?? req.headers.get('host')) ?? req.url;
  if (surPilot) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/pilot', basePublique));
    }
    if (!estCheminPilot(pathname) && !partageSurPilot(pathname)) {
      if (pathname.startsWith('/api/')) return new NextResponse('Not Found', { status: 404 });
      const dashboard = process.env.NEXT_PUBLIC_DASHBOARD_URL;
      if (dashboard) return NextResponse.redirect(new URL(pathname + req.nextUrl.search, dashboard));
      return new NextResponse('Not Found', { status: 404 });
    }
  } else if (/^\/pilot(\/|$)/.test(pathname) && process.env.NEXT_PUBLIC_PILOT_URL) {
    // Sur l'hôte du Dashboard, les pages de Pilot s'ouvrent sur le leur. En local
    // (variable vide), elles restent sur localhost:3000/pilot.
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, process.env.NEXT_PUBLIC_PILOT_URL));
  } else if (/^\/api\/pilot(\/|$)/.test(pathname) && process.env.NEXT_PUBLIC_PILOT_URL) {
    // L'API de Pilot ne répond que sur son hôte, donc dans son propre processus
    // (deploy/ecosystem.config.js) : le processus du Dashboard ne l'exécute jamais.
    return new NextResponse('Not Found', { status: 404 });
  }

  // Les écrans de l'admin passés dans Pilot le 23/11/2026 : les anciens liens et favoris
  // y mènent par une vraie redirection (les pages gardent un redirect() en secours).
  const DEMENAGES: Record<string, string> = {
    '/admin/parc': '/pilot/parc-clients',
    '/admin/deployments': '/pilot/versions',
    '/admin/facturation': '/pilot/facturation',
  };
  const demenage = DEMENAGES[pathname.replace(/\/+$/, '')];
  if (demenage) {
    return NextResponse.redirect(new URL(demenage, process.env.NEXT_PUBLIC_PILOT_URL || basePublique));
  }

  // Les écrans de l'admin réunis le 27/11/2026 (plan lyrae/plans/2026-11-separation-dashboard-pilot.md) :
  // le paramétrage d'un centre en une page à onglets, les comptes clients en une page.
  const REUNIS: Record<string, string> = {
    '/admin/talk-installation': '/admin/parametrage?onglet=talk',
    '/admin/talk-config': '/admin/parametrage?onglet=robot',
    '/admin/konnect-installation': '/admin/parametrage?onglet=konnect',
    '/admin/external-mapping': '/admin/parametrage?onglet=identifiants',
    '/admin/pack': '/admin/parametrage?onglet=pack',
    '/admin/manage-clients': '/admin/comptes',
    '/admin/users': '/admin/comptes',
    '/admin/reports': '/admin/comptes',
    '/admin/actions': '/admin/comptes',
    '/admin/create-client': '/admin/nouveau-centre',
    '/admin/settings': '/admin',
  };
  const reuni = REUNIS[pathname.replace(/\/+$/, '')];
  if (reuni) {
    return NextResponse.redirect(new URL(reuni, basePublique));
  }

  // Une requête d'API de Pilot qui modifie et vient d'une autre origine est refusée
  // (garde du lot T de Pilot) : une page tierce ne fait rien faire avec le cookie.
  if (pathname.startsWith('/api/pilot/') && origineRefusee({
    methode: req.method, chemin: pathname, origine: req.headers.get('origin'),
    attendues: [
      req.nextUrl.origin,
      origineDe(proto, req.headers.get('host')),
      origineDe(proto, req.headers.get('x-forwarded-host')),
    ],
  })) {
    return NextResponse.json({ erreur: 'Origine refusée.' }, { status: 403 });
  }

  const token = await getToken({ req, secret: process.env.JWT_SECRET, cookieName: nomCookieSession() });

  // ---- Lecture seule des comptes internes (ADMIN) ----
  // Vérifié AVANT les routes publiques : certaines (sms-confirmation-config,
  // configuration…) acceptent aussi une session et écrivent de la configuration.
  // Un appel machine n'a pas de session, il n'est pas concerné.
  if (token?.id && token.role === 'ADMIN' && ecritureRefuseeAuxAdmin(req.method, pathname)) {
    return NextResponse.json({ error: MESSAGE_LECTURE_SEULE, erreur: MESSAGE_LECTURE_SEULE }, { status: 403 });
  }

  // ---- Comptes internes (ADMIN) : seulement ce qui leur est coché (24/11/2026) ----
  // Refus par défaut, pages ET routes d'API : l'écran Équipe de Pilot coche, écran par
  // écran, ce qu'un compte de l'équipe ouvre au Dashboard (src/lib/accesInternes.ts).
  // Sans rien de coché, il n'a que Pilot. Les gardes de chaque écran (menu, layout,
  // PageAccessGuard) le redisent ; celle-ci est la seule qui protège les données.
  if (token?.id && token.role === 'ADMIN' && !estCheminPilot(pathname)) {
    const acces = lireAccesInternes(token.permissions);
    if (pathname.startsWith('/api/')) {
      if (!isPublicApiPourInterne(pathname) && !apiPermiseAInterne(pathname, acces)) {
        return NextResponse.json({ error: MESSAGE_ACCES_INTERNE, erreur: MESSAGE_ACCES_INTERNE }, { status: 403 });
      }
    } else if (/^\/(admin|client)(\/|$)/.test(pathname)) {
      const versPilot = new URL('/pilot', process.env.NEXT_PUBLIC_PILOT_URL || basePublique);
      if (!ouvreLeDashboard(acces)) return NextResponse.redirect(versPilot);
      const racineAdmin = /^\/admin\/?$/.test(pathname);
      if (!racineAdmin) {
        const verdict = verdictAcces(pathname);
        const sujet = { role: 'ADMIN', permissions: token.permissions };
        const ouvert =
          verdict.genre === 'exempt' ||
          verdict.genre === 'inconnu' || // l'écran le refuse lui-même (PageAccessGuard)
          (verdict.genre === 'admin' && peutOuvrirAdmin(sujet, verdict.cle)) ||
          (verdict.genre === 'page' && hasPermission(sujet, verdict.page, 'read'));
        if (!ouvert) return NextResponse.redirect(new URL('/admin', basePublique));
      }
    }
  }

  // ---- Pages de Pilot : comptes internes seulement ----
  if (/^\/pilot(\/|$)/.test(pathname)) {
    if (!token || !token.id) {
      const signInUrl = new URL('/authentication/signin', basePublique);
      signInUrl.searchParams.set('callbackUrl', pathname + req.nextUrl.search);
      return NextResponse.redirect(signInUrl);
    }
    if (token.role !== 'ADMIN' && token.role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/client', process.env.NEXT_PUBLIC_DASHBOARD_URL || basePublique));
    }
    // Le chemin demandé, pour qu'une page refusée par Pilot revienne ici (C-61).
    // Toujours réécrit : un client ne le choisit pas.
    const entetes = new Headers(req.headers);
    entetes.set(ENTETE_CHEMIN, pathname + req.nextUrl.search);
    return NextResponse.next({ request: { headers: entetes } });
  }

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

    // Le chemin demandé, pour la seconde garde de `src/app/admin/layout.tsx` (un layout
    // ne connaît pas son adresse). Toujours réécrit : un navigateur ne le choisit pas.
    if (pathname.startsWith('/admin')) {
      const entetes = new Headers(req.headers);
      entetes.set(ENTETE_CHEMIN_ADMIN, pathname);
      return NextResponse.next({ request: { headers: entetes } });
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
