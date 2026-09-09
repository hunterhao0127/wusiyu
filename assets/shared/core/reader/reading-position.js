import { clampProgress, legacyBookAlias, normalizeText, requireDeviceId, requireTimestamp } from '../model.js';

export function normalizeAnchor(value) {
  return normalizeText(value).replace(/\s+/g, ' ').slice(0, 160);
}

export function createReadingPositionRecord(position, { now, deviceId }) {
  const bookId = String(position?.bookId || '').trim();
  if (!bookId) throw new Error('bookId 不能为空');
  const timestamp = requireTimestamp(now, 'now');
  const blockIndex = Math.max(0, Math.trunc(Number(position?.blockIndex) || 0));
  const payload = {
    id: `reading-position:${bookId}`,
    bookId,
    bookAliases: [...new Set((position?.bookAliases || []).map(String).filter(Boolean))],
    blockIndex,
    progress: clampProgress(position?.progress),
    chapterTitle: String(position?.chapterTitle || ''),
    textAnchor: normalizeAnchor(position?.textAnchor),
    updatedAt: timestamp,
  };
  return {
    id: payload.id,
    type: 'reading-position',
    updatedAt: timestamp,
    deviceId: requireDeviceId(deviceId),
    deletedAt: null,
    payload,
  };
}

export function legacyReadingPosition(filename, value, { now, deviceId, book = null }) {
  const timestamp = requireTimestamp(value?.timestamp ?? now, 'timestamp');
  const size = book?.size;
  const alias = legacyBookAlias(filename, size);
  const bookId = String(book?.bookId || alias);
  const blockCount = Math.max(0, Number(book?.blockCount) || 0);
  const blockIndex = Math.max(0, Math.trunc(Number(value?.paraIndex) || 0));
  return createReadingPositionRecord({
    bookId,
    bookAliases: [alias, legacyBookAlias(filename)],
    blockIndex,
    progress: blockCount > 1 ? blockIndex / (blockCount - 1) : 0,
    chapterTitle: '',
    textAnchor: book?.textAnchor || '',
  }, { now: timestamp, deviceId });
}

export function resolveReadingPosition(position, blocks = []) {
  const payload = position?.payload || position;
  if (!payload || blocks.length === 0) return { blockIndex: 0, strategy: 'empty' };
  const anchor = normalizeAnchor(payload.textAnchor);
  if (anchor) {
    const index = blocks.findIndex(block => normalizeAnchor(block?.text || block).includes(anchor));
    if (index >= 0) return { blockIndex: index, strategy: 'anchor' };
  }
  const blockIndex = Math.trunc(Number(payload.blockIndex));
  if (Number.isInteger(blockIndex) && blockIndex >= 0 && blockIndex < blocks.length) {
    return { blockIndex, strategy: 'block' };
  }
  return {
    blockIndex: Math.round(clampProgress(payload.progress) * Math.max(0, blocks.length - 1)),
    strategy: 'progress',
  };
}
