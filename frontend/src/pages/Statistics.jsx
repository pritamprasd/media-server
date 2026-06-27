import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area,
} from "recharts";
import { getStats } from "../services/api";
import Spinner from "../components/Spinner";
import "./Statistics.css";

const COLORS = ["#ff4757", "#2ecc71", "#3498db", "#f39c12", "#9b59b6", "#1abc9c", "#e74c3c", "#34495e"];

function StatsCard({ title, children }) {
  return (
    <div className="stats__card">
      <h3 className="stats__card-title">{title}</h3>
      <div className="stats__card-body">{children}</div>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function Statistics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getStats()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="stats stats--loading"><Spinner size={36} center="full" /></div>;
  if (error) return <div className="stats stats--error"><p>{error}</p></div>;
  if (!data) return null;

  const { overview, mime_breakdown, mime_detail, metadata_status, thumbnail_status, files_by_date, top_tags, tag_count_distribution, dimension_ranges, coverage } = data;

  const mimePie = [
    { name: "Images", value: mime_breakdown.image },
    { name: "Videos", value: mime_breakdown.video },
  ];

  const dimData = Object.entries(dimension_ranges).map(([name, value]) => ({ name, value }));

  const metaStatusPie = metadata_status.map((s) => ({ name: s.status, value: s.count }));
  const thumbStatusPie = thumbnail_status.map((s) => ({ name: s.status, value: s.count }));

  return (
    <div className="stats">
      <h2 className="stats__title">Statistics</h2>

      <div className="stats__overview">
        <div className="stats__stat">
          <span className="stats__stat-value">{overview.total_files}</span>
          <span className="stats__stat-label">Total Files</span>
        </div>
        <div className="stats__stat">
          <span className="stats__stat-value">{overview.total_favorites}</span>
          <span className="stats__stat-label">Favorites</span>
        </div>
        <div className="stats__stat">
          <span className="stats__stat-value">{formatSize(overview.total_size)}</span>
          <span className="stats__stat-label">Total Size</span>
        </div>
        <div className="stats__stat">
          <span className="stats__stat-value">{overview.total_metadata}</span>
          <span className="stats__stat-label">With Metadata</span>
        </div>
      </div>

      <div className="stats__grid">
        <StatsCard title="Images vs Videos">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={mimePie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {mimePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </StatsCard>

        <StatsCard title="Upload Activity (last 31 days)">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={files_by_date}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--neu-dark)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--color-text-muted)" }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="image" stackId="1" stroke="#2ecc71" fill="#2ecc71" fillOpacity={0.5} name="Images" />
              <Area type="monotone" dataKey="video" stackId="1" stroke="#3498db" fill="#3498db" fillOpacity={0.5} name="Videos" />
            </AreaChart>
          </ResponsiveContainer>
        </StatsCard>

        <StatsCard title="Top Tags">
          <div className="stats__tags">
            {top_tags.map((t, i) => (
              <div key={t.tag} className="stats__tag-row">
                <span className="stats__tag-rank">#{i + 1}</span>
                <span className="stats__tag-name">{t.tag}</span>
                <span className="stats__tag-bar-wrap">
                  <span className="stats__tag-bar" style={{ width: `${(t.count / Math.max(...top_tags.map((x) => x.count))) * 100}%` }} />
                </span>
                <span className="stats__tag-count">{t.count}</span>
              </div>
            ))}
            {top_tags.length === 0 && <p className="stats__empty">No tags yet</p>}
          </div>
        </StatsCard>

        <StatsCard title="MIME Types">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mime_detail} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--neu-dark)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
              <YAxis type="category" dataKey="mime" tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} width={80} />
              <Tooltip />
              <Bar dataKey="count" fill="#3498db" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </StatsCard>

        <StatsCard title="Dimension Ranges">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dimData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {dimData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </StatsCard>

        <StatsCard title="Metadata Status">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={metaStatusPie} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {metaStatusPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </StatsCard>

        <StatsCard title="Tags per File">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tag_count_distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--neu-dark)" />
              <XAxis dataKey="tag_count" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} label={{ value: "Tags", position: "insideBottom", offset: -4, fontSize: 11, fill: "var(--color-text-muted)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} label={{ value: "Files", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "var(--color-text-muted)" }} />
              <Tooltip />
              <Bar dataKey="file_count" fill="#2ecc71" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </StatsCard>

        <StatsCard title="Coverage">
          <div className="stats__cover">
            <div className="stats__cover-row">
              <span className="stats__cover-label">With GPS</span>
              <span className="stats__cover-bar-wrap">
                <span className="stats__cover-bar" style={{ width: `${overview.total_files ? (coverage.files_with_gps / overview.total_files) * 100 : 0}%` }} />
              </span>
              <span className="stats__cover-value">{coverage.files_with_gps}</span>
            </div>
            <div className="stats__cover-row">
              <span className="stats__cover-label">With Description</span>
              <span className="stats__cover-bar-wrap">
                <span className="stats__cover-bar" style={{ width: `${overview.total_files ? (coverage.files_with_description / overview.total_files) * 100 : 0}%` }} />
              </span>
              <span className="stats__cover-value">{coverage.files_with_description}</span>
            </div>
            <div className="stats__cover-row">
              <span className="stats__cover-label">With Nickname</span>
              <span className="stats__cover-bar-wrap">
                <span className="stats__cover-bar" style={{ width: `${overview.total_files ? (coverage.files_with_nickname / overview.total_files) * 100 : 0}%` }} />
              </span>
              <span className="stats__cover-value">{coverage.files_with_nickname}</span>
            </div>
          </div>
        </StatsCard>

        <StatsCard title="Thumbnail Status">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={thumbStatusPie} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {thumbStatusPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </StatsCard>
      </div>
    </div>
  );
}

export default Statistics;
