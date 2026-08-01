'use strict';
/* App shell: theme, language, navigation, shared UI components */

const App = {
  settings: null,
  lang: 'zh',
  t: null,
  status: { running: false, pid: null, startedAt: null, lastError: null, singBoxVersion: null },
  runtime: { mode: 'Rule', modeList: ['Rule', 'Global', 'Direct'], logLevel: 'info' },
  traffic: { up: 0, down: 0, totalUp: 0, totalDown: 0, samples: [], today: { up: 0, down: 0 } },
  daily: { today: { up: 0, down: 0 }, last7: [], last30: [] },
  connections: [],
  connStats: { uploadTotal: 0, downloadTotal: 0 },
  processStats: { cpuPercent: null, memoryBytes: null },
  network: { ipv4: [], ipv6: [], gateway: null, dns: [] },
  profile: { subscriptions: [], outbounds: [], groups: [] },
  page: 'home',           // current tab
  stack: [],              // pushed subpages
  routes: {},             // route registry
  navItems: [
    { id: 'home', labelKey: 'nav_dashboard', icon: 'home' },
    { id: 'proxies', labelKey: 'nav_proxies', icon: 'alt_route' },
    { id: 'apps', labelKey: 'nav_apps', icon: 'apps' },
    { id: 'settings', labelKey: 'nav_settings', icon: 'settings' },
  ],
  tick: null,
};

/* ---------------- theme ---------------- */
function applyTheme() {
  const s = App.settings;
  const mode = s.colorMode === 1 ? 'light' : s.colorMode === 2 ? 'dark' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const theme = window.THEMES[s.seedIndex] || window.THEMES[0];
  const scheme = theme[mode];
  const root = document.documentElement;
  // Windows-native UI: neutral surfaces come from CSS; only accent/status colors are theme-driven
  const ACCENT_KEYS = new Set([
    'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
    'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
    'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
    'error', 'onError', 'errorContainer', 'onErrorContainer',
    'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  ]);
  for (const [k, v] of Object.entries(scheme)) {
    if (ACCENT_KEYS.has(k)) {
      root.style.setProperty('--m3-' + k.replace(/([A-Z])/g, '-$1').toLowerCase(), '#' + v);
    }
  }
  document.body.dataset.theme = mode;
}

/* ---------------- language ---------------- */
function resolveLang() {
  const s = App.settings;
  if (s.language === 1) return 'en';
  if (s.language === 2) return 'zh';
  return (navigator.language || 'zh-CN').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/* ---------------- toasts ---------------- */
function toast(msg, isError = false) {
  const root = document.getElementById('toast-root');
  const node = el('div', { class: `toast ${isError ? 'error' : ''}`, text: msg });
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 2600);
}

/* ---------------- dialog ---------------- */
function showDialog({ title, message, confirmText, cancelText, danger = false, onConfirm, input = null }) {
  const backdrop = el('div', { class: 'dialog-backdrop' });
  const body = [el('h3', { text: title })];
  if (message) body.push(el('p', { html: esc(message).replace(/\n/g, '<br>') }));
  let inputVal = '';
  if (input) {
    const field = el('div', { class: 'field' });
    const inp = el('input', {
      type: input.type || 'text', value: input.value || '',
      placeholder: input.placeholder || '',
    });
    inp.addEventListener('input', () => { inputVal = inp.value; });
    field.appendChild(el('label', { text: input.label || '' }));
    field.appendChild(inp);
    body.push(field);
    inputVal = input.value || '';
  }
  const actions = el('div', { class: 'dlg-actions' });
  if (cancelText !== null) {
    actions.appendChild(el('button', { class: 'btn btn-text', text: cancelText || t('common_cancel'), onclick: () => close() }));
  }
  actions.appendChild(el('button', {
    class: `btn ${danger ? 'btn-error' : 'btn-primary'}`, text: confirmText || t('confirm'),
    onclick: () => {
      const v = inputVal;
      close();
      onConfirm && onConfirm(v);
    },
  }));
  body.push(actions);
  const dialog = el('div', { class: 'dialog' }, body);
  backdrop.appendChild(dialog);
  document.getElementById('dialog-root').appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  function close() {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 220);
  }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  if (input) setTimeout(() => backdrop.querySelector('input').focus(), 250);
  return { close };
}

/* ---------------- bottom sheet ---------------- */
function showSheet(title, buildBody, options = {}) {
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const sheet = el('div', { class: 'sheet' }, [
    el('div', { class: 'sheet-handle' }),
    el('div', { class: 'sheet-title', text: title }),
    el('div', { class: 'sheet-body' }),
  ]);
  const bodyEl = sheet.querySelector('.sheet-body');
  const actionsEl = el('div', { class: 'sheet-actions' });
  if (options.actions) options.actions(actionsEl, close);
  else if (options.confirmText) {
    actionsEl.appendChild(el('button', { class: 'btn btn-text', text: t('common_cancel'), onclick: close }));
    actionsEl.appendChild(el('button', { class: 'btn btn-primary', text: options.confirmText, onclick: () => { options.onConfirm && options.onConfirm(); } }));
  }
  sheet.appendChild(actionsEl);
  backdrop.appendChild(sheet);
  document.getElementById('sheet-root').appendChild(backdrop);
  requestAnimationFrame(() => { backdrop.classList.add('show'); sheet.classList.add('show'); });
  buildBody(bodyEl, close);
  function close() {
    backdrop.classList.remove('show');
    sheet.classList.remove('show');
    setTimeout(() => backdrop.remove(), 260);
  }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  return { close, bodyEl };
}

/* ---------------- context menu ---------------- */
function showMenu(x, y, items) {
  const root = document.getElementById('menu-root');
  root.innerHTML = '';
  const menu = el('div', { class: 'menu' });
  for (const it of items) {
    menu.appendChild(el('div', {
      class: 'menu-item',
      onclick: () => { close(); it.onClick && it.onClick(); },
    }, [icon(it.icon || 'chevron_right'), el('span', { text: it.label })]));
  }
  root.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - rect.width - 8) + 'px';
  menu.style.top = Math.min(y, vh - rect.height - 8) + 'px';
  function close() { root.innerHTML = ''; }
  setTimeout(() => document.addEventListener('click', close, { once: true }), 10);
}

