import { Box, Typography } from '@mui/material';

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
      <Typography variant="h5" sx={{ fontWeight: 700, color: '#555'}}>
        Ce produit n&apos;est pas encore disponible.
      </Typography>
    </Box>
  );
};

export default TalkDentistPage;