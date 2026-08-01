'use strict';
/* utils: formatting + dom helpers */
function fmtBytes(bytes, keepTrailingZero = true) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '—';
  if (bytes < 0) bytes = 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  let s;
  if (i === 0) s = `${Math.round(v)}`;
  else if (v >= 100) s = v.toFixed(0);
  else if (v >= 10) s = v.toFixed(1);
  else s = v.toFixed(2);
  if (!keepTrailingZero) s = s.replace(/\.0+$/, '');
  return `${s} ${units[i]}`;
}

function fmtSpeed(bps) {
  if (bps === null || bps === undefined) return '—';
  return fmtBytes(bps) + '/s';
}

function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return t('seconds', s);
  if (s < 3600) return t('minutes', Math.floor(s / 60));
  return t('hours', Math.floor(s / 3600), Math.floor((s % 3600) / 60));
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function icon(name, cls = '') {
  return el('span', { class: `msr ${cls}`, text: name });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function uid() {
  return 'id-' + Math.random().toString(36).slice(2, 10);
}
