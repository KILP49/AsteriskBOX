'use strict';
// Subscription parser: sing-box JSON / Clash YAML / base64 / URI lists -> unified outbounds + groups
const yaml = require('js-yaml');

function parseSubscription(text, sourceName) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty');

  // 1) base64 blob(s)
  if (looksLikeBase64(trimmed)) {
    try {
      const decoded = decodeBase64(trimmed);
      if (decoded && decoded.trim()) {
        const inner = decoded.trim();
        if (inner.startsWith('{')) return parseSingBoxJson(inner, sourceName);
        if (inner.includes('proxies:')) return parseClashYaml(inner, sourceName);
        const uris = inner.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (uris.every(isUri)) return parseUris(uris);
      }
    } catch (e) { /* not base64 */ }
  }
  // 2) JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseSingBoxJson(trimmed, sourceName);
  }
  // 3) YAML
  if (trimmed.includes('proxies:')) {
    return parseClashYaml(trimmed, sourceName);
  }
  // 4) URI list
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.some(isUri)) return parseUris(lines);
  throw new Error('unsupported');
}

function looksLikeBase64(s) {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(s)) return false;
  const compact = s.replace(/\s+/g, '');
  if (compact.length < 20) return false;
  if (compact.includes('://')) return false;
  return compact.length % 4 === 0 || compact.endsWith('=');
}

function decodeBase64(s) {
  const compact = s.replace(/\s+/g, '');
  return Buffer.from(compact, 'base64').toString('utf8');
}

function isUri(line) {
  return /^[a-z0-9+.-]+:\/\//i.test(line);
}

// ---------------- sing-box JSON ----------------
function parseSingBoxJson(text, sourceName) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('json'); }
  const outbounds = Array.isArray(data) ? data : (data.outbounds || []);
  if (!outbounds.length) throw new Error('no-outbounds');
  const result = { outbounds: [], groups: [] };
  for (const o of outbounds) {
    if (!o || typeof o !== 'object') continue;
    if (o.type === 'selector' || o.type === 'urltest') {
      result.groups.push(groupFromSingBox(o));
    } else {
      const tag = o.tag || `node-${result.outbounds.length + 1}`;
      result.outbounds.push({ tag, type: o.type, json: { ...o, tag } });
    }
  }
  if (!result.outbounds.length && !result.groups.length) throw new Error('no-outbounds');
  return result;
}

function groupFromSingBox(g) {
  return {
    tag: g.tag || 'group',
    type: g.type,
    outbounds: g.outbounds || [],
    default: g.type === 'selector' ? (g.default || (g.outbounds || [])[0] || '') : '',
    url: g.url || 'http://www.gstatic.com/generate_204',
    interval: g.interval || '3m',
    tolerance: g.tolerance || 50,
    enabled: true,
  };
}

// ---------------- Clash YAML ----------------
function parseClashYaml(text, sourceName) {
  let data;
  try { data = yaml.load(text); } catch (e) { throw new Error('yaml'); }
  if (!data || !Array.isArray(data.proxies) || !data.proxies.length) throw new Error('no-proxies');
  const result = { outbounds: [], groups: [] };
  for (const p of data.proxies) {
    try {
      const o = clashProxyToSingBox(p);
      if (o) result.outbounds.push(o);
    } catch (e) { /* skip unsupported */ }
  }
  if (data['proxy-groups']) {
    for (const g of data['proxy-groups']) {
      const type = g.type === 'url-test' || g.type === 'load-balance' ? 'urltest' : (g.type === 'select' ? 'selector' : null);
      if (!type) continue;
      const outbounds = (g.proxies || []).filter((t) =>
        result.outbounds.some((o) => o.tag === t) || t === 'DIRECT' || t === 'REJECT'
      ).map((t) => t === 'DIRECT' ? '__asteriskbox_direct__' : t);
      result.groups.push({
        tag: g.name,
        type,
        outbounds,
        default: type === 'selector' ? (outbounds[0] || '') : '',
        url: g.url || 'http://www.gstatic.com/generate_204',
        interval: g.interval || '3m',
        tolerance: g.tolerance || 50,
        enabled: true,
      });
    }
  }
  if (!result.outbounds.length && !result.groups.length) throw new Error('no-proxies');
  return result;
}

