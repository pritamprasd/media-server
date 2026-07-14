import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Upload as UploadIcon, FolderPlus, Check, Trash2,
  Folder, FolderOpen, FolderHeart, FolderTree, File, Image, Video, Search, X,
  Grid3X3, List, ChevronDown, Plus, FileUp, Eye,
  MoreVertical, Scissors, Copy, ClipboardPaste, Pencil, ArrowRight,
  ArrowLeft, ArrowUp, Loader2, Star, Heart, Home, Camera, Music, Globe, Bookmark, EyeOff,
  Calendar, StickyNote,
} from "lucide-react";
import {
  explorerBrowse, explorerRename, explorerMove, explorerCopy, explorerDelete,
  explorerListFavorites, explorerAddFavorite, explorerRemoveFavorite,
  uploadFiles, listNicknames, createUploadDir, toggleHidden,
  batchUpdateMetadata, batchCreateMemories,
} from "../services/api";
import { getPref, setPref } from "../services/db";
import FileViewer from "../components/FileViewer";
import CollectionMenuButton from "../components/CollectionMenuButton";
import "./MediaExplorer.css";

const FOLDER_ICONS = {
  Folder, FolderOpen, FolderHeart, FolderTree, Star, Heart, Home, Image, Video, Camera, Music, Globe, Bookmark,
};
const FOLDER_COLORS = [
  "#6b7280", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff",
];

