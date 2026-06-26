import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Upload as UploadIcon, FolderPlus, Check, Trash2,
  Folder, File, Image, Video, Search, X,
  Grid3X3, List, ArrowUpDown, Plus,
} from "lucide-react";
import { uploadFiles, listUploadDirs, createUploadDir, listNicknames, softDeleteFiles, softDeleteDir, listRecentFiles } from "../services/api";
import { getPref, setPref } from "../services/db";
import FileViewer from "../components/FileViewer";
import "./Upload.css";

function Upload() {
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
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const nicknameId = "upload-nickname-input";

  const refreshItems = useCallback(async (prefix) => {
    try {
      const [d, r] = await Promise.all([
        listUploadDirs(prefix),
        listRecentFiles(prefix),
      ]);
      const dirs = (d.directories || []).map((x) => ({ ...x, kind: "dir" }));
      const fils = (r.files || []).map((x) => ({ ...x, kind: "file" }));
      setItems([...dirs, ...fils]);
    } catch {}
  }, []);

  useEffect(() => {
    refreshItems("");
    getPref("nickname", "").then((v) => setNickname(v));
    listNicknames()
      .then((d) => setNicknames(d.nicknames || []))
      .catch(() => {});
  }, [refreshItems]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let list = items;
    if (q) list = list.filter((it) => it.name?.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      const dir = sortBy === "date" ? -1 : 1;
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "") * dir;
      if (sortBy === "size") return ((a.size || 0) - (b.size || 0)) * dir;
      if (sortBy === "date") return (new Date(a.created_at || 0) - new Date(b.created_at || 0)) * dir;
      return 0;
    });
  }, [items, searchQuery, sortBy]);

  const navigateTo = (path) => {
    setCurrentPrefix(path);
    refreshItems(path);
    setShowNewFolderInput(false);
    setSelectedIds(new Set());
    setContextMenu(null);
  };

  const handleCreateDir = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const target = currentPrefix ? `${currentPrefix}/${name}` : name;
    try {
      await createUploadDir(target);
      setNewFolderName("");
      setShowNewFolderInput(false);
      refreshItems(currentPrefix);
    } catch {
      setError("Failed to create directory");
    }
  };

  const handleDeleteDir = async (path, name) => {
    if (!window.confirm(`Delete folder "${name}" and all its files?`)) return;
    try {
      await softDeleteDir(path);
      refreshItems(currentPrefix);
    } catch {
      setError("Failed to delete directory");
    }
  };

  const handleDeleteFile = async (fileId, filename) => {
    if (!window.confirm(`Delete file "${filename}"?`)) return;
    try {
      await softDeleteFiles([fileId]);
      refreshItems(currentPrefix);
    } catch {
      setError("Failed to delete file");
    }
  };

  const handleDeleteSelected = async () => {
    const dirs = filtered.filter((it) => selectedIds.has(it.id) && it.kind === "dir");
    const fls = filtered.filter((it) => selectedIds.has(it.id) && it.kind === "file");
    const msg = [];
    if (dirs.length) msg.push(`${dirs.length} folder(s)`);
    if (fls.length) msg.push(`${fls.length} file(s)`);
    if (!msg.length) return;
    if (!window.confirm(`Delete ${msg.join(" and ")}?`)) return;
    const ops = dirs.map((d) => softDeleteDir(d.path).catch(() => {}));
    if (fls.length) ops.push(softDeleteFiles(fls.map((f) => f.id)).catch(() => {}));
    await Promise.all(ops);
    setSelectedIds(new Set());
    refreshItems(currentPrefix);
  };

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files || []));
    setResult(null);
    setError("");
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    setFiles(Array.from(e.dataTransfer.files || []));
    setResult(null);
    setError("");
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

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
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const handleItemClick = (item) => {
    if (item.kind === "dir") {
      navigateTo(item.path);
      return;
    }
    setPreviewFile({ id: item.id, filename: item.name || item.filename });
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

  return (
    <div className="upload" ref={dropRef} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      <h2 className="upload__title">Upload Media</h2>

      {/* Top bar: nickname + upload button */}
      <div className="upload__topbar">
        <div className="upload__nickname-wrap">
          <label className="upload__label" htmlFor={nicknameId}>
            Nickname <span className="upload__required">*</span>
          </label>
          <input
            id={nicknameId}
            className="upload__input"
            type="text"
            list="nickname-list"
            placeholder="Who is uploading?"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={uploading}
            autoComplete="off"
          />
          <datalist id="nickname-list">
            {nicknames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <button className="upload__btn upload__btn--primary upload__upload-btn" onClick={handleUpload}
          disabled={uploading || files.length === 0 || !nickname.trim()}>
          {uploading ? <>Uploading {progress}%</> : <><UploadIcon size={16} /> Upload</>}
        </button>
      </div>

      {/* Breadcrumbs */}
      <div className="upload__breadcrumbs">
        <span className="upload__crumb" onClick={() => navigateTo("")}>Root</span>
        {breadcrumbs.map((part, i) => {
          const path = breadcrumbs.slice(0, i + 1).join("/");
          return (
            <span key={path} className="upload__crumb-row">
              <span className="upload__crumb-sep">/</span>
              <span className="upload__crumb" onClick={() => navigateTo(path)}>{part}</span>
            </span>
          );
        })}
        <span className="upload__crumb-filler" />
        {selectedIds.size > 0 && (
          <button className="upload__del-btn-selected" onClick={handleDeleteSelected} title="Delete selected">
            <Trash2 size={13} /> {selectedIds.size}
          </button>
        )}
      </div>

      {/* Toolbar: search + sort + view toggle + new folder */}
      <div className="upload__toolbar">
        <div className="upload__search-wrap">
          <Search size={14} className="upload__search-icon" />
          <input className="upload__search-input" type="text" placeholder="Filter files & folders…"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && <button className="upload__search-clear" onClick={() => setSearchQuery("")}><X size={14} /></button>}
        </div>
        <select className="upload__sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Name</option>
          <option value="date">Newest</option>
          <option value="size">Size</option>
        </select>
        <button className="upload__view-btn" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          title={viewMode === "grid" ? "List view" : "Grid view"}>
          {viewMode === "grid" ? <List size={15} /> : <Grid3X3 size={15} />}
        </button>
        <button className="upload__dir-btn" onClick={() => { setShowNewFolderInput(p => !p); setNewFolderName(""); }}>
          <FolderPlus size={15} /> New Folder
        </button>
      </div>

      {/* New folder input */}
      {showNewFolderInput && (
        <div className="upload__new-folder">
          <input className="upload__input" type="text" placeholder="Folder name"
            value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            disabled={uploading} onKeyDown={(e) => e.key === "Enter" && handleCreateDir()} autoFocus />
          <button className="upload__btn upload__btn--small" onClick={handleCreateDir}
            disabled={uploading || !newFolderName.trim()}><Check size={14} /> Create</button>
        </div>
      )}

      {/* Items grid/list */}
      <div className={`upload__items ${viewMode === "grid" ? "upload__items--grid" : "upload__items--list"}`}>
        {filtered.length === 0 && (
          <div className="upload__empty">
            {searchQuery ? `No results for "${searchQuery}"` : "This folder is empty"}
          </div>
        )}
        {filtered.map((it) => {
          const id = itemId(it);
          const sel = selectedIds.has(id);
          if (it.kind === "dir") {
            return (
              <div key={id} className={`upload__tile ${sel ? "upload__tile--sel" : ""}`}
                onClick={() => toggleSelect(id)} onDoubleClick={() => navigateTo(it.path)}
                onContextMenu={(e) => handleContextMenu(e, it)}>
                <div className="upload__tile-thumb upload__tile-thumb--folder">
                  <Folder size={viewMode === "grid" ? 36 : 20} />
                </div>
                <div className="upload__tile-info">
                  <span className="upload__tile-name">{it.name}</span>
                  <span className="upload__tile-meta">Folder</span>
                </div>
                <button className="upload__tile-del" onClick={(e) => { e.stopPropagation(); handleDeleteDir(it.path, it.name); }}
                  title="Delete folder"><Trash2 size={12} /></button>
              </div>
            );
          }
          const isVideo = it.mime_type?.startsWith("video/");
          const thumbUrl = it.thumbnail && it.thumbnail_status === "completed" ? it.thumbnail : null;
          return (
            <div key={id} className={`upload__tile ${sel ? "upload__tile--sel" : ""}`}
              onClick={() => toggleSelect(id)} onDoubleClick={() => handleItemClick(it)}
              onContextMenu={(e) => handleContextMenu(e, it)}>
              <div className="upload__tile-thumb">
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="upload__tile-img" loading="lazy" />
                ) : isVideo ? (
                  <Video size={viewMode === "grid" ? 36 : 20} />
                ) : (
                  <Image size={viewMode === "grid" ? 36 : 20} />
                )}
              </div>
              <div className="upload__tile-info">
                <span className="upload__tile-name">{it.filename || it.name}</span>
                <span className="upload__tile-meta">{formatSize(it.size)}{it.created_at ? ` · ${formatDate(it.created_at)}` : ""}{it.nickname ? ` · ${it.nickname}` : ""}</span>
              </div>
              <button className="upload__tile-del" onClick={(e) => { e.stopPropagation(); handleDeleteFile(it.id, it.filename); }}
                title="Delete file"><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="upload__ctx-overlay" onClick={() => setContextMenu(null)}>
          <div className="upload__ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={() => { const it = contextMenu.item; it.kind === "dir" ? navigateTo(it.path) : handleItemClick(it); setContextMenu(null); }}>
              {contextMenu.item.kind === "dir" ? "Open" : "Preview"}
            </button>
            <button onClick={() => { const it = contextMenu.item; it.kind === "dir" ? handleDeleteDir(it.path, it.name) : handleDeleteFile(it.id, it.filename); setContextMenu(null); }}>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Drop zone / file input */}
      <div className={`upload__dropzone ${dragOver ? "upload__dropzone--active" : ""} ${files.length > 0 ? "upload__dropzone--has-files" : ""}`}
        onClick={() => fileInputRef.current?.click()}>
        {dragOver ? (
          <p className="upload__dropzone-text">Drop files here</p>
        ) : files.length > 0 ? (
          <div className="upload__file-list">
            {files.map((f, i) => (
              <div key={i} className="upload__file-row">
                <span className="upload__file-name">{f.name}</span>
                <span className="upload__file-size">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="upload__dropzone-placeholder">
            <UploadIcon size={28} />
            <p>Drag & drop files here or click to browse</p>
            <span className="upload__dropzone-hint">Images &middot; Videos &middot; HEIC</span>
          </div>
        )}
        <input ref={fileInputRef} className="upload__file-input-hidden" type="file" multiple
          accept="image/*,video/*" onChange={handleFileChange} disabled={uploading} />
      </div>

      {/* Progress */}
      {uploading && (
        <div className="upload__progress-wrap">
          <div className="upload__progress-bar"><div className="upload__progress-fill" style={{ width: `${progress}%` }} /></div>
          <span className="upload__progress-text">{progress}%</span>
        </div>
      )}

      {error && <p className="upload__error">{error}</p>}

      {/* Result */}
      {result && (
        <div className="upload__result">
          <p className="upload__result-ok">
            Uploaded {result.saved?.length || 0} file(s)
            {result.errors?.length > 0 && `, ${result.errors.length} error(s)`}
          </p>
          {result.saved?.length > 0 && (
            <div className="upload__result-files">
              {result.saved.map((f) => (
                <div key={f.id} className="upload__file-row">
                  <span className="upload__file-name">{f.filename}</span>
                  <span className="upload__file-size">{formatSize(f.size)}</span>
                </div>
              ))}
            </div>
          )}
          {result.errors?.length > 0 && (
            <ul className="upload__error-list">
              {result.errors.map((e, i) => <li key={i}>{e.filename}: {e.error}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* File preview */}
      {previewFile && <FileViewer file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}

export default Upload;
