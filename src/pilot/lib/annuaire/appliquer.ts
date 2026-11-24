import { z } from "zod";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { champsChanges } from "@/pilot/lib/evenements/diff";
import { journaliser, transactionJournalisee } from "@/pilot/lib/evenements/journaliser";
import { geocoderApresCommit } from "@/pilot/lib/carte/localiser";
import { verrouillerOrganisation } from "@/pilot/lib/organisations/comptes";
import { formeJuridique, memeLieu, memePersonne, metierDuDirigeant, nomsDesCentres, type Entreprise } from "./regles";

const siret = z.string().regex(/^\d{14}$/);
/** Ce que l'écran a choisi. Les données elles-mêmes sont relues dans l'annuaire, jamais reçues du navigateur. */
export const choixAnnuaire = z.object({
  siren: z.string().regex(/^\d{9}$/),
  /** Remplacer le nom affiché par celui de l'annuaire. Par défaut, le nom choisi par l'équipe reste. */
  reprendreNom: z.boolean().default(false),
  /** Les établissements à créer comme centres. */
  creer: z.array(siret).max(100).default([]),
  /** Les centres déjà saisis à compléter de leur SIRET et FINESS. */
  completer: z.array(z.object({ centreId: z.number().int().positive(), siret })).max(100).default([]),
  /** Ajouter les dirigeants absents des contacts. */
  dirigeants: z.boolean().default(false),
}).strict();
export type ChoixAnnuaire = z.output<typeof choixAnnuaire>;

/** Les champs d'identité légale que l'annuaire remplit (C-89). */
export function identiteDepuisAnnuaire(e: Entreprise, maintenant: Date) {
  return {
    siren: e.siren, denominationLegale: e.denomination.slice(0, 300), siretSiege: e.siege?.siret ?? null,
    siegeAdresse: e.siege?.adresse?.slice(0, 300) ?? null, siegeCodePostal: e.siege?.codePostal ?? null, siegeVille: e.siege?.ville ?? null,
    codeNaf: e.activite, formeJuridique: formeJuridique(e.formeJuridique), annuaireLuLe: maintenant,
  };
}

/**
 * Le rapprochement proposé à l'écran : pour chaque établissement, le centre
 * déjà saisi qui est au même endroit et n'a pas encore de SIRET.
 */
export function rapprochements(e: Entreprise, centres: readonly { id: number; codePostal: string | null; adresse: string | null; siret: string | null }[]) {
  const pris = new Set(centres.map((c) => c.siret).filter(Boolean));
  const resultat: Record<string, number> = {};
  for (const x of e.etablissements) {
    if (pris.has(x.siret)) continue;
    const centre = centres.find((c) => !c.siret && !Object.values(resultat).includes(c.id) && memeLieu(c, x));
    if (centre) resultat[x.siret] = centre.id;
  }
  return resultat;
}

/**
 * Applique l'annuaire à une fiche, en une transaction (C-89) : l'identité
 * légale, les centres complétés, les centres créés, les dirigeants ajoutés.
 * Les centres créés sont localisés après le commit (C-81). Le journal garde
 * les champs touchés, jamais le nom ni les coordonnées d'un contact (C-27).
 */
export async function appliquerAnnuaire(organisationId: number, e: Entreprise, choix: ChoixAnnuaire, auteurId: number, maintenant = new Date()) {
  if (e.siren !== choix.siren) throw new ErreurMetier("L'entreprise relue ne correspond pas au choix.", 409);
  const parSiret = new Map(e.etablissements.map((x) => [x.siret, x]));
  for (const s of [...choix.creer, ...choix.completer.map((c) => c.siret)]) {
    if (!parSiret.has(s)) throw new ErreurMetier("Un établissement choisi n'est plus dans l'annuaire. Relancez la recherche.", 409);
  }
  const { bilan, crees } = await transactionJournalisee(async (tx) => {
    await verrouillerOrganisation(tx, organisationId);
    const organisation = await tx.crmOrganisation.findUnique({ where: { id: organisationId }, include: { centres: true, contacts: { select: { nom: true } } } });
    if (!organisation) throw new ErreurMetier("Organisation inconnue.", 404);

    const donnees = { ...identiteDepuisAnnuaire(e, maintenant), ...(choix.reprendreNom ? { raisonSocialeNom: e.nom.slice(0, 200) } : {}) };
    const champs = Object.keys(donnees).filter((k) => k !== "annuaireLuLe") as (keyof typeof donnees)[];
    const diff = champsChanges(organisation, donnees, champs);
    await tx.crmOrganisation.update({ where: { id: organisationId }, data: donnees });
    if (Object.keys(diff.apres).length) {
      await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId, auteurId, resume: "Identité lue dans l'annuaire des entreprises", ...diff });
    }

    let completes = 0;
    for (const { centreId, siret: s } of choix.completer) {
      const centre = organisation.centres.find((c) => c.id === centreId);
      if (!centre) throw new ErreurMetier("Un centre choisi n'appartient pas à ce client.", 400);
      if (centre.siret) continue;
      const x = parSiret.get(s)!;
      await tx.crmCentre.update({ where: { id: centreId }, data: { siret: s, finess: centre.finess ?? x.finess } });
      await journaliser(tx, { type: "ORGANISATION_MODIFIEE", organisationId, centreId, auteurId, resume: `Centre complété depuis l'annuaire : ${centre.nom}`,
        avant: { siret: null }, apres: { siret: s } });
      completes++;
    }

    const dejaSaisis = new Set(organisation.centres.map((c) => c.siret).filter(Boolean));
    const aCreer = choix.creer.filter((s) => !dejaSaisis.has(s) && !choix.completer.some((c) => c.siret === s)).map((s) => parSiret.get(s)!);
    const noms = nomsDesCentres(aCreer, organisation.centres.map((c) => c.nom));
    const crees: number[] = [];
    for (const [i, x] of aCreer.entries()) {
      const centre = await tx.crmCentre.create({ data: {
        organisationId, nom: noms[i], adresse: x.adresse, codePostal: x.codePostal, ville: x.ville, siret: x.siret, finess: x.finess,
      } });
      await journaliser(tx, { type: "CENTRE_CREE", organisationId, centreId: centre.id, auteurId, resume: `Centre créé depuis l'annuaire : ${centre.nom}`,
        apres: { nom: centre.nom, ville: centre.ville } });
      crees.push(centre.id);
    }

    let contacts = 0;
    if (choix.dirigeants) {
      const presents = organisation.contacts.map((c) => c.nom);
      for (const d of e.dirigeants) {
        if (presents.some((n) => memePersonne(n, d.nom))) continue;
        await tx.crmContact.create({ data: { organisationId, nom: d.nom.slice(0, 200), fonction: d.qualite?.slice(0, 200) ?? null, metier: metierDuDirigeant(d.qualite),
          principal: false } });
        await journaliser(tx, { type: "CONTACT_AJOUTE", organisationId, auteurId, resume: "Dirigeant ajouté depuis l'annuaire", apres: { champs: ["nom", "fonction", "metier"] } });
        presents.push(d.nom);
        contacts++;
      }
    }
    return { bilan: { identite: Object.keys(diff.apres).length > 0, completes, crees: crees.length, contacts }, crees };
  });
  if (crees.length) geocoderApresCommit(crees);
  return bilan;
}

/** La phrase qui dit ce qui a été fait. */
export function phraseBilan(b: { identite: boolean; completes: number; crees: number; contacts: number }): string {
  const morceaux = [
    b.identite ? "Identité légale renseignée" : "Identité légale déjà à jour",
    b.crees ? `${b.crees} centre${b.crees > 1 ? "s" : ""} créé${b.crees > 1 ? "s" : ""}` : null,
    b.completes ? `${b.completes} centre${b.completes > 1 ? "s" : ""} complété${b.completes > 1 ? "s" : ""} (SIRET)` : null,
    b.contacts ? `${b.contacts} dirigeant${b.contacts > 1 ? "s" : ""} ajouté${b.contacts > 1 ? "s" : ""} aux contacts` : null,
  ].filter(Boolean);
  return morceaux.join(", ") + ".";
}
