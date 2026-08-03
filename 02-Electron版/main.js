const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let flaskProcess = null;

// Flask 的可执行路径
function getFlaskPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'flask-app', '务思语.exe');
  } else {
    return path.join(__dirname, 'flask-app', '务思语.exe');
  }
}

// 启动 Flask 后端
function startFlask() {
  return new Promise((resolve, reject) => {
    const flaskPath = getFlaskPath();
    const flaskDir = path.dirname(flaskPath);

    flaskProcess = spawn(flaskPath, [], {
      cwd: flaskDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WUSIYU_ELECTRON: '1' }
    });

    flaskProcess.stdout.on('data', (data) => {
      console.log(`[Flask] ${data}`);
    });

    flaskProcess.stderr.on('data', (data) => {
      console.log(`[Flask] ${data}`);
    });

    flaskProcess.on('error', (err) => {
      console.error('Flask 启动失败:', err);
      reject(err);
    });

    flaskProcess.on('exit', (code) => {
      console.log(`Flask 退出 (code: ${code})`);
      flaskProcess = null;
    });

    // 轮询等待 Flask 就绪
    const maxRetries = 30;
    let retries = 0;
    const checkReady = () => {
      retries++;
      http.get('http://localhost:5980/api/books', (res) => {
        if (res.statusCode === 200) {
          console.log('Flask 已就绪');
          resolve();
        } else if (retries < maxRetries) {
          setTimeout(checkReady, 500);
        } else {
          reject(new Error('Flask 启动超时'));
        }
      }).on('error', () => {
        if (retries < maxRetries) {
          setTimeout(checkReady, 500);
        } else {
          reject(new Error('Flask 启动超时'));
        }
      });
    };
    setTimeout(checkReady, 1000);
  });
}

// 停止 Flask
function stopFlask() {
  if (flaskProcess) {
    flaskProcess.kill('SIGTERM');
    setTimeout(() => {
      if (flaskProcess) {
        flaskProcess.kill('SIGKILL');
      }
    }, 3000);
  }
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '务思语 - 英语沉浸阅读器',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false,
    backgroundColor: '#fafaf9'
  });

  // 加载 Flask 页面
  mainWindow.loadURL('http://localhost:5980');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 处理外部链接（在默认浏览器打开）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// 应用启动
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

// 所有窗口关闭时退出
app.on('window-all-closed', () => {
  stopFlask();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 退出前清理
app.on('before-quit', () => {
  stopFlask();
});