function clashProxyToSingBox(p) {
  const tag = p.name || 'node';
  const server = p.server;
  const port = p.port;
  switch (p.type) {
    case 'ss': {
      const json = { type: 'shadowsocks', tag, server, server_port: port, method: p.cipher || 'aes-128-gcm', password: p.password || '' };
      if (p['udp']) json.udp = true;
      if (p.plugin === 'obfs') {
        json.plugin = 'obfs-local';
        json.plugin_opts = `obfs=${p['plugin-opts'] && p['plugin-opts'].mode || 'http'};obfs-host=${p['plugin-opts'] && p['plugin-opts'].host || 'www.bing.com'}`;
      }
      if (p.plugin === 'v2ray-plugin') {
        json.plugin = 'v2ray-plugin';
        const opts = p['plugin-opts'] || {};
        json.plugin_opts = `mode=${opts.mode || 'websocket'};tls=${opts.tls ? 'true' : 'false'}${opts.host ? ';host=' + opts.host : ''}${opts.path ? ';path=' + opts.path : ''}${opts.mux ? ';mux=' + opts.mux : ''}`;
      }
      return { tag, type: 'shadowsocks', json };
    }
    case 'vmess': {
      const json = { type: 'vmess', tag, server, server_port: port, uuid: p.uuid, security: p.cipher || 'auto', alter_id: 0 };
      if (p.network && p.network !== 'tcp') {
        json.network = p.network;
        if (p.network === 'ws') {
          json.transport = { type: 'ws' };
          if (p['ws-opts']) {
            if (p['ws-opts'].path) json.transport.path = p['ws-opts'].path;
            if (p['ws-opts'].headers && p['ws-opts'].headers.Host) json.transport.headers = { Host: p['ws-opts'].headers.Host };
          }
        }
        if (p.network === 'grpc') {
          json.transport = { type: 'grpc' };
          const gopts = p['grpc-opts'] || {};
          if (gopts['grpc-service-name']) json.transport.service_name = gopts['grpc-service-name'];
        }
      }
      if (p.tls) {
        json.tls = { enabled: true, server_name: p.servername || server, insecure: !!p['skip-cert-verify'] };
      }
      return { tag, type: 'vmess', json };
    }
    case 'vless': {
      const json = { type: 'vless', tag, server, server_port: port, uuid: p.uuid, flow: p.flow || '' };
      if (p.network && p.network !== 'tcp') {
        json.network = p.network;
        if (p.network === 'ws') {
          json.transport = { type: 'ws' };
          if (p['ws-opts']) {
            if (p['ws-opts'].path) json.transport.path = p['ws-opts'].path;
            if (p['ws-opts'].headers && p['ws-opts'].headers.Host) json.transport.headers = { Host: p['ws-opts'].headers.Host };
          }
        }
        if (p.network === 'grpc') {
          json.transport = { type: 'grpc' };
          const gopts = p['grpc-opts'] || {};
          if (gopts['grpc-service-name']) json.transport.service_name = gopts['grpc-service-name'];
        }
      }
      if (p.tls) {
        json.tls = { enabled: true, server_name: p.servername || server, insecure: !!p['skip-cert-verify'] };
      }
      if (p.reality) {
        const ropts = p['reality-opts'] || {};
        json.tls = Object.assign(json.tls || {}, {
          reality: { enabled: true, public_key: ropts['public-key'], short_id: ropts['short-id'] },
          utls: { enabled: true, fingerprint: 'chrome' },
        });
      }
      return { tag, type: 'vless', json };
    }
    case 'trojan': {
      const json = { type: 'trojan', tag, server, server_port: port, password: p.password };
      json.tls = { enabled: true, server_name: p.sni || server, insecure: !!p['skip-cert-verify'] };
      if (p.network === 'ws') {
        json.transport = { type: 'ws' };
        if (p['ws-opts']) {
          if (p['ws-opts'].path) json.transport.path = p['ws-opts'].path;
          if (p['ws-opts'].headers && p['ws-opts'].headers.Host) json.transport.headers = { Host: p['ws-opts'].headers.Host };
        }
      }
      if (p['reality-opts'] || p.reality) {
        const ropts = p['reality-opts'] || {};
        json.tls.reality = { enabled: true, public_key: ropts['public-key'], short_id: ropts['short-id'] };
        json.tls.utls = { enabled: true, fingerprint: 'chrome' };
      }
      return { tag, type: 'trojan', json };
    }
    case 'hysteria2': {
      const json = { type: 'hysteria2', tag, server, server_port: port, password: p.password || '' };
      if (p.sni) json.tls = { enabled: true, server_name: p.sni, insecure: !!p['skip-cert-verify'] };
      if (p.obfs) json.obfs = { type: 'salamander', password: p.obfs };
      if (p.up) json.up_mbps = p.up;
      if (p.down) json.down_mbps = p.down;
      return { tag, type: 'hysteria2', json };
    }
    case 'tuic': {
      const json = { type: 'tuic', tag, server, server_port: port, uuid: p.uuid, password: p.password };
      if (p.sni) json.tls = { enabled: true, server_name: p.sni, insecure: !!p['skip-cert-verify'] };
      return { tag, type: 'tuic', json };
    }
    case 'http': {
      const json = { type: 'http', tag, server, server_port: port, username: p.username || '', password: p.password || '' };
      if (p.tls) json.tls = { enabled: true, server_name: p.sni || server, insecure: !!p['skip-cert-verify'] };
      return { tag, type: 'http', json };
    }
    case 'socks5': {
      const json = { type: 'socks', tag, server, server_port: port, username: p.username || '', password: p.password || '' };
      if (p.udp) json.udp = true;
      if (p.tls) json.tls = { enabled: true, server_name: p.sni || server, insecure: !!p['skip-cert-verify'] };
      return { tag, type: 'socks', json };
    }
    case 'wireguard': {
      const json = { type: 'wireguard', tag, server, server_port: port, private_key: p.privateKey || p['private-key'] || '' };
      if (Array.isArray(p.peerPublicKey) || p['public-key']) json.peer_public_key = p['public-key'] || p.peerPublicKey;
      if (p.ip || p.address) json.local_address = [p.ip || p.address].flat();
      if (p.udp) json.udp = true;
      if (p['mtu']) json.mtu = p.mtu;
      return { tag, type: 'wireguard', json };
    }
    default:
      return null;
  }
}

// ---------------- URI lists ----------------
function parseUris(lines) {
  const result = { outbounds: [], groups: [] };
  for (const line of lines) {
    try {
      const o = uriToSingBox(line);
      if (o) result.outbounds.push(o);
    } catch (e) { /* skip */ }
  }
  if (!result.outbounds.length) throw new Error('no-uris');
  return result;
}

function uriToSingBox(uri) {
  const m = uri.match(/^([a-z0-9+.-]+):\/\/(.+)$/i);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const rest = m[2];
  if (scheme === 'vmess') return parseVmess(rest);
  if (scheme === 'vless') return parseVless(rest);
  if (scheme === 'trojan') return parseTrojan(rest);
  if (scheme === 'ss') return parseSs(rest);
  if (scheme === 'hysteria2' || scheme === 'hy2') return parseHysteria2(rest);
  if (scheme === 'tuic') return parseTuic(rest);
  if (scheme === 'wireguard') return parseWireguard(rest);
  return null;
}

function parseVmess(rest) {
  let info;
  try {
    info = JSON.parse(Buffer.from(rest, 'base64').toString('utf8'));
  } catch (e) {
    info = JSON.parse(decodeURIComponent(rest));
  }
  const tag = info.ps || `${info.add}:${info.port}`;
  const json = {
    type: 'vmess', tag, server: info.add, server_port: info.port,
    uuid: info.id, security: info.scy || 'auto', alter_id: info.aid || 0,
  };
  const net = (info.net || 'tcp').toLowerCase();
  if (net !== 'tcp') {
    json.network = net;
    if (net === 'ws') {
      json.transport = { type: 'ws' };
      if (info.path) json.transport.path = info.path;
      if (info.host) json.transport.headers = { Host: info.host };
    }
    if (net === 'grpc') {
      json.transport = { type: 'grpc' };
      if (info.path) json.transport.service_name = info.path;
    }
  }
  if (info.tls === 'tls' || info.sni) {
    json.tls = { enabled: true, server_name: info.sni || info.add, insecure: info.allowInsecure === '1' || !!info.allowInsecure };
  }
  return { tag, type: 'vmess', json };
}

function parseVless(rest) {
  const [userinfo, hostpart] = rest.split('@');
  const [hostport, querypart] = hostpart.split('?');
  const [host, port] = hostport.split(':');
  const frag = rest.includes('#') ? rest.split('#').pop() : '';
  const params = new URLSearchParams(querypart || '');
  const tag = decodeURIComponent(frag) || host;
  const json = { type: 'vless', tag, server: host, server_port: parseInt(port, 10), uuid: userinfo, flow: params.get('flow') || '' };
  const net = (params.get('type') || 'tcp').toLowerCase();
  if (net !== 'tcp') {
    json.network = net;
    if (net === 'ws') {
      json.transport = { type: 'ws' };
      if (params.get('path')) json.transport.path = params.get('path');
      if (params.get('host')) json.transport.headers = { Host: params.get('host') };
    }
    if (net === 'grpc') {
      json.transport = { type: 'grpc' };
      if (params.get('serviceName') || params.get('path')) json.transport.service_name = params.get('serviceName') || params.get('path');
    }
  }
  const security = params.get('security') || '';
  if (security === 'tls' || security === 'reality') {
    json.tls = { enabled: true, server_name: params.get('sni') || host, insecure: params.get('allowInsecure') === '1' };
    if (security === 'reality') {
      json.tls.reality = {
        enabled: true,
        public_key: params.get('pbk') || '',
        short_id: params.get('sid') || '',
      };
      json.tls.utls = { enabled: true, fingerprint: 'chrome' };
    }
  }
  return { tag, type: 'vless', json };
}

function parseTrojan(rest) {
  const [userinfo, hostpart] = rest.split('@');
  const [hostport, querypart] = hostpart.split('?');
  const [host, port] = hostport.split(':');
  const frag = rest.includes('#') ? rest.split('#').pop() : '';
  const params = new URLSearchParams(querypart || '');
  const tag = decodeURIComponent(frag) || host;
  const json = {
    type: 'trojan', tag, server: host, server_port: parseInt(port, 10), password: decodeURIComponent(userinfo),
    tls: { enabled: true, server_name: params.get('sni') || host, insecure: params.get('allowInsecure') === '1' },
  };
  const net = (params.get('type') || '').toLowerCase();
  if (net === 'ws') {
    json.transport = { type: 'ws' };
    if (params.get('path')) json.transport.path = params.get('path');
    if (params.get('host')) json.transport.headers = { Host: params.get('host') };
  }
  if (params.get('pbk')) {
    json.tls.reality = { enabled: true, public_key: params.get('pbk'), short_id: params.get('sid') || '' };
    json.tls.utls = { enabled: true, fingerprint: 'chrome' };
  }
  return { tag, type: 'trojan', json };
}

function parseSs(rest) {
  let body = rest;
  let frag = '';
  if (body.includes('#')) {
    const idx = body.lastIndexOf('#');
    frag = decodeURIComponent(body.slice(idx + 1));
    body = body.slice(0, idx);
  }
  let userinfo, hostport;
  if (body.includes('@')) {
    // SIP002: ss://base64(method:pass)@host:port
    const [ui, hp] = body.split('@');
    userinfo = Buffer.from(ui, 'base64').toString('utf8');
    hostport = hp;
  } else {
    // legacy: ss://base64(method:pass@host:port)
    const decoded = Buffer.from(body, 'base64').toString('utf8');
    [userinfo, hostport] = decoded.split('@');
  }
  const [host, port] = hostport.split(':');
  const lastColon = userinfo.lastIndexOf(':');
  const method = userinfo.slice(0, lastColon);
  const password = decodeURIComponent(userinfo.slice(lastColon + 1));
  const tag = frag || host;
  const json = { type: 'shadowsocks', tag, server: host, server_port: parseInt(port, 10), method, password };
  return { tag, type: 'shadowsocks', json };
}

function parseHysteria2(rest) {
  const [userinfo, hostpart] = rest.split('@');
  const [hostport, querypart] = hostpart.split('?');
  const [host, port] = hostport.split(':');
  const frag = rest.includes('#') ? rest.split('#').pop() : '';
  const params = new URLSearchParams(querypart || '');
  const tag = decodeURIComponent(frag) || host;
  const json = {
    type: 'hysteria2', tag, server: host, server_port: parseInt(port, 10),
    password: userinfo ? decodeURIComponent(userinfo) : '',
  };
  if (params.get('sni') || params.get('peer')) {
    json.tls = { enabled: true, server_name: params.get('sni') || params.get('peer'), insecure: params.get('insecure') === '1' };
  }
  if (params.get('obfs')) json.obfs = { type: 'salamander', password: params.get('obfs') };
  if (params.get('pinSHA256')) json.tls = Object.assign(json.tls || { enabled: true }, { certificate_chain: [] });
  return { tag, type: 'hysteria2', json };
}

function parseTuic(rest) {
  const [userinfo, hostpart] = rest.split('@');
  const [hostport, querypart] = hostpart.split('?');
  const [host, port] = hostport.split(':');
  const frag = rest.includes('#') ? rest.split('#').pop() : '';
  const params = new URLSearchParams(querypart || '');
  const tag = decodeURIComponent(frag) || host;
  const ui = userinfo.split(':');
  const json = {
    type: 'tuic', tag, server: host, server_port: parseInt(port, 10),
    uuid: ui[0], password: ui[1] || '',
    congestion_control: params.get('congestion_control') || 'bbr',
  };
  if (params.get('sni')) json.tls = { enabled: true, server_name: params.get('sni'), insecure: params.get('allowInsecure') === '1' };
  return { tag, type: 'tuic', json };
}

function parseWireguard(rest) {
  const [querypart, frag] = rest.includes('#') ? rest.split('#') : [rest, ''];
  const params = new URLSearchParams(querypart || '');
  const tag = frag ? decodeURIComponent(frag) : 'wireguard';
  const json = {
    type: 'wireguard', tag,
    server: params.get('address') || '',
    server_port: parseInt(params.get('port') || '0', 10),
    private_key: params.get('privateKey') || params.get('private_key') || '',
    peer_public_key: params.get('publicKey') || params.get('peer_public_key') || '',
  };
  if (params.get('ip')) json.local_address = params.get('ip').split(',');
  if (params.get('mtu')) json.mtu = parseInt(params.get('mtu'), 10);
  return { tag, type: 'wireguard', json };
}

module.exports = { parseSubscription, parseSingBoxJson, parseClashYaml, parseUris, uriToSingBox };
