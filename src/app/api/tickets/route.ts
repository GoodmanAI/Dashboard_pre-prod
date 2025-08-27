export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { z } from 'zod'

/**
 * API Tickets (centre-aware)
 * -----------------------------------------------------------------------------
 * Finalité
 * - GET  : lister les tickets du compte courant ou d’un centre géré (ADMIN_USER).
 * - POST : créer un ticket pour soi ou pour un centre géré (ADMIN_USER).
 *
 * Sécurité & contrôle d’accès
 * - Authentification requise pour toutes les opérations (NextAuth).
 * - Ciblage d’un autre centre via `asUserId` réservé aux utilisateurs `ADMIN_USER`
 *   et uniquement pour les centres dont ils sont “manager”.
 *
 * Modèle d’erreurs
 * - 401 Unauthorized : utilisateur non connecté.
 * - 403 Forbidden    : rôle/portée insuffisants.
 * - 400 Bad Request  : paramètres invalides (ex: asUserId non numérique, payload invalide).
 * - 500 Internal     : erreur serveur générique (détails en logs uniquement).
 *
 * Stratégie de rendu / cache
 * - `force-dynamic` : réponses spécifiques à l’utilisateur, non cacheables.
 */

/**
 * Résout l’ID d’utilisateur “effectif” à utiliser pour les opérations (centre-aware).
 * - Par défaut : l’utilisateur de session.
 * - Avec `asUserId` : nécessite `ADMIN_USER` + relation de gestion (manager -> centre).
 *
 * @param sessionUserId - Identifiant de l’utilisateur courant
 * @param request       - Requête HTTP (pour lecture des query params)
 * @throws { status: number, msg: string } en cas d’accès interdit ou paramètre invalide
 * @returns number - userId effectif à utiliser en base
 */
async function resolveEffectiveUserId(sessionUserId: number, request: NextRequest) {
  const { searchParams } = request.nextUrl
  const asUserIdParam = searchParams.get('asUserId')
  let effectiveUserId = sessionUserId

  if (asUserIdParam) {
    const asUserId = Number(asUserIdParam)
    if (!Number.isFinite(asUserId)) {
      throw { status: 400, msg: 'Invalid asUserId' }
    }
    if (asUserId !== sessionUserId) {
      const current = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { centreRole: true },
      })
      if (current?.centreRole !== 'ADMIN_USER') {
        throw { status: 403, msg: 'Forbidden' }
      }
      const managed = await prisma.user.findFirst({
        where: { id: asUserId, managerId: sessionUserId },
        select: { id: true },
      })
      if (!managed) {
        throw { status: 403, msg: 'Not managed by this admin' }
      }
      effectiveUserId = asUserId
    }
  }

  return effectiveUserId
}

/**
 * GET /api/tickets
 * -----------------------------------------------------------------------------
 * Récupère la liste des tickets pour le user effectif.
 * Supporte `asUserId` (centre géré) avec contrôles décrits dans `resolveEffectiveUserId`.
 * Tri descendant par date de création.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessionUserId = Number(session.user.id)
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  try {
    const effectiveUserId = await resolveEffectiveUserId(sessionUserId, request)
    const tickets = await prisma.ticket.findMany({
      where: { userId: effectiveUserId },
      select: {
        id: true, subject: true, message: true, status: true,
        createdAt: true, updatedAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ tickets }, { status: 200 })
  } catch (e: any) {
    if (e?.status) return NextResponse.json({ error: e.msg }, { status: e.status })
    console.error('GET /api/tickets error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/tickets
 * -----------------------------------------------------------------------------
 * Crée un ticket pour le user effectif :
 * - Si `asUserId` est fourni : doit être `ADMIN_USER` et manager du centre ciblé.
 * - Le créateur (`createdById`) reste l’utilisateur courant (traçabilité).
 * - Notifie le premier ADMIN trouvé pour traitement.
 */
const TicketSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json(
      { error: 'Accès refusé. Seuls les clients peuvent créer des tickets.' },
      { status: 403 }
    )
  }
  const sessionUserId = Number(session.user.id)
  if (!Number.isFinite(sessionUserId)) {
    return NextResponse.json({ error: 'ID utilisateur invalide' }, { status: 400 })
  }

  try {
    const effectiveUserId = await resolveEffectiveUserId(sessionUserId, request)

    const body = await request.json()
    const parsed = TicketSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Échec de la validation', details: parsed.error.errors }, { status: 400 })
    }
    const { subject, message } = parsed.data

    const ticket = await prisma.ticket.create({
      data: { userId: effectiveUserId, createdById: sessionUserId, subject, message },
    })

    // Notification simple vers un ADMIN (si présent). En cas de multi-admins,
    // envisager une diffusion plus robuste (broadcast) ou un système d’affectation.
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    if (admin) {
      const actor = session.user.name ?? session.user.email
      await prisma.notification.create({
        data: {
          ticketId: ticket.id,
          userId: admin.id,
          message:
            effectiveUserId === sessionUserId
              ? `Nouveau ticket créé par ${actor} : ${subject}`
              : `Nouveau ticket créé par ${actor} pour le centre #${effectiveUserId} : ${subject}`,
        },
      })
    }

    return NextResponse.json({ message: 'Ticket créé avec succès', ticket }, { status: 201 })
  } catch (e: any) {
    if (e?.status) return NextResponse.json({ error: e.msg }, { status: e.status })
    console.error('POST /api/tickets error:', e)
    return NextResponse.json({ error: 'Une erreur inattendue est survenue' }, { status: 500 })
  }
}
