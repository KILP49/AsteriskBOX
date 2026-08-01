'use strict';
/* Backend bridge. In Electron: window.abx (preload). In plain browser: demo backend. */
const API = { _impl: null };

function api() {
  if (!API._impl) API._impl = (typeof window !== 'undefined' && window.abx) ? new ElectronApi(window.abx) : new DemoApi();
  return API._impl;
}

class ElectronApi {
  constructor(abx) { this.abx = abx; }
  call(method, ...args) { return this.abx[method](...args); }
  on(channel, cb) { return this.abx.on(channel, cb); }
}

/* ---------- demo backend (browser preview) ---------- */
class DemoApi {
  constructor() {
    this.listeners = {};
    this.demo = new DemoState();
  }
  call(method, ...args) {
    const fn = this.demo[method];
    if (!fn) return Promise.reject(new Error(`demo: no ${method}`));
    return Promise.resolve(fn.apply(this.demo, args));
  }
  on(channel, cb) {
    (this.listeners[channel] = this.listeners[channel] || []).push(cb);
    if (channel === 'traffic') this.demo.startTraffic(cb);
    if (channel === 'logs') this.demo.startLogs(cb);
  }
  emit(channel, data) { (this.listeners[channel] || []).forEach((cb) => cb(data)); }
}

class DemoState {
  constructor() {
    this.settings = {
      colorMode: 2, seedIndex: 0, language: 2, runMode: 'tun', autoConnect: false,
      tunStack: 'mixed', tunMtu: 1500, tunIpv4: '172.19.0.1/30', tunIpv6: 'fdfe:dcba:9876::1/126',
      enableIpv6: true, ipv6Prefer: false, enableLocalDns: true, vpnDns: '172.19.0.2',
      localProxyPort: 3000, localProxyListenAll: false, localProxyUsername: '', localProxyPassword: '',
      coreLogLevel: 'info', clashApiPort: 19090, snifferEnabled: true,
      snifferProtocols: ['http', 'tls', 'quic'], snifferTimeout: '300ms',
      dnsServers: [
        { id: 1, remarks: 'direct', type: 'udp', server: '223.5.5.5' },
        { id: 2, remarks: 'proxy', type: 'tls', server: '1.1.1.1', detour: '__asteriskbox_global__' },
      ],
      dnsFinal: '__asteriskbox_dns_server_2__', dnsCacheCapacity: '', dnsOptimistic: true, dnsTimeout: '10s',
      routeDirectCn: true, routeGoogleProxy: true, routeBlockAdsDns: false, routeBlockUdp443: true,
      autoStart: false, minimizeToTray: true,
    };
    this.running = true;
    this.mode = 'Rule';
    this.startedAt = Date.now() - 37 * 60000;
    this.sessionUp = 158 * 1024 * 1024;
    this.sessionDown = 921 * 1024 * 1024;
    this.todayUp = 312 * 1024 * 1024;
    this.todayDown = 2048 * 1024 * 1024;
    this.samples = [];
    for (let i = 0; i < 60; i++) this.samples.push({ up: Math.random() * 200 * 1024, down: Math.random() * 800 * 1024 });
    this.selected = { PROXY: 'HK-01', AUTO: 'US-03' };
    this.delays = {};
    this.connections = [];
    const targets = ['example.com:443', 'cdn.cloudflare.com:443', '192.168.1.1:53', 'api.github.com:443', 'www.google.com:443', '1.1.1.1:853'];
    const rules = ['geosite:google', 'geoip:cn', 'default', 'rule-set:geosite-cn', 'final'];
    for (let i = 0; i < 23; i++) {
      this.connections.push({
        id: 'conn-' + i,
        metadata: { source: `192.168.1.${10 + (i % 200)}:${30000 + i * 137}`, destination: targets[i % targets.length], host: targets[i % targets.length] },
        rule: rules[i % rules.length], rulePayload: '',
        chains: ['__asteriskbox_global__', i % 3 === 0 ? 'AUTO' : 'PROXY'],
        upload: Math.floor(Math.random() * 400 * 1024), download: Math.floor(Math.random() * 4 * 1024 * 1024),
        start: Date.now() - Math.floor(Math.random() * 300000),
        outboundType: i % 4 === 0 ? 'Direct' : 'Selector',
      });
    }
    this.daily7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      this.daily7.push({ day: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, up: Math.random() * 400 * 1024 * 1024, down: Math.random() * 3 * 1024 * 1024 * 1024 });
    }
  }

  getAppInfo() {
    return { appVersion: '1.0.0-win', singBoxVersion: '1.14.0-beta.3', dataDir: 'C:\\AsteriskBOX\\data', isAdmin: true, platform: 'win32', demo: true };
  }
  getSettings() { return { ...this.settings }; }
  updateSettings(patch) { Object.assign(this.settings, patch); return { ...this.settings }; }
  getStatus() { return { running: this.running, pid: this.running ? 12345 : null, mode: 'tun', startedAt: this.startedAt, lastError: null, singBoxVersion: '1.14.0-beta.3' }; }
  getConfigs() { return { mode: this.mode, 'mode-list': ['Rule', 'Global', 'Direct'], 'log-level': 'info' }; }
  startProxy() { this.running = true; this.startedAt = Date.now(); return { ok: true }; }
  stopProxy() { this.running = false; return { ok: true }; }
  setMode(mode) { this.mode = mode; return { ok: true }; }

  getProxies() {
    const nodes = [
      { tag: 'HK-01', type: 'vmess', json: { server: 'hk01.example.com', server_port: 443 } },
      { tag: 'HK-02', type: 'trojan', json: { server: 'hk02.example.com', server_port: 443 } },
      { tag: 'JP-01', type: 'vless', json: { server: 'jp01.example.com', server_port: 443 } },
      { tag: 'US-03', type: 'shadowsocks', json: { server: 'us03.example.com', server_port: 8388 } },
      { tag: 'SG-01', type: 'hysteria2', json: { server: 'sg01.example.com', server_port: 8443 } },
      { tag: 'TW-01', type: 'tuic', json: { server: 'tw01.example.com', server_port: 443 } },
    ];
    return {
      GLOBAL: { type: 'Fallback', name: 'GLOBAL', udp: true, now: 'PROXY', all: ['PROXY', 'AUTO', 'HK-01', 'HK-02', 'JP-01', 'US-03', 'SG-01', 'TW-01'] },
      PROXY: { type: 'Selector', name: 'PROXY', udp: true, now: this.selected.PROXY, all: ['HK-01', 'HK-02', 'JP-01', 'US-03', 'SG-01', 'TW-01'] },
      AUTO: { type: 'URLTest', name: 'AUTO', udp: true, now: this.selected.AUTO, all: ['HK-01', 'HK-02', 'JP-01', 'US-03', 'SG-01', 'TW-01'] },
      ...Object.fromEntries(nodes.map((n) => [n.tag, { type: n.type, name: n.tag, udp: true, history: this.delays[n.tag] ? [{ delay: this.delays[n.tag] }] : [] }])),
    };
  }
  testDelay(name) {
    const ms = 60 + Math.floor(Math.random() * 400);
    this.delays[name] = ms;
    return { delay: ms };
  }
  selectOutbound(name, outbound) { this.selected[name] = outbound; return {}; }
  getConnections() {
    return { connections: this.connections, uploadTotal: this.sessionUp, downloadTotal: this.sessionDown };
  }
  closeConnection(id) { this.connections = this.connections.filter((c) => c.id !== id); return {}; }
  closeAllConnections() { this.connections = []; return {}; }
  getRules() {
    return { rules: [
      { type: 'sniff', payload: '' },
      { type: 'hijack-dns', payload: '' },
      { type: 'clash_mode', payload: 'Direct' },
      { type: 'clash_mode', payload: 'Global' },
      { type: 'rule-set', payload: 'geosite:google' },
      { type: 'rule-set', payload: 'geoip:cn' },
      { type: 'network', payload: 'udp:443' },
      { type: 'clash_mode', payload: 'Rule' },
    ] };
  }
  getProfile() {
    return {
      subscriptions: [
        { id: 'sub-1', url: 'https://example.com/sub?token=****', name: '机场A', lastUpdatedAt: Date.now() - 86400000 * 2 },
        { id: 'sub-2', url: 'https://cdn.example.net/api/v1/client/subscribe?token=****', name: '机场B', lastUpdatedAt: Date.now() - 86400000 * 5 },
      ],
      outbounds: [
        { tag: 'HK-01', type: 'vmess', subscriptionId: 'sub-1' },
        { tag: 'HK-02', type: 'trojan', subscriptionId: 'sub-1' },
        { tag: 'JP-01', type: 'vless', subscriptionId: 'sub-1' },
        { tag: 'US-03', type: 'shadowsocks', subscriptionId: 'sub-2' },
        { tag: 'SG-01', type: 'hysteria2', subscriptionId: 'sub-2' },
        { tag: 'TW-01', type: 'tuic', subscriptionId: 'sub-2' },
      ],
      groups: [
        { tag: 'PROXY', type: 'selector', subscriptionId: 'sub-1' },
        { tag: 'AUTO', type: 'urltest', subscriptionId: 'sub-2' },
      ],
    };
  }
  addSubscription() { return this.getProfile(); }
  updateSubscription() { return this.getProfile(); }
  removeSubscription() { return this.getProfile(); }
  importText() { return this.getProfile(); }
  updateOutbound() { return this.getProfile(); }
  deleteOutbound() { return this.getProfile(); }
  getResourceStatus() {
    return {
      core: { name: 'sing-box', version: '1.14.0-beta.3', file: 'sing-box.exe', ready: true, size: 78528000 },
      files: [
        { name: 'geoip-cn.srs', ready: true, size: 33920, updatedAt: Date.now() - 86400000 * 3, source: 'sing-geoip' },
        { name: 'geosite-cn.srs', ready: true, size: 54190, updatedAt: Date.now() - 86400000 * 3, source: 'sing-geosite' },
        { name: 'geosite-google.srs', ready: true, size: 7741, updatedAt: Date.now() - 86400000 * 3, source: 'sing-geosite' },
        { name: 'geosite-category-ads-all.srs', ready: true, size: 8198, updatedAt: Date.now() - 86400000 * 3, source: 'sing-geosite' },
      ],
    };
  }
  updateResources() { return { ok: true }; }
  getCoreLogs() {
    return [
      { type: 'info', payload: 'sing-box 1.14.0-beta.3 started' },
      { type: 'info', payload: 'clash api listening at 127.0.0.1:19090' },
      { type: 'info', payload: 'tun interface asterisk0 created' },
    ];
  }
  getDailyStats() { return { today: { up: this.todayUp, down: this.todayDown }, last7: this.daily7, last30: [...this.daily7, ...this.daily7] }; }
  getNetworkInfo() {
    return { ipv4: ['192.168.1.100', '10.0.0.5'], ipv6: ['fe80::1234:5678:9abc:def0'], gateway: '192.168.1.1', dns: ['192.168.1.1'] };
  }
  getProcessStats() { return { cpuPercent: 2.4, memoryBytes: 96 * 1024 * 1024, pid: 12345 }; }
  exportLogs() { return { ok: true }; }
  openDataFolder() { return { ok: true }; }

  startTraffic(cb) {
    this._trafficTimer = setInterval(() => {
      const up = Math.random() * 180 * 1024;
      const down = Math.random() * 900 * 1024;
      this.sessionUp += up; this.sessionDown += down;
      this.todayUp += up; this.todayDown += down;
      this.samples.push({ up, down });
      if (this.samples.length > 60) this.samples.shift();
      cb({
        up, down, totalUp: this.sessionUp, totalDown: this.sessionDown,
        samples: [...this.samples], today: { up: this.todayUp, down: this.todayDown },
        running: this.running,
      });
    }, 1000);
  }
  startLogs(cb) {
    const msgs = ['[tun] packet routed', '[outbound] dial tcp 1.2.3.4:443', '[dns] query example.com', '[rule] matched geosite:google'];
    this._logTimer = setInterval(() => {
      cb({ type: 'info', payload: msgs[Math.floor(Math.random() * msgs.length)] });
    }, 2500);
  }
}
