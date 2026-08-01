'use strict';
// Windows system helpers: proxy registry, admin check, process stats, network info
const { execFile } = require('child_process');
const os = require('os');

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

const PROXY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

async function setSystemProxy(enabled, port) {
  if (process.platform !== 'win32') return;
  try {
    if (enabled) {
      await run('reg.exe', ['add', PROXY_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
      await run('reg.exe', ['add', PROXY_KEY, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', `127.0.0.1:${port}`, '/f']);
      await run('reg.exe', ['add', PROXY_KEY, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', '<local>', '/f']);
    } else {
      await run('reg.exe', ['add', PROXY_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
    }
  } catch (e) { /* best effort */ }
}

async function isAdmin() {
  if (process.platform !== 'win32') return true;
  const r = await run('net.exe', ['session']);
  return r.err === null;
}

async function processStats(pid) {
  if (process.platform !== 'win32') {
    // linux fallback for dev testing
    try {
      const mem = fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1] * os.pagesize() || null;
      return { memoryBytes: mem, cpuPercent: null };
    } catch (e) { return { memoryBytes: null, cpuPercent: null }; }
  }
  const ps = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty WorkingSetSize`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 10000);
  const memoryBytes = r.err ? null : parseInt(r.stdout, 10);
  return { memoryBytes, cpuPercent: null };
}

async function networkInfo() {
  const interfaces = os.networkInterfaces();
  const ipv4 = [], ipv6 = [];
  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name]) {
      if (addr.internal) continue;
      if (addr.family === 'IPv4') ipv4.push(addr.address);
      else ipv6.push(addr.address);
    }
  }
  return { ipv4, ipv6, gateway: null, dns: [] };
}

async function cpuPercent(pid, prev) {
  // returns {cpuPercent, next} — delta-based CPU usage
  if (process.platform !== 'win32') {
    try {
      const now = Date.now();
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const parts = stat.split(' ');
      const utime = parseInt(parts[13], 10), stime = parseInt(parts[14], 10);
      const total = (utime + stime) / 100; // jiffies -> seconds
      if (prev && prev.recordedAt) {
        const dt = (now - prev.recordedAt) / 1000;
        const cpu = dt > 0 ? ((total - prev.total) / dt) * 100 : 0;
        return { cpuPercent: Math.max(0, Math.min(cpu, 100 * os.cpus().length)), next: { total, recordedAt: now } };
      }
      return { cpuPercent: null, next: { total, recordedAt: now } };
    } catch (e) {
      return { cpuPercent: null, next: prev };
    }
  }
  const ps = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object KernelModeTime,UserModeTime`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 10000);
  if (r.err) return { cpuPercent: null, next: prev };
  const parts = r.stdout.split(/\s+/);
  const now = Date.now();
  const total = (parseInt(parts[0], 10) + parseInt(parts[1], 10)) / 1e7; // 100ns units -> seconds
  if (prev && prev.recordedAt) {
    const dt = (now - prev.recordedAt) / 1000;
    const cpu = dt > 0 ? ((total - prev.total) / dt) * 100 : 0;
    return { cpuPercent: Math.max(0, Math.min(cpu, 100 * os.cpus().length)), next: { total, recordedAt: now } };
  }
  return { cpuPercent: null, next: { total, recordedAt: now } };
}

module.exports = { setSystemProxy, isAdmin, processStats, networkInfo, cpuPercent, run };
