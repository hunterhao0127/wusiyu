const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function loadDesktopMain(relativePath, platform) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const app = {
    getPath: () => '/tmp',
    getVersion: () => '1.6.0',
    isPackaged: false,
    on: () => {},
    quit: () => {},
    requestSingleInstanceLock: () => true,
    setAppUserModelId: () => {},
    whenReady: () => ({ then: () => {} })
  };
  const electron = { app, BrowserWindow: function () {}, dialog: {}, net: {}, shell: {} };
  const childProcess = {
    execFileSync: () => {},
    execSync: () => {},
    spawn: () => { throw new Error('spawn must not run while loading helpers'); }
  };
  const sandbox = {
    __dirname: path.dirname(path.join(root, relativePath)),
    URL,
    console,
    process: { ...process, platform },
    setTimeout,
    clearTimeout,
    require: name => name === 'electron' ? electron : name === 'child_process' ? childProcess : require(name)
  };
  vm.runInNewContext(
    source + '\nthis.__test = { isNewerVersion, safeDownloadUrl, getBackendCommand: typeof getBackendCommand === "function" ? getBackendCommand : null };',
    sandbox,
    { filename: relativePath }
  );
  return { source, ...sandbox.__test };
}

for (const [relativePath, platform] of [
  ['02-Mac版/main.js', 'darwin'],
  ['01-Windows版/main.js', 'win32']
]) {
  const desktop = loadDesktopMain(relativePath, platform);
  assert.strictEqual(desktop.isNewerVersion('1.6.1', '1.6.0'), true);
  assert.strictEqual(desktop.isNewerVersion('1.6.0', '1.6.0'), false);
  assert.strictEqual(desktop.isNewerVersion('1.5.9', '1.6.0'), false);
  assert.strictEqual(
    desktop.safeDownloadUrl('https://github.com/hunterhao0127/wusiyu/releases/latest'),
    'https://github.com/hunterhao0127/wusiyu/releases/latest'
  );
  assert.strictEqual(desktop.safeDownloadUrl('https://example.com/fake.exe'), '');
}

const windows = loadDesktopMain('01-Windows版/main.js', 'win32');
const devBackend = windows.getBackendCommand();
assert.strictEqual(devBackend.cmd, 'py');
assert.ok(devBackend.args.at(-1).endsWith(path.join('02-Mac版', 'flask-app', 'app.py')));
assert.ok(windows.source.includes("release.downloads && release.downloads.windows"));
assert.ok(windows.source.includes("'backend', 'wusiyu_backend.exe'"));

console.log('Desktop update and shared backend helpers: OK');
