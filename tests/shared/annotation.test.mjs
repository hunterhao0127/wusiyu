import test from 'node:test';
import assert from 'node:assert/strict';

import {
  annotationsForBook,
  annotationsToMarkdown,
  createAnnotationRecord,
  deleteAnnotationRecord,
  overlappingAnnotation,
  resolveAnnotation,
  updateAnnotationRecord,
} from '../../shared/core/reader/annotation.js';
import { exportBackup, parseBackup } from '../../shared/core/sync/backup.js';

const blockText = 'It allows us to share our thoughts and express our emotions.';

function annotation(options = {}) {
  return createAnnotationRecord({
    bookId: 'sha256:book',
    bookAliases: ['legacy-file:book.epub'],
    blockIndex: 3,
    blockText,
    startOffset: 16,
    endOffset: 34,
    chapterTitle: 'Chapter 1',
    color: 'yellow',
    note: '',
    ...options,
  }, { id: 'one', now: 10, deviceId: 'web' });
}

test('annotation create, edit and tombstone keep one shared record shape', () => {
  const created = annotation();
  assert.equal(created.id, 'annotation:one');
  assert.equal(created.payload.quote, 'share our thoughts');
  const updated = updateAnnotationRecord(created, { color: 'blue', note: '重点表达' }, { now: 20, deviceId: 'web' });
  assert.equal(updated.payload.note, '重点表达');
  assert.equal(updated.payload.color, 'blue');
  assert.equal(deleteAnnotationRecord(updated, { now: 30, deviceId: 'web' }).deletedAt, 30);
  assert.throws(() => updateAnnotationRecord(created, { note: 'x'.repeat(10001) }, { now: 20, deviceId: 'web' }), /10000/);
});

test('book aliases match and partial overlaps are detected', () => {
  const created = annotation();
  assert.equal(annotationsForBook([created], { bookId: 'new-id', bookAliases: ['legacy-file:book.epub'] }).length, 1);
  assert.equal(overlappingAnnotation([created], { blockIndex: 3, startOffset: 20, endOffset: 40 })?.id, created.id);
  assert.equal(overlappingAnnotation([created], { blockIndex: 4, startOffset: 20, endOffset: 40 }), null);
});

test('annotation resolves directly, moves by quote and refuses ambiguous matches', () => {
  const created = annotation();
  const blocks = [{ text: '' }, { text: '' }, { text: '' }, { text: blockText }];
  assert.deepEqual(resolveAnnotation(created, blocks), { blockIndex: 3, startOffset: 16, endOffset: 34, moved: false });
  const moved = [{ text: '' }, { text: '' }, { text: blockText }, { text: 'changed' }];
  assert.deepEqual(resolveAnnotation(created, moved), { blockIndex: 2, startOffset: 16, endOffset: 34, moved: true });
  const ambiguous = [{ text: '' }, { text: blockText }, { text: blockText }, { text: 'changed' }];
  assert.equal(resolveAnnotation(created, ambiguous), null);
});

test('annotation survives JSON backup without secrets and exports Markdown', () => {
  const created = annotation({ note: '一条批注' });
  const backup = exportBackup([created], { deviceId: 'web', exportedAt: '2026-09-19T00:00:00.000Z' });
  assert.deepEqual(parseBackup(backup, { deviceId: 'mac', now: 20 }), [created]);
  assert.match(annotationsToMarkdown([created], { bookTitle: 'Book #1' }), /^# Book \\#1 · 批注/m);
  assert.match(annotationsToMarkdown([created]), /> share our thoughts\n\n批注：一条批注/);
});
