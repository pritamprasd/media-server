import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getPref, setPref } from "../services/db";
import { DEFAULT_THEME } from "../config/themes";

const ThemeContext = createContext();

function applyThemeToDOM(style, mode) {
  document.documentElement.setAttribute("data-style", style);
  document.documentElement.setAttribute("data-mode", mode);
}

export function ThemeProvider({ children }) {
  const [themeState, setThemeState] = useState(() => {
    if (typeof document !== "undefined") {
      return {
        style: document.documentElement.getAttribute("data-style") || DEFAULT_THEME.style,
        mode: document.documentElement.getAttribute("data-mode") || DEFAULT_THEME.mode,
      };
    }
    return { ...DEFAULT_THEME };
  });

  useEffect(() => {
    Promise.all([
      getPref("themeStyle", DEFAULT_THEME.style),
      getPref("themeMode", DEFAULT_THEME.mode),
    ]).then(([style, mode]) => {
      applyThemeToDOM(style, mode);
      setThemeState({ style, mode });
    });
  }, []);

  const setStyle = useCallback((newStyle) => {
    setThemeState((prev) => {
      const next = { ...prev, style: newStyle };
      applyThemeToDOM(next.style, next.mode);
      setPref("themeStyle", newStyle);
      return next;
    });
  }, []);

  const setMode = useCallback((newMode) => {
    setThemeState((prev) => {
      const next = { ...prev, mode: newMode };
      applyThemeToDOM(next.style, next.mode);
      setPref("themeMode", newMode);
      return next;
    });
  }, []);

  const toggleMode = useCallback(() => {
    setThemeState((prev) => {
      const nextMode = prev.mode === "dark" ? "light" : "dark";
      const next = { ...prev, mode: nextMode };
      applyThemeToDOM(next.style, next.mode);
      setPref("themeMode", nextMode);
      return next;
    });
  }, []);

  const value = {
    style: themeState.style,
    mode: themeState.mode,
    setStyle,
    setMode,
    toggleMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
