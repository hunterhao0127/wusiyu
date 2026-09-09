import { clone, requireDeviceId, requireTimestamp, vocabularyId } from '../model.js';
import { mergeRecords, validateRecord } from '../sync/records.js';

function normalizeEntry(entry, now, existingAddedAt, existingLearning) {
  const type = String(entry?.type || '').trim();
  const text = String(entry?.text || '').trim();
  const id = vocabularyId(type, text);
  return {
    id,
    type,
    text,
    translation: String(entry?.translation || ''),
    sentence: String(entry?.sentence || ''),
    source: String(entry?.source || ''),
    addedAt: requireTimestamp(existingAddedAt ?? entry?.addedAt ?? now, 'addedAt'),
    updatedAt: now,
    learning: clone(existingLearning ?? entry?.learning ?? {}),
  };
}

export function upsertVocabularyRecord(entry, { now, deviceId, current = null }) {
  const timestamp = requireTimestamp(now, 'now');
  const device = requireDeviceId(deviceId);
  const previous = current ? validateRecord(current) : null;
  if (previous && previous.type !== 'vocabulary') throw new Error('当前记录不是单词本记录');
  const payload = normalizeEntry(entry, timestamp, previous?.payload?.addedAt, previous?.payload?.learning);
  if (previous && previous.id !== payload.id) throw new Error('不能直接修改单词或类型');
  return {
    id: payload.id,
    type: 'vocabulary',
    updatedAt: timestamp,
    deviceId: device,
    deletedAt: null,
    payload,
  };
}

export function deleteVocabularyRecord(current, { now, deviceId }) {
  const previous = validateRecord(current);
  if (previous.type !== 'vocabulary') throw new Error('当前记录不是单词本记录');
  const timestamp = requireTimestamp(now, 'now');
  return {
    id: previous.id,
    type: 'vocabulary',
    updatedAt: timestamp,
    deviceId: requireDeviceId(deviceId),
    deletedAt: timestamp,
    payload: null,
  };
}

export function vocabularyObject(records) {
  const result = {};
  for (const valid of mergeRecords(records)) {
    if (valid.type === 'vocabulary' && valid.deletedAt == null) {
      result[valid.id] = clone(valid.payload);
    }
  }
  return result;
}
