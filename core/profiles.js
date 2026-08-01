'use strict';
// Profiles store: subscriptions + outbounds + groups (data/profiles.json)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataDir } = require('./settings');
const { parseSubscription } = require('./parser');

const PROFILE_PATH = () => path.join(dataDir(), 'profiles.json');

function emptyProfile() {
  return { version: 1, subscriptions: [], outbounds: [], groups: [] };
}

function load() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH(), 'utf8');
    const p = JSON.parse(raw);
    return { ...emptyProfile(), ...p };
  } catch (e) {
    return emptyProfile();
  }
}

function save(profile) {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROFILE_PATH(), JSON.stringify(profile, null, 2), 'utf8');
}

async function fetchSubscriptionText(url, userAgent) {
  const isHttps = url.startsWith('https://');
  const mod = isHttps ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
      headers: {
        'User-Agent': userAgent || 'AsteriskBOX/1.0 (Windows)',
        'Accept': '*/*',
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchSubscriptionText(res.headers.location, userAgent));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

async function importSubscription(url, options = {}) {
  // options: {replace: boolean, userAgent: string, name: string}
  const text = await fetchSubscriptionText(url, options.userAgent);
  const parsed = parseSubscription(text, url);
  const profile = load();

  const existing = profile.subscriptions.find((s) => s.url === url);
  if (existing) {
    applyParsed(profile, parsed, existing.id, options.replace !== false);
    existing.lastUpdatedAt = Date.now();
    existing.name = options.name || existing.name || url;
  } else {
    const id = crypto.randomUUID();
    profile.subscriptions.push({
      id, url, name: options.name || url,
      userAgent: options.userAgent || '',
      lastUpdatedAt: Date.now(),
      enabled: true,
    });
    applyParsed(profile, parsed, id, options.replace !== false);
  }
  save(profile);
  return profile;
}

function applyParsed(profile, parsed, subscriptionId, replace) {
  const fromThis = replace
    ? profile.outbounds.filter((o) => o.subscriptionId !== subscriptionId)
    : profile.outbounds;
  const tags = new Set(fromThis.map((o) => o.tag));
  const merged = [...fromThis];
  const seen = new Set(tags);
  for (const o of parsed.outbounds) {
    if (seen.has(o.tag)) {
      const idx = merged.findIndex((x) => x.tag === o.tag);
      merged[idx] = { ...o, subscriptionId };
    } else {
      seen.add(o.tag);
      merged.push({ ...o, subscriptionId });
    }
    o.subscriptionId = subscriptionId;
  }
  profile.outbounds = merged;
  if (replace) {
    profile.groups = profile.groups.filter((g) => g.subscriptionId !== subscriptionId);
  }
  const groupTags = new Set(profile.groups.map((g) => g.tag));
  for (const g of parsed.groups) {
    if (!groupTags.has(g.tag)) {
      profile.groups.push({ ...g, subscriptionId });
      groupTags.add(g.tag);
    }
  }
}

function importText(text, options = {}) {
  // options: {replace: boolean, name: string}
  const parsed = parseSubscription(text, options.name || 'clipboard');
  const profile = load();
  const sid = options.subscriptionId || `local-${Date.now()}`;
  applyParsed(profile, parsed, sid, options.replace !== false);
  save(profile);
  return profile;
}

function removeSubscription(id) {
  const profile = load();
  profile.subscriptions = profile.subscriptions.filter((s) => s.id !== id);
  profile.outbounds = profile.outbounds.filter((o) => o.subscriptionId !== id);
  profile.groups = profile.groups.filter((g) => g.subscriptionId !== id);
  save(profile);
  return profile;
}

function removeOutbound(tag) {
  const profile = load();
  profile.outbounds = profile.outbounds.filter((o) => o.tag !== tag);
  profile.groups.forEach((g) => { g.outbounds = g.outbounds.filter((t) => t !== tag); });
  save(profile);
  return profile;
}

function updateOutbound(tag, json) {
  const profile = load();
  const idx = profile.outbounds.findIndex((o) => o.tag === tag);
  if (idx >= 0) {
    profile.outbounds[idx] = { ...profile.outbounds[idx], json, type: json.type, tag: json.tag || tag };
  }
  save(profile);
  return profile;
}

function addOutbound(outbound) {
  const profile = load();
  profile.outbounds.push(outbound);
  save(profile);
  return profile;
}

function updateGroup(tag, patch) {
  const profile = load();
  const g = profile.groups.find((x) => x.tag === tag);
  if (g) Object.assign(g, patch);
  save(profile);
  return profile;
}

module.exports = {
  load, save, importSubscription, importText, removeSubscription,
  removeOutbound, updateOutbound, addOutbound, updateGroup, fetchSubscriptionText,
};
