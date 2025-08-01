// src/app/api/tickets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import transporter from '@/utils/mailer'

// Validation du body avec Zod
const TicketSchema = z.object({
  subject: z.string().min(1, 'Le sujet est requis'),
  message: z.string().min(1, 'Le message est requis'),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // 1. Récupérer et valider la session
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // 2. Cast de l'ID en number
  const userId = Number(session.user.id)
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: 'ID utilisateur invalide' }, { status: 400 })
  }

  // 3. Vérifier le rôle
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json(
      { error: "Accès refusé. Seuls les clients peuvent créer des tickets." },
      { status: 403 }
    )
  }

  try {
    // 4. Valider le payload
    const body = await request.json()
    const parseResult = TicketSchema.safeParse(body)
    if (!parseResult.success) {
      const details = parseResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }))
      return NextResponse.json(
        { error: 'Échec de la validation', details },
        { status: 400 }
      )
    }
    const { subject, message } = parseResult.data

    // 5. Créer le ticket, avec createdById pour tracer l'auteur
    const ticket = await prisma.ticket.create({
      data: {
        userId,
        createdById: userId,
        subject,
        message,
      },
    })

    // 6. Créer une notification pour le super-admin (role ADMIN)
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    if (admin) {
      await prisma.notification.create({
        data: {
          ticketId: ticket.id,
          userId: admin.id,
          message: `Nouveau ticket créé par ${session.user.name ?? session.user.email} : ${subject}`,
        }
      })
    }

    // 7. Envoyer un email de notification au support
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.SUPPORT_EMAIL,
      subject: `Nouveau ticket de ${session.user.email}`,
      text: `Sujet: ${ticket.subject}\nMessage: ${ticket.message}\nDate: ${ticket.createdAt.toISOString()}`
    }
    await transporter.sendMail(mailOptions)

    return NextResponse.json(
      { message: 'Ticket créé avec succès', ticket },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erreur création ticket:', error)
    return NextResponse.json(
      { error: 'Une erreur inattendue est survenue' },
      { status: 500 }
    )
  }
}