export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { postAi2x, tunnelActif, TunnelInjoignable } from "@/lib/ai2xTunnel";
import { lireReleve } from "@/lib/konnectSalles";

/**
 * POST /api/admin/salles/releve  { codeSite } → { codeSite, salles: [{ poste, libelle, type }] }
 *
 * Le bouton « Relever depuis Xplore » de l'écran « Salles et facturation » : AI2Xplore
 * lit `GetInfos` de la base du site (`POST /api/test/salles`, par le tunnel) et rend
 * `paramsRVE.postesOpenRVE`. Le type de chaque salle est deviné d'après son code
 * (`lireReleve`, le même que le collage) ; rien n'est enregistré ici, l'admin relit et
 * enregistre. Admin seul.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const adminErr = requireAdmin(auth.session);
  if (adminErr) return adminErr;

  if (!tunnelActif()) {
    return NextResponse.json(
      { error: "Le relevé automatique n'est pas branché sur ce serveur. Collez la liste des salles à la place." },
      { status: 503 }
    );
  }

  const corps = await req.json().catch(() => null);
  const codeSite = typeof corps?.codeSite === "string" ? corps.codeSite.trim().toUpperCase() : "";
  if (!codeSite || codeSite.length > 20) {
    return NextResponse.json({ error: "Choisissez le site à relever." }, { status: 400 });
  }

  try {
    const { status, corps: rep } = await postAi2x("/api/test/salles", { codeSite });
    if (status === 429) {
      return NextResponse.json({ error: "Trop de relevés en une minute. Réessayez dans un instant." }, { status: 429 });
    }
    if (status !== 200 || !Array.isArray(rep?.data?.postes)) {
      console.warn("[admin/salles/releve] réponse inattendue", status, rep?.error ?? null);
      return NextResponse.json(
        { error: `Xplore n'a pas rendu les salles du site ${codeSite}. Vérifiez le code du site, ou collez la liste.` },
        { status: 502 }
      );
    }
    const salles = lireReleve((rep.data.postes as unknown[]).filter((p) => typeof p === "string").join(";"));
    return NextResponse.json({ codeSite, salles });
  } catch (e) {
    if (e instanceof TunnelInjoignable) {
      return NextResponse.json(
        { error: "La passerelle ne répond pas. Réessayez dans un instant, ou collez la liste des salles." },
        { status: 502 }
      );
    }
    throw e;
  }
}
