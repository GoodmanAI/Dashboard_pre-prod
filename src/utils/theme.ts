import { createTheme } from "@mui/material/styles";
import { red } from "@mui/material/colors";

const theme = createTheme({
  typography: {
    fontFamily: 'var(--font-myfont), sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 600,
    fontWeightBold: 700,
  },
  palette: {
    primary:   { main: '#556cd6' },
    secondary: { main: '#19857b' },
    error:     { main: red.A400 },
  },
})

export default theme;
