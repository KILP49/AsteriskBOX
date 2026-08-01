'use strict';
// sing-box engine manager: spawn / stop / status / validate
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { dataDir } = require('./settings');
const { compile } = require('./compiler');
const { ClashApi } = require('./clashapi');
const { setSystemProxy } = require('./system');

function singBoxPath() {
  return path.join(dataDir(), 'sing-box.exe');
}

function configPath() {
  return path.join(dataDir(), 'configs', 'config.json');
}

class Engine {
  constructor() {
    this.child = null;
    this.api = null;
    this.status = { running: false, pid: null, mode: 'tun', startedAt: null, lastError: null };
    this._trafficSub = null;
    this._logSub = null;
    this._stopRequested = false;
  }

  get running() { return !!this.child && this.child.exitCode === null; }

  async validate(settings, profile) {
    const config = compile(settings, profile);
    const cfgPath = configPath();
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
    return new Promise((resolve) => {
      execFile(singBoxPath(), ['check', '-c', cfgPath], { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '');
        if (err) resolve({ ok: false, output: output.trim() || String(err) });
        else resolve({ ok: true, output: output.trim() });
      });
    });
  }

  async start(settings, profile) {
    if (this.running) return { ok: true, already: true };
    this._stopRequested = false;
    const config = compile(settings, profile);
    const cfgPath = configPath();
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.mkdirSync(path.join(dataDir(), 'logs'), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');

    // system proxy mode: set WinINET proxy first
    if (settings.runMode === 'proxy') {
      setSystemProxy(true, settings.localProxyPort);
    }

    const bin = singBoxPath();
    const args = ['run', '-c', cfgPath, '--disable-color'];
    const stdio = ['ignore', 'pipe', 'pipe'];
    this.child = spawn(bin, args, {
      cwd: dataDir(),
      windowsHide: true,
      stdio,
      env: { ...process.env, OS_SING_BOX: undefined },
    });
    this.status.pid = this.child.pid;
    this.status.startedAt = Date.now();
    this.status.mode = settings.runMode;
    this.status.lastError = null;

    let stderrBuf = '';
    this.child.stderr.on('data', (d) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);
    });
    this.child.stdout.on('data', () => { /* logs also go to file */ });

    this.child.on('exit', (code, signal) => {
      if (!this._stopRequested && !this.status.lastError) {
        this.status.lastError = `核心进程退出 (code ${code}${signal ? ', ' + signal : ''})`;
      }
      this.status.running = false;
      this.status.pid = null;
      if (this._trafficSub) { this._trafficSub.close(); this._trafficSub = null; }
      if (this._logSub) { this._logSub.close(); this._logSub = null; }
      this.api = null;
      if (settings.runMode === 'proxy') setSystemProxy(false, settings.localProxyPort);
    });

    // wait for clash api
    this.api = new ClashApi(settings.clashApiPort, config.experimental.clash_api.secret);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (!this.running) {
        return { ok: false, error: this.status.lastError || '核心进程退出', output: stderrBuf };
      }
      if (await this.api.ping()) {
        this.status.running = true;
        return { ok: true, stderr: stderrBuf };
      }
      await sleep(300);
    }
    // TUN may have failed; report stderr
    const hint = stderrBuf.includes('wintun') || stderrBuf.includes('access denied') || stderrBuf.includes('permission')
      ? 'TUN 模式需要管理员权限。请右键以管理员身份运行，或在 设置 → 运行模式 中切换到“系统代理”模式。'
      : null;
    await this.stop();
    return { ok: false, error: '核心启动超时', output: stderrBuf, hint };
  }

  async stop() {
    this._stopRequested = true;
    const settings = require('./settings').load();
    if (settings.runMode === 'proxy') setSystemProxy(false, settings.localProxyPort);
    if (this.child && this.child.exitCode === null) {
      try { this.child.kill(); } catch (e) { /* */ }
      try {
        await Promise.race([
          new Promise((r) => this.child.once('exit', r)),
          sleep(3000),
        ]);
      } catch (e) { /* */ }
    }
    if (this.child && this.child.exitCode === null) {
      try { process.kill(this.child.pid); } catch (e) { /* */ }
    }
    this.child = null;
    this.api = null;
    this.status.running = false;
    this.status.pid = null;
  }

  async restart(settings, profile) {
    await this.stop();
    return this.start(settings, profile);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { Engine, singBoxPath, configPath };
