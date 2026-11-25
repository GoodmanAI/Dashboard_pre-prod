import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutModifierPilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { importerProspects, lireFichier } from "@/pilot/lib/import/prospects";

export const dynamic = "force-dynamic";
const TAILLE_MAX = 5 * 1024 * 1024;

/** Import de prospects depuis un .xlsx ou un .csv. `essai=1` : rien n'est écrit, le rapport dit ce qui le serait. */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutModifierPilot(utilisateur.role));
    const formulaire = await requete.formData().catch(() => null);
    const fichier = formulaire?.get("fichier");
    if (!(fichier instanceof File)) throw new ErreurMetier("Choisissez un fichier .xlsx ou .csv.", 400);
    if (!/\.(xlsx|xls|csv|txt)$/i.test(fichier.name)) throw new ErreurMetier("Le fichier doit être un .xlsx ou un .csv.", 400);
    if (fichier.size > TAILLE_MAX) throw new ErreurMetier("Le fichier dépasse 5 Mo.", 400);
    const feuille = lireFichier(Buffer.from(await fichier.arrayBuffer()), fichier.name);
    const rapport = await importerProspects(feuille, { auteurId: utilisateur.id, essai: formulaire?.get("essai") === "1" });
    return NextResponse.json({ rapport });
  } catch (erreur) { return reponseErreur(erreur); }
}
