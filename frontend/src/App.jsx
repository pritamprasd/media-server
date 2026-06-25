import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Importer from "./pages/Importer";
import Gallery from "./pages/Gallery";
import Favorites from "./pages/Favorites";
import Duplicates from "./pages/Duplicates";
import Upload from "./pages/Upload";
import Statistics from "./pages/Statistics";
import "./App.css";

function App() {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/import" element={<Importer />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/statistics" element={<Statistics />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
