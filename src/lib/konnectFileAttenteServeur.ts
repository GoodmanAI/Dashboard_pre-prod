import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { PRODUITS } from "@/lib/produits";
import {
  ETATS,
  EVENEMENTS,
  GESTES_KONNECT,
  GESTES_SECRETAIRE,
  SORTIE_APRES_REFUS_DATE,
  SORTIE_APRES_SANS_REPONSE,
  lireCreneau,
  type Etat,
  type GesteKonnect,
  type GesteSecretaire,
} from "@/lib/konnectFileAttente";

/**
 * Accès à `KonnectFileAttente`, partagé par les routes de Konnect et l'écran de la
 * secrétaire. Le cœur est `appliquerGeste` : chaque changement d'état verrouille la
 * ligne (`SELECT … FOR UPDATE`), vérifie l'état attendu (et pour Konnect la version
 * lue), puis écrit. Deux gestes simultanés passent l'un après l'autre ; le second
 * trouve un état qui n'est plus le sien et reçoit un conflit (K11).
 */

export type InscriptionRow = {
  id: number;
  codeExamen: string;
  examenLibelle: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  telephone: string;
  sites: string[];
  referenceKonnect: string;
  etat: Etat;
  version: number;
  sansReponse: number;
  refusDate: number;
  propositions: number;
  creneau: unknown;
  reponseAvant: Date | null;
  rdvIdAttente: string | null;
  rdvId: string | null;
  sortieAt: Date | null;
  sortiePar: string | null;
  createdAt: Date;
};

/** `dateNaissance` en texte AAAA-MM-JJ : un `date` lu par `pg` deviendrait un `Date` décalé. */
export const COLONNES_INSCRIPTION = `"id", "codeExamen", "examenLibelle", "nom", "prenom",
  to_char("dateNaissance", 'YYYY-MM-DD') AS "dateNaissance", "telephone", "sites",
  "referenceKonnect", "etat", "version", "sansReponse", "refusDate", "propositions",
  "creneau", "reponseAvant", "rdvIdAttente", "rdvId", "sortieAt", "sortiePar", "createdAt"`;

/** États où un RDV d'attente est encore légitime : la proposition court. */
const ETATS_RDV_ATTENTE_VIVANT: readonly Etat[] = [
  "proposition",
  "confirmation_en_cours",
];

export async function estCentreKonnect(
  userProductId: number,
): Promise<boolean> {
  const res = await db.query<{ id: number }>(
    `SELECT up."id"
       FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."id" = $1
        AND up."removedAt" IS NULL
        AND lower(p."name") = lower($2)
      LIMIT 1`,
    [userProductId, PRODUITS.konnect.nom],
  );
  return (res.rowCount ?? 0) > 0;
}

export function lireUserProductId(req: NextRequest): number | null {
  const brut = Number(new URL(req.url).searchParams.get("userProductId"));
  return !brut || Number.isNaN(brut) ? null : brut;
}

/** Un RDV d'attente reste à relire dans Xplore : ni la proposition ni la confirmation ne courent. */
export function rdvAttenteANettoyer(
  r: Pick<InscriptionRow, "rdvIdAttente" | "etat">,
): boolean {
  return r.rdvIdAttente !== null && !ETATS_RDV_ATTENTE_VIVANT.includes(r.etat);
}

// ------------------------------------------------------------------ gestes

/** Le geste de Konnect qui libère le RDV d'attente une fois supprimé dans Xplore. */
export const GESTE_RDV_LIBERE = "rdv_attente_libere";

export type Geste = GesteKonnect | GesteSecretaire | typeof GESTE_RDV_LIBERE;

export type Donnees = {
  creneau?: unknown;
  reponseAvant?: unknown;
  rdvIdAttente?: unknown;
  rdvId?: unknown;
};

export type ResultatGeste =
  | { ok: true; id: number; etat: Etat; version: number }
  | {
      ok: false;
      statut: 400 | 404 | 409;
      erreur: string;
      etat?: Etat;
      version?: number;
    };

type Ecriture = {
  etat: Etat;
  sortie: boolean;
  creneau?: unknown | null;
  reponseAvant?: string | null;
  rdvIdAttente?: string | null;
  rdvId?: string | null;
  sansReponse?: number;
  refusDate?: number;
  propositions?: number;
  evenements: string[];
};

