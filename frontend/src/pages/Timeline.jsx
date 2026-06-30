import { useState, useEffect, useRef } from "react";
import { Clock, Search, Image, X, Calendar, User } from "lucide-react";
import Spinner from "../components/Spinner";
import FileViewer from "../components/FileViewer";
import { listPersons, getPersonTimeline } from "../services/api";
import "./Timeline.css";

const MAX_PERSONS = 5;

const TIMEFRAMES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function getISOWeek(d) {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function formatBucketLabel(start, timeframe) {
  const d = new Date(start);
  switch (timeframe) {
    case "year":
      return d.getFullYear().toString();
    case "month":
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
    case "week": {
      const w = getISOWeek(d);
      return `W${w} ${d.getFullYear()}`;
    }
    case "day":
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    default:
      return d.toLocaleDateString();
  }
}

function Timeline() {
  const [persons, setPersons] = useState([]);
  const [selectedPersons, setSelectedPersons] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPersons, setLoadingPersons] = useState(true);
  const [timeframe, setTimeframe] = useState("year");
  const [viewerFile, setViewerFile] = useState(null);
  const [personSearch, setPersonSearch] = useState("");
  const [rangeInfo, setRangeInfo] = useState(null);
  const [actualRange, setActualRange] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dateFilterVisible, setDateFilterVisible] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const timelineRef = useRef(null);
  const datesAutoSet = useRef(false);

  useEffect(() => {
    listPersons(1, 200)
      .then((data) => {
        const sorted = (data.persons || []).sort((a, b) => {
          const aName = a.name || "";
          const bName = b.name || "";
          if (!aName && !bName) return b.face_count - a.face_count;
          if (!aName) return 1;
          if (!bName) return -1;
          return aName.localeCompare(bName);
        });
        setPersons(sorted);
      })
      .catch(console.error)
      .finally(() => setLoadingPersons(false));
  }, []);

  const selectedIds = selectedPersons.map((p) =>
    p._combined ? p._persons[0].id : p.id
  );

  useEffect(() => {
    if (selectedPersons.length === 0) {
      setTimeline([]);
      setRangeInfo(null);
      setActualRange(null);
      setDateFrom("");
      setDateTo("");
      datesAutoSet.current = false;
      return;
    }

    if (!datesAutoSet.current) {
      datesAutoSet.current = true;
      setDateFrom("");
      setDateTo("");
      setLoading(true);
      const ids = selectedPersons.map((p) =>
        p._combined ? p._persons[0].id : p.id
      );
      getPersonTimeline(ids[0], timeframe, null, null, ids)
        .then((data) => {
          setTimeline(data.timeline || []);
          setRangeInfo({ start: data.range_start, end: data.range_end });
          setActualRange({ start: data.actual_range_start, end: data.actual_range_end });
          if (data.actual_range_start) {
            setDateFrom(toDateInputValue(new Date(data.actual_range_start)));
          }
          if (data.actual_range_end) {
            setDateTo(toDateInputValue(new Date(data.actual_range_end)));
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
      return;
    }

    setLoading(true);
    const ids = selectedPersons.map((p) =>
      p._combined ? p._persons[0].id : p.id
    );
    getPersonTimeline(ids[0], timeframe, dateFrom, dateTo, ids)
      .then((data) => {
        setTimeline(data.timeline || []);
        setRangeInfo({ start: data.range_start, end: data.range_end });
        setActualRange({ start: data.actual_range_start, end: data.actual_range_end });
        requestAnimationFrame(() => {
          if (timelineRef.current) {
            timelineRef.current.scrollTop = 0;
          }
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedPersons, timeframe, dateFrom, dateTo]);

  const filteredPersons = persons.filter((p) => {
    if (!personSearch) return true;
    const name = (p.name || "").toLowerCase();
    return name.includes(personSearch.toLowerCase());
  });

  const alreadySelected = (p) => {
    const pid = p._combined ? p._persons[0].id : p.id;
    return selectedIds.includes(pid);
  };

  const handleTogglePerson = (person) => {
    const pid = person._combined ? person._persons[0].id : person.id;
    if (alreadySelected(person)) {
      setSelectedPersons((prev) =>
        prev.filter((sp) => {
          const spid = sp._combined ? sp._persons[0].id : sp.id;
          return spid !== pid;
        })
      );
    } else {
      if (selectedPersons.length >= MAX_PERSONS) return;
      setSelectedPersons((prev) => [...prev, person]);
    }
    setPersonSearch("");
    setDropdownOpen(false);
  };

  const handleRemovePerson = (person) => {
    const pid = person._combined ? person._persons[0].id : person.id;
    setSelectedPersons((prev) =>
      prev.filter((sp) => {
        const spid = sp._combined ? sp._persons[0].id : sp.id;
        return spid !== pid;
      })
    );
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="timeline-page">
      <div className="timeline-toolbar">
        <h2 className="timeline-title">
          <Clock size={18} /> Timeline
        </h2>
        <div className="timeline-controls">
          <div className="timeline-combobox">
            <div
              className={`timeline-combobox-trigger ${dropdownOpen ? "timeline-combobox-trigger--open" : ""}`}
              onClick={() => setDropdownOpen((p) => !p)}
            >
              <Search size={13} className="timeline-combobox-icon" />
              {selectedPersons.length > 0 ? (
                <div className="timeline-person-chips">
                  {selectedPersons.map((p) => (
                    <span key={p.id} className="timeline-person-chip">
                      {p.name || `Unnamed #${p.id}`}
                      <X
                        size={10}
                        className="timeline-person-chip-x"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePerson(p);
                        }}
                      />
                    </span>
                  ))}
                </div>
              ) : (
                <span className="timeline-combobox-text">Select persons...</span>
              )}
              <X
                size={12}
                className="timeline-combobox-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPersons([]);
                  setTimeline([]);
                  setRangeInfo(null);
                  setActualRange(null);
                }}
              />
            </div>
            {dropdownOpen && (
              <div className="timeline-combobox-dropdown">
                <div className="timeline-combobox-search-wrap">
                  <Search size={12} className="timeline-combobox-search-icon" />
                  <input
                    className="timeline-combobox-search"
                    type="text"
                    placeholder="Search persons..."
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {selectedPersons.length >= MAX_PERSONS && (
                  <div className="timeline-combobox-hint">Max {MAX_PERSONS} persons selected</div>
                )}
                <div className="timeline-combobox-list">
                  {loadingPersons ? (
                    <div className="timeline-combobox-loading"><Spinner size={16} center /></div>
                  ) : filteredPersons.length === 0 ? (
                    <div className="timeline-combobox-empty">No persons found</div>
                  ) : (
                    filteredPersons.map((p) => {
                      const isSelected = alreadySelected(p);
                      const disabled = !isSelected && selectedPersons.length >= MAX_PERSONS;
                      return (
                        <div
                          key={p.id}
                          className={`timeline-combobox-item ${isSelected ? "timeline-combobox-item--selected" : ""} ${disabled ? "timeline-combobox-item--disabled" : ""}`}
                          onClick={() => {
                            if (!disabled) handleTogglePerson(p);
                          }}
                        >
                          <div className="timeline-combobox-item-thumb">
                            {p.thumbnail ? (
                              <img src={p.thumbnail} alt="" />
                            ) : (
                              <User size={14} />
                            )}
                          </div>
                          <span>{p.name || "Unnamed"}</span>
                          <span className="timeline-combobox-item-count">{p.face_count}</span>
                          {isSelected && (
                            <span className="timeline-combobox-check">✓</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="timeline-timeframe-select">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="timeline-select"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf.value} value={tf.value}>
                  {tf.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className={`timeline-filter-toggle ${dateFilterVisible ? "timeline-filter-toggle--active" : ""}`}
            onClick={() => setDateFilterVisible((p) => !p)}
            title="Toggle date range filter"
          >
            <Calendar size={14} />
          </button>
        </div>
      </div>

      {dateFilterVisible && (
        <div className="timeline-date-filters">
          <div className="timeline-date-field">
            <label className="timeline-date-label">From</label>
            <input
              type="date"
              className="timeline-date-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="timeline-date-field">
            <label className="timeline-date-label">To</label>
            <input
              type="date"
              className="timeline-date-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {selectedPersons.length > 0 && actualRange && (
        <div className="timeline-range">
          <span className="timeline-range-label">
            {formatDate(rangeInfo?.start)} – {formatDate(rangeInfo?.end)}
            <span className="timeline-range-count"> · {timeline.length} point{timeline.length !== 1 ? "s" : ""}</span>
            {(actualRange.start !== rangeInfo?.start || actualRange.end !== rangeInfo?.end) && (
              <span className="timeline-range-hint">
                {" "}(photos from {formatDate(actualRange.start)} to {formatDate(actualRange.end)})
              </span>
            )}
          </span>
        </div>
      )}

      <div className="timeline-container" ref={timelineRef}>
        {loading ? (
          <div className="timeline-loading">
            <Spinner size={32} center />
          </div>
        ) : selectedPersons.length === 0 ? (
          <div className="timeline-empty">
            <Clock size={48} />
            <p>Select one or more persons to view their timeline</p>
          </div>
        ) : timeline.length === 0 ? (
          <div className="timeline-empty">
            <Image size={48} />
            <p>No photos in this date range</p>
          </div>
        ) : (
          <div className="timeline-line">
            {timeline.map((point, i) => (
              <div
                key={point.index}
                className={`timeline-item ${i % 2 === 0 ? "timeline-item--left" : "timeline-item--right"}`}
                style={{ "--i": i }}
              >
                <div
                  className="timeline-item-content"
                  onClick={() =>
                    setViewerFile({
                      id: point.file.id,
                      filename: point.file.filename,
                      mime_type: point.file.mime_type,
                    })
                  }
                >
                  <div className="timeline-thumb-wrap">
                    {point.file.thumbnail ? (
                      <img
                        src={point.file.thumbnail}
                        alt=""
                        className="timeline-thumb"
                        loading="lazy"
                      />
                    ) : (
                      <div className="timeline-thumb-placeholder">
                        <Image size={24} />
                      </div>
                    )}
                    <div className="timeline-thumb-count">{point.count}</div>
                  </div>
                  <div className="timeline-item-info">
                    <span className="timeline-item-date">
                      {formatBucketLabel(point.start, timeframe)}
                    </span>
                    <span className="timeline-item-sub">
                      {point.count} {point.count === 1 ? "photo" : "photos"}
                    </span>
                  </div>
                </div>
                <div className="timeline-dot" />
              </div>
            ))}
          </div>
        )}
      </div>

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={() => setViewerFile(null)}
        />
      )}
    </div>
  );
}

export default Timeline;
