import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart, Download, Trash2, X, RotateCcw, RotateCw, ArrowLeftRight,
  ArrowUpDown, Contrast, Image, FileJson, MapPin,
  Hash, Tag, AlignLeft, Clock, Maximize2, Camera,
  ZoomIn, ZoomOut, Save, Filter, SlidersHorizontal, Sun,
  Sparkles, Undo2, Paintbrush, FlipHorizontal, Search, IdCard, FolderOpen,
  ChevronLeft, ChevronRight, Scissors, Palette, Droplets, Eye,
  Grid3X3, Sigma, ChevronDown, FileImage, Drama, Volume2,
  Gauge, Rewind, VolumeX, Type, Info, ExternalLink, Share2, Copy,
} from "lucide-react";
import {
  toggleFavorite as toggleFavApi, getFile, getFileMetadata, editFile, deleteFile, updateTags,
  regenerateAiMetadata, regenerateExif, regenerateThumbnail,
  listFilters, createFilter, deleteFilter,
  listFileFaces,
  updateFace,
  detectFaces,
  reverseGeocode,
} from "../services/api";
import Spinner from "./Spinner";
import { getPref, setPref } from "../services/db";
import editingInfoMd from "../image_editing_info.md?raw";
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

const ICON_MAP = {
  trim: Clock, adjust: SlidersHorizontal, filters: Sparkles, text: Type,
  effects: Contrast, crop: FlipHorizontal, light: Sun, details: Grid3X3,
  info: Info,
};

