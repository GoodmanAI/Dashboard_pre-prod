'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Chip,
} from '@mui/material'

/**
 * Représentation minimale d’un produit rattaché à un centre.
 * - `assignedAt` : date d’affiliation du produit au centre.
 * - `product` : métadonnées du produit (id + nom).
 */
interface UserProductLite {
  assignedAt: string
  product: { id: number; name: string }
}

/**
 * Données d’un centre géré par l’utilisateur courant (Directeur).
 * - Contient les informations d’adresse et la liste des produits souscrits.
 */
interface ManagedUser {
  id: number
  name?: string | null
  email: string
  address?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
  userProducts?: UserProductLite[]
}

/**
 * Données profil renvoyées par `/api/client`.
 * - `role` : rôle global (ADMIN | CLIENT).
 * - `centreRole` : rôle dans le contexte centre (ADMIN_USER = Directeur, USER).
 * - `managedUsers` : centres rattachés (si Directeur).
 */
interface ClientData {
  id: number
  name?: string | null
  email: string
  role: 'ADMIN' | 'CLIENT'
  centreRole?: 'ADMIN_USER' | 'USER' | null
  managedUsers?: ManagedUser[]
  userProducts: any[] // conservé pour usage futur
}

/**
 * Page Profil Client
 * - Récupère le profil utilisateur et ses centres gérés.
 * - Redirige vers la page de connexion si la session est absente.
 * - Affiche les produits souscrits pour chaque centre avec un badge vert.
 */
const ProfilePage = () => {
  /* -------------------------------------------------------------------------- */
  /*                        Session, navigation, états locaux                    */
  /* -------------------------------------------------------------------------- */
  const { data: session, status } = useSession()
  const router = useRouter()
  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [loading, setLoading] = useState(true)

  /* -------------------------------------------------------------------------- */
  /*                           Redirection si déconnecté                         */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/authentication/signin')
  }, [status, router])

  /* -------------------------------------------------------------------------- */
  /*                         Chargement des données profil                       */
  /*  - Source: GET /api/client                                                 */
  /*  - Gestion des cas d’erreur silencieuse + indicateur de chargement         */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    async function fetchClientData() {
      try {
        const res = await fetch('/api/client')
        if (!res.ok) {
          console.error('Erreur lors de la récupération des données client.')
          return
        }
        const data: ClientData = await res.json()
        setClientData(data)
      } catch (error) {
        console.error('Error fetching client data:', error)
      } finally {
        setLoading(false)
      }
    }
    if (status === 'authenticated') fetchClientData()
  }, [status])

  /* -------------------------------------------------------------------------- */
  /*                               États transitoires                            */
  /* -------------------------------------------------------------------------- */
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress sx={{ '& .MuiCircularProgress-svg': { color: '#48C8AF' } }} />
      </Box>
    )
  }

  if (!clientData) {
    return (
      <Typography variant="h6" sx={{ mt: 4, textAlign: 'center' }}>
        Aucune donnée client trouvée.
      </Typography>
    )
  }

  const { name, email, role, centreRole, managedUsers } = clientData

  /* -------------------------------------------------------------------------- */
  /*                                   Rendu UI                                  */
  /*  - Bloc informations de compte                                             */
  /*  - Bloc centres gérés (visible si Directeur) + badges produits             */
  /* -------------------------------------------------------------------------- */
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Mon Profil
      </Typography>

      <Grid container>
        <Grid item xs={12} md={10} lg={8}>
          {/* Informations de compte */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Informations de compte
            </Typography>
            <Typography>
              <strong>Nom :</strong> {name || '—'}
            </Typography>
            <Typography>
              <strong>Email :</strong> {email}
            </Typography>
            <Typography sx={{ mt: 1 }}>
              <strong>Rôle global :</strong>{' '}
              <Chip label={role} size="small" color={role === 'ADMIN' ? 'primary' : 'default'} />
            </Typography>
            {role === 'CLIENT' && (
              <Typography sx={{ mt: 1 }}>
                <strong>Rôle du centre :</strong>{' '}
                <Chip
                  label={centreRole === 'ADMIN_USER' ? 'Directeur de centre' : 'Utilisateur'}
                  size="small"
                  color={centreRole === 'ADMIN_USER' ? 'success' : 'default'}
                />
              </Typography>
            )}
          </Paper>

          {/* Centres gérés + produits (badge vert si souscription) */}
          {centreRole === 'ADMIN_USER' && managedUsers && managedUsers.length > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Centres gérés
              </Typography>
              <List dense>
                {managedUsers.map((u) => {
                  const addressLine = [u.address, [u.postalCode, u.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
                  return (
                    <ListItem
                      key={u.id}
                      sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                      disableGutters
                    >
                      <ListItemText
                        primary={u.name || u.email}
                        secondary={addressLine || undefined}
                      />
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {u.userProducts?.length ? (
                          u.userProducts.map((up) => (
                            <Chip
                              key={`${u.id}-${up.product.id}`}
                              label={up.product.name}
                              size="small"
                              color="success"
                              variant="filled"
                            />
                          ))
                        ) : (
                          <Chip label="Aucun produit" size="small" variant="outlined" />
                        )}
                      </Box>
                    </ListItem>
                  )
                })}
              </List>
            </Paper>
          )}

          <Divider sx={{ my: 3 }} />

          <Typography color="text.primary">
            Pour toute demande de modification de vos informations de compte,
            veuillez contacter notre support : <strong>support@neuracorp.ai</strong>
          </Typography>
        </Grid>
      </Grid>
    </Box>
  )
}

export default ProfilePage
