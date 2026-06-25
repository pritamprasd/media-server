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
import "./App.css";

function App() {
  const [defaultTab, setDefaultTab] = useState(null);

  useEffect(() => {
    getPref("defaultTab", "/").then(setDefaultTab);
  }, []);

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
        </Routes>
      </main>
    </>
  );
}

export default App;