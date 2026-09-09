import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertVocabularyRecord, deleteVocabularyRecord } from '../../shared/core/learning/vocabulary.js';
import { exportBackup, mergeBackup, parseBackup } from '../../shared/core/sync/backup.js';
import { mergeRecords, tombstoneRecord } from '../../shared/core/sync/records.js';

test('newest record wins and equal-time deletion wins', () => {
  const oldRecord = upsertVocabularyRecord({ type: 'word', text: 'hello', translation: '旧' }, { now: 10, deviceId: 'a' });
  const newRecord = upsertVocabularyRecord({ type: 'word', text: 'hello', translation: '新' }, {
    now: 20,
    deviceId: 'b',
    current: oldRecord,
  });
  assert.equal(mergeRecords([oldRecord], [newRecord])[0].payload.translation, '新');

  const deleted = deleteVocabularyRecord(newRecord, { now: 20, deviceId: 'a' });
  assert.equal(mergeRecords([newRecord], [deleted])[0].deletedAt, 20);
});

test('device ID breaks otherwise equal conflicts deterministically', () => {
  const left = upsertVocabularyRecord({ type: 'word', text: 'hello', translation: 'A' }, { now: 10, deviceId: 'a' });
  const right = upsertVocabularyRecord({ type: 'word', text: 'hello', translation: 'B' }, { now: 10, deviceId: 'b' });
  assert.equal(mergeRecords([left], [right])[0].payload.translation, 'B');
  assert.deepEqual(mergeRecords([right], [left]), mergeRecords([left], [right]));
});

test('a generic record can be replaced by a tombstone', () => {
  const active = {
    id: 'reading-position:legacy',
    type: 'reading-position',
    updatedAt: 10,
    deviceId: 'web',
    deletedAt: null,
    payload: { bookId: 'legacy' },
  };
  const deleted = tombstoneRecord(active, { now: 20, deviceId: 'mac' });
  assert.equal(mergeRecords([active], [deleted])[0].deletedAt, 20);
});

test('v2 backup round trip is stable and idempotent', () => {
  const record = upsertVocabularyRecord({ type: 'phrase', text: 'take off' }, { now: 10, deviceId: 'web' });
  const backup = exportBackup([record], { deviceId: 'web', exportedAt: '2026-09-08T00:00:00.000Z' });
  const parsed = parseBackup(backup, { deviceId: 'mac', now: 20 });
  assert.deepEqual(parsed, [record]);
  assert.deepEqual(mergeBackup(parsed, backup, { deviceId: 'mac', now: 20 }), [record]);
});

test('Mac and Web round trip preserves a deletion tombstone', () => {
  const addedOnMac = upsertVocabularyRecord(
    { type: 'word', text: 'durable', translation: '持久的' },
    { now: 10, deviceId: 'mac' },
  );
  const macExport = exportBackup([addedOnMac], { deviceId: 'mac' });
  const webRecords = parseBackup(macExport, { deviceId: 'web', now: 20 });
  const deletedOnWeb = deleteVocabularyRecord(webRecords[0], { now: 30, deviceId: 'web' });
  const webExport = exportBackup(mergeRecords(webRecords, [deletedOnWeb]), { deviceId: 'web' });
  const restoredOnMac = mergeBackup([addedOnMac], webExport, { deviceId: 'mac', now: 40 });

  assert.equal(restoredOnMac.length, 1);
  assert.equal(restoredOnMac[0].deletedAt, 30);
  assert.equal(restoredOnMac[0].payload, null);
});

test('v1 backup migrates vocabulary, history and settings', () => {
  const v1 = {
    format: 'wusiyu-learning-backup',
    version: 1,
    data: {
      wordbook: {
        'word:hello': { type: 'word', text: 'Hello', translation: '你好', addedAt: 10 },
      },
      history: { 'Book.txt': { paraIndex: 5, timestamp: 20 } },
      settings: { theme: 'sepia', fontSize: 20 },
      ai: { provider: 'deepseek', api_base: 'https://example.test/v1', model: 'model' },
    },
  };
  const records = parseBackup(v1, {
    deviceId: 'legacy',
    now: 30,
    legacyBooks: { 'Book.txt': { bookId: 'sha256:book', size: 100, blockCount: 11 } },
  });
  assert.deepEqual(records.map(record => record.type), [
    'ai-settings', 'reading-position', 'reading-settings', 'vocabulary',
  ]);
  assert.equal(records.find(record => record.type === 'reading-position').payload.progress, 0.5);
});

test('invalid and secret-bearing backups are rejected as a whole', () => {
  assert.throws(() => parseBackup({ format: 'wrong', version: 2 }, { deviceId: 'web', now: 1 }), /不是有效/);
  assert.throws(() => parseBackup({
    format: 'wusiyu-learning-backup',
    version: 2,
    records: [{
      id: 'ai-settings:default',
      type: 'ai-settings',
      updatedAt: 1,
      deviceId: 'web',
      deletedAt: null,
      payload: { api_key: 'secret' },
    }],
  }, { deviceId: 'web', now: 1 }), /敏感/);
});
