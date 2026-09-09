import {
  buildReviewQueue,
  learningSettings,
  learningState,
  rateVocabularyRecord,
  reviewStats,
  reviseVocabularyReviewRecord,
  setVocabularyDifficultyRecord,
  upsertLearningSettingsRecord,
} from '../core/learning/review.js';
import { activeRecords } from '../core/sync/records.js';

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

function currentRecord(records, id) {
  return activeRecords(records, 'vocabulary').find(record => record.id === id) || null;
}

export function mountReviewPanel({ getRecords, commitRecord, getDeviceId, onDetail = () => {} }) {
  if (document.getElementById('reviewOverlay')) return;

  const style = document.createElement('style');
  style.textContent = `
    .review-overlay{display:none;position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,.52);padding:18px;align-items:center;justify-content:center}
    .review-overlay.open{display:flex}.review-panel{width:min(680px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:22px}
    .review-head{display:flex;align-items:center;gap:12px}.review-head h2{margin:0;flex:1}.review-close{border:0;background:none;color:var(--text-secondary);font-size:22px;cursor:pointer}
    .review-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:18px 0}.review-stat{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 6px;text-align:center}.review-stat strong{display:block;font-size:19px}.review-stat span{font-size:11px;color:var(--text-secondary)}
    .review-plan{display:flex;align-items:center;gap:10px;margin:14px 0}.review-plan input{width:72px;padding:7px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text)}
    .review-primary,.review-action,.review-rating{border:1px solid var(--border);border-radius:9px;padding:9px 13px;cursor:pointer;background:var(--bg);color:var(--text)}.review-primary{background:var(--accent);border-color:var(--accent);color:white;font-weight:600}
    .review-card{text-align:center;padding:28px 10px 12px}.review-term{font-size:clamp(32px,7vw,54px);font-weight:700;overflow-wrap:anywhere}.review-kind{font-size:12px;color:var(--text-secondary);margin-top:7px}.review-ratings{display:flex;gap:10px;justify-content:center;margin:24px 0}.review-rating{min-width:105px;font-weight:600}.review-rating[data-rating="forgot"]{border-color:#ef4444}.review-rating[data-rating="fuzzy"]{border-color:#f59e0b}.review-rating[data-rating="remembered"]{border-color:#22c55e}
    .review-answer{display:none;text-align:left;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;margin:18px 0;line-height:1.65}.review-answer.show{display:block}.review-answer strong{display:block;margin-bottom:6px}.review-example{margin-top:10px;color:var(--text-secondary);font-style:italic}.review-source{margin-top:8px;font-size:12px;color:var(--text-secondary)}
    .review-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.review-empty{text-align:center;padding:35px 10px;color:var(--text-secondary)}.review-difficult-list{display:none;margin-top:12px;border-top:1px solid var(--border);padding-top:10px}.review-difficult-list.show{display:block}.review-difficult-item{padding:7px 0;border-bottom:1px solid var(--border)}
    @media(max-width:640px){.review-stats{grid-template-columns:repeat(2,1fr)}.review-ratings{flex-direction:column}.review-rating{width:100%}.review-panel{padding:16px}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'reviewOverlay';
  overlay.className = 'review-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '背单词');
  overlay.innerHTML = `<section class="review-panel">
    <div class="review-head"><h2>🧠 背单词</h2><button class="review-close" data-action="close" aria-label="关闭">✕</button></div>
    <div id="reviewContent"></div>
  </section>`;
  document.body.appendChild(overlay);

  const topbar = document.querySelector('.topbar');
  const wordbookButton = [...topbar.querySelectorAll('button')].find(button => button.getAttribute('onclick') === 'toggleWordbook()');
  const openButton = document.createElement('button');
  openButton.className = 'btn';
  openButton.title = '背单词';
  openButton.textContent = '🧠 复习';
  topbar.insertBefore(openButton, wordbookButton || null);

  const content = overlay.querySelector('#reviewContent');
  let queueIds = [];
  let nextQueueIndex = 0;
  let history = [];
  let historyIndex = -1;
  let currentId = '';
  let currentReviewId = '';
  let revealed = false;

  function dashboard() {
    const records = getRecords();
    const settings = learningSettings(records);
    const queue = buildReviewQueue(records, { now: Date.now(), dailyNewLimit: settings.dailyNewLimit });
    const stats = reviewStats(records, { now: Date.now() });
    const difficult = activeRecords(records, 'vocabulary').filter(record => (
      ['word', 'phrase'].includes(record.payload.type) && learningState(record.payload.learning).difficult
    ));
    content.innerHTML = `<div class="review-stats">
      <div class="review-stat"><strong>${stats.completedToday}</strong><span>今日完成</span></div>
      <div class="review-stat"><strong>${stats.retentionToday}%</strong><span>今日记忆率</span></div>
      <div class="review-stat"><strong>${stats.streakDays}</strong><span>连续天数</span></div>
      <div class="review-stat"><strong>${stats.next7Days}</strong><span>7 天到期</span></div>
      <div class="review-stat"><strong>${stats.difficultCount}</strong><span>困难词</span></div>
    </div>
    <div class="review-plan"><label for="dailyNewLimit">每日新词</label><input id="dailyNewLimit" type="number" min="0" step="1" value="${settings.dailyNewLimit}" /><button class="review-action" data-action="save-plan">保存</button></div>
    <p>今天可复习 <strong>${queue.length}</strong> 张（到期旧词优先，未到期不会用来凑数）。</p>
    <div class="review-actions"><button class="review-primary" data-action="start" ${queue.length ? '' : 'disabled'}>开始复习</button><button class="review-action" data-action="toggle-difficult">查看困难词</button></div>
    <div class="review-difficult-list" id="reviewDifficultList">${difficult.length ? difficult.map(record => `<div class="review-difficult-item"><strong>${escapeHtml(record.payload.text)}</strong><div>${escapeHtml(record.payload.translation || '')}</div></div>`).join('') : '暂无困难词'}</div>`;
  }

  function renderCard() {
    const record = currentRecord(getRecords(), currentId);
    if (!record) {
      showNextUnreviewed();
      return;
    }
    const entry = record.payload;
    const learning = learningState(entry.learning);
    const review = learning.reviews.find(item => item.id === currentReviewId);
    const canGoPrevious = currentReviewId ? historyIndex > 0 : history.length > 0;
    const ratingLabel = { forgot: '忘了', fuzzy: '模糊', remembered: '记得' };
    content.innerHTML = `<div class="review-card">
      <div class="review-term">${escapeHtml(entry.text)}</div>
      <div class="review-kind">${entry.type === 'phrase' ? '词组' : '单词'}${review ? ` · 当前评分：${ratingLabel[review.rating]}` : ''}</div>
    </div>
    <div class="review-ratings">
      <button class="review-rating" data-rating="forgot">${review ? '改为' : ''}忘了</button>
      <button class="review-rating" data-rating="fuzzy">${review ? '改为' : ''}模糊</button>
      <button class="review-rating" data-rating="remembered">${review ? '改为' : ''}记得</button>
    </div>
    <div class="review-answer ${revealed ? 'show' : ''}"><strong>释义</strong>${escapeHtml(entry.translation || '暂无释义')}${entry.sentence ? `<div class="review-example">${escapeHtml(entry.sentence)}</div>` : ''}${entry.source ? `<div class="review-source">来源：${escapeHtml(entry.source)}</div>` : ''}</div>
    <div class="review-actions">
      ${revealed ? '<button class="review-action" data-action="detail">详细释义</button>' : ''}
      ${review ? '<button class="review-action" data-action="mistake">记错了</button>' : ''}
      <button class="review-action" data-action="difficulty">${learning.difficult ? '移出困难词' : '标为困难词'}</button>
      <button class="review-action" data-action="previous" ${canGoPrevious ? '' : 'disabled'}>上一词</button>
      ${review ? '<button class="review-primary" data-action="next">下一个</button>' : ''}
    </div>`;
  }

  function showNextUnreviewed() {
    while (nextQueueIndex < queueIds.length && history.some(item => item.cardId === queueIds[nextQueueIndex])) nextQueueIndex++;
    if (nextQueueIndex >= queueIds.length) {
      content.innerHTML = '<div class="review-empty"><h3>✅ 今天到期的内容已完成</h3><p>未到期的卡片没有拿来凑数。</p><button class="review-primary" data-action="dashboard">查看统计</button></div>';
      return;
    }
    currentId = queueIds[nextQueueIndex];
    currentReviewId = '';
    historyIndex = history.length;
    revealed = false;
    renderCard();
  }

  async function rate(rating, asMistake = false) {
    const record = currentRecord(getRecords(), currentId);
    if (!record) return;
    let updated;
    if (currentReviewId) {
      updated = reviseVocabularyReviewRecord(record, {
        reviewId: currentReviewId,
        rating,
        asMistake,
        now: Date.now(),
        deviceId: getDeviceId(),
      });
    } else {
      updated = rateVocabularyRecord(record, { rating, now: Date.now(), deviceId: getDeviceId() });
    }
    await commitRecord(updated);
    const reviews = learningState(updated.payload.learning).reviews;
    currentReviewId = currentReviewId || reviews[reviews.length - 1].id;
    if (!history.some(item => item.reviewId === currentReviewId)) {
      history.push({ cardId: currentId, reviewId: currentReviewId });
      nextQueueIndex++;
    }
    historyIndex = history.findIndex(item => item.reviewId === currentReviewId);
    revealed = true;
    renderCard();
  }

  async function toggleDifficulty() {
    const record = currentRecord(getRecords(), currentId);
    if (!record) return;
    const difficult = learningState(record.payload.learning).difficult;
    await commitRecord(setVocabularyDifficultyRecord(record, !difficult, { now: Date.now(), deviceId: getDeviceId() }));
    renderCard();
  }

  openButton.addEventListener('click', () => {
    overlay.classList.add('open');
    dashboard();
  });

  overlay.addEventListener('click', async event => {
    if (event.target === overlay || event.target.closest('[data-action="close"]')) {
      overlay.classList.remove('open');
      return;
    }
    const rating = event.target.closest('[data-rating]')?.dataset.rating;
    if (rating) {
      await rate(rating);
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'start') {
      queueIds = buildReviewQueue(getRecords(), { now: Date.now() }).map(record => record.id);
      nextQueueIndex = 0;
      history = [];
      showNextUnreviewed();
    } else if (action === 'next') {
      if (historyIndex >= 0 && historyIndex < history.length - 1) {
        historyIndex++;
        ({ cardId: currentId, reviewId: currentReviewId } = history[historyIndex]);
        revealed = true;
        renderCard();
      } else showNextUnreviewed();
    } else if (action === 'previous' && history.length) {
      historyIndex = Math.max(0, Math.min(history.length - 1, historyIndex - 1));
      ({ cardId: currentId, reviewId: currentReviewId } = history[historyIndex]);
      revealed = true;
      renderCard();
    } else if (action === 'mistake') {
      await rate('forgot', true);
    } else if (action === 'difficulty') {
      await toggleDifficulty();
    } else if (action === 'detail') {
      overlay.classList.remove('open');
      onDetail(currentRecord(getRecords(), currentId)?.payload);
    } else if (action === 'toggle-difficult') {
      content.querySelector('#reviewDifficultList')?.classList.toggle('show');
    } else if (action === 'save-plan') {
      const value = content.querySelector('#dailyNewLimit').value;
      await commitRecord(upsertLearningSettingsRecord(getRecords(), value, { now: Date.now(), deviceId: getDeviceId() }));
      dashboard();
    } else if (action === 'dashboard') {
      dashboard();
    }
  });
}
