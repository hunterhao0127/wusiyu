export function createDesktopStorageAdapter(fetchImpl = globalThis.fetch, baseUrl = '') {
  if (typeof fetchImpl !== 'function') throw new Error('桌面端网络接口不可用');

  async function request(method, body) {
    const response = await fetchImpl(`${baseUrl}/api/sync-records`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || `同步数据请求失败: HTTP ${response.status}`);
    return result;
  }

  async function readRecords(types = []) {
    const result = await request('GET');
    const wanted = new Set(types);
    return (result.records || []).filter(record => wanted.size === 0 || wanted.has(record.type));
  }

  async function writeRecords(records) {
    await request('PUT', { records });
  }

  return { readRecords, writeRecords };
}
