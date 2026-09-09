import { clone, requireDeviceId, requireTimestamp } from '../model.js';
import { activeRecords, validateRecord } from '../sync/records.js';

export const REVIEW_RATINGS = Object.freeze(['forgot', 'fuzzy', 'remembered']);
export const DEFAULT_DAILY_NEW_LIMIT = 10;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function dateKeyAt(timestamp) {
  const date = new Date(requireTimestamp(timestamp, 'timestamp'));
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizedReviews(value) {
  if (!Array.isArray(value)) return [];
  return value.map(review => {
    const rating = String(review?.rating || '');
    if (!REVIEW_RATINGS.includes(rating)) throw new Error('复习评分无效');
    return {
      id: String(review.id || ''),
      reviewedAt: requireTimestamp(review.reviewedAt, 'reviewedAt'),
      dateKey: String(review.dateKey || dateKeyAt(review.reviewedAt)),
      rating,
      wasNew: Boolean(review.wasNew),
      mistakeCorrections: Math.max(0, Math.floor(Number(review.mistakeCorrections) || 0)),
    };
  }).filter(review => review.id).sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id));
}

export function learningState(value = {}) {
  const reviews = normalizedReviews(value?.reviews);
  let intervalDays = 0;
  let dueAt = null;
  let status = 'new';
  for (const review of reviews) {
    if (review.rating === 'forgot') {
      intervalDays = 0;
      dueAt = review.reviewedAt + 10 * MINUTE;
      status = 'learning';
    } else if (review.rating === 'fuzzy') {
      intervalDays = intervalDays ? Math.max(1, Math.round(intervalDays * 1.5)) : 1;
      dueAt = review.reviewedAt + intervalDays * DAY;
      status = 'learning';
    } else {
      intervalDays = intervalDays ? Math.max(3, Math.round(intervalDays * 2.5)) : 3;
      dueAt = review.reviewedAt + intervalDays * DAY;
      status = 'review';
    }
  }

  const dismissedAt = value?.difficultyDismissedAt == null
    ? null
    : requireTimestamp(value.difficultyDismissedAt, 'difficultyDismissedAt');
  const recent = reviews.filter(review => dismissedAt == null || review.reviewedAt > dismissedAt);
  const lastTwo = recent.slice(-2);
  const automaticDifficult = lastTwo.length === 2 && (
    lastTwo.every(review => review.rating === 'forgot') ||
    lastTwo.every(review => review.mistakeCorrections > 0)
  );

  return {
    status,
    dueAt,
    intervalDays,
    reviews,
    manualDifficult: Boolean(value?.manualDifficult),
    difficultyDismissedAt: dismissedAt,
    difficult: Boolean(value?.manualDifficult) || automaticDifficult,
  };
}

function reviewedVocabularyRecord(current, payload, now, deviceId) {
  const record = validateRecord(current);
  if (record.type !== 'vocabulary' || record.deletedAt != null) throw new Error('只能复习有效的单词本记录');
  return {
    ...record,
    updatedAt: requireTimestamp(now, 'now'),
    deviceId: requireDeviceId(deviceId),
    payload: { ...clone(record.payload), learning: learningState(payload.learning) },
  };
}

export function rateVocabularyRecord(current, { rating, now, deviceId }) {
  if (!REVIEW_RATINGS.includes(rating)) throw new Error('复习评分无效');
  const record = validateRecord(current);
  const learning = learningState(record.payload?.learning);
  const timestamp = requireTimestamp(now, 'now');
  const device = requireDeviceId(deviceId);
  learning.reviews.push({
    id: `${record.id}:${timestamp}:${device}`,
    reviewedAt: timestamp,
    dateKey: dateKeyAt(timestamp),
    rating,
    wasNew: learning.reviews.length === 0,
    mistakeCorrections: 0,
  });
  return reviewedVocabularyRecord(record, { learning }, timestamp, device);
}

