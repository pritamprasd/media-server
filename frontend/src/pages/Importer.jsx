import { useState } from "react";
import { importFolder } from "../services/api";
import "./Importer.css";

const MIME_GROUPS = [
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
];

function Importer() {
  const [path, setPath] = useState("");
  const [groups, setGroups] = useState({ image: true, video: true });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const toggleGroup = (id) => {
    setGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedGroups = MIME_GROUPS.filter((g) => groups[g.id]).map((g) => g.id);
  const canSubmit = path.trim() && selectedGroups.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await importFolder(path.trim(), selectedGroups);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="importer">
      <h2 className="importer__title">Import Media</h2>

      <form className="importer__form" onSubmit={handleSubmit}>
        <input
          className="importer__input"
          type="text"
          placeholder="Folder path (e.g. /home/user/media)"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />

        <fieldset className="importer__groups">
          <legend className="importer__legend">Media types</legend>
          <div className="importer__toggles">
            {MIME_GROUPS.map((g) => (
              <label key={g.id} className="importer__toggle">
                <input
                  type="checkbox"
                  checked={groups[g.id]}
                  onChange={() => toggleGroup(g.id)}
                />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="importer__btn"
          type="submit"
          disabled={loading || !canSubmit}
        >
          {loading ? "Importing..." : "Import"}
        </button>
      </form>

      {error && <p className="importer__error">{error}</p>}

      {result && (
        <div className="importer__result">
          <p className="importer__ok">{result.message}</p>
        </div>
      )}
    </div>
  );
}

export default Importer;
