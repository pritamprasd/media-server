import { useState, useEffect } from "react";
import { getStatus } from "../services/api";
import "./Home.css";

function Home() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStatus()
      .then((data) => setStatus(data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="home">
      <header className="home__header">
        <h1>Media Server</h1>
        <p className="home__subtitle">Your personal media hub</p>
      </header>

      <main className="home__main">
        <section className="home__card">
          <h2>API Status</h2>
          {error && <p className="home__error">{error}</p>}
          {status && <p className="home__ok">{status.message}</p>}
          {!status && !error && <p className="home__loading">Connecting...</p>}
        </section>
      </main>
    </div>
  );
}

export default Home;
