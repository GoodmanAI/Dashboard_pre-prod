export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { produitDepuisNom, type SlugProduit } from "@/lib/produits";
import { KONNECT_DEFAUTS, normaliserConfigKonnect, COLONNES_KONNECT } from "@/lib/konnectConfig";
import { DOMAINES } from "@/lib/productConfig";
import type { Pack, PackTalk, PackKonnect, JourneeHoraire } from "@/lib/pack/types";

/**
 * GET /api/admin/pack?userId=NN — toute la configuration d'un centre, en une lecture.
 *
 * ## Pourquoi une route de plus
 *
 * L'export d'un pack demanderait sinon onze appels depuis le navigateur, dont cinq à
 * des routes gardées par une page différente, et l'import en demanderait autant pour
 * savoir ce qui change. Cette route rassemble la lecture ; **elle n'écrit rien**, et
 * l'écriture reste éclatée entre les routes qui la faisaient déjà, chacune avec sa
 * garde. C'est la même règle que pour l'assistant de mise en service.
 *
 * ## Elle est en lecture seule ET réservée à l'administration
 *
 * Un pack traverse les deux produits et agrège des surfaces qu'un sous-compte ne voit
 * pas forcément. Plutôt que de recomposer ici une grille de droits page par page, ce
 * qui la dupliquerait, on exige le rôle : dupliquer un centre est un geste d'admin.
 *
 * ## Ce qu'elle refuse de lire, et c'est le cœur du lot
 *
 * `cloudOcrActif` (un consentement), l'identifiant de cabinet du portail, le
 * rattachement au logiciel du centre, les codes du centre, `reconnaissance`,
 * `serviceEnabled`, le statut du centre, le logo, et toute donnée patient. Voir
 * `src/lib/pack/types.ts` pour le pourquoi de chaque exclusion.
 */

/** Les domaines `ProductConfig` que le pack transporte : ceux du portail, sauf l'identité. */
const DOMAINES_PACK = Object.values(DOMAINES)
  .filter((d) => d.produit === "konnect" && d.cle !== "konnect.ris-identite")
  .map((d) => d.cle);

function objet(v: unknown): Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

function tableau(v: unknown): Record<string, any>[] {
  return Array.isArray(v) ? (v as Record<string, any>[]) : [];
}

/** Les sept jours, même forme que l'écran de paramétrage : `enabled` + `ranges`. */
function horaires(v: unknown): Record<string, JourneeHoraire> {
  const brut = objet(v);
  const sortie: Record<string, JourneeHoraire> = {};
  for (const [jour, valeur] of Object.entries(brut)) {
    const j = objet(valeur);
    sortie[jour] = {
      enabled: j.enabled === true,
      ranges: tableau(j.ranges)
        .map((p) => ({ start: String(p?.start ?? ""), end: String(p?.end ?? "") }))
        .filter((p) => p.start !== "" && p.end !== ""),
    };
  }
  return sortie;
}

async function lireTalk(userProductId: number): Promise<PackTalk> {
  const [settings, infos, faq, sms] = await Promise.all([
    prisma.talkSettings.findUnique({ where: { userProductId } }),
    prisma.talkInformationSettings.findUnique({ where: { userProductId } }),
    prisma.moduleInfoItem.findMany({
      where: { userProductId },
      select: { question: true, reponse: true, categorie: true, enabled: true },
      orderBy: { id: "asc" },
    }),
    db.query<{
      enabledExamTypes: unknown;
      postesByType: unknown;
      reminderDays: number | null;
      cutoffHours: number | null;
      sendConfirmationSms: boolean | null;
    }>(
      `SELECT "enabledExamTypes", "postesByType", "reminderDays", "cutoffHours", "sendConfirmationSms"
         FROM "SmsConfirmationConfig" WHERE "userProductId" = $1 LIMIT 1`,
      [userProductId]
    ),
  ]);

  const o = objet(settings?.options);
  return {
    userProductId,
    centerName: settings?.centerName ?? null,
    address: settings?.address ?? null,
    address2: settings?.address2 ?? null,
    centerPhone: settings?.centerPhone ?? null,
    centerMail: settings?.centerMail ?? null,
    centerWebsite: settings?.centerWebsite ?? null,
    voice: settings?.voice ?? null,
    botName: settings?.botName ?? null,
    welcomeMsg: settings?.welcomeMsg ?? null,
    emergencyOutOfHours: settings?.emergencyOutOfHours ?? null,
    callMode: settings?.callMode ?? null,
    specificNotes: settings?.specificNotes ?? null,
    // ⚠️ `options` est lu EN ENTIER, `serviceEnabled` compris, et c'est délibéré.
    // L'écrire remplace la colonne JSON entière : sans cette lecture, l'import
    // effacerait l'interrupteur qui décide si le robot décroche. Le classeur, lui,
    // n'en expose que trois clés.
    options: o,
    reconnaissance: settings?.reconnaissance === true,
    examsAccepted: objet(settings?.examsAccepted) as Record<string, boolean>,
    fullPlanningNotes: objet(settings?.fullPlanningNotes),
    multiExamMapping: objet(settings?.multiExamMapping),
    weeklyHours: horaires(infos?.weeklyHours),
    exams: tableau(settings?.exams),
    faq: faq.map((f) => ({
      question: f.question,
      reponse: f.reponse,
      categorie: f.categorie ?? null,
      enabled: f.enabled,
    })),
    sms:
      (sms.rowCount ?? 0) === 0
        ? null
        : {
            enabledExamTypes: sms.rows[0].enabledExamTypes,
            postesByType: sms.rows[0].postesByType,
            reminderDays: sms.rows[0].reminderDays,
            cutoffHours: sms.rows[0].cutoffHours,
            sendConfirmationSms: sms.rows[0].sendConfirmationSms === true,
          },
  };
}

