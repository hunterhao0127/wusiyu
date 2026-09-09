import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReadingSettingsRecord,
  normalizeReaderSettings,
  readingProgress,
} from '../../shared/core/reader/settings.js';

test('reader settings normalize platform-independent display rules', () => {
  assert.deepEqual(normalizeReaderSettings({
    theme: 'dark', readingMode: 'scroll', twoColumn: true,
    fontSize: 99, lineHeight: 0, pageMargin: 31, paragraphSpacing: -2,
  }), {
    theme: 'dark', fontSize: 28, lineHeight: 1.4, wordbookTheme: 'classic',
    readingMode: 'scroll', twoColumn: true, pageMargin: 31, paragraphSpacing: 0,
  });
});

test('reader settings record and progress use stable shared shapes', () => {
  const record = createReadingSettingsRecord({ readingMode: 'scroll' }, { now: 123, deviceId: 'web' });
  assert.equal(record.id, 'reading-settings:default');
  assert.equal(record.payload.readingMode, 'scroll');
  assert.equal(readingProgress(4, 9), 0.5);
  assert.equal(readingProgress(8, 9), 1);
});
