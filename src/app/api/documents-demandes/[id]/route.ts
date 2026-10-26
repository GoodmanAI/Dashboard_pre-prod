export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertUserProductOwnership, requireAuth } from "@/lib/auth-helpers";
import { requireAnyPagePermission, requirePagePermission } from "@/lib/authGuards";
import { PAGES } from "@/lib/permissions";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";
import { normaliserTypesExamen } from "@/lib/piecesAttendues";
import {
  libelleValide,
  libelleXploreValide,
  proprietaireDocument,
} from "@/lib/documentsDemandesApi";

/**
 * PATCH /api/documents-demandes/[id]
 *
 * Partage des droits (DECISIONS.md du 11/10/2026) :
 *   - le CLIENT (proprietaire, droit d'ecriture du parametrage) ne change que
 *     `disponible`, l'interrupteur « Mis a disposition des patients » de
 *     LyraeTalk, `disponibleKonnect`, le meme pour Konnect (26/10/2026,
 *     plans/2026-10-konnect-questionnaires-centre.md), et
 *     `libelleXplore`, le libelle de la piece jointe dans son Xplore (19/10/2026,
 *     plans/2026-10-libelle-xplore-des-documents.md : Xplore renomme tout
 *     libelle absent de sa liste) ; chaine vide ou null => non renseigne ;
 *   - l'ADMIN change aussi `libelle`, `typesExamen`, `mineursSeulement`,
 *     `grossesseSeulement`, `ordre`, et archive (`archive: true`) ou restaure.
 *     Les deux criteres s'excluent : en allumer un eteint l'autre, envoyer les
 *     deux a vrai repond 400.
 * Un champ d'admin envoye par un client : 403, rien n'est ecrit.
 *
 * Droit d'ecriture : `disponible` et les champs d'admin demandent le
 * parametrage de LyraeTalk ; `disponibleKonnect`, celui de Konnect ;
 * `libelleXplore`, l'un ou l'autre.
 *
 * Un document archive n'est plus demande aux nouveaux liens ; les liens deja
 * envoyes gardent leur piece (et son libelle fige).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const id = Number(params.id);
  const userProductId = Number.isInteger(id) ? await proprietaireDocument(id) : null;
  if (userProductId === null) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }
  const ownErr = await assertUserProductOwnership(auth.session, userProductId);
  if (ownErr) return ownErr;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const champsKonnect = new Set(["disponibleKonnect", "libelleXplore"]);
  const pages = Object.keys(body).every((c) => champsKonnect.has(c))
    ? "disponibleKonnect" in body
      ? [PAGES.KONNECT_PARAMETRAGE]
      : [PAGES.PARAMETRAGE, PAGES.KONNECT_PARAMETRAGE]
    : null;
  const droitErr = pages
    ? await requireAnyPagePermission(pages, "write")
    : await requirePagePermission(PAGES.PARAMETRAGE, "write");
  if (droitErr) return droitErr;
  if ("disponibleKonnect" in body && Object.keys(body).some((c) => !champsKonnect.has(c))) {
    const konnectErr = await requirePagePermission(PAGES.KONNECT_PARAMETRAGE, "write");
    if (konnectErr) return konnectErr;
  }

  const estAdmin =
    auth.session.user.role === "ADMIN" || auth.session.user.role === "SUPER_ADMIN";
  const champsAdmin = [
    "libelle",
    "typesExamen",
    "mineursSeulement",
    "grossesseSeulement",
    "ordre",
    "archive",
  ];
  if (!estAdmin && champsAdmin.some((c) => c in body)) {
    return NextResponse.json(
      { error: "Seule l'équipe Lyrae modifie ce document. Vous pouvez le mettre à disposition ou non." },
      { status: 403 }
    );
  }

  const sets: string[] = [];
  const valeurs: unknown[] = [];
  const poser = (colonne: string, valeur: unknown, cast = "") => {
    valeurs.push(valeur);
    sets.push(`"${colonne}" = $${valeurs.length}${cast}`);
  };

  if ("disponible" in body) poser("disponible", body.disponible === true);
  if ("disponibleKonnect" in body) {
    poser("disponibleKonnect", body.disponibleKonnect === true);
  }
  if ("libelleXplore" in body) {
    const libelleXplore = libelleXploreValide(body.libelleXplore);
    if (libelleXplore === undefined) {
      return NextResponse.json(
        { error: "Le nom dans Xplore doit être un texte." },
        { status: 400 }
      );
    }
    poser("libelleXplore", libelleXplore);
  }
  if ("libelle" in body) {
    const libelle = libelleValide(body.libelle);
    if (!libelle) {
      return NextResponse.json({ error: "Le nom du document est vide." }, { status: 400 });
    }
    poser("libelle", libelle);
  }
  if ("typesExamen" in body) {
    const types = normaliserTypesExamen(body.typesExamen);
    if (types.length === 0) {
      return NextResponse.json({ error: "Cochez au moins un type d'examen." }, { status: 400 });
    }
    poser("typesExamen", JSON.stringify(types), "::jsonb");
  }
  if (body.mineursSeulement === true && body.grossesseSeulement === true) {
    return NextResponse.json(
      { error: "Un document vaut pour les mineurs ou pour les femmes de 12 à 55 ans, pas les deux. Créez deux documents." },
      { status: 400 }
    );
  }
  if ("mineursSeulement" in body) poser("mineursSeulement", body.mineursSeulement === true);
  if ("grossesseSeulement" in body) {
    poser("grossesseSeulement", body.grossesseSeulement === true);
  }
  // En allumer un eteint l'autre, sauf s'il est envoye dans la meme requete.
  if (body.mineursSeulement === true && !("grossesseSeulement" in body)) {
    poser("grossesseSeulement", false);
  }
  if (body.grossesseSeulement === true && !("mineursSeulement" in body)) {
    poser("mineursSeulement", false);
  }
  if ("ordre" in body && Number.isInteger(body.ordre)) poser("ordre", body.ordre);
  if ("archive" in body) {
    sets.push(body.archive === true ? `"archivedAt" = NOW()` : `"archivedAt" = NULL`);
    // Un document archive n'est plus propose : on coupe aussi l'interrupteur.
    if (body.archive === true) sets.push(`"disponible" = false`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });
  }

  valeurs.push(id);
  await db.query(
    `UPDATE "DocumentDemande" SET ${sets.join(", ")}, "updatedAt" = NOW()
      WHERE "id" = $${valeurs.length}`,
    valeurs
  );

  auditLog("data", "document-demande-modification", {
    actor: {
      id: auth.session.user.id,
      email: auth.session.user.email ?? null,
      role: auth.session.user.role,
      ip: extractIpFromRequest(req),
      userAgent: extractUserAgent(req),
    },
    target: { type: "userProduct", id: userProductId },
    metadata: { documentDemandeId: id, champs: Object.keys(body) },
  });

  return NextResponse.json({ ok: true });
}
