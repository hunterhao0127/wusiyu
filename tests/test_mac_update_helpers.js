const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, '02-Mac版', 'main.js'), 'utf8');
const electron = {
  app: {
    getPath: () => '/tmp',
    getVersion: () => '1.6.0',
    isPackaged: false,
    on: () => {},
    whenReady: () => ({ then: () => {} })
  },
  BrowserWindow: function () {},
  dialog: {},
  net: {},
  shell: {}
};
const sandbox = {
  URL,
  console,
  process,
  setTimeout,
  clearTimeout,
  require: name => name === 'electron' ? electron : require(name)
};

vm.runInNewContext(
  source + '\nthis.__test = { isNewerVersion, safeDownloadUrl };',
  sandbox,
  { filename: 'main.js' }
);

const { isNewerVersion, safeDownloadUrl } = sandbox.__test;
assert.strictEqual(isNewerVersion('1.6.1', '1.6.0'), true);
assert.strictEqual(isNewerVersion('1.6.0', '1.6.0'), false);
assert.strictEqual(isNewerVersion('1.5.9', '1.6.0'), false);
assert.strictEqual(
  safeDownloadUrl('https://github.com/hunterhao0127/wusiyu/releases/latest'),
  'https://github.com/hunterhao0127/wusiyu/releases/latest'
);
assert.strictEqual(safeDownloadUrl('https://example.com/fake.dmg'), '');

console.log('Mac update helpers: OK');
