import { getPref, setPref } from './db.js';

const LOG_KEY = 'tool_logs';
const MAX_LOGS = 1000;

export async function toolLog(tool, type, data) {
  const logs = await getPref(LOG_KEY, []);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    ts: Date.now(),
    tool,
    type,
    data,
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  await setPref(LOG_KEY, logs);
  return entry;
}

export async function getLogs({ tool, type, limit = 200 } = {}) {
  let logs = await getPref(LOG_KEY, []);
  if (tool) logs = logs.filter(l => l.tool === tool);
  if (type) logs = logs.filter(l => l.type === type);
  return logs.slice(0, limit);
}

export async function clearLogs(tool) {
  if (tool) {
    const logs = await getPref(LOG_KEY, []);
    await setPref(LOG_KEY, logs.filter(l => l.tool !== tool));
  } else {
    await setPref(LOG_KEY, []);
  }
}

export async function getLogSources() {
  const logs = await getPref(LOG_KEY, []);
  return [...new Set(logs.map(l => l.tool))].sort();
}
