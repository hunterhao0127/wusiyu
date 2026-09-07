const { app, BrowserWindow, dialog, net, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let flaskProcess = null;
const SERVER_URL = 'http://127.0.0.1:5980';
const UPDATE_URL = 'https://hunterhao0127.github.io/wusiyu/version.json';
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function getFlaskDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, 'flask-app');
}

function getBackendCommand(flaskDir) {
  if (app.isPackaged) {
    const backend = path.join(flaskDir, 'wusiyu_backend');
    if (fs.existsSync(backend)) return { cmd: backend, args: [] };
  }

  const appPy = path.join(flaskDir, 'app.py');
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      require('child_process').execSync(`${cmd} --version`, { stdio: 'ignore' });
      return { cmd, args: [appPy] };
    } catch(e) {}
  }
  return { cmd: 'python3', args: [appPy] };
}

function startFlask() {
  return new Promise((resolve, reject) => {
    const flaskDir = getFlaskDir();
    const backend = getBackendCommand(flaskDir);

    if (!fs.existsSync(flaskDir)) {
      reject(new Error(`找不到 Flask 后端目录: ${flaskDir}`));
      return;
    }

    flaskProcess = spawn(backend.cmd, backend.args, {
      cwd: flaskDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WUSIYU_ELECTRON: '1',
        WUSIYU_DATA_DIR: app.getPath('userData')
      }
    });

    flaskProcess.stdout.on('data', (data) => console.log(`[Flask] ${data}`));
    flaskProcess.stderr.on('data', (data) => console.log(`[Flask] ${data}`));
    flaskProcess.on('error', (err) => reject(err));
    flaskProcess.on('exit', (code) => { flaskProcess = null; });

    // 轮询等待 Flask 就绪
    let retries = 0;
    const check = () => {
      retries++;
      http.get(`${SERVER_URL}/api/books`, (res) => {
        if (res.statusCode === 200) resolve();
        else if (retries < 80) setTimeout(check, 500);
        else reject(new Error('超时'));
      }).on('error', () => {
        if (retries < 80) setTimeout(check, 500);
        else reject(new Error('超时'));
      });
    };
    setTimeout(check, 1500);
  });
}

function stopFlask() {
  if (flaskProcess) {
    flaskProcess.kill('SIGTERM');
    setTimeout(() => { if (flaskProcess) flaskProcess.kill('SIGKILL'); }, 3000);
  }
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
    const downloadUrl = safeDownloadUrl(release.downloads && release.downloads.mac);
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 800, minHeight: 600,
    title: '务思语 - 英语沉浸阅读器',
    icon: path.join(__dirname, 'build', 'icon.icns'),
    webPreferences: {
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
    console.log('正在启动 Flask 服务...');
    await startFlask();
    console.log('创建窗口...');
    createWindow();
    void checkForUpdates();
  } catch (err) {
    console.error('启动失败:', err);
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
  if (process.platform !== 'darwin') {
    stopFlask();
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainWindow === null) {
    try {
      if (!flaskProcess) await startFlask();
      createWindow();
    } catch (err) {
      console.error('启动失败:', err);
    }
  }
});

app.on('before-quit', () => stopFlask());
