import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Upload as UploadIcon, FolderPlus, Check, Trash2,
  Folder, FolderOpen, File, Image, Video, Search, X,
  Grid3X3, List, ChevronDown, Plus, FileUp, Eye,
  MoreVertical, Scissors, Copy, ClipboardPaste, Pencil, ArrowRight,
  ArrowLeft, Loader2,
} from "lucide-react";
import {
  explorerBrowse, explorerRename, explorerMove, explorerCopy, explorerDelete,
  uploadFiles, listNicknames, createUploadDir,
} from "../services/api";
import { getPref, setPref } from "../services/db";
import FileViewer from "../components/FileViewer";
import "./MediaExplorer.css";

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
  const [dragOver, setDragOver] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [pasteLoading, setPasteLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const newMenuRef = useRef(null);
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

  useEffect(() => {
    refreshItems("");
    getPref("nickname", "").then((v) => setNickname(v));
    listNicknames()
      .then((d) => setNicknames(d.nicknames || []))
      .catch(() => {});
  }, [refreshItems]);

  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

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

  const navigateTo = (path) => {
    setCurrentPrefix(path);
    refreshItems(path);
    setShowNewFolderInput(false);
    setSelectedIds(new Set());
    setContextMenu(null);
    setRenamingId(null);
    setDropTarget(null);
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
      refreshItems(currentPrefix);
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
      refreshItems(currentPrefix);
    } catch {
      setError("Failed to delete items");
    }
    setPasteLoading(false);
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
  }, []);

  const handleFileChange = (e) => handleFilesPicked(e.target.files);
  const handleFolderChange = (e) => handleFilesPicked(e.target.files);

  const handleDrop = (e) => {
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
      explorerMove(paths, currentPrefix)
        .then(() => {
          setSelectedIds(new Set());
          refreshItems(currentPrefix);
        })
        .catch(() => setError("Failed to move items"))
        .finally(() => setPasteLoading(false));
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
      refreshItems(currentPrefix);
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
      refreshItems(currentPrefix);
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
      refreshItems(currentPrefix);
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
      refreshItems(currentPrefix);
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
      refreshItems(currentPrefix);
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
    setPreviewFile({ id: item.id, filename: item.name || item.filename });
  };

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
      refreshItems(currentPrefix);
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

      <div className={`explorer__items ${viewMode === "grid" ? "explorer__items--grid" : "explorer__items--list"}`}>
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
                <div className="explorer__tile-thumb">
                  <Folder size={viewMode === "grid" ? 48 : 20} />
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
                {viewMode === "list" && <div className="explorer__tile-meta">Folder</div>}
              </div>
            );
          }
          const isVideo = it.mime_type?.startsWith("video/");
          const thumbUrl = it.thumbnail && it.thumbnail_status === "completed" ? it.thumbnail : null;
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
                <div className="explorer__tile-name" title={it.filename || it.name}>{it.filename || it.name}</div>
              )}
              <div className={`explorer__tile-check ${sel ? "explorer__tile-check--visible" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleSelect(id, e); }}>
                <Check size={12} />
              </div>
              <button className="explorer__tile-actions" onClick={(e) => handleShowActions(e, it)} title="Actions">
                <MoreVertical size={14} />
              </button>
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
        <div className="explorer__loadmore-wrap">
          <button className="explorer__load-more" onClick={(e) => { e.stopPropagation(); loadMore(); }} disabled={loadingMore}>
            {loadingMore ? "Loading..." : `Load more (${page}/${totalPages})`}
          </button>
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
              <button onClick={() => { handleMoveTo(currentPrefix); setContextMenu(null); }}>
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

      {result && (
        <div className="explorer__result">
          <p className="explorer__result-ok">
            Uploaded {result.saved?.length || 0} file(s)
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

      {previewFile && <FileViewer file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}

export default MediaExplorer;