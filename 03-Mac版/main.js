const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let flaskProcess = null;

function getFlaskDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'flask-app');
  } else {
    return path.join(__dirname, 'flask-app');
  }
}

function getPythonCmd() {
  // macOS 上依次尝试
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      require('child_process').execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch(e) {}
  }
  return 'python3'; // 默认
}

function startFlask() {
  return new Promise((resolve, reject) => {
    const flaskDir = getFlaskDir();
    const pythonCmd = getPythonCmd();
    const appPy = path.join(flaskDir, 'app.py');

    if (!fs.existsSync(appPy)) {
      reject(new Error(`找不到 Flask 后端: ${appPy}`));
      return;
    }

    flaskProcess = spawn(pythonCmd, [appPy], {
      cwd: flaskDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WUSIYU_ELECTRON: '1' }
    });

    flaskProcess.stdout.on('data', (data) => console.log(`[Flask] ${data}`));
    flaskProcess.stderr.on('data', (data) => console.log(`[Flask] ${data}`));
    flaskProcess.on('error', (err) => reject(err));
    flaskProcess.on('exit', (code) => { flaskProcess = null; });

    // 轮询等待 Flask 就绪
    let retries = 0;
    const check = () => {
      retries++;
      http.get('http://localhost:5980/api/books', (res) => {
        if (res.statusCode === 200) resolve();
        else if (retries < 30) setTimeout(check, 500);
        else reject(new Error('超时'));
      }).on('error', () => {
        if (retries < 30) setTimeout(check, 500);
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

  mainWindow.loadURL('http://localhost:5980');
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
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopFlask();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => stopFlask());
