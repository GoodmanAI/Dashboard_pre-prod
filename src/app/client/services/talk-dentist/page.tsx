import { Box, Typography } from '@mui/material';

/**
 * Page « LYRAE © Talk (Dentisterie) »
 * ------------------------------------------------------------
 * Rôle :
 *  - Placeholder indiquant que le produit n’est pas encore disponible.
 *
 * Décisions UI :
 *  - Mise en page centrée verticalement/horizontalement pour un message clair.
 *  - Palette neutre (#F8F8F8) cohérente avec le reste de l’application.
 *
 * Évolutivité :
 *  - Remplacer ce placeholder par un véritable module lorsque Talk (Dentisterie)
 *    sera implémenté. Prévoir un routage/feature flag si nécessaire.
 */
const TalkDentistPage = () => {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F8F8F8',
        textAlign: 'center',
        px: 2,
      }}
    >
      {/* Message centralisé indiquant l’indisponibilité du produit */}
      <Typography variant="h5" sx={{ fontWeight: 700, color: '#555' }}>
        Ce produit n&apos;est pas encore disponible.
      </Typography>
    </Box>
  );
};

export default TalkDentistPage;
