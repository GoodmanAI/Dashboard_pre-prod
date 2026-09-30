/**
 * Regles communes aux deux lectures d'alertes "ordonnance manquante" :
 * /api/prescriptions/alerts (la liste de la page secretaire) et
 * /api/prescriptions/alerts/count (le badge navbar).
 *
 * Cloture automatique des RDV passes
 * ----------------------------------
 * Une alerte "le patient n'a pas depose son ordonnance" n'a plus d'objet une
 * fois la date du RDV depassee : l'examen a eu lieu (ou le patient ne s'est
 * pas presente), rappeler le patient ne sert plus a rien. Ces lignes restaient
 * pourtant dans la liste jusqu'a ce qu'une secretaire clique "Marquer traite"
 * une par une.
 *
 * On les resout donc automatiquement, cote serveur, au chargement de la liste
 * (voir `autoResolvePastAppointments`). Meme effet qu'un clic sur le bouton :
 * `alertResolvedAt` est pose, `status` reste inchange — le RDV reste "sans
 * ordonnance" du point de vue metier, c'est seulement l'alerte qui est classee.
 *
 * La journee civile de reference est Europe/Paris, comme partout ailleurs dans
 * le module ordonnances (PrescriptionStats, /stats, /init...). Un RDV prevu
 * aujourd'hui n'est jamais concerne, meme s'il est deja passe a l'heure pres :
 * la secretaire garde sa journee pour joindre le patient.
 */

import { db } from "./db";

/**
 * Predicat SQL "le RDV est anterieur au jour courant".
 * Fragment sans parametre, interpolable tel quel dans un WHERE — les colonnes
 * sont en dur, aucune valeur utilisateur n'y entre.
 *
 * `appointmentDate` NULL n'est jamais considere comme passe : sans date on ne
 * peut rien conclure, l'alerte reste ouverte.
 */
export const PAST_APPOINTMENT_SQL = `(
  "appointmentDate" IS NOT NULL
  AND ("appointmentDate" AT TIME ZONE 'Europe/Paris')::date
      < (NOW() AT TIME ZONE 'Europe/Paris')::date
)`;

/**
 * Marque comme traitees toutes les alertes pending d'un centre dont le RDV est
 * anterieur a aujourd'hui.
 *
 * Memes garde-fous que POST /alerts/[id]/resolve : on ne touche qu'aux lignes
 * PENDING, non deja resolues et non acquittees par AI2Xplore.
 *
 * Volontairement independant du `hoursThreshold` de l'UI : le seuil ne fait que
 * decider a partir de quand une alerte devient *visible*, alors qu'un RDV passe
 * est definitivement caduc. Cela evite qu'une ligne caduque reapparaisse parce
 * que la secretaire a elargi la timeline.
 *
 * @param codes externalCenterCodes du centre (resolus via ExternalCenterMapping)
 * @returns le nombre de lignes classees
 */