/* ---------------- switch component ---------------- */
function makeSwitch(checked, onChange, disabled = false) {
  const wrap = el('label', { class: 'switch' });
  const input = el('input', { type: 'checkbox' });
  input.checked = !!checked;
  if (disabled) input.disabled = true;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);
  wrap.appendChild(el('span', { class: 'track' }));
  wrap.appendChild(el('span', { class: 'thumb' }));
  return wrap;
}

/* ---------------- navigation ---------------- */
function renderNav() {
  const rail = document.getElementById('rail');
  rail.innerHTML = '';
  App.navItems.forEach((item) => {
    const selected = App.stack.length === 0 && App.page === item.id;
    rail.appendChild(el('div', {
      class: `rail-item ${selected ? 'selected' : ''}`,
      onclick: () => goTab(item.id),
    }, [icon(item.icon), el('span', { text: t(item.labelKey) })]));
  });
  const navbar = document.getElementById('navbar');
  navbar.innerHTML = '';
  App.navItems.forEach((item) => {
    const selected = App.stack.length === 0 && App.page === item.id;
    navbar.appendChild(el('div', {
      class: `nav-item ${selected ? 'selected' : ''}`,
      onclick: () => goTab(item.id),
    }, [el('div', { class: 'pill' }), icon(item.icon), el('span', { text: t(item.labelKey) })]));
  });
}

function goTab(id) {
  App.page = id;
  App.stack = [];
  render();
}

function pushRoute(id, params = {}) {
  App.stack.push({ id, params });
  render();
}

function popRoute() {
  if (App.stack.length) App.stack.pop();
  render();
}

/* ---------------- topbar ---------------- */
function renderTopbar() {
  const bar = document.getElementById('topbar');
  bar.innerHTML = '';
  if (App.stack.length) {
    bar.appendChild(el('button', { class: 'icon-btn msr', onclick: popRoute, text: 'arrow_back' }));
  }
  const route = App.stack.length ? App.routes[App.stack[App.stack.length - 1].id] : null;
  const title = route ? route.title() : (App.page === 'home' ? 'AsteriskBOX' : t(App.navItems.find((n) => n.id === App.page).labelKey));
  bar.appendChild(el('div', { class: 'title', text: title }));
  const spacer = el('div', { style: 'flex:1' });
  bar.appendChild(spacer);
  if (route && route.actions) route.actions(bar);
  if (!App.stack.length) {
    if (App.page === 'proxies') {
      bar.appendChild(el('button', {
        class: 'icon-btn msr', title: t('sing_box_proxies_group_test'),
        text: 'speed',
        onclick: () => Pages.proxies.testAll(),
      }));
      bar.appendChild(el('button', {
        class: 'icon-btn msr', title: t('sing_box_proxies_options'),
        text: 'tune',
        onclick: () => Pages.proxies.showOptions(),
      }));
    }
    if (App.page === 'home' && App.status.running) {
      const status = el('div', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--m3-on-surface-variant)' }, [
        el('span', { class: 'dot on' }),
        el('span', { text: t('proxy_control_running') }),
      ]);
      bar.appendChild(status);
    }
  }
}

