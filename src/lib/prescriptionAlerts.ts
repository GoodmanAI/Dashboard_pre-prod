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
