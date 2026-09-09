import { RECORD_TYPES, clone, requireDeviceId, requireTimestamp } from '../model.js';

const FORBIDDEN_KEYS = new Set(['apikey', 'authorization', 'xapikey']);

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[_-]/g, '');
}

export function containsSecret(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSecret);
  return Object.entries(value).some(([key, child]) => (
    FORBIDDEN_KEYS.has(normalizedKey(key)) || containsSecret(child)
  ));
}

export function validateRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('同步记录必须是对象');
  }
  const id = String(value.id || '').trim();
  const type = String(value.type || '').trim();
  if (!id) throw new Error('同步记录 id 不能为空');
  if (!RECORD_TYPES.has(type)) throw new Error(`不支持的同步记录类型: ${type || '空'}`);
  const updatedAt = requireTimestamp(value.updatedAt);
  const deviceId = requireDeviceId(value.deviceId);
  const deletedAt = value.deletedAt == null ? null : requireTimestamp(value.deletedAt, 'deletedAt');
  if (deletedAt == null && (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload))) {
    throw new Error('活动同步记录必须包含 payload');
  }
  if (deletedAt != null && value.payload != null) throw new Error('删除记录的 payload 必须为 null');
  if (containsSecret(value.payload)) throw new Error('同步记录包含敏感认证字段');
  return { id, type, updatedAt, deviceId, deletedAt, payload: clone(value.payload) };
}

function recordKey(record) {
  return `${record.type}\u0000${record.id}`;
}

export function chooseNewest(left, right) {
  const a = validateRecord(left);
  const b = validateRecord(right);
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if ((a.deletedAt != null) !== (b.deletedAt != null)) return a.deletedAt != null ? a : b;
  return a.deviceId >= b.deviceId ? a : b;
}

export function mergeRecords(current = [], incoming = []) {
  const merged = new Map();
  for (const raw of [...current, ...incoming]) {
    const record = validateRecord(raw);
    const key = recordKey(record);
    merged.set(key, merged.has(key) ? chooseNewest(merged.get(key), record) : record);
  }
  return [...merged.values()].sort((a, b) => (
    a.type.localeCompare(b.type) || a.id.localeCompare(b.id)
  ));
}

export function activeRecords(records, type) {
  return mergeRecords(records).filter(record => record.type === type && record.deletedAt == null);
}

export function tombstoneRecord(record, { now, deviceId }) {
  const current = validateRecord(record);
  const timestamp = requireTimestamp(now, 'now');
  return {
    id: current.id,
    type: current.type,
    updatedAt: timestamp,
    deviceId: requireDeviceId(deviceId),
    deletedAt: timestamp,
    payload: null,
  };
}
