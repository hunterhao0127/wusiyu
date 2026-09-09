import { mergeRecords } from '../core/sync/records.js';

const DB_NAME = 'wusiyu_books';
const DB_VERSION = 2;

export function createWebStorageAdapter(indexedDBFactory = globalThis.indexedDB) {
  if (!indexedDBFactory) throw new Error('当前浏览器不支持 IndexedDB');
  let databasePromise = null;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDBFactory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('books')) {
          const books = db.createObjectStore('books', { keyPath: 'filename' });
          books.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('records')) {
          const records = db.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('type', 'type', { unique: false });
          records.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = event => resolve(event.target.result);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error('无法打开本地数据库'));
      };
      request.onblocked = () => reject(new Error('本地数据库升级被其他页面阻止，请关闭其他务思语页面后重试'));
    });
    return databasePromise;
  }

  async function readRecords(types = []) {
    const db = await openDatabase();
    const records = await new Promise((resolve, reject) => {
      const transaction = db.transaction('records', 'readonly');
      const request = transaction.objectStore('records').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('读取同步数据失败'));
    });
    const wanted = new Set(types);
    return mergeRecords(records).filter(record => wanted.size === 0 || wanted.has(record.type));
  }

  async function writeRecords(records) {
    const normalized = mergeRecords(records);
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('records', 'readwrite');
      const store = transaction.objectStore('records');
      store.clear();
      for (const record of normalized) store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('保存同步数据失败'));
      transaction.onabort = () => reject(transaction.error || new Error('保存同步数据已取消'));
    });
  }

  return { openDatabase, readRecords, writeRecords };
}
