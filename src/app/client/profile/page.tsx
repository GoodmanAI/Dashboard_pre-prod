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
  TextField,
  Button,
  Alert,
  IconButton,
  InputAdornment,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'

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

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

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

  const handleChangePassword = async () => {
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Veuillez remplir tous les champs.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les nouveaux mots de passe ne correspondent pas.')
      return
    }

    setPasswordLoading(true)
    try {
      const res = await fetch('/api/client/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPasswordError(data.error || 'Une erreur est survenue.')
      } else {
        setPasswordSuccess(data.message || 'Mot de passe modifié avec succès.')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      setPasswordError('Une erreur est survenue.')
    } finally {
      setPasswordLoading(false)
    }
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

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Changer le mot de passe
            </Typography>

            {passwordError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPasswordError(null)}>
                {passwordError}
              </Alert>
            )}
            {passwordSuccess && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPasswordSuccess(null)}>
                {passwordSuccess}
              </Alert>
            )}

            <TextField
              label="Mot de passe actuel"
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Nouveau mot de passe"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              helperText="Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Confirmer le nouveau mot de passe"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                      {showConfirmPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="contained"
              onClick={handleChangePassword}
              disabled={passwordLoading}
              sx={{ backgroundColor: '#48C8AF', '&:hover': { backgroundColor: '#3ab89d' } }}
            >
              {passwordLoading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Modifier le mot de passe'}
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default ProfilePage
