import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'core/model.js',
  'core/learning/vocabulary.js',
  'core/learning/review.js',
  'core/reader/reading-position.js',
  'core/reader/settings.js',
  'core/sync/records.js',
  'core/sync/backup.js',
  'core/sync/book-archive.js',
  'adapters/web-storage.js',
  'adapters/desktop-storage.js',
  'ui/review-panel.js',
  'ui/reader-controls.js',
];
const destinations = [
  path.join(root, 'web/assets/shared'),
  path.join(root, '02-Mac版/flask-app/static/assets/shared'),
];
const checkOnly = process.argv.includes('--check');

for (const destination of destinations) {
  for (const relative of files) {
    const source = path.join(root, 'shared', relative);
    const target = path.join(destination, relative);
    const content = await readFile(source);
    if (checkOnly) {
      let generated;
      try {
        generated = await readFile(target);
      } catch {
        throw new Error(`缺少共享发布文件: ${path.relative(root, target)}`);
      }
      if (!content.equals(generated)) throw new Error(`共享发布文件已漂移: ${path.relative(root, target)}`);
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
}

console.log(checkOnly ? '共享发布文件一致' : '共享发布文件已更新');
