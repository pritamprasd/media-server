import { useState, useEffect, useRef, useCallback } from "react";
import { Search, List, Image, Video, ArrowUpDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { listHiddenFiles, unhideFiles } from "../services/api";
import FileViewer from "../components/FileViewer";
import Spinner from "../components/Spinner";
import "./Home.css";

function Hidden() {
  const [files, setFiles] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState(null);
  const [mimeGroup, setMimeGroup] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const sentinelRef = useRef(null);
  const searchTimeout = useRef(null);
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const abortRef = useRef(null);
  const viewerOpenRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const viewerFileRef = useRef(null);
  hasMoreRef.current = hasMore;
  loadingRef.current = loading;

  const pin = sessionStorage.getItem("hidden_pin") || "";

  const handleSort = useCallback((col) => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return col;
    });
  }, []);

  const closeViewer = useCallback(() => {
    if (viewerOpenRef.current) {
      viewerOpenRef.current = false;
      viewerFileRef.current = null;
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
    viewerFileRef.current = file;
    setViewerFile(file);
  }, []);

  const handleNavigatePrev = useCallback(() => {
    const currentId = viewerFileRef.current?.id;
    if (currentId == null) return;
    const idx = files.findIndex((f) => f.id === currentId);
    if (idx > 0) {
      const prev = files[idx - 1];
      viewerFileRef.current = prev;
      setViewerFile(prev);
    }
  }, [files]);

  const handleNavigateNext = useCallback(() => {
    const currentId = viewerFileRef.current?.id;
    if (currentId == null) return;
    const idx = files.findIndex((f) => f.id === currentId);
    if (idx >= 0 && idx < files.length - 1) {
      const next = files[idx + 1];
      viewerFileRef.current = next;
      setViewerFile(next);
    }
  }, [files]);

  const fetchPage = useCallback(async (p, mime, q, sb, sd, signal) => {
    setLoading(true);
    const filters = {};
    if (mime) filters.mimeGroup = mime;
    if (q) filters.q = q;
    if (sb) filters.sortBy = sb;
    if (sd) filters.sortDir = sd;
    try {
      const data = await listHiddenFiles(p, 50, filters, pin, signal);
      if (signal?.aborted) return;
      loadedOnceRef.current = true;
      setFiles((prev) => (p === 1 ? data.files : [...prev, ...data.files]));
      setHasMore(p < data.pages);
      if (p === 1) setTotalCount(data.total);
    } catch {
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [pin]);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPage(1);
    setFiles([]);
    setHasMore(true);
    setInitialLoading(true);
    loadedOnceRef.current = false;
    fetchPage(1, mimeGroup, searchQuery, sortBy, sortDir, controller.signal);
    return () => controller.abort();
  }, [mimeGroup, searchQuery, sortBy, sortDir]);

  useEffect(() => {
    if (page === 1) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchPage(page, mimeGroup, searchQuery, sortBy, sortDir, controller.signal);
    return () => controller.abort();
  }, [page, mimeGroup, searchQuery, sortBy, sortDir]);

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
    const onScroll = () => setShowScrollTop(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 400);
    return () => clearTimeout(searchTimeout.current);
  }, [searchInput]);

  const handleUnhide = async (fileId) => {
    try {
      await unhideFiles([fileId], pin);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  return (
    <div className="home">
      <div className="home__layout home__layout--auto">
        <div className="home__main">
          <header className="home__header">
            <h1 style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", fontSize: "1.5rem" }}>
              <Eye size={22} /> Hidden Files
            </h1>

            {totalCount > 0 && (
              <div className="home__count">
                {totalCount} file{totalCount !== 1 ? "s" : ""} hidden
                {mimeGroup || searchQuery ? " filtered" : ""}
              </div>
            )}

            <div className="home__filters">
              <div className="home__search-wrap">
                <Search size={15} className="home__search-icon" />
                <input
                  className="home__search"
                  type="text"
                  placeholder="Search hidden files..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <div className="home__mime-filters">
                <button
                  className={`home__mime-btn ${mimeGroup === "" ? "home__mime-btn--active" : ""}`}
                  onClick={() => setMimeGroup("")}
                  title="All"
                >
                  <List size={15} />
                </button>
                <button
                  className={`home__mime-btn ${mimeGroup === "image" ? "home__mime-btn--active" : ""}`}
                  onClick={() => setMimeGroup("image")}
                  title="Images"
                >
                  <Image size={15} />
                </button>
                <button
                  className={`home__mime-btn ${mimeGroup === "video" ? "home__mime-btn--active" : ""}`}
                  onClick={() => setMimeGroup("video")}
                  title="Videos"
                >
                  <Video size={15} />
                </button>
              </div>
            </div>

            <div className="home__sort">
              <button
                className={`home__sort-btn ${sortBy === "filename" ? "home__sort-btn--active" : ""}`}
                onClick={() => handleSort("filename")}
                title="Sort by name"
              >
                <ArrowUpDown size={11} />
                Name
                {sortBy === "filename" && (
                  <span className="home__sort-dir">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                )}
              </button>
              <button
                className={`home__sort-btn ${sortBy === "created_at" ? "home__sort-btn--active" : ""}`}
                onClick={() => handleSort("created_at")}
                title="Sort by date"
              >
                <ArrowUpDown size={11} />
                Date
                {sortBy === "created_at" && (
                  <span className="home__sort-dir">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                )}
              </button>
              <button
                className={`home__sort-btn ${sortBy === "size" ? "home__sort-btn--active" : ""}`}
                onClick={() => handleSort("size")}
                title="Sort by size"
              >
                <ArrowUpDown size={11} />
                Size
                {sortBy === "size" && (
                  <span className="home__sort-dir">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                )}
              </button>
            </div>

            {mimeGroup || searchQuery || sortBy !== "created_at" || sortDir !== "desc" ? (
              <button className="home__clear-btn" onClick={() => {
                setMimeGroup("");
                setSearchInput("");
                setSearchQuery("");
                setSortBy("created_at");
                setSortDir("desc");
              }}>
                Clear filters
              </button>
            ) : null}
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
              No hidden files found. Hide media from Home or Explorer to see them here.
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
                        {file.mime_type && file.mime_type.startsWith("video/") ? <Video size={24} /> : <Image size={24} />}
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
                      className="home__fav home__fav--active"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnhide(file.id);
                      }}
                      title="Unhide file"
                    >
                      <EyeOff size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="home__sentinel">
            {loading && <Spinner size={20} />}
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
          onNavigatePrev={handleNavigatePrev}
          onNavigateNext={handleNavigateNext}
          hiddenPin={pin}
        />
      )}

      {showScrollTop && (
        <button className="explorer__scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <ArrowUp size={20} />
        </button>
      )}
    </div>
  );
}

export default Hidden;
