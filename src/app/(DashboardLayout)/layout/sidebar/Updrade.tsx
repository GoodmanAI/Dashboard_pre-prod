import { Box, Typography, Button } from '@mui/material';
// import img1 from 'public/images/backgrounds/rocket.png';
import Image from 'next/image';
import Link from 'next/link';

export const Upgrade = () => {
    return (
        <Box
            display='flex'
            alignItems="center"
            gap={2}
            sx={{ m: 3, p: 3, bgcolor: 'primary.light', borderRadius: '8px' }}
        >
            <>
                <Box >
                    <Typography variant="h5" sx={{ width: "80px" }} fontSize='16px' mb={1}>Découvrir tout nos produits</Typography>
                    <Button color="primary" target="_blank" disableElevation component={Link} href="https://neuracorp.ai/" variant="contained" aria-label="discover" size="small">
                        Découvrir
                    </Button>
                </Box>
                <Box mt="-35px" >
                    <Image alt="Remy Sharp" src='/images/backgrounds/rocket.png' width={100} height={100} />
                </Box>
            </>
        </Box>
    );
};
