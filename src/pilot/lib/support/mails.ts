import { escapeHtml, sendEmail } from "@/lib/brevoMailer";
import { prisma } from "@/pilot/lib/prisma";
import { LIBELLES_STATUT, lienSujet, tousLesDestinataires, type Destinataires, type StatutSujet } from "./regles";

/**
 * Les mails du support (25/11/2026) : à chaque sujet, message, changement de statut et
 * relance, le commercial du client en destinataire, les autres en copie. Envoyés après
 * la transaction : un mail qui échoue ne défait rien (la cloche, elle, est déjà écrite),
 * il est écrit au journal du processus et on continue.
 *
 * Le mail porte le texte du message : c'est ce qui permet au commercial de répondre au
 * client sans ouvrir Pilot. On répond dans Pilot, pas au mail : le lien y mène.
 */
export type EvenementMail =
  | { genre: "sujet" | "message"; sujetId: number; messageId: number; auteurId: number; destinataires: Destinataires }
  | { genre: "statut"; sujetId: number; auteurId: number; vers: StatutSujet; destinataires: Destinataires }
  | { genre: "relance"; sujetId: number; destinataires: Destinataires; depuis: Date };

const ADRESSE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function adresseDe(chemin: string): string {
  const base = (process.env.NEXT_PUBLIC_PILOT_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  return base + chemin;
}

const paragraphe = (t: string) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(t).replace(/\n/g, "<br>")}</p>`;
const encadre = (titre: string, t: string, fond: string) =>
  `<div style="margin:0 0 14px;padding:12px 14px;border-radius:10px;background:${fond}">` +
  `<div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">${escapeHtml(titre)}</div>` +
  `<div style="line-height:1.5;white-space:pre-wrap">${escapeHtml(t)}</div></div>`;

export async function envoyerMailSupport(e: EvenementMail): Promise<void> {
  try {
    const ids = tousLesDestinataires(e.destinataires);
    if (!ids.length) return;
    const [sujet, comptes, auteur, message] = await Promise.all([
      prisma.crmSujetSupport.findUniqueOrThrow({ where: { id: e.sujetId }, select: { titre: true, statut: true, organisation: { select: { raisonSocialeNom: true, responsable: { select: { name: true } } } } } }),
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }),
      "auteurId" in e ? prisma.user.findUnique({ where: { id: e.auteurId }, select: { name: true } }) : Promise.resolve(null),
      "messageId" in e ? prisma.crmMessageSupport.findUnique({ where: { id: e.messageId }, select: { noteInterne: true, aDireAuClient: true } }) : Promise.resolve(null),
    ]);
    // Un identifiant qui n'est pas une adresse (le compte « admin ») ferait refuser tout le mail par Brevo : écarté.
    const parId = new Map(comptes.filter((c) => ADRESSE.test(c.email)).map((c) => [c.id, { email: c.email, ...(c.name ? { name: c.name } : {}) }]));
    const principal = e.destinataires.principal !== null ? parId.get(e.destinataires.principal) : undefined;
    const copie = e.destinataires.copie.map((id) => parId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
    const to = principal ? [principal] : copie.slice(0, 1);
    const cc = principal ? copie : copie.slice(1);
    if (!to.length) return;

    const client = sujet.organisation.raisonSocialeNom;
    const qui = auteur?.name ?? "Quelqu'un de l'équipe";
    const lien = adresseDe(lienSujet(e.sujetId));
    let objet: string; let intro: string;
    if (e.genre === "relance") { objet = `[Support] Rappel, à transmettre à ${client}`; intro = `Le sujet « ${sujet.titre} » attend d'être transmis à ${client} depuis le ${DATE.format(e.depuis)}.`; }
    else if (e.genre === "statut") { objet = `[Support] ${client} : ${LIBELLES_STATUT[e.vers]}`; intro = `${qui} a passé le sujet « ${sujet.titre} » (${client}) en « ${LIBELLES_STATUT[e.vers]} ».`; }
    else if (e.genre === "sujet") { objet = `[Support] ${client} : ${sujet.titre}`; intro = `${qui} a ouvert un sujet pour ${client}.`; }
    else { objet = `[Support] ${client} : ${sujet.titre}`; intro = `${qui} a écrit sur le sujet « ${sujet.titre} » (${client}).`; }

    const commercial = sujet.organisation.responsable?.name;
    const pied = `Commercial du client : ${commercial ?? "pas encore choisi"}. Pour répondre ou changer le statut, ouvrez le sujet dans Pilot : ${lien}`;
    const blocs: string[] = [paragraphe(intro)];
    const lignes: string[] = [intro, ""];
    if (message?.aDireAuClient) { blocs.push(encadre("À dire au client", message.aDireAuClient, "#ecfdf5")); lignes.push("À dire au client :", message.aDireAuClient, ""); }
    if (message?.noteInterne) { blocs.push(encadre("Note interne", message.noteInterne, "#f1f5f9")); lignes.push("Note interne :", message.noteInterne, ""); }
    blocs.push(`<p style="margin:16px 0"><a href="${escapeHtml(lien)}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:600">Ouvrir le sujet dans Pilot</a></p>`);
    blocs.push(`<p style="margin:0;color:#64748b;font-size:13px">Commercial du client : ${escapeHtml(commercial ?? "pas encore choisi")}. Répondez dans Pilot, pas à ce mail.</p>`);
    lignes.push(pied);

    const r = await sendEmail({
      to, cc, subject: objet.slice(0, 180), tags: [`pilot_support_${e.genre}`],
      htmlContent: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#0f172a;max-width:640px">${blocs.join("")}</div>`,
      textContent: lignes.join("\n"),
    });
    if (!r.ok) console.error(JSON.stringify({ niveau: "erreur", message: "Mail du support non envoyé", sujetId: e.sujetId, genre: e.genre, cause: r.error }));
  } catch (erreur) {
    console.error(JSON.stringify({ niveau: "erreur", message: "Mail du support non envoyé", sujetId: e.sujetId, genre: e.genre, cause: erreur instanceof Error ? erreur.message : "inconnue" }));
  }
}
