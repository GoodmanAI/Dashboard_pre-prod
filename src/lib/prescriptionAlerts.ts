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
 * Cloture des alertes dont le RDV n'existe plus dans Xplore
 * ---------------------------------------------------------
 * Un RDV annule, ou deplace par le robot (editRDV recree le RDV puis annule
 * l'ancien), garde son alerte "ordonnance manquante" : la secretaire rappelait
 * un patient pour un RDV qui n'existe plus. Le Dashboard ne parle pas a Xplore ;
 * c'est AI2Xplore qui lit le statut des RDV (`GetStatutsExamens`, statut `S`)
 * et nous envoie les numeros supprimes. Voir
 * plans/2026-09-ordonnances-rdv-supprimes.md (workspace).
 *
 * Memes garde-fous que `autoResolvePastAppointments` : seules les lignes PENDING,
 * non resolues et non acquittees sont touchees, et `status` reste inchange.
 * L'`id` ET le `rdvId` doivent concorder : un id errone ne classe rien.
 *
 * @returns les lignes classees, avec le userProductId de leur centre pour
 *          prevenir les onglets ouverts.
 */
export async function resolveDeletedAppointments(
  items: { id: number; rdvId: string }[]
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
  try {
    await db.query(
      `
      INSERT INTO "PrescriptionAccessLog"
        ("uploadId", "action", "actorType", "success", "errorReason")
      SELECT unnest($1::int[]), 'alert_resolved', 'cron', true, 'auto:rdv_supprime'
      `,
      [ids]
    );
  } catch (err) {
    console.error("[prescriptions/alerts] audit log rdv supprime failed:", err);
  }

  const codes = Array.from(new Set(upd.rows.map((r) => r.externalCenterCode)));
  const map = await db.query<{ externalCenterCode: string; userProductId: number }>(
    `SELECT "externalCenterCode", "userProductId"
       FROM "ExternalCenterMapping"
      WHERE "externalCenterCode" = ANY($1::text[])`,
    [codes]
  );
  return upd.rows.map((r) => ({
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
