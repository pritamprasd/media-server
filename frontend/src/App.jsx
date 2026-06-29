import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ArrowDownToLine, X } from "lucide-react";
import { getPref } from "./services/db";
import Navbar from "./components/Navbar";
import Spinner from "./components/Spinner";
import Home from "./pages/Home";
import Importer from "./pages/Importer";
import Gallery from "./pages/Gallery";
import Favorites from "./pages/Favorites";
import Duplicates from "./pages/Duplicates";
import Upload from "./pages/Upload";
import MediaExplorer from "./pages/MediaExplorer";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import MapPage from "./pages/Map";
import Locations from "./pages/Locations";
import Faces from "./pages/Faces";
import ShareView from "./pages/ShareView";
import About from "./pages/About";
import Tools from "./pages/Tools";
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
          <div className="app__init-loader"><Spinner size={36} /></div>
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
          <Route path="/explorer" element={<MediaExplorer />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/faces" element={<Faces />} />
          <Route path="/about" element={<About />} />
          <Route path="/tools/*" element={<Tools />} />
          <Route path="/view/:fileId" element={<ShareView />} />
        </Routes>
      </main>
      {installAvailable && (
        <div className="app__install-banner">
          <span>Install Media Server</span>
          <button className="app__install-btn" onClick={handleInstall}>
            <ArrowDownToLine size={16} /> Install
          </button>
          <button
            className="app__install-dismiss"
            onClick={() => setInstallAvailable(false)}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

export default App;