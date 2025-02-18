import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/utils/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(request: NextRequest) {
  // Récupérer la session de l'utilisateur
  const session = await getServerSession({ req: request, ...authOptions });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    // Récupérer toutes les notifications non lues dont le ticket appartient à l'utilisateur
    const notifications = await prisma.notification.findMany({
      where: {
        isRead: false,
        userId: userId,
      },
      include: {
        ticket: {
          select: {
            subject: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ notifications }, { status: 200 });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
