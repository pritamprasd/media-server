import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { listFiles, listDirectories, toggleFavorite as toggleFavApi } from "../services/api";
import FileViewer from "../components/FileViewer";
import "./Home.css";

function buildDirTree(dirs) {
  const byPath = {};
  for (const d of dirs) {
    if (!byPath[d.path]) byPath[d.path] = d;
  }

  const unique = Object.values(byPath);
  const childMap = {};
  for (const d of unique) {
    if (d.path === d.parent_path) continue;
    if (!childMap[d.parent_path]) childMap[d.parent_path] = [];
    childMap[d.parent_path].push(d);
  }

  const build = (parentPath) => {
    const entries = childMap[parentPath] || [];
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries.map((d) => ({
      ...d,
      children: build(d.path),
    }));
  };

  return build("");
}

function DirTree({ trees, selectedId, onSelect, onClose }) {
  const renderNode = (node, depth) => (
    <li key={node.id} className="home__dir-li">
      <button
        className={`home__dir-btn ${selectedId === node.id ? "home__dir-btn--active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => { onSelect(node.id); onClose?.(); }}
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
        onClick={() => { onSelect(null); onClose?.(); }}
      >
        <span className="home__dir-all-icon">🗂</span>
        <span className="home__dir-all-label">All directories</span>
      </button>

      {trees.length > 0 && (
        <div className="home__dir-scroll">
          <ul className="home__dir-ul">
            {trees.map((n) => renderNode(n, 0))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Home() {
  const [files, setFiles] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState(null);
  const [mimeGroup, setMimeGroup] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [directories, setDirectories] = useState([]);
  const [directoryId, setDirectoryId] = useState(null);
  const [dirDialogOpen, setDirDialogOpen] = useState(false);
  const sentinelRef = useRef(null);
  const searchTimeout = useRef(null);
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const abortRef = useRef(null);
  const viewerOpenRef = useRef(false);
  const loadedOnceRef = useRef(false);
  hasMoreRef.current = hasMore;
  loadingRef.current = loading;

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

  const dirTree = useMemo(() => buildDirTree(directories), [directories]);

  const selectedDirName = useMemo(() => {
    if (directoryId == null) return "All directories";
    const d = directories.find((d) => d.id === directoryId);
    return d ? d.name : "All directories";
  }, [directoryId, directories]);

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
      loadedOnceRef.current = true;
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
    loadedOnceRef.current = false;
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
        if (entries[0].isIntersecting && loadedOnceRef.current && hasMoreRef.current && !loadingRef.current) {
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
      <div className="home__layout">
        <div className="home__main">
          <header className="home__header">
            <h1>Media Server</h1>
            <p className="home__subtitle">Your personal media hub</p>

            {directories.length > 0 && (
              <div className="home__dir-bar">
                <button className="home__dir-trigger" onClick={() => setDirDialogOpen(true)}>
                  <span>📁</span>
                  <span>{selectedDirName}</span>
                  <span className="home__dir-trigger-arrow">▾</span>
                </button>
              </div>
            )}

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
                  onClick={() => openViewer(file)}
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
        </div>
      </div>

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={closeViewer}
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
            closeViewer();
          }}
        />
      )}

      {dirDialogOpen && (
        <div className="home__dir-overlay" onClick={() => setDirDialogOpen(false)}>
          <div className="home__dir-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="home__dir-dialog-header">
              <span>Filter by directory</span>
              <button className="home__dir-close" onClick={() => setDirDialogOpen(false)}>✕</button>
            </div>
            <div className="home__dir-dialog-body">
              <DirTree
                trees={dirTree}
                selectedId={directoryId}
                onSelect={setDirectoryId}
                onClose={() => setDirDialogOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