export function reviseVocabularyReviewRecord(current, { reviewId, rating, asMistake = false, now, deviceId }) {
  if (!REVIEW_RATINGS.includes(rating)) throw new Error('复习评分无效');
  const record = validateRecord(current);
  const learning = learningState(record.payload?.learning);
  const target = learning.reviews.find(review => review.id === reviewId);
  if (!target) throw new Error('找不到要修正的复习记录');
  target.rating = rating;
  if (asMistake) target.mistakeCorrections += 1;
  return reviewedVocabularyRecord(record, { learning }, now, deviceId);
}

export function setVocabularyDifficultyRecord(current, difficult, { now, deviceId }) {
  const record = validateRecord(current);
  const learning = learningState(record.payload?.learning);
  learning.manualDifficult = Boolean(difficult);
  learning.difficultyDismissedAt = difficult ? null : requireTimestamp(now, 'now');
  return reviewedVocabularyRecord(record, { learning }, now, deviceId);
}

export function learningSettings(records) {
  const payload = activeRecords(records, 'learning-settings')[0]?.payload || {};
  const value = Math.floor(Number(payload.dailyNewLimit));
  return { dailyNewLimit: Number.isFinite(value) && value >= 0 ? value : DEFAULT_DAILY_NEW_LIMIT };
}

export function upsertLearningSettingsRecord(records, dailyNewLimit, { now, deviceId }) {
  const value = Math.floor(Number(dailyNewLimit));
  if (!Number.isFinite(value) || value < 0) throw new Error('每日新词数必须是非负整数');
  return {
    id: 'learning-settings:default',
    type: 'learning-settings',
    updatedAt: requireTimestamp(now, 'now'),
    deviceId: requireDeviceId(deviceId),
    deletedAt: null,
    payload: { dailyNewLimit: value },
  };
}

function reviewableRecords(records) {
  return activeRecords(records, 'vocabulary').filter(record => ['word', 'phrase'].includes(record.payload.type));
}

export function buildReviewQueue(records, { now, dailyNewLimit = learningSettings(records).dailyNewLimit } = {}) {
  const timestamp = requireTimestamp(now ?? Date.now(), 'now');
  const today = dateKeyAt(timestamp);
  const cards = reviewableRecords(records);
  const usedToday = cards.reduce((count, record) => count + learningState(record.payload.learning).reviews
    .filter(review => review.wasNew && review.dateKey === today).length, 0);
  const remainingNew = Math.max(0, Math.floor(Number(dailyNewLimit) || 0) - usedToday);
  const due = [];
  const fresh = [];
  for (const record of cards) {
    const learning = learningState(record.payload.learning);
    if (!learning.reviews.length) fresh.push(record);
    else if (learning.dueAt <= timestamp) due.push(record);
  }
  due.sort((a, b) => learningState(a.payload.learning).dueAt - learningState(b.payload.learning).dueAt || a.id.localeCompare(b.id));
  fresh.sort((a, b) => Number(a.payload.addedAt || 0) - Number(b.payload.addedAt || 0) || a.id.localeCompare(b.id));
  return [...due, ...fresh.slice(0, remainingNew)];
}

function previousDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) - DAY);
  return date.toISOString().slice(0, 10);
}

export function reviewStats(records, { now } = {}) {
  const timestamp = requireTimestamp(now ?? Date.now(), 'now');
  const today = dateKeyAt(timestamp);
  const cards = reviewableRecords(records);
  const reviews = cards.flatMap(record => learningState(record.payload.learning).reviews);
  const todayReviews = reviews.filter(review => review.dateKey === today);
  const rememberedToday = todayReviews.filter(review => review.rating !== 'forgot').length;
  const activeDays = new Set(reviews.map(review => review.dateKey));
  let streak = 0;
  let cursor = today;
  while (activeDays.has(cursor)) {
    streak++;
    cursor = previousDateKey(cursor);
  }
  return {
    completedToday: todayReviews.length,
    retentionToday: todayReviews.length ? Math.round(rememberedToday / todayReviews.length * 100) : 0,
    streakDays: streak,
    next7Days: cards.filter(record => {
      const dueAt = learningState(record.payload.learning).dueAt;
      return dueAt != null && dueAt > timestamp && dueAt <= timestamp + 7 * DAY;
    }).length,
    difficultCount: cards.filter(record => learningState(record.payload.learning).difficult).length,
  };
}
