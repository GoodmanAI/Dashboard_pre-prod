// pages/client/profile/page.tsx
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

interface Product {
  id: number
  name: string
  description?: string | null
}

interface ExplainDetails {
  rdv?: number | null
  borne?: number | null
  examen?: number | null
  secretaire?: number | null
  attente?: number | null
  metricsUpdatedAt?: string | null
}

interface TalkDetails {
  talkInfoValidated?: boolean | null
  talkLibelesValidated?: boolean | null
}

interface UserProduct {
  assignedAt: string
  removedAt?: string | null
  product: Product
  explainDetails?: ExplainDetails | null
  talkDetails?: TalkDetails | null
}

interface ManagedUser {
  id: number
  name?: string | null
  email: string
  address?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
}

interface ClientData {
  id: number
  name?: string | null
  email: string
  role: 'ADMIN' | 'CLIENT'
  centreRole?: 'ADMIN_USER' | 'USER' | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
  managedUsers?: ManagedUser[]
  userProducts: UserProduct[]
}

const ProfilePage = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [loading, setLoading] = useState(true)

  // Redirection si non connecté
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/authentication/signin')
    }
  }, [status, router])

  // Fetch des données
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
    if (status === 'authenticated') {
      fetchClientData()
    }
  }, [status])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress
          sx={{
            '& .MuiCircularProgress-svg': {
              color: '#48C8AF',
            },
          }}
        />
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

  const {
    name,
    email,
    role,
    centreRole,
    address,
    city,
    postalCode,
    country,
    managedUsers,
    userProducts,
  } = clientData

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Mon Profil
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6">Informations de compte</Typography>
            <Typography>
              <strong>Nom :</strong> {name || '—'}
            </Typography>
            <Typography>
              <strong>Email :</strong> {email}
            </Typography>
            <Typography>
              <strong>Rôle global :</strong>{' '}
              <Chip
                label={role}
                size="small"
                color={role === 'ADMIN' ? 'primary' : 'default'}
              />
            </Typography>
            {role === 'CLIENT' && (
              <Typography>
                <strong>Rôle du centre :</strong>{' '}
                <Chip
                  label={
                    centreRole === 'ADMIN_USER'
                      ? 'Directeur de centre'
                      : 'Utilisateur'
                  }
                  size="small"
                  color={centreRole === 'ADMIN_USER' ? 'success' : 'default'}
                />
              </Typography>
            )}
          </Paper>

          {role === 'CLIENT' && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6">Coordonnées du centre</Typography>
              <Typography>
                {address}, {postalCode} {city}, {country}
              </Typography>
            </Paper>
          )}

          {centreRole === 'ADMIN_USER' && managedUsers && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6">Centres gérés</Typography>
              <List dense>
                {managedUsers.map((u) => (
                  <ListItem key={u.id}>
                    <ListItemText
                      primary={u.name || u.email}
                      secondary={`${u.address}, ${u.postalCode} ${u.city}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Produits souscrits
            </Typography>
            {userProducts.length > 0 ? (
              <List>
                {userProducts.map((up) => (
                  <ListItem key={up.product.id} disableGutters>
                    <ListItemText
                      primary={up.product.name}
                      secondary={`Souscrit le ${new Date(
                        up.assignedAt
                      ).toLocaleDateString()}`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>Aucun produit souscrit.</Typography>
            )}
          </Paper>

          {/* Tu peux aussi ajouter d'autres blocs : calls, tickets, etc. */}
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography color="text.primary" align="center">
        Pour toute demande de modification de vos informations de compte,
        veuillez contacter notre support :{' '}
        <strong>support@neuracorp.ai</strong>
      </Typography>
    </Box>
  )
}

export default ProfilePage
