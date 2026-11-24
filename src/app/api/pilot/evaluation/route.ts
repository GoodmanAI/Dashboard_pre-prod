import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/pilot/lib/session";
import { exiger, peutEvaluer } from "@/pilot/lib/autorisations";
import { evaluerParc } from "@/pilot/lib/checklist/evaluer";
import { reponseErreur } from "@/pilot/lib/http";

export async function POST() {
  try {
    const utilisateur = await utilisateurCourant();
    exiger(peutEvaluer(utilisateur));
    const comptes = await evaluerParc();
    return comptes.ignoree
      ? NextResponse.json({ ...comptes, erreur: "Une évaluation est déjà en cours." }, { status: 409 })
      : NextResponse.json(comptes);
  } catch (erreur) { return reponseErreur(erreur); }
}
