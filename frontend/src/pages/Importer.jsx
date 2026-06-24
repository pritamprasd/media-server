import { useState, useEffect, useCallback } from "react";
import { importFolder, browseFs } from "../services/api";
import "./Importer.css";

const MIME_GROUPS = [
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
];

function DirEntry({ entry, onNavigate, onSelect, onCopyPath }) {
  return (
    <div className="importer__browse-row">
      <button className="importer__browse-name" onClick={() => onNavigate(entry.path)}>
        <span className="importer__browse-icon">📁</span>
        <span>{entry.name}</span>
      </button>
      <div className="importer__browse-actions">
        <button
          className="importer__browse-copy"
          onClick={() => onCopyPath(entry.path)}
          title="Copy path"
        >
          📋
        </button>
        <button className="importer__browse-pick" onClick={() => onSelect(entry.path)} title="Use this folder">
          +
        </button>
      </div>
    </div>
  );
}

function Importer() {
  const [path, setPath] = useState("");
  const [groups, setGroups] = useState({ image: true, video: true });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [currentDir, setCurrentDir] = useState(null);
  const [dirs, setDirs] = useState([]);
  const [files, setFiles] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  const loadDir = useCallback(async (dirPath) => {
    setBrowseLoading(true);
    try {
      const data = await browseFs(dirPath);
      setCurrentDir(data);
      setDirs(data.directories);
      setFiles(data.files);
    } catch {
      setError("Failed to browse directory");
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => {
    if (browseOpen && !currentDir) {
      loadDir("");
    }
  }, [browseOpen, currentDir, loadDir]);

  const handleNavigate = (dirPath) => {
    loadDir(dirPath);
  };

  const handleSelect = (dirPath) => {
    setPath(dirPath);
  };

  const handleUseCurrent = () => {
    if (currentDir?.path) {
      setPath(currentDir.path);
    }
  };

  const handleCopyPath = async (dirPath) => {
    try {
      await navigator.clipboard.writeText(dirPath);
      setCopied(dirPath);
      setTimeout(() => setCopied(null), 1500);
    } catch {
    }
  };

  const handleUp = () => {
    if (currentDir?.parent) {
      loadDir(currentDir.parent);
    }
  };

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

        <button
          type="button"
          className="importer__browse-toggle"
          onClick={() => setBrowseOpen((v) => !v)}
        >
          {browseOpen ? "Hide browser" : "Browse filesystem"}
        </button>

        {browseOpen && (
          <div className="importer__browser">
            <div className="importer__browse-header">
              <button
                className="importer__browse-up"
                disabled={!currentDir?.parent}
                onClick={handleUp}
                title="Parent directory"
              >
                ↑
              </button>
              <span className="importer__browse-path">{currentDir?.path || "Loading..."}</span>
              {currentDir?.path && (
                <button
                  type="button"
                  className="importer__browse-use"
                  onClick={handleUseCurrent}
                  title="Set import path to current folder"
                >
                  Use
                </button>
              )}
            </div>

            {browseLoading && <p className="importer__browse-loading">Loading...</p>}

            {!browseLoading && dirs.length === 0 && files.length === 0 && (
              <p className="importer__browse-empty">Empty folder</p>
            )}

            {!browseLoading && dirs.length > 0 && (
              <div className="importer__browse-section">
                <p className="importer__browse-label">Folders</p>
                {dirs.map((d) => (
                  <DirEntry
                    key={d.path}
                    entry={d}
                    onNavigate={handleNavigate}
                    onSelect={handleSelect}
                    onCopyPath={handleCopyPath}
                  />
                ))}
              </div>
            )}

            {!browseLoading && files.length > 0 && (
              <div className="importer__browse-section">
                <p className="importer__browse-label">
                  Media files ({files.length})
                </p>
                <div className="importer__browse-files">
                  {files.map((f) => (
                    <span key={f.path} className="importer__browse-file">
                      {f.mime_type?.startsWith("video/") ? "🎬" : "🖼️"} {f.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

      {copied && <div className="importer__toast">Path copied</div>}
    </div>
  );
}

export default Importer;
