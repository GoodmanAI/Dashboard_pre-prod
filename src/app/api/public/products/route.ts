import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/utils/prisma'

/**
 * GET /api/public/products
 * -----------------------------------------------------------------------------
 * Finalité
 * - Expose un catalogue PUBLIC des produits (aucune authentification requise).
 * - Utile pour alimenter des menus, pages marketing ou écrans non connectés.
 *
 * Stratégie de rendu / cache
 * - `export const dynamic = 'force-static'` : la route est statiquement rendue
 *   et peut être mise en cache par la plateforme. À privilégier pour un
 *   catalogue peu volatile. Si la volumétrie ou la fréquence de mise à jour
 *   augmente, envisager un revalidate (ISR) ou une route dynamique paginée.
 *
 * Données renvoyées
 * - id, name, description, createdAt (ISO), updatedAt (ISO)
 * - centresCount : nombre de centres affiliés (via userProducts)
 *
 * Sécurité / conformité
 * - Aucune donnée personnelle n’est renvoyée. La route est destinée à un usage
 *   public et ne révèle que des métadonnées de produits.
 *
 * Codes de réponse
 * - 200 : succès
 * - 500 : erreur interne (message générique, détails uniquement en logs serveur)
 */
export const dynamic = 'force-static'

export async function GET(request: NextRequest) {
  try {
    // Récupération du catalogue produit avec un comptage d’affiliations.
    // Tri alphabétique pour une UX déterministe côté client.
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            userProducts: true,
          }
        }
      },
      orderBy: { name: 'asc' },
    })

    // Normalisation des champs Date en ISO string pour un transport JSON sûr,
    // et exposition d’un alias `centresCount` plus parlant côté frontend.
    const formatted = products.map(p => ({
      id:           p.id,
      name:         p.name,
      description:  p.description,
      createdAt:    p.createdAt.toISOString(),
      updatedAt:    p.updatedAt.toISOString(),
      centresCount: p._count.userProducts,
    }))

    // Réponse OK.
    return NextResponse.json(formatted, { status: 200 })
  } catch (error) {
    // Journalisation serveur (ne jamais exposer de stack au client).
    console.error('Error fetching public products:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'An unknown error occurred.' },
      { status: 500 }
    )
  }
}
