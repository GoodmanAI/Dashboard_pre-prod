// utils/mailer.ts
import nodemailer from "nodemailer";

// Pour le développement, nous pouvons utiliser Ethereal Email.
// Pour la production, vous utiliserez les identifiants SMTP de votre fournisseur (par exemple SendGrid, Mailgun, etc.).
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  auth: {
    user: process.env.SMTP_USER || "votre_utilisateur_ethereal@ethereal.email",
    pass: process.env.SMTP_PASS || "votre_mot_de_passe_ethereal",
  },
});

export default transporter;
