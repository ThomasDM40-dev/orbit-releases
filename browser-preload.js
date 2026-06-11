const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onVideoDetected:  (cb) => ipcRenderer.on('browser-video-detected', (_, d) => cb(d)),
  downloadVideo:    (data) => ipcRenderer.send('browser-download-video', data),
  analyzeUrl:       (url) => ipcRenderer.invoke('browser-analyze-url', url),
  reportPage:       (info) => ipcRenderer.send('sniffer-page-info', info),
});
