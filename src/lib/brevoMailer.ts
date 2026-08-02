/**
 * Client Brevo API HTTPS pour envoyer des emails transactionnels depuis le
 * dashboard (notifications tickets, alertes, etc.).
 *
 * Endpoint : POST https://api.brevo.com/v3/smtp/email
 * Doc      : https://developers.brevo.com/reference/sendtransacemail
 * Auth     : header `api-key: $BREVO_API_KEY`
 *
 * Pourquoi API HTTPS et pas SMTP :
 *   - Simplicite (pas de nodemailer, un simple axios/fetch)
 *   - Meilleure gestion d'erreurs cote Brevo (JSON structure)
 *   - Stats + templating natif si un jour on ajoute des templates Brevo
 *
 * Config env requise (a mettre dans .env) :
 *   BREVO_API_KEY          : cle API Brevo (Settings > API keys)
 *   MAIL_FROM_ADDRESS      : ex "support@neuracorp.ai" (doit etre validee cote Brevo)
 *   MAIL_FROM_NAME         : ex "Support Neuracorp"
 *   SUPPORT_ADMIN_EMAIL    : destinataire des alertes internes (ex "enzo@neuracorp.ai")
 *
 * Si BREVO_API_KEY est absente, sendEmail() log un warn et retourne false
 * sans throw : le flow metier appelant (creation ticket, etc.) n'est jamais
 * bloque par un probleme de mail.
 */

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  /** HTML body (au moins l'un des 2 requis par Brevo) */
  htmlContent?: string;
  /** Fallback text pour les clients qui n'affichent pas le HTML */
  textContent?: string;
  /** Reply-To optionnel, sinon MAIL_FROM_ADDRESS est utilise */
  replyTo?: EmailRecipient;
  /** Tags Brevo pour retrouver l'email dans les stats (ex: ["ticket_created"]) */
  tags?: string[];
}

interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

function getFromAddress(): EmailRecipient {
  const email = process.env.MAIL_FROM_ADDRESS;
  const name = process.env.MAIL_FROM_NAME ?? "Neuracorp";
  if (!email) {
    throw new Error(
      "MAIL_FROM_ADDRESS env var manquante (adresse expediteur validee cote Brevo requise)"
    );
  }
  return { email, name };
}

/**
 * Envoie un email transactionnel via l'API Brevo. Ne throw jamais :
 * retourne { ok: false, error } en cas de probleme (les callers metier ne
 * doivent pas etre bloques par un souci de mail).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn(
      "[brevoMailer] BREVO_API_KEY manquante — email non envoye :",
      opts.subject
    );
    return { ok: false, error: "BREVO_API_KEY missing" };
  }

  let sender: EmailRecipient;
  try {
    sender = getFromAddress();
  } catch (err) {
    console.warn("[brevoMailer]", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  }

  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
  if (toList.length === 0) {
    return { ok: false, error: "no recipient" };
  }

  const body: Record<string, unknown> = {
    sender,
    to: toList,
    subject: opts.subject,
  };
  if (opts.htmlContent) body.htmlContent = opts.htmlContent;
  if (opts.textContent) body.textContent = opts.textContent;
  if (!opts.htmlContent && !opts.textContent) {
    return { ok: false, error: "either htmlContent or textContent required" };
  }
  if (opts.replyTo) body.replyTo = opts.replyTo;
  if (opts.tags && opts.tags.length > 0) body.tags = opts.tags;

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Reponse non-JSON (rare), on garde le text brut pour le log
    }

    if (!res.ok) {
      const errMsg =
        json?.message || json?.code || text || `HTTP ${res.status}`;
      console.error(
        "[brevoMailer] Brevo API rejected email :",
        res.status,
        errMsg,
        { subject: opts.subject, to: toList.map((t) => t.email) }
      );
      return { ok: false, error: errMsg, statusCode: res.status };
    }

    return { ok: true, messageId: json?.messageId };
  } catch (err) {
    const msg = (err as Error).message || "unknown error";
    console.error("[brevoMailer] Network/parse error :", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Utilitaire : escape HTML minimal pour eviter les injections dans les
 * templates de mails (le body user peut contenir des chevrons, etc.).
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
