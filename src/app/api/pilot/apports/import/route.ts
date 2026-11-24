import { NextResponse } from "next/server";
import { exiger, peutExporter } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { utilisateurCourant } from "@/pilot/lib/session";
import { importerSauvegarde, lireSauvegarde } from "@/pilot/lib/apports/importer";
import { importCalculateur } from "@/pilot/lib/validation/apport";

const LIMITE = 5 * 1024 * 1024;
const FORMAT = "Collez la sauvegarde copiée depuis le calculateur (bouton « Copier toutes les données ») ou choisissez son fichier .json.";

/**
 * Importe la sauvegarde du calculateur des apporteurs (CHOIX.md, C-63). En
 * essai, rien n'est écrit : le rapport dit ce qui serait créé, rattaché ou
 * écarté. Réservé au super-administrateur, comme l'export.
 */
export async function POST(requete: Request) {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutExporter(utilisateur), "L'import est réservé aux administrateurs de Pilot.");
    if (Number(requete.headers.get("content-length") ?? 0) > LIMITE) throw new ErreurMetier("Sauvegarde trop lourde : 5 Mo au plus.", 400);
    const texte = await requete.text();
    if (new TextEncoder().encode(texte).length > LIMITE) throw new ErreurMetier("Sauvegarde trop lourde : 5 Mo au plus.", 400);
    let json: unknown;
    try { json = JSON.parse(texte); } catch { throw new ErreurMetier(FORMAT, 400); }
    const analyse = importCalculateur.safeParse(json);
    if (!analyse.success || analyse.data.donnees === undefined || analyse.data.donnees === null || analyse.data.donnees === "") throw new ErreurMetier(FORMAT, 400);
    const lue = lireSauvegarde(analyse.data.donnees);
    const rapport = await importerSauvegarde(lue, { essai: analyse.data.essai, auteurId: utilisateur.id });
    return NextResponse.json({ rapport });
  } catch (erreur) { return reponseErreur(erreur); }
}
