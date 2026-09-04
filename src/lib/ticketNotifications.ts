/**
 * Templates et orchestration des notifications email liees aux tickets support.
 *
 * 2 events envoient un mail (choix produit) :
 *   1. Nouveau ticket cree      -> mail au support admin (SUPPORT_ADMIN_EMAIL)
 *   2. Ticket resolu ou ferme   -> mail au client (email User.email)
 *
 * Les autres events (nouveau message chat, ticket pris en charge sans
 * cloture, etc.) sont traces uniquement en notification in-app via le model
 * Notification (aucun mail pour eviter le spam).
 *
 * Toutes les fonctions ne throw jamais : elles log en warn/error si le mail
 * echoue mais ne bloquent pas le flow metier (creation/mise a jour ticket
 * reussissent meme si Brevo est down).
 */

import { escapeHtml, sendEmail } from "./brevoMailer";
import { ACCENT } from "./accent";

/**
 * `User.email` n'est pas toujours une adresse : les comptes historiques portent
 * un identifiant libre (« menton », « epsilon »), comme le rappelle deja
 * `/api/admin/reset-password`. Brevo refuse alors l'envoi ENTIER avec un 400,
 * y compris quand la valeur ne sert que de `replyTo`. Il faut donc filtrer
 * avant d'appeler, jamais apres.
 */
function estAdresseEmail(v: string | null | undefined): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const DASHBOARD_URL =
  process.env.DASHBOARD_PUBLIC_URL ?? "https://dashboard.neuracorp.ai";

interface NewTicketContext {
  ticketId: number;
  subject: string;
  message: string;
  clientEmail: string;
  clientName: string | null;
  /** Adresse de contact saisie a la creation du ticket, validee cote schema. */
  contactEmail: string | null;
  createdByEmail: string;
  createdByName: string | null;
  userProductLabel: string | null;
}

/**
 * Envoye a l'admin support (SUPPORT_ADMIN_EMAIL, defaut enzo@neuracorp.ai)
 * chaque fois qu'un client cree un nouveau ticket.
 */
export async function notifyNewTicketToAdmin(ctx: NewTicketContext) {
  const adminEmail =
    process.env.SUPPORT_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn(
      "[ticketNotifications] SUPPORT_ADMIN_EMAIL absent — skip notif new ticket"
    );
    return { ok: false, error: "no admin email" };
  }

  const ticketUrl = `${DASHBOARD_URL}/admin/ticket/${ctx.ticketId}`;
  const centerLine = ctx.userProductLabel
    ? `<p><strong>Centre :</strong> ${escapeHtml(ctx.userProductLabel)}</p>`
    : "";
  const impersonationLine =
    ctx.createdByEmail !== ctx.clientEmail
      ? `<p style="color:#666;font-size:12px;">Cree pour le compte de ${escapeHtml(ctx.clientEmail)} par ${escapeHtml(ctx.createdByEmail)}.</p>`
      : "";

  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:auto;">
  <div style="background:${ACCENT};color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;">Nouveau ticket support #${ctx.ticketId}</h2>
  </div>
  <div style="border:1px solid #e0e0e0;border-top:0;padding:20px;border-radius:0 0 8px 8px;">
    <p><strong>Client :</strong> ${escapeHtml(ctx.clientName ?? ctx.clientEmail)}<br/>
       <span style="color:#666;font-size:13px;">${escapeHtml(ctx.clientEmail)}</span></p>
    ${centerLine}
    <p><strong>Sujet :</strong> ${escapeHtml(ctx.subject)}</p>
    <div style="background:#f5f5f5;padding:12px;border-left:3px solid ${ACCENT};margin:16px 0;white-space:pre-wrap;font-size:14px;">${escapeHtml(ctx.message)}</div>
    ${impersonationLine}
    <p style="margin-top:24px;">
      <a href="${ticketUrl}" style="background:${ACCENT};color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Voir le ticket</a>
    </p>
    <p style="color:#999;font-size:12px;margin-top:24px;">
      Ce message est envoye automatiquement par le dashboard Neuracorp.
    </p>
  </div>
</body></html>
`.trim();

  const text = `Nouveau ticket support #${ctx.ticketId}

Client : ${ctx.clientName ?? ctx.clientEmail} <${ctx.clientEmail}>
${ctx.userProductLabel ? `Centre : ${ctx.userProductLabel}\n` : ""}
Sujet  : ${ctx.subject}

${ctx.message}

