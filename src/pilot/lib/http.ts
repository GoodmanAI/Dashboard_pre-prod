import { NextResponse } from "next/server";
import { ErreurMetier } from "@/pilot/lib/erreurs";

/** Les erreurs inattendues restent visibles au serveur, sans être maquillées en 400. */
export function reponseErreur(erreur: unknown): NextResponse {
  if (erreur instanceof ErreurMetier) {
    return NextResponse.json({ erreur: erreur.message }, { status: erreur.statut });
  }
  throw erreur;
}
