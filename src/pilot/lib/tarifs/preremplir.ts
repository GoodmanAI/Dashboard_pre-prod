import type { CrmBaseTarif, CrmTypeLigne } from "@prisma/client";
import { recurrentDesSalles } from "@/pilot/lib/apports/calcul";
import { tarifDe, type GrilleEnVigueur, type TarifGrille } from "./grille";
import { repartirSalles, sallesDuDossier, type FicheSalles } from "@/pilot/lib/organisations/salles";
import { ROLES, estRoleProduit, roleDuCode } from "./roles";

/**
 * Le préremplissage d'une proposition depuis la grille en vigueur (lot S).
 * Fonction pure, arithmétique entière : la grille, les centres et les offres
 * entrent, les lignes sortent, sans accès à la base ni à l'horloge.
 *
 * Les règles :
 * - **Offres.** Celles d'un centre (`offreTalk`, `offreKonnect`,
 *   `offreConnecteurRis`) s'ajoutent à celles du groupe, en OU logique, comme
 *   l'apport d'affaires (`offresDuSite`, C-63). Les offres du groupe sont celles
 *   de `CrmApport` ; les offres cochées à la fiche rapide (C-70), qui ne sont pas
 *   enregistrées, s'y ajoutent de même quand l'appelant les a : `combinerOffres`.
 * - **Salles.** `sallesDuDossier` (`organisations/salles.ts`), le même ordre que
 *   le barème de température : les salles saisies une par une (`CrmSalle`) dès
 *   qu'un centre en a une ; sinon le nombre de salles de la fiche, réparti en
 *   entiers sur ses centres, le reste sur le premier (`repartirSalles`). On ne
 *   mêle jamais les deux : ce serait compter deux fois les mêmes salles. Les
 *   équipements déclarés, troisième source du barème, ne se facturent pas : un
 *   équipement n'est pas une salle. Chaque centre reste alors sans salle, et la
 *   remarque `CENTRE_SANS_SALLE` dit pourquoi.
 * - **Lignes.** Un centre sans salle n'a aucune ligne. Pour chaque centre et
 *   chaque produit offert (Talk, Konnect) : une ligne d'abonnement et une ligne
 *   d'installation, chacune selon la base de son tarif (par salle : salles × prix ;
 *   par site : une fois par centre ; par organisation : une ligne sans centre,
 *   une fois pour tous les centres). Le connecteur RIS est une ligne par centre :
 *   son taux appliqué au montant des salles du centre, par `recurrentDesSalles`,
 *   la règle de l'apport et de l'estimation. Seul, il ne fait pas de ligne : il
 *   suit les salles.
 *   Arrondi (C-76) : une fois par centre, sur les salles de ce centre, puisque
 *   chaque centre a sa ligne. L'estimation d'un prospect (`estimer.ts`)
 *   l'arrondit une seule fois, sur toutes les salles : les deux peuvent
 *   s'écarter d'au plus un centime par centre. Le contrat suit la proposition.
 * - **Jamais un prix inventé.** Un tarif présent sans prix (ou d'une base qui ne
 *   donne pas de montant) donne une ligne à 0, `prixARenseigner`. Le connecteur
 *   dont le taux ou un prix de salle manque aussi. Un tarif absent de la grille
 *   ne donne aucune ligne : la grille ne connaît pas cette offre, une remarque
 *   le dit.
 * - **Produit.** Un tarif de produit (Talk, Konnect et leurs installations) sans
 *   produit relié donne des lignes hors catalogue : une remarque le dit.
 * - **Connecteur et base.** Le connecteur se calcule sur le prix par salle de
 *   Talk et de Konnect : si l'un d'eux est d'une autre base, le connecteur reste
 *   à 0, avec sa remarque à lui (pas « son prix n'est pas dans la grille »).
 * Chaque cas qui laisse une ligne absente a sa remarque, et sa phrase
 * (`expliquerRemarque`) : l'écran dit pourquoi.
 */

export type OffresPreremplissage = { offreTalk: boolean; offreKonnect: boolean; offreConnecteurRis: boolean };
/** Un centre : ses offres et le nombre de ses salles saisies (`CrmSalle`), 0 si aucune. */
export type CentrePreremplissage = OffresPreremplissage & { id: number; salles: number };

