import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getPref } from "./services/db";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Importer from "./pages/Importer";
import Gallery from "./pages/Gallery";
import Favorites from "./pages/Favorites";
import Duplicates from "./pages/Duplicates";
import Upload from "./pages/Upload";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import MapPage from "./pages/Map";
import Locations from "./pages/Locations";
import "leaflet/dist/leaflet.css";
import "./App.css";

function App() {
  const [defaultTab, setDefaultTab] = useState(null);
  const [installEvent, setInstallEvent] = useState(null);
  const [installAvailable, setInstallAvailable] = useState(false);

  useEffect(() => {
    getPref("defaultTab", "/").then(setDefaultTab);
    getPref("accentColor", "#3498db").then((color) => {
      document.documentElement.style.setProperty("--color-primary", color);
    });

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallEvent(e);
      setInstallAvailable(true);
    };
    const onInstalled = () => setInstallAvailable(false);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = () => {
    if (!installEvent) return;
    installEvent.prompt();
    installEvent.userChoice.then(({ outcome }) => {
      if (outcome === "accepted") setInstallAvailable(false);
      setInstallEvent(null);
    });
  };

  if (defaultTab === null) {
    return (
      <>
        <Navbar />
        <main className="main-content">
          <div className="app__init-loader" />
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={defaultTab !== "/" ? <Navigate to={defaultTab} replace /> : <Home />}
          />
          <Route path="/import" element={<Importer />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/locations" element={<Locations />} />
        </Routes>
      </main>
      {installAvailable && (
        <div className="app__install-banner">
          <span>Install Media Server</span>
          <button className="app__install-btn" onClick={handleInstall}>
            Install
          </button>
          <button
            className="app__install-dismiss"
            onClick={() => setInstallAvailable(false)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </>
  );
}

export default App;