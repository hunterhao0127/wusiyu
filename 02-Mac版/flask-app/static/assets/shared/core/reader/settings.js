import { requireDeviceId, requireTimestamp } from '../model.js';

export const DEFAULT_READER_SETTINGS = Object.freeze({
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.9,
  wordbookTheme: 'classic',
  readingMode: 'paged',
  twoColumn: false,
  pageMargin: 20,
  paragraphSpacing: 6,
});

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

export function normalizeReaderSettings(value = {}) {
  return {
    theme: ['light', 'sepia', 'dark'].includes(value.theme) ? value.theme : DEFAULT_READER_SETTINGS.theme,
    fontSize: Math.round(clamp(value.fontSize, 14, 28, DEFAULT_READER_SETTINGS.fontSize)),
    lineHeight: Math.round(clamp(value.lineHeight, 1.4, 2.6, DEFAULT_READER_SETTINGS.lineHeight) * 10) / 10,
    wordbookTheme: ['classic', 'gentle', 'minimal'].includes(value.wordbookTheme) ? value.wordbookTheme : DEFAULT_READER_SETTINGS.wordbookTheme,
    readingMode: value.readingMode === 'scroll' ? 'scroll' : DEFAULT_READER_SETTINGS.readingMode,
    twoColumn: value.twoColumn === true,
    pageMargin: Math.round(clamp(value.pageMargin, 0, 64, DEFAULT_READER_SETTINGS.pageMargin)),
    paragraphSpacing: Math.round(clamp(value.paragraphSpacing, 0, 32, DEFAULT_READER_SETTINGS.paragraphSpacing)),
  };
}

export function createReadingSettingsRecord(settings, { now, deviceId }) {
  const timestamp = requireTimestamp(now, 'now');
  return {
    id: 'reading-settings:default',
    type: 'reading-settings',
    updatedAt: timestamp,
    deviceId: requireDeviceId(deviceId),
    deletedAt: null,
    payload: normalizeReaderSettings(settings),
  };
}

export function readingProgress(blockIndex, blockCount) {
  const total = Math.max(0, Math.trunc(Number(blockCount) || 0));
  if (total <= 1) return total === 1 ? 1 : 0;
  return Math.min(1, Math.max(0, Number(blockIndex) / (total - 1)));
}
