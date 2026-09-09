import test from 'node:test';
import assert from 'node:assert/strict';

import {
  archiveBookPath,
  safeBookArchivePath,
  uniqueBookFilename,
  validateBookManifest,
} from '../../shared/core/sync/book-archive.js';

const BOOK_ID = `sha256:${'a'.repeat(64)}`;

test('book manifest accepts a safe selected book', () => {
  const result = validateBookManifest([{
    bookId: BOOK_ID,
    filename: '傲慢与偏见.epub',
    archivePath: 'books/0001.epub',
    size: 100,
    mediaType: 'application/epub+zip',
  }]);
  assert.equal(result[0].filename, '傲慢与偏见.epub');
  assert.equal(archiveBookPath(0, '傲慢与偏见.epub'), 'books/0001.epub');
});

test('unsafe, duplicate and oversized manifest entries are rejected', () => {
  assert.equal(safeBookArchivePath('../secret.txt'), false);
  assert.throws(() => validateBookManifest([{
    bookId: BOOK_ID,
    filename: 'book.txt',
    archivePath: 'books/../secret.txt',
    size: 1,
  }]), /路径/);
  assert.throws(() => validateBookManifest([{
    bookId: BOOK_ID,
    filename: 'book.exe',
    archivePath: 'books/0001.exe',
    size: 1,
  }]), /格式/);
});

test('same-name different books get a deterministic available filename', () => {
  assert.equal(uniqueBookFilename('book.epub', new Set(['book.epub', 'book (2).epub'])), 'book (3).epub');
});
