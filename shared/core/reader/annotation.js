import { clone, requireDeviceId, requireTimestamp } from '../model.js';
import { activeRecords, mergeRecords, tombstoneRecord, validateRecord } from '../sync/records.js';

export const ANNOTATION_COLORS = ['yellow', 'green', 'blue', 'pink'];
const CONTEXT_LENGTH = 32;

function text(value) {
  return String(value || '');
}

function normalizeColor(value) {
  const color = text(value).trim();
  if (!ANNOTATION_COLORS.includes(color)) throw new Error('批注颜色无效');
  return color;
}

function normalizeNote(value) {
  const note = text(value).trim();
  if (note.length > 10000) throw new Error('批注最多 10000 个字符');
  return note;
}

function normalizeBookAliases(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => text(item).trim()).filter(Boolean))];
}

function normalizeAnchor(input) {
  const blockText = text(input.blockText);
  let startOffset = Number(input.startOffset);
  let endOffset = Number(input.endOffset);
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0 || endOffset <= startOffset || endOffset > blockText.length) {
    throw new Error('批注位置无效');
  }
  while (startOffset < endOffset && /\s/.test(blockText[startOffset])) startOffset++;
  while (endOffset > startOffset && /\s/.test(blockText[endOffset - 1])) endOffset--;
  const quote = blockText.slice(startOffset, endOffset);
  if (!quote || quote.length > 500) throw new Error('请选择 1–500 个字符');
  return {
    blockIndex: Number(input.blockIndex),
    startOffset,
    endOffset,
    quote,
    prefix: blockText.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset),
    suffix: blockText.slice(endOffset, endOffset + CONTEXT_LENGTH),
  };
}

export function createAnnotationRecord(input, { id, now, deviceId }) {
  const recordId = text(id).trim();
  const bookId = text(input.bookId).trim();
  const blockIndex = Number(input.blockIndex);
  if (!recordId) throw new Error('批注 id 不能为空');
  if (!bookId) throw new Error('批注必须属于一本书');
  if (!Number.isInteger(blockIndex) || blockIndex < 0) throw new Error('批注段落无效');
  const timestamp = requireTimestamp(now, 'now');
  const anchor = normalizeAnchor(input);
  return validateRecord({
    id: recordId.startsWith('annotation:') ? recordId : `annotation:${recordId}`,
    type: 'annotation',
    updatedAt: timestamp,
    deviceId: requireDeviceId(deviceId),
    deletedAt: null,
    payload: {
      bookId,
      bookAliases: normalizeBookAliases(input.bookAliases),
      chapterTitle: text(input.chapterTitle).trim(),
      color: normalizeColor(input.color || 'yellow'),
      note: normalizeNote(input.note),
      createdAt: timestamp,
      ...anchor,
    },
  });
}

export function updateAnnotationRecord(record, changes, { now, deviceId }) {
  const current = validateRecord(record);
  if (current.type !== 'annotation' || current.deletedAt != null) throw new Error('批注不存在');
  const timestamp = requireTimestamp(now, 'now');
  return validateRecord({
    ...current,
    updatedAt: timestamp,
    deviceId: requireDeviceId(deviceId),
    payload: {
      ...current.payload,
      color: changes.color == null ? current.payload.color : normalizeColor(changes.color),
      note: changes.note == null ? current.payload.note : normalizeNote(changes.note),
    },
  });
}

export function deleteAnnotationRecord(record, options) {
  const current = validateRecord(record);
  if (current.type !== 'annotation') throw new Error('不是批注记录');
  return tombstoneRecord(current, options);
}

function bookKeys(book) {
  return new Set([book?.bookId, ...(book?.bookAliases || [])].map(item => text(item).trim()).filter(Boolean));
}

export function annotationsForBook(records, book) {
  const keys = bookKeys(book);
  return activeRecords(records, 'annotation').filter(record => {
    const payloadKeys = bookKeys(record.payload);
    return [...payloadKeys].some(key => keys.has(key));
  }).sort((left, right) => (
    left.payload.blockIndex - right.payload.blockIndex
    || left.payload.startOffset - right.payload.startOffset
    || left.payload.createdAt - right.payload.createdAt
  ));
}

export function overlappingAnnotation(records, candidate) {
  return records.find(record => record.payload.blockIndex === candidate.blockIndex
    && candidate.startOffset < record.payload.endOffset
    && candidate.endOffset > record.payload.startOffset) || null;
}

function quoteMatches(blockText, quote) {
  const indexes = [];
  let index = blockText.indexOf(quote);
  while (index !== -1) {
    indexes.push(index);
    index = blockText.indexOf(quote, index + 1);
  }
  return indexes;
}

function contextMatches(blockText, index, payload) {
  const before = blockText.slice(Math.max(0, index - payload.prefix.length), index);
  const after = blockText.slice(index + payload.quote.length, index + payload.quote.length + payload.suffix.length);
  return (!payload.prefix || before === payload.prefix) && (!payload.suffix || after === payload.suffix);
}

export function resolveAnnotation(record, blocks, { neighborRadius = 2 } = {}) {
  const payload = record?.payload || record;
  const directText = text(blocks?.[payload.blockIndex]?.text);
  if (directText.slice(payload.startOffset, payload.endOffset) === payload.quote) {
    return { blockIndex: payload.blockIndex, startOffset: payload.startOffset, endOffset: payload.endOffset, moved: false };
  }
  const candidates = [];
  const first = Math.max(0, payload.blockIndex - neighborRadius);
  const last = Math.min((blocks?.length || 0) - 1, payload.blockIndex + neighborRadius);
  for (let blockIndex = first; blockIndex <= last; blockIndex++) {
    const blockText = text(blocks[blockIndex]?.text);
    for (const startOffset of quoteMatches(blockText, payload.quote)) {
      if (contextMatches(blockText, startOffset, payload)) {
        candidates.push({ blockIndex, startOffset, endOffset: startOffset + payload.quote.length, moved: true });
      }
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function markdownHeading(value) {
  return text(value).replace(/([\\`*_{}[\]<>()#+.!|>-])/g, '\\$1').trim();
}

export function annotationsToMarkdown(records, { bookTitle = '未命名书籍' } = {}) {
  const active = mergeRecords(records).filter(record => record.type === 'annotation' && record.deletedAt == null);
  const lines = [`# ${markdownHeading(bookTitle)} · 批注`, ''];
  for (const record of active.sort((a, b) => a.payload.blockIndex - b.payload.blockIndex || a.payload.startOffset - b.payload.startOffset)) {
    const payload = clone(record.payload);
    lines.push(`## ${markdownHeading(payload.chapterTitle || `第 ${payload.blockIndex + 1} 段`)}`, '');
    lines.push(...payload.quote.split('\n').map(line => `> ${line}`), '');
    if (payload.note) lines.push(`批注：${payload.note}`, '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
