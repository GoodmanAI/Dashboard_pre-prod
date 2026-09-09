import { cheminCentre } from "@/lib/cheminsCentre";
import type { Exigence } from "./types";
import { estCodePostal, estNumeroSortant, renseigne } from "./validateurs";

/**
 * Ce qu'un cabinet LyraeKonnect doit avoir pour fonctionner.
 *
 * **Ces exigences ne sont pas nouvelles** : elles existaient déjà, écrites en
 * SQL au milieu de la requête de `GET /api/konnect-installation`, qui les
 * appelle « les cinq gestes de l'installation ». Ce registre les déclare, la
 * route cessera de les calculer elle-même (lot 3).
 *
 * **Un cabinet non paramétré est déjà sûr**, et c'est ce qui distingue ce
 * registre de celui de LyraeTalk. Les défauts de `KonnectSettings` sont
 * *fail-closed* par construction, comme le dit le commentaire de sa migration :
 * l'absence de paramétrage est donc un service dégradé, jamais bloqué. Le
 * portail fonctionne, en mode minimal.
 */

/** L'instantané de configuration d'un cabinet LyraeKonnect, tel que lu en base. */
export type ConfigKonnect = {
  userProductId: number;
  userId: number;

  /** `KonnectTenantMapping` : sans lui, le cabinet n'a aucune configuration. */
  tenantId: string | null;
  /** Domaine `konnect.ris-identite` du socle `ProductConfig`. */
  risBaseUrl: string | null;
  risCodeSite: string | null;

  /** Une ligne `KonnectSettings` existe pour ce cabinet. */
  aDesParametres: boolean;
  telephoneSecretariat: string | null;

  /** Examens pratiqués ET portant un code, seuls à être reconnus par le portail. */
  examensAvecCode: number;
  /** Parmi eux, ceux que le patient peut réserver seul. */
  examensReservables: number;

  /**
   * Le code postal de chaque site du cabinet.
   *
   * La liste, et non un compteur calculé en SQL : la règle de ce qu'est un code
   * postal valide doit rester dans le registre, avec toutes les autres. Un
   * cabinet a quelques sites, la liste ne coûte rien.
   */
  sitesCodesPostaux: Array<string | null>;
};

export const REGISTRE_KONNECT: Exigence<ConfigKonnect>[] = [
  // ─────────────────────────────  Administrateur  ─────────────────────────────
  {
    cle: "konnect.rattachement",
    libelle: "Rattachement du cabinet",
    proprietaire: "admin",
    criticite: "bloquant",
    manque:
      "Le cabinet n'a aucune interface de paramétrage tant qu'il n'est pas rattaché au Dashboard.",
    href: () => "/admin/konnect-installation",
    satisfaite: (c) => renseigne(c.tenantId),
  },
  {
    cle: "konnect.ris-identite",
    libelle: "Rattachement au logiciel du centre",
    proprietaire: "admin",
    criticite: "bloquant",
    manque:
      "Le portail ne peut pas joindre le logiciel de gestion du centre. Renseignez son adresse et son code de site.",
    href: () => "/admin/konnect-installation",
    satisfaite: (c) => renseigne(c.risBaseUrl) && renseigne(c.risCodeSite),
  },

  // ───────────────────────────────────  Client  ───────────────────────────────
  {
    cle: "konnect.examens",
    libelle: "Catalogue d'examens",
    // ADMIN, ET NON CLIENT (09/09/2026). Le mapping se remplit a l'installation,
    // avec nous : un centre qui decouvre son portail n'a pas a etre accueilli par
    // un bandeau rouge sur un travail qui nous incombe. Le manque reste visible
    // dans `/admin/parc` et sur l'ecran d'installation, la ou on le traite.
    proprietaire: "admin",
    criticite: "bloquant",
    manque:
      "Aucun examen n'a de code : le portail ne reconnaîtra aucune demande de patient.",
    href: (ctx) => cheminCentre(ctx.userId, "konnect", "examens"),
    satisfaite: (c) => c.examensAvecCode > 0,
  },
  {
    cle: "konnect.telephone-secretariat",
    libelle: "Téléphone du secrétariat",
    proprietaire: "client",
    criticite: "bloquant",
    manque:
      "Un patient dont le rendez-vous est bloqué n'aura aucun numéro à appeler. Attendu : dix chiffres, par exemple 0545820880.",
    href: (ctx) => cheminCentre(ctx.userId, "konnect", "parametrage"),
    satisfaite: (c) => estNumeroSortant(c.telephoneSecretariat),
  },
  {
    cle: "konnect.examens-reservables",
    libelle: "Examens réservables en ligne",
    // Admin pour la meme raison que `konnect.examens` : c'est une case du mapping,
    // et le mapping se regle avec nous.
    proprietaire: "admin",
    // Le deuxième chemin (demande de rappel) est légitime : ce n'est pas une
    // panne, mais le patient ne voit aucune date, et le cabinet doit le savoir.
    criticite: "degrade",
    manque:
      "Aucun examen n'est réservable en ligne. Tous les patients passeront par une demande de rappel.",
    href: (ctx) => cheminCentre(ctx.userId, "konnect", "examens"),
    satisfaite: (c) => c.examensReservables > 0,
  },
  {
    cle: "konnect.sites",
    libelle: "Sites et codes postaux",
    proprietaire: "client",
    criticite: "degrade",
    manque:
      "Le patient ne saura pas où se rendre, et le rapprochement par code postal de la liste d'attente ne pourra pas jouer.",
    href: (ctx) => cheminCentre(ctx.userId, "konnect", "sites"),
    satisfaite: (c) =>
      c.sitesCodesPostaux.length > 0 && c.sitesCodesPostaux.every(estCodePostal),
  },
  {
    cle: "konnect.parametres",
    libelle: "Paramètres du cabinet",
    proprietaire: "client",
    criticite: "degrade",
    manque:
      "Le portail tourne sur ses réglages minimaux : pas de questionnaire clinique, pas de choix du radiologue, pas de bilan à deux examens.",
    href: (ctx) => cheminCentre(ctx.userId, "konnect", "parametrage"),
    satisfaite: (c) => c.aDesParametres,
  },
];
