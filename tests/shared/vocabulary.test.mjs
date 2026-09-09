import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deleteVocabularyRecord,
  upsertVocabularyRecord,
  vocabularyObject,
} from '../../shared/core/learning/vocabulary.js';
import { mergeRecords } from '../../shared/core/sync/records.js';

test('word and phrase IDs are deterministic', () => {
  const word = upsertVocabularyRecord({ type: 'word', text: '  Hello ' }, { now: 10, deviceId: 'mac' });
  const phrase = upsertVocabularyRecord({ type: 'phrase', text: 'Take Off' }, { now: 11, deviceId: 'web' });
  assert.equal(word.id, 'word:hello');
  assert.equal(phrase.id, 'phrase:take off');
});

test('updating details keeps ID and addedAt', () => {
  const first = upsertVocabularyRecord({ type: 'word', text: 'hello', translation: '你好' }, { now: 10, deviceId: 'web' });
  const updated = upsertVocabularyRecord({ ...first.payload, translation: '你好；喂' }, {
    now: 20,
    deviceId: 'mac',
    current: first,
  });
  assert.equal(updated.id, first.id);
  assert.equal(updated.payload.addedAt, 10);
  assert.equal(updated.payload.updatedAt, 20);
  assert.equal(updated.payload.translation, '你好；喂');
});

test('deletion wins over an older active record and re-add can win later', () => {
  const active = upsertVocabularyRecord({ type: 'word', text: 'hello' }, { now: 10, deviceId: 'web' });
  const deleted = deleteVocabularyRecord(active, { now: 20, deviceId: 'mac' });
  assert.deepEqual(vocabularyObject(mergeRecords([active], [deleted])), {});

  const restored = upsertVocabularyRecord({ type: 'word', text: 'hello', translation: '你好' }, {
    now: 30,
    deviceId: 'web',
    current: deleted,
  });
  const visible = vocabularyObject(mergeRecords([deleted], [restored]));
  assert.equal(visible['word:hello'].translation, '你好');
});

test('changing text through update is rejected', () => {
  const current = upsertVocabularyRecord({ type: 'word', text: 'hello' }, { now: 10, deviceId: 'web' });
  assert.throws(() => upsertVocabularyRecord({ type: 'word', text: 'world' }, {
    now: 20,
    deviceId: 'web',
    current,
  }), /不能直接修改/);
});
