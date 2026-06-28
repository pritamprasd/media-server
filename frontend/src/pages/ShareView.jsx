import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getFile } from "../services/api";
import FileViewer from "../components/FileViewer";
import Spinner from "../components/Spinner";

function ShareView() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileId) return;
    getFile(Number(fileId))
      .then(setFile)
      .catch(() => setError("File not found"));
  }, [fileId]);

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "1rem" }}>
        <p style={{ color: "var(--color-text-muted)" }}>{error}</p>
        <button onClick={() => navigate("/")} style={{ padding: "0.5rem 1rem", background: "var(--color-primary)", border: "none", borderRadius: "var(--radius)", color: "#fff", cursor: "pointer" }}>Go Home</button>
      </div>
    );
  }

  if (!file) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <FileViewer
      file={file}
      onClose={() => navigate("/")}
    />
  );
}

export default ShareView;
