# AsteriskBOX for Windows

sing-box GUI client for Windows，从 Android 版 [AsteriskBOX](https://github.com/Asterisk4Magisk/AsteriskBOX) 移植。

## 功能

### 首页
- 服务开关（启动/停止 sing-box 核心）
- 运行模式切换：规则 / 全局 / 直连
- 实时网络活动图表（上传/下载双线折线图，60 秒滚动窗口）
- 累计上传/下载流量统计
- 快捷入口：资源监控、连接监控、流量统计、网络信息

### 代理
- 分组选择器列表（PROXY / AUTO 等策略组）
- 节点延迟测试（单节点 / 整组测试）
- 节点切换（点击选中当前出站节点）
- 分组展开/折叠
- 布局选项（紧凑/标准/宽松）和排序选项

### 应用
- 活动连接实时监控
- 搜索 / 筛选 / 排序
- 单条关闭 / 全部关闭连接
- 连接详情：源→目标、协议、代理链、上传/下载流量

### 设置
- **外观**：主题（跟随系统/浅色/深色）、强调色（6 色）、语言（中/英）
- **核心**：开机自启、自动连接、最小化到托盘
- **网络**：运行模式、TUN 设置、本地代理端口、DNS 配置、域名嗅探
- **路由**：绕过规则、路由规则编辑
- **订阅**：订阅地址管理、自动更新、节点导入
- **资源**：规则集更新、sing-box 版本检查
- **高级**：日志级别、调试选项、导出日志、打开数据目录

## 技术架构

```
AsteriskBOX.exe (Electron 37)
├─ main.js          主进程：sing-box 引擎管理、托盘、IPC、流量聚合
├─ preload.js       上下文桥：contextBridge 安全 IPC
├─ resources/
│  └─ app.asar      打包的前端代码
│     ├─ renderer/
│     │  ├─ index.html    入口 HTML
│     │  ├─ css/style.css Material Design 3 风格样式
│     │  └─ js/
│     │     ├─ app.js     应用主框架（路由、主题、i18n）
│     │     ├─ api.js     IPC 封装（生产）/ 模拟数据（演示）
│     │     └─ pages/
│     │        ├─ home.js     首页
│     │        ├─ proxies.js  代理页
│     │        ├─ apps.js     应用页
│     │        └─ settings.js 设置页
│     └─ data/           sing-box 核心 + 数据
│        ├─ sing-box.exe  核心引擎
│        ├─ wintun.dll    TUN 驱动
│        ├─ geo*.srs      规则集
│        └─ configs/      生成配置
└─ build/package.js    打包脚本
```

### 主进程职责 (main.js)
- **引擎管理**：启动/停止 sing-box.exe，监控进程状态，崩溃自动重启
- **配置生成**：从 profiles.json 生成 sing-box 配置文件
- **流量聚合**：轮询 sing-box Clash API，聚合实时流量和每日统计
- **系统托盘**：托盘图标 + 菜单（开关、模式、退出）
- **IPC 处理**：处理渲染进程的所有 abx.* 调用
- **资源管理**：规则集更新、日志收集、数据目录管理
- **系统代理**：Windows 注册表设置（非 TUN 模式）

### 渲染进程
- 纯前端 SPA，通过 `window.abx.*` 调用主进程 IPC
- Material Design 3 设计语言
- 响应式布局（桌面侧边栏 / 移动底部导航）
- Canvas 流量图表（无第三方依赖）
- i18n 国际化（中文/英文）
- 主题系统（浅色/深色 + 6 色强调色）

## 构建方法

```bash
# 1. 安装依赖
npm install

# 2. 开发运行（需 demo 模式）
npm start

# 3. 打包 Windows 便携版
npm run build
# 输出 dist/AsteriskBOX-Windows.zip
```

打包脚本会：
1. 下载 Electron 37 win32-x64 发行版
2. 将应用代码打包为 app.asar
3. 用 resedit 嵌入图标和版本信息到 exe
4. 复制 data 目录（sing-box 核心 + 规则集）
5. 生成 zip 便携包

## 许可

GPL-3.0，基于 AsteriskBOX (Android) 移植。