import type { z } from "zod";
import type { statutProposition } from "@/pilot/lib/validation/proposition";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { debutDuJour } from "@/pilot/lib/dates";
import { chargerSousVerrou, ecrireConditionnellement, exigerVersionEnAttente, inclureLignes, journaliserStatut, verifierTransition, transactionProposition } from "./commun";
import { MESSAGE_VERSION_REMPLACEE_REPONDRE } from "./regles";
import { estAChiffrer, messageAChiffrer } from "./affichage";

export async function changerStatut(id: number, donnees: z.output<typeof statutProposition>, auteurId: number) {
  return transactionProposition(async (tx) => {
    const p = await chargerSousVerrou(tx, id);
    const { vers, valideJusquAu, documentUrl, reponseClient } = donnees;
    if (vers === "ACCEPTEE") throw new ErreurMetier("Utilisez l'acceptation pour créer le contrat.", 400);
    verifierTransition(p, vers);
    // La réponse du client porte sur la version qui l'attend : une ancienne version remplacée ne se refuse ni ne se discute.
    // L'expiration reste possible : elle constate une date, pas une réponse.
    if (vers === "EN_DISCUSSION" || vers === "REFUSEE") await exigerVersionEnAttente(tx, p, MESSAGE_VERSION_REMPLACEE_REPONDRE);
    const maintenant = new Date();
    if (vers === "ENVOYEE") {
      if (!p.lignes.length) throw new ErreurMetier("Ajoutez au moins une ligne avant l'envoi.", 400);
      // Une ligne à 0 qui n'est pas offerte attend son prix (lot S) : elle ne part pas chez le client.
      // La part à l'usage à 0 (volume inclus) et une ligne offerte à 0 sont des choix (`estAChiffrer`).
      const aChiffrer = p.lignes.filter(estAChiffrer).length;
      if (aChiffrer) throw new ErreurMetier(messageAChiffrer(aChiffrer), 400);
      if (!valideJusquAu || valideJusquAu < debutDuJour(maintenant)) throw new ErreurMetier("La validité doit être aujourd'hui ou plus tard.", 400);
    } else if (valideJusquAu !== undefined) {
      throw new ErreurMetier("Une proposition envoyée ne change plus. Créez une nouvelle version.", 400);
    }
    await ecrireConditionnellement(tx, p, { statut: vers, documentUrl, reponseClient,
      ...(vers === "ENVOYEE" ? { envoyeeLe: maintenant, valideJusquAu } : {}),
      ...(vers === "REFUSEE" ? { repondueLe: maintenant } : {}) });
    await journaliserStatut(tx, p, vers, auteurId);
    return tx.crmProposition.findUniqueOrThrow({ where: { id }, include: inclureLignes });
  });
}
