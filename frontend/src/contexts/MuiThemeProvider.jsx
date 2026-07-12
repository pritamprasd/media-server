import { useMemo } from "react";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";

const baseTheme = {
  typography: {
    fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
};

const darkPalette = {
  mode: "dark",
  primary: { main: "#bb86fc" },
  secondary: { main: "#03dac6" },
  error: { main: "#cf6679" },
  background: {
    default: "#121212",
    paper: "#1e1e1e",
  },
  text: {
    primary: "#e0e0e0",
    secondary: "#9e9e9e",
  },
};

const lightPalette = {
  mode: "light",
  primary: { main: "#1976d2" },
  secondary: { main: "#9c27b0" },
  error: { main: "#d32f2f" },
  background: {
    default: "#fafafa",
    paper: "#ffffff",
  },
  text: {
    primary: "#212121",
    secondary: "#757575",
  },
};

const shadows = [
  "none",
  "0px 1px 3px rgba(0,0,0,0.12), 0px 1px 2px rgba(0,0,0,0.24)",
  "0px 2px 4px rgba(0,0,0,0.12), 0px 1px 5px rgba(0,0,0,0.20)",
  "0px 3px 6px rgba(0,0,0,0.12), 0px 2px 4px rgba(0,0,0,0.16)",
  "0px 4px 8px rgba(0,0,0,0.12), 0px 3px 6px rgba(0,0,0,0.16)",
  "0px 6px 10px rgba(0,0,0,0.12), 0px 4px 8px rgba(0,0,0,0.16)",
  "0px 8px 14px rgba(0,0,0,0.12), 0px 5px 10px rgba(0,0,0,0.12)",
  "0px 10px 18px rgba(0,0,0,0.12), 0px 6px 12px rgba(0,0,0,0.12)",
  "0px 12px 22px rgba(0,0,0,0.12), 0px 7px 14px rgba(0,0,0,0.12)",
  "0px 14px 26px rgba(0,0,0,0.12), 0px 8px 16px rgba(0,0,0,0.12)",
  "0px 16px 30px rgba(0,0,0,0.12), 0px 9px 18px rgba(0,0,0,0.12)",
  "0px 18px 34px rgba(0,0,0,0.12), 0px 10px 20px rgba(0,0,0,0.12)",
  "0px 20px 38px rgba(0,0,0,0.12), 0px 11px 22px rgba(0,0,0,0.12)",
  "0px 22px 42px rgba(0,0,0,0.12), 0px 12px 24px rgba(0,0,0,0.12)",
  "0px 24px 46px rgba(0,0,0,0.12), 0px 13px 26px rgba(0,0,0,0.12)",
  "0px 26px 50px rgba(0,0,0,0.12), 0px 14px 28px rgba(0,0,0,0.12)",
  "0px 28px 54px rgba(0,0,0,0.12), 0px 15px 30px rgba(0,0,0,0.12)",
  "0px 30px 58px rgba(0,0,0,0.12), 0px 16px 32px rgba(0,0,0,0.12)",
  "0px 32px 62px rgba(0,0,0,0.12), 0px 17px 34px rgba(0,0,0,0.12)",
  "0px 34px 66px rgba(0,0,0,0.12), 0px 18px 36px rgba(0,0,0,0.12)",
  "0px 36px 70px rgba(0,0,0,0.12), 0px 19px 38px rgba(0,0,0,0.12)",
  "0px 38px 74px rgba(0,0,0,0.12), 0px 20px 40px rgba(0,0,0,0.12)",
  "0px 40px 78px rgba(0,0,0,0.12), 0px 21px 42px rgba(0,0,0,0.12)",
  "0px 42px 82px rgba(0,0,0,0.12), 0px 22px 44px rgba(0,0,0,0.12)",
  "0px 44px 86px rgba(0,0,0,0.12), 0px 23px 46px rgba(0,0,0,0.12)",
];

export default function MuiThemeProvider({ mode, children }) {
  const theme = useMemo(() => {
    return createTheme({
      ...baseTheme,
      palette: mode === "dark" ? darkPalette : lightPalette,
      shadows,
    });
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
