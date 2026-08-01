'use strict';
/* Canvas charts — styled after the Android app's Compose Canvas drawings */
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(2, Math.round(rect.width * dpr));
  canvas.height = Math.max(2, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function drawLineChart(canvas, series, opts = {}) {
  // series: [{name, color, values:[...]}]
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const pad = opts.pad ?? 2;
  const baseline = h - 2;
  const maxValue = opts.maxValue ?? Math.max(1, ...series.flatMap((s) => s.values), 1);
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const step = (w - pad * 2) / (n - 1);
  const yFor = (v) => baseline - Math.min(1, Math.max(0, v / maxValue)) * (baseline - pad);

  // baseline
  ctx.strokeStyle = opts.baselineColor || getCssVar('--m3-outline-variant');
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pad, baseline);
  ctx.lineTo(w - pad, baseline);
  ctx.stroke();

  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = opts.lineWidth || 2.5;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = pad + i * step;
      const y = yFor(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function drawBarChart(canvas, items, opts = {}) {
  // items: [{label, up, down}]
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const maxValue = Math.max(1, ...items.flatMap((i) => [i.up, i.down]));
  const slot = w / items.length;
  const barW = Math.min(10, slot * 0.3);
  const upColor = opts.upColor || getCssVar('--m3-tertiary');
  const downColor = opts.downColor || getCssVar('--m3-primary');
  const baseY = h - 2;
  items.forEach((item, i) => {
    const cx = i * slot + slot / 2;
    const upH = (item.up / maxValue) * (h - 4);
    const downH = (item.down / maxValue) * (h - 4);
    ctx.fillStyle = downColor;
    roundRect(ctx, cx - barW, baseY - downH, barW, downH, 3);
    ctx.fill();
    ctx.fillStyle = upColor;
    roundRect(ctx, cx, baseY - upH, barW, upH, 3);
    ctx.fill();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
}

function cssColor(name) {
  const v = getCssVar(name);
  return v.startsWith('#') ? v : `var(${name})`;
}
