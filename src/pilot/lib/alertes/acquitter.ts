import { prisma } from "@/pilot/lib/prisma";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { dansJours } from "@/pilot/lib/dates";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { chargerDonneesAlertes } from "./charger";
import { calculerAlertes, clesDuGroupe } from "./calculer";
import { LIBELLES_TYPES_ALERTE } from "./types";
import { compter } from "@/pilot/lib/texte";

export async function acquitterAlerte(p: { cleAlerte: string; organisationId: number; jusquAu: Date; raison: string }, auteurId: number) {
  const maintenant = new Date();
  if (!Number.isFinite(p.jusquAu.getTime()) || p.jusquAu < dansJours(maintenant, 1) || p.jusquAu >= dansJours(maintenant, 91)) {
    throw new ErreurMetier("Choisissez une date à partir de demain et au plus dans 90 jours.", 400);
  }
  const raison = p.raison.trim();
  if (!raison || raison.length > 500) throw new ErreurMetier("La raison est obligatoire et limitée à 500 caractères.", 400);
  return transactionJournalisee(async (tx) => {
    // Deux acquittements concurrents du même fait ne créent pas deux décisions.
    await verrouillerOrganisation(tx, p.organisationId);
    const { actives } = calculerAlertes(await chargerDonneesAlertes(maintenant, p.organisationId, tx), maintenant);
    // Une alerte affichée porte les signaux de sa cause (C-91) : on les reporte ensemble.
    const alerte = actives.find((a) => clesDuGroupe(a).includes(p.cleAlerte));
    if (!alerte) throw new ErreurMetier("Cette alerte n'existe plus.", 404);
    const cles = clesDuGroupe(alerte);
    const ecrits = [];
    for (const cleAlerte of cles) ecrits.push(await tx.crmAcquittement.create({ data: { cleAlerte, organisationId: p.organisationId, jusquAu: p.jusquAu, raison, auteurId } }));
    const acquittement = ecrits[0];
    const date = p.jusquAu.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
    const autres = cles.length > 1 ? `, avec ${compter(cles.length - 1, "autre signal", "autres signaux")} de la même cause` : "";
    await journaliser(tx, { type: "ALERTE_ACQUITTEE", organisationId: p.organisationId, auteurId,
      resume: `Alerte reportée jusqu'au ${date} : ${alerte.titre}${autres}`, apres: { cleAlerte: alerte.cle, cles, jusquAu: p.jusquAu } });
    return acquittement;
  });
}

export async function lever(acquittementId: number, auteurId: number) {
  const initial = await prisma.crmAcquittement.findUnique({ where: { id: acquittementId }, select: { organisationId: true } });
  if (!initial) throw new ErreurMetier("Acquittement inconnu.", 404);
  return transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, initial.organisationId);
    const maintenant = new Date();
    const a = await tx.crmAcquittement.findUnique({ where: { id: acquittementId } });
    if (!a) throw new ErreurMetier("Acquittement inconnu.", 404);
    if (a.jusquAu <= maintenant) throw new ErreurMetier("Cette alerte est déjà réactivée.", 409);
    const resultat = calculerAlertes(await chargerDonneesAlertes(maintenant, a.organisationId, tx), maintenant);
    const alerte = [...resultat.actives, ...resultat.acquittees].find((alerte) => clesDuGroupe(alerte).includes(a.cleAlerte));
    // Si le fait a disparu, la décision reste révocable. Le titre de repli vient
    // du code : ni la clé stockée ni la raison humaine ne passent dans le log.
    const type = (Object.keys(LIBELLES_TYPES_ALERTE) as Array<keyof typeof LIBELLES_TYPES_ALERTE>)
      .find((type) => a.cleAlerte.startsWith(`${type}-`));
    const titre = alerte?.titre ?? (type ? LIBELLES_TYPES_ALERTE[type] : "Alerte résolue");
    const ecriture = await tx.crmAcquittement.updateMany({ where: { id: a.id, jusquAu: a.jusquAu }, data: { jusquAu: maintenant } });
    if (ecriture.count !== 1) throw new ErreurMetier("Cette décision a changé. Rechargez la page.", 409);
    // Les signaux repliés sous la même alerte reviennent avec elle (C-91).
    const autres = alerte ? clesDuGroupe(alerte).filter((cle) => cle !== a.cleAlerte) : [];
    if (autres.length) await tx.crmAcquittement.updateMany({ where: { organisationId: a.organisationId, cleAlerte: { in: autres }, jusquAu: { gt: maintenant } },
      data: { jusquAu: maintenant } });
    await journaliser(tx, { type: "ALERTE_ACQUITTEE", organisationId: a.organisationId, auteurId,
      resume: `Alerte réactivée : ${titre}`, apres: { cleAlerte: a.cleAlerte, jusquAu: maintenant } });
    return { ...a, jusquAu: maintenant };
  });
}
