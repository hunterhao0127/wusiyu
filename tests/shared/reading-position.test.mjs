import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReadingPositionRecord,
  legacyReadingPosition,
  resolveReadingPosition,
} from '../../shared/core/reader/reading-position.js';

test('reading position uses stable book ID and normalized anchor', () => {
  const record = createReadingPositionRecord({
    bookId: 'sha256:abc',
    blockIndex: 4,
    progress: 0.5,
    textAnchor: '  The   Answer ',
  }, { now: 100, deviceId: 'mac' });
  assert.equal(record.id, 'reading-position:sha256:abc');
  assert.equal(record.payload.textAnchor, 'the answer');
});

test('position resolution prefers anchor, then block, then progress', () => {
  const blocks = [{ text: 'zero' }, { text: 'The answer is here.' }, { text: 'two' }, { text: 'three' }];
  assert.deepEqual(resolveReadingPosition({ textAnchor: 'answer is', blockIndex: 3, progress: 1 }, blocks), {
    blockIndex: 1,
    strategy: 'anchor',
  });
  assert.deepEqual(resolveReadingPosition({ textAnchor: 'missing', blockIndex: 2, progress: 0 }, blocks), {
    blockIndex: 2,
    strategy: 'block',
  });
  assert.deepEqual(resolveReadingPosition({ textAnchor: '', blockIndex: 99, progress: 0.66 }, blocks), {
    blockIndex: 2,
    strategy: 'progress',
  });
});

test('legacy positions get deterministic aliases', () => {
  const record = legacyReadingPosition('Book.TXT', { paraIndex: 5, timestamp: 200 }, {
    now: 300,
    deviceId: 'web',
    book: { size: 100, blockCount: 11 },
  });
  assert.equal(record.id, 'reading-position:legacy-file:book.txt:100');
  assert.equal(record.payload.progress, 0.5);
  assert.ok(record.payload.bookAliases.includes('legacy-file:book.txt'));
});
