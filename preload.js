'use strict';
/* Preload: bridge renderer <-> main via contextBridge */
const { contextBridge, ipcRenderer } = require('electron');

const handlers = {
  getAppInfo: () => ipcRenderer.invoke('getAppInfo'),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  updateSettings: (patch) => ipcRenderer.invoke('updateSettings', patch),
  getStatus: () => ipcRenderer.invoke('getStatus'),
  getConfigs: () => ipcRenderer.invoke('getConfigs'),
  startProxy: () => ipcRenderer.invoke('startProxy'),
  stopProxy: () => ipcRenderer.invoke('stopProxy'),
  restartProxy: () => ipcRenderer.invoke('restartProxy'),
  setMode: (mode) => ipcRenderer.invoke('setMode', mode),
  getProxies: () => ipcRenderer.invoke('getProxies'),
  testDelay: (name, url, timeout) => ipcRenderer.invoke('testDelay', name, url, timeout),
  selectOutbound: (name, outbound) => ipcRenderer.invoke('selectOutbound', name, outbound),
  getConnections: () => ipcRenderer.invoke('getConnections'),
  closeConnection: (id) => ipcRenderer.invoke('closeConnection', id),
  closeAllConnections: () => ipcRenderer.invoke('closeAllConnections'),
  getRules: () => ipcRenderer.invoke('getRules'),
  getProfile: () => ipcRenderer.invoke('getProfile'),
  addSubscription: (url, name, replace) => ipcRenderer.invoke('addSubscription', url, name, replace),
  updateSubscription: (id) => ipcRenderer.invoke('updateSubscription', id),
  removeSubscription: (id) => ipcRenderer.invoke('removeSubscription', id),
  importText: (text, replace) => ipcRenderer.invoke('importText', text, replace),
  updateOutbound: (tag, json) => ipcRenderer.invoke('updateOutbound', tag, json),
  deleteOutbound: (tag) => ipcRenderer.invoke('deleteOutbound', tag),
  getResourceStatus: () => ipcRenderer.invoke('getResourceStatus'),
  updateResources: () => ipcRenderer.invoke('updateResources'),
  getCoreLogs: () => ipcRenderer.invoke('getCoreLogs'),
  getDailyStats: () => ipcRenderer.invoke('getDailyStats'),
  getNetworkInfo: () => ipcRenderer.invoke('getNetworkInfo'),
  getProcessStats: () => ipcRenderer.invoke('getProcessStats'),
  exportLogs: () => ipcRenderer.invoke('exportLogs'),
  openDataFolder: () => ipcRenderer.invoke('openDataFolder'),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
};

contextBridge.exposeInMainWorld('abx', {
  ...handlers,
  on: (channel, cb) => {
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
});
