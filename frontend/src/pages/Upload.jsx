import { useState, useEffect, useRef, useCallback } from "react";
import { Upload as UploadIcon, FolderPlus, Check, Trash2, ArrowLeft, Folder, X } from "lucide-react";
import { uploadFiles, listUploadDirs, createUploadDir, listNicknames, softDeleteFiles, softDeleteDir, listRecentFiles } from "../services/api";
import "./Upload.css";

function Upload() {
  const [files, setFiles] = useState([]);
  const [nickname, setNickname] = useState("");
  const [nicknames, setNicknames] = useState([]);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [subdirs, setSubdirs] = useState([]);
  const [recentFiles, setRecentFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const inputRef = useRef(null);
  const nicknameId = "upload-nickname-input";

  const refreshDirs = useCallback(async (prefix) => {
    try {
      const d = await listUploadDirs(prefix);
      setSubdirs(d.directories || []);
      const r = await listRecentFiles(prefix);
      setRecentFiles(r.files || []);
    } catch {}
  }, []);

  useEffect(() => {
    refreshDirs("");
    listNicknames()
      .then((d) => setNicknames(d.nicknames || []))
      .catch(() => {});
  }, [refreshDirs]);

  const navigateTo = (path) => {
    setCurrentPrefix(path);
    refreshDirs(path);
    setShowNewFolderInput(false);
  };

  const handleCreateDir = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const target = currentPrefix ? `${currentPrefix}/${name}` : name;
    try {
      await createUploadDir(target);
      setNewFolderName("");
      setShowNewFolderInput(false);
      refreshDirs(currentPrefix);
    } catch {
      setError("Failed to create directory");
    }
  };

  const handleDeleteDir = async (path, name) => {
    if (!window.confirm(`Delete folder "${name}" and all its files?`)) return;
    try {
      await softDeleteDir(path);
      refreshDirs(currentPrefix);
    } catch {
      setError("Failed to delete directory");
    }
  };

  const handleDeleteFile = async (fileId, filename) => {
    if (!window.confirm(`Delete file "${filename}"?`)) return;
    try {
      await softDeleteFiles([fileId]);
      refreshDirs(currentPrefix);
    } catch {
      setError("Failed to delete file");
    }
  };

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files || []));
    setResult(null);
    setError("");
  };

  const handleUpload = async () => {
    if (!nickname.trim()) {
      setError("Nickname is required");
      return;
    }
    if (files.length === 0) {
      setError("Select at least one file");
      return;
    }
    setUploading(true);
    setProgress(0);
    setResult(null);
    setError("");
    try {
      const data = await uploadFiles(
        files,
        nickname.trim(),
        currentPrefix,
        (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      );
      setResult(data);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      refreshDirs(currentPrefix);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const breadcrumbs = currentPrefix ? currentPrefix.split("/") : [];

  return (
    <div className="upload">
      <h2 className="upload__title">Upload Media</h2>

      <div className="upload__card">
        <label className="upload__label">
          Nickname <span className="upload__required">*</span>
        </label>
        <input
          id={nicknameId}
          className="upload__input"
          type="text"
          list="nickname-list"
          placeholder="Enter a nickname for these files"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={uploading}
          autoComplete="off"
        />
        <datalist id="nickname-list">
          {nicknames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <label className="upload__label">Target Directory</label>

        <div className="upload__browser">
          <div className="upload__breadcrumbs">
            <span
              className="upload__crumb"
              onClick={() => navigateTo("")}
            >
              Root
            </span>
            {breadcrumbs.map((part, i) => {
              const path = breadcrumbs.slice(0, i + 1).join("/");
              return (
                <span key={path} className="upload__crumb-row">
                  <span className="upload__crumb-sep">/</span>
                  <span className="upload__crumb" onClick={() => navigateTo(path)}>
                    {part}
                  </span>
                </span>
              );
            })}
                <span className="upload__crumb-prompt">
                  {currentPrefix ? <Folder size={13} /> : <Folder size={13} />}
                </span>
          </div>

          <div className="upload__dir-list">
            {currentPrefix && (
              <div className="upload__dir-item upload__dir-item--up" onClick={() => {
                const parts = currentPrefix.split("/");
                parts.pop();
                navigateTo(parts.join("/"));
              }}>
                <ArrowLeft size={15} />
                <span className="upload__dir-name">..</span>
              </div>
            )}
            {subdirs.map((d) => (
              <div key={d.path} className="upload__dir-item">
                <Folder size={16} className="upload__dir-icon" onClick={() => navigateTo(d.path)} />
                <span className="upload__dir-name" onClick={() => navigateTo(d.path)}>{d.name}</span>
                <button
                  className="upload__del-btn"
                  onClick={(e) => { e.stopPropagation(); handleDeleteDir(d.path, d.name); }}
                  title="Delete folder"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {subdirs.length === 0 && (
              <div className="upload__dir-empty">
                No subfolders
              </div>
            )}
          </div>

          {recentFiles.length > 0 && (
            <div className="upload__recent-files">
              <div className="upload__recent-header">Files in this folder</div>
              {recentFiles.map((f) => (
                <div key={f.id} className="upload__file-row">
                  <span className="upload__file-name" title={f.filename}>{f.filename}</span>
                  <span className="upload__file-size">{formatSize(f.size)}</span>
                  <button
                    className="upload__del-btn upload__del-btn--small"
                    onClick={() => handleDeleteFile(f.id, f.filename)}
                    title="Delete file"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="upload__browser-actions">
            <button
              className="upload__dir-btn"
              onClick={() => {
                setShowNewFolderInput((p) => !p);
                setNewFolderName("");
              }}
              disabled={uploading}
            >
              <FolderPlus size={15} /> Folder
            </button>
          </div>

          {showNewFolderInput && (
            <div className="upload__new-folder">
              <input
                className="upload__input"
                type="text"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                disabled={uploading}
                onKeyDown={(e) => e.key === "Enter" && handleCreateDir()}
                autoFocus
              />
              <button
                className="upload__btn upload__btn--small"
                onClick={handleCreateDir}
                disabled={uploading || !newFolderName.trim()}
              >
                <Check size={14} /> Create
              </button>
            </div>
          )}
        </div>

        <label className="upload__label">
          Files {files.length > 0 && <span className="upload__count">({files.length}, {formatSize(totalSize)})</span>}
        </label>
        <input
          ref={inputRef}
          className="upload__file-input"
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileChange}
          disabled={uploading}
        />

        {files.length > 0 && (
          <div className="upload__file-list">
            {files.map((f, i) => (
              <div key={i} className="upload__file-row">
                <span className="upload__file-name">{f.name}</span>
                <span className="upload__file-size">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        {uploading && (
          <div className="upload__progress-wrap">
            <div className="upload__progress-bar">
              <div className="upload__progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="upload__progress-text">{progress}%</span>
          </div>
        )}

        {error && <p className="upload__error">{error}</p>}

        {result && (
          <div className="upload__result">
            <p className="upload__result-ok">
              Uploaded {result.saved?.length || 0} file(s)
              {result.errors?.length > 0 && `, ${result.errors.length} error(s)`}
            </p>
            {result.saved?.length > 0 && (
              <div className="upload__recent-files">
                <div className="upload__recent-header">Just uploaded</div>
                {result.saved.map((f) => (
                  <div key={f.id} className="upload__file-row">
                    <span className="upload__file-name">{f.filename}</span>
                    <span className="upload__file-size">{formatSize(f.size)}</span>
                    <button
                      className="upload__del-btn upload__del-btn--small"
                      onClick={() => handleDeleteFile(f.id, f.filename)}
                      title="Delete file"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
            {result.errors?.length > 0 && (
              <ul className="upload__error-list">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.filename}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          className="upload__btn upload__btn--primary"
          onClick={handleUpload}
          disabled={uploading || files.length === 0 || !nickname.trim()}
        >
          {uploading ? (
            <>Uploading {progress}%</>
          ) : (
            <><UploadIcon size={16} /> Upload</>
          )}
        </button>
      </div>
    </div>
  );
}

export default Upload;