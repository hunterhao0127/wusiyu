const { contextBridge } = require('electron');

// 可以在这里暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