const DEFAULT_IMAGE_TABS = ["filters", "adjust", "light", "effects", "details", "info", "crop"];
const DEFAULT_VIDEO_TABS = ["trim", "adjust", "filters", "text", "effects", "crop"];

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
  const [fileRecord, setFileRecord] = useState(null);
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
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const panRef = useRef(null);
  const [editTab, setEditTab] = useState(file.mime_type?.startsWith("video/") ? "trim" : "filters");
  const [activeFilter, setActiveFilter] = useState("normal");
  const [adjust, setAdjust] = useState({
    brightness: 1, contrast: 1, saturation: 1,
    warmth: 0, sharpness: 1,
    highlights: 0, shadows: 0,
    vignette: 0,
    tint: 0, vibrance: 1, clarity: 1, dehaze: 0,
    exposure: 0, blacks: 0, whites: 0,
    grain: 0, grayscale: 0, colorize: 0,
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
  const [cropApplied, setCropApplied] = useState(false);
  const cropDragRef = useRef(null);
  const cropAspectRef = useRef("free");
  const [fileFaces, setFileFaces] = useState([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportFormat, setExportFormat] = useState("jpeg");
  const [exportQuality, setExportQuality] = useState(95);
  const [asciiChars, setAsciiChars] = useState("@%#*+=-:. ");
  const [asciiWidth, setAsciiWidth] = useState(120);
  const [exporting, setExporting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [textOverlay, setTextOverlay] = useState({ text: "", x: 50, y: 50, fontSize: 24, color: "#ffffff", enabled: false });
  const [mediaLoading, setMediaLoading] = useState(true);
  const [tabOrder, setTabOrder] = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const originalBtnRef = useRef(null);
  const videoRef = useRef(null);
  const exportRef = useRef(null);
  const pinchRef = useRef(null);
  const overlayRef = useRef(null);
  const imgRef = useRef(null);
  const pollRef = useRef(null);
  const histCanvasRef = useRef(null);

  const defaultAdjust = () => ({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1, highlights: 0, shadows: 0, vignette: 0, tint: 0, vibrance: 1, clarity: 1, dehaze: 0, exposure: 0, blacks: 0, whites: 0, grain: 0, grayscale: 0, colorize: 0 });

  const defaultVideoAdjust = () => ({ speed: 1, volume: 1, audioMute: false, reverse: false });
  const [videoAdjust, setVideoAdjust] = useState(defaultVideoAdjust());

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = videoAdjust.speed;
    }
  }, [videoAdjust.speed]);

  const isVideo = file.mime_type && file.mime_type.startsWith("video/");
  const fileUrl = `/api/files/${file.id}/serve`;

  const ASPECT_RATIOS = [
    { label: "Free", value: "free" },
    { label: "⬜ 1:1", value: "1:1" },
    { label: "▭ 4:3", value: "4:3" },
    { label: "▮ 3:4", value: "3:4" },
    { label: "▭ 3:2", value: "3:2" },
    { label: "▮ 2:3", value: "2:3" },
    { label: "▭ 16:9", value: "16:9" },
    { label: "▮ 9:16", value: "9:16" },
    { label: "▭ 21:9", value: "21:9" },
    { label: "▮ 9:21", value: "9:21" },
  ];

  useEffect(() => {
    listFilters().then(setCustomFilters).catch(() => {});
    const key = isVideo ? "videoEditTabs" : "imageEditTabs";
    const def = isVideo ? DEFAULT_VIDEO_TABS : DEFAULT_IMAGE_TABS;
    getPref(key, null).then((saved) => {
      setTabOrder(saved || def);
    });
  }, [isVideo]);

  useEffect(() => { setMediaLoading(true); }, [file.id]);

  useEffect(() => {
    if (meta && isVideo && meta.duration) {
      setVideoTrim({ start: 0, end: meta.duration });
    }
  }, [meta, isVideo]);

  useEffect(() => {
    if (editTab === "crop" && crop === null && !cropApplied) {
      setCrop({ x: 0, y: 0, w: 1, h: 1 });
    }
  }, [editTab, cropApplied]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  const resetEditState = useCallback(() => {
    setEditMode(false);
    setOperations([]);
    setActiveFilter("normal");
    setAdjust(defaultAdjust());
    setVideoAdjust(defaultVideoAdjust());
    setCrop(null);
    setCropAspect("free");
    setCropApplied(false);
    if (isVideo && meta?.duration) {
      setVideoTrim({ start: 0, end: meta.duration });
    }
  }, [isVideo, meta]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        if (editMode) {
          resetEditState();
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
    getFile(file.id)
      .then(setFileRecord)
      .catch(() => setFileRecord(null));
    listFileFaces(file.id)
      .then(setFileFaces)
      .catch(() => setFileFaces([]));
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [file.id, onClose, editMode, onNavigatePrev, onNavigateNext]);

  useEffect(() => {
    if (meta?.latitude != null && meta?.longitude != null) {
      setLocationName(null);
      reverseGeocode(meta.latitude, meta.longitude)
        .then((res) => {
          if (res.display_name) setLocationName(res.display_name);
        })
        .catch(() => {});
    } else {
      setLocationName(null);
    }
  }, [meta?.latitude, meta?.longitude]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      if (editMode) {
        resetEditState();
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

  const handleShare = () => {
    const url = `${window.location.origin}/view/${file.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {});
  };

  const addOp = useCallback((op) => {
    setOperations((prev) => [...prev, op]);
  }, []);

  const handleZoomIn = () => { setZoom((p) => Math.min(5, +(p * 1.25).toFixed(2))); setPanX(0); setPanY(0); };
  const handleZoomOut = () => { setZoom((p) => Math.max(0.25, +(p / 1.25).toFixed(2))); setPanX(0); setPanY(0); };
  const handleZoomReset = () => { setZoom(1); setPanX(0); setPanY(0); };

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((p) => {
        const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
        return Math.max(0.25, Math.min(5, +(p * factor).toFixed(2)));
      });
      setPanX(0);
      setPanY(0);
    }
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchRef.current = dist;
    } else if (e.touches.length === 1 && zoom > 1) {
      panRef.current = { startX: e.touches[0].clientX - panX, startY: e.touches[0].clientY - panY, dragging: true };
    }
  }, [zoom, panX, panY]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const factor = dist / pinchRef.current;
      setZoom((p) => Math.max(0.25, Math.min(5, +(p * factor).toFixed(2))));
      setPanX(0);
      setPanY(0);
      pinchRef.current = dist;
    } else if (e.touches.length === 1 && panRef.current?.dragging) {
      setPanX(e.touches[0].clientX - panRef.current.startX);
      setPanY(e.touches[0].clientY - panRef.current.startY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => { pinchRef.current = null; if (panRef.current) panRef.current.dragging = false; }, []);

  const handlePanMouseDown = useCallback((e) => {
    if (zoom <= 1) return;
    panRef.current = { startX: e.clientX - panX, startY: e.clientY - panY, dragging: true };
    e.preventDefault();
  }, [zoom, panX, panY]);

  const handlePanMouseMove = useCallback((e) => {
    if (!panRef.current?.dragging) return;
    setPanX(e.clientX - panRef.current.startX);
    setPanY(e.clientY - panRef.current.startY);
  }, []);

  const handlePanMouseUp = useCallback(() => {
    if (panRef.current) panRef.current.dragging = false;
  }, []);

  const handleSlider = (key, val) => {
    setAdjust((prev) => ({ ...prev, [key]: val }));
  };

  const selectFilter = (name) => {
    setActiveFilter(name);
  };

  const filterData = FILTERS.find((f) => f.name === activeFilter) || FILTERS[0];

  const previewFilter = (() => {
    const b = adjust.brightness * (1 + adjust.exposure / 150);
    const cMod = adjust.contrast * adjust.clarity;
    const shadowBright = 1 - adjust.shadows / 350;
    const shadowContr = 1 + adjust.shadows / 250;
    const hlBright = 1 + adjust.highlights / 350;
    const hlContr = 1 - adjust.highlights / 250;
    const blacksBright = 1 - adjust.blacks / 350;
    const blacksContr = 1 + adjust.blacks / 250;
    const whitesBright = 1 + adjust.whites / 350;
    const whitesContr = 1 - adjust.whites / 250;
    const combinedB = b * shadowBright * hlBright * blacksBright * whitesBright;
    const combinedC = cMod * shadowContr * hlContr * blacksContr * whitesContr;
    const parts = [];
    parts.push(`brightness(${combinedB})`);
    parts.push(`contrast(${combinedC})`);
    parts.push(`saturate(${adjust.saturation * adjust.vibrance})`);
    if (adjust.dehaze) {
      const dh = 1 + adjust.dehaze / 60;
      parts.push(`contrast(${dh})`);
      parts.push(`brightness(${1 + adjust.dehaze / 120})`);
    }
    if (filterData.css) parts.push(filterData.css);
    parts.push(`hue-rotate(${adjust.tint * 0.3}deg)`);
    if (adjust.warmth) {
      const w = adjust.warmth / 100;
      parts.push(`hue-rotate(${w * 15}deg)`);
      if (w > 0) parts.push(`sepia(${w * 0.2})`);
    }
    if (adjust.grayscale) parts.push(`grayscale(1)`);
    if (adjust.colorize) {
      parts.push(`sepia(${Math.min(1, adjust.colorize / 60)})`);
      parts.push(`hue-rotate(${adjust.colorize * 1.2}deg)`);
      parts.push(`saturate(${Math.min(3, 1 + adjust.colorize / 40)})`);
    }
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
    if (adjust.tint !== 0) ops.push({ type: "tint", value: adjust.tint });
    if (adjust.vibrance !== 1) ops.push({ type: "vibrance", value: adjust.vibrance });
    if (adjust.clarity !== 1) ops.push({ type: "clarity", value: adjust.clarity });
    if (adjust.dehaze !== 0) ops.push({ type: "dehaze", value: adjust.dehaze });
    if (adjust.exposure !== 0) ops.push({ type: "exposure", value: adjust.exposure });
    if (adjust.blacks !== 0) ops.push({ type: "blacks", value: adjust.blacks });
    if (adjust.whites !== 0) ops.push({ type: "whites", value: adjust.whites });
    if (adjust.grain !== 0) ops.push({ type: "grain", value: adjust.grain });
    if (adjust.grayscale) ops.push({ type: "grayscale", value: true });
    if (adjust.colorize !== 0) ops.push({ type: "colorize", value: adjust.colorize });
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
      setAdjust(defaultAdjust());
      setVideoAdjust(defaultVideoAdjust());
      setCrop(null);
      setCropAspect("free");
      setCropApplied(false);
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
    resetEditState();
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
    const newAdjust = defaultAdjust();
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
      else if (op.type === "tint") newAdjust.tint = op.value;
      else if (op.type === "vibrance") newAdjust.vibrance = op.value;
      else if (op.type === "clarity") newAdjust.clarity = op.value;
      else if (op.type === "dehaze") newAdjust.dehaze = op.value;
      else if (op.type === "exposure") newAdjust.exposure = op.value;
      else if (op.type === "blacks") newAdjust.blacks = op.value;
      else if (op.type === "whites") newAdjust.whites = op.value;
      else if (op.type === "grain") newAdjust.grain = op.value;
      else if (op.type === "grayscale") newAdjust.grayscale = op.value;
      else if (op.type === "colorize") newAdjust.colorize = op.value;
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

  const handleCropApply = () => {
    if (crop) setCropApplied(true);
  };

  const handleCropAspect = (ratio) => {
    setCropAspect(ratio);
    cropAspectRef.current = ratio;
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
    const drag = { handle, startX: e.clientX, startY: e.clientY, origCrop: { ...crop } };
    setCropDrag(drag);
    cropDragRef.current = drag;
    document.addEventListener("mousemove", handleCropMouseMove);
    document.addEventListener("mouseup", handleCropMouseUp);
  };

  const handleCropMouseDownRect = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!crop) return;
    const drag = { handle: "move", startX: e.clientX, startY: e.clientY, origCrop: { ...crop } };
    setCropDrag(drag);
    cropDragRef.current = drag;
    document.addEventListener("mousemove", handleCropMouseMove);
    document.addEventListener("mouseup", handleCropMouseUp);
  };

  const handleCropMouseMove = (e) => {
    const drag = cropDragRef.current;
    if (!drag || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    const orig = drag.origCrop;
    let { x, y, w, h } = orig;

    if (drag.handle === "move") {
      x = orig.x + dx;
      y = orig.y + dy;
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + w > 1) x = 1 - w;
      if (y + h > 1) y = 1 - h;
      setCrop({ x, y, w, h });
      return;
    }

    switch (drag.handle) {
      case "se": w = orig.w + dx; h = orig.h + dy; break;
      case "ne": w = orig.w + dx; y = orig.y + dy; h = orig.h - dy; break;
      case "sw": x = orig.x + dx; w = orig.w - dx; h = orig.h + dy; break;
      case "nw": x = orig.x + dx; y = orig.y + dy; w = orig.w - dx; h = orig.h - dy; break;
    }

    if (cropAspectRef.current !== "free") {
      const [wr, hr] = cropAspectRef.current.split(":").map(Number);
      const target = wr / hr;
      if (drag.handle === "se" || drag.handle === "ne") {
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

  const handleCropMouseUp = () => {
    cropDragRef.current = null;
    setCropDrag(null);
    document.removeEventListener("mousemove", handleCropMouseMove);
    document.removeEventListener("mouseup", handleCropMouseUp);
  };

  useEffect(() => {
    return () => {
      if (cropDragRef.current) {
        document.removeEventListener("mousemove", handleCropMouseMove);
        document.removeEventListener("mouseup", handleCropMouseUp);
      }
    };
  }, []);

  const handleExport = async (format) => {
    setExportFormat(format);
    setShowExportMenu(false);
    setExporting(true);
    const ops = isVideo ? buildVideoOperations() : buildOperations();
    try {
      const { exportFile, exportVideo } = await import("../services/api");
      let blob;
      if (isVideo) {
        blob = await exportVideo(file.id, ops, { format, quality: exportQuality });
      } else {
        const payload = { format, quality: exportQuality };
        if (format === "ascii") {
          payload.ascii_chars = asciiChars;
          payload.ascii_width = asciiWidth;
        }
        blob = await exportFile(file.id, ops, payload);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const extMap = { jpeg: "jpg", jpg: "jpg", ascii: "txt", webm: "webm", avi: "avi", mkv: "mkv", mov: "mov", mp4: "mp4" };
      const ext = extMap[format] || format;
      const nameStem = file.filename.replace(/\.[^.]+$/, "");
      a.download = `${nameStem}_export.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
    } finally {
      setExporting(false);
    }
  };

  const drawHistogram = useCallback(() => {
    const canvas = histCanvasRef.current;
    if (!canvas) return;
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const offscreen = document.createElement("canvas");
    offscreen.width = img.naturalWidth;
    offscreen.height = img.naturalHeight;
    const octx = offscreen.getContext("2d");
    if (!showOriginal) octx.filter = previewFilter;
    octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
    const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
    const data = imageData.data;
    const bins = new Array(256).fill(0);
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      bins[lum]++;
    }
    const maxBin = Math.max(...bins, 1);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 0, W, H);
    const barW = W / 256;
    for (let i = 0; i < 256; i++) {
      const h = (bins[i] / maxBin) * H;
      ctx.fillStyle = `hsl(${(1 - i / 255) * 240}, 70%, 60%)`;
      ctx.fillRect(i * barW, H - h, Math.max(1, barW), h);
    }
  }, [previewFilter, showOriginal]);

  useEffect(() => {
    if (!editMode) return;
    const timer = setTimeout(drawHistogram, 150);
    return () => clearTimeout(timer);
  }, [editMode, drawHistogram, adjust, activeFilter, operations, crop, cropApplied]);

  const buildVideoOperations = () => {
    const ops = [];
    if (videoTrim.start > 0 || videoTrim.end < (meta?.duration || 0)) {
      ops.push({ type: "trim", start: videoTrim.start, end: videoTrim.end });
    }
    if (adjust.brightness !== 1) ops.push({ type: "brightness", value: adjust.brightness });
    if (adjust.contrast !== 1) ops.push({ type: "contrast", value: adjust.contrast });
    if (adjust.saturation !== 1) ops.push({ type: "saturation", value: adjust.saturation });
    if (adjust.warmth !== 0) ops.push({ type: "warmth", value: adjust.warmth });
    if (videoAdjust.speed !== 1) ops.push({ type: "speed", value: videoAdjust.speed });
    if (videoAdjust.volume !== 1) ops.push({ type: "volume", value: videoAdjust.volume });
    if (videoAdjust.audioMute) ops.push({ type: "audio_mute", value: true });
    if (videoAdjust.reverse) ops.push({ type: "reverse", value: true });
    if (textOverlay.enabled && textOverlay.text.trim()) {
      ops.push({ type: "text", text: textOverlay.text, x: textOverlay.x / 100, y: textOverlay.y / 100, font_size: textOverlay.fontSize, color: textOverlay.color });
    }
    ops.push(...operations);
    return ops;
  };

  const previewStyle = (() => {
    if (showOriginal) return {};
    let rot = 0;
    let sx = 1;
    let sy = 1;
    for (const op of operations) {
      if (op.type === "rotate") rot += op.degrees;
      if (op.type === "flip" && op.direction === "horizontal") sx *= -1;
      if (op.type === "flip" && op.direction === "vertical") sy *= -1;
    }
    const transforms = [];
    if (zoom !== 1) {
      transforms.push(`translate(${panX}px, ${panY}px)`);
      transforms.push(`scale(${zoom})`);
    }
    if (rot) transforms.push(`rotate(${rot}deg)`);
    if (sx !== 1 || sy !== 1) transforms.push(`scale(${sx}, ${sy})`);
    let clipPathVal;
    if (cropApplied && crop) {
      const top = crop.y * 100;
      const right = (1 - crop.x - crop.w) * 100;
      const bottom = (1 - crop.y - crop.h) * 100;
      const left = crop.x * 100;
      clipPathVal = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
    }
    return {
      transform: transforms.join(" "),
      filter: showOriginal ? "none" : previewFilter,
      clipPath: clipPathVal,
    };
  })();

  const hasEdits = (() => {
    const defaults = { brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1, highlights: 0, shadows: 0, vignette: 0, tint: 0, vibrance: 1, clarity: 1, dehaze: 0, exposure: 0, blacks: 0, whites: 0, grain: 0, grayscale: 0, colorize: 0 };
    const adjChanged = Object.keys(defaults).some((k) => adjust[k] !== defaults[k]);
    const videoAdj = defaultVideoAdjust();
    const videoAdjChanged = isVideo && (videoAdjust.speed !== videoAdj.speed || videoAdjust.volume !== videoAdj.volume || videoAdjust.audioMute !== videoAdj.audioMute || videoAdjust.reverse !== videoAdj.reverse);
    return activeFilter !== "normal" || adjChanged || videoAdjChanged || operations.length > 0 || (isVideo && (videoTrim.start > 0 || videoTrim.end < (meta?.duration || 0))) || !!((crop?.x || 0) > 0 || (crop?.y || 0) > 0 || (crop?.w || 1) < 1 || (crop?.h || 1) < 1) || cropApplied;
  })();

  const renderSlider = (key, label, min, max, step, icon) => (
    <div className="viewer-slider-row">
      <span className="viewer-slider-icon">{icon}</span>
      <div className="viewer-slider-body">
        <div className="viewer-slider-header">
          <span className="viewer-slider-label">{label}</span>
          <span className="viewer-slider-val">{["warmth","highlights","shadows","tint","dehaze","exposure","blacks","whites","grain","colorize"].includes(key) ? adjust[key] : adjust[key].toFixed(2)}</span>
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
                <div className="viewer-export-wrap" ref={exportRef}>
                  <button
                    className="viewer-btn viewer-btn--export"
                    onClick={() => setShowExportMenu((p) => !p)}
                    disabled={exporting}
                    title="Export as..."
                  >
                    {exporting ? <Spinner size={14} /> : <FileImage size={14} />} Export
                  </button>
                  {showExportMenu && (
                    <div className="viewer-export-menu">
                      <div className="viewer-export-section">Format</div>
                      {(isVideo ? [
                        { fmt: "mp4", label: "MP4", ext: ".mp4" },
                        { fmt: "webm", label: "WebM", ext: ".webm" },
                        { fmt: "avi", label: "AVI", ext: ".avi" },
                        { fmt: "mkv", label: "MKV", ext: ".mkv" },
                        { fmt: "mov", label: "MOV", ext: ".mov" },
                      ] : [
                        { fmt: "jpeg", label: "JPEG", ext: ".jpg" },
                        { fmt: "png", label: "PNG", ext: ".png" },
                        { fmt: "webp", label: "WebP", ext: ".webp" },
                        { fmt: "heic", label: "HEIC", ext: ".heic" },
                        { fmt: "pdf", label: "PDF", ext: ".pdf" },
                        { fmt: "ascii", label: "ASCII Art", ext: ".txt" },
                      ]).map((f) => (
                        <button
                          key={f.fmt}
                          className={`viewer-export-item ${exportFormat === f.fmt ? "viewer-export-item--active" : ""}`}
                          onClick={() => setExportFormat(f.fmt)}
                        >
                          <FileImage size={12} />
                          <span>{f.label}</span>
                          <span className="viewer-export-ext">{f.ext}</span>
                        </button>
                      ))}
                      {!isVideo && exportFormat !== "ascii" && (
                        <>
                          <div className="viewer-export-section">Options</div>
                          <div className="viewer-export-quality">
                            <span className="viewer-export-label">Quality</span>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              value={exportQuality}
                              onChange={(e) => setExportQuality(parseInt(e.target.value))}
                              className="viewer-slider"
                            />
                            <span className="viewer-export-val">{exportQuality}%</span>
                          </div>
                        </>
                      )}
                      {!isVideo && exportFormat === "ascii" && (
                        <div className="viewer-export-ascii-opts">
                          <div className="viewer-export-quality">
                            <span className="viewer-export-label">Chars</span>
                            <input
                              className="viewer-export-ascii-chars"
                              type="text"
                              value={asciiChars}
                              onChange={(e) => setAsciiChars(e.target.value)}
                            />
                          </div>
                          <div className="viewer-export-quality">
                            <span className="viewer-export-label">Width</span>
                            <input
                              type="number"
                              min={20}
                              max={400}
                              value={asciiWidth}
                              onChange={(e) => setAsciiWidth(parseInt(e.target.value) || 120)}
                              className="viewer-export-ascii-width"
                            />
                          </div>
                        </div>
                      )}
                      <button className="viewer-export-go" onClick={() => handleExport(exportFormat)} disabled={exporting}>
                        {exporting ? <Spinner size={12} /> : null} Export
                      </button>
                    </div>
                  )}
                </div>
                <a className="viewer-btn viewer-btn--download" href={fileUrl} download title="Download file"><Download size={15} /></a>
                <button className="viewer-btn" onClick={handleShare} title="Copy share link">{shareCopied ? <span style={{fontSize:"0.65rem"}}>Copied!</span> : <Share2 size={15} />}</button>
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
          <div className="viewer-body" style={zoom > 1 ? { cursor: panRef.current?.dragging ? "grabbing" : "grab" } : {}} onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onMouseDown={handlePanMouseDown} onMouseMove={handlePanMouseMove} onMouseUp={handlePanMouseUp} onMouseLeave={handlePanMouseUp}>
            {mediaLoading && (
              <div className="viewer-media-loading"><Spinner size={36} center /></div>
            )}
            {isVideo ? (
              <video ref={videoRef} className="viewer-media" src={fileUrl} controls autoPlay style={{ filter: showOriginal ? "none" : previewFilter }} onCanPlay={() => setMediaLoading(false)} />
            ) : (
              <div className="viewer-media-wrap" style={mediaLoading ? { visibility: "hidden", position: "absolute" } : {}}>
                <img ref={imgRef} className="viewer-media" src={fileUrl} alt={file.filename} style={previewStyle} onLoad={() => setMediaLoading(false)} />
                {editMode && adjust.vignette > 0 && (
                  <div className="viewer-vignette" style={{ opacity: adjust.vignette / 100 }} />
                )}
                {editMode && adjust.grain > 0 && (
                  <div className="viewer-grain" style={{ opacity: adjust.grain / 100 }} />
                )}
                {editMode && adjust.colorize > 0 && (
                  <div className="viewer-colorize" style={{ opacity: adjust.colorize / 100 }} />
                )}
                {editMode && editTab === "crop" && crop && !cropApplied && (
                  <div className="viewer-crop-overlay">
                    <div className="viewer-crop-rect" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}>
                      <div className="viewer-crop-move" onMouseDown={handleCropMouseDownRect} />
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
                <button className="viewer-float-btn" onClick={handleShare} title="Copy share link"><Share2 size={16} /></button>
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
                {(tabOrder || (isVideo ? DEFAULT_VIDEO_TABS : DEFAULT_IMAGE_TABS)).map((tabId) => {
                  const TabIcon = ICON_MAP[tabId] || SlidersHorizontal;
                  return (
                    <button
                      key={tabId}
                      className={`viewer-edit-tab ${editTab === tabId ? "viewer-edit-tab--active" : ""}`}
                      onClick={() => setEditTab(tabId)}
                      title={tabId.charAt(0).toUpperCase() + tabId.slice(1)}
                    >
                      <TabIcon size={15} />
                      <span>{tabId.charAt(0).toUpperCase() + tabId.slice(1)}</span>
                    </button>
                  );
                })}
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
                        {renderSlider("warmth", "Warmth", -100, 100, 1, <Sparkles size={13} />)}
                        <div className="viewer-slider-hint">Changes applied on save</div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Gauge size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Speed</span>
                              <span className="viewer-slider-val">{videoAdjust.speed.toFixed(2)}x</span>
                            </div>
                            <input type="range" min={0.25} max={4} step={0.05}
                              value={videoAdjust.speed}
                              onChange={(e) => setVideoAdjust((p) => ({ ...p, speed: parseFloat(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Volume2 size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Volume</span>
                              <span className="viewer-slider-val">{Math.round(videoAdjust.volume * 100)}%</span>
                            </div>
                            <input type="range" min={0} max={2} step={0.01}
                              value={videoAdjust.volume}
                              onChange={(e) => setVideoAdjust((p) => ({ ...p, volume: parseFloat(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}
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
                    {editTab === "text" && (
                      <div className="viewer-sliders">
                        <div className="viewer-slider-row" style={{ flexDirection: "column", gap: "0.5rem" }}>
                          <div className="viewer-slider-header" style={{ width: "100%" }}>
                            <span className="viewer-slider-label">Text Overlay</span>
                            <button
                              className={`viewer-filter-btn ${textOverlay.enabled ? "viewer-filter-btn--active" : ""}`}
                              onClick={() => setTextOverlay((p) => ({ ...p, enabled: !p.enabled }))}
                              style={{ padding: "0.25rem 0.5rem", width: "auto" }}
                            >
                              {textOverlay.enabled ? "On" : "Off"}
                            </button>
                          </div>
                          <input
                            type="text"
                            className="viewer-save-filter-input"
                            placeholder="Enter text..."
                            value={textOverlay.text}
                            onChange={(e) => setTextOverlay((p) => ({ ...p, text: e.target.value }))}
                            disabled={!textOverlay.enabled}
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Type size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Font Size</span>
                              <span className="viewer-slider-val">{textOverlay.fontSize}px</span>
                            </div>
                            <input type="range" min={12} max={120} step={1}
                              value={textOverlay.fontSize}
                              onChange={(e) => setTextOverlay((p) => ({ ...p, fontSize: parseInt(e.target.value) }))}
                              disabled={!textOverlay.enabled} />
                          </div>
                        </div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Info size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Color</span>
                            </div>
                            <input type="color" value={textOverlay.color}
                              onChange={(e) => setTextOverlay((p) => ({ ...p, color: e.target.value }))}
                              disabled={!textOverlay.enabled}
                              style={{ width: "100%", height: "2rem", border: "none", borderRadius: "var(--radius)", background: "transparent", cursor: "pointer" }} />
                          </div>
                        </div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Grid3X3 size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">X Position</span>
                              <span className="viewer-slider-val">{textOverlay.x}%</span>
                            </div>
                            <input type="range" min={0} max={100} step={1}
                              value={textOverlay.x}
                              onChange={(e) => setTextOverlay((p) => ({ ...p, x: parseInt(e.target.value) }))}
                              disabled={!textOverlay.enabled} />
                          </div>
                        </div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Grid3X3 size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Y Position</span>
                              <span className="viewer-slider-val">{textOverlay.y}%</span>
                            </div>
                            <input type="range" min={0} max={100} step={1}
                              value={textOverlay.y}
                              onChange={(e) => setTextOverlay((p) => ({ ...p, y: parseInt(e.target.value) }))}
                              disabled={!textOverlay.enabled} />
                          </div>
                        </div>
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}
                    {editTab === "effects" && (
                      <div className="viewer-sliders">
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Rewind size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Reverse</span>
                            </div>
                            <button
                              className={`viewer-filter-btn ${videoAdjust.reverse ? "viewer-filter-btn--active" : ""}`}
                              onClick={() => setVideoAdjust((p) => ({ ...p, reverse: !p.reverse }))}
                              style={{ padding: "0.35rem", width: "auto", alignSelf: "flex-start" }}
                            >
                              {videoAdjust.reverse ? "On" : "Off"}
                            </button>
                          </div>
                        </div>
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><VolumeX size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Mute Audio</span>
                            </div>
                            <button
                              className={`viewer-filter-btn ${videoAdjust.audioMute ? "viewer-filter-btn--active" : ""}`}
                              onClick={() => setVideoAdjust((p) => ({ ...p, audioMute: !p.audioMute }))}
                              style={{ padding: "0.35rem", width: "auto", alignSelf: "flex-start" }}
                            >
                              {videoAdjust.audioMute ? "On" : "Off"}
                            </button>
                          </div>
                        </div>
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
                        {renderSlider("vibrance", "Vibrance", 0, 2, 0.01, <Droplets size={13} />)}
                        {renderSlider("warmth", "Warmth", -100, 100, 1, <Sparkles size={13} />)}
                        {renderSlider("tint", "Tint", -100, 100, 1, <Palette size={13} />)}
                        {renderSlider("sharpness", "Sharpness", 0, 2, 0.01, <SlidersHorizontal size={13} />)}
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}

                    {editTab === "light" && (
                      <div className="viewer-sliders">
                        {renderSlider("exposure", "Exposure", -100, 100, 1, <Sun size={13} />)}
                        {renderSlider("highlights", "Highlights", -100, 100, 1, <Sun size={13} />)}
                        {renderSlider("shadows", "Shadows", -100, 100, 1, <Sun size={13} />)}
                        {renderSlider("whites", "Whites", -100, 100, 1, <Maximize2 size={13} />)}
                        {renderSlider("blacks", "Blacks", -100, 100, 1, <ZoomOut size={13} />)}
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}

                    {editTab === "effects" && (
                      <div className="viewer-sliders">
                        {renderSlider("vignette", "Vignette", 0, 100, 1, <Contrast size={13} />)}
                        {renderSlider("grain", "Grain", 0, 100, 1, <Sigma size={13} />)}
                        {renderSlider("colorize", "Colorize", 0, 100, 1, <Palette size={13} />)}
                        <div className="viewer-slider-row">
                          <span className="viewer-slider-icon"><Eye size={13} /></span>
                          <div className="viewer-slider-body">
                            <div className="viewer-slider-header">
                              <span className="viewer-slider-label">Grayscale</span>
                            </div>
                            <button
                              className={`viewer-filter-btn ${adjust.grayscale ? "viewer-filter-btn--active" : ""}`}
                              onClick={() => setAdjust((p) => ({ ...p, grayscale: p.grayscale ? 0 : 1 }))}
                              style={{ padding: "0.35rem", width: "auto", alignSelf: "flex-start" }}
                            >
                              {adjust.grayscale ? "On" : "Off"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {editTab === "details" && (
                      <div className="viewer-sliders">
                        {renderSlider("clarity", "Clarity", 0, 2, 0.01, <Grid3X3 size={13} />)}
                        {renderSlider("dehaze", "Dehaze", 0, 100, 1, <Eye size={13} />)}
                        <div className="viewer-slider-hint">Changes applied on save</div>
                      </div>
                    )}

                    {editTab === "info" && (
                      <div className="viewer-info">
                        {editingInfoMd.split("\n---\n").map((section, si) => {
                          const lines = section.split("\n").filter(l => l.trim());
                          const heading = lines.find(l => l.startsWith("## "));
                          const bodyLines = lines.filter(l => !l.startsWith("## ") && !l.startsWith("|") && !l.startsWith("|---") && !l.startsWith("> **"));
                          const tipLine = lines.find(l => l.startsWith("> "));
                          const tableLines = lines.filter(l => l.startsWith("|"));
                          const tableHeaderMatch = lines.find(l => l.startsWith("|---"));
                          return (
                            <div key={si} className="viewer-info-section">
                              {heading && <h2>{heading.slice(3)}</h2>}
                              {bodyLines.map((line, li) => {
                                if (line.startsWith("### ")) return <h3 key={li}>{line.slice(4)}</h3>;
                                if (line.startsWith("**")) return <p key={li} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />;
                                return <p key={li}>{line}</p>;
                              })}
                              {tipLine && <blockquote>{tipLine.slice(2)}</blockquote>}
                              {tableLines.length >= 3 && tableHeaderMatch && (
                                <table>
                                  <thead><tr>{tableLines[0].split("|").filter(Boolean).map(h => h.trim()).map((h, hi) => <th key={hi}>{h}</th>)}</tr></thead>
                                  <tbody>{tableLines.slice(2).filter(r => r.startsWith("|")).map((row, ri) => (
                                    <tr key={ri}>{row.split("|").filter(Boolean).map((c, ci) => <td key={ci} dangerouslySetInnerHTML={{ __html: c.trim().replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />)}</tr>
                                  ))}</tbody>
                                </table>
                              )}
                            </div>
                          );
                        })}
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
                        {!cropApplied && (
                          <button className="viewer-tool" onClick={handleCropApply} style={{ alignSelf: "flex-start", width: "auto", padding: "0.35rem 0.75rem", gap: "0.35rem", display: "flex" }} disabled={!crop}>
                            <Scissors size={14} /> Apply
                          </button>
                        )}
                        {cropApplied && (
                          <button className="viewer-tool" onClick={() => setCropApplied(false)} style={{ alignSelf: "flex-start", width: "auto", padding: "0.35rem 0.75rem", gap: "0.35rem", display: "flex" }}>
                            <Undo2 size={14} /> Reset Crop
                          </button>
                        )}
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

                <div className="viewer-histogram-wrap">
                  <canvas ref={histCanvasRef} className="viewer-histogram" width={240} height={60} />
                </div>
                <div className="viewer-edit-footer">
                  <button
                    className="viewer-btn viewer-btn--original"
                    ref={originalBtnRef}
                    onMouseDown={() => setShowOriginal(true)}
                    onMouseUp={() => setShowOriginal(false)}
                    onMouseLeave={() => setShowOriginal(false)}
                    onTouchStart={() => setShowOriginal(true)}
                    onTouchEnd={() => setShowOriginal(false)}
                    title="Hold to see original"
                  >
                    <Eye size={14} /> Original
                  </button>
                  <button className="viewer-btn viewer-btn--save" onClick={handleSave} disabled={saving || !hasEdits}>
                    {saving ? <Spinner size={14} /> : <Save size={14} />} Save
                  </button>
                  <button className="viewer-btn viewer-btn--save-filter" onClick={() => setShowSaveFilter(true)} disabled={!hasEdits || savingFilter}>
                    {savingFilter ? <Spinner size={14} /> : <Save size={14} />} Preset
                  </button>
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
                  {fileRecord?.file_path && (
                    <div className="viewer-meta-row viewer-meta-path">
                      <span className="viewer-meta-label"><FolderOpen size={12} /> Path</span>
                      <span className="viewer-meta-value viewer-meta-path-value">
                        <span className="viewer-path-text">{fileRecord.file_path}</span>
                        <button
                          className="viewer-path-copy"
                          onClick={() => navigator.clipboard.writeText(fileRecord.file_path)}
                          title="Copy path"
                        >
                          <Copy size={11} />
                        </button>
                      </span>
                    </div>
                  )}
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
                      <span className="viewer-meta-label"><MapPin size={12} /> Location</span>
                      <span className="viewer-meta-value">
                        {locationName ? (
                          <span className="viewer-location-name">{locationName}</span>
                        ) : (
                          <>
                            {meta.latitude.toFixed(4)}, {meta.longitude.toFixed(4)}
                          </>
                        )}
                        <a
                          href={`https://www.google.com/maps?q=${meta.latitude},${meta.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="viewer-gmaps-link"
                          title="Open in Google Maps"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </span>
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
