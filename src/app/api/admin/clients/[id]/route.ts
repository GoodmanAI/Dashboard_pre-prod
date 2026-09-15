import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireSuperAdmin } from "@/lib/auth-helpers";
import { auditLog, extractIpFromRequest, extractUserAgent } from "@/lib/auditLog";

/**
 * DELETE /api/admin/clients/:id
 * ---------------------------------------------------------
 * Supprime un utilisateur CLIENT et ses données liées
 * (cascades gérés par Prisma : UserProduct, calls, tickets, etc).
 *
 * Double confirmation exigée côté appelant : le body doit contenir
 * `confirmName` égal au `User.name` stocké en BDD — protège contre
 * un DELETE accidentel par saisie d'URL.
 */
/**
 * Retire les deux CSV que la création du client avait déposés dans `public/upload/`.
 *
 * **Le défaut que ça referme** (constaté le 15/09/2026, en supprimant un centre d'essai).
 * `POST /api/admin/create-client` copie deux modèles nommés d'après le client. La
 * suppression du compte emportait bien les lignes en base, mais **pas les fichiers** :
 * ils restaient sur le disque, servis publiquement sous `/upload/…`, avec le nom du
 * client dans l'URL. Un client supprimé restait donc nommable par quiconque connaissait
 * l'adresse, et le dossier grossissait à chaque création.
 *
 * ⚠️ **Le nom de fichier vient du nom du client, qui n'est plus unique.** Deux homonymes
 * écrivent le même fichier, donc supprimer l'un retire celui de l'autre. Sans
 * conséquence : rien de fonctionnel ne lit ces CSV, ce sont des vestiges du premier
 * provisionnement, conservés parce que `LyraeTalkDetails` et `FileSubmission` y
 * renvoient. Le jour où ces vestiges partiront, ce bloc partira avec eux.
 *
 * **Non bloquant**, comme la copie qui l'a créé : le compte est déjà supprimé quand on
 * arrive ici, et échouer sur un fichier absent ferait répondre 500 pour une suppression
 * qui a réussi.
 */
async function retirerFichiersDuClient(nom: string | null): Promise<void> {
  if (!nom) return;
  const dossier = path.join(process.cwd(), "public", "upload");
  for (const fichier of [`talkInfo-${nom}.csv`, `talkLibeles-${nom}.csv`]) {
    try {
      await fs.unlink(path.join(dossier, fichier));
    } catch (err: any) {
      // `ENOENT` est le cas normal : un client sans LyraeTalk n'en a jamais eu.
      if (err?.code !== "ENOENT") {
        console.warn("[delete-client] fichier non retiré (vestige, sans effet) :", err);
      }
    }
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  // ⚠️ Relevé au SUPER_ADMIN le 15/09/2026. Supprimer un compte client existait à DEUX
  // endroits avec DEUX gardes différentes pour le même effet : ici en ADMIN avec un nom
  // à confirmer, et `DELETE /api/admin/users/:id` en SUPER_ADMIN sans confirmation.
  //
  // C'est la garde la plus faible qui comptait, puisqu'un ADMIN pouvait supprimer un
  // client par cette route-ci. Or créer un client est réservé au SUPER_ADMIN
  // (`/api/admin/create-client`) : pouvoir supprimer ce qu'on ne peut pas créer était
  // l'asymétrie à refermer. La confirmation par le nom, elle, est conservée : elle
  // protège d'un `DELETE` tapé à la main, ce que le rôle ne fait pas.
  const superErr = requireSuperAdmin(auth.session);
  if (superErr) return superErr;

  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const confirmName: string | undefined = body?.confirmName;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  // Garde-fou : on ne supprime pas un ADMIN via cet endpoint
  if (user.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Seuls les comptes CLIENT peuvent être supprimés via cette action." },
      { status: 403 }
    );
  }

  // Double confirmation : le nom saisi doit matcher exactement
  if (!confirmName || confirmName !== user.name) {
    return NextResponse.json(
      { error: "Confirmation manquante ou incorrecte (nom du client à saisir)." },
      { status: 400 }
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
    await retirerFichiersDuClient(user.name);
    auditLog("account", "delete-client", {
      actor: {
        id: auth.session.user.id,
        email: auth.session.user.email ?? null,
        role: auth.session.user.role,
        ip: extractIpFromRequest(req),
        userAgent: extractUserAgent(req),
      },
      target: { type: "user", id: user.id, label: user.email },
      metadata: { name: user.name },
    });
    return NextResponse.json(
      { success: true, deleted: { id: user.id, name: user.name, email: user.email } },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("DELETE /api/admin/clients/[id] error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression.", details: err.message },
      { status: 500 }
    );
  }
}
