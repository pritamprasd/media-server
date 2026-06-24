import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { listFiles, listDirectories, toggleFavorite as toggleFavApi } from "../services/api";
import FileViewer from "../components/FileViewer";
import "./Home.css";

function buildDirTree(dirs) {
  const bySession = {};
  for (const d of dirs) {
    if (!bySession[d.session_id]) bySession[d.session_id] = [];
    bySession[d.session_id].push(d);
  }

  const sessions = [];
  for (const sid of Object.keys(bySession)) {
    const children = bySession[sid];
    const childMap = {};
    for (const d of children) {
      if (d.path === d.parent_path) continue;
      if (!childMap[d.parent_path]) childMap[d.parent_path] = [];
      childMap[d.parent_path].push(d);
    }

    const sorted = (parentPath) => {
      const entries = childMap[parentPath] || [];
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return entries.map((d) => ({
        ...d,
        children: sorted(d.path),
      }));
    };

    const sessionRoot = children.find((d) => d.path === "");
    const sessionRoots = sorted("");
    sessions.push({
      session_id: parseInt(sid),
      root_path: sessionRoot?.session_root_path || `Session ${sid}`,
      trees: sessionRoots,
    });
  }

  sessions.sort((a, b) => a.root_path.localeCompare(b.root_path));
  return sessions;
}

function DirTree({ sessions, selectedId, onSelect }) {
  const [collapsed, setCollapsed] = useState({});

  const toggle = (sessionId) => {
    setCollapsed((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };

  const renderNode = (node, depth) => (
    <li key={node.id} className="home__dir-li">
      <button
        className={`home__dir-btn ${selectedId === node.id ? "home__dir-btn--active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        <span className="home__dir-icon">{node.children?.length ? "📂" : "📁"}</span>
        {node.name}
      </button>
      {node.children?.length > 0 && (
        <ul className="home__dir-ul">
          {node.children.map((c) => renderNode(c, depth + 1))}
        </ul>
      )}
    </li>
  );

  return (
    <div className="home__dir-picker">
      <button
        className={`home__dir-all ${selectedId === null ? "home__dir-all--active" : ""}`}
        onClick={() => onSelect(null)}
      >
        <span className="home__dir-all-icon">🗂</span>
        <span className="home__dir-all-label">All directories</span>
      </button>

      {sessions.map((s) => (
        <div key={s.session_id} className="home__dir-session">
          <button
            className="home__dir-session-header"
            onClick={() => toggle(s.session_id)}
          >
            <span className="home__dir-session-arrow">{collapsed[s.session_id] ? "▶" : "▼"}</span>
            <span className="home__dir-session-path" title={s.root_path}>{s.root_path}</span>
          </button>
          {!collapsed[s.session_id] && (
            <ul className="home__dir-ul">
              {s.trees.map((n) => renderNode(n, 0))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Home() {
  const [files, setFiles] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState(null);
  const [mimeGroup, setMimeGroup] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [directories, setDirectories] = useState([]);
  const [directoryId, setDirectoryId] = useState(null);
  const sentinelRef = useRef(null);
  const searchTimeout = useRef(null);
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const abortRef = useRef(null);
  hasMoreRef.current = hasMore;
  loadingRef.current = loading;

  const dirSessions = useMemo(() => buildDirTree(directories), [directories]);

  useEffect(() => {
    listDirectories()
      .then(setDirectories)
      .catch(() => {});
  }, []);

  const fetchPage = useCallback(async (p, mime, q, dirId, signal) => {
    setLoading(true);
    const filters = {};
    if (mime) filters.mimeGroup = mime;
    if (q) filters.q = q;
    if (dirId != null) filters.directoryId = dirId;
    try {
      const data = await listFiles(p, 50, filters, signal);
      if (signal?.aborted) return;
      setFiles((prev) => (p === 1 ? data.files : [...prev, ...data.files]));
      setHasMore(p < data.pages);
    } catch {
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPage(1);
    setFiles([]);
    setHasMore(true);
    setInitialLoading(true);
    fetchPage(1, mimeGroup, searchQuery, directoryId, controller.signal);
    return () => controller.abort();
  }, [mimeGroup, searchQuery, directoryId]);

  useEffect(() => {
    if (page === 1) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchPage(page, mimeGroup, searchQuery, directoryId, controller.signal);
    return () => controller.abort();
  }, [page, mimeGroup, searchQuery, directoryId]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current) {
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 400);
    return () => clearTimeout(searchTimeout.current);
  }, [searchInput]);

  const handleToggleFav = async (fileId) => {
    try {
      const updated = await toggleFavApi(fileId);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, is_favorite: updated.is_favorite } : f
        )
      );
    } catch {
    }
  };

  return (
    <div className="home">
      <header className="home__header">
        <h1>Media Server</h1>
        <p className="home__subtitle">Your personal media hub</p>
        <div className="home__filters">
          <input
            className="home__search"
            type="text"
            placeholder="Search tags, description, filename..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div className="home__mime-filters">
            {["", "image", "video"].map((g) => (
              <button
                key={g}
                className={`home__mime-btn ${mimeGroup === g ? "home__mime-btn--active" : ""}`}
                onClick={() => setMimeGroup(g)}
              >
                {g === "" ? "All" : g === "image" ? "Images" : "Videos"}
              </button>
            ))}
          </div>
        </div>
        {directories.length > 0 && (
          <div className="home__dirs">
            <DirTree sessions={dirSessions} selectedId={directoryId} onSelect={setDirectoryId} />
          </div>
        )}
      </header>

      {initialLoading && (
        <div className="home__loading-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="home__skeleton" />
          ))}
        </div>
      )}

      {!initialLoading && files.length === 0 && (
        <p className="home__empty">
          No media found. {!searchQuery ? 'Go to the Import tab to add files.' : 'Try a different search.'}
        </p>
      )}

      {files.length > 0 && (
        <div className="home__grid">
          {files.map((file) => (
            <div
              key={file.id}
              className="home__card"
              onClick={() => setViewerFile(file)}
            >
              <div className="home__thumb-wrap">
                {file.thumbnail ? (
                  <img
                    className="home__thumb"
                    src={file.thumbnail}
                    alt={file.filename}
                    loading="lazy"
                  />
                ) : (
                  <div className="home__thumb-placeholder">
                    {file.mime_type && file.mime_type.startsWith("video/") ? "🎬" : "🖼️"}
                  </div>
                )}
                {file.mime_type && file.mime_type.startsWith("video/") && (
                  <span className="home__badge">Video</span>
                )}
              </div>
              <div className="home__card-footer">
                <span className="home__filename" title={file.filename}>
                  {file.filename}
                </span>
                <button
                  className={`home__fav ${file.is_favorite ? "home__fav--active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFav(file.id);
                  }}
                  title={file.is_favorite ? "Remove from favorites" : "Add to favorites"}
                >
                  {file.is_favorite ? "★" : "☆"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="home__sentinel">
        {loading && <div className="home__spinner" />}
      </div>

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={() => setViewerFile(null)}
          onToggleFavorite={(fileId, isFav) => {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId ? { ...f, is_favorite: isFav } : f
              )
            );
          }}
          onEditSave={(newFile) => {
            setViewerFile(newFile);
          }}
          onDelete={(fileId) => {
            setFiles((prev) => prev.filter((f) => f.id !== fileId));
          }}
        />
      )}
    </div>
  );
}

export default Home;
