import { clone, legacyBookAlias, requireDeviceId, requireTimestamp } from '../model.js';
import { upsertVocabularyRecord } from '../learning/vocabulary.js';
import { legacyReadingPosition } from '../reader/reading-position.js';
import { containsSecret, mergeRecords, validateRecord } from './records.js';

export const BACKUP_FORMAT = 'wusiyu-learning-backup';
export const BACKUP_VERSION = 2;

function settingsRecord(type, id, payload, { now, deviceId }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || containsSecret(payload)) return null;
  return validateRecord({ id, type, updatedAt: now, deviceId, deletedAt: null, payload: clone(payload) });
}

export function exportBackup(records, { deviceId, exportedAt = new Date().toISOString() }) {
  const device = requireDeviceId(deviceId);
  const safeRecords = mergeRecords(records);
  if (containsSecret(safeRecords)) throw new Error('同步数据包含敏感认证字段');
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: String(exportedAt),
    sourceDeviceId: device,
    records: safeRecords,
  };
}

export function migrateV1Backup(backup, { deviceId, now, legacyBooks = {} }) {
  const device = requireDeviceId(deviceId);
  const timestamp = requireTimestamp(now, 'now');
  const data = backup?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('v1 备份数据无效');
  const records = [];

  for (const entry of Object.values(data.wordbook || {})) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const entryTime = Number.isFinite(Number(entry.addedAt)) ? Number(entry.addedAt) : timestamp;
    records.push(upsertVocabularyRecord(entry, { now: entryTime, deviceId: device }));
  }

  for (const [filename, value] of Object.entries(data.history || {})) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const book = legacyBooks[filename] || null;
    records.push(legacyReadingPosition(filename, value, { now: timestamp, deviceId: device, book }));
  }

  const readingSettings = settingsRecord('reading-settings', 'reading-settings:default', data.settings, {
    now: timestamp,
    deviceId: device,
  });
  if (readingSettings) records.push(readingSettings);

  const ai = data.ai && typeof data.ai === 'object' ? {
    provider: String(data.ai.provider || ''),
    api_base: String(data.ai.api_base || ''),
    model: String(data.ai.model || ''),
  } : null;
  const aiSettings = settingsRecord('ai-settings', 'ai-settings:default', ai, {
    now: timestamp,
    deviceId: device,
  });
  if (aiSettings) records.push(aiSettings);

  return mergeRecords(records);
}

export function parseBackup(input, options) {
  const backup = typeof input === 'string' ? JSON.parse(input) : clone(input);
  if (!backup || typeof backup !== 'object' || Array.isArray(backup) || backup.format !== BACKUP_FORMAT) {
    throw new Error('不是有效的务思语学习数据备份');
  }
  if (backup.version === 1) return migrateV1Backup(backup, options);
  if (backup.version !== BACKUP_VERSION) throw new Error(`不支持的备份版本: ${backup.version}`);
  if (!Array.isArray(backup.records)) throw new Error('备份 records 必须是数组');
  if (containsSecret(backup.records)) throw new Error('备份包含敏感认证字段');
  return mergeRecords(backup.records);
}

export function mergeBackup(currentRecords, input, options) {
  return mergeRecords(currentRecords, parseBackup(input, options));
}

export function legacyBookMap(books = []) {
  const result = {};
  for (const book of books) {
    if (!book?.filename) continue;
    result[book.filename] = {
      bookId: book.bookId || legacyBookAlias(book.filename, book.size),
      size: book.size,
      blockCount: Array.isArray(book.blocks) ? book.blocks.length : 0,
      textAnchor: '',
    };
  }
  return result;
}