/* ---------------- main render ---------------- */
function render() {
  applyTheme();
  renderNav();
  renderTopbar();
  const content = document.getElementById('content');
  content.scrollTop = 0;
  // adjust topbar alignment: wide pages use full width, normal pages center
  const topbar = document.getElementById('topbar');
  const isWide = (App.stack.length === 0 && App.page === 'proxies') ||
    (App.stack.length && App.routes[App.stack[App.stack.length - 1].id] && App.routes[App.stack[App.stack.length - 1].id].wide);
  topbar.classList.toggle('wide', !!isWide);
  if (App.stack.length) {
    const route = App.routes[App.stack[App.stack.length - 1].id];
    if (route) content.innerHTML = '';
    if (route) route.render(content, App.stack[App.stack.length - 1].params);
    else content.innerHTML = '<div class="empty">404</div>';
  } else {
    const page = Pages[App.page];
    if (page) {
      content.innerHTML = '';
      page.render(content);
    }
  }
}

/* ---------------- background data loop ---------------- */
async function startDataLoop() {
  const a = api();
  // push channels
  a.on('traffic', (d) => {
    App.traffic = d;
    if (App.page === 'home') Pages.home.onTraffic();
    if (App.stack.length && App.routes.monitor_traffic && App.stack.some((s) => s.id === 'monitor_traffic')) {
      App.routes.monitor_traffic.onData && App.routes.monitor_traffic.onData(d);
    }
  });
  a.on('logs', (line) => {
    App.logLines = App.logLines || [];
    App.logLines.push(line);
    if (App.logLines.length > 2000) App.logLines.splice(0, App.logLines.length - 2000);
    const r = App.routes.core_logs;
    if (App.stack.length && App.stack.some((s) => s.id === 'core_logs') && r && r.onLine) r.onLine(line);
  });

  try {
    const info = await a.call('getAppInfo');
    App.appInfo = info;
    App.settings = await a.call('getSettings');
  } catch (e) {
    App.settings = { colorMode: 0, seedIndex: 0, language: 2, runMode: 'tun', tunStack: 'mixed', tunMtu: 1500, enableIpv6: true, localProxyPort: 3000, coreLogLevel: 'info' };
  }
  App.t = makeT(resolveLang());
  window.t = App.t;
  render();
  window.addEventListener('resize', () => {
    applyTheme();
    document.body.classList.toggle('narrow', window.innerWidth < 880);
  });
  document.body.classList.toggle('narrow', window.innerWidth < 880);

  // periodic poll
  const poll = async () => {
    try {
      const status = await a.call('getStatus');
      App.status = status;
      const profile = await a.call('getProfile');
      App.profile = profile;
      if (status.running) {
        try {
          const cfg = await a.call('getConfigs');
          App.runtime.mode = cfg.mode || App.runtime.mode;
          App.runtime.modeList = cfg['mode-list'] || App.runtime.modeList;
        } catch (e) { /* runtime busy */ }
      }
      const daily = await a.call('getDailyStats');
      App.daily = daily;
      const ps = await a.call('getProcessStats');
      App.processStats = ps;
      const net = await a.call('getNetworkInfo');
      App.network = net;
    } catch (e) { /* */ }
    if (App.page === 'proxies' || (App.stack.length && ['proxies', 'monitor_connections'].includes(App.stack[App.stack.length - 1].id))) {
      await refreshConnections(false);
    }
    if (App.page === 'apps') await refreshConnections(false);
    renderLite();
  };
  poll();
  setInterval(poll, 3000);
}

function renderLite() {
  // refresh only dynamic bits without full re-render
  if (App.page === 'home') Pages.home.renderLite && Pages.home.renderLite();
  if (App.page === 'apps') Pages.apps.renderLite && Pages.apps.renderLite();
}

async function refreshConnections(force) {
  const a = api();
  if (!App.status.running && !force) return;
  try {
    const data = await a.call('getConnections');
    if (data && data.connections) {
      App.connections = data.connections;
      App.connStats = { uploadTotal: data.uploadTotal || 0, downloadTotal: data.downloadTotal || 0 };
    }
  } catch (e) { /* */ }
}

async function setProxyRunning(run) {
  const a = api();
  const wasRunning = App.status.running;
  if (run === wasRunning) return;
  try {
    const res = run ? await a.call('startProxy') : await a.call('stopProxy');
    if (res && res.ok === false) {
      toast(res.error || (run ? t('start_failed') : t('stop_failed')), true);
      if (res.hint) setTimeout(() => showDialog({ title: t('error'), message: res.hint, confirmText: t('confirm') }), 300);
      return;
    }
    toast(run ? t('proxy_service_started') : t('proxy_service_stopped'));
    App.status.running = run;
    if (run) App.status.startedAt = Date.now();
    render();
  } catch (e) {
    toast(run ? t('start_failed') : t('stop_failed'), true);
  }
}

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  startDataLoop();
});
