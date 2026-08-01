'use strict';
/* AsteriskBOX for Windows — Electron main process */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settingsModule = require('./core/settings');
const { Engine } = require('./core/engine');
const { ClashApi } = require('./core/clashapi');
const stats = require('./core/stats');
const profiles = require('./core/profiles');
const { isAdmin, processStats, cpuPercent, networkInfo } = require('./core/system');

// portable data dir: next to the exe
function resolveDataDir() {
  const exeDir = path.dirname(process.execPath);
  const dataDir = path.join(exeDir, 'data');
  return dataDir;
}

let mainWindow = null;
let tray = null;
let engine = null;
let apiSecret = null;
let trafficTimer = null;
let connTimer = null;
let statsTimer = null;
let cpuPrev = null;
let isQuitting = false;

const DATA_DIR = resolveDataDir();
settingsModule.setDataDir(DATA_DIR);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'AsteriskBOX',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#1c1b1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('close', (e) => {
    const s = settingsModule.load();
    if (!isQuitting && s.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (process.platform === 'win32') {
    image = image.resize({ width: 16, height: 16 });
  }
  tray = new Tray(image);
  tray.setToolTip('AsteriskBOX');
  updateTrayMenu();
  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const running = engine && engine.running;
  const i18n = settingsModule.load().language === 1 ? 'en' : 'zh';
  const t = (zh, en) => (i18n === 'en' ? en : zh);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('切换代理', 'Toggle proxy'), click: () => toggleProxy() },
    { type: 'separator' },
    { label: t('打开 AsteriskBOX', 'Open AsteriskBOX'), click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: t('退出', 'Quit'), click: () => { isQuitting = true; app.quit(); } },
  ]));
}

async function toggleProxy() {
  const s = settingsModule.load();
  const profile = profiles.load();
  if (engine && engine.running) {
    await engine.stop();
  } else {
    const res = await engine.start(s, profile);
    if (!res.ok) {
      if (res.hint) shell.showMessageBox(mainWindow, { type: 'error', title: 'AsteriskBOX', message: res.hint });
    }
  }
  updateTrayMenu();
}

/* ---------------- engine lifecycle ---------------- */
async function startProxy(settingsOverride) {
  const s = settingsOverride || settingsModule.load();
  const profile = profiles.load();
  if (engine.running) return { ok: true, already: true };
  const res = await engine.start(s, profile);
  if (res.ok) {
    apiSecret = engine.api ? engine.api.secret : null;
    startTrafficLoop();
    startConnectionLoop();
  }
  updateTrayMenu();
  return res;
}

async function stopProxy() {
  const res = await engine.stop();
  stopLoops();
  updateTrayMenu();
  return res;
}

function stopLoops() {
  if (trafficTimer) { clearInterval(trafficTimer); trafficTimer = null; }
  if (connTimer) { clearInterval(connTimer); connTimer = null; }
  if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
  cpuPrev = null;
}

function startTrafficLoop() {
  if (trafficTimer) clearInterval(trafficTimer);
  let sessionUp = 0, sessionDown = 0;
  trafficTimer = setInterval(async () => {
    if (!engine.api) return;
    try {
      const t = await engine.api.get('/traffic-now');
      // not a real endpoint; real data comes from SSE below
    } catch (e) { /* */ }
  }, 60000);
  // SSE stream for real-time traffic
  (async () => {
    if (!engine.api) return;
    try {
      await engine.api.stream('/traffic', async (d) => {
        const up = d.up || 0, down = d.down || 0;
        sessionUp += up; sessionDown += down;
        const today = stats.addTraffic(up, down);
        const samples = globalTrafficSamples;
        samples.push({ up, down });
        if (samples.length > 60) samples.shift();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('traffic', {
            up, down, totalUp: sessionUp, totalDown: sessionDown,
            samples: [...samples], today,
            running: true,
          });
        }
      }, () => { /* stream ended */ });
    } catch (e) { /* engine stopped */ }
  })();
}

const globalTrafficSamples = [];

function startConnectionLoop() {
  if (connTimer) clearInterval(connTimer);
  connTimer = setInterval(async () => {
    if (!engine.api) return;
    try {
      const data = await engine.api.connections();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connections', data);
      }
    } catch (e) { /* */ }
    try {
      const pid = engine.status.pid;
      if (pid) {
        const mem = await processStats(pid);
        const cpu = await cpuPercent(pid, cpuPrev);
        cpuPrev = cpu.next;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('process-stats', { memoryBytes: mem.memoryBytes, cpuPercent: cpu.cpuPercent, pid });
        }
      }
    } catch (e) { /* */ }
  }, 2000);
}