/**
 * Ce qu'une phrase de remarque sait en plus de la remarque : le nom du centre
 * qu'elle vise, et si la grille en vigueur est figée (une proposition s'en sert,
 * ou le préremplissage va s'en servir) : on ne la corrige plus, on en crée une
 * nouvelle datée.
 */
export type ContexteRemarque = { nomCentre?: string | null; grilleFigee?: boolean };

export type LignePreremplie = {
  /** Le code du tarif dont la ligne vient (TALK, CONNECTEUR_RIS, INSTALLATION_TALK…). */
  code: string;
  productId: number | null;
  libelle: string;
  type: CrmTypeLigne;
  /** Le brut, en centimes entiers ; 0 si le prix est à renseigner. */
  montantCentimes: number;
  /** null : la ligne porte sur toute l'organisation (installation par organisation). */
  centreId: number | null;
  /** Le tarif n'a pas de prix : la ligne est à 0 et reste à compléter. */
  prixARenseigner: boolean;
  /** Aucun geste au préremplissage : c'est au commercial de l'offrir. */
  offerte: false;
  /**
   * Le calcul (C-90) : 3 salles × 290 €, 1 site × 500 €. Null pour un
   * pourcentage. Un prix à renseigner donne un prix unitaire à 0 : le saisir
   * suffit à chiffrer la ligne.
   */
  quantite: number | null; prixUnitaireCentimes: number | null; baseQuantite: CrmBaseTarif | null;
};

/** La quantité qu'un tarif compte pour un centre de `salles` salles (C-90), ou null pour un pourcentage. */
export function quantitePourCentre(t: Pick<TarifGrille, "base">, salles: number): number | null {
  if (t.base === "PAR_SALLE") return salles;
  if (t.base === "PAR_SITE" || t.base === "PAR_ORGANISATION") return 1;
  return null;
}

/** `GRILLE_VIDE` : une grille en vigueur sans tarif. `AUCUNE_GRILLE` (ajouté en fin) : aucune grille en vigueur. */
export type CodeRemarque = "AUCUN_CENTRE" | "GRILLE_VIDE" | "AUCUNE_OFFRE" | "SALLES_REPARTIES" | "CENTRE_SANS_SALLE" | "CONNECTEUR_SEUL" | "TARIF_ABSENT"
  | "PRODUIT_NON_RELIE" | "CONNECTEUR_HORS_SALLE" | "AUCUNE_GRILLE";
export type RemarquePreremplissage = { code: CodeRemarque; centreId: number | null; tarif: string | null };
export type Preremplissage = { lignes: LignePreremplie[]; remarques: RemarquePreremplissage[] };

const AUCUNE: OffresPreremplissage = { offreTalk: false, offreKonnect: false, offreConnecteurRis: false };

/** Les offres de plusieurs sources (groupe de l'apport, fiche rapide…), en OU logique (C-63). */
export function combinerOffres(...sources: Array<OffresPreremplissage | null | undefined>): OffresPreremplissage {
  return sources.reduce<OffresPreremplissage>((o, s) => s ? {
    offreTalk: o.offreTalk || s.offreTalk, offreKonnect: o.offreKonnect || s.offreKonnect, offreConnecteurRis: o.offreConnecteurRis || s.offreConnecteurRis,
  } : o, AUCUNE);
}

/** Défini avec les salles du dossier (`organisations/salles.ts`), repris ici pour les appelants. */
export { repartirSalles };

/** Le montant d'un tarif pour un centre de `salles` salles, ou null s'il n'en donne pas (sans prix, pourcentage). */
function montantPourCentre(t: TarifGrille, salles: number): number | null {
  if (t.montantHtCentimes == null) return null;
  if (t.base === "PAR_SALLE") return salles * t.montantHtCentimes;
  if (t.base === "PAR_SITE" || t.base === "PAR_ORGANISATION") return t.montantHtCentimes;
  return null;
}

const PRODUITS = [
  { offre: "offreTalk", abonnement: "TALK", installation: "INSTALLATION_TALK" },
  { offre: "offreKonnect", abonnement: "KONNECT", installation: "INSTALLATION_KONNECT" },
] as const;

/**
 * `grille.id` null : aucune grille en vigueur (`AUCUNE_GRILLE`). Sans `id`, ou
 * avec un identifiant, une grille sans tarif est une grille vide (`GRILLE_VIDE`).
 */
export function preremplir(grille: Pick<GrilleEnVigueur, "tarifs"> & { id?: number | null }, centres: readonly CentrePreremplissage[], offres: OffresPreremplissage,
  fiche: FicheSalles = {}): Preremplissage {
  const remarques: RemarquePreremplissage[] = [];
  const remarquer = (code: CodeRemarque, centreId: number | null = null, tarif: string | null = null) => {
    if (!remarques.some((r) => r.code === code && r.centreId === centreId && r.tarif === tarif)) remarques.push({ code, centreId, tarif });
  };
  if (!centres.length) { remarquer("AUCUN_CENTRE"); return { lignes: [], remarques }; }
  if (grille.id === null) { remarquer("AUCUNE_GRILLE"); return { lignes: [], remarques }; }
  if (!grille.tarifs.length) { remarquer("GRILLE_VIDE"); return { lignes: [], remarques }; }
  const offresDesCentres = centres.map((c) => combinerOffres(c, offres));
  if (!offresDesCentres.some((o) => o.offreTalk || o.offreKonnect || o.offreConnecteurRis)) { remarquer("AUCUNE_OFFRE"); return { lignes: [], remarques }; }

  // Les deux premières sources de `sallesDuDossier` se facturent ; les équipements non (`parCentre` reste à zéro).
  const { parCentre: salles, reparties } = sallesDuDossier(fiche, centres);
  if (reparties) remarquer("SALLES_REPARTIES");

  const lignesCentres: LignePreremplie[] = [];
  const organisation = new Map<string, LignePreremplie>();
  /** Une ligne depuis un tarif : son montant, ou 0 à renseigner. */
  const ligne = (t: TarifGrille, montant: number | null, centreId: number | null, salles = 0): LignePreremplie => {
    if (montant !== null && (!Number.isSafeInteger(montant) || montant < 0)) throw new Error("Montant prérempli hors des entiers sûrs.");
    if (t.productId === null && estRoleProduit(roleDuCode(t.code))) remarquer("PRODUIT_NON_RELIE", null, t.code);
    const quantite = quantitePourCentre(t, salles);
    const calcul = quantite !== null && quantite > 0
      ? { quantite, prixUnitaireCentimes: t.montantHtCentimes ?? 0, baseQuantite: t.base }
      : { quantite: null, prixUnitaireCentimes: null, baseQuantite: null };
    return { code: t.code, productId: t.productId, libelle: t.libelle, type: t.type, montantCentimes: montant ?? 0, centreId, prixARenseigner: montant === null, offerte: false, ...calcul };
  };
  /** Un tarif pour un centre : la ligne du centre, ou la ligne unique de l'organisation. */
  const ajouter = (code: string, centreId: number, n: number) => {
    const t = tarifDe(grille, code);
    if (!t) { remarquer("TARIF_ABSENT", null, code); return; }
    if (t.base === "PAR_ORGANISATION") { if (!organisation.has(code)) organisation.set(code, ligne(t, montantPourCentre(t, n), null, n)); return; }
    lignesCentres.push(ligne(t, montantPourCentre(t, n), centreId, n));
  };
  /** Le prix d'une salle d'un produit, s'il est connu : la base de calcul du connecteur. Un tarif d'une autre base le dit. */
  const prixSalle = (code: string) => {
    const t = tarifDe(grille, code);
    if (t && t.base !== "PAR_SALLE") remarquer("CONNECTEUR_HORS_SALLE", null, code);
    return t && t.base === "PAR_SALLE" && t.montantHtCentimes != null ? t.montantHtCentimes : null;
  };

  centres.forEach((c, i) => {
    const o = offresDesCentres[i], n = salles[i];
    if (!o.offreTalk && !o.offreKonnect) { if (o.offreConnecteurRis) remarquer("CONNECTEUR_SEUL", c.id); return; }
    if (n <= 0) { remarquer("CENTRE_SANS_SALLE", c.id); return; }
    for (const p of PRODUITS) if (o[p.offre]) ajouter(p.abonnement, c.id, n);
    if (o.offreConnecteurRis) {
      const t = tarifDe(grille, "CONNECTEUR_RIS");
      if (!t) remarquer("TARIF_ABSENT", null, "CONNECTEUR_RIS");
      else if (t.base !== "POURCENTAGE") ajouter("CONNECTEUR_RIS", c.id, n);
      else {
        const talk = o.offreTalk ? prixSalle("TALK") : 0, konnect = o.offreKonnect ? prixSalle("KONNECT") : 0;
        // La règle de l'apport et de l'estimation, appelée telle quelle : pas de deuxième formule.
        const connecteur = talk === null || konnect === null || t.pourMille == null ? null
          : recurrentDesSalles(n, { talk: o.offreTalk, konnect: o.offreKonnect, ris: true },
            { talkCentimes: talk, konnectCentimes: konnect, connecteurRisPdm: t.pourMille * 10 }).connecteur;
        lignesCentres.push(ligne(t, connecteur, c.id));
      }
    }
    for (const p of PRODUITS) if (o[p.offre]) ajouter(p.installation, c.id, n);
  });
  // Les lignes d'organisation après celles des centres, dans l'ordre des codes (le connecteur RIS en dernier : un code inconnu passerait devant).
  const ordre: string[] = [...PRODUITS.flatMap((p) => [p.abonnement, p.installation]), "CONNECTEUR_RIS"];
  const lignesOrganisation = [...organisation.entries()].sort(([a], [b]) => ordre.indexOf(a) - ordre.indexOf(b)).map(([, l]) => l);
  return { lignes: [...lignesCentres, ...lignesOrganisation], remarques };
}

