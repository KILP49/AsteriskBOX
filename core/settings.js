'use strict';
// Settings persistence: data/settings.json
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_PATH = () => path.join(dataDir(), 'settings.json');

let _dataDir = DATA_DIR;
function dataDir() { return _dataDir; }
function setDataDir(dir) { _dataDir = dir; }

const DEFAULT_SETTINGS = {
  // 外观
  colorMode: 0,        // 0=跟随系统 1=浅色 2=深色
  seedIndex: 0,        // 强调色 0=默认 1=蓝 2=绿 3=紫 4=黄 5=橙 6=玫红 7=青
  language: 2,         // 0=跟随系统 1=English 2=简体中文
  // 运行
  runMode: 'tun',      // tun=虚拟网卡(推荐) proxy=系统代理
  autoConnect: false,  // 启动后自动开启代理
  // TUN
  tunStack: 'mixed',   // system | gvisor | mixed
  tunMtu: 1500,
  tunIpv4: '172.19.0.1/30',
  tunIpv6: 'fdfe:dcba:9876::1/126',
  enableIpv6: true,
  ipv6Prefer: false,
  enableLocalDns: true,
  vpnDns: '172.19.0.2',
  // 本地代理
  localProxyPort: 3000,
  localProxyListenAll: false,
  localProxyUsername: '',
  localProxyPassword: '',
  // 核心
  coreLogLevel: 'info', // debug | info | warning | error
  clashApiPort: 19090,
  // 嗅探
  snifferEnabled: true,
  snifferProtocols: ['http', 'tls', 'quic'],
  snifferTimeout: '300ms',
  // DNS
  dnsServers: [
    { id: 1, remarks: 'direct', type: 'udp', server: '223.5.5.5' },
    { id: 2, remarks: 'proxy', type: 'tls', server: '1.1.1.1', detour: '__asteriskbox_global__' },
  ],
  dnsFinal: '__asteriskbox_dns_server_2__',
  dnsCacheCapacity: '',
  dnsOptimistic: true,
  dnsTimeout: '10s',
  // 路由
  routeDirectCn: true,        // 中国大陆直连 (geoip-cn + geosite-cn)
  routeGoogleProxy: true,     // Google 走代理 (geosite-google)
  routeBlockAdsDns: false,    // 广告拦截 (DNS rule set)
  routeBlockUdp443: true,     // 屏蔽 UDP 443
  routeRules: [],          // 自定义路由规则 [{type, payload, action: proxy|direct|block}]
  // 系统
  autoStart: false,           // 开机自启
  minimizeToTray: true,
  lastMode: 'Rule',           // 上次使用的模式 (Rule/Global/Direct)
};

function load() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function save(settings) {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2), 'utf8');
}

function update(patch) {
  const cur = load();
  const next = { ...cur, ...patch };
  save(next);
  return next;
}

module.exports = { load, save, update, DEFAULT_SETTINGS, dataDir, setDataDir };
