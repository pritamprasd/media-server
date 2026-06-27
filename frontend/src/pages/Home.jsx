import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, List, Image, Video, Sparkles, FolderTree, Folder, FolderOpen, ChevronDown, X, Hash, Columns2, Heart, ArrowUpDown } from "lucide-react";
import { listFiles, listDirectories, toggleFavorite as toggleFavApi, listTags } from "../services/api";
import { getPref, setPref } from "../services/db";
import FileViewer from "../components/FileViewer";
import Spinner from "../components/Spinner";
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

function flattenTree(nodes, query) {
  const q = query.toLowerCase();
  const result = [];
  const walk = (list, depth) => {
    for (const n of list) {
      if (n.name.toLowerCase().includes(q)) {
        result.push({ ...n, matchDepth: depth });
      }
      walk(n.children || [], depth + 1);
    }
  };
  walk(nodes, 0);
  return result;
}

function DirTree({ trees, selectedId, onSelect, onClose, search }) {
  const renderNode = (node, depth) => (
    <li key={node.id} className="home__dir-li">
      <button
        className={`home__dir-btn ${selectedId === node.id ? "home__dir-btn--active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => { onSelect(node.id); onClose?.(); }}
      >
        <span className="home__dir-icon">{node.children?.length ? <FolderOpen size={15} /> : <Folder size={15} />}</span>
        {node.name}
      </button>
      {node.children?.length > 0 && (
        <ul className="home__dir-ul">
          {node.children.map((c) => renderNode(c, depth + 1))}
        </ul>
      )}
    </li>
  );

  const flatResults = search ? flattenTree(trees, search) : null;

  return (
    <div className="home__dir-picker">
      <button
        className={`home__dir-all ${selectedId === null ? "home__dir-all--active" : ""}`}
        onClick={() => { onSelect(null); onClose?.(); }}
      >
        <span className="home__dir-all-icon"><FolderTree size={15} /></span>
        <span className="home__dir-all-label">All directories</span>
      </button>

      {search && flatResults.length === 0 && (
        <div className="home__dir-empty">No directories match "{search}"</div>
      )}

      {search && flatResults.length > 0 && (
        <div className="home__dir-scroll">
          <ul className="home__dir-ul">
            {flatResults.map((n) => (
              <li key={n.id} className="home__dir-li">
                <button
                  className={`home__dir-btn ${selectedId === n.id ? "home__dir-btn--active" : ""}`}
                  style={{ paddingLeft: `${12 + n.matchDepth * 16}px` }}
                  onClick={() => { onSelect(n.id); onClose?.(); }}
                >
                  <span className="home__dir-icon"><Folder size={15} /></span>
                  {n.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!search && trees.length > 0 && (
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
  const [dirSearch, setDirSearch] = useState("");
  const [minWidth, setMinWidth] = useState(null);
  const [minHeight, setMinHeight] = useState(null);
  const [hasAi, setHasAi] = useState(false);
  const [tag, setTag] = useState("");
  const [allTags, setAllTags] = useState([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [columns, setColumns] = useState("auto");
  const sentinelRef = useRef(null);
  const searchTimeout = useRef(null);
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  const abortRef = useRef(null);
  const viewerOpenRef = useRef(false);
  const loadedOnceRef = useRef(false);
  hasMoreRef.current = hasMore;
  loadingRef.current = loading;

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

  useEffect(() => {
    if (!showTagDropdown) return;
    const handler = (e) => {
      if (!e.target.closest(".home__tag-dropdown")) setShowTagDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTagDropdown]);

  const selectedDirName = useMemo(() => {
    if (directoryId == null) return "All directories";
    const d = directories.find((d) => d.id === directoryId);
    return d ? d.name : "All directories";
  }, [directoryId, directories]);

  const filteredTags = useMemo(() => {
    if (!tagSearch) return allTags;
    const q = tagSearch.toLowerCase();
    return allTags.filter((t) => t.tag.includes(q));
  }, [allTags, tagSearch]);

  useEffect(() => {
    listDirectories()
      .then(setDirectories)
      .catch(() => {});
    listTags()
      .then((d) => setAllTags(d.tags || []))
      .catch(() => {});
    getPref("homeColumns", "auto").then(setColumns);
  }, []);

  const dimPresets = [
    { label: "None", w: null, h: null },
    { label: "VGA 640×480", w: 640, h: 480 },
    { label: "HD 1280×720", w: 1280, h: 720 },
    { label: "Full HD 1920×1080", w: 1920, h: 1080 },
    { label: "4K 3840×2160", w: 3840, h: 2160 },
  ];

  const handleDimPreset = (preset) => {
    setMinWidth(preset.w);
    setMinHeight(preset.h);
  };

  const fetchPage = useCallback(async (p, mime, q, dirId, minW, minH, ai, tg, sb, sd, signal) => {
    setLoading(true);
    const filters = {};
    if (mime) filters.mimeGroup = mime;
    if (q) filters.q = q;
    if (dirId != null) filters.directoryId = dirId;
    if (minW != null) filters.minWidth = minW;
    if (minH != null) filters.minHeight = minH;
    if (ai) filters.hasAi = true;
    if (tg) filters.tag = tg;
    if (sb) filters.sortBy = sb;
    if (sd) filters.sortDir = sd;
    try {
      const data = await listFiles(p, 50, filters, signal);
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
    fetchPage(1, mimeGroup, searchQuery, directoryId, minWidth, minHeight, hasAi, tag, sortBy, sortDir, controller.signal);
    return () => controller.abort();
  }, [mimeGroup, searchQuery, directoryId, minWidth, minHeight, hasAi, tag, sortBy, sortDir]);

  useEffect(() => {
    if (page === 1) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchPage(page, mimeGroup, searchQuery, directoryId, minWidth, minHeight, hasAi, tag, sortBy, sortDir, controller.signal);
    return () => controller.abort();
  }, [page, mimeGroup, searchQuery, directoryId, minWidth, minHeight, hasAi, tag, sortBy, sortDir]);

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
      <div className={`home__layout${columns === "auto" ? " home__layout--auto" : ""}`}>
        <div className="home__main">
          <header className="home__header">
            {directories.length > 0 && (
              <div className="home__dir-bar">
                <button className="home__dir-trigger" onClick={() => setDirDialogOpen(true)}>
                  <FolderTree size={16} />
                  <span>{selectedDirName}</span>
                  <ChevronDown size={14} className="home__dir-trigger-arrow" />
                </button>
              </div>
            )}

            {totalCount > 0 && (
              <div className="home__count">
                {totalCount} file{totalCount !== 1 ? "s" : ""}
                {mimeGroup || directoryId || searchQuery || minWidth || minHeight || hasAi || tag ? " filtered" : ""}
              </div>
            )}

            <div className="home__filters">
              <div className="home__search-wrap">
                <Search size={15} className="home__search-icon" />
                <input
                  className="home__search"
                  type="text"
                  placeholder="Search tags, description, filename..."
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
                <button
                  className={`home__mime-btn ${hasAi ? "home__mime-btn--active" : ""}`}
                  onClick={() => setHasAi((p) => !p)}
                  title="Only media with AI-generated tags, description, or search words"
                >
                  <Sparkles size={15} />
                </button>
              </div>
            </div>

            <div className="home__dim-filters">
              <span className="home__dim-label">
                {mimeGroup === "video" ? "Min resolution:" : "Min dimension:"}
              </span>
              <div className="home__dim-presets">
                {dimPresets.map((p) => (
                  <button
                    key={p.label}
                    className={`home__dim-btn ${minWidth === p.w && minHeight === p.h ? "home__dim-btn--active" : ""}`}
                    onClick={() => handleDimPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="home__tag-filter">
              <div className="home__tag-dropdown">
                <button
                  className="home__tag-trigger"
                  onClick={() => setShowTagDropdown((p) => !p)}
                >
                  <Hash size={13} />
                  <span>{tag || "All tags"}</span>
                  <ChevronDown size={12} className={`home__tag-arrow ${showTagDropdown ? "home__tag-arrow--open" : ""}`} />
                </button>
                {showTagDropdown && (
                  <div className="home__tag-menu">
                    <input
                      className="home__tag-search"
                      type="text"
                      placeholder="Search tags..."
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      autoFocus
                    />
                    <div className="home__tag-options">
                      <div
                        className={`home__tag-option ${!tag ? "home__tag-option--active" : ""}`}
                        onClick={() => { setTag(""); setShowTagDropdown(false); setTagSearch(""); }}
                      >
                        <span className="home__tag-option-name">All tags</span>
                      </div>
                      {filteredTags.map((t) => (
                        <div
                          key={t.tag}
                          className={`home__tag-option ${tag === t.tag ? "home__tag-option--active" : ""}`}
                          onClick={() => { setTag(t.tag); setShowTagDropdown(false); setTagSearch(""); }}
                        >
                          <span className="home__tag-option-name">{t.tag}</span>
                          <span className="home__tag-option-count">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

            <div className="home__column-toggle">
              <button
                className={`home__column-btn ${columns === "auto" ? "home__column-btn--active" : ""}`}
                onClick={() => { setColumns("auto"); setPref("homeColumns", "auto"); }}
                title="Auto columns"
              >
                <Columns2 size={13} />
                Auto
              </button>
              <button
                className={`home__column-btn ${columns === "1" ? "home__column-btn--active" : ""}`}
                onClick={() => { setColumns("1"); setPref("homeColumns", "1"); }}
                title="1 column"
              >
                1
              </button>
              <button
                className={`home__column-btn ${columns === "2" ? "home__column-btn--active" : ""}`}
                onClick={() => { setColumns("2"); setPref("homeColumns", "2"); }}
                title="2 columns"
              >
                2
              </button>
            </div>

            {mimeGroup || searchQuery || directoryId || minWidth || minHeight || hasAi || tag || sortBy !== "created_at" || sortDir !== "desc" ? (
              <button className="home__clear-btn" onClick={() => {
                setMimeGroup("");
                setSearchInput("");
                setSearchQuery("");
                setDirectoryId(null);
                setMinWidth(null);
                setMinHeight(null);
                setHasAi(false);
                setTag("");
                setSortBy("created_at");
                setSortDir("desc");
              }}>
                <X size={14} /> Clear
              </button>
            ) : null}
          </header>

          {initialLoading && (
            <div className={`home__loading-grid${columns !== "auto" ? ` home__loading-grid--${columns}` : ""}`}>
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
            <div className={`home__grid${columns !== "auto" ? ` home__grid--${columns}` : ""}`}>
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
                      className={`home__fav ${file.is_favorite ? "home__fav--active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFav(file.id);
                      }}
                      title={file.is_favorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      {file.is_favorite ? <Heart size={14} fill="currentColor" /> : <Heart size={14} />}
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
        />
      )}

      {dirDialogOpen && (
        <div className="home__dir-overlay" onClick={() => { setDirDialogOpen(false); setDirSearch(""); }}>
          <div className="home__dir-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="home__dir-dialog-header">
              <span>Filter by directory</span>
              <button className="home__dir-close" onClick={() => { setDirDialogOpen(false); setDirSearch(""); }}><X size={14} /></button>
            </div>
            <div className="home__dir-dialog-body">
              <div className="home__dir-search-wrap">
                <Search size={14} className="home__dir-search-icon" />
                <input
                  className="home__dir-search-input"
                  type="text"
                  placeholder="Search directories…"
                  value={dirSearch}
                  onChange={(e) => setDirSearch(e.target.value)}
                  autoFocus
                />
                {dirSearch && (
                  <button className="home__dir-search-clear" onClick={() => setDirSearch("")}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <DirTree
                trees={dirTree}
                selectedId={directoryId}
                onSelect={setDirectoryId}
                onClose={() => setDirDialogOpen(false)}
                search={dirSearch}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