function MediaExplorer() {
  const [files, setFiles] = useState([]);
  const [nickname, setNickname] = useState("");
  const [nicknames, setNicknames] = useState([]);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const previewFileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [favoriteFolders, setFavoriteFolders] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [folderStyles, setFolderStyles] = useState({});
  const [iconPicker, setIconPicker] = useState(null);
  const [thumbSize, setThumbSize] = useState(160);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchDateTaken, setBatchDateTaken] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const [batchNoteTags, setBatchNoteTags] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const newMenuRef = useRef(null);
  const sentinelRef = useRef(null);
  const nicknameInputRef = useRef(null);
  const nicknameId = "explorer-nickname-input";

  const refreshItems = useCallback(async (prefix) => {
    try {
      const data = await explorerBrowse(prefix, 1);
      const dirs = (data.directories || []).map((x) => ({ ...x, kind: "dir" }));
      const fils = (data.files || []).map((x) => ({ ...x, kind: "file" }));
      setItems([...dirs, ...fils]);
      setPage(1);
      setTotalPages(data.total_pages || 1);
    } catch {}
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const data = await explorerListFavorites();
      setFavoriteFolders(data.favorites || []);
    } catch {}
  }, []);

  const saveFolderStyle = useCallback((path, style) => {
    setFolderStyles((prev) => {
      const next = { ...prev, [path]: style };
      setPref("explorer_folder_styles", next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(async (path, name) => {
    const idx = favoriteFolders.findIndex((f) => f.path === path);
    try {
      if (idx >= 0) {
        await explorerRemoveFavorite(path);
        setFavoriteFolders((prev) => prev.filter((f) => f.path !== path));
      } else {
        await explorerAddFavorite(path, name);
        setFavoriteFolders((prev) => [...prev, { path, name }]);
      }
    } catch {}
  }, [favoriteFolders]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialPrefix = params.get("prefix") || "";
    if (initialPrefix) {
      setCurrentPrefix(initialPrefix);
      refreshItems(initialPrefix);
    } else {
      refreshItems("");
    }
    loadFavorites();
    getPref("nickname", "").then((v) => setNickname(v));
    getPref("explorer_folder_styles", {}).then((v) => setFolderStyles(v || {}));
    getPref("explorerThumbSize", 160).then((v) => setThumbSize(v || 160));
    listNicknames()
      .then((d) => setNicknames(d.nicknames || []))
      .catch(() => {});
  }, [refreshItems, loadFavorites]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(t);
  }, [result]);

  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const prefix = params.get("prefix") || "";
      navigateTo(prefix, { pushHistory: false });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleThumbSizeChange = (e) => {
    const val = Number(e.target.value);
    setThumbSize(val);
    setPref("explorerThumbSize", val);
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = items;
    if (q) list = list.filter((it) => (it.name || it.filename || "").toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      const dir = sortBy === "date" ? -1 : 1;
      if (sortBy === "name") return (a.name || a.filename || "").localeCompare(b.name || b.filename || "") * dir;
      if (sortBy === "size") return ((a.size || 0) - (b.size || 0)) * dir;
      if (sortBy === "date") return (new Date(a.created_at || 0) - new Date(b.created_at || 0)) * dir;
      return 0;
    });
  }, [items, searchQuery, sortBy]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await explorerBrowse(currentPrefix, next);
      const fils = (data.files || []).map((x) => ({ ...x, kind: "file" }));
      setItems((prev) => [...prev, ...fils]);
      setPage(next);
      setTotalPages(data.total_pages || 1);
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, page, totalPages, currentPrefix]);

  useEffect(() => {
    if (!sentinelRef.current || page >= totalPages || searchQuery) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { rootMargin: "200px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [page, totalPages, searchQuery, loadMore]);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navigateTo = (path, { pushHistory = true } = {}) => {
    setCurrentPrefix(path);
    refreshItems(path);
    setShowNewFolderInput(false);
    setSelectedIds(new Set());
    setContextMenu(null);
    setRenamingId(null);
    setDropTarget(null);
    if (pushHistory) {
      const url = path ? `/explorer?prefix=${encodeURIComponent(path)}` : "/explorer";
      window.history.pushState({ prefix: path }, "", url);
    }
  };

  const handleBack = () => {
    if (!currentPrefix) return;
    const parent = currentPrefix.includes("/")
      ? currentPrefix.substring(0, currentPrefix.lastIndexOf("/"))
      : "";
    navigateTo(parent);
  };

  const handleCreateDir = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const target = currentPrefix ? `${currentPrefix}/${name}` : name;
    try {
      await createUploadDir(target);
      setNewFolderName("");
      setShowNewFolderInput(false);
      setShowNewMenu(false);
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to create directory");
    }
  };

  const handleDeleteSelected = async () => {
    const paths = filtered
      .filter((it) => selectedIds.has(it.id || it.path) && (it.kind === "file" || it.kind === "dir"))
      .map((it) => it.path || it.relative_path)
      .filter(Boolean);
    if (!paths.length) return;
    if (!window.confirm(`Delete ${paths.length} item(s)?`)) return;
    setPasteLoading(true);
    try {
      await explorerDelete(paths);
      setSelectedIds(new Set());
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to delete items");
    }
    setPasteLoading(false);
  };

  const handleBatchEdit = async () => {
    const fileIds = filtered
      .filter((it) => selectedIds.has(it.id || it.path) && it.kind === "file" && it.id)
      .map((it) => it.id);
    if (!fileIds.length) return;
    setBatchSaving(true);
    try {
      if (batchDateTaken) {
        await batchUpdateMetadata(fileIds, { date_taken: batchDateTaken });
      }
      if (batchNote.trim()) {
        const tags = batchNoteTags.split(",").map((t) => t.trim()).filter(Boolean);
        await batchCreateMemories(fileIds, batchNote.trim(), tags);
      }
      setBatchEditOpen(false);
      setBatchDateTaken("");
      setBatchNote("");
      setBatchNoteTags("");
      setSelectedIds(new Set());
    } catch {
      setError("Failed to apply batch changes");
    }
    setBatchSaving(false);
  };

  const handleFileHide = async (fileId) => {
    try {
      await toggleHidden(fileId);
      setSelectedIds(new Set());
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to hide file");
    }
  };

  const getSelectedPaths = () => {
    return filtered
      .filter((it) => selectedIds.has(it.id || it.path))
      .map((it) => it.path || it.relative_path)
      .filter(Boolean);
  };

  const handleFilesPicked = useCallback((picked) => {
    setFiles(Array.from(picked));
    setResult(null);
    setError("");
    setShowNewMenu(false);
    setTimeout(() => {
      const el = nicknameInputRef.current;
      if (el) { el.focus(); el.select(); }
    }, 100);
  }, []);

  const handleFileChange = (e) => handleFilesPicked(e.target.files);
  const handleFolderChange = (e) => handleFilesPicked(e.target.files);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const externalFiles = Array.from(e.dataTransfer.files || []);
    if (externalFiles.length > 0) {
      setFiles(externalFiles);
      setResult(null);
      setError("");
      return;
    }
    const paths = getSelectedPaths();
    if (paths.length) {
      setPasteLoading(true);
      try {
        await explorerMove(paths, currentPrefix);
        setSelectedIds(new Set());
        await refreshItems(currentPrefix);
      } catch {
        setError("Failed to move items");
      }
      setPasteLoading(false);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };

  const handleUpload = async () => {
    if (!nickname.trim()) { setError("Nickname is required"); return; }
    if (files.length === 0) { setError("Select at least one file"); return; }
    setUploading(true);
    setProgress(0);
    setResult(null);
    setError("");
    try {
      const data = await uploadFiles(
        files, nickname.trim(), currentPrefix,
        (e) => { if (e.total) setProgress(Math.round((e.loaded / e.total) * 100)); },
      );
      setResult(data);
      setPref("nickname", nickname.trim());
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await refreshItems(currentPrefix);
      listNicknames().then((d) => setNicknames(d.nicknames || [])).catch(() => {});
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleSelect = (id, e) => {
    if (e?.shiftKey && selectedIds.size > 0) {
      const ids = filtered.map((it) => it.id || it.path);
      const last = [...selectedIds].pop();
      const start = ids.indexOf(last);
      const end = ids.indexOf(id);
      if (start !== -1 && end !== -1) {
        const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1);
        const next = new Set(selectedIds);
        range.forEach((i) => next.add(i));
        setSelectedIds(next);
        return;
      }
    }
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const id = item.id || item.path;
    if (!selectedIds.has(id)) setSelectedIds(new Set([id]));
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const handleShowActions = (e, item) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const id = item.id || item.path;
    if (!selectedIds.has(id)) setSelectedIds(new Set([id]));
    if (contextMenu?.item === item) {
      setContextMenu(null);
    } else {
      setContextMenu({ x: rect.right - 160, y: rect.bottom + 4, item });
    }
  };

  const handleCut = () => {
    const paths = getSelectedPaths();
    if (paths.length) setClipboard({ action: "cut", paths });
    setContextMenu(null);
  };

  const handleCopy = () => {
    const paths = getSelectedPaths();
    if (paths.length) setClipboard({ action: "copy", paths });
    setContextMenu(null);
  };

  const handlePaste = async (targetDir) => {
    if (!clipboard) return;
    const target = targetDir ?? currentPrefix;
    setPasteLoading(true);
    try {
      if (clipboard.action === "cut") {
        await explorerMove(clipboard.paths, target);
      } else {
        await explorerCopy(clipboard.paths, target);
      }
      setClipboard(null);
      setSelectedIds(new Set());
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to paste items");
    }
    setPasteLoading(false);
    setContextMenu(null);
  };

  const handleStartRename = (item) => {
    const id = item.id || item.path;
    setRenamingId(id);
    setRenameValue(item.name || item.filename || "");
    setContextMenu(null);
  };

  const handleRenameSubmit = async (item) => {
    const val = renameValue.trim();
    if (!val) { setRenamingId(null); return; }
    const path = item.path || item.relative_path;
    const oldName = item.name || item.filename;
    if (val === oldName) { setRenamingId(null); return; }
    const itemType = item.kind === "dir" ? "dir" : "file";
    setPasteLoading(true);
    try {
      await explorerRename(path, val, itemType);
      setRenamingId(null);
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to rename");
    }
    setPasteLoading(false);
  };

  const handleMoveTo = async (targetDir) => {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    setPasteLoading(true);
    try {
      await explorerMove(paths, targetDir);
      setSelectedIds(new Set());
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to move items");
    }
    setPasteLoading(false);
    setContextMenu(null);
  };

  const handleCopyTo = async (targetDir) => {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    setPasteLoading(true);
    try {
      await explorerCopy(paths, targetDir);
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to copy items");
    }
    setPasteLoading(false);
    setContextMenu(null);
  };

  const handleItemClick = (item) => {
    if (item.kind === "dir") {
      navigateTo(item.path);
      return;
    }
    const fileObj = { id: item.id, filename: item.name || item.filename, is_favorite: item.is_favorite };
    previewFileRef.current = fileObj;
    setPreviewFile(fileObj);
  };

  const fileItems = useMemo(() => items.filter((it) => it.kind === "file"), [items]);

  const handleNavigatePrev = useCallback(() => {
    const currentId = previewFileRef.current?.id;
    if (currentId == null) return;
    const idx = fileItems.findIndex((f) => f.id === currentId);
    if (idx > 0) {
      const prev = fileItems[idx - 1];
      const fileObj = { id: prev.id, filename: prev.name || prev.filename, is_favorite: prev.is_favorite };
      previewFileRef.current = fileObj;
      setPreviewFile(fileObj);
    }
  }, [fileItems]);

  const handleNavigateNext = useCallback(() => {
    const currentId = previewFileRef.current?.id;
    if (currentId == null) return;
    const idx = fileItems.findIndex((f) => f.id === currentId);
    if (idx >= 0 && idx < fileItems.length - 1) {
      const next = fileItems[idx + 1];
      const fileObj = { id: next.id, filename: next.name || next.filename, is_favorite: next.is_favorite };
      previewFileRef.current = fileObj;
      setPreviewFile(fileObj);
    }
  }, [fileItems]);

  const handleDragStart = (e, item) => {
    const id = item.id || item.path;
    if (!selectedIds.has(id)) setSelectedIds(new Set([id]));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleTileDragOver = (e, item) => {
    if (item.kind !== "dir") return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(item.path);
  };

  const handleTileDragLeave = (e, item) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDropTarget((prev) => prev === item.path ? null : prev);
  };

  const handleTileDrop = async (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (!selectedIds.size) return;
    const paths = getSelectedPaths();
    if (!paths.length) return;
    if (item.kind !== "dir") return;
    setPasteLoading(true);
    try {
      await explorerMove(paths, item.path);
      setSelectedIds(new Set());
      await refreshItems(currentPrefix);
    } catch {
      setError("Failed to move items");
    }
    setPasteLoading(false);
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };
  const formatDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const breadcrumbs = currentPrefix ? currentPrefix.split("/") : [];
  const itemId = (it) => it.id || it.path;
  const selCount = selectedIds.size;

  return (
    <div
      className={`explorer ${dragOver ? "explorer--drag-over" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => { setContextMenu(null); setShowNewMenu(false); setRenamingId(null); setDropTarget(null); }}
    >
      <div className="explorer__header">
        <div className="explorer__header-row">
          <h2 className="explorer__title">Media Explorer</h2>
          <div className="explorer__header-actions">
            <div className="explorer__nickname-wrap">
              <input
                ref={nicknameInputRef}
                id={nicknameId}
                className="explorer__input explorer__input--nickname"
                type="text"
                list="explorer-nickname-list"
                placeholder="Nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={uploading}
                autoComplete="off"
              />
              <datalist id="explorer-nickname-list">
                {nicknames.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            {files.length > 0 && (
              <button className="explorer__btn explorer__btn--primary" onClick={handleUpload}
                disabled={uploading || !nickname.trim()}>
                {uploading ? `${progress}%` : <><UploadIcon size={15} /> Upload {files.length} file{files.length > 1 ? "s" : ""}</>}
              </button>
            )}
          </div>
        </div>
        {uploading && (
          <div className="explorer__progress-wrap">
            <div className="explorer__progress-bar"><div className="explorer__progress-fill" style={{ width: `${progress}%` }} /></div>
            <span className="explorer__progress-text">{progress}%</span>
          </div>
        )}
        {error && <p className="explorer__error">{error}</p>}
      </div>

      <div className="explorer__toolbar">
        <div className="explorer__search-wrap">
          <Search size={15} className="explorer__search-icon" />
          <input className="explorer__search-input" type="text" placeholder="Search in this folder..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()} />
          {searchQuery && <button className="explorer__search-clear" onClick={() => setSearchQuery("")}><X size={14} /></button>}
        </div>
        <div className="explorer__toolbar-right">
          {clipboard && (
            <button className="explorer__paste-btn" onClick={(e) => { e.stopPropagation(); handlePaste(); }}
              disabled={pasteLoading}
              title={`Paste ${clipboard.paths.length} item(s)`}>
              {pasteLoading ? <Loader2 size={15} className="explorer__loading-btn-spin" /> : <ClipboardPaste size={15} />}
              {' '}Paste ({clipboard.paths.length})
            </button>
          )}
          <select className="explorer__sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            onClick={(e) => e.stopPropagation()}>
            <option value="name">Name</option>
            <option value="date">Newest</option>
            <option value="size">Size</option>
          </select>
          <button className="explorer__view-btn" onClick={(e) => { e.stopPropagation(); setViewMode(viewMode === "grid" ? "list" : "grid"); }}
            title={viewMode === "grid" ? "List view" : "Grid view"}>
            {viewMode === "grid" ? <List size={16} /> : <Grid3X3 size={16} />}
          </button>
          <div className="explorer__new-wrap" ref={newMenuRef}>
            <button className="explorer__new-btn" onClick={(e) => { e.stopPropagation(); setShowNewMenu((v) => !v); }}>
              <Plus size={16} /> New <ChevronDown size={12} />
            </button>
            {showNewMenu && (
              <div className="explorer__new-dropdown" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setShowNewFolderInput(true); setShowNewMenu(false); }}>
                  <FolderPlus size={15} /> New folder
                </button>
                <button onClick={() => fileInputRef.current?.click()}>
                  <FileUp size={15} /> File upload
                </button>
                <button onClick={() => folderInputRef.current?.click()}>
                  <Folder size={15} /> Folder upload
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {viewMode === "grid" && (
        <div className="explorer__thumb-slider-row" onClick={(e) => e.stopPropagation()}>
          <Grid3X3 size={14} className="explorer__thumb-icon explorer__thumb-icon--small" />
          <input
            type="range"
            min={80}
            max={300}
            value={thumbSize}
            onChange={handleThumbSizeChange}
            className="explorer__thumb-range"
            title={`Thumbnail size: ${thumbSize}px`}
            style={{ "--thumb-pct": `${((thumbSize - 80) / (300 - 80)) * 100}%` }}
          />
          <Grid3X3 size={22} className="explorer__thumb-icon explorer__thumb-icon--large" />
          <span className="explorer__thumb-label">{thumbSize}px</span>
        </div>
      )}

      {favoriteFolders.length > 0 && (
        <div className="explorer__favorites-bar">
          <Star size={13} className="explorer__fav-icon" />
          {favoriteFolders.map((fav) => (
            <button key={fav.path} className="explorer__fav-chip"
              onClick={(e) => { e.stopPropagation(); navigateTo(fav.path); }}
              title={`Navigate to ${fav.name}`}>
              {fav.name}
              <span className="explorer__fav-remove" onClick={(e) => { e.stopPropagation(); toggleFavorite(fav.path, fav.name); }}
                title="Remove favorite" role="button" tabIndex={0}>&times;</span>
            </button>
          ))}
        </div>
      )}

      <div className="explorer__breadcrumbs">
        {currentPrefix && (
          <button className="explorer__back-btn" onClick={(e) => { e.stopPropagation(); handleBack(); }} title="Go to parent folder">
            <ArrowLeft size={16} />
          </button>
        )}
        <span className="explorer__crumb" onClick={(e) => { e.stopPropagation(); navigateTo(""); }}>All Media</span>
        {breadcrumbs.map((part, i) => {
          const path = breadcrumbs.slice(0, i + 1).join("/");
          return (
            <span key={path} className="explorer__crumb-row">
              <span className="explorer__crumb-sep">/</span>
              <span className="explorer__crumb" onClick={(e) => { e.stopPropagation(); navigateTo(path); }}>{part}</span>
            </span>
          );
        })}
        {selCount > 0 && (
          <>
            <button className="explorer__action-btn" onClick={(e) => { e.stopPropagation(); handleCut(); }}
              disabled={pasteLoading}>
              <Scissors size={13} /> Cut
            </button>
            <button className="explorer__action-btn" onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              disabled={pasteLoading}>
              <Copy size={13} /> Copy
            </button>
            <button className="explorer__action-btn" onClick={(e) => { e.stopPropagation(); setBatchEditOpen(true); }}
              disabled={pasteLoading}>
              <Pencil size={13} /> Edit
            </button>
            <button className="explorer__del-selected" onClick={(e) => { e.stopPropagation(); handleDeleteSelected(); }}
              disabled={pasteLoading}>
              <Trash2 size={13} /> Delete {selCount} item{selCount > 1 ? "s" : ""}
            </button>
          </>
        )}
      </div>

      {showNewFolderInput && (
        <div className="explorer__new-folder" onClick={(e) => e.stopPropagation()}>
          <input className="explorer__input" type="text" placeholder="Folder name"
            value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateDir()} autoFocus />
          <button className="explorer__btn explorer__btn--small" onClick={handleCreateDir}
            disabled={!newFolderName.trim()}><Check size={14} /> Create</button>
          <button className="explorer__btn explorer__btn--small" onClick={() => { setShowNewFolderInput(false); setNewFolderName(""); }}><X size={14} /> Cancel</button>
        </div>
      )}

      <div
        className={`explorer__items ${viewMode === "grid" ? "explorer__items--grid" : "explorer__items--list"}`}
        style={viewMode === "grid" ? { "--thumb-size": `${thumbSize}px` } : undefined}
      >
        {filtered.length === 0 && (
          <div className="explorer__empty">
            {searchQuery ? `No results for "${searchQuery}"` : "This folder is empty"}
          </div>
        )}
        {filtered.map((it) => {
          const id = itemId(it);
          const sel = selectedIds.has(id);
          const isRenaming = renamingId === id;
          const isDropTarget = dropTarget === it.path && it.kind === "dir";
          if (it.kind === "dir") {
            const folderStyle = folderStyles[it.path];
            const FolderIconComp = FOLDER_ICONS[folderStyle?.icon] || Folder;
            const folderColor = folderStyle?.color;
            const fc = it.file_count || 0;
            const dc = it.dir_count || 0;
            const totalItems = fc + dc;
            const countLabel = totalItems > 0
              ? `${fc} file${fc !== 1 ? "s" : ""}${dc > 0 ? `, ${dc} folder${dc !== 1 ? "s" : ""}` : ""}`
              : "Empty folder";
            return (
              <div key={id}
                className={`explorer__tile ${viewMode === "grid" ? "explorer__tile--grid" : "explorer__tile--list"} ${sel ? "explorer__tile--sel" : ""} ${isDropTarget ? "explorer__tile--drop-target" : ""}`}
                onClick={(e) => { if (!isRenaming) { e.stopPropagation(); navigateTo(it.path); } }}
                onContextMenu={(e) => handleContextMenu(e, it)}
                draggable
                onDragStart={(e) => handleDragStart(e, it)}
                onDragOver={(e) => handleTileDragOver(e, it)}
                onDragLeave={(e) => handleTileDragLeave(e, it)}
                onDrop={(e) => handleTileDrop(e, it)}>
                <div className="explorer__tile-thumb" style={folderColor ? { color: folderColor } : undefined} title={countLabel}>
                  <FolderIconComp size={viewMode === "grid" ? 48 : 20} />
                  {viewMode === "grid" && totalItems > 0 && (
                    <span className="explorer__tile-count">{totalItems}</span>
                  )}
                  <span className="explorer__tile-customize-hint" title="Customize folder icon"
                    onClick={(e) => { e.stopPropagation(); setIconPicker(it.path); }}>
                    <Pencil size={viewMode === "grid" ? 10 : 8} />
                  </span>
                </div>
                {isRenaming ? (
                  <input className="explorer__rename-input" type="text" value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(it); if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={() => handleRenameSubmit(it)}
                    onClick={(e) => e.stopPropagation()} autoFocus />
                ) : (
                  <div className="explorer__tile-name" title={it.name}>{it.name}</div>
                )}
                <div className={`explorer__tile-check ${sel ? "explorer__tile-check--visible" : ""}`}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(id, e); }}>
                  <Check size={12} />
                </div>
                <button className="explorer__tile-actions" onClick={(e) => handleShowActions(e, it)} title="Actions">
                  <MoreVertical size={14} />
                </button>
                <button className={`explorer__tile-fav ${favoriteFolders.some((f) => f.path === it.path) ? "explorer__tile-fav--active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(it.path, it.name); }}
                  title={favoriteFolders.some((f) => f.path === it.path) ? "Remove from favorites" : "Add to favorites"}>
                  <Star size={12} />
                </button>
                {viewMode === "list" && <div className="explorer__tile-meta">{countLabel}</div>}
              </div>
            );
          }
          const isVideo = it.mime_type?.startsWith("video/");
          const thumbUrl = it.thumbnail_status === "completed" ? `/api/files/${it.id}/thumbnail` : null;
          return (
            <div key={id}
              className={`explorer__tile ${viewMode === "grid" ? "explorer__tile--grid" : "explorer__tile--list"} ${sel ? "explorer__tile--sel" : ""}`}
              onClick={(e) => { if (!isRenaming) { e.stopPropagation(); handleItemClick(it); } }}
              onContextMenu={(e) => handleContextMenu(e, it)}
              draggable
              onDragStart={(e) => handleDragStart(e, it)}>
              <div className="explorer__tile-thumb">
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="explorer__tile-img" loading="lazy" />
                ) : isVideo ? (
                  <Video size={viewMode === "grid" ? 48 : 20} />
                ) : (
                  <Image size={viewMode === "grid" ? 48 : 20} />
                )}
              </div>
              {isRenaming ? (
                <input className="explorer__rename-input" type="text" value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(it); if (e.key === "Escape") setRenamingId(null); }}
                  onBlur={() => handleRenameSubmit(it)}
                  onClick={(e) => e.stopPropagation()} autoFocus />
              ) : (
                viewMode === "list" && <div className="explorer__tile-name" title={it.filename || it.name}>{it.filename || it.name}</div>
              )}
              <div className={`explorer__tile-check ${sel ? "explorer__tile-check--visible" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleSelect(id, e); }}>
                <Check size={12} />
              </div>
              <button className="explorer__tile-actions" onClick={(e) => { e.stopPropagation(); handleFileHide(it.id); }} title="Hide file">
                <EyeOff size={14} />
              </button>
              <button className="explorer__tile-actions" onClick={(e) => handleShowActions(e, it)} title="Actions">
                <MoreVertical size={14} />
              </button>
              <CollectionMenuButton fileId={it.id} className="explorer__tile-cmb" />
              {viewMode === "list" && (
                <div className="explorer__tile-meta">
                  {formatSize(it.size)}{it.created_at ? ` · ${formatDate(it.created_at)}` : ""}{it.nickname ? ` · ${it.nickname}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {page < totalPages && !searchQuery && (
        <div ref={sentinelRef} className="explorer__loadmore-wrap">
          {loadingMore ? (
            <button className="explorer__load-more" disabled>Loading...</button>
          ) : (
            <button className="explorer__load-more" onClick={(e) => { e.stopPropagation(); loadMore(); }}>
              Load more ({page}/{totalPages})
            </button>
          )}
        </div>
      )}

      {contextMenu && (
        <div className="explorer__ctx-overlay" onClick={() => setContextMenu(null)}>
          <div className="explorer__ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { const it = contextMenu.item; it.kind === "dir" ? navigateTo(it.path) : handleItemClick(it); setContextMenu(null); }}>
              {contextMenu.item.kind === "dir" ? <><FolderOpen size={15} /> Open</> : <><Eye size={15} /> Preview</>}
            </button>
            <button onClick={() => { const it = contextMenu.item; const id = it.id || it.path; toggleSelect(id); setContextMenu(null); }}>
              <Check size={15} /> {selectedIds.has(contextMenu.item.id || contextMenu.item.path) ? "Deselect" : "Select"}
            </button>
            {contextMenu.item.kind === "dir" && (
              <button onClick={() => { setIconPicker(contextMenu.item.path); setContextMenu(null); }}>
                <Pencil size={15} /> Customize folder
              </button>
            )}
            <button onClick={handleCut}>
              <Scissors size={15} /> Cut
            </button>
            <button onClick={handleCopy}>
              <Copy size={15} /> Copy
            </button>
            {clipboard && (
              <button onClick={() => { handlePaste(); setContextMenu(null); }}>
                <ClipboardPaste size={15} /> Paste here
              </button>
            )}
            {currentPrefix && (
              <button onClick={() => { handleMoveTo(currentPrefix.split("/").slice(0, -1).join("/") || ""); setContextMenu(null); }}>
                <ArrowRight size={15} /> Move to parent
              </button>
            )}
            <button onClick={() => { handleStartRename(contextMenu.item); }}>
              <Pencil size={15} /> Rename
            </button>
            <button onClick={() => { setContextMenu(null); handleDeleteSelected(); }}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      )}

      {iconPicker && (() => {
        const CurrIcon = FOLDER_ICONS[folderStyles[iconPicker]?.icon] || Folder;
        return (
        <div className="explorer__icon-picker-overlay" onClick={() => setIconPicker(null)}>
          <div className="explorer__icon-picker" onClick={(e) => e.stopPropagation()}>
            <div className="explorer__icon-picker-header">
              <span className="explorer__icon-picker-title">Customize folder</span>
              <button className="explorer__icon-picker-close" onClick={() => setIconPicker(null)}><X size={14} /></button>
            </div>
            {folderStyles[iconPicker]?.icon && (
              <div className="explorer__icon-picker-current">
                <CurrIcon size={24} />
                {folderStyles[iconPicker]?.color && (
                  <span className="explorer__icon-picker-current-color" style={{ background: folderStyles[iconPicker].color }} />
                )}
              </div>
            )}
            <div className="explorer__icon-picker-grid">
              {Object.entries(FOLDER_ICONS).map(([name, IconComp]) => (
                <button key={name}
                  className={`explorer__icon-picker-btn ${folderStyles[iconPicker]?.icon === name ? "explorer__icon-picker-btn--active" : ""}`}
                  onClick={() => saveFolderStyle(iconPicker, { ...folderStyles[iconPicker], icon: name })}
                  title={name}>
                  <IconComp size={20} />
                </button>
              ))}
            </div>
            <div className="explorer__icon-picker-colors">
              {FOLDER_COLORS.map((c) => (
                <button key={c}
                  className={`explorer__icon-picker-color ${folderStyles[iconPicker]?.color === c ? "explorer__icon-picker-color--active" : ""}`}
                  style={{ background: c }}
                  onClick={() => saveFolderStyle(iconPicker, { ...folderStyles[iconPicker], color: folderStyles[iconPicker]?.color === c ? null : c })}
                  title={c} />
              ))}
            </div>
            <button className="explorer__icon-picker-reset" onClick={() => { saveFolderStyle(iconPicker, {}); }}>
              Reset to default
            </button>
          </div>
        </div>
        );
      })()}

      {result && (
        <div className="explorer__result">
          <p className="explorer__result-ok">
            Uploaded {result.saved?.length || 0} file(s)
            {result.skipped?.length > 0 && `, ${result.skipped.length} skipped (duplicate)`}
            {result.errors?.length > 0 && `, ${result.errors.length} error(s)`}
          </p>
        </div>
      )}

      <input ref={fileInputRef} className="explorer__hidden-input" type="file" multiple
        accept="image/*,video/*" onChange={handleFileChange} />
      <input ref={folderInputRef} className="explorer__hidden-input" type="file" multiple
        webkitdirectory="" onChange={handleFolderChange} />

      {files.length > 0 && (
        <div className="explorer__bottom-bar">
          <div className="explorer__bottom-info">
            <span className="explorer__bottom-count">{files.length} file{files.length > 1 ? "s" : ""} selected</span>
            <span className="explorer__bottom-size">{formatSize(totalSize)}</span>
          </div>
          <div className="explorer__bottom-files">
            {files.map((f, i) => (
              <div key={i} className="explorer__bottom-file">
                <span className="explorer__bottom-fname">{f.name}</span>
                <span className="explorer__bottom-fsize">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
          <div className="explorer__bottom-actions">
            <button className="explorer__btn explorer__btn--primary" onClick={handleUpload}
              disabled={uploading || !nickname.trim()}>
              {uploading ? `Uploading ${progress}%` : <><UploadIcon size={15} /> Upload</>}
            </button>
            <button className="explorer__btn" onClick={() => { setFiles([]); setResult(null); }}
              disabled={uploading}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {pasteLoading && (
        <div className="explorer__loading-overlay">
          <Loader2 className="explorer__loading-spinner" size={32} />
          <span>Processing...</span>
        </div>
      )}

      {batchEditOpen && (
        <div className="explorer__modal-overlay" onClick={() => setBatchEditOpen(false)}>
          <div className="explorer__modal" onClick={(e) => e.stopPropagation()}>
            <div className="explorer__modal-header">
              <span>Edit {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""}</span>
              <button className="explorer__btn explorer__btn--small" onClick={() => setBatchEditOpen(false)}><X size={14} /></button>
            </div>
            <div className="explorer__modal-body">
              <label className="explorer__modal-label">
                <Calendar size={14} /> Date Taken
                <input type="datetime-local" className="explorer__input"
                  value={batchDateTaken} onChange={(e) => setBatchDateTaken(e.target.value)} />
              </label>
              <label className="explorer__modal-label">
                <StickyNote size={14} /> My Notes
                <textarea className="explorer__input" rows={3} placeholder="Add a note to all selected files..."
                  value={batchNote} onChange={(e) => setBatchNote(e.target.value)} />
              </label>
              <label className="explorer__modal-label">
                Tags (comma-separated)
                <input className="explorer__input" type="text" placeholder="e.g. vacation, 2024"
                  value={batchNoteTags} onChange={(e) => setBatchNoteTags(e.target.value)} />
              </label>
            </div>
            <div className="explorer__modal-footer">
              <button className="explorer__btn" onClick={() => setBatchEditOpen(false)} disabled={batchSaving}>Cancel</button>
              <button className="explorer__btn explorer__btn--primary" onClick={handleBatchEdit}
                disabled={batchSaving || (!batchDateTaken && !batchNote.trim())}>
                {batchSaving ? "Saving..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScrollTop && (
        <button className="explorer__scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <ArrowUp size={20} />
        </button>
      )}

      {previewFile && (
        <FileViewer
          file={previewFile}
          onClose={() => { previewFileRef.current = null; setPreviewFile(null); }}
          onNavigatePrev={fileItems.length > 1 ? handleNavigatePrev : undefined}
          onNavigateNext={fileItems.length > 1 ? handleNavigateNext : undefined}
        />
      )}
    </div>
  );
}

export default MediaExplorer;