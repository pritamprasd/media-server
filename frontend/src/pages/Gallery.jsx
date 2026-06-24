import { useState, useEffect, useCallback, useRef } from "react";
import { listSessions, browseSession } from "../services/api";
import TreeNode from "../components/TreeNode";
import FileViewer from "../components/FileViewer";
import "./Gallery.css";

function Gallery() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [treeData, setTreeData] = useState({});
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

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => {});
  }, []);

  const loadDir = useCallback(async (sessionId, path) => {
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

  return (
    <div className="gallery">
      <h2 className="gallery__title">Imported Media</h2>

      {sessions.length === 0 && (
        <p className="gallery__empty">
          No imports yet. Go to the Import tab to add media.
        </p>
      )}

      {sessions.length > 0 && (
        <div className="gallery__sessions">
          <label className="gallery__sessions-label">Import session:</label>
          <select
            className="gallery__sessions-select"
            value={activeSession?.id || ""}
            onChange={(e) => {
              const s = sessions.find((s) => s.id === Number(e.target.value));
              if (s) handleSelectSession(s);
            }}
          >
            <option value="" disabled>
              -- Select --
            </option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.root_path} ({s.total_files} files)
              </option>
            ))}
          </select>
        </div>
      )}

      {activeSession && (
        <div className="gallery__tree">
          <TreeNode
            sessionId={activeSession.id}
            path=""
            name={activeSession.root_path}
            loadDir={loadDir}
            treeData={treeData}
            onFileClick={openViewer}
          />
        </div>
      )}

      {viewerFile && <FileViewer file={viewerFile} onClose={closeViewer} />}
    </div>
  );
}

export default Gallery;
