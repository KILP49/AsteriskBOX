'use strict';
// Traffic statistics ledger: daily totals persisted to data/stats.json
const fs = require('fs');
const path = require('path');
const { dataDir } = require('./settings');

const STATS_PATH = () => path.join(dataDir(), 'stats.json');

function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH(), 'utf8'));
  } catch (e) {
    return { days: {} };
  }
}

function save(stats) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(STATS_PATH(), JSON.stringify(stats), 'utf8');
}

function addTraffic(upBytes, downBytes) {
  const stats = load();
  const key = dayKey(Date.now());
  if (!stats.days[key]) stats.days[key] = { up: 0, down: 0 };
  stats.days[key].up += upBytes;
  stats.days[key].down += downBytes;
  // prune old entries (> 400 days)
  const keys = Object.keys(stats.days).sort();
  while (keys.length > 400) {
    delete stats.days[keys.shift()];
  }
  save(stats);
  return stats.days[key];
}

function today() {
  const stats = load();
  return stats.days[dayKey(Date.now())] || { up: 0, down: 0 };
}

function last7Days() {
  const stats = load();
  const out = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(now - i * 86400000);
    out.push({ day: key, ...(stats.days[key] || { up: 0, down: 0 }) });
  }
  return out;
}

function last30Days() {
  const stats = load();
  const out = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(now - i * 86400000);
    out.push({ day: key, ...(stats.days[key] || { up: 0, down: 0 }) });
  }
  return out;
}

module.exports = { addTraffic, today, last7Days, last30Days, dayKey };
