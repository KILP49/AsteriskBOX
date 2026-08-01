'use strict';
// sing-box config compiler for Windows — mirrors AsteriskBOX Android compiler
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { dataDir } = require('./settings');

const TAGS = {
  GLOBAL: '__asteriskbox_global__',
  LOCAL: '__asteriskbox_local__',
  TUN: '__asteriskbox_tun__',
  DIRECT: '__asteriskbox_direct__',
  DNS1: '__asteriskbox_dns_server_1__',
  DNS2: '__asteriskbox_dns_server_2__',
  RS_GOOGLE: '__asteriskbox_rule_set_geositegoogle__',
  RS_CN: '__asteriskbox_rule_set_geositecn__',
  RS_GEOIP_CN: '__asteriskbox_rule_set_geoipcn__',
  RS_ADS: '__asteriskbox_rule_set_geositecategoryadsall__',
};

function ruleSetPath(name) {
  return path.join(dataDir(), name).replace(/\\/g, '/');
}

function compile(settings, profile) {
  const outbounds = profileOutbounds(profile);
  const groups = profileGroups(profile, outbounds);

  // ---- outbounds list ----
  const outboundList = [];
  outbounds.forEach((o) => outboundList.push(o.json));
  outboundList.push({ type: 'direct', tag: TAGS.DIRECT });
  outboundList.push({ type: 'block', tag: 'block' });
  groups.forEach((g) => outboundList.push(g.json));
  outboundList.push({
    type: 'selector', tag: TAGS.GLOBAL,
    outbounds: [TAGS.DIRECT, ...groups.map((g) => g.tag)],
    default: groups.length ? groups[0].tag : TAGS.DIRECT,
    interrupt_exist_connections: true,
  });

  // ---- DNS ----
  const dnsEnabled = settings.enableLocalDns;
  const dns = dnsEnabled ? compileDns(settings, groups) : null;

  // ---- route ----
  const ruleSets = [];
  if (settings.routeGoogleProxy) {
    ruleSets.push({ type: 'local', tag: TAGS.RS_GOOGLE, format: 'binary', path: ruleSetPath('geosite-google.srs') });
  }
  if (settings.routeDirectCn) {
    ruleSets.push({ type: 'local', tag: TAGS.RS_CN, format: 'binary', path: ruleSetPath('geosite-cn.srs') });
    ruleSets.push({ type: 'local', tag: TAGS.RS_GEOIP_CN, format: 'binary', path: ruleSetPath('geoip-cn.srs') });
  }
  if (settings.routeBlockAdsDns) {
    ruleSets.push({ type: 'local', tag: TAGS.RS_ADS, format: 'binary', path: ruleSetPath('geosite-category-ads-all.srs') });
  }

  const rules = [];
  rules.push({ action: 'sniff' });
  if (dnsEnabled) rules.push({ port: 53, action: 'hijack-dns' });
  // mode rules: Direct / Global route everything
  rules.push({ clash_mode: 'Direct', action: 'route', outbound: TAGS.DIRECT });
  rules.push({ clash_mode: 'Global', action: 'route', outbound: TAGS.GLOBAL });
  // rule-mode rules
  if (settings.routeGoogleProxy) {
    rules.push({ rule_set: [TAGS.RS_GOOGLE], action: 'route', outbound: TAGS.GLOBAL });
  }
  if (settings.routeDirectCn) {
    rules.push({ rule_set: [TAGS.RS_GEOIP_CN, TAGS.RS_CN], action: 'route', outbound: TAGS.DIRECT });
  }
  if (settings.routeBlockUdp443) {
    rules.push({ network: ['udp'], port: 443, action: 'reject' });
  }
  // user-defined rules (editable in Routing -> rules)
  (settings.routeRules || []).forEach((r) => {
    const rule = { type: r.type, payload: r.payload };
    if (r.action === 'block') {
      rule.action = 'reject';
    } else {
      rule.action = 'route';
      rule.outbound = r.action === 'direct' ? TAGS.DIRECT : TAGS.GLOBAL;
    }
    rules.push(rule);
  });
  const ruleFinal = groups.length ? groups[0].tag : TAGS.DIRECT;
  rules.push({ clash_mode: 'Rule', action: 'route', outbound: ruleFinal });

  const route = {
    rule_set: ruleSets,
    rules,
    final: TAGS.GLOBAL,
  };
  if (dns) route.default_domain_resolver = TAGS.DNS1;

  // ---- inbounds ----
  const inbounds = [];
  if (settings.runMode === 'tun') {
    const tun = {
      type: 'tun',
      tag: TAGS.TUN,
      auto_route: true,
      strict_route: false,
      mtu: settings.tunMtu,
      address: [settings.tunIpv4],
      stack: settings.tunStack,
    };
    if (settings.enableIpv6) tun.address.push(settings.tunIpv6);
    if (dnsEnabled) {
      tun.dns_mode = 'hijack';
      const dnsAddress = [settings.vpnDns];
      if (settings.enableIpv6) dnsAddress.push('fdfe:dcba:9876::2');
      tun.dns_address = dnsAddress;
    } else {
      tun.dns_mode = 'disabled';
    }
    inbounds.push(tun);
  }
  const local = {
    type: 'mixed',
    tag: TAGS.LOCAL,
    listen: settings.localProxyListenAll ? '0.0.0.0' : '127.0.0.1',
    listen_port: settings.localProxyPort,
  };
  if (settings.localProxyUsername) {
    local.users = [{ username: settings.localProxyUsername, password: settings.localProxyPassword }];
  }
  inbounds.push(local);

  // ---- experimental ----
  const secret = crypto.randomBytes(12).toString('hex');
  const experimental = {
    cache_file: {
      enabled: true,
      path: path.join(dataDir(), 'cache.db').replace(/\\/g, '/'),
    },
    clash_api: {
      external_controller: `127.0.0.1:${settings.clashApiPort}`,
      secret,
      default_mode: settings.lastMode || 'Rule',
    },
  };

  return {
    log: {
      level: settings.coreLogLevel,
      timestamp: true,
      output: path.join(dataDir(), 'logs', 'core.log').replace(/\\/g, '/'),
    },
    dns,
    inbounds,
    outbounds: outboundList,
    route,
    experimental,
  };
}

function compileDns(settings, groups) {
  const servers = settings.dnsServers.map((s) => {
    const json = { type: s.type, tag: `__asteriskbox_dns_server_${s.id}__`, server: s.server };
    if (s.serverPort) json.server_port = parseInt(s.serverPort, 10);
    if (s.path) json.path = s.path;
    if (s.detour) json.detour = s.detour;
    return json;
  });
  if (!servers.length) {
    servers.push({ type: 'udp', tag: TAGS.DNS1, server: '223.5.5.5' });
  }
  const tags = servers.map((s) => s.tag);
  const final = tags.includes(settings.dnsFinal) ? settings.dnsFinal : tags[0];
  const rules = [];
  if (settings.routeGoogleProxy) {
    rules.push({ rule_set: [TAGS.RS_GOOGLE], server: tags[tags.length - 1] });
  }
  if (settings.routeDirectCn) {
    rules.push({ rule_set: [TAGS.RS_CN], server: tags[0] });
  }
  if (settings.routeBlockAdsDns) {
    rules.push({ rule_set: [TAGS.RS_ADS], server: tags[tags.length - 1], action: 'reject' });
  }
  const dns = {
    servers,
    rules,
    final,
    strategy: settings.ipv6Prefer ? 'prefer_ipv6' : (settings.enableIpv6 ? 'prefer_ipv4' : 'ipv4_only'),
  };
  if (settings.dnsCacheCapacity) dns.cache_capacity = parseInt(settings.dnsCacheCapacity, 10);
  if (settings.dnsOptimistic) dns.optimistic = true;
  if (settings.dnsTimeout) dns.timeout = settings.dnsTimeout;
  return dns;
}

function profileOutbounds(profile) {
  const list = profile && Array.isArray(profile.outbounds) ? profile.outbounds : [];
  return list
    .filter((o) => o && o.tag && o.json)
    .map((o) => {
      const json = JSON.parse(JSON.stringify(o.json));
      // reality requires uTLS (sing-box 1.11+)
      if (json.tls && json.tls.reality && json.tls.reality.enabled && !json.tls.utls) {
        json.tls.utls = { enabled: true, fingerprint: 'chrome' };
      }
      return { ...o, json };
    });
}

function profileGroups(profile, outbounds) {
  const groups = profile && Array.isArray(profile.groups) ? profile.groups : [];
  const tags = outbounds.map((o) => o.tag);
  return groups
    .filter((g) => g && g.enabled !== false)
    .map((g) => {
      const members = (g.outbounds || []).filter((t) => tags.includes(t));
      const json = {
        type: g.type === 'urltest' ? 'urltest' : 'selector',
        tag: g.tag,
        outbounds: members,
        interrupt_exist_connections: true,
      };
      if (g.type === 'urltest') {
        json.url = g.url || 'http://www.gstatic.com/generate_204';
        json.interval = g.interval || '3m';
        if (g.tolerance) json.tolerance = g.tolerance;
      } else {
        json.default = members.includes(g.default) ? g.default : (members[0] || '');
      }
      return { tag: g.tag, json };
    })
    .filter((g) => g.json.outbounds.length > 0);
}

module.exports = { compile, TAGS };
