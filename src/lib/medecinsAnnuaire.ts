/**
 * L'annuaire des médecins d'un centre Talk, et ce qui en descend au robot.
 * -----------------------------------------------------------------------------
 * Plan `plans/2026-10-questions-sur-le-rdv-lyraetalk.md` (§7, 03/11/2026), décision du
 * 28/10 (« Le nom du médecin prévu »). Le patient demande « c'est avec quel médecin ? » ;
 * le robot relie le code médecin du créneau Xplore à un nom, seulement si le centre a
 * coché la case et nommé ce médecin.
 *
 * - Table `MedecinAnnuaire` (SQL manuel `2026_11_03_medecins_annuaire.sql`).
 * - Case et date de relecture : `ProductConfig`, domaine `talk.medecins`.
 * - Relecture : AI2Xplore `POST /api/test/medecins`, par le tunnel. Pas de cron : la
 *   carte du client relit la liste à l'ouverture si la dernière lecture a plus de
 *   7 jours, et le bouton « Relire » le fait à la demande. Un médecin nouveau arrive non
 *   nommé : le robot n'a besoin de rien tant que le client n'a pas agi.
 */
import { db } from "@/lib/db";
import { postAi2x, tunnelActif } from "@/lib/ai2xTunnel";

export const DOMAINE_MEDECINS = "talk.medecins";
export const RELECTURE_APRES_JOURS = 7;

export type MedecinLigne = {
  code: string;
  prefixe: string;
  prenom: string;
  nom: string;
  codesSites: string[];
  nomme: boolean;
  pasUnePersonne: boolean;
  nouveau: boolean;
  vuLe: string;
  absences: number;
};

export type ReglageMedecins = { actif: boolean; reluLe: string | null };

/** Ce que `init-config` porte dans `site.medecinsNommes` (contrat `init-config.md`). */
export type MedecinsNommes = {
  actif: boolean;
  medecins: Record<string, { prefixe: string; prenom: string; nom: string }>;
};

const PARTICULES = new Set(["de", "du", "des", "la", "le", "d", "van", "von", "da", "di"]);

/**
 * « JEAN-MARIE » → « Jean-Marie », « DE POMERREAU » → « de Pomerreau ». Xplore rend
 * tout en majuscules ; la synthèse vocale lit mieux en casse normale. Les accents
 * perdus ne se devinent pas : on n'en invente pas.
 */
export function casseNormale(brut: string): string {
  const mots = brut.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return mots
    .map((mot, i) => {
      // Une particule reste en minuscules, sauf si elle est le dernier mot (« LE » seul).
      if (i < mots.length - 1 && PARTICULES.has(mot)) return mot;
      return mot
        .split(/([-'])/)
        .map((p) => (p === "-" || p === "'" || !p ? p : p[0].toUpperCase() + p.slice(1)))
        .join("");
    })
    .join(" ");
}

/**
 * Un code qui n'est pas une personne : sans prénom, ou nommé comme un planning
 * (« GENERIQUE RDV ECHO » à Menton, « TELERADIOLOGUE » à Pontivy, « XPLORE
 * Radiologue »). Sonde du 03/11 : ces codes portent jusqu'à 100 % des créneaux d'un
 * centre. La relecture les marque ; le client peut quand même les nommer.
 */
export function pasUnePersonne(prenom: string, nom: string): boolean {
  if (!prenom.trim()) return true;
  return /^(GENERIQUE|TELERADIO|XPLORE)/i.test(nom.trim());
}

// ── Lecture ────────────────────────────────────────────────────────────────

export async function lireReglage(userProductId: number): Promise<ReglageMedecins> {
  const r = await db.query<{ valeur: any }>(
    `SELECT "valeur" FROM "ProductConfig" WHERE "userProductId" = $1 AND "domaine" = $2 LIMIT 1`,
    [userProductId, DOMAINE_MEDECINS]
  );
  const v = r.rows[0]?.valeur;
  return {
    actif: v?.actif === true,
    reluLe: typeof v?.reluLe === "string" ? v.reluLe : null,
  };
}

async function ecrireReglage(userProductId: number, reglage: ReglageMedecins): Promise<void> {
  await db.query(
    `INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
     VALUES ($1, $2, $3::jsonb, 1)
     ON CONFLICT ("userProductId", "domaine")
       DO UPDATE SET "valeur"    = EXCLUDED."valeur",
                     "version"   = "ProductConfig"."version" + 1,
                     "updatedAt" = NOW()`,
    [userProductId, DOMAINE_MEDECINS, JSON.stringify(reglage)]
  );
}

export async function lireAnnuaire(userProductId: number): Promise<MedecinLigne[]> {
  const r = await db.query<any>(
    `SELECT "code", "prefixe", "prenom", "nom", "codesSites", "nomme", "pasUnePersonne",
            "nouveau", "vuLe", "absences"
       FROM "MedecinAnnuaire"
      WHERE "userProductId" = $1
      ORDER BY "pasUnePersonne", "nom", "prenom", "code"`,
    [userProductId]
  );
  return r.rows.map((l) => ({
    code: l.code,
    prefixe: l.prefixe,
    prenom: l.prenom,
    nom: l.nom,
    codesSites: Array.isArray(l.codesSites) ? l.codesSites : [],
    nomme: l.nomme === true,
    pasUnePersonne: l.pasUnePersonne === true,
    nouveau: l.nouveau === true,
    vuLe: new Date(l.vuLe).toISOString(),
    absences: Number(l.absences) || 0,
  }));
}

/** Le bloc `site.medecinsNommes` d'`init-config` : seulement les nommés, case cochée. */
export async function medecinsNommesPourRobot(userProductId: number): Promise<MedecinsNommes> {
  const reglage = await lireReglage(userProductId);
  if (!reglage.actif) return { actif: false, medecins: {} };
  const r = await db.query<{ code: string; prefixe: string; prenom: string; nom: string }>(
    `SELECT "code", "prefixe", "prenom", "nom" FROM "MedecinAnnuaire"
      WHERE "userProductId" = $1 AND "nomme" = true`,
    [userProductId]
  );
  const medecins: MedecinsNommes["medecins"] = {};
  for (const l of r.rows) {
    medecins[l.code] = {
      prefixe: (l.prefixe || "").toUpperCase(),
      prenom: casseNormale(l.prenom || ""),
      nom: casseNormale(l.nom || ""),
    };
  }
  return { actif: true, medecins };
}

// ── Écriture du client ─────────────────────────────────────────────────────

/**
 * Enregistre la case et les choix. `nommes` ne porte que les codes que l'écran
 * connaît : un code arrivé entre-temps garde son état (non nommé). Tout enregistrement
 * retire la marque « Nouveau » des lignes vues.
 */
export async function enregistrerChoix(
  userProductId: number,
  actif: boolean,
  nommes: Record<string, boolean>
): Promise<void> {
  const reglage = await lireReglage(userProductId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const codes = Object.keys(nommes);
    if (codes.length > 0) {
      const oui = codes.filter((c) => nommes[c] === true);
      const non = codes.filter((c) => nommes[c] !== true);
      await client.query(
        `UPDATE "MedecinAnnuaire" SET "nomme" = true, "nouveau" = false, "modifieLe" = now()
          WHERE "userProductId" = $1 AND "code" = ANY($2::text[])`,
        [userProductId, oui]
      );
      await client.query(
        `UPDATE "MedecinAnnuaire" SET "nomme" = false, "nouveau" = false, "modifieLe" = now()
          WHERE "userProductId" = $1 AND "code" = ANY($2::text[])`,
        [userProductId, non]
      );
    }
    await client.query(
      `INSERT INTO "ProductConfig" ("userProductId", "domaine", "valeur", "version")
       VALUES ($1, $2, $3::jsonb, 1)
       ON CONFLICT ("userProductId", "domaine")
         DO UPDATE SET "valeur"    = EXCLUDED."valeur",
                       "version"   = "ProductConfig"."version" + 1,
                       "updatedAt" = NOW()`,
      [userProductId, DOMAINE_MEDECINS, JSON.stringify({ ...reglage, actif })]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── Relecture depuis Xplore ────────────────────────────────────────────────

type MedecinXplore = { code: string; prefixe: string; prenom: string; nom: string; codesSites: string[] };

export type ResultatRelecture =
  | { ok: true; lus: number; nouveaux: number; codesSites: string[] }
  | { ok: false; raison: "tunnel_eteint" | "sans_site" | "xplore" | "trop_de_releves"; codeSite?: string };

/** Les codes de site du centre (« Identifiants externes »). */
export async function codesSitesDuCentre(userProductId: number): Promise<string[]> {
  const r = await db.query<{ code: string }>(
    `SELECT "externalCenterCode" AS "code" FROM "ExternalCenterMapping"
      WHERE "userProductId" = $1 ORDER BY "id"`,
    [userProductId]
  );
  return [...new Set(r.rows.map((l) => String(l.code || "").trim().toUpperCase()).filter(Boolean))];
}

function lireReponse(corps: any): MedecinXplore[] | null {
  const liste = corps?.data?.medecins;
  if (!Array.isArray(liste)) return null;
  const sortie: MedecinXplore[] = [];
  for (const m of liste) {
    const code = typeof m?.code === "string" ? m.code.trim() : "";
    if (!code || code.length > 40) continue;
    sortie.push({
      code,
      prefixe: String(m.prefixe ?? "").trim().toUpperCase().slice(0, 10),
      prenom: String(m.prenom ?? "").trim().slice(0, 80),
      nom: String(m.nom ?? "").trim().slice(0, 120),
      codesSites: Array.isArray(m.codesSites) ? m.codesSites.map((s: unknown) => String(s)).slice(0, 50) : [],
    });
  }
  return sortie;
}

/**
 * Relit la liste dans Xplore, pour chaque code de site du centre (une base peut en
 * porter plusieurs ; les codes sont fusionnés). Ajoute les nouveaux (non nommés,
 * « Nouveau »), met à jour nom et préfixe des connus, compte une absence aux codes
 * qui manquent. Ne supprime rien, ne touche jamais `nomme`.
 */
export async function relireAnnuaire(userProductId: number): Promise<ResultatRelecture> {
  if (!tunnelActif()) return { ok: false, raison: "tunnel_eteint" };
  const sites = await codesSitesDuCentre(userProductId);
  if (sites.length === 0) return { ok: false, raison: "sans_site" };

  const parCode = new Map<string, MedecinXplore>();
  for (const codeSite of sites) {
    const { status, corps } = await postAi2x("/api/test/medecins", { codeSite });
    if (status === 429) return { ok: false, raison: "trop_de_releves", codeSite };
    const liste = status === 200 ? lireReponse(corps) : null;
    if (!liste) return { ok: false, raison: "xplore", codeSite };
    for (const m of liste) if (!parCode.has(m.code)) parCode.set(m.code, m);
  }

  const client = await db.connect();
  let nouveaux = 0;
  try {
    await client.query("BEGIN");
    for (const m of parCode.values()) {
      const r = await client.query<{ insere: boolean }>(
        `INSERT INTO "MedecinAnnuaire"
           ("userProductId", "code", "prefixe", "prenom", "nom", "codesSites", "pasUnePersonne")
         VALUES ($1, $2, $3, $4, $5, $6::text[], $7)
         ON CONFLICT ("userProductId", "code") DO UPDATE
           SET "prefixe" = EXCLUDED."prefixe", "prenom" = EXCLUDED."prenom",
               "nom" = EXCLUDED."nom", "codesSites" = EXCLUDED."codesSites",
               "pasUnePersonne" = EXCLUDED."pasUnePersonne",
               "vuLe" = now(), "absences" = 0, "modifieLe" = now()
         RETURNING (xmax = 0) AS "insere"`,
        [userProductId, m.code, m.prefixe, m.prenom, m.nom, m.codesSites, pasUnePersonne(m.prenom, m.nom)]
      );
      if (r.rows[0]?.insere) nouveaux++;
    }
    await client.query(
      `UPDATE "MedecinAnnuaire" SET "absences" = "absences" + 1
        WHERE "userProductId" = $1 AND NOT ("code" = ANY($2::text[]))`,
      [userProductId, [...parCode.keys()]]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const reglage = await lireReglage(userProductId);
  await ecrireReglage(userProductId, { ...reglage, reluLe: new Date().toISOString() });
  return { ok: true, lus: parCode.size, nouveaux, codesSites: sites };
}

/** Faut-il relire à l'ouverture de la carte ? Jamais lu, ou plus de 7 jours. */
export function relectureDue(reglage: ReglageMedecins, maintenant = Date.now()): boolean {
  if (!reglage.reluLe) return true;
  const t = Date.parse(reglage.reluLe);
  return !Number.isFinite(t) || maintenant - t > RELECTURE_APRES_JOURS * 86400000;
}
