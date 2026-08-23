const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// 与 package.json / install_electron.py / 后端 APP_VERSION 保持一致（发布前用 pre-release-check.py 校验）
const APP_VERSION = '1.5.5';

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
      windowsHide: true,
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

    // 轮询等待 Flask 就绪，并校验后端版本（防止打到旧版后端）
    const maxRetries = 30;
    let retries = 0;
    const checkReady = () => {
      retries++;
      const req = http.get('http://localhost:5980/api/version', (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.success && data.version === APP_VERSION) {
              console.log('Flask 已就绪 (v' + data.version + ')');
              resolve();
            } else if (retries < maxRetries) {
              setTimeout(checkReady, 500);
            } else {
              reject(new Error('后端版本不匹配: 期望 v' + APP_VERSION + ', 实际 ' + (data.version || '未知') + '。可能有旧版务思语后端仍在运行，请重启电脑或手动结束旧的务思语进程'));
            }
          } catch (e) {
            if (retries < maxRetries) setTimeout(checkReady, 500);
            else reject(new Error('后端响应异常'));
          }
        });
      });
      req.on('error', () => {
        if (retries < maxRetries) setTimeout(checkReady, 500);
        else reject(new Error('Flask 启动超时'));
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (retries < maxRetries) setTimeout(checkReady, 500);
        else reject(new Error('Flask 启动超时'));
      });
    };
    setTimeout(checkReady, 800);
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

// ─── 单实例锁：防止重复启动开多个窗口 ────────────
app.setAppUserModelId('com.wusiyu.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 已有实例在运行，直接退出本实例
  app.quit();
} else {
  // 用户再次启动时，聚焦已有窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false,
    backgroundColor: '#fafaf9'
  });

  // 加载 Flask 页面
  let showingErrorPage = false; // 防止 data: 错误页自身失败触发无限循环
  mainWindow.loadURL('http://localhost:5980');

  // 加载失败：显示提示页 + 后端就绪后自动重载（Mac 经验：不白屏、不需手动重启）
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || showingErrorPage) return; // 只处理主框架；错误页自身失败直接忽略（防循环）
    showingErrorPage = true;
    const errorHtml = '<div style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#444;">' +
      '<h2>正在启动本地服务…</h2><p>启动完成后会自动进入阅读器，请稍候</p>' +
      '<p id="st" style="color:#999;font-size:13px;">连接中… (' + desc + ')</p></div>';
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml)).catch(() => {});
    // 轮询真实服务，就绪后自动跳回（最多再等 60 秒）
    let waited = 0;
    const retry = setInterval(() => {
      waited += 1000;
      const req = http.get('http://localhost:5980/api/version', (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const d = JSON.parse(body);
            if (d.success && d.version === APP_VERSION) {
              clearInterval(retry);
              showingErrorPage = false;
              mainWindow.loadURL('http://localhost:5980').catch(() => {});
            } else if (waited >= 60000) {
              clearInterval(retry);
            }
          } catch (e) { /* 继续等 */ }
        });
      });
      req.on('error', () => { /* 继续等 */ });
      req.setTimeout(2000, () => req.destroy());
      if (waited >= 60000) {
        clearInterval(retry);
        // 60 秒仍不行：更新错误页文案（此时 showingErrorPage 已复位允许再次触发）
        showingErrorPage = false;
        mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
          '<div style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#444;">' +
          '<h2>启动超时</h2><p>本地服务未能启动，请关闭务思语后重新打开；若多次失败请重启电脑</p></div>'
        )).catch(() => {});
      }
    }, 1000);
  });

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