/** « Abonnement Talk » : le rôle à choisir sur la page Tarifs. */
const role = (code: string | null) => ROLES[roleDuCode(code ?? "")];
const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

/**
 * La phrase qu'un écran écrit pour une remarque : pourquoi une ligne manque, et
 * comment la faire venir. Le centre est nommé quand on connaît son nom. Une
 * grille figée ne se corrige plus : le conseil renvoie vers une nouvelle grille datée.
 */
export function expliquerRemarque(r: RemarquePreremplissage, { nomCentre = null, grilleFigee = false }: ContexteRemarque = {}): string {
  const ceCentre = nomCentre ? `Le centre ${nomCentre}` : "Ce centre";
  const ou = grilleFigee ? " dans une nouvelle grille datée" : "";
  switch (r.code) {
    case "AUCUN_CENTRE": return "Aucun centre sur cette fiche. Ajoutez un centre pour préremplir les lignes.";
    case "GRILLE_VIDE": return "La grille tarifaire en vigueur n'a aucun tarif. Ajoutez ses tarifs sur la page Tarifs.";
    case "AUCUNE_GRILLE": return "Aucune grille tarifaire en vigueur. Créez-la sur la page Tarifs.";
    case "AUCUNE_OFFRE": return "Aucune offre cochée. Cochez Talk, Konnect ou le connecteur RIS sur les centres ou le groupe.";
    case "SALLES_REPARTIES": return "Aucune salle saisie : le nombre de salles de la fiche est réparti sur les centres. Vérifiez-le centre par centre.";
    case "CENTRE_SANS_SALLE": return `${ceCentre} n'a aucune salle. Ajoutez ses salles pour chiffrer ses lignes.`;
    case "CONNECTEUR_SEUL": return `${nomCentre ? `Au centre ${nomCentre}, le` : "Le"} connecteur RIS suit les salles Talk ou Konnect. Cochez l'une de ces offres pour ce centre.`;
    case "TARIF_ABSENT": return `La grille en vigueur n'a pas de tarif pour ${role(r.tarif).nom}. Sur la page Tarifs, ajoutez un tarif de rôle « ${role(r.tarif).libelle} »${ou}.`;
    case "PRODUIT_NON_RELIE": return `Le tarif « ${role(r.tarif).libelle} » n'est relié à aucun produit : ses lignes sont hors catalogue. Reliez-le à son produit sur la page Tarifs${ou}.`;
    case "CONNECTEUR_HORS_SALLE": return `${majuscule(role(r.tarif).nom)} n'est pas par salle dans la grille : le connecteur RIS, qui se calcule sur le prix par salle, reste à 0. Chiffrez-le à la main.`;
  }
}
