import { useState, useEffect, useCallback, useRef } from "react";
import { Folder, ClipboardCopy, ArrowUp, ArrowRightToLine, Upload, Image, Video, Search, ChevronDown } from "lucide-react";
import { importFolder, browseFs, listSessions, browseSession } from "../services/api";
import Spinner from "../components/Spinner";
import TreeNode from "../components/TreeNode";
import FileViewer from "../components/FileViewer";
import "./Importer.css";

const MIME_GROUPS = [
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
];

function DirEntry({ entry, onNavigate, onSelect, onCopyPath }) {
  return (
    <div className="importer__browse-row">
      <button className="importer__browse-name" onClick={() => onNavigate(entry.path)}>
        <span className="importer__browse-icon"><Folder size={15} /></span>
        <span>{entry.name}</span>
      </button>
      <div className="importer__browse-actions">
        <button
          className="importer__browse-copy"
          onClick={() => onCopyPath(entry.path)}
          title="Copy path"
        >
          <ClipboardCopy size={14} />
        </button>
        <button className="importer__browse-pick" onClick={() => onSelect(entry.path)} title="Use this folder">
          <ArrowRightToLine size={14} />
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [treeData, setTreeData] = useState({});
  const [viewerFile, setViewerFile] = useState(null);
  const viewerOpenRef = useRef(false);

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

  useEffect(() => {
    if (historyOpen && sessions.length === 0) {
      listSessions().then(setSessions).catch(() => {});
    }
  }, [historyOpen, sessions.length]);

  const closeViewer = useCallback(() => {
    if (viewerOpenRef.current) {
      viewerOpenRef.current = false;
      setViewerFile(null);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      if (viewerOpenRef.current) {
        viewerOpenRef.current = false;
        setViewerFile(null);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const openViewer = useCallback((file) => {
    if (!viewerOpenRef.current) {
      viewerOpenRef.current = true;
      window.history.pushState({ viewer: true }, "");
    }
    setViewerFile(file);
  }, []);

  const loadSessionDir = useCallback(async (sessionId, path) => {
    if (treeData[path]) return treeData[path];
    const data = await browseSession(sessionId, path);
    setTreeData((prev) => ({ ...prev, [path]: data }));
    return data;
  }, [treeData]);

  const handleSelectSession = (session) => {
    setActiveSession(session);
    setTreeData({});
    viewerOpenRef.current = false;
    setViewerFile(null);
  };

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
          <Search size={14} /> {browseOpen ? "Hide browser" : "Browse filesystem"}
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
                <ArrowUp size={14} />
              </button>
              <span className="importer__browse-path">{currentDir?.path || "Loading..."}</span>
              {currentDir?.path && (
                <button
                  type="button"
                  className="importer__browse-use"
                  onClick={handleUseCurrent}
                  title="Set import path to current folder"
                >
                  <ArrowRightToLine size={14} /> Use
                </button>
              )}
            </div>

            {browseLoading && (
              <div className="importer__browse-loading">
                <Spinner size={20} color="var(--color-text-muted)" />
              </div>
            )}

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
                      {f.mime_type?.startsWith("video/") ? <Video size={12} /> : <Image size={12} />} {f.name}
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
          {loading ? <><Spinner size={14} color="currentColor" /> Importing</> : <><Upload size={14} /> Import</>}
        </button>
      </form>

      {error && <p className="importer__error">{error}</p>}

      {result && (
        <div className="importer__result">
          <p className="importer__ok">{result.message}</p>
        </div>
      )}

      <div className="importer__history">
        <button className="importer__browse-toggle" onClick={() => setHistoryOpen((v) => !v)}>
          <ChevronDown size={14} style={{ transform: historyOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} /> Import History
        </button>
        {historyOpen && (
          <div className="importer__history-body">
            {sessions.length === 0 && (
              <p className="importer__browse-empty">No imports yet.</p>
            )}
            {sessions.length > 0 && (
              <>
                <div className="importer__sessions-row">
                  <label className="importer__browse-label" style={{ textTransform: "none" }}>Session:</label>
                  <select
                    className="gallery__sessions-select"
                    value={activeSession?.id || ""}
                    onChange={(e) => {
                      const s = sessions.find((s) => s.id === Number(e.target.value));
                      if (s) handleSelectSession(s);
                    }}
                  >
                    <option value="" disabled>-- Select --</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.root_path} ({s.total_files} files)</option>
                    ))}
                  </select>
                </div>
                {activeSession && (
                  <div className="importer__tree">
                    <TreeNode
                      sessionId={activeSession.id}
                      path=""
                      name={activeSession.root_path}
                      loadDir={loadSessionDir}
                      treeData={treeData}
                      onFileClick={openViewer}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {copied && <div className="importer__toast">Path copied</div>}

      {viewerFile && <FileViewer file={viewerFile} onClose={closeViewer} />}
    </div>
  );
}

export default Importer;
