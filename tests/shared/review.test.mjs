import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertVocabularyRecord } from '../../shared/core/learning/vocabulary.js';
import {
  buildReviewQueue,
  learningSettings,
  learningState,
  rateVocabularyRecord,
  reviewStats,
  reviseVocabularyReviewRecord,
  setVocabularyDifficultyRecord,
  upsertLearningSettingsRecord,
} from '../../shared/core/learning/review.js';
import { mergeRecords } from '../../shared/core/sync/records.js';

const noon = new Date(2026, 8, 9, 12, 0, 0).getTime();
const minute = 60 * 1000;
const day = 24 * 60 * 60 * 1000;

function card(text, type = 'word', addedAt = noon - day) {
  return upsertVocabularyRecord({ type, text, translation: `释义 ${text}`, sentence: `Example ${text}.` }, {
    now: addedAt,
    deviceId: 'web',
  });
}

test('queue contains every due card but only the remaining daily new cards', () => {
  const dueBase = card('due');
  const due = rateVocabularyRecord(dueBase, { rating: 'forgot', now: noon - day, deviceId: 'web' });
  const alreadyStudied = rateVocabularyRecord(card('studied'), {
    rating: 'remembered', now: noon - minute, deviceId: 'web',
  });
  const fresh = card('fresh', 'phrase', noon - day + 2);
  const sentence = card('not reviewed', 'sentence');

  const queue = buildReviewQueue([due, alreadyStudied, fresh, sentence], { now: noon, dailyNewLimit: 1 });
  assert.deepEqual(queue.map(record => record.id), ['word:due']);

  const withRoom = buildReviewQueue([due, fresh, sentence], { now: noon, dailyNewLimit: 1 });
  assert.deepEqual(withRoom.map(record => record.id), ['word:due', 'phrase:fresh']);
});

test('three ratings set due time and 记错了 replaces the effective rating', () => {
  const original = card('remember');
  const remembered = rateVocabularyRecord(original, { rating: 'remembered', now: noon, deviceId: 'mac' });
  let state = learningState(remembered.payload.learning);
  assert.equal(state.status, 'review');
  assert.equal(state.dueAt, noon + 3 * day);

  const reviewId = state.reviews[0].id;
  const corrected = reviseVocabularyReviewRecord(remembered, {
    reviewId, rating: 'forgot', asMistake: true, now: noon + minute, deviceId: 'mac',
  });
  state = learningState(corrected.payload.learning);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.reviews[0].rating, 'forgot');
  assert.equal(state.reviews[0].mistakeCorrections, 1);
  assert.equal(state.dueAt, noon + 10 * minute);
});

test('two final failures add a difficult word and manual removal is respected', () => {
  const first = rateVocabularyRecord(card('hard'), { rating: 'forgot', now: noon - 20 * minute, deviceId: 'web' });
  const second = rateVocabularyRecord(first, { rating: 'forgot', now: noon, deviceId: 'web' });
  assert.equal(learningState(second.payload.learning).difficult, true);

  const removed = setVocabularyDifficultyRecord(second, false, { now: noon + minute, deviceId: 'web' });
  assert.equal(learningState(removed.payload.learning).difficult, false);

  const manual = setVocabularyDifficultyRecord(removed, true, { now: noon + 2 * minute, deviceId: 'web' });
  assert.equal(learningState(manual.payload.learning).difficult, true);
});

test('settings and statistics are derived from shared records', () => {
  const settings = upsertLearningSettingsRecord([], 5, { now: noon, deviceId: 'web' });
  assert.deepEqual(learningSettings([settings]), { dailyNewLimit: 5 });

  const remembered = rateVocabularyRecord(card('known'), { rating: 'remembered', now: noon, deviceId: 'web' });
  const forgotten = rateVocabularyRecord(card('missed'), { rating: 'forgot', now: noon + minute, deviceId: 'web' });
  const records = mergeRecords([settings, remembered, forgotten]);
  const stats = reviewStats(records, { now: noon + 2 * minute });
  assert.equal(stats.completedToday, 2);
  assert.equal(stats.retentionToday, 50);
  assert.equal(stats.streakDays, 1);
  assert.equal(stats.next7Days, 2);
  assert.equal(stats.difficultCount, 0);
});
