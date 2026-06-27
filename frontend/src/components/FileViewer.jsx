import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart, Download, Trash2, X, RotateCcw, RotateCw, ArrowLeftRight,
  ArrowUpDown, Contrast, Image, FileJson, MapPin,
  Hash, Tag, AlignLeft, Clock, Maximize2, Camera,
  ZoomIn, ZoomOut, Save, Filter, SlidersHorizontal, Sun,
  Sparkles, Undo2, Paintbrush, FlipHorizontal, Search, IdCard, FolderOpen,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  toggleFavorite as toggleFavApi, getFileMetadata, editFile, deleteFile, updateTags,
  regenerateAiMetadata, regenerateExif, regenerateThumbnail,
  listFilters, createFilter, deleteFilter,
  listFileFaces,
  updateFace,
  detectFaces,
} from "../services/api";
import Spinner from "./Spinner";
import "./FileViewer.css";

const FILTERS = [
  { name: "normal", label: "Normal", css: "", icon: null },
  { name: "vivid", label: "Vivid", css: "saturate(1.4) contrast(1.25)" },
  { name: "dramatic", label: "Dramatic", css: "contrast(1.6) brightness(0.95)" },
  { name: "vintage", label: "Vintage", css: "saturate(0.7) sepia(0.35) brightness(1.05)" },
  { name: "noir", label: "Noir", css: "grayscale(1) contrast(1.3)" },
  { name: "soft", label: "Soft", css: "brightness(1.1) contrast(0.9) saturate(0.85)" },
  { name: "clarity", label: "Clarity", css: "contrast(1.15) saturate(1.1)" },
  { name: "warm", label: "Warm", css: "sepia(0.15) saturate(1.2) hue-rotate(10deg)" },
  { name: "cool", label: "Cool", css: "saturate(0.9) hue-rotate(200deg) brightness(1.05)" },
];

