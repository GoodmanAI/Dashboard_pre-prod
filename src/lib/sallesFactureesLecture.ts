/**
 * Lecture en base des salles d'un client (table `Salle`) et des tarifs (`TarifSalle`).
 * Plan : `lyrae/plans/2026-11-salles-facturees-talk-konnect.md`.
 *
 * Séparé de `sallesFacturees.ts`, importé par les écrans : le pool `pg` n'a rien à
 * faire dans le navigateur.
 *
 * TABLE ABSENTE (le SQL `2026_11_02_salles_facturees.sql` pas encore passé) : la
 * lecture rend `null`, et les appelants retombent sur les anciennes déclarations. Le
 * code peut ainsi partir avant la donnée sans rien casser.
 */

import { db } from "@/lib/db";
import { produitDepuisNom } from "@/lib/produits";
import { EXAM_TYPES, type ExamType } from "@/lib/examTypes";
import {
  comparerSites,
  TARIFS_PAR_DEFAUT,
  type LigneSalle,
  type SalleEcrite,
  type Tarifs,
} from "@/lib/sallesFacturees";

const EST_TYPE = new Set<string>(EXAM_TYPES);

/** `42P01` : la relation n'existe pas. */
function tableAbsente(e: unknown): boolean {
  return (e as { code?: string })?.code === "42P01";
}

type Brute = {
  id: number;
  codeSite: string | null;
  poste: string;
  typeExamen: string;
  libelle: string;
  talk: boolean;
  konnect: boolean;
};

function versLigne(r: Brute): LigneSalle | null {
  if (!EST_TYPE.has(r.typeExamen)) return null;
  return {
    id: r.id,
    codeSite: r.codeSite,
    poste: r.poste,
    typeExamen: r.typeExamen as ExamType,
    libelle: r.libelle,
    talk: r.talk,
    konnect: r.konnect,
  };
}

const COLONNES = `"id", "codeSite", "poste", "typeExamen", "libelle", "talk", "konnect"`;

/** Les salles d'un client, dans l'ordre type puis code. `null` si la table manque. */
export async function sallesDuClient(userId: number): Promise<LigneSalle[] | null> {
  try {
    const res = await db.query<Brute>(
      `SELECT ${COLONNES} FROM "Salle" WHERE "userId" = $1 ORDER BY "typeExamen", "poste"`,
      [userId]
    );
    return res.rows.map(versLigne).filter((l): l is LigneSalle => l !== null);
  } catch (e) {
    if (tableAbsente(e)) return null;
    throw e;
  }
}

/** Les salles du client qui possède ce `UserProduct`. `null` si la table manque. */
export async function sallesDuUserProduct(userProductId: number): Promise<LigneSalle[] | null> {
  try {
    const res = await db.query<Brute>(
      `SELECT ${COLONNES.split(", ").map((c) => `s.${c}`).join(", ")}
         FROM "Salle" s JOIN "UserProduct" up ON up."userId" = s."userId"
        WHERE up."id" = $1
        ORDER BY s."typeExamen", s."poste"`,
      [userProductId]
    );
    return res.rows.map(versLigne).filter((l): l is LigneSalle => l !== null);
  } catch (e) {
    if (tableAbsente(e)) return null;
    throw e;
  }
}

/**
 * Version des salles d'un client, pour l'ETag du catalogue de Konnect : cocher ou
 * décocher une salle doit changer le catalogue servi. 0 si rien.
 */
export async function versionSallesDuUserProduct(userProductId: number): Promise<number> {
  try {
    const res = await db.query<{ v: Date | null; n: string }>(
      `SELECT MAX(s."updatedAt") AS v, COUNT(*)::text AS n
         FROM "Salle" s JOIN "UserProduct" up ON up."userId" = s."userId"
        WHERE up."id" = $1`,
      [userProductId]
    );
    const r = res.rows[0];
    return r?.v ? r.v.getTime() + Number(r.n) : 0;
  } catch (e) {
    if (tableAbsente(e)) return 0;
    throw e;
  }
}

export async function lireTarifs(): Promise<Tarifs> {
  try {
    const res = await db.query<{ produit: string; prixMensuelTtcCts: number }>(
      `SELECT "produit", "prixMensuelTtcCts" FROM "TarifSalle"`
    );
    const sortie: Tarifs = { ...TARIFS_PAR_DEFAUT };
    for (const r of res.rows) {
      if (r.produit === "talk" || r.produit === "konnect") sortie[r.produit] = r.prixMensuelTtcCts;
    }
    return sortie;
  } catch (e) {
    if (tableAbsente(e)) return { ...TARIFS_PAR_DEFAUT };
    throw e;
  }
}

/**
 * Remplace les salles d'un client par la liste donnée, dans une transaction. Une salle
 * qui garde son code garde sa ligne (`updatedAt` touché seulement si elle change).
 * Rend ce qui a changé, pour l'audit : postes ajoutés, retirés, cases modifiées.
 */
export async function ecrireSallesDuClient(
  userId: number,
  salles: SalleEcrite[]
): Promise<{ ajoutees: string[]; retirees: string[]; modifiees: string[] }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const avant = await client.query<Brute>(
      `SELECT ${COLONNES} FROM "Salle" WHERE "userId" = $1 FOR UPDATE`,
      [userId]
    );
    const parPoste = new Map(avant.rows.map((r) => [r.poste, r]));
    const gardes = new Set(salles.map((s) => s.poste));
    const retirees = avant.rows.filter((r) => !gardes.has(r.poste)).map((r) => r.poste);
    const ajoutees: string[] = [];
    const modifiees: string[] = [];

    if (retirees.length > 0) {
      await client.query(`DELETE FROM "Salle" WHERE "userId" = $1 AND "poste" = ANY($2)`, [
        userId,
        retirees,
      ]);
    }
    for (const s of salles) {
      const a = parPoste.get(s.poste);
      if (!a) {
        ajoutees.push(s.poste);
        await client.query(
          `INSERT INTO "Salle" ("userId", "codeSite", "poste", "typeExamen", "libelle", "talk", "konnect")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, s.codeSite, s.poste, s.typeExamen, s.libelle, s.talk, s.konnect]
        );
        continue;
      }
      const change =
        a.codeSite !== s.codeSite ||
        a.typeExamen !== s.typeExamen ||
        a.libelle !== s.libelle ||
        a.talk !== s.talk ||
        a.konnect !== s.konnect;
      if (!change) continue;
      modifiees.push(s.poste);
      await client.query(
        `UPDATE "Salle" SET "codeSite" = $3, "typeExamen" = $4, "libelle" = $5,
                "talk" = $6, "konnect" = $7, "updatedAt" = NOW()
          WHERE "userId" = $1 AND "poste" = $2`,
        [userId, s.poste, s.codeSite, s.typeExamen, s.libelle, s.talk, s.konnect]
      );
    }
    // Une salle retirée doit aussi changer la version vue par Konnect : on touche les
    // lignes restantes (le MAX(updatedAt) ne bouge pas sur un simple DELETE).
    if (retirees.length > 0) {
      await client.query(`UPDATE "Salle" SET "updatedAt" = NOW() WHERE "userId" = $1`, [userId]);
    }
    await client.query("COMMIT");
    return { ajoutees, retirees, modifiees };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function ecrireTarifs(tarifs: Tarifs): Promise<void> {
  for (const [produit, cts] of Object.entries(tarifs)) {
    await db.query(
      `INSERT INTO "TarifSalle" ("produit", "prixMensuelTtcCts", "updatedAt") VALUES ($1, $2, NOW())
       ON CONFLICT ("produit") DO UPDATE SET "prixMensuelTtcCts" = EXCLUDED."prixMensuelTtcCts", "updatedAt" = NOW()`,
      [produit, cts]
    );
  }
}

// ── Le client, ses produits et ses sites ────────────────────────────────────

export type ClientSalles = {
  userId: number;
  nom: string;
  /** `userProductId` actif par produit, `null` si le client n'a pas le produit. */
  produits: { talk: number | null; konnect: number | null };
  /** Les `codeSite` Xplore connus du client : sites et groupes de Talk, rattachement de Konnect. */
  sites: string[];
};

function codesDe(valeur: unknown, sortie: Set<string>) {
  if (typeof valeur === "string") {
    const c = valeur.trim().toUpperCase();
    if (c) sortie.add(c);
  } else if (Array.isArray(valeur)) {
    for (const v of valeur) codesDe(v, sortie);
  }
}

/** `null` si le client n'existe pas. */
export async function clientSalles(userId: number): Promise<ClientSalles | null> {
  const user = await db.query<{ id: number; name: string | null; email: string | null }>(
    `SELECT "id", "name", "email" FROM "User" WHERE "id" = $1`,
    [userId]
  );
  if ((user.rowCount ?? 0) === 0) return null;

  const ups = await db.query<{ id: number; nom: string }>(
    `SELECT up."id", p."name" AS "nom" FROM "UserProduct" up
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."userId" = $1 AND up."removedAt" IS NULL
      ORDER BY up."id"`,
    [userId]
  );
  const produits: ClientSalles["produits"] = { talk: null, konnect: null };
  for (const r of ups.rows) {
    const p = produitDepuisNom(r.nom);
    if (p && produits[p.slug] === null) produits[p.slug] = r.id;
  }

  const ids = ups.rows.map((r) => r.id);
  const sites = new Set<string>();
  if (ids.length > 0) {
    const cfg = await db.query<{ domaine: string; valeur: any }>(
      `SELECT "domaine", "valeur" FROM "ProductConfig"
        WHERE "userProductId" = ANY($1) AND "domaine" IN ('talk.site', 'konnect.ris-identite')`,
      [ids]
    );
    for (const r of cfg.rows) {
      const v = r.valeur && typeof r.valeur === "object" ? r.valeur : {};
      if (r.domaine === "talk.site") {
        if (v.siteCodeToName && typeof v.siteCodeToName === "object") {
          codesDe(Object.keys(v.siteCodeToName), sites);
        }
        if (v.risCode && typeof v.risCode === "object") {
          for (const liste of Object.values(v.risCode)) codesDe(liste, sites);
        }
      } else {
        codesDe(v.code_site, sites);
      }
    }
  }
  const lignes = await sallesDuClient(userId);
  for (const l of lignes ?? []) if (l.codeSite) sites.add(l.codeSite);

  return {
    userId,
    nom: user.rows[0].name?.trim() || user.rows[0].email || `Client ${userId}`,
    produits,
    sites: [...sites].sort(),
  };
}

// ── Facturation, tous clients ───────────────────────────────────────────────

export type LigneFacturation = {
  userId: number;
  nom: string;
  codeSite: string | null;
  talk: number;
  konnect: number;
  /** Le client a le produit mais aucune salle cochée : à régler. */
  aRegler: ("talk" | "konnect")[];
};

/**
 * Une ligne par client et par site : salles cochées par produit. Un client qui a Talk
 * ou Konnect sans aucune salle cochée apparaît aussi, montant nul, « à régler ».
 */
export async function lignesFacturation(): Promise<LigneFacturation[]> {
  const clients = await db.query<{ userId: number; nom: string; produit: string }>(
    `SELECT u."id" AS "userId", COALESCE(NULLIF(btrim(u."name"), ''), u."email") AS "nom",
            p."name" AS "produit"
       FROM "UserProduct" up
       JOIN "User" u ON u."id" = up."userId"
       JOIN "Product" p ON p."id" = up."productId"
      WHERE up."removedAt" IS NULL`
  );
  const produitsParClient = new Map<number, { nom: string; slugs: Set<"talk" | "konnect"> }>();
  for (const r of clients.rows) {
    const p = produitDepuisNom(r.produit);
    if (!p) continue;
    const c = produitsParClient.get(r.userId) ?? { nom: r.nom, slugs: new Set() };
    c.slugs.add(p.slug);
    produitsParClient.set(r.userId, c);
  }

  let salles: { userId: number; codeSite: string | null; talk: string; konnect: string }[] = [];
  try {
    const res = await db.query<{ userId: number; codeSite: string | null; talk: string; konnect: string }>(
      `SELECT "userId", "codeSite",
              count(*) FILTER (WHERE "talk")::text AS "talk",
              count(*) FILTER (WHERE "konnect")::text AS "konnect"
         FROM "Salle" GROUP BY "userId", "codeSite"`
    );
    salles = res.rows;
  } catch (e) {
    if (!tableAbsente(e)) throw e;
  }

  const sortie: LigneFacturation[] = [];
  for (const [userId, c] of produitsParClient) {
    const siennes = salles.filter((s) => s.userId === userId);
    const total = { talk: 0, konnect: 0 };
    for (const s of siennes) {
      total.talk += Number(s.talk);
      total.konnect += Number(s.konnect);
    }
    const aRegler = (["talk", "konnect"] as const).filter((p) => c.slugs.has(p) && total[p] === 0);
    const avecSalles = siennes.filter((s) => Number(s.talk) + Number(s.konnect) > 0);
    if (avecSalles.length === 0) {
      sortie.push({ userId, nom: c.nom, codeSite: null, talk: 0, konnect: 0, aRegler });
      continue;
    }
    for (const s of avecSalles) {
      sortie.push({
        userId,
        nom: c.nom,
        codeSite: s.codeSite,
        talk: Number(s.talk),
        konnect: Number(s.konnect),
        aRegler,
      });
    }
  }
  return sortie.sort(
    (a, b) => a.nom.localeCompare(b.nom, "fr") || comparerSites(a.codeSite, b.codeSite)
  );
}
