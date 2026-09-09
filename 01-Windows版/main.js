const { app, BrowserWindow, dialog, net, shell } = require('electron');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let flaskProcess = null;
const SERVER_URL = 'http://127.0.0.1:5980';
const UPDATE_URL = 'https://hunterhao0127.github.io/wusiyu/version.json';
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function getBackendCommand() {
  if (app.isPackaged) {
    return { cmd: path.join(process.resourcesPath, 'backend', 'wusiyu_backend.exe'), args: [] };
  }

  const appPy = path.join(__dirname, '..', '02-Mac版', 'flask-app', 'app.py');
  for (const cmd of ['py', 'python', 'python3']) {
    try {
      execFileSync(cmd, cmd === 'py' ? ['-3', '--version'] : ['--version'], { stdio: 'ignore' });
      return { cmd, args: cmd === 'py' ? ['-3', appPy] : [appPy] };
    } catch(e) {}
  }
  return { cmd: 'python', args: [appPy] };
}

function startFlask() {
  return new Promise((resolve, reject) => {
    const backend = getBackendCommand();
    const source = app.isPackaged ? backend.cmd : backend.args[backend.args.length - 1];
    if (!fs.existsSync(source)) {
      reject(new Error(`找不到共享后端: ${source}`));
      return;
    }

    flaskProcess = spawn(backend.cmd, backend.args, {
      cwd: path.dirname(source),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        WUSIYU_ELECTRON: '1',
        WUSIYU_DATA_DIR: app.getPath('userData')
      }
    });

    flaskProcess.stdout.on('data', data => console.log(`[Flask] ${data}`));
    flaskProcess.stderr.on('data', data => console.log(`[Flask] ${data}`));
    flaskProcess.on('error', reject);
    flaskProcess.on('exit', () => { flaskProcess = null; });

    let retries = 0;
    const check = () => {
      retries++;
      http.get(`${SERVER_URL}/api/version`, res => {
        if (res.statusCode === 200) resolve();
        else if (retries < 80) setTimeout(check, 500);
        else reject(new Error('后端启动超时'));
      }).on('error', () => {
        if (retries < 80) setTimeout(check, 500);
        else reject(new Error('后端启动超时'));
      });
    };
    setTimeout(check, 1500);
  });
}

function stopFlask() {
  if (!flaskProcess) return;
  flaskProcess.kill('SIGTERM');
  setTimeout(() => { if (flaskProcess) flaskProcess.kill('SIGKILL'); }, 3000);
}

function isNewerVersion(latest, current) {
  const a = String(latest).replace(/^v/, '').split('.').map(Number);
  const b = String(current).replace(/^v/, '').split('.').map(Number);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

function safeDownloadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' &&
      url.pathname.startsWith('/hunterhao0127/wusiyu/') ? url.href : '';
  } catch(e) { return ''; }
}

async function checkForUpdates() {
  const stateFile = path.join(app.getPath('userData'), 'update-check.json');
  try {
    const previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (Date.now() - Number(previous.checkedAt || 0) < UPDATE_INTERVAL_MS) return;
  } catch(e) {}

  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ checkedAt: Date.now() }));
    const response = await net.fetch(UPDATE_URL, { cache: 'no-store' });
    if (!response.ok) return;
    const release = await response.json();
    const downloadUrl = safeDownloadUrl(release.downloads && release.downloads.windows);
    if (!downloadUrl || !isNewerVersion(release.version, app.getVersion())) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现务思语新版本',
      message: `发现新版本 v${String(release.version).replace(/^v/, '')}`,
      detail: Array.isArray(release.notes) ? release.notes.join('\n') : String(release.notes || '建议更新到最新版本。'),
      buttons: ['立即下载', '稍后再说'],
      defaultId: 0,
      cancelId: 1
    });
    if (result.response === 0) await shell.openExternal(downloadUrl);
  } catch(e) {
    console.log('检查更新失败:', e.message);
  }
}

app.setAppUserModelId('com.wusiyu.reader');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '务思语 - 英语沉浸阅读器',
    icon: path.join(__dirname, 'wusiyu_logo.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false,
    backgroundColor: '#fafaf9'
  });

  mainWindow.loadURL(SERVER_URL);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const external = safeDownloadUrl(url);
    if (external) shell.openExternal(external);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function startApplication() {
  try {
    await startFlask();
    createWindow();
    void checkForUpdates();
  } catch (err) {
    stopFlask();
    const result = await dialog.showMessageBox({
      type: 'error',
      title: '务思语启动失败',
      message: '本地阅读服务未能启动',
      detail: `${err.message || err}\n\n可能是端口 5980 被占用，或应用文件不完整。`,
      buttons: ['重试', '退出'],
      defaultId: 0,
      cancelId: 1
    });
    if (result.response === 0) return startApplication();
    app.quit();
  }
}

app.whenReady().then(startApplication);
app.on('window-all-closed', () => {
  stopFlask();
  app.quit();
});
app.on('before-quit', stopFlask);
