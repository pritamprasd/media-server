import { useState, useEffect, useCallback, useRef } from "react";
import { listDuplicates, deleteFile } from "../services/api";
import FileViewer from "../components/FileViewer";
import "./Duplicates.css";

function Duplicates() {
  const [groups, setGroups] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [type, setType] = useState("exact");
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState(null);
  const viewerOpenRef = useRef(false);

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDuplicates(type);
      if (type === "exact") {
        setGroups(data.groups || []);
      } else {
        setPairs(data.pairs || []);
      }
    } catch {
      setGroups([]);
      setPairs([]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRemove = async (fileId) => {
    await deleteFile(fileId, false);
    setGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          files: g.files.filter((f) => f.file_id !== fileId),
        }))
        .filter((g) => g.files.length > 1)
    );
  };

  const handleKeepOne = async (groupId, keepId) => {
    const group = groups.find((g) => g.hash === groupId);
    if (!group) return;
    for (const f of group.files) {
      if (f.file_id !== keepId) {
        await deleteFile(f.file_id, false);
      }
    }
    setGroups((prev) => prev.filter((g) => g.hash !== groupId));
  };

  return (
    <div className="duplicates">
      <div className="duplicates__header">
        <h2 className="duplicates__title">Duplicates</h2>
        <div className="duplicates__tabs">
          <button
            className={`duplicates__tab ${type === "exact" ? "duplicates__tab--active" : ""}`}
            onClick={() => setType("exact")}
          >
            Exact Duplicates {groups.length > 0 && `(${groups.length})`}
          </button>
          <button
            className={`duplicates__tab ${type === "near" ? "duplicates__tab--active" : ""}`}
            onClick={() => setType("near")}
          >
            Near Duplicates
          </button>
        </div>
      </div>

      {loading && <p className="duplicates__empty">Scanning...</p>}

      {!loading && type === "exact" && groups.length === 0 && (
        <p className="duplicates__empty">No exact duplicates found.</p>
      )}

      {!loading && type === "near" && pairs.length === 0 && (
        <p className="duplicates__empty">No near duplicates found.</p>
      )}

      {!loading && type === "exact" && groups.length > 0 && (
        <div className="duplicates__groups">
          {groups.map((g) => (
            <div key={g.hash} className="duplicates__group">
              <div className="duplicates__group-header">
                <span className="duplicates__group-count">{g.count} copies</span>
                <button
                  className="duplicates__keep-btn"
                  onClick={() => handleKeepOne(g.hash, g.files[0].file_id)}
                >
                  Keep first, remove rest
                </button>
              </div>
              <div className="duplicates__grid">
                {g.files.map((f) => (
                  <div key={f.file_id} className="duplicates__card">
                    <div className="duplicates__thumb-wrap" onClick={() => {
                      openViewer({ ...f, id: f.file_id, is_favorite: false });
                    }}>
                      {f.thumbnail ? (
                        <img className="duplicates__thumb" src={f.thumbnail} alt={f.filename} />
                      ) : (
                        <div className="duplicates__thumb-placeholder">
                          {f.mime_type?.startsWith("video/") ? "🎬" : "🖼️"}
                        </div>
                      )}
                    </div>
                    <div className="duplicates__info">
                      <span className="duplicates__filename">{f.filename}</span>
                      <span className="duplicates__size">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        className="duplicates__remove"
                        onClick={() => handleRemove(f.file_id)}
                        title="Remove from library"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && type === "near" && pairs.length > 0 && (
        <div className="duplicates__pairs">
          {pairs.map((p, i) => (
            <div key={i} className="duplicates__pair">
              <div className="duplicates__pair-distance">Distance: {p.distance}</div>
              <div className="duplicates__pair-files">
                <div className="duplicates__card" onClick={() => {
                  openViewer({ ...p.file_a, id: p.file_a.file_id, is_favorite: false });
                }}>
                  <img className="duplicates__thumb" src={p.file_a.thumbnail} alt={p.file_a.filename} />
                  <span className="duplicates__filename">{p.file_a.filename}</span>
                </div>
                <div className="duplicates__pair-vs">≈</div>
                <div className="duplicates__card" onClick={() => {
                  openViewer({ ...p.file_b, id: p.file_b.file_id, is_favorite: false });
                }}>
                  <img className="duplicates__thumb" src={p.file_b.thumbnail} alt={p.file_b.filename} />
                  <span className="duplicates__filename">{p.file_b.filename}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={closeViewer}
          onDelete={(fileId) => {
            if (type === "exact") {
              setGroups((prev) =>
                prev
                  .map((g) => ({
                    ...g,
                    files: g.files.filter((f) => f.file_id !== fileId),
                  }))
                  .filter((g) => g.files.length > 1)
              );
            }
            closeViewer();
          }}
        />
      )}
    </div>
  );
}

export default Duplicates;
