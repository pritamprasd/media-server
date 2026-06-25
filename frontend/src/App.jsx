import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Importer from "./pages/Importer";
import Gallery from "./pages/Gallery";
import Favorites from "./pages/Favorites";
import Duplicates from "./pages/Duplicates";
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
        </Routes>
      </main>
    </>
  );
}

export default App;
