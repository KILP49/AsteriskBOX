'use strict';
// Clash API client (drives sing-box runtime)
const http = require('http');

class ClashApi {
  constructor(port, secret) {
    this.port = port;
    this.secret = secret;
    this.base = `http://127.0.0.1:${port}`;
  }

  headers(extra) {
    const h = { 'Content-Type': 'application/json', ...(extra || {}) };
    if (this.secret) h.Authorization = `Bearer ${this.secret}`;
    return h;
  }

  request(method, p, body) {
    return new Promise((resolve, reject) => {
      const req = http.request(this.base + p, { method, headers: this.headers(), timeout: 15000 }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(text ? JSON.parse(text) : {}); } catch (e) { resolve(text); }
          } else {
            let msg = text;
            try { msg = JSON.parse(text).message || text; } catch (e) { /* raw */ }
            const err = new Error(msg || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  get(p) { return this.request('GET', p); }
  put(p, body) { return this.request('PUT', p, body); }
  patch(p, body) { return this.request('PATCH', p, body); }
  del(p) { return this.request('DELETE', p); }

  async ping() {
    try { await this.get('/version'); return true; } catch (e) { return false; }
  }

  async version() { return this.get('/version'); }
  async configs() { return this.get('/configs'); }
  async setMode(mode) { return this.patch('/configs', { mode }); }
  async proxies() { return this.get('/proxies'); }
  async proxy(name) { return this.get(`/proxies/${encodeURIComponent(name)}`); }
  async select(name, outbound) { return this.put(`/proxies/${encodeURIComponent(name)}`, { name: outbound }); }
  async delay(name, url, timeoutMs) { return this.get(`/proxies/${encodeURIComponent(name)}/delay?url=${encodeURIComponent(url)}&timeout=${timeoutMs}`); }
  async connections() { return this.get('/connections'); }
  async closeConnection(id) { return this.del(`/connections/${id}`); }
  async closeAllConnections() { return this.del('/connections'); }
  async rules() { return this.get('/rules'); }
  async dnsQuery(domain, type) { return this.get(`/dns/query?name=${encodeURIComponent(domain)}&type=${type || 'A'}`); }

  // SSE stream: /traffic and /logs
  stream(p, onData, onEnd) {
    return new Promise((resolve, reject) => {
      const req = http.request(this.base + p, { headers: this.headers(), timeout: 0 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let buf = '';
        res.on('data', (c) => {
          buf += c.toString('utf8');
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line) {
              try { onData(JSON.parse(line)); } catch (e) { /* ignore */ }
            }
          }
        });
        res.on('end', () => { onEnd && onEnd(); resolve(); });
      });
      req.on('error', (e) => { onEnd && onEnd(); reject(e); });
      req.end();
      this._activeReq = req;
    });
  }

  close() {
    if (this._activeReq) { try { this._activeReq.destroy(); } catch (e) { /* */ } }
  }
}

module.exports = { ClashApi };
