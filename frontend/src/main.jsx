import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import MaterialThemeWrapper from "./contexts/MaterialThemeWrapper";
import "./index.css";

function ThemeAppliedProvider({ children }) {
  const { style, mode } = useTheme();
  return (
    <MaterialThemeWrapper style={style} mode={mode}>
      {children}
    </MaterialThemeWrapper>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ThemeAppliedProvider>
          <App />
        </ThemeAppliedProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
    let isInitialClaim = reg.active && !navigator.serviceWorker.controller;
    if (isInitialClaim) {
      reg.active.postMessage({ type: "CLAIM" });
    }
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "CLAIM" });
    }
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (installing) {
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            const clients = navigator.serviceWorker.controller;
            clients.postMessage({ type: "SKIP_WAITING" });
          }
        });
      }
    });
    let reloadTimeout;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isInitialClaim) { isInitialClaim = false; return; }
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => window.location.reload(), 500);
    });
  }).catch((err) => {
    console.warn("SW registration failed:", err);
  });
}
