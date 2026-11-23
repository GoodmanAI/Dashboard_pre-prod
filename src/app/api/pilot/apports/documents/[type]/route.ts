import { NextResponse } from "next/server";
import { exiger, peutLirePilot } from "@/pilot/lib/autorisations";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { reponseErreur } from "@/pilot/lib/http";
import { utilisateurCourant } from "@/pilot/lib/session";
import { chargerApports, contexteDe } from "@/pilot/lib/apports/charger";
import { factureHtml, ficheSignalementHtml, nomFichier, syntheseCommissionsHtml, syntheseGroupesHtml, vueDepuis, type FiltreGroupes } from "@/pilot/lib/apports/documents";
import { STATUTS_COMMANDE, type StatutCommande } from "@/pilot/lib/apports/referentiel";
import { creerMoteur } from "@/pilot/lib/apports/calcul";

export const dynamic = "force-dynamic";

/** Les documents imprimables de l'apport d'affaires (CHOIX.md, C-63). */
export async function GET(requete: Request, { params }: { params: { type: string } }) {
  try {
    const u = await utilisateurCourant();
    exiger(peutLirePilot(u.role));
    const q = new URL(requete.url).searchParams;
    const options = { imprimer: q.get("imprimer") === "1" };
    if (!["fiche", "synthese-groupes", "synthese-commissions", "facture"].includes(params.type)) throw new ErreurMetier("Document inconnu.", 404);
    const d = await chargerApports();
    let html: string, nom: string;
    switch (params.type) {
      case "fiche": {
        const id = Number(q.get("organisationId"));
        if (!Number.isInteger(id) || id <= 0) throw new ErreurMetier("Groupe invalide.", 400);
        const g = d.groupes.find((x) => x.id === id);
        if (!g) throw new ErreurMetier("Ce client n'est pas suivi en apport d'affaires.", 404);
        html = ficheSignalementHtml(d, id, options); nom = nomFichier.fiche(g, d.aujourdhui);
        break;
      }
      case "synthese-groupes": {
        const statut = q.get("statut") || "all";
        if (statut !== "all" && !(STATUTS_COMMANDE as string[]).includes(statut)) throw new ErreurMetier("Statut invalide.", 400);
        const filtre: FiltreGroupes = { statut: statut as "all" | StatutCommande, recherche: (q.get("q") ?? "").slice(0, 200) };
        html = syntheseGroupesHtml(d, vueDepuis(d, q.get("apporteur")), filtre, options); nom = nomFichier.syntheseGroupes(filtre, d.aujourdhui);
        break;
      }
      case "synthese-commissions":
        html = syntheseCommissionsHtml(d, vueDepuis(d, q.get("apporteur")), options); nom = nomFichier.syntheseCommissions(d.aujourdhui);
        break;
      default: {
        const vue = vueDepuis(d, q.get("apporteur")), mois = q.get("mois") ?? "";
        if (vue === "tous") throw new ErreurMetier("Choisissez l'apporteur qui facture.", 400);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new ErreurMetier("Mois invalide.", 400);
        if (!d.apporteurs.find((a) => a.id === vue)?.commissionne) throw new ErreurMetier("Cet apporteur n'est pas commissionné : aucune facture.", 409);
        html = factureHtml(d, vue, mois, options);
        const f = creerMoteur(contexteDe(d)).facture(vue, mois);
        nom = nomFichier.facture(f?.numero || `${d.apporteurs.find((a) => a.id === vue)?.prefixeFacture ?? ""}${mois}`);
      }
    }
    const entetes: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
    if (q.get("telecharger") === "1") entetes["Content-Disposition"] = `attachment; filename="${nom.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
    return new NextResponse(html, { headers: entetes });
  } catch (erreur) { return reponseErreur(erreur); }
}
