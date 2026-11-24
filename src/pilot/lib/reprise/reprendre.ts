import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { ecartCompte, repriseCompte } from "@/pilot/lib/validation/reprise";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { evaluerSansEchouer } from "@/pilot/lib/checklist/evaluer";
import { EtapeAutomatiqueError } from "@/pilot/lib/checklist/cocher";
import { CHECKLIST, definitionEtape } from "@/pilot/lib/checklist/definition";
import { verifierCompte } from "@/pilot/lib/centres/rattacher";
import { verifierResponsables, verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { periodeSuiviRenforce } from "@/pilot/lib/integration/suiviRenforce";
import { debutDuJour } from "@/pilot/lib/dates";
import { LIBELLES } from "@/pilot/lib/pipeline";
import { compter } from "@/pilot/lib/texte";
import { geocoderApresCommit } from "@/pilot/lib/carte/localiser";
import { repartirEtapes } from "./regles";

/** Sérialise tout ce qui touche un même compte du Dashboard : reprise, écart, réaffichage. */
const VERROU_COMPTE = 72105;
const COMMENTAIRE_REPRISE = "Faite avant Pilot, déclarée à la reprise du parc.";
const CONCURRENCE = "Ce compte vient d'être relié par quelqu'un d'autre. Rechargez la page.";

async function verrouillerCompte(tx: Prisma.TransactionClient, userId: number) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${VERROU_COMPTE}::integer, ${userId}::integer)`;
  const compte = await tx.user.findFirst({ where: { id: userId, role: "CLIENT" }, select: { id: true } });
  if (!compte) throw new ErreurMetier("Compte Dashboard inconnu.", 400);
}

/**
 * Relie un compte du Dashboard à Pilot en une transaction : le client (créé ou
 * existant), son centre (créé ou existant), un rattachement par accès produit,
 * et les étapes manuelles qu'un humain déclare faites avant Pilot (C-60).
 *
 * Pilot n'écrit rien au Dashboard : il lit `User` et `UserProduct`, et pose
 * `utilisateurId` sur sa propre table. Une étape automatique n'est jamais
 * déclarée : le registre de complétude la constate juste après, comme partout.
 */
export async function reprendreCompte(d: z.output<typeof repriseCompte>, auteurId: number) {
  const maintenant = new Date();
  if (d.miseEnServiceLe && debutDuJour(d.miseEnServiceLe) > debutDuJour(maintenant)) {
    throw new ErreurMetier("La date de mise en service ne peut pas être dans le futur.", 400);
  }
  if (d.etapesFaites.includes("PASSAGE_PRODUCTION") && !d.miseEnServiceLe) {
    throw new ErreurMetier("Indiquez la date de mise en service, même approximative.", 400);
  }
  let resultat: { organisationId: number; centreId: number; rattachements: number[] };
  try {
    resultat = await transactionJournalisee(async (tx) => {
      await verrouillerCompte(tx, d.userId);
      if (await tx.crmCompteEcarte.findUnique({ where: { userId: d.userId }, select: { id: true } })) {
        throw new ErreurMetier("Ce compte est écarté. Réaffichez-le avant de le relier.", 409);
      }
      const ids = [...new Set(d.userProductIds)];
      const acces = await tx.userProduct.findMany({ where: { id: { in: ids } }, include: { product: { select: { name: true } } }, orderBy: { id: "asc" } });
      if (acces.length !== ids.length || acces.some((a) => a.userId !== d.userId)) {
        throw new ErreurMetier("Ce produit n'appartient pas à ce compte Dashboard.", 400);
      }
      const produits = acces.map((a) => a.product.name);
      const { parProduit, automatiques, sansObjet } = repartirEtapes(d.etapesFaites, produits);
      if (automatiques.length) throw new EtapeAutomatiqueError(automatiques[0]);
      if (sansObjet.length) {
        const libelles = sansObjet.map((cle) => CHECKLIST.find((e) => e.cle === cle)?.libelle ?? cle);
        throw new ErreurMetier(`Étape sans objet pour ces produits : ${libelles.join(", ")}.`, 400);
      }

      // Le client : une fiche par compte du Dashboard (C-28).
      const deja = await tx.crmOrganisation.findFirst({ where: { utilisateurId: d.userId }, select: { id: true, raisonSocialeNom: true } });
      let organisationId: number;
      if (d.organisation.mode === "creer") {
        const { mode: _mode, ...identite } = d.organisation;
        if (deja) throw new ErreurMetier(`Ce compte est déjà relié à ${deja.raisonSocialeNom}.`, 409);
        await verifierResponsables(tx, identite);
        const homonyme = await tx.crmOrganisation.findFirst({ where: { raisonSocialeNom: { equals: identite.raisonSocialeNom, mode: "insensitive" } }, select: { id: true } });
        if (homonyme) throw new ErreurMetier("Un client porte déjà ce nom. Reliez plutôt le compte à ce client.", 409);
        const organisation = await tx.crmOrganisation.create({ data: { ...identite, utilisateurId: d.userId, etapeDepuisLe: maintenant } });
        organisationId = organisation.id;
        await journaliser(tx, { type: "ORGANISATION_CREEE", organisationId, auteurId,
          resume: `Fiche créée à la reprise du parc : ${LIBELLES[organisation.etape]}`,
          apres: { type: organisation.type, etape: organisation.etape, responsableId: organisation.responsableId,
            chefDeProjetId: organisation.chefDeProjetId, utilisateurId: d.userId } });
      } else {
        organisationId = d.organisation.organisationId;
        await verrouillerOrganisation(tx, organisationId);
        const organisation = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: { utilisateurId: true } });
        if (organisation.utilisateurId !== null && organisation.utilisateurId !== d.userId) {
          throw new ErreurMetier("Ce client a déjà un autre compte sur le Dashboard.", 400);
        }
        if (deja && deja.id !== organisationId) throw new ErreurMetier(`Ce compte est déjà relié à ${deja.raisonSocialeNom}.`, 409);
        if (organisation.utilisateurId === null) {
          await tx.crmOrganisation.update({ where: { id: organisationId }, data: { utilisateurId: d.userId } });
          await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId, auteurId, resume: "Compte Dashboard relié à la reprise du parc",
            avant: { utilisateurId: null }, apres: { utilisateurId: d.userId } });
        }
      }

      // Le centre.
      let centre: { id: number; nom: string };
      if (d.centre.mode === "creer") {
        const { mode: _mode, ...champs } = d.centre;
        if (await tx.crmCentre.findFirst({ where: { organisationId, nom: champs.nom }, select: { id: true } })) {
          throw new ErreurMetier("Un centre porte déjà ce nom chez ce client. Choisissez-le dans la liste.", 409);
        }
        const cree = await tx.crmCentre.create({ data: { ...champs, organisationId } });
        centre = cree;
        await journaliser(tx, { type: "CENTRE_CREE", organisationId, centreId: cree.id, auteurId, resume: `Centre créé : ${cree.nom}`,
          apres: { nom: cree.nom, codeSite: cree.codeSite, ville: cree.ville } });
      } else {
        const trouve = await tx.crmCentre.findUnique({ where: { id: d.centre.centreId }, select: { id: true, nom: true, organisationId: true } });
        if (!trouve || trouve.organisationId !== organisationId) throw new ErreurMetier("Ce centre appartient à un autre client.", 400);
        centre = trouve;
      }

      // Un rattachement par accès, puis les étapes déclarées faites avant Pilot.
      const presents = new Set((await tx.crmCentreProduit.findMany({ where: { centreId: centre.id }, select: { productId: true } })).map((r) => r.productId));
      const faiteLe = d.miseEnServiceLe ?? maintenant;
      const rattachements: number[] = [];
      for (const a of acces) {
        if (presents.has(a.productId)) throw new ErreurMetier(`Le centre ${centre.nom} a déjà ${a.product.name}.`, 409);
        await verifierCompte(tx, a.productId, a.id, organisationId);
        const etapes = parProduit.get(a.product.name) ?? [];
        // Comme au cochage : le passage déclaré ouvre le suivi renforcé, ici à la
        // date réelle. Pour un centre en service depuis des mois, il est déjà clos.
        const suivi = etapes.includes("PASSAGE_PRODUCTION") ? periodeSuiviRenforce(faiteLe) : {};
        const r = await tx.crmCentreProduit.create({ data: { centreId: centre.id, productId: a.productId, userProductId: a.id, ...suivi } });
        rattachements.push(r.id);
        await journaliser(tx, { type: "RATTACHEMENT_CREE", organisationId, centreId: centre.id, centreProduitId: r.id, auteurId,
          resume: `Produit ajouté : ${a.product.name} · ${centre.nom}`, apres: { productId: a.productId, userProductId: a.id, datePromise: null } });
        if (etapes.length) {
          await tx.crmEtapeIntegration.createMany({ skipDuplicates: true, data: etapes.map((cle) => ({
            centreId: centre.id, productId: a.productId, cle, mode: definitionEtape(cle).mode, faite: true, faiteLe, auteurId, commentaire: COMMENTAIRE_REPRISE,
          })) });
        }
        // Un seul événement pour l'historique déclaré : il ne compte pas comme des
        // cochages du jour, et les durées mesurées plus tard (C-20) l'excluent.
        await journaliser(tx, { type: "COMPTE_REPRIS", organisationId, centreId: centre.id, centreProduitId: r.id, auteurId,
          resume: `Reprise du parc : ${centre.nom} · ${a.product.name}${etapes.length ? `, ${compter(etapes.length, "étape faite", "étapes faites")} avant Pilot` : ""}`,
          apres: { userProductId: a.id, etapes, faiteLe: etapes.length ? faiteLe : null, ...suivi } });
      }
      return { organisationId, centreId: centre.id, rattachements };
    });
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") throw new ErreurMetier(CONCURRENCE, 409);
    throw erreur;
  }
  // Après le commit, comme pour tout rattachement : le registre coche les étapes
  // automatiques et crée les cases restantes, ouvertes. Une panne ne défait rien.
  for (const id of resultat.rattachements) await evaluerSansEchouer(id);
  // Un centre créé ici est géocodé après le commit, sans faire attendre (lot U).
  if (d.centre.mode === "creer") geocoderApresCommit([resultat.centreId]);
  return resultat;
}

/** Écarte un compte qui n'est pas un client : démonstration, entraînement, test. */
export async function ecarterCompte({ userId, raison, precision }: z.output<typeof ecartCompte>, auteurId: number) {
  try {
    return await transactionJournalisee(async (tx) => {
      await verrouillerCompte(tx, userId);
      const relie = await tx.crmOrganisation.findFirst({ where: { utilisateurId: userId }, select: { raisonSocialeNom: true } });
      if (relie) throw new ErreurMetier(`Ce compte est relié à ${relie.raisonSocialeNom}. Ajoutez ses produits à la fiche.`, 409);
      const ecart = await tx.crmCompteEcarte.create({ data: { userId, raison: precision ? `${raison} : ${precision}` : raison, auteurId } });
      // La précision reste dans la table : le journal ne garde que la catégorie.
      await journaliser(tx, { type: "COMPTE_ECARTE", auteurId, resume: `Compte Dashboard écarté : ${raison}`, apres: { userId, raison } });
      return ecart;
    });
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") throw new ErreurMetier("Ce compte est déjà écarté.", 409);
    throw erreur;
  }
}

export async function reafficherCompte(userId: number, auteurId: number) {
  return transactionJournalisee(async (tx) => {
    await verrouillerCompte(tx, userId);
    const { count } = await tx.crmCompteEcarte.deleteMany({ where: { userId } });
    if (!count) throw new ErreurMetier("Ce compte n'est pas écarté.", 404);
    await journaliser(tx, { type: "COMPTE_REAFFICHE", auteurId, resume: "Compte Dashboard réaffiché dans la reprise", apres: { userId } });
  });
}