function startLogsLoop() {
  if (!engine.api) return;
  (async () => {
    try {
      await engine.api.stream('/logs?level=debug', (line) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('logs', { ...line, ts: Date.now() });
        }
      }, () => { /* ended */ });
    } catch (e) { /* */ }
  })();
}

/* ---------------- IPC ---------------- */
function registerIpc() {
  ipcMain.handle('getAppInfo', () => ({
    appVersion: app.getVersion(),
    singBoxVersion: '1.14.0-beta.3',
    dataDir: DATA_DIR,
    isAdmin: isAdminSync(),
    platform: process.platform,
    locale: app.getLocale(),
  }));

  ipcMain.handle('getSettings', () => settingsModule.load());
  ipcMain.handle('updateSettings', async (e, patch) => {
    const next = settingsModule.update(patch);
    // apply auto-start
    if ('autoStart' in patch) {
      app.setLoginItemSettings({ openAtLogin: !!patch.autoStart, path: process.execPath });
    }
    // if runMode changed while running, restart
    if (('runMode' in patch || 'localProxyPort' in patch || 'tunStack' in patch || 'tunMtu' in patch) && engine && engine.running) {
      const profile = profiles.load();
      const res = await engine.restart(next, profile);
      if (res.ok) { apiSecret = engine.api ? engine.api.secret : null; }
    }
    return next;
  });

  ipcMain.handle('getStatus', () => ({
    running: engine ? engine.running : false,
    pid: engine && engine.status.pid,
    mode: engine && engine.status.mode,
    startedAt: engine && engine.status.startedAt,
    lastError: engine && engine.status.lastError,
    singBoxVersion: '1.14.0-beta.3',
  }));

  ipcMain.handle('getConfigs', async () => {
    if (!engine || !engine.api) throw new Error('not running');
    return engine.api.configs();
  });

  ipcMain.handle('startProxy', () => startProxy());
  ipcMain.handle('stopProxy', () => stopProxy());
  ipcMain.handle('restartProxy', async () => {
    const s = settingsModule.load();
    const profile = profiles.load();
    await engine.restart(s, profile);
    updateTrayMenu();
    return { ok: engine.running };
  });

  ipcMain.handle('setMode', async (e, mode) => {
    // store mode even if not running, apply on start
    if (engine && engine.api) {
      try { await engine.api.setMode(mode); } catch (err) { /* best effort */ }
    }
    // persist mode in settings so it survives restarts
    settingsModule.update({ lastMode: mode });
    return { ok: true };
  });

  ipcMain.handle('getProxies', async () => {
    if (!engine || !engine.api) throw new Error('not running');
    return engine.api.proxies();
  });
  ipcMain.handle('testDelay', async (e, name, url, timeout) => {
    if (!engine || !engine.api) throw new Error('not running');
    const res = await engine.api.delay(name, url || 'http://www.gstatic.com/generate_204', timeout || 5000);
    return res;
  });
  ipcMain.handle('selectOutbound', async (e, name, outbound) => {
    if (!engine || !engine.api) throw new Error('not running');
    return engine.api.select(name, outbound);
  });

  ipcMain.handle('getConnections', async () => {
    if (!engine || !engine.api) throw new Error('not running');
    return engine.api.connections();
  });
  ipcMain.handle('closeConnection', async (e, id) => {
    if (!engine || !engine.api) throw new Error('not running');
    return engine.api.closeConnection(id);
  });
  ipcMain.handle('closeAllConnections', async () => {
    if (!engine || !engine.api) throw new Error('not running');
    return engine.api.closeAllConnections();
  });

  ipcMain.handle('getRules', async () => {
    if (!engine || !engine.api) throw new Error('not running');
    return engine.api.rules();
  });

  ipcMain.handle('getProfile', () => profiles.load());
  ipcMain.handle('addSubscription', async (e, url, name, replace) => {
    const p = await profiles.importSubscription(url, { name, replace });
    return p;
  });
  ipcMain.handle('updateSubscription', async (e, id) => {
    const profile = profiles.load();
    const sub = profile.subscriptions.find((s) => s.id === id);
    if (!sub) throw new Error('not found');
    return profiles.importSubscription(sub.url, { name: sub.name, userAgent: sub.userAgent, replace: true });
  });
  ipcMain.handle('removeSubscription', (e, id) => profiles.removeSubscription(id));
  ipcMain.handle('importText', (e, text, replace) => profiles.importText(text, { replace }));
  ipcMain.handle('updateOutbound', (e, tag, json) => profiles.updateOutbound(tag, json));
  ipcMain.handle('deleteOutbound', (e, tag) => profiles.removeOutbound(tag));

  ipcMain.handle('getResourceStatus', () => {
    const dir = DATA_DIR;
    const files = ['geoip-cn.srs', 'geosite-cn.srs', 'geosite-google.srs', 'geosite-category-ads-all.srs'];
    return {
      core: {
        name: 'sing-box', version: '1.14.0-beta.3', file: 'sing-box.exe',
        ready: fs.existsSync(path.join(dir, 'sing-box.exe')),
        size: fs.existsSync(path.join(dir, 'sing-box.exe')) ? fs.statSync(path.join(dir, 'sing-box.exe')).size : 0,
      },
      files: files.map((f) => {
        const p = path.join(dir, f);
        const exists = fs.existsSync(p);
        return { name: f, ready: exists, size: exists ? fs.statSync(p).size : 0, updatedAt: exists ? fs.statSync(p).mtimeMs : null, source: f.startsWith('geoip') ? 'sing-geoip' : 'sing-geosite' };
      }),
    };
  });
  ipcMain.handle('updateResources', async () => {
    const urls = {
      'geoip-cn.srs': 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs',
      'geosite-cn.srs': 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs',
      'geosite-google.srs': 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs',
      'geosite-category-ads-all.srs': 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs',
    };
    for (const [name, url] of Object.entries(urls)) {
      const target = path.join(DATA_DIR, name);
      const tmp = target + '.tmp';
      await downloadFile(url, tmp);
      fs.renameSync(tmp, target);
    }
    return { ok: true };
  });

  ipcMain.handle('getCoreLogs', () => {
    const logPath = path.join(DATA_DIR, 'logs', 'core.log');
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split(/\r?\n/).filter(Boolean).slice(-300).map((l) => {
        const m = l.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(\w+)\s+(.*)$/);
        return { type: m ? m[2].toLowerCase() : 'info', payload: m ? m[3] : l, ts: m ? new Date(m[1]).getTime() : Date.now() };
      });
      return lines;
    } catch (e) { return []; }
  });

  ipcMain.handle('getDailyStats', () => ({
    today: stats.today(),
    last7: stats.last7Days(),
    last30: stats.last30Days(),
  }));

  ipcMain.handle('getNetworkInfo', () => networkInfo());
  ipcMain.handle('getProcessStats', async () => {
    if (!engine || !engine.status.pid) return { cpuPercent: null, memoryBytes: null, pid: null };
    const pid = engine.status.pid;
    const mem = await processStats(pid);
    const cpu = await cpuPercent(pid, cpuPrev);
    cpuPrev = cpu.next;
    return { cpuPercent: cpu.cpuPercent, memoryBytes: mem.memoryBytes, pid };
  });

  ipcMain.handle('exportLogs', () => {
    const src = path.join(DATA_DIR, 'logs', 'core.log');
    if (!fs.existsSync(src)) return { ok: true };
    const name = `core-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const target = path.join(os.homedir(), 'Desktop', name);
    try {
      fs.copyFileSync(src, target);
      return { ok: true, path: target };
    } catch (e) {
      // fallback: copy into data/logs
      const alt = path.join(DATA_DIR, 'logs', name);
      fs.copyFileSync(src, alt);
      return { ok: true, path: alt };
    }
  });
  ipcMain.handle('openDataFolder', () => shell.openPath(DATA_DIR));
  ipcMain.handle('openExternal', (e, url) => shell.openExternal(url));

  ipcMain.handle('getEngineLog', () => {
    // recent sing-box stderr
    return engine && engine.status.lastError;
  });
}

function downloadFile(url, target) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(target);
    const req = mod.get(url, { headers: { 'User-Agent': 'AsteriskBOX/1.0' }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(target);
        return resolve(downloadFile(res.headers.location, target));
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(target);
        return reject(new Error('HTTP ' + res.statusCode));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    });
    req.on('error', (e) => { file.close(); try { fs.unlinkSync(target); } catch (err) { /* */ } reject(e); });
  });
}

let adminCache = null;
function isAdminSync() {
  if (adminCache !== null) return adminCache;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('net.exe', ['session'], { stdio: 'ignore', windowsHide: true });
    adminCache = true;
  } catch (e) {
    adminCache = false;
  }
  return adminCache;
}

/* ---------------- lifecycle ---------------- */
app.setAppUserModelId('org.asterisk.abox.windows');

app.whenReady().then(async () => {
  engine = new Engine();
  createWindow();
  createTray();
  registerIpc();

  const s = settingsModule.load();
  if (s.autoStart) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }
  if (s.autoConnect) {
    setTimeout(async () => {
      const res = await startProxy(s);
      if (!res.ok && res.hint) {
        shell.showMessageBox(mainWindow, { type: 'error', title: 'AsteriskBOX', message: res.hint });
      }
    }, 1500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else { mainWindow.show(); }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  stopLoops();
  if (engine) engine.stop();
});

app.on('window-all-closed', () => {
  // keep running in tray
});