function FaceNameTag({ face, onNameChange }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(face.person_name || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const val = inputVal.trim();
    if (!val && !face.person_name) return;
    if (val === (face.person_name || "")) { setEditing(false); return; }
    setSaving(true);
    try {
      await onNameChange(val || null);
      setEditing(false);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setInputVal(face.person_name || ""); setEditing(false); }
  };

  if (editing) {
    return (
      <div className="viewer-face-item">
        {face.thumbnail && <img src={face.thumbnail} alt="" className="viewer-face-thumb" />}
        <div className="viewer-face-edit">
          <input className="viewer-face-input" type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={handleKeyDown} placeholder="Name..." autoFocus disabled={saving} />
          <button className="viewer-face-save" onClick={handleSave} disabled={saving}>{saving ? <Spinner size={10} /> : <IdCard size={11} />}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-face-item" onClick={() => { setInputVal(face.person_name || ""); setEditing(true); }}>
      {face.thumbnail && <img src={face.thumbnail} alt="" className="viewer-face-thumb" />}
      <span className={`viewer-face-name ${face.person_name ? "" : "viewer-face-name--unnamed"}`}>
        {face.person_name || "Name..."}
      </span>
    </div>
  );
}

function FileViewer({ file, onClose, onToggleFavorite, onEditSave, onDelete, onNavigatePrev, onNavigateNext }) {
  const navigate = useNavigate();
  const [isFav, setIsFav] = useState(file.is_favorite);
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [operations, setOperations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exifExpanded, setExifExpanded] = useState(window.innerWidth > 768);
  const [tagInput, setTagInput] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [editTab, setEditTab] = useState("filters");
  const [activeFilter, setActiveFilter] = useState("normal");
  const [adjust, setAdjust] = useState({
    brightness: 1,
    contrast: 1,
    saturation: 1,
    warmth: 0,
    sharpness: 1,
    highlights: 0,
    shadows: 0,
    vignette: 0,
  });
  const [customFilters, setCustomFilters] = useState([]);
  const [savingFilter, setSavingFilter] = useState(false);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [customFilterName, setCustomFilterName] = useState("");
  const [regenerating, setRegenerating] = useState({ ai: false, exif: false, thumb: false, faces: false });
  const [videoTrim, setVideoTrim] = useState({ start: 0, end: 0 });
  const [crop, setCrop] = useState(null);
  const [cropAspect, setCropAspect] = useState("free");
  const [cropDrag, setCropDrag] = useState(null);
  const [fileFaces, setFileFaces] = useState([]);
  const pinchRef = useRef(null);
  const overlayRef = useRef(null);
  const imgRef = useRef(null);
  const pollRef = useRef(null);

  const isVideo = file.mime_type && file.mime_type.startsWith("video/");
  const fileUrl = `/api/files/${file.id}/serve`;

  const ASPECT_RATIOS = [
    { label: "Free", value: "free" },
    { label: "1:1", value: "1:1" },
    { label: "4:3", value: "4:3" },
    { label: "3:2", value: "3:2" },
    { label: "16:9", value: "16:9" },
    { label: "21:9", value: "21:9" },
  ];

  useEffect(() => {
    listFilters().then(setCustomFilters).catch(() => {});
  }, []);

  useEffect(() => {
    if (meta && isVideo && meta.duration) {
      setVideoTrim({ start: 0, end: meta.duration });
    }
  }, [meta, isVideo]);

  useEffect(() => {
    if (editTab === "crop" && crop === null) {
      setCrop({ x: 0, y: 0, w: 1, h: 1 });
    }
  }, [editTab]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        if (editMode) {
          setEditMode(false);
          setOperations([]);
          setActiveFilter("normal");
          setAdjust({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1, highlights: 0, shadows: 0, vignette: 0 });
          setCrop(null);
          setCropAspect("free");
          if (isVideo && meta?.duration) {
            setVideoTrim({ start: 0, end: meta.duration });
          }
        } else {
          onClose();
        }
        return;
      }
      if (!editMode && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        if (e.key === "ArrowLeft" && onNavigatePrev) { e.preventDefault(); onNavigatePrev(); }
        if (e.key === "ArrowRight" && onNavigateNext) { e.preventDefault(); onNavigateNext(); }
      }
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    getFileMetadata(file.id)
      .then(setMeta)
      .catch(() => setMeta(null))
      .finally(() => setMetaLoading(false));
    listFileFaces(file.id)
      .then(setFileFaces)
      .catch(() => setFileFaces([]));
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [file.id, onClose, editMode, onNavigatePrev, onNavigateNext]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      if (editMode) {
        setEditMode(false);
        setOperations([]);
        setActiveFilter("normal");
        setAdjust({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1, highlights: 0, shadows: 0, vignette: 0 });
        setCrop(null);
        setCropAspect("free");
        if (isVideo && meta?.duration) {
          setVideoTrim({ start: 0, end: meta.duration });
        }
      } else {
        onClose();
      }
    }
  };

  const handleToggleFav = async () => {
    try {
      const updated = await toggleFavApi(file.id);
      setIsFav(updated.is_favorite);
      if (onToggleFavorite) onToggleFavorite(file.id, updated.is_favorite);
    } catch {}
  };

  const addOp = useCallback((op) => {
    setOperations((prev) => [...prev, op]);
  }, []);

  const handleZoomIn = () => setZoom((p) => Math.min(5, +(p * 1.25).toFixed(2)));
  const handleZoomOut = () => setZoom((p) => Math.max(0.25, +(p / 1.25).toFixed(2)));
  const handleZoomReset = () => setZoom(1);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((p) => {
        const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
        return Math.max(0.25, Math.min(5, +(p * factor).toFixed(2)));
      });
    }
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchRef.current = dist;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const factor = dist / pinchRef.current;
      setZoom((p) => Math.max(0.25, Math.min(5, +(p * factor).toFixed(2))));
      pinchRef.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => { pinchRef.current = null; }, []);

  const handleSlider = (key, val) => {
    setAdjust((prev) => ({ ...prev, [key]: val }));
  };

  const selectFilter = (name) => {
    setActiveFilter(name);
  };

  const filterData = FILTERS.find((f) => f.name === activeFilter) || FILTERS[0];

  const previewFilter = (() => {
    const parts = [];
    parts.push(`brightness(${adjust.brightness})`);
    parts.push(`contrast(${adjust.contrast})`);
    parts.push(`saturate(${adjust.saturation})`);
    if (filterData.css) parts.push(filterData.css);
    return parts.join(" ");
  })();

  const buildOperations = () => {
    const ops = [];
    if (adjust.brightness !== 1) ops.push({ type: "brightness", value: adjust.brightness });
    if (adjust.contrast !== 1) ops.push({ type: "contrast", value: adjust.contrast });
    if (adjust.saturation !== 1) ops.push({ type: "saturation", value: adjust.saturation });
    if (adjust.sharpness !== 1) ops.push({ type: "sharpness", value: adjust.sharpness });
    if (adjust.highlights !== 0) ops.push({ type: "highlights", value: adjust.highlights });
    if (adjust.shadows !== 0) ops.push({ type: "shadows", value: adjust.shadows });
    if (adjust.warmth !== 0) ops.push({ type: "warmth", value: adjust.warmth });
    if (adjust.vignette !== 0) ops.push({ type: "vignette", value: adjust.vignette });
    if (activeFilter !== "normal") ops.push({ type: "filter", name: activeFilter });
    if (crop && (crop.x > 0 || crop.y > 0 || crop.w < 1 || crop.h < 1)) {
      ops.push({ type: "crop", x: crop.x, y: crop.y, width: crop.w, height: crop.h });
    }
    ops.push(...operations);
    return ops;
  };

  const handleSave = async () => {
    const ops = isVideo ? buildVideoOperations() : buildOperations();
    if (ops.length === 0) return;
    setSaving(true);
    try {
      const newFile = await editFile(file.id, ops);
      setEditMode(false);
      setOperations([]);
      setActiveFilter("normal");
      setAdjust({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1, highlights: 0, shadows: 0, vignette: 0 });
      setCrop(null);
      setCropAspect("free");
      if (videoTrim.start !== 0 || videoTrim.end !== (meta?.duration || 0)) {
        setVideoTrim({ start: 0, end: meta?.duration || 0 });
      }
      if (onEditSave) {
        onEditSave(newFile);
      } else {
        onClose();
      }
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setOperations([]);
    setActiveFilter("normal");
    setAdjust({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1, highlights: 0, shadows: 0, vignette: 0 });
    setCrop(null);
    setCropAspect("free");
    if (isVideo && meta?.duration) {
      setVideoTrim({ start: 0, end: meta.duration });
    }
  };

  const handleDeleteClick = () => setShowDeleteConfirm(true);

  const handleDeleteConfirm = async (deleteStorage) => {
    setDeleting(true);
    try {
      await deleteFile(file.id, deleteStorage);
      setShowDeleteConfirm(false);
      if (onDelete) onDelete(file.id);
      onClose();
    } catch {} finally { setDeleting(false); }
  };

  const handleDeleteCancel = () => { if (!deleting) setShowDeleteConfirm(false); };

  const handleAddTag = async () => {
    const t = tagInput.trim();
    if (!t || !meta) return;
    const updated = [...(meta.tags || []), t.toLowerCase()];
    setTagSaving(true);
    try {
      const result = await updateTags(file.id, updated);
      setMeta((prev) => ({ ...prev, tags: result.tags }));
      setTagInput("");
    } catch {} finally { setTagSaving(false); }
  };

  const handleRemoveTag = async (tag) => {
    if (!meta) return;
    const updated = (meta.tags || []).filter((t) => t !== tag);
    setTagSaving(true);
    try {
      const result = await updateTags(file.id, updated);
      setMeta((prev) => ({ ...prev, tags: result.tags }));
    } catch {} finally { setTagSaving(false); }
  };

  const handleTagKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } };

  const handleRegenerate = async (type) => {
    setRegenerating((p) => ({ ...p, [type]: true }));
    try {
      if (type === "ai") await regenerateAiMetadata(file.id);
      else if (type === "exif") await regenerateExif(file.id);
      else if (type === "thumb") await regenerateThumbnail(file.id);
      else if (type === "faces") await detectFaces(file.id);
    } catch {} finally {
      setRegenerating((p) => ({ ...p, [type]: false }));
    }
    if (type === "faces") {
      if (pollRef.current) clearInterval(pollRef.current);
      let attempts = 0;
      const maxAttempts = 15;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const faces = await listFileFaces(file.id);
          if (faces.length > 0 || attempts >= maxAttempts) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setFileFaces(faces);
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 2000);
    }
  };

  const applyCustomFilter = (preset) => {
    const newAdjust = { brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1, highlights: 0, shadows: 0, vignette: 0 };
    let newActiveFilter = "normal";
    const newOps = [];
    for (const op of preset.operations) {
      if (op.type === "brightness") newAdjust.brightness = op.value;
      else if (op.type === "contrast") newAdjust.contrast = op.value;
      else if (op.type === "saturation") newAdjust.saturation = op.value;
      else if (op.type === "warmth") newAdjust.warmth = op.value;
      else if (op.type === "sharpness") newAdjust.sharpness = op.value;
      else if (op.type === "highlights") newAdjust.highlights = op.value;
      else if (op.type === "shadows") newAdjust.shadows = op.value;
      else if (op.type === "vignette") newAdjust.vignette = op.value;
      else if (op.type === "filter") newActiveFilter = op.name;
      else if (op.type === "rotate" || op.type === "flip") newOps.push(op);
    }
    setAdjust(newAdjust);
    setActiveFilter(newActiveFilter);
    setOperations(newOps);
  };

  const handleSaveFilter = async () => {
    const name = customFilterName.trim();
    if (!name) return;
    setSavingFilter(true);
    const ops = buildOperations();
    try {
      const saved = await createFilter({ name, operations: ops, file_id: file.id });
      setCustomFilters((prev) => {
        const exists = prev.findIndex((f) => f.id === saved.id);
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setShowSaveFilter(false);
      setCustomFilterName("");
    } catch {} finally {
      setSavingFilter(false);
    }
  };

  const handleDeleteFilter = async (filterId) => {
    try {
      await deleteFilter(filterId);
      setCustomFilters((prev) => prev.filter((f) => f.id !== filterId));
    } catch {}
  };

  const handleCropAspect = (ratio) => {
    setCropAspect(ratio);
    if (ratio === "free") return;
    const [wr, hr] = ratio.split(":").map(Number);
    const target = wr / hr;
    let w = 1, h = 1;
    if (1 / 1 > target) {
      h = 1;
      w = h * target;
    } else {
      w = 1;
      h = w / target;
    }
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const handleCropMouseDown = (e, handle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!crop) return;
    setCropDrag({ handle, startX: e.clientX, startY: e.clientY, origCrop: { ...crop } });
  };

  const handleCropMouseMove = (e) => {
    if (!cropDrag || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const dx = (e.clientX - cropDrag.startX) / rect.width;
    const dy = (e.clientY - cropDrag.startY) / rect.height;
    const orig = cropDrag.origCrop;
    let { x, y, w, h } = orig;

    switch (cropDrag.handle) {
      case "se": w = orig.w + dx; h = orig.h + dy; break;
      case "ne": w = orig.w + dx; y = orig.y + dy; h = orig.h - dy; break;
      case "sw": x = orig.x + dx; w = orig.w - dx; h = orig.h + dy; break;
      case "nw": x = orig.x + dx; y = orig.y + dy; w = orig.w - dx; h = orig.h - dy; break;
    }

    if (cropAspect !== "free") {
      const [wr, hr] = cropAspect.split(":").map(Number);
      const target = wr / hr;
      if (cropDrag.handle === "se" || cropDrag.handle === "ne") {
        h = w / target;
      } else {
        w = h * target;
      }
    }

    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > 1) { w = 1 - x; }
    if (y + h > 1) { h = 1 - y; }
    if (w < 0.01) w = 0.01;
    if (h < 0.01) h = 0.01;
    setCrop({ x, y, w, h });
  };

  const handleCropMouseUp = () => setCropDrag(null);

  const buildVideoOperations = () => {
    const ops = [];
    if (videoTrim.start > 0 || videoTrim.end < (meta?.duration || 0)) {
      ops.push({ type: "trim", start: videoTrim.start, end: videoTrim.end });
    }
    if (adjust.brightness !== 1) ops.push({ type: "brightness", value: adjust.brightness });
    if (adjust.contrast !== 1) ops.push({ type: "contrast", value: adjust.contrast });
    if (adjust.saturation !== 1) ops.push({ type: "saturation", value: adjust.saturation });
    ops.push(...operations);
    return ops;
  };

  const previewStyle = (() => {
    let rot = 0;
    let sx = 1;
    let sy = 1;
    for (const op of operations) {
      if (op.type === "rotate") rot += op.degrees;
      if (op.type === "flip" && op.direction === "horizontal") sx *= -1;
      if (op.type === "flip" && op.direction === "vertical") sy *= -1;
    }
    const transforms = [];
    if (zoom !== 1) transforms.push(`scale(${zoom})`);
    if (rot) transforms.push(`rotate(${rot}deg)`);
    if (sx !== 1 || sy !== 1) transforms.push(`scale(${sx}, ${sy})`);
    return {
      transform: transforms.join(" "),
      filter: previewFilter,
    };
  })();

  const hasEdits = activeFilter !== "normal" || Object.values(adjust).some((v) => v !== 0 && v !== 1) || operations.length > 0 || (isVideo && (videoTrim.start > 0 || videoTrim.end < (meta?.duration || 0))) || !!((crop?.x || 0) > 0 || (crop?.y || 0) > 0 || (crop?.w || 1) < 1 || (crop?.h || 1) < 1);

  const renderSlider = (key, label, min, max, step, icon) => (
    <div className="viewer-slider-row">
      <span className="viewer-slider-icon">{icon}</span>
      <div className="viewer-slider-body">
        <div className="viewer-slider-header">
          <span className="viewer-slider-label">{label}</span>
          <span className="viewer-slider-val">{key === "warmth" || key === "highlights" || key === "shadows" ? adjust[key] : adjust[key].toFixed(2)}</span>
        </div>
        <input
          type="range"
          className="viewer-slider"
          min={min}
          max={max}
          step={step}
          value={adjust[key]}
          onChange={(e) => handleSlider(key, parseFloat(e.target.value))}
        />
      </div>
    </div>
  );

  return (
    <div className="viewer-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="viewer-modal">
        <div className="viewer-header">
          <span className="viewer-filename">{editMode ? "Editing: " : ""}{file.filename}</span>
          <div className="viewer-actions">
            {editMode ? (
              <>
                <button className="viewer-btn viewer-btn--save" onClick={handleSave} disabled={saving || !hasEdits}>
                  {saving ? <Spinner size={14} /> : <Save size={14} />} Save
                </button>
                <button className="viewer-btn viewer-btn--cancel" onClick={handleCancel}>
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <>
                <button className="viewer-btn viewer-btn--edit" onClick={() => setEditMode(true)} title={isVideo ? "Edit video" : "Edit image"}>
                  <Paintbrush size={14} /> Edit
                </button>
                {file.directory_id != null && (
                  <button className="viewer-btn viewer-btn--folder" onClick={(e) => { e.stopPropagation(); navigate("/", { state: { directoryId: file.directory_id } }); }} title="Show in folder">
                    <FolderOpen size={14} /> Browse Folder
                  </button>
                )}
                <a className="viewer-btn viewer-btn--download" href={fileUrl} download title="Download file"><Download size={15} /></a>
                <button className="viewer-btn viewer-btn--delete" onClick={handleDeleteClick} title="Delete file"><Trash2 size={15} /></button>
                <button className={`viewer-fav ${isFav ? "viewer-fav--active" : ""}`} onClick={handleToggleFav} title={isFav ? "Remove from favorites" : "Add to favorites"}>
                  <Heart size={15} fill={isFav ? "currentColor" : "none"} />
                </button>
                <button className="viewer-close" onClick={onClose}><X size={18} /></button>
              </>
            )}
          </div>
        </div>

        <div className="viewer-content">
          <div className="viewer-body" onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            {isVideo ? (
              <video className="viewer-media" src={fileUrl} controls autoPlay />
            ) : (
              <div className="viewer-media-wrap">
                <img ref={imgRef} className="viewer-media" src={fileUrl} alt={file.filename} style={previewStyle} />
                {editMode && adjust.vignette > 0 && (
                  <div className="viewer-vignette" style={{ opacity: adjust.vignette / 100 }} />
                )}
                {editMode && editTab === "crop" && crop && (
                  <div className="viewer-crop-overlay" onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} onMouseLeave={handleCropMouseUp}>
                    <div className="viewer-crop-rect" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}>
                      <div className="viewer-crop-handle viewer-crop-handle--nw" onMouseDown={(e) => handleCropMouseDown(e, "nw")} />
                      <div className="viewer-crop-handle viewer-crop-handle--ne" onMouseDown={(e) => handleCropMouseDown(e, "ne")} />
                      <div className="viewer-crop-handle viewer-crop-handle--sw" onMouseDown={(e) => handleCropMouseDown(e, "sw")} />
                      <div className="viewer-crop-handle viewer-crop-handle--se" onMouseDown={(e) => handleCropMouseDown(e, "se")} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {!editMode && (
              <div className="viewer-float-actions">
                <button className="viewer-float-btn" onClick={() => setEditMode(true)} title={isVideo ? "Edit video" : "Edit image"}><Paintbrush size={16} /></button>
                <div className="viewer-float-zoom">
                  <button className="viewer-float-btn viewer-float-btn--zoom" onClick={handleZoomOut} title="Zoom out"><ZoomOut size={15} /></button>
                  <span className="viewer-float-pct">{Math.round(zoom * 100)}%</span>
                  <button className="viewer-float-btn viewer-float-btn--zoom" onClick={handleZoomIn} title="Zoom in"><ZoomIn size={15} /></button>
                </div>
                <a className="viewer-float-btn" href={fileUrl} download title="Download"><Download size={16} /></a>
                <button className="viewer-float-btn" onClick={handleDeleteClick} title="Delete"><Trash2 size={16} /></button>
                <button className={`viewer-float-btn ${isFav ? "viewer-float-btn--active" : ""}`} onClick={handleToggleFav} title={isFav ? "Remove from favorites" : "Add to favorites"}>
                  <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                </button>
                <button className="viewer-float-btn viewer-float-btn--close" onClick={onClose} title="Close"><X size={18} /></button>
              </div>
            )}
            {!editMode && onNavigatePrev && (
              <button className="viewer-nav-btn viewer-nav-btn--prev" onClick={(e) => { e.stopPropagation(); onNavigatePrev(); }} title="Previous (←)">
                <ChevronLeft size={28} />
              </button>
            )}
            {!editMode && onNavigateNext && (
              <button className="viewer-nav-btn viewer-nav-btn--next" onClick={(e) => { e.stopPropagation(); onNavigateNext(); }} title="Next (→)">
                <ChevronRight size={28} />
              </button>
            )}
          </div>

          {editMode && (
            <div className="viewer-edit-panel">
              <div className="viewer-edit-tabs">
                {isVideo ? (
                  <>
                    <button className={`viewer-edit-tab ${editTab === "trim" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("trim")} title="Trim">
                      <Clock size={15} />
                      <span>Trim</span>
                    </button>
                    <button className={`viewer-edit-tab ${editTab === "adjust" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("adjust")} title="Adjust">
                      <SlidersHorizontal size={15} />
                      <span>Adjust</span>
                    </button>
                    <button className={`viewer-edit-tab ${editTab === "crop" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("crop")} title="Crop">
                      <FlipHorizontal size={15} />
                      <span>Crop</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className={`viewer-edit-tab ${editTab === "filters" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("filters")} title="Filters">
                      <Sparkles size={15} />
                      <span>Filters</span>
                    </button>
                    <button className={`viewer-edit-tab ${editTab === "adjust" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("adjust")} title="Adjust">
                      <SlidersHorizontal size={15} />
                      <span>Adjust</span>
                    </button>
                    <button className={`viewer-edit-tab ${editTab === "light" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("light")} title="Light">
                      <Sun size={15} />
                      <span>Light</span>
                    </button>
                    <button className={`viewer-edit-tab ${editTab === "effects" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("effects")} title="Effects">
                      <Contrast size={15} />
                      <span>Effects</span>
                    </button>
                    <button className={`viewer-edit-tab ${editTab === "crop" ? "viewer-edit-tab--active" : ""}`} onClick={() => setEditTab("crop")} title="Crop">
                      <FlipHorizontal size={15} />
                      <span>Crop</span>
                    </button>
                  </>
                )}
              </div>

              <div className="viewer-edit-body">
                {isVideo ? (
                  <>
                    {editTab === "trim" && (
                      <div className="viewer-sliders">
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Clock size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Start</span>
                              <span className="viewer-slider-val">{videoTrim.start.toFixed(1)}s</span>
                            </div>
                            <input type="range" min={0} max={meta?.duration || 0} step={0.1}
                              value={videoTrim.start}
                              onChange={(e) => setVideoTrim((p) => ({ ...p, start: Math.min(parseFloat(e.target.value), p.end - 0.1) }))} />
                          </div>
                        </div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Clock size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">End</span>
                              <span className="viewer-slider-val">{videoTrim.end.toFixed(1)}s</span>
                            </div>
                            <input type="range" min={0} max={meta?.duration || 0} step={0.1}
                              value={videoTrim.end}
                              onChange={(e) => setVideoTrim((p) => ({ ...p, end: Math.max(parseFloat(e.target.value), p.start + 0.1) }))} />
                          </div>
                        </div>
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}
                    {editTab === "adjust" && (
                      <div className="viewer-sliders">
                        {renderSlider("brightness", "Brightness", 0, 2, 0.01, <Sun size={13} />)}
                        {renderSlider("contrast", "Contrast", 0, 2, 0.01, <Contrast size={13} />)}
                        {renderSlider("saturation", "Saturation", 0, 2, 0.01, <Filter size={13} />)}
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}
                    {editTab === "crop" && (
                      <div className="viewer-crop-tools">
                        <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: -90 })} title="Rotate left"><RotateCcw size={16} /></button>
                        <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: 90 })} title="Rotate right"><RotateCw size={16} /></button>
                        <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "horizontal" })} title="Flip horizontal"><ArrowLeftRight size={16} /></button>
                        <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "vertical" })} title="Flip vertical"><ArrowUpDown size={16} /></button>
                        <span className="viewer-tool-count">{operations.length} op(s)</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {editTab === "filters" && (
                      <div className="viewer-filters-grid">
                        {FILTERS.map((f) => (
                          <button
                            key={f.name}
                            className={`viewer-filter-btn ${activeFilter === f.name ? "viewer-filter-btn--active" : ""}`}
                            onClick={() => selectFilter(f.name)}
                          >
                            <div className="viewer-filter-thumb" style={{ filter: f.css || "none" }}>
                              <img src={fileUrl} alt={f.label} />
                            </div>
                            <span className="viewer-filter-label">{f.label}</span>
                          </button>
                        ))}
                        {customFilters.length > 0 && (
                          <>
                            <div className="viewer-filter-section-title">Custom</div>
                            {customFilters.map((f) => (
                              <div key={f.id} className="viewer-filter-custom-wrap">
                                <button
                                  className="viewer-filter-btn viewer-filter-btn--custom"
                                  onClick={() => applyCustomFilter(f)}
                                  title={`Apply "${f.name}" filter`}
                                >
                                  <div className="viewer-filter-thumb">
                                    <img src={fileUrl} alt={f.name} />
                                  </div>
                                  <span className="viewer-filter-label">{f.name}</span>
                                </button>
                                <button
                                  className="viewer-filter-custom-del"
                                  onClick={() => handleDeleteFilter(f.id)}
                                  title={`Delete "${f.name}"`}
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}

                    {editTab === "adjust" && (
                      <div className="viewer-sliders">
                        {renderSlider("brightness", "Brightness", 0, 2, 0.01, <Sun size={13} />)}
                        {renderSlider("contrast", "Contrast", 0, 2, 0.01, <Contrast size={13} />)}
                        {renderSlider("saturation", "Saturation", 0, 2, 0.01, <Filter size={13} />)}
                        {renderSlider("warmth", "Warmth", -100, 100, 1, <Sparkles size={13} />)}
                        {renderSlider("sharpness", "Sharpness", 0, 2, 0.01, <SlidersHorizontal size={13} />)}
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}

                    {editTab === "light" && (
                      <div className="viewer-sliders">
                        {renderSlider("highlights", "Highlights", -100, 100, 1, <Sun size={13} />)}
                        {renderSlider("shadows", "Shadows", -100, 100, 1, <Sun size={13} />)}
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}

                    {editTab === "effects" && (
                      <div className="viewer-sliders">
                        {renderSlider("vignette", "Vignette", 0, 100, 1, <Contrast size={13} />)}
                      </div>
                    )}

                    {editTab === "crop" && (
                      <div className="viewer-crop-tools">
                        <div className="viewer-crop-aspects">
                          {ASPECT_RATIOS.map((ar) => (
                            <button
                              key={ar.value}
                              className={`viewer-crop-aspect-btn ${cropAspect === ar.value ? "viewer-crop-aspect-btn--active" : ""}`}
                              onClick={() => handleCropAspect(ar.value)}
                            >
                              {ar.label}
                            </button>
                          ))}
                        </div>
                        <div className="viewer-crop-ops">
                          <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: -90 })} title="Rotate left"><RotateCcw size={16} /></button>
                          <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: 90 })} title="Rotate right"><RotateCw size={16} /></button>
                          <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "horizontal" })} title="Flip horizontal"><ArrowLeftRight size={16} /></button>
                          <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "vertical" })} title="Flip vertical"><ArrowUpDown size={16} /></button>
                          <span className="viewer-tool-count">{operations.length} op(s)</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="viewer-edit-footer">
                  <button className="viewer-btn viewer-btn--save" onClick={handleSave} disabled={saving || !hasEdits}>
                    {saving ? <Spinner size={14} /> : <Save size={14} />} Save
                  </button>
                  {!isVideo && (
                    <button className="viewer-btn viewer-btn--save-filter" onClick={() => setShowSaveFilter(true)} disabled={!hasEdits || savingFilter}>
                      {savingFilter ? <Spinner size={14} /> : <Save size={14} />} Save Filter
                    </button>
                  )}
                  <button className="viewer-btn viewer-btn--cancel" onClick={handleCancel}>
                    <Undo2 size={14} /> Reset
                  </button>
                </div>
                {showSaveFilter && (
                  <div className="viewer-save-filter">
                    <input
                      className="viewer-save-filter-input"
                      type="text"
                      placeholder="Filter name..."
                      value={customFilterName}
                      onChange={(e) => setCustomFilterName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveFilter(); } }}
                      autoFocus
                    />
                    <button className="viewer-btn viewer-btn--save" onClick={handleSaveFilter} disabled={!customFilterName.trim() || savingFilter}>
                      Save
                    </button>
                    <button className="viewer-btn viewer-btn--cancel" onClick={() => { setShowSaveFilter(false); setCustomFilterName(""); }}>
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {!editMode && (
            <div className="viewer-sidebar">
              {metaLoading && <div className="viewer-meta-loading"><Spinner size={20} color="var(--color-text-muted)" /><span>Loading metadata...</span></div>}
              {meta && (
                <div className="viewer-meta">
                  <h3 className="viewer-meta-title">Metadata</h3>
                  {meta.width && meta.height && (
                    <div className="viewer-meta-row">
                      <span className="viewer-meta-label"><Maximize2 size={12} /> Dimensions</span>
                      <span className="viewer-meta-value">{meta.width} &times; {meta.height}</span>
                    </div>
                  )}
                  {meta.duration != null && (
                    <div className="viewer-meta-row">
                      <span className="viewer-meta-label"><Clock size={12} /> Duration</span>
                      <span className="viewer-meta-value">{meta.duration.toFixed(1)}s</span>
                    </div>
                  )}
                  {meta.date_taken && (
                    <div className="viewer-meta-row">
                      <span className="viewer-meta-label"><Camera size={12} /> Date Taken</span>
                      <span className="viewer-meta-value">{new Date(meta.date_taken).toLocaleString()}</span>
                    </div>
                  )}
                  {meta.latitude != null && meta.longitude != null && (
                    <div className="viewer-meta-row">
                      <span className="viewer-meta-label"><MapPin size={12} /> GPS</span>
                      <span className="viewer-meta-value">{meta.latitude}, {meta.longitude}</span>
                    </div>
                  )}
                  {meta.description && (
                    <div className="viewer-meta-row viewer-meta-row--block">
                      <span className="viewer-meta-label"><AlignLeft size={12} /> Description</span>
                      <span className="viewer-meta-value">{meta.description}</span>
                    </div>
                  )}
                  <div className="viewer-meta-row viewer-meta-row--block">
                    <span className="viewer-meta-label"><Hash size={12} /> Tags</span>
                    <div className="viewer-tags">
                      {(meta.tags || []).map((t) => (
                        <span key={t} className="viewer-tag">
                          {t}
                          <button className="viewer-tag-remove" onClick={() => handleRemoveTag(t)} disabled={tagSaving}><X size={12} /></button>
                        </span>
                      ))}
                      <span className="viewer-tag-input-wrap">
                        <input className="viewer-tag-input" type="text" placeholder="Add tag..." value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} disabled={tagSaving} />
                        <button className="viewer-tag-add" onClick={handleAddTag} disabled={tagSaving || !tagInput.trim()}>+</button>
                      </span>
                    </div>
                  </div>
                  <div className="viewer-meta-row viewer-meta-row--block">
                    <span className="viewer-meta-label"><Search size={12} /> People</span>
                    {fileFaces.length > 0 ? (
                      <div className="viewer-face-list">
                        {fileFaces.map((face) => (
                          <FaceNameTag
                            key={face.id}
                            face={face}
                            onNameChange={async (name) => {
                              try {
                                const updated = await updateFace(face.id, { name });
                                setFileFaces((prev) => prev.map((f) => f.id === face.id ? { ...f, person_name: updated.person_name, person_id: updated.person_id } : f));
                              } catch (e) {
                                console.error("Failed to update face name:", e);
                              }
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="viewer-meta-row">
                        <span className="viewer-meta-value">No faces detected</span>
                        <button className="viewer-regen-btn" onClick={() => handleRegenerate("faces")} disabled={regenerating.faces}>
                          {regenerating.faces ? <Spinner size={12} /> : <Search size={12} />}
                          Detect Faces
                        </button>
                      </div>
                    )}
                  </div>
                  {meta.search_words && (
                    <div className="viewer-meta-row viewer-meta-row--block">
                      <span className="viewer-meta-label">Search Words</span>
                      <span className="viewer-meta-value">{meta.search_words}</span>
                    </div>
                  )}
                  {meta.exif && (
                    <>
                      <div className="viewer-exif-toggle" onClick={() => setExifExpanded((p) => !p)}>
                        <h3 className="viewer-meta-title viewer-meta-title--sub">Exif Data</h3>
                        <span className={`viewer-exif-arrow ${exifExpanded ? "viewer-exif-arrow--open" : ""}`}>&#9654;</span>
                      </div>
                      <div className={`viewer-exif-content ${exifExpanded ? "viewer-exif-content--expanded" : ""}`}>
                        {Object.entries(meta.exif)
                          .filter(([, v]) => { if (v == null || v === "") return false; const s = String(v); if (s.startsWith("b'") || s.startsWith('b"')) return false; if (s.length > 60) return false; return true; })
                          .map(([k, v]) => (
                            <div className="viewer-meta-row" key={k}>
                              <span className="viewer-meta-label">{k}</span>
                              <span className="viewer-meta-value">{String(v)}</span>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label">Status</span>
                    <span className="viewer-meta-value">{meta.metadata_status}</span>
                  </div>
                  {(!meta.description || meta.metadata_status === "failed") && (
                    <div className="viewer-meta-row">
                      <button className="viewer-regen-btn" onClick={() => handleRegenerate("ai")} disabled={regenerating.ai}>
                        {regenerating.ai ? <Spinner size={12} /> : <Sparkles size={12} />}
                        {meta.metadata_status === "failed" ? "Retry" : "Generate"} AI Description
                      </button>
                    </div>
                  )}
                  <div className="viewer-meta-row">
                    <button className="viewer-regen-btn" onClick={() => handleRegenerate("exif")} disabled={regenerating.exif}>
                      {regenerating.exif ? <Spinner size={12} /> : <FileJson size={12} />}
                      Regenerate EXIF
                    </button>
                  </div>
                  {meta.thumbnail_status !== "completed" && (
                    <div className="viewer-meta-row">
                      <button className="viewer-regen-btn" onClick={() => handleRegenerate("thumb")} disabled={regenerating.thumb}>
                        {regenerating.thumb ? <Spinner size={12} /> : <Image size={12} />}
                        Generate Thumbnail
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {showDeleteConfirm && (
          <div className="viewer-delete-overlay" onClick={handleDeleteCancel}>
            <div className="viewer-delete-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="viewer-delete-title">Delete file</h3>
              <p className="viewer-delete-path">{file.filename}</p>
              <div className="viewer-delete-actions">
                <button className="viewer-delete-btn viewer-delete-btn--library" onClick={() => handleDeleteConfirm(false)} disabled={deleting}>
                  {deleting ? "Deleting..." : "Remove from library"}
                </button>
                <button className="viewer-delete-btn viewer-delete-btn--storage" onClick={() => handleDeleteConfirm(true)} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete from library & disk"}
                </button>
                <button className="viewer-delete-btn viewer-delete-btn--cancel" onClick={handleDeleteCancel} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FileViewer;