export async function autoResolvePastAppointments(
  codes: string[]
): Promise<number> {
  if (codes.length === 0) return 0;

  const upd = await db.query<{ id: number }>(
    `
    UPDATE "PrescriptionUpload"
       SET "alertResolvedAt" = NOW()
     WHERE "externalCenterCode" = ANY($1::text[])
       AND "status" = 'PENDING'
       AND "alertResolvedAt" IS NULL
       AND "ackedAt" IS NULL
       AND ${PAST_APPOINTMENT_SQL}
    RETURNING "id"
    `,
    [codes]
  );

  const ids = upd.rows.map((r) => r.id);
  if (ids.length === 0) return 0;

  // Audit trail : actorType='cron' et pas 'session'. La requete part bien d'une
  // session secretaire, mais aucune humaine n'a decide de classer ces alertes —
  // c'est cette distinction que le log doit conserver.
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "action", "actorType", "success", "errorReason")
      SELECT unnest($1::int[]), 'alert_resolved', 'cron', true, 'auto:past_appointment'
      `,
      [ids]
    );
  } catch (err) {
    console.error("[prescriptions/alerts] audit log auto-resolve failed:", err);
  }

  return ids.length;
}

/**
 * Cloture des alertes d'apres le statut du RDV dans Xplore
 * --------------------------------------------------------
 * Le Dashboard ne parle pas a Xplore ; c'est AI2Xplore qui lit le statut des
 * RDV (`GetStatutsExamens`) et nous envoie ceux dont l'alerte n'a plus d'objet.
 * Deux motifs, journalises `auto:rdv_<motif>` :
 *   - `supprime` (statut `S`) : RDV annule, ou deplace par le robot (editRDV
 *     recree le RDV puis annule l'ancien). La secretaire rappelait un patient
 *     pour un RDV qui n'existe plus.
 *   - `accueilli` (statut `0`, `X`, `1`+) : le patient est venu, l'examen est
 *     fait ; l'ordonnance a ete vue a l'accueil ou ne sert plus.
 * Voir plans/2026-09-ordonnances-rdv-supprimes.md (workspace).
 *
 * Memes garde-fous que `autoResolvePastAppointments` : seules les lignes PENDING,
 * non resolues et non acquittees sont touchees, et `status` reste inchange.
 * L'`id` ET le `rdvId` doivent concorder : un id errone ne classe rien.
 *
 * @returns les lignes classees, avec le userProductId de leur centre pour
 *          prevenir les onglets ouverts.
 */
export const MOTIFS_CLOTURE = ["supprime", "accueilli"] as const;
export type MotifCloture = (typeof MOTIFS_CLOTURE)[number];

export async function classerAlertesRdv(
  items: { id: number; rdvId: string; motif: MotifCloture }[]
): Promise<{ id: number; userProductIds: number[] }[]> {
  if (items.length === 0) return [];

  const upd = await db.query<{ id: number; externalCenterCode: string }>(
    `
    UPDATE "PrescriptionUpload" pu
       SET "alertResolvedAt" = NOW()
      FROM unnest($1::int[], $2::text[]) AS v("id", "rdvId")
     WHERE pu."id" = v."id"
       AND pu."rdvId" = v."rdvId"
       AND pu."status" = 'PENDING'
       AND pu."alertResolvedAt" IS NULL
       AND pu."ackedAt" IS NULL
    RETURNING pu."id", pu."externalCenterCode"
    `,
    [items.map((i) => i.id), items.map((i) => i.rdvId)]
  );
  if (upd.rows.length === 0) return [];

  const ids = upd.rows.map((r) => r.id);
  const motifDe = new Map(items.map((i) => [i.id, i.motif]));
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "action", "actorType", "success", "errorReason")
      SELECT u, 'alert_resolved', 'cron', true, 'auto:rdv_' || m
        FROM unnest($1::int[], $2::text[]) AS v(u, m)
      `,
      [ids, ids.map((id) => motifDe.get(id) ?? "supprime")]
    );
  } catch (err) {
    console.error("[prescriptions/alerts] audit log cloture rdv failed:", err);
  }

  return avecCentres(upd.rows);
}

/**
 * Report de la date d'un RDV deplace dans Xplore EN GARDANT SON NUMERO
 * --------------------------------------------------------------------
 * Le RDV existe toujours, l'alerte reste ouverte, mais la carte affichait
 * l'ancien jour et le classement des RDV passes tombait au mauvais moment.
 * AI2Xplore ne l'envoie que si le JOUR differe : l'heure de Xplore n'est pas
 * toujours celle de l'examen (a Pontivy, 20 a 30 min plus tot selon le type,
 * vraisemblablement l'heure de convocation), et comparer les heures ferait
 * bouger toutes les cartes du centre.
 *
 * La date recue est l'heure LOCALE de Xplore ('AAAA-MM-JJ' + 'HH:MM'), castee
 * en `timestamp` puis situee a Europe/Paris, jamais un objet Date (cf. le
 * decalage de deux heures des bornes en SQL brut).
 *
 * `expiresAt` suit la meme regle qu'a l'init : min(date du RDV, creation + 30 j).
 * Sans cela, un RDV repousse gardait un lien de depot qui expirait a l'ancienne
 * date, et le patient ne pouvait plus deposer son ordonnance.
 *
 * Pas d'entree dans PrescriptionAccessLog : sa liste d'actions est fermee par
 * une contrainte, et ce n'est pas un acces aux donnees du patient. La trace est
 * dans le log du process (id, ancien et nouveau jour, sans donnee patient).
 */
export async function reporterDateRdv(
  items: { id: number; rdvId: string; date: string; heure: string }[]
): Promise<{ id: number; userProductIds: number[] }[]> {
  if (items.length === 0) return [];

  const upd = await db.query<{
    id: number;
    externalCenterCode: string;
    avant: string | null;
    apres: string;
  }>(
    `
    WITH v AS (
      SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS v("id", "rdvId", "quand")
    ), avant AS (
      SELECT pu."id", pu."appointmentDate" AS "ancienne"
        FROM "PrescriptionUpload" pu JOIN v ON v."id" = pu."id"
    )
    UPDATE "PrescriptionUpload" pu
       SET "appointmentDate" = (v."quand"::timestamp AT TIME ZONE 'Europe/Paris'),
           "expiresAt" = LEAST(
             (v."quand"::timestamp AT TIME ZONE 'Europe/Paris'),
             pu."createdAt" + INTERVAL '30 days'
           )
      FROM v, avant
     WHERE pu."id" = v."id"
       AND avant."id" = v."id"
       AND pu."rdvId" = v."rdvId"
       AND pu."status" = 'PENDING'
       AND pu."alertResolvedAt" IS NULL
       AND pu."ackedAt" IS NULL
    RETURNING pu."id", pu."externalCenterCode",
              to_char(avant."ancienne" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS "avant",
              to_char(pu."appointmentDate" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS "apres"
    `,
    [
      items.map((i) => i.id),
      items.map((i) => i.rdvId),
      items.map((i) => `${i.date} ${i.heure}`),
    ]
  );

  for (const r of upd.rows) {
    console.log(`[prescriptions/alerts] rdv deplace dans Xplore : upload ${r.id} ${r.avant} -> ${r.apres}`);
  }
  return avecCentres(upd.rows);
}

/** Le userProductId des centres des lignes touchees, pour prevenir les onglets. */
async function avecCentres(
  rows: { id: number; externalCenterCode: string }[]
): Promise<{ id: number; userProductIds: number[] }[]> {
  if (rows.length === 0) return [];
  const codes = Array.from(new Set(rows.map((r) => r.externalCenterCode)));
  const map = await db.query<{ externalCenterCode: string; userProductId: number }>(
    `SELECT "externalCenterCode", "userProductId"
       FROM "ExternalCenterMapping"
      WHERE "externalCenterCode" = ANY($1::text[])`,
    [codes]
  );
  return rows.map((r) => ({
    id: r.id,
    userProductIds: map.rows
      .filter((m) => m.externalCenterCode === r.externalCenterCode)
      .map((m) => m.userProductId),
  }));
}

/**
 * Codes centre d'un appel machine (AI2Xplore) : `externalCenterCode` et/ou
 * `userProductId` en CSV, comme /api/prescriptions/pending. `null` : aucun
 * filtre fourni (400). Tableau vide : filtre fourni mais aucun centre.
 */
export async function centresDuFiltre(
  params: URLSearchParams
): Promise<string[] | null> {
  const csv = (raw: string | null) =>
    raw
      ? Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)))
      : [];
  const codes = csv(params.get("externalCenterCode"));
  const upids = csv(params.get("userProductId"))
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (codes.length === 0 && upids.length === 0) return null;

  let resolus: string[] | null = null;
  if (upids.length > 0) {
    const res = await db.query<{ externalCenterCode: string }>(
      `SELECT DISTINCT m."externalCenterCode"
         FROM "ExternalCenterMapping" m
         JOIN "UserProduct" up ON up."id" = m."userProductId"
        WHERE m."userProductId" = ANY($1::int[])
          AND up."removedAt" IS NULL`,
      [upids]
    );
    resolus = res.rows.map((r) => r.externalCenterCode);
  }
  // Les deux filtres ensemble : intersection, comme /pending.
  if (codes.length > 0 && resolus) return codes.filter((c) => resolus!.includes(c));
  return resolus ?? codes;
}
