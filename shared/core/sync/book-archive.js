export const BOOK_ARCHIVE_LIMITS = Object.freeze({
  maxBooks: 200,
  maxBookBytes: 100 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
});

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.epub', '.pdf', '.docx', '.html', '.htm']);

export function safeBookArchivePath(path) {
  const value = String(path || '').replace(/\\/g, '/');
  return value.startsWith('books/')
    && !value.startsWith('/')
    && !value.endsWith('/')
    && !value.split('/').includes('..');
}

export function bookExtension(filename) {
  const name = String(filename || '').split(/[\\/]/).pop();
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : '';
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : '';
}

export function archiveBookPath(index, filename) {
  const extension = bookExtension(filename);
  if (!extension) throw new Error('书籍文件名或格式无效');
  return `books/${String(index + 1).padStart(4, '0')}${extension}`;
}

export function validateBookManifest(items, limits = BOOK_ARCHIVE_LIMITS) {
  if (!Array.isArray(items) || items.length === 0 || items.length > limits.maxBooks) {
    throw new Error('书籍清单为空或超过上限');
  }
  const paths = new Set();
  let totalSize = 0;
  const result = items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('书籍清单无效');
    const filename = String(item.filename || '').split(/[\\/]/).pop();
    const archivePath = String(item.archivePath || '').replace(/\\/g, '/');
    const size = Number(item.size);
    const bookId = String(item.bookId || '');
    if (!filename || !bookExtension(filename)) throw new Error('书籍文件名或格式无效');
    if (!safeBookArchivePath(archivePath) || paths.has(archivePath)) throw new Error('书籍压缩路径无效');
    if (!/^sha256:[0-9a-f]{64}$/i.test(bookId)) throw new Error('书籍身份无效');
    if (!Number.isFinite(size) || size < 0 || size > limits.maxBookBytes) throw new Error('书籍大小超过上限');
    paths.add(archivePath);
    totalSize += size;
    return { bookId: bookId.toLowerCase(), filename, archivePath, size, mediaType: String(item.mediaType || '') };
  });
  if (totalSize > limits.maxTotalBytes) throw new Error('备份中书籍总大小超过 500 MB');
  return result;
}

export function uniqueBookFilename(filename, usedNames) {
  if (!usedNames.has(filename)) return filename;
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  let number = 2;
  while (usedNames.has(`${base} (${number})${extension}`)) number++;
  return `${base} (${number})${extension}`;
}