Voir le ticket : ${ticketUrl}
`.trim();

  // Le support doit pouvoir repondre directement au client : on vise d'abord
  // l'adresse de contact du ticket, puis l'email du compte s'il en est une.
  // Sans ce filtre, un identifiant comme « menton » fait rejeter tout le mail
  // par Brevo, et la notification disparait sans que personne ne le voie
  // (constate sur le ticket #3, le 02/09/2026).
  const replyToEmail = [ctx.contactEmail, ctx.clientEmail].find(estAdresseEmail);

  return sendEmail({
    to: { email: adminEmail },
    subject: `[Ticket #${ctx.ticketId}] ${ctx.subject}`,
    htmlContent: html,
    textContent: text,
    ...(replyToEmail
      ? { replyTo: { email: replyToEmail, name: ctx.clientName ?? undefined } }
      : {}),
    tags: ["ticket_created"],
  });
}

interface TicketStatusChangeContext {
  ticketId: number;
  subject: string;
  newStatus: "RESOLVED" | "CLOSED";
  clientEmail: string;
  clientName: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
}

/**
 * Envoye au client quand son ticket passe en RESOLVED ou CLOSED.
 * (Les autres transitions PENDING <-> IN_PROGRESS n'envoient pas de mail.)
 */
export async function notifyTicketClosedToClient(ctx: TicketStatusChangeContext) {
  // Meme piege que pour la notification admin, en plus grave : ici l'adresse
  // fautive est le destinataire. L'appelant retombe sur `User.email` quand le
  // ticket n'a pas de `contactEmail`, ce qui est le cas des tickets anterieurs
  // a sa mise en place. Le client n'apprenait alors jamais que son ticket etait
  // clos (constate sur le ticket #1, le 03/09/2026, destinataire « epsilon »).
  if (!estAdresseEmail(ctx.clientEmail)) {
    console.warn(
      `[ticketNotifications] ticket #${ctx.ticketId} : « ${ctx.clientEmail} » n'est pas une adresse email, mail de cloture non envoye`
    );
    return { ok: false, error: "invalid recipient" };
  }

  const ticketUrl = `${DASHBOARD_URL}/client/ticket`;
  const statusLabel = ctx.newStatus === "RESOLVED" ? "resolu" : "ferme";
  const statusColor = ctx.newStatus === "RESOLVED" ? "#22C55E" : "#7A8FA6";

  const noteBlock = ctx.resolutionNote
    ? `<div style="background:#f5f5f5;padding:12px;border-left:3px solid ${statusColor};margin:16px 0;white-space:pre-wrap;font-size:14px;">
        <strong>Note du support :</strong><br/>
        ${escapeHtml(ctx.resolutionNote)}
       </div>`
    : "";

  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:auto;">
  <div style="background:${statusColor};color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;">Votre ticket #${ctx.ticketId} a ete ${statusLabel}</h2>
  </div>
  <div style="border:1px solid #e0e0e0;border-top:0;padding:20px;border-radius:0 0 8px 8px;">
    <p>Bonjour ${escapeHtml(ctx.clientName ?? "")},</p>
    <p>Votre ticket support &laquo;<strong>${escapeHtml(ctx.subject)}</strong>&raquo;
       a ete marque comme <strong>${statusLabel}</strong>${ctx.resolvedByName ? ` par ${escapeHtml(ctx.resolvedByName)}` : ""}.</p>
    ${noteBlock}
    <p>Si le probleme persiste, vous pouvez repondre a ce ticket ou en creer un
       nouveau depuis votre espace support.</p>
    <p style="margin-top:24px;">
      <a href="${ticketUrl}" style="background:${ACCENT};color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Voir mes tickets</a>
    </p>
    <p style="color:#999;font-size:12px;margin-top:24px;">
      Merci d'utiliser Neuracorp.
    </p>
  </div>
</body></html>
`.trim();

  const text = `Votre ticket #${ctx.ticketId} a ete ${statusLabel}

Bonjour ${ctx.clientName ?? ""},

Votre ticket support "${ctx.subject}" a ete marque comme ${statusLabel}${ctx.resolvedByName ? ` par ${ctx.resolvedByName}` : ""}.
${ctx.resolutionNote ? `\nNote du support :\n${ctx.resolutionNote}\n` : ""}
Si le probleme persiste, vous pouvez repondre a ce ticket ou en creer un
nouveau depuis votre espace support.

Voir mes tickets : ${ticketUrl}
`.trim();

  return sendEmail({
    to: { email: ctx.clientEmail, name: ctx.clientName ?? undefined },
    subject: `[Ticket #${ctx.ticketId}] Ticket ${statusLabel}`,
    htmlContent: html,
    textContent: text,
    tags: [`ticket_${statusLabel}`],
  });
}