async function lireKonnect(userProductId: number): Promise<PackKonnect> {
  const colonnes = COLONNES_KONNECT.map((c) => `"${c}"`).join(", ");
  const [parametres, sites, examens, domaines] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT ${colonnes} FROM "KonnectSettings" WHERE "userProductId" = $1 LIMIT 1`,
      [userProductId]
    ),
    db.query<{ siteId: string; libelle: string; codePostal: string; adresse: string }>(
      `SELECT "siteId", "libelle", "codePostal", "adresse"
         FROM "KonnectSites" WHERE "userProductId" = $1 ORDER BY "siteId"`,
      [userProductId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT "codeExamen", "typeExamen", "libelle", "codeExamenClient",
              "codeExamenInjection", "typeExamenClient", "libelleClient",
              "performed", "reservableEnLigne", "ordoOblig", "examenInjecte"
         FROM "KonnectExamens" WHERE "userProductId" = $1 ORDER BY "codeExamen"`,
      [userProductId]
    ),
    db.query<{ domaine: string; valeur: unknown }>(
      `SELECT "domaine", "valeur" FROM "ProductConfig"
        WHERE "userProductId" = $1 AND "domaine" = ANY($2::text[])`,
      [userProductId, DOMAINES_PACK]
    ),
  ]);

  const config =
    (parametres.rowCount ?? 0) === 0
      ? { ...KONNECT_DEFAUTS }
      : normaliserConfigKonnect(parametres.rows[0]);

  // ⚠️ Le consentement à la lecture des ordonnances par un prestataire ne quitte pas
  // la base. Il se donne par un cabinet, pour lui-même ; un tableur qui le porterait
  // ferait consentir un centre à la place d'un autre.
  const { cloudOcrActif: _consentement, ...sansConsentement } = config as Record<string, unknown>;

  const parDomaine: Record<string, Record<string, unknown>> = {};
  for (const l of domaines.rows) parDomaine[l.domaine] = objet(l.valeur);

  return {
    userProductId,
    parametres: sansConsentement,
    sites: sites.rows,
    examens: examens.rows as PackKonnect["examens"],
    domaines: parDomaine,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  const userId = Number(new URL(req.url).searchParams.get("userId"));
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "userId manquant ou invalide" }, { status: 400 });
  }

  const client = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      userProducts: {
        where: { removedAt: null },
        select: { id: true, product: { select: { name: true } } },
      },
    },
  });

  if (!client || client.role !== "CLIENT") {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const affiliations = new Map<SlugProduit, number>();
  for (const p of client.userProducts) {
    // `produitDepuisNom` est le seul endroit qui connaît les noms de produits : les
    // comparer en dur ici les rendrait renommables sans erreur de compilation.
    const produit = produitDepuisNom(p.product?.name);
    if (produit) affiliations.set(produit.slug, p.id);
  }

  const idTalk = affiliations.get("talk");
  const idKonnect = affiliations.get("konnect");

  const pack: Pack = {
    centre: { userId: client.id, nom: client.name, identifiant: client.email },
    genereLe: new Date().toISOString(),
    talk: idTalk ? await lireTalk(idTalk) : null,
    konnect: idKonnect ? await lireKonnect(idKonnect) : null,
  };

  return NextResponse.json(pack);
}
