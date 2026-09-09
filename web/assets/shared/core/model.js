export const RECORD_TYPES = new Set([
  'vocabulary',
  'reading-position',
  'reading-settings',
  'learning-settings',
  'ai-settings',
]);

export function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function vocabularyId(type, text) {
  const normalizedType = String(type || '').trim();
  const normalizedText = normalizeText(text);
  if (!['word', 'phrase', 'sentence'].includes(normalizedType) || !normalizedText) {
    throw new Error('无效的单词本内容');
  }
  return `${normalizedType}:${normalizedText}`;
}

export function legacyBookAlias(filename, size) {
  const name = normalizeText(filename);
  const suffix = Number.isFinite(Number(size)) ? `:${Number(size)}` : '';
  return `legacy-file:${name}${suffix}`;
}

export function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

export function requireTimestamp(value, name = 'updatedAt') {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} 无效`);
  return number;
}

export function requireDeviceId(value) {
  const deviceId = String(value || '').trim();
  if (!deviceId) throw new Error('deviceId 不能为空');
  return deviceId;
}

export function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
