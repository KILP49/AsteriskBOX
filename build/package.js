'use strict';
/* Package AsteriskBOX for Windows: assemble portable exe + data folder (no wine needed) */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const ELECTRON_VERSION = '37.10.3';
const OUT = path.join(ROOT, 'dist', 'AsteriskBOX-win32-x64');
const TMP = path.join(os.tmpdir(), 'abox-electron');

function sh(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  // 1. download electron win32-x64 dist
  const zipPath = path.join(TMP, `electron-v${ELECTRON_VERSION}-win32-x64.zip`);
  if (!fs.existsSync(zipPath)) {
    console.log('downloading electron', ELECTRON_VERSION, '...');
    const url = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip`;
    sh('curl', ['-sL', '-o', zipPath, url]);
  }
  const distDir = path.join(TMP, 'electron-dist');
  if (!fs.existsSync(path.join(distDir, 'electron.exe'))) {
    console.log('extracting electron dist ...');
    sh('unzip', ['-o', '-q', zipPath, '-d', distDir]);
  }

  // 2. pack app.asar — use a staging dir to avoid asar glob-ignore bugs
  console.log('packing app.asar ...');
  const asar = require('asar');
  const staging = path.join(TMP, 'asar-staging');
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  // copy only what belongs in the asar
  const keepFiles = ['main.js', 'preload.js', 'package.json'];
  const keepDirs = ['core', 'renderer'];
  for (const f of keepFiles) {
    fs.copyFileSync(path.join(ROOT, f), path.join(staging, f));
  }
  for (const d of keepDirs) {
    fs.cpSync(path.join(ROOT, d), path.join(staging, d), { recursive: true });
  }
  // copy production node_modules (exclude devDependencies)
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const prodDeps = Object.keys(pkg.dependencies || {});
  fs.mkdirSync(path.join(staging, 'node_modules'), { recursive: true });
  for (const dep of prodDeps) {
    const src = path.join(ROOT, 'node_modules', dep);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(staging, 'node_modules', dep), { recursive: true });
    }
  }

  await asar.createPackage(staging, path.join(OUT, 'resources', 'app.asar'));

  // 3. assemble dist
  console.log('assembling dist ...');
  for (const f of fs.readdirSync(distDir)) {
    if (f === 'LICENSE' || f === 'LICENSES.chromium.html' || f === 'version') continue;
    fs.cpSync(path.join(distDir, f), path.join(OUT, f), { recursive: true });
  }
  const def = path.join(OUT, 'resources', 'default_app.asar');
  if (fs.existsSync(def)) fs.unlinkSync(def);
  fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, 'AsteriskBOX.exe'));

  // 4. patch icon + version info
  console.log('patching exe icon & version ...');
  const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit');
  const exePath = path.join(OUT, 'AsteriskBOX.exe');
  const exeData = fs.readFileSync(exePath);
  const exe = NtExecutable.from(exeData);
  const res = NtExecutableResource.from(exe);
  // icons
  const icoPath = path.join(ROOT, 'build', 'icon.ico');
  if (fs.existsSync(icoPath)) {
    const iconFile = Data.IconFile.from(fs.readFileSync(icoPath));
    const icons = iconFile.icons.map((item) => item.data);
    Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icons);
  }
  // version info
  const vi = Resource.VersionInfo.createEmpty();
  vi.setFileVersion(1, 0, 0, 0);
  vi.setProductVersion(1, 0, 0, 0);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    CompanyName: 'Asterisk4Magisk',
    FileDescription: 'AsteriskBOX for Windows',
    FileVersion: '1.0.0.0',
    InternalName: 'AsteriskBOX',
    OriginalFilename: 'AsteriskBOX.exe',
    ProductName: 'AsteriskBOX',
    ProductVersion: '1.0.0.0',
    LegalCopyright: 'GPL-3.0',
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));

  // 5. copy data folder
  console.log('copying data folder ...');
  if (fs.existsSync(path.join(ROOT, 'data'))) {
    fs.cpSync(path.join(ROOT, 'data'), path.join(OUT, 'data'), { recursive: true });
  } else {
    fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
  }

  // 6. write README
  fs.writeFileSync(path.join(OUT, 'README.txt'), README_TEXT, 'utf8');

  // 7. zip — use PowerShell Compress-Archive on Windows, zip on others
  console.log('creating zip ...');
  const zipName = path.join(ROOT, 'dist', 'AsteriskBOX-Windows.zip');
  if (fs.existsSync(zipName)) fs.unlinkSync(zipName);
  if (process.platform === 'win32') {
    const srcDir = path.join(ROOT, 'dist', 'AsteriskBOX-win32-x64');
    const psCmd = `Compress-Archive -Path '${srcDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipName.replace(/'/g, "''")}' -Force`;
    execFileSync('powershell', ['-NoProfile', '-Command', psCmd], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-r', '-q', zipName, 'AsteriskBOX-win32-x64'], { cwd: path.join(ROOT, 'dist'), stdio: 'inherit' });
  }

  console.log('done:', OUT);
  console.log('zip:', zipName);
}

const README_TEXT = `AsteriskBOX for Windows
========================
sing-box GUI client for Windows, ported from the Android app
https://github.com/Asterisk4Magisk/AsteriskBOX

运行
----
1. 双击 AsteriskBOX.exe 启动。
2. TUN 模式需要管理员权限（右键 → 以管理员身份运行）。
   无管理员权限时请在 设置 → 运行模式 切换到「系统代理」模式。
3. 在 设置 → 订阅 中添加订阅地址并导入节点。
4. 回到首页点击开关启动代理。

目录结构
--------
AsteriskBOX.exe   程序主文件
data/sing-box.exe 核心引擎 (sing-box v1.14.0-beta.3)
data/wintun.dll   TUN 虚拟网卡驱动
data/geo*.srs     规则集文件（可更新）
data/configs/     生成的 sing-box 配置
data/logs/        核心日志
data/profiles.json 订阅与节点数据
data/settings.json 设置

功能
----
- 首页：服务开关、规则/全局/直连模式、网络活动图表、监控入口
- 代理：分组选择器、延迟测试、节点切换、布局与排序选项
- 应用：活动连接监控（搜索/筛选/排序/关闭连接）
- 设置：主题/强调色、运行模式、TUN 设置、本地代理、DNS、嗅探、路由、日志、资源管理

许可：GPL-3.0
`;

main().catch((e) => { console.error(e); process.exit(1); });