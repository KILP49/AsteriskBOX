'use strict';
// Integration test: compile -> sing-box check (linux binary via glibc loader)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const settings = require('./core/settings');
const { compile } = require('./core/compiler');
const { parseSubscription } = require('./core/parser');

const DATA = '/tmp/sb-test/data';
fs.mkdirSync(DATA, { recursive: true });
// copy rule sets into test data dir
for (const f of ['geosite-google.srs', 'geosite-cn.srs', 'geoip-cn.srs', 'geosite-category-ads-all.srs']) {
  fs.copyFileSync(`/var/minis/workspace/asteriskbox-win/data/${f}`, path.join(DATA, f));
}
settings.setDataDir(DATA);

const s = settings.load();
const profile = {
  outbounds: [
    { tag: 'HK-01', type: 'vmess', json: { type: 'vmess', tag: 'HK-01', server: '1.2.3.4', server_port: 443, uuid: 'abcd-1234', security: 'auto', alter_id: 0, tls: { enabled: true, server_name: 'hk.example.com' } } },
    { tag: 'JP-02', type: 'vless', json: { type: 'vless', tag: 'JP-02', server: '5.6.7.8', server_port: 443, uuid: 'efgh-5678', flow: '', tls: { enabled: true, server_name: 'jp.example.com', reality: { enabled: true, public_key: 'pMzyR2UvIvyn1QLEIR5FYyqicVfXnYn5mULrkeIF7yQ', short_id: '0123456789abcdef' } } } },
    { tag: 'US-03', type: 'shadowsocks', json: { type: 'shadowsocks', tag: 'US-03', server: '9.9.9.9', server_port: 8388, method: 'aes-128-gcm', password: 'secret' } },
  ],
  groups: [
    { tag: 'PROXY', type: 'selector', outbounds: ['HK-01', 'JP-02', 'US-03'], default: 'HK-01', enabled: true },
  ],
};

const config = compile(s, profile);
const cfgPath = '/tmp/sb-test/win-config.json';
fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
console.log('config written:', cfgPath);

const SB = '/opt/singbox/sing-box-1.14.0-beta.3-linux-arm64/sing-box';
const LDR = '/opt/glibc/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1';
const LIBS = '/opt/glibc/lib/aarch64-linux-gnu';
try {
  const out = execFileSync(LDR, ['--library-path', LIBS, SB, 'check', '-c', cfgPath], { encoding: 'utf8' });
  console.log('CHECK OK:', out.trim() || '(no output)');
} catch (e) {
  console.log('CHECK FAILED:', e.stdout || '', e.stderr || '', e.message);
}

// parser tests
const samples = [
  { name: 'vmess uri', text: 'vmess://eyJhZGQiOiIxLjIuMy40IiwicG9ydCI6NDQzLCJpZCI6ImFiY2QtMTIzNCIsInBzIjoiSkstVGVzdCIsIm5ldCI6IndzIiwicGF0aCI6Ii92MnJheSIsImhvc3QiOiJhay5leGFtcGxlLmNvbSIsInRscyI6InRscyJ9' },
  { name: 'vless uri', text: 'vless://abc-123@1.2.3.4:443?type=ws&path=%2Fws&host=cdn.example.com&security=tls&sni=cdn.example.com#VL-Test' },
  { name: 'trojan uri', text: 'trojan://password123@t.example.com:443?sni=t.example.com#TR-Test' },
  { name: 'ss sip002', text: 'ss://YWVzLTEyOC1nY206cGFzc3dvcmQxMjM=@ss.example.com:8388#SS-Test' },
  { name: 'hy2 uri', text: 'hysteria2://pass@hy.example.com:8443?sni=hy.example.com&insecure=1#HY-Test' },
  { name: 'tuic uri', text: 'tuic://uuid:pass@tuic.example.com:443?sni=tuic.example.com#TU-Test' },
];
for (const s of samples) {
  try {
    const r = parseSubscription(s.text);
    console.log(`[ok] ${s.name} -> ${r.outbounds.map(o => o.tag).join(', ')}`);
  } catch (e) {
    console.log(`[FAIL] ${s.name}: ${e.message}`);
  }
}
// sing-box JSON sample
const jsonSample = JSON.stringify({
  outbounds: [
    { type: 'vmess', tag: 'A1', server: '1.1.1.1', server_port: 443, uuid: 'x' },
    { type: 'selector', tag: 'G1', outbounds: ['A1'], default: 'A1' },
  ],
});
try {
  const r = parseSubscription(jsonSample);
  console.log('[ok] sing-box json ->', r.outbounds.map(o=>o.tag), 'groups:', r.groups.map(g=>g.tag));
} catch (e) { console.log('[FAIL] json:', e.message); }
// clash yaml sample
const yamlSample = `proxies:
  - name: C1
    type: ss
    server: c.example.com
    port: 8388
    cipher: aes-128-gcm
    password: pwd
  - name: C2
    type: trojan
    server: c2.example.com
    port: 443
    password: pwd2
    sni: c2.example.com
proxy-groups:
  - name: AUTO
    type: url-test
    proxies: [C1, C2]
    url: http://www.gstatic.com/generate_204
    interval: 300
`;
try {
  const r = parseSubscription(yamlSample);
  console.log('[ok] clash yaml ->', r.outbounds.map(o=>o.tag), 'groups:', r.groups.map(g=>`${g.tag}(${g.type})`));
} catch (e) { console.log('[FAIL] yaml:', e.message); }
