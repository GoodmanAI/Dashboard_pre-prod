// src/app/api/notification/mark-read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/utils/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';

const MarkReadSchema = z.object({
  notificationId: z.number(),
});

export async function POST(request: NextRequest) {
  // Vérifier la session de l'utilisateur
  const session = await getServerSession({ req: request, ...authOptions });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await request.json();
    const parsed = MarkReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.errors },
        { status: 400 }
      );
    }
    const { notificationId } = parsed.data;

    // Récupérer la notification et vérifier qu'elle appartient à un ticket du client
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: { ticket: true },
    });
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    if (notification.userId !== userId) {
      return NextResponse.json({ error: 'This notification does not belong to you' }, { status: 403 });
    }

    // Mettre à jour la notification pour la marquer comme lue
    const updatedNotification = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return NextResponse.json({ message: 'Notification marked as read', notification: updatedNotification }, { status: 200 });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
