import type { CrmBaseTarif, CrmTypeLigne, Prisma } from "@prisma/client";
import { ErreurMetier } from "@/pilot/lib/erreurs";
import { ligneProposition } from "@/pilot/lib/validation/proposition";
import { combinerOffres, expliquerRemarque, preremplir, type Preremplissage, type RemarquePreremplissage } from "@/pilot/lib/tarifs/preremplir";
import type { GrilleEnVigueur } from "@/pilot/lib/tarifs/grille";

/**
 * Les lignes d'une version préremplie depuis la grille en vigueur (lot S).
 * `preparerLignes` est pure : elle traduit le résultat de `preremplir`
 * (src/lib/tarifs/preremplir.ts) en lignes de proposition, garde l'indicateur
 * « prix à renseigner » de chacune, et refuse ce qu'une proposition ne peut
 * pas porter, dont une version sans aucune ligne : on ne crée ni ne remplace
 * rien qui ne vienne de la grille. `chargerPreremplissage` lit centres, salles
 * et offres en trois requêtes, quel que soit le nombre de centres.
 */

export const MAX_LIGNES_PROPOSITION = 50;
export const MESSAGE_TROP_DE_LIGNES = (n: number) =>
  `Le préremplissage donnerait ${n} lignes, une proposition en porte ${MAX_LIGNES_PROPOSITION} au plus. Saisissez les lignes à la main avec « Ajouter une ligne », en regroupant des centres sur une ligne « Toute l'organisation ».`;
export const MESSAGE_MONTANT_TROP_ELEVE = "Un montant prérempli dépasse la limite d'une ligne (1 000 000 €). Vérifiez les prix de la grille.";

export type NouvelleLigne = { productId: number | null; centreId: number | null; type: CrmTypeLigne; montantCentimes: number; libelle: string; offerte: false;
  /** Le calcul de la ligne (C-90), repris du tarif. */
  quantite: number | null; prixUnitaireCentimes: number | null; baseQuantite: CrmBaseTarif | null };
export type RemarqueExpliquee = RemarquePreremplissage & { message: string };

/**
 * Aucune ligne ne sort de la grille : rien n'est créé ni remplacé, et les
 * remarques disent pourquoi, chaque phrase une fois.
 */
export function messageAucuneLigne(remarques: readonly { message: string }[]): string {
  const phrases = [...new Set(remarques.map((r) => r.message))];
  return `La grille ne donne aucune ligne pour cette fiche. ${phrases.length ? phrases.join(" ") : "Vérifiez les centres, leurs salles et leurs offres."}`;
}

/** Un préremplissage refusé (400) : la phrase, et les remarques que la route renvoie avec elle. */
export class RefusPreremplissage extends ErreurMetier {
  constructor(message: string, public readonly remarques: RemarqueExpliquee[]) {
    super(message, 400);
  }
}

/**
 * Ce que `chargerPreremplissage` ajoute au résultat de `preremplir`, pour les
 * phrases : le nom de chaque centre, et si une proposition se sert déjà de la
 * grille en vigueur.
 */
export type PreremplissageCharge = Preremplissage & { nomsCentres?: ReadonlyMap<number, string>; grilleUtilisee?: boolean };

export function preparerLignes(p: PreremplissageCharge): { lignes: NouvelleLigne[]; aRenseigner: boolean[]; remarques: RemarqueExpliquee[]; refus: string | null } {
  const lignes = p.lignes.map<NouvelleLigne>((l) => ({ productId: l.productId, centreId: l.centreId, type: l.type, montantCentimes: l.montantCentimes, libelle: l.libelle, offerte: false,
    quantite: l.quantite, prixUnitaireCentimes: l.prixUnitaireCentimes, baseQuantite: l.baseQuantite }));
  const aRenseigner = p.lignes.map((l) => l.prixARenseigner);
  const refus = !lignes.length ? "AUCUNE" : lignes.length > MAX_LIGNES_PROPOSITION ? MESSAGE_TROP_DE_LIGNES(lignes.length)
    // La même validation que la saisie : une ligne que la modification refuserait ne naît pas ici.
    : lignes.some((l) => !ligneProposition.safeParse(l).success) ? MESSAGE_MONTANT_TROP_ELEVE : null;
  // Des lignes écrites figent la grille : la version s'en servira. Le conseil vise alors une nouvelle grille datée.
  const grilleFigee = !!p.grilleUtilisee || refus === null;
  const remarques = p.remarques.map((r) => ({ ...r, message: expliquerRemarque(r, { nomCentre: r.centreId === null ? null : p.nomsCentres?.get(r.centreId) ?? null, grilleFigee }) }));
  if (refus !== null) return { lignes: [], aRenseigner: [], remarques, refus: refus === "AUCUNE" ? messageAucuneLigne(remarques) : refus };
  return { lignes, aRenseigner, remarques, refus: null };
}

/**
 * Les centres de l'organisation (avec leur nom, pour les remarques), leurs
 * salles (comptées, pas chargées) et leurs offres, plus celles du groupe apporté
 * (`CrmApport`, OU logique, C-63) et ce que la fiche dit des salles (nombre et
 * équipements), que `preremplir` lit par `sallesDuDossier`, le même ordre que la
 * température. Les centres sont pris
 * dans l'ordre de création : « le reste sur le premier » désigne le plus ancien.
 * Plus le nombre de propositions qui se servent déjà de la grille. Quatre
 * requêtes, quel que soit le nombre de centres.
 */
export async function chargerPreremplissage(tx: Prisma.TransactionClient, organisationId: number, grille: Pick<GrilleEnVigueur, "id" | "tarifs">): Promise<PreremplissageCharge> {
  const organisation = await tx.crmOrganisation.findUniqueOrThrow({ where: { id: organisationId }, select: { nombreSalles: true, nombreIrm: true, nombreScanners: true, nombreRadio: true, nombreEcho: true, nombreMammo: true } });
  const centres = await tx.crmCentre.findMany({
    where: { organisationId }, orderBy: { id: "asc" },
    select: { id: true, nom: true, offreTalk: true, offreKonnect: true, offreConnecteurRis: true, _count: { select: { salles: true } } },
  });
  const groupe = await tx.crmApport.findUnique({ where: { organisationId }, select: { offreTalk: true, offreKonnect: true, offreConnecteurRis: true } });
  const grilleUtilisee = grille.id !== null && await tx.crmProposition.count({ where: { grilleId: grille.id } }) > 0;
  return {
    ...preremplir(grille, centres.map(({ _count, nom, ...c }) => { void nom; return { ...c, salles: _count.salles }; }), combinerOffres(groupe), organisation),
    nomsCentres: new Map(centres.map((c) => [c.id, c.nom])),
    grilleUtilisee,
  };
}
