export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertUserProductOwnership } from "@/lib/auth-helpers";
import { compteDansLesIncomplets } from "@/lib/centreStatut";
import { lireEtEvaluer } from "@/lib/completude/lecture";

/**
 * Ce qui manque à un centre pour fonctionner (lot 2 du plan
 * `2026-09-completude-config-centres.md`).
 *
 *  GET /api/completude?userProductId=X
 *    → le détail d'un centre. Accessible à son client, qui ne reçoit QUE les
 *      informations dont il est propriétaire.
 *
 *  GET /api/completude
 *    → tout le parc, admin uniquement. Sert la colonne « Complétude » de
 *      `/admin/parc` et le compteur du bandeau.
 *
 * **La complétude est toujours calculée en entier**, quel que soit le statut du
 * centre : la page de parc a besoin de la progression d'un centre en
 * intégration, et le jour où il passe en production rien ne doit être
 * recalculé. C'est l'AFFICHAGE qui filtre selon le statut, pas cette route.
 *
 * **Le filtrage par rôle, lui, est ici et pas dans le bandeau.** La liste des
 * lacunes d'installation d'un centre n'a pas à transiter vers un poste client,
 * même si personne ne l'affiche.
 *
 * La lecture en base vit dans `src/lib/completude/lecture.ts`, partagée avec les
 * deux pages d'installation : une seule requête par produit dans tout le dépôt.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { session } = auth;

  const brut = new URL(req.url).searchParams.get("userProductId");
  const estAdmin =
    session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";

  // ── Vue d'ensemble : la page de parc ───────────────────────────────────────
  if (!brut) {
    if (!estAdmin) {
      return NextResponse.json(
        { error: "Précisez le centre à évaluer." },
        { status: 400 }
      );
    }
    const lignes = await lireEtEvaluer();
    return NextResponse.json({
      count: lignes.length,
      // Le détail des manques n'a pas d'usage ici et pèserait autant que le
      // parc compte de centres : on ne renvoie que les décomptes.
      rows: lignes.map((l) => ({
        userProductId: l.userProductId,
        userId: l.userId,
        clientNom: l.clientNom,
        produit: l.produit,
        statut: l.statut,
        bloquants: l.completude.bloquants,
        degrades: l.completude.degrades,
        total: l.completude.total,
        satisfaites: l.completude.satisfaites,
      })),
    });
  }

  // ── Détail d'un centre ─────────────────────────────────────────────────────
  const userProductId = Number(brut);
  if (!Number.isInteger(userProductId) || userProductId <= 0) {
    return NextResponse.json({ error: "userProductId invalide." }, { status: 400 });
  }

  if (!estAdmin) {
    const err = await assertUserProductOwnership(session, userProductId);
    if (err) return err;
  }

  const ligne = (await lireEtEvaluer(userProductId))[0];
  if (!ligne) {
    return NextResponse.json(
      { error: "Ce centre n'existe pas ou n'est plus rattaché à ce produit." },
      { status: 404 }
    );
  }

  // Un client ne reçoit que ce dont il est propriétaire. Filtrage serveur, pas
  // affichage : les lacunes d'installation ne descendent pas jusqu'à lui.
  const manques = estAdmin
    ? ligne.completude.manques
    : ligne.completude.manques.filter((m) => m.proprietaire === "client");

  // Le compteur ne sert qu'à l'administrateur, et ne compte que les centres en
  // production : un centre en intégration est incomplet par définition.
  let autresCentresIncomplets = 0;
  if (estAdmin) {
    const parc = await lireEtEvaluer();
    autresCentresIncomplets = parc.filter(
      (l) =>
        l.userProductId !== userProductId &&
        compteDansLesIncomplets(l.statut) &&
        l.completude.bloquants > 0
    ).length;
  }

  return NextResponse.json({
    userProductId: ligne.userProductId,
    userId: ligne.userId,
    produit: ligne.produit,
    statut: ligne.statut,
    manques,
    bloquants: manques.filter((m) => m.criticite === "bloquant").length,
    degrades: manques.filter((m) => m.criticite === "degrade").length,
    total: ligne.completude.total,
    satisfaites: ligne.completude.satisfaites,
    autresCentresIncomplets,
  });
}
