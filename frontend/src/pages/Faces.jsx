import { useState, useEffect, useCallback, useMemo } from "react";
import { Eye, EyeOff, Search, UserPlus, UserMinus, IdCard, Scan, Image, SlidersHorizontal, X, ChevronLeft, ChevronRight, Tags, GitMerge, CheckSquare, Square, ChevronDown, Users, List, Grid3X3 } from "lucide-react";
import Spinner from "../components/Spinner";
import FileViewer from "../components/FileViewer";
import { listPersons, updatePerson, deletePerson, scanAllFaces, listPersonFiles, getFaceStats, mergePersons } from "../services/api";
import "./Faces.css";

function Faces() {
  const [persons, setPersons] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [personPage, setPersonPage] = useState(1);
  const [personTotal, setPersonTotal] = useState(0);
  const [personPages, setPersonPages] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personFiles, setPersonFiles] = useState([]);
  const [filesPage, setFilesPage] = useState(1);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesPages, setFilesPages] = useState(0);
  const [filesLoading, setFilesLoading] = useState(false);
  const [editingName, setEditingName] = useState(null);
  const [nameValue, setNameValue] = useState("");
  const [viewerFile, setViewerFile] = useState(null);
  const [sortBy, setSortBy] = useState("face_count");
  const [searchName, setSearchName] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [merging, setMerging] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  const loadPersons = useCallback(async (page = 1, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const [pData, sData] = await Promise.all([listPersons(page, 50, searchName), getFaceStats()]);
      setPersons((prev) => append ? [...prev, ...pData.persons] : pData.persons);
      setStats(sData);
      setPersonPage(pData.page);
      setPersonTotal(pData.total);
      setPersonPages(pData.pages);
    } catch (e) {
      console.error("Failed to load persons:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchName]);

  useEffect(() => { setPersonPage(1); loadPersons(1); }, [loadPersons]);

  useEffect(() => {
    if (selectedPerson && window.innerWidth <= 768) {
      const wrap = document.querySelector(".faces-grid-wrap");
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    }
  }, [selectedPerson]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const data = await scanAllFaces();
      setScanResult(data);
      setTimeout(loadPersons, 2000);
    } catch (e) {
      console.error("Scan failed:", e);
    } finally {
      setScanning(false);
    }
  };

  const handleSelectPerson = async (person) => {
    setSelectedPerson(person);
    setFilesPage(1);
    const loadId = person._combined ? person._persons[0].id : person.id;
    await loadFiles(loadId, 1);
  };

  const loadFiles = async (personId, page) => {
    setFilesLoading(true);
    try {
      const data = await listPersonFiles(personId, page);
      setPersonFiles(data.files || []);
      setFilesTotal(data.total || 0);
      setFilesPages(data.pages || 0);
    } catch (e) {
      console.error("Failed to load person files:", e);
      setPersonFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleFilesPage = async (dir) => {
    const next = filesPage + dir;
    if (next < 1 || next > filesPages) return;
    setFilesPage(next);
    const loadId = selectedPerson._combined ? selectedPerson._persons[0].id : selectedPerson.id;
    await loadFiles(loadId, next);
  };

  const handleSaveName = async (person) => {
    try {
      await updatePerson(person.id, { name: nameValue || null });
      setEditingName(null);
      await loadPersons();
      if (selectedPerson?.id === person.id) {
        setSelectedPerson((p) => ({ ...p, name: nameValue || null }));
      }
    } catch (e) {
      console.error("Failed to update name:", e);
    }
  };

  const handleDeletePerson = async (person) => {
    if (!window.confirm(`Remove "${person.name || "Unnamed"}" person group?`)) return;
    try {
      await deletePerson(person.id);
      if (selectedPerson?.id === person.id) setSelectedPerson(null);
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(person.id); return next; });
      await loadPersons();
    } catch (e) {
      console.error("Failed to delete person:", e);
    }
  };

  const toggleSelect = (idOrIds) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach(id => {
        if (next.has(id)) next.delete(id); else next.add(id);
      });
      return next;
    });
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) return;
    const name = mergeName.trim() || null;
    setMerging(true);
    try {
      await mergePersons(Array.from(selectedIds), name);
      setSelectedIds(new Set());
      setMergeName("");
      await loadPersons();
    } catch (e) {
      console.error("Merge failed:", e);
    } finally {
      setMerging(false);
    }
  };

  const startEdit = (person) => {
    setEditingName(person.id);
    setNameValue(person.name || "");
  };

  const displayPersons = useMemo(() => {
    const sorted = [...persons].sort((a, b) => {
      if (sortBy === "face_count") return (b.face_count || 0) - (a.face_count || 0);
      if (sortBy === "name") return (a.name || "???").localeCompare(b.name || "???");
      return (b.id || 0) - (a.id || 0);
    }).filter((p) => {
      if (filterMode === "all") return true;
      if (filterMode === "named") return !!p.name;
      if (filterMode === "unnamed") return !p.name;
      return true;
    });
    const groups = {};
    for (const p of sorted) {
      if (!p.name) {
        groups[`__single_${p.id}`] = p;
      } else {
        const key = p.name.toLowerCase();
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      }
    }
    const result = [];
    for (const val of Object.values(groups)) {
      if (Array.isArray(val)) {
        const combined = {
          id: val.map(p => p.id),
          name: val[0].name,
          face_count: val.reduce((s, p) => s + (p.face_count || 0), 0),
          thumbnail: val[0].thumbnail,
          thumbnails: val.map(p => p.thumbnail).filter(Boolean),
          meta_info: null,
          _combined: true,
          _persons: val,
        };
        result.push(combined);
      } else {
        result.push(val);
      }
    }
    return result;
  }, [persons, sortBy, filterMode]);

  if (loading) {
    return (
      <div className="faces-page">
        <div className="faces-loading"><Spinner size={36} center /></div>
      </div>
    );
  }

  return (
    <div className="faces-page">
      <div className="faces-toolbar">
        <div className="faces-toolbar-left">
          <h2 className="faces-title">
            <Scan size={18} /> Faces
            {stats && (
              <span className="faces-title-count">
                {stats.total_persons} persons, {stats.total_faces} faces in {stats.files_with_faces} files
                {stats.named_persons < stats.total_persons && (
                  <span className="faces-title-unamed"> ({stats.total_persons - stats.named_persons} unnamed)</span>
                )}
              </span>
            )}
          </h2>
        </div>
        <div className="faces-toolbar-right">
          <button
            className={`faces-btn faces-btn--scan ${scanning ? "faces-btn--scanning" : ""}`}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? <Spinner size={14} /> : <Scan size={14} />}
            {scanning ? "Scanning..." : "Scan All Faces"}
          </button>
          {selectedIds.size >= 2 && (
            <div className="faces-merge-bar">
              <input
                className="faces-merge-input"
                type="text"
                placeholder="Name for merged person"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
              />
              <button className="faces-btn faces-btn--merge" onClick={handleMerge} disabled={merging}>
                {merging ? <Spinner size={14} /> : <GitMerge size={14} />}
                Merge {selectedIds.size}
              </button>
            </div>
          )}
          <div className="faces-search-wrap">
            <Search size={13} className="faces-search-icon" />
            <input className="faces-search" type="text" placeholder="Search by name..." value={searchName} onChange={(e) => setSearchName(e.target.value)} />
            {searchName && <button className="faces-search-clear" onClick={() => setSearchName("")}><X size={12} /></button>}
          </div>
          <div className="faces-filter-group">
            <button className={`faces-filter-btn ${filterMode === "all" ? "faces-filter-btn--active" : ""}`} onClick={() => setFilterMode("all")} title="Show all persons"><Users size={13} /> All</button>
            <button className={`faces-filter-btn ${filterMode === "named" ? "faces-filter-btn--active" : ""}`} onClick={() => setFilterMode("named")} title="Named only"><Eye size={13} /> Named</button>
            <button className={`faces-filter-btn ${filterMode === "unnamed" ? "faces-filter-btn--active" : ""}`} onClick={() => setFilterMode("unnamed")} title="Unnamed only"><EyeOff size={13} /> Unnamed</button>
          </div>
          <div className="faces-sort">
            <SlidersHorizontal size={13} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="faces-sort-select">
              <option value="face_count">Most faces</option>
              <option value="name">Name A-Z</option>
              <option value="newest">Newest</option>
            </select>
            <ChevronDown size={12} className="faces-sort-arrow" />
          </div>
          <button
            className="faces-btn"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            title={viewMode === "grid" ? "List view" : "Grid view"}
          >
            {viewMode === "grid" ? <List size={14} /> : <Grid3X3 size={14} />}
          </button>
        </div>
      </div>

      {persons.length === 0 ? (
        <div className="faces-empty">
          <Scan size={48} />
          <p>No faces detected yet</p>
          <button className="faces-btn faces-btn--scan faces-btn--large" onClick={handleScan} disabled={scanning}>
            {scanning ? <Spinner size={16} /> : <Scan size={16} />}
            Scan all images for faces
          </button>
        </div>
      ) : (
        <div className="faces-layout">
          <div className="faces-grid-wrap">
            <div className={`faces-grid ${viewMode === "grid" ? "faces-grid--grid" : "faces-grid--list"}`}>
              {displayPersons.map((person) => {
                const personId = Array.isArray(person.id) ? person.id.join(",") : person.id;
                const isCombined = person._combined;
                const isSelected = isCombined
                  ? person._persons.some(p => selectedIds.has(p.id))
                  : selectedIds.has(person.id);
                return (
                <div
                  key={personId}
                  className={`faces-card ${viewMode === "grid" ? "faces-card--grid" : "faces-card--list"} ${isCombined ? "faces-card--combined" : ""} ${selectedPerson && (Array.isArray(selectedPerson.id) ? selectedPerson.id.join(",") : String(selectedPerson.id)) === personId ? "faces-card--selected" : ""} ${isSelected ? "faces-card--checked" : ""}`}
                  onClick={() => handleSelectPerson(person)}
                >
                  <div className="faces-card-check" onClick={(e) => { e.stopPropagation(); toggleSelect(isCombined ? person._persons.map(p => p.id) : person.id); }}>
                    {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </div>
                  <div className="faces-card-thumb">
                    {isCombined ? (
                      <div className="faces-card-thumbs-grid">
                        {(person.thumbnails?.length ? person.thumbnails : [null]).slice(0, 4).map((t, i) =>
                          t ? (
                            <img key={i} src={t} alt="" className="faces-card-thumb-sm" />
                          ) : (
                            <div key={i} className="faces-card-placeholder faces-card-placeholder--sm"><UserPlus size={14} /></div>
                          )
                        )}
                      </div>
                    ) : person.thumbnail ? (
                      <img src={person.thumbnail} alt="" className="faces-card-img" />
                    ) : (
                      <div className="faces-card-placeholder"><UserPlus size={28} /></div>
                    )}
                    <div className="faces-card-badge" title="Number of images containing this person">{person.face_count}</div>
                    {!isCombined && person.meta_info?.age && (
                      <div className="faces-card-age" title="Estimated age">{person.meta_info.age}y</div>
                    )}
                  </div>
                  <div className="faces-card-info">
                    {!isCombined && editingName === person.id ? (
                      <div className="faces-card-edit" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="faces-card-input"
                          type="text"
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          placeholder="Enter name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveName(person);
                            if (e.key === "Escape") setEditingName(null);
                          }}
                        />
                        <button className="faces-card-save" onClick={() => handleSaveName(person)}><IdCard size={13} /></button>
                      </div>
                    ) : (
                      <div className="faces-card-name-row">
                        <span className="faces-card-name">{person.name || "Unnamed"}</span>
                        {!isCombined && (
                          <>
                            <button className="faces-card-name-btn" onClick={(e) => { e.stopPropagation(); startEdit(person); }} title="Name this person">
                              <IdCard size={12} />
                            </button>
                            <button className="faces-card-del-btn" onClick={(e) => { e.stopPropagation(); handleDeletePerson(person); }} title="Remove person group">
                              <UserMinus size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <div className="faces-card-meta">
                      {!isCombined && person.meta_info?.gender === 0 ? <span title="Female">♀</span> : !isCombined && person.meta_info?.gender === 1 ? <span title="Male">♂</span> : ""}
                      {isCombined ? (
                        <span title="Combined persons">{person._persons.length} persons</span>
                      ) : (
                        <span title="Database ID">#{person.id}</span>
                      )}
                      {viewMode === "list" && <span title="Face count">{person.face_count} images</span>}
                    </div>
                  </div>
                </div>
              );
              })}
              {loadingMore && (
                <div className="faces-grid-loading">
                  <Spinner size={24} center />
                </div>
              )}
              {personPage < personPages && !loadingMore && (
                <div className="faces-grid-loadmore-wrap">
                  <button className="faces-btn faces-load-more" onClick={() => loadPersons(personPage + 1, true)}>
                    Load More ({personTotal - persons.length} remaining)
                  </button>
                </div>
              )}
            </div>
          </div>

          {selectedPerson && (
            <div className="faces-sidebar">
              <div className="faces-sidebar-header">
                <div className="faces-sidebar-title-row">
                  <Tags size={14} />
                  <span className="faces-sidebar-title">{selectedPerson.name || "Unnamed"}</span>
                  <button className="faces-sidebar-close" onClick={() => setSelectedPerson(null)}><X size={14} /></button>
                </div>
                <span className="faces-sidebar-subtitle">{filesTotal} images</span>
              </div>

              <div className="faces-sidebar-grid">
                {filesLoading ? (
                  <div className="faces-sidebar-loading"><Spinner size={24} center /></div>
                ) : personFiles.length === 0 ? (
                  <div className="faces-sidebar-empty">No images</div>
                ) : (
                  personFiles.map((f) => (
                    <div
                      key={f.id}
                      className="faces-sidebar-item"
                      onClick={() => setViewerFile({ id: f.id, filename: f.filename, mime_type: f.mime_type })}
                    >
                      {f.thumbnail ? (
                        <img src={f.thumbnail} alt="" className="faces-sidebar-thumb" />
                      ) : (
                        <div className="faces-sidebar-placeholder"><Image size={18} /></div>
                      )}
                      <div className="faces-sidebar-fname">{f.filename}</div>
                    </div>
                  ))
                )}
              </div>

              {filesPages > 1 && (
                <div className="faces-sidebar-pages">
                  <button className="faces-page-btn" disabled={filesPage <= 1} onClick={() => handleFilesPage(-1)}>
                    <ChevronLeft size={14} />
                  </button>
                  <span className="faces-page-info">{filesPage} / {filesPages}</span>
                  <button className="faces-page-btn" disabled={filesPage >= filesPages} onClick={() => handleFilesPage(1)}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={() => setViewerFile(null)}
          onRefresh={() => { if (selectedPerson) { const id = selectedPerson._combined ? selectedPerson._persons[0].id : selectedPerson.id; loadFiles(id, filesPage); } }}
        />
      )}

      {scanResult && (
        <div className="faces-modal-overlay" onClick={() => setScanResult(null)}>
          <div className="faces-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="faces-modal-title"><Scan size={18} /> Scan Complete</h3>
            <div className="faces-modal-stats">
              <div className="faces-modal-stat">
                <span className="faces-modal-num">{scanResult.message?.match(/\d+/)?.[0] || 0}</span>
                <span className="faces-modal-label">images queued for face detection</span>
              </div>
            </div>
            <button className="faces-btn faces-btn--modal-close" onClick={() => setScanResult(null)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Faces;