function texte(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Applique un geste. `version` est exigée pour Konnect (qui agit sur ce qu'il a lu)
 * et ignorée pour la secrétaire (sa page a jusqu'à 30 s de retard, et son geste vaut
 * quel que soit le passage du moteur entre-temps, tant que l'état le permet).
 */
export async function appliquerGeste(
  userProductId: number,
  id: number,
  geste: Geste,
  options: { version?: number; donnees?: Donnees; par?: string | null },
): Promise<ResultatGeste> {
  const d = options.donnees ?? {};
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const lu = await client.query<InscriptionRow>(
      `SELECT ${COLONNES_INSCRIPTION} FROM "KonnectFileAttente"
        WHERE "id" = $1 AND "userProductId" = $2
        FOR UPDATE`,
      [id, userProductId],
    );
    if ((lu.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, statut: 404, erreur: "Inscription inconnue." };
    }
    const r = lu.rows[0];
    const conflit = (erreur: string): ResultatGeste => ({
      ok: false,
      statut: 409,
      erreur,
      etat: r.etat,
      version: r.version,
    });

    if (options.version !== undefined && options.version !== r.version) {
      await client.query("ROLLBACK");
      return conflit("La ligne a changé depuis la dernière lecture.");
    }

    let e: Ecriture;
    if (geste === GESTE_RDV_LIBERE) {
      const rdv = texte(d.rdvIdAttente, 40);
      if (!rdvAttenteANettoyer(r) || rdv !== r.rdvIdAttente) {
        await client.query("ROLLBACK");
        return conflit("Aucun RDV d'attente à libérer sur cette ligne.");
      }
      e = { etat: r.etat, sortie: false, rdvIdAttente: null, evenements: [] };
    } else {
      const depart: readonly Etat[] | undefined =
        (GESTES_KONNECT as Record<string, readonly Etat[]>)[geste] ??
        (GESTES_SECRETAIRE as Record<string, readonly Etat[]>)[geste];
      if (!depart) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          statut: 400,
          erreur: `Le geste « ${geste} » n'existe pas.`,
        };
      }
      if (!depart.includes(r.etat)) {
        await client.query("ROLLBACK");
        return conflit(
          r.etat === "confirmation_en_cours"
            ? "Le patient confirme en ligne. Réessayez dans un instant."
            : "Ce patient a déjà changé d'état.",
        );
      }
      const calcul = calculer(r, geste as GesteKonnect | GesteSecretaire, d);
      if ("erreur" in calcul) {
        await client.query("ROLLBACK");
        return { ok: false, statut: 400, erreur: calcul.erreur };
      }
      e = calcul;
    }

    const maj = await client.query<{ version: number }>(
      `UPDATE "KonnectFileAttente"
          SET "etat"         = $3,
              "version"      = "version" + 1,
              "creneau"      = CASE WHEN $4::boolean THEN $5::jsonb ELSE "creneau" END,
              "reponseAvant" = CASE WHEN $6::boolean THEN $7::timestamptz ELSE "reponseAvant" END,
              "rdvIdAttente" = CASE WHEN $8::boolean THEN $9 ELSE "rdvIdAttente" END,
              "rdvId"        = CASE WHEN $10::boolean THEN $11 ELSE "rdvId" END,
              "sansReponse"  = COALESCE($12, "sansReponse"),
              "refusDate"    = COALESCE($13, "refusDate"),
              "propositions" = COALESCE($14, "propositions"),
              "sortieAt"     = CASE WHEN $15::boolean THEN NOW() ELSE "sortieAt" END,
              "sortiePar"    = CASE WHEN $15::boolean THEN $16 ELSE "sortiePar" END,
              "updatedAt"    = NOW()
        WHERE "id" = $1 AND "userProductId" = $2
        RETURNING "version"`,
      [
        id,
        userProductId,
        e.etat,
        e.creneau !== undefined,
        e.creneau === undefined || e.creneau === null
          ? null
          : JSON.stringify(e.creneau),
        e.reponseAvant !== undefined,
        e.reponseAvant ?? null,
        e.rdvIdAttente !== undefined,
        e.rdvIdAttente ?? null,
        e.rdvId !== undefined,
        e.rdvId ?? null,
        e.sansReponse ?? null,
        e.refusDate ?? null,
        e.propositions ?? null,
        e.sortie,
        options.par ?? null,
      ],
    );
    for (const type of e.evenements) {
      await client.query(
        `INSERT INTO "KonnectFileAttenteEvenement" ("userProductId", "inscriptionId", "codeExamen", "type")
         VALUES ($1, $2, $3, $4)`,
        [userProductId, id, r.codeExamen, type],
      );
    }
    await client.query("COMMIT");
    return { ok: true, id, etat: e.etat, version: maj.rows[0].version };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Retour en file : la place n'est plus à lui. Le RDV d'attente reste, à nettoyer. */
const RETOUR = {
  etat: ETATS.en_file,
  sortie: false,
  creneau: null,
  reponseAvant: null,
} as const;

function calculer(
  r: InscriptionRow,
  geste: GesteKonnect | GesteSecretaire,
  d: Donnees,
): Ecriture | { erreur: string } {
  switch (geste) {
    case "proposer": {
      // Un RDV d'attente d'une proposition précédente doit d'abord être relu et
      // supprimé : sinon deux places seraient tenues pour le même patient.
      if (r.rdvIdAttente !== null)
        return { erreur: "Libérez d'abord le RDV d'attente précédent." };
      const creneau = lireCreneau(d.creneau);
      const avant = texte(d.reponseAvant, 40);
      if (!creneau) return { erreur: "`creneau` est absent ou incomplet." };
      if (!avant || Number.isNaN(new Date(avant).getTime()))
        return { erreur: "`reponseAvant` est absent ou illisible." };
      return {
        etat: ETATS.proposition,
        sortie: false,
        creneau,
        reponseAvant: new Date(avant).toISOString(),
        propositions: r.propositions + 1,
        evenements: [EVENEMENTS.proposition],
      };
    }
    case "attacher_rdv": {
      const rdv = texte(d.rdvIdAttente, 40);
      if (!rdv) return { erreur: "`rdvIdAttente` est requis." };
      return { etat: r.etat, sortie: false, rdvIdAttente: rdv, evenements: [] };
    }
    case "commencer_confirmation":
      return {
        etat: ETATS.confirmation_en_cours,
        sortie: false,
        evenements: [],
      };
    case "confirmer": {
      const rdv = texte(d.rdvId, 40);
      if (!rdv) return { erreur: "`rdvId` est requis." };
      // Le RDV d'attente est devenu le vrai RDV, ou a été remplacé par lui.
      return {
        etat: ETATS.pris_par_la_file,
        sortie: true,
        rdvId: rdv,
        rdvIdAttente: null,
        reponseAvant: null,
        evenements: [EVENEMENTS.confirmation],
      };
    }
    case "echec_confirmation":
      return { ...RETOUR, evenements: [EVENEMENTS.echec_confirmation] };
    case "rendre":
      return { ...RETOUR, evenements: [EVENEMENTS.place_disparue] };
    case "refuser_date": {
      const refus = r.refusDate + 1;
      if (refus >= SORTIE_APRES_REFUS_DATE) {
        return {
          ...RETOUR,
          etat: ETATS.refus_repetes,
          sortie: true,
          refusDate: refus,
          evenements: [EVENEMENTS.refus_date, EVENEMENTS.sortie_refus_repetes],
        };
      }
      return {
        ...RETOUR,
        refusDate: refus,
        evenements: [EVENEMENTS.refus_date],
      };
    }
    case "delai_ecoule": {
      const sans = r.sansReponse + 1;
      if (sans >= SORTIE_APRES_SANS_REPONSE) {
        return {
          ...RETOUR,
          etat: ETATS.sans_reponse,
          sortie: true,
          sansReponse: sans,
          evenements: [EVENEMENTS.delai_ecoule, EVENEMENTS.sortie_sans_reponse],
        };
      }
      return {
        ...RETOUR,
        sansReponse: sans,
        evenements: [EVENEMENTS.delai_ecoule],
      };
    }
    case "plus_besoin":
      return {
        ...RETOUR,
        etat: ETATS.retire_patient,
        sortie: true,
        evenements: [EVENEMENTS.plus_besoin],
      };
    case "traiter":
      return {
        ...RETOUR,
        etat: ETATS.traite_secretaire,
        sortie: true,
        evenements: [EVENEMENTS.traite_secretaire],
      };
    case "retirer":
      return {
        ...RETOUR,
        etat: ETATS.retire_secretaire,
        sortie: true,
        evenements: [EVENEMENTS.retire_secretaire],
      };
  }
}
