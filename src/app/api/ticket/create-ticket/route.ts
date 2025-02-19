import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import transporter from "@/utils/mailer";

// Schéma de validation pour le ticket
const TicketSchema = z.object({
  subject: z.string().min(1, "Le sujet est requis"),
  message: z.string().min(1, "Le message est requis"),
});

export async function POST(request: NextRequest) {
  try {
    // Récupérer la session de l'utilisateur
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Autoriser uniquement les utilisateurs de rôle CLIENT
    if (session.user.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Accès refusé. Seuls les clients peuvent créer des tickets." },
        { status: 403 }
      );
    }

    // Récupérer et valider les données envoyées dans le body
    const body = await request.json();
    const parseResult = TicketSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Échec de la validation", details: errors },
        { status: 400 }
      );
    }

    const { subject, message } = parseResult.data;

    // Créer le ticket en utilisant l'ID de l'utilisateur connecté
    const ticket = await prisma.ticket.create({
      data: {
        userId: session.user.id,
        subject,
        message,
        // Le champ status est défini par défaut sur PENDING dans le schéma Prisma
      },
    });

    // Créer une notification pour l'admin (ici supposé avoir l'ID 1)
    const notificationMessage = `Nouveau ticket créé par ${session.user.name} : ${subject}`;
    await prisma.notification.create({
      data: {
        ticketId: ticket.id,
        userId: 1,
        message: notificationMessage,
      },
    });

    // Préparer l'email
    const mailOptions = {
      from: process.env.SMTP_USER, // L'expéditeur, ici l'adresse Ethereal (ou votre adresse SMTP)
      to: process.env.SUPPORT_EMAIL, // Votre email support
      subject: `Nouveau ticket créé par l'utilisateur ${session.user.email}`,
      text: `Un nouveau ticket a été créé.

      Sujet: ${ticket.subject}
      Message: ${ticket.message}

      Date: ${new Date(ticket.createdAt).toLocaleString()}

      Vous pouvez consulter ce ticket dans l'administration.`,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json(
      { message: "Ticket créé avec succès", ticket },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur lors de la création du ticket:", error);
    return NextResponse.json(
      { error: "Une erreur inconnue est survenue" },
      { status: 500 }
    );
  }
}
