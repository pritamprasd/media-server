import { getLogs, clearLogs, getLogSources } from '../services/tool-logger.js';

export const icon = '📋';
export const name = 'Logs';
export const description = 'View logs emitted by tools and tabs — API requests, scans, errors, and more';

export function init(container) {
  let refreshInterval = null;

  container.style.overflow = 'auto';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;padding:1.25rem;gap:1rem;min-width:0;';
  container.appendChild(wrapper);

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;';

  const title = document.createElement('h2');
  title.textContent = 'Tool Logs';
  title.style.cssText = 'margin:0;font-size:1.1rem;font-weight:600;color:var(--color-text);';

  const headerActions = document.createElement('div');
  headerActions.style.cssText = 'display:flex;align-items:center;gap:0.4rem;flex-shrink:0;';

  const filterSelect = document.createElement('select');
  filterSelect.style.cssText = 'padding:0.4rem 0.5rem;border:1px solid var(--color-border);border-radius:6px;font-size:0.75rem;background:var(--color-surface);color:var(--color-text);cursor:pointer;';

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = 'padding:0.35rem 0.7rem;border:1px solid var(--color-border);border-radius:6px;font-size:0.72rem;cursor:pointer;background:none;color:var(--color-text-muted);';

  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh';
  refreshBtn.style.cssText = 'padding:0.35rem 0.7rem;border:1px solid var(--color-primary);border-radius:6px;font-size:0.72rem;cursor:pointer;background:var(--color-primary);color:#fff;';

  headerActions.appendChild(filterSelect);
  headerActions.appendChild(clearBtn);
  headerActions.appendChild(refreshBtn);
  header.appendChild(title);
  header.appendChild(headerActions);
  wrapper.appendChild(header);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:0.78rem;color:var(--color-text-muted);min-height:1.2em;';
  wrapper.appendChild(status);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:0.3rem;';
  wrapper.appendChild(list);

  async function populateFilter() {
    const sources = await getLogSources();
    const current = filterSelect.value;
    filterSelect.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All tools';
    filterSelect.appendChild(allOpt);
    for (const s of sources) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      filterSelect.appendChild(opt);
    }
    if (current && sources.includes(current)) filterSelect.value = current;
  }

  async function render() {
    const tool = filterSelect.value || undefined;
    const logs = await getLogs({ tool, limit: 200 });
    status.textContent = `${logs.length} log entr${logs.length === 1 ? 'y' : 'ies'}${tool ? ` from "${tool}"` : ''}`;
    list.innerHTML = '';

    if (logs.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:2rem;text-align:center;font-size:0.85rem;color:var(--color-text-muted);font-style:italic;';
      empty.textContent = 'No logs yet. Use a tool like Barcode Scanner to generate log entries.';
      list.appendChild(empty);
      return;
    }

    for (const entry of logs) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);overflow:hidden;';

      const rowHeader = document.createElement('div');
      rowHeader.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.45rem 0.65rem;cursor:pointer;user-select:none;';
      rowHeader.dataset.expanded = 'false';

      const timeEl = document.createElement('span');
      const d = new Date(entry.ts);
      timeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      timeEl.style.cssText = 'font-size:0.68rem;color:var(--color-text-muted);font-family:monospace;flex-shrink:0;';

      const toolBadge = document.createElement('span');
      toolBadge.textContent = entry.tool;
      toolBadge.style.cssText = 'font-size:0.65rem;padding:1px 5px;border-radius:4px;background:var(--color-bg);color:var(--color-text-muted);font-family:monospace;flex-shrink:0;white-space:nowrap;';

      const typeBadge = document.createElement('span');
      typeBadge.textContent = entry.type;
      const typeColors = {
        api_request: 'background:#e3f2fd;color:#1565c0;',
        api_response: 'background:#e8f5e9;color:#2e7d32;',
        api_error: 'background:#fce4ec;color:#c62828;',
        scan_detected: 'background:#f3e5f5;color:#6a1b9a;',
        camera_start: 'background:#fff3e0;color:#e65100;',
      };
      typeBadge.style.cssText = `font-size:0.65rem;padding:1px 5px;border-radius:4px;font-family:monospace;flex-shrink:0;white-space:nowrap;${typeColors[entry.type] || 'background:var(--color-bg);color:var(--color-text-muted);'}`;

      const summary = document.createElement('span');
      const srcLabel = entry.data?.source || '';
      const statusLabel = entry.data?.summary || entry.data?.statusCode || '';
      summary.textContent = [srcLabel, statusLabel].filter(Boolean).join(' — ');
      summary.style.cssText = 'flex:1;min-width:0;font-size:0.78rem;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

      const durEl = document.createElement('span');
      if (entry.data?.duration != null) {
        durEl.textContent = entry.data.duration + 'ms';
        durEl.style.cssText = 'font-size:0.65rem;color:var(--color-text-muted);font-family:monospace;flex-shrink:0;';
      } else {
        durEl.style.display = 'none';
      }

      const expandArrow = document.createElement('span');
      expandArrow.textContent = '▸';
      expandArrow.style.cssText = 'font-size:0.6rem;color:var(--color-text-muted);transition:transform 0.2s;flex-shrink:0;';

      rowHeader.append(timeEl, toolBadge, typeBadge, summary, durEl, expandArrow);

      const detailBody = document.createElement('div');
      detailBody.style.cssText = 'display:none;flex-direction:column;padding:0.5rem 0.65rem;border-top:1px solid var(--color-border);font-size:0.75rem;gap:0.3rem;';

      if (entry.data) {
        for (const [key, val] of Object.entries(entry.data)) {
          if (val == null || val === '') continue;
          const line = document.createElement('div');
          line.style.cssText = 'display:flex;gap:0.5rem;';
          const kEl = document.createElement('span');
          kEl.textContent = key + ':';
          kEl.style.cssText = 'font-weight:600;color:var(--color-text-muted);flex-shrink:0;min-width:80px;';
          const vEl = document.createElement('span');
          vEl.textContent = typeof val === 'object' ? JSON.stringify(val) : String(val);
          vEl.style.cssText = 'color:var(--color-text);word-break:break-all;font-family:monospace;font-size:0.7rem;';
          line.append(kEl, vEl);
          detailBody.appendChild(line);
        }
      }

      row.append(rowHeader, detailBody);
      list.appendChild(row);

      rowHeader.addEventListener('click', () => {
        const expanded = rowHeader.dataset.expanded === 'true';
        rowHeader.dataset.expanded = expanded ? 'false' : 'true';
        detailBody.style.display = expanded ? 'none' : 'flex';
        expandArrow.style.transform = expanded ? 'rotate(0deg)' : 'rotate(90deg)';
      });
    }
  }

  filterSelect.addEventListener('change', render);
  clearBtn.addEventListener('click', async () => {
    const tool = filterSelect.value || undefined;
    await clearLogs(tool);
    await populateFilter();
    await render();
  });
  refreshBtn.addEventListener('click', async () => {
    await populateFilter();
    await render();
  });

  populateFilter().then(render);

  refreshInterval = setInterval(async () => {
    await populateFilter();
    await render();
  }, 3000);

  return () => {
    if (refreshInterval) clearInterval(refreshInterval);
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = '';
}
