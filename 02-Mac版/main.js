const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let flaskProcess = null;
const SERVER_URL = 'http://127.0.0.1:5980';

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
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    console.log('正在启动 Flask 服务...');
    await startFlask();
    console.log('创建窗口...');
    createWindow();
  } catch (err) {
    console.error('启动失败:', err);
    createWindow();
  }
});

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
