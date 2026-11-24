import type { CrmPriorite, CrmTypeOrganisation, Prisma } from "@prisma/client";
import { prisma } from "@/pilot/lib/prisma";
import { debutDuJour } from "@/pilot/lib/dates";
import { CLES_ORIGINE, TYPES_ORGANISATION } from "@/pilot/lib/organisations/referentielClient";
import { temperature } from "@/pilot/lib/organisations/temperature";
import { nombreDeSites } from "@/pilot/lib/organisations/sites";
import { NIVEAUX_TEMPERATURE, rangTemperature, resumeTemperature, type ResumeTemperature } from "@/pilot/lib/organisations/temperatureAffichage";
import { INCONNU, ORDRE_PRIORITES, REGIONS, comparerProspects, etatProspection, prefixesCodePostal, type CleRegion, type EtatProspection } from "./regles";

/** Les filtres de la vue « À prospecter », tels que l'adresse de la page les porte. */
export type FiltresProspection = {
  q?: string; region?: string; type?: string; ris?: string; rdv?: string; priorite?: string;
  etat?: string; responsable?: string; origine?: string; page?: string;
  /** CHAUD, TIEDE ou FROID : un code, jamais un texte saisi. */
  temperature?: string;
  /** « temperature » : les plus chauds d'abord. Absent : l'ordre habituel (priorité, relance). */
  tri?: string;
};

export const PAR_PAGE = 50;

export type LigneProspection = {
  id: number; nom: string; type: CrmTypeOrganisation; priorite: CrmPriorite | null; ville: string | null; codePostal: string | null;
  ris: string | null; risVersion: string | null; outilRdv: string | null; dernierEchangeLe: string | null;
  prochaineAction: string | null; prochaineActionLe: string | null; responsable: string | null; sites: number | null;
  /** La température du prospect, calculée en mémoire avec le moteur pur (lot R). */
  temperature: ResumeTemperature | null;
};

/** Le « où » de chaque filtre, sauf l'état : les compteurs Jamais contacté et À relancer en ont besoin sans lui. */
function conditions(f: FiltresProspection, courantId: number): Prisma.CrmOrganisationWhereInput[] {
  const et: Prisma.CrmOrganisationWhereInput[] = [{ etape: "PROSPECT" }];
  const q = f.q?.trim();
  if (q) et.push({ OR: [
    { raisonSocialeNom: { contains: q, mode: "insensitive" } },
    { rattachementGht: { contains: q, mode: "insensitive" } },
    { centres: { some: { OR: [{ ville: { contains: q, mode: "insensitive" } }, { codePostal: { startsWith: q } }] } } },
  ] });
  if (f.region && Object.hasOwn(REGIONS, f.region)) {
    et.push({ centres: { some: { OR: prefixesCodePostal(f.region as CleRegion).map((p) => ({ codePostal: { startsWith: p } })) } } });
  }
  if (f.type && Object.hasOwn(TYPES_ORGANISATION, f.type)) et.push({ type: f.type as CrmTypeOrganisation });
  if (f.ris) et.push({ ris: f.ris === INCONNU ? null : f.ris });
  if (f.rdv) et.push({ outilRdv: f.rdv === INCONNU ? null : f.rdv });
  if (f.priorite) et.push({ priorite: f.priorite === INCONNU ? null : ORDRE_PRIORITES.includes(f.priorite as CrmPriorite) ? f.priorite as CrmPriorite : undefined });
  if (f.responsable === "moi") et.push({ responsableId: courantId });
  else if (f.responsable === INCONNU) et.push({ responsableId: null });
  else if (f.responsable && /^\d+$/.test(f.responsable)) et.push({ responsableId: Number(f.responsable) });
  if (f.origine && (CLES_ORIGINE as string[]).includes(f.origine)) et.push({ origine: f.origine });
  else if (f.origine === INCONNU) et.push({ origine: null });
  return et;
}

/** Même découpage que etatProspection() : une action en retard passe avant tout. */
export function conditionEtat(etat: EtatProspection, maintenant: Date): Prisma.CrmOrganisationWhereInput {
  const aujourdhui = debutDuJour(maintenant);
  const pasEnRetard: Prisma.CrmOrganisationWhereInput = { OR: [{ prochaineActionLe: null }, { prochaineActionLe: { gte: aujourdhui } }] };
  if (etat === "A_RELANCER") return { prochaineActionLe: { lt: aujourdhui } };
  if (etat === "JAMAIS") return { AND: [{ dernierEchangeLe: null }, pasEnRetard] };
  return { AND: [{ dernierEchangeLe: { not: null } }, pasEnRetard] };
}

/** Ce que le barème lit d'un prospect, sans les contacts ni les centres : ceux-ci se lisent pour toutes les lignes à la fois. */
const CHAMPS_BAREME = {
  etape: true, nombreSalles: true, nombreIrm: true, nombreScanners: true, nombreRadio: true, nombreEcho: true, nombreMammo: true,
  ris: true, qualifBudget: true, qualifBesoin: true, decisionAttendueLe: true,
  temperatureForcee: true, temperatureForceeParId: true, temperatureForceeLe: true,
} as const;

/**
 * Les contacts et les centres des prospects visés, en deux lectures pour toutes les
 * lignes : le rôle des contacts, et le RIS et le nombre de salles de chaque centre.
 * Jamais une requête par ligne. Les prospects sont donnés par leurs identifiants
 * (une page, 50 au plus), ou par les filtres eux-mêmes, appliqués par la relation :
 * la voie température ne passe jamais une liste d'identifiants sans borne.
 */
async function donneesBareme(prospects: number[] | Prisma.CrmOrganisationWhereInput) {
  const where = Array.isArray(prospects) ? { organisationId: { in: prospects } } : { organisation: prospects };
  const [centres, contacts] = await Promise.all([
    prisma.crmCentre.findMany({ where, select: { organisationId: true, ris: true, _count: { select: { salles: true } } } }),
    prisma.crmContact.findMany({ where, select: { organisationId: true, roleDecision: true } }),
  ]);
  const centresDe = new Map<number, { ris: string | null; salles: number }[]>();
  for (const c of centres) centresDe.set(c.organisationId, [...(centresDe.get(c.organisationId) ?? []), { ris: c.ris, salles: c._count.salles }]);
  const contactsDe = new Map<number, { roleDecision: (typeof contacts)[number]["roleDecision"] }[]>();
  for (const c of contacts) contactsDe.set(c.organisationId, [...(contactsDe.get(c.organisationId) ?? []), { roleDecision: c.roleDecision }]);
  return (id: number) => ({ centres: centresDe.get(id) ?? [], contacts: contactsDe.get(id) ?? [] });
}

const SELECTION_LIGNE = {
  id: true, raisonSocialeNom: true, type: true, priorite: true, risVersion: true, outilRdv: true,
  dernierEchangeLe: true, prochaineAction: true, prochaineActionLe: true,
  responsable: { select: { name: true } },
  centres: { select: { ville: true, codePostal: true }, orderBy: { id: "asc" }, take: 1 },
  _count: { select: { centres: true } },
  nombreSites: true,
  ...CHAMPS_BAREME,
} satisfies Prisma.CrmOrganisationSelect;
type LigneBrute = Prisma.CrmOrganisationGetPayload<{ select: typeof SELECTION_LIGNE }>;

function ligne(o: LigneBrute, niveau: ResumeTemperature | null): LigneProspection {
  return {
    id: o.id, nom: o.raisonSocialeNom, type: o.type, priorite: o.priorite,
    ville: o.centres[0]?.ville ?? null, codePostal: o.centres[0]?.codePostal ?? null,
    ris: o.ris, risVersion: o.risVersion, outilRdv: o.outilRdv,
    dernierEchangeLe: o.dernierEchangeLe?.toISOString() ?? null,
    prochaineAction: o.prochaineAction, prochaineActionLe: o.prochaineActionLe?.toISOString() ?? null,
    responsable: o.responsable?.name ?? null, sites: nombreDeSites(o.nombreSites, o._count.centres), temperature: niveau,
  };
}

/**
 * La liste « À prospecter ». Un nombre fixe de lectures, quelle que soit la taille
 * de la liste : jamais une requête par ligne. La température (lot R) se calcule en
 * mémoire avec le moteur pur, sur les contacts, les centres et leurs salles lus pour
 * toutes les lignes en même temps.
 *
 * Filtrer ou trier par température demande de la connaître pour tous les prospects
 * retenus, pas seulement pour la page : cette voie lit donc les candidats avec
 * leurs contacts et leurs centres (mêmes filtres, par la relation), puis le détail
 * de la page seule.
 */
export async function chargerProspection(f: FiltresProspection, courantId: number, maintenant = new Date()) {
  const base = conditions(f, courantId);
  const etat = (["JAMAIS", "A_RELANCER", "CONTACTE"] as const).find((e) => e === f.etat);
  const niveau = NIVEAUX_TEMPERATURE.find((n) => n === f.temperature);
  const parTemperature = f.tri === "temperature";
  const page = Math.max(1, Math.floor(Number(f.page)) || 1);
  // Les valeurs proposées dans les filtres : celles qui existent chez les prospects.
  const options = Promise.all([
    prisma.crmOrganisation.findMany({ where: { etape: "PROSPECT", ris: { not: null } }, distinct: ["ris"], select: { ris: true }, orderBy: { ris: "asc" } }),
    prisma.crmOrganisation.findMany({ where: { etape: "PROSPECT", outilRdv: { not: null } }, distinct: ["outilRdv"], select: { outilRdv: true }, orderBy: { outilRdv: "asc" } }),
  ]);

  if (niveau || parTemperature) {
    // Les candidats, leurs centres et leurs contacts, lus ensemble avec les mêmes filtres.
    const [candidats, bareme] = await Promise.all([
      prisma.crmOrganisation.findMany({
        where: { AND: base },
        select: { id: true, raisonSocialeNom: true, priorite: true, dernierEchangeLe: true, prochaineActionLe: true, ...CHAMPS_BAREME },
        orderBy: { id: "asc" },
      }),
      donneesBareme({ AND: base }),
    ]);
    const calcules = candidats.map((c) => ({ ...c, nom: c.raisonSocialeNom, niveau: resumeTemperature(temperature({ ...c, ...bareme(c.id) }, maintenant)) }));
    const gardes = niveau ? calcules.filter((c) => c.niveau?.niveau === niveau) : calcules;
    const jamais = gardes.filter((c) => etatProspection(c, maintenant) === "JAMAIS").length;
    const aRelancer = gardes.filter((c) => etatProspection(c, maintenant) === "A_RELANCER").length;
    const retenus = (etat ? gardes.filter((c) => etatProspection(c, maintenant) === etat) : gardes)
      // Dernier critère, l'identifiant : deux prospects égaux par ailleurs gardent le même ordre d'une page à l'autre.
      .sort((a, b) => (parTemperature ? rangTemperature(a.niveau?.niveau ?? null) - rangTemperature(b.niveau?.niveau ?? null) : 0) || comparerProspects(a, b) || a.id - b.id);
    const ids = retenus.slice((page - 1) * PAR_PAGE, page * PAR_PAGE).map((c) => c.id);
    const [detail, [ris, rdv]] = await Promise.all([prisma.crmOrganisation.findMany({ where: { id: { in: ids } }, select: SELECTION_LIGNE }), options]);
    const parId = new Map(detail.map((o) => [o.id, o]));
    const niveaux = new Map(retenus.map((c) => [c.id, c.niveau]));
    return {
      lignes: ids.flatMap((id) => { const o = parId.get(id); return o ? [ligne(o, niveaux.get(id) ?? null)] : []; }),
      total: retenus.length, jamais, aRelancer, page, pages: Math.max(1, Math.ceil(retenus.length / PAR_PAGE)),
      options: { ris: ris.map((r) => r.ris!), rdv: rdv.map((r) => r.outilRdv!) },
    };
  }

  const where: Prisma.CrmOrganisationWhereInput = { AND: etat ? [...base, conditionEtat(etat, maintenant)] : base };
  const [total, jamais, aRelancer, organisations, [ris, rdv]] = await Promise.all([
    prisma.crmOrganisation.count({ where }),
    prisma.crmOrganisation.count({ where: { AND: [...base, conditionEtat("JAMAIS", maintenant)] } }),
    prisma.crmOrganisation.count({ where: { AND: [...base, conditionEtat("A_RELANCER", maintenant)] } }),
    prisma.crmOrganisation.findMany({
      where,
      // Les priorités hautes d'abord, puis les relances les plus anciennes ; les jamais contactés avant les autres.
      orderBy: [{ priorite: { sort: "asc", nulls: "last" } }, { prochaineActionLe: { sort: "asc", nulls: "last" } },
        { dernierEchangeLe: { sort: "asc", nulls: "first" } }, { raisonSocialeNom: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAR_PAGE, take: PAR_PAGE,
      select: SELECTION_LIGNE,
    }),
    options,
  ]);
  const bareme = await donneesBareme(organisations.map((o) => o.id));
  const lignes = organisations.map((o) => ligne(o, resumeTemperature(temperature({ ...o, ...bareme(o.id) }, maintenant))));
  return {
    lignes, total, jamais, aRelancer, page, pages: Math.max(1, Math.ceil(total / PAR_PAGE)),
    options: { ris: ris.map((r) => r.ris!), rdv: rdv.map((r) => r.outilRdv!) },
  };
}
