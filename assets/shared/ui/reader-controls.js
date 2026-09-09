import { normalizeReaderSettings } from '../core/reader/settings.js';

const STYLE_ID = 'wusiyu-reader-controls-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    :root { --reader-page-margin: 20px; --reader-paragraph-spacing: 6px; }
    #paragraphs { padding-inline: var(--reader-page-margin); }
    .paragraph, .book-image-block { margin-bottom: var(--reader-paragraph-spacing) !important; }
    html[data-reader-mode="scroll"] #paragraphs { display:block; overflow-y:auto; }
    html[data-reader-mode="scroll"] .nav-row,
    html[data-reader-mode="scroll"] .jump-row { display:none; }
    html[data-reader-mode="paged"][data-reader-columns="two"] #paragraphs {
      display:block; column-count:2; column-gap:48px; column-rule:1px solid var(--border);
    }
    html[data-reader-mode="paged"][data-reader-columns="two"] .paragraph,
    html[data-reader-mode="paged"][data-reader-columns="two"] .book-image-block { break-inside:avoid; }
    .reader-progress { height:4px; background:var(--border); border-radius:999px; overflow:hidden; flex-shrink:0; }
    .reader-progress > span { display:block; height:100%; width:0; background:var(--accent); transition:width .15s; }
    .reader-progress-label { color:var(--text-secondary); font-size:11px; text-align:right; margin:4px var(--reader-page-margin) 2px; }
    .reader-setting-row { display:flex; gap:8px; align-items:center; }
    .reader-setting-row input[type="range"] { flex:1; }
    @media (max-width: 900px) {
      html[data-reader-columns="two"] #paragraphs { column-count:1 !important; column-rule:0 !important; }
    }
  `;
  document.head.appendChild(style);
}

function controlsMarkup(settings) {
  return `<hr style="border:none;border-top:1px solid var(--border);margin:16px 0;" />
    <div class="field" id="readerDisplaySettings">
      <label>阅读方式</label>
      <div class="theme-btns">
        <button class="theme-btn" type="button" data-reader-mode="paged">📖 翻页</button>
        <button class="theme-btn" type="button" data-reader-mode="scroll">↕️ 滚动</button>
      </div>
      <button class="theme-btn" type="button" data-reader-toggle="twoColumn" style="width:100%;margin-top:10px;">📰 宽屏双栏（翻页模式）</button>
      <label style="margin-top:12px;">页面边距 <span data-reader-value="pageMargin">${settings.pageMargin}</span></label>
      <div class="reader-setting-row"><span>窄</span><input type="range" min="0" max="64" step="4" value="${settings.pageMargin}" data-reader-setting="pageMargin" /><span>宽</span></div>
      <label style="margin-top:12px;">段落间距 <span data-reader-value="paragraphSpacing">${settings.paragraphSpacing}</span></label>
      <div class="reader-setting-row"><span>紧</span><input type="range" min="0" max="32" step="2" value="${settings.paragraphSpacing}" data-reader-setting="paragraphSpacing" /><span>松</span></div>
    </div>`;
}

export function applyReaderSettings(value) {
  const settings = normalizeReaderSettings(value);
  const root = document.documentElement;
  root.dataset.readerMode = settings.readingMode;
  root.dataset.readerColumns = settings.twoColumn ? 'two' : 'one';
  root.style.setProperty('--reader-page-margin', `${settings.pageMargin}px`);
  root.style.setProperty('--reader-paragraph-spacing', `${settings.paragraphSpacing}px`);
  return settings;
}

export function mountReaderControls({ settingsPanel, readingArea, settings, onChange }) {
  ensureStyle();
  let current = applyReaderSettings(settings);
  const paragraphs = readingArea.querySelector('#paragraphs');
  paragraphs?.setAttribute('tabindex', '0');
  paragraphs?.addEventListener('keydown', event => {
    if (current.readingMode !== 'scroll') return;
    if (event.key === 'Home') paragraphs.scrollTop = 0;
    else if (event.key === 'End') paragraphs.scrollTop = paragraphs.scrollHeight;
    else if (event.key === 'PageDown') paragraphs.scrollTop += paragraphs.clientHeight * 0.9;
    else if (event.key === 'PageUp') paragraphs.scrollTop -= paragraphs.clientHeight * 0.9;
    else return;
    event.preventDefault();
  });
  settingsPanel.insertAdjacentHTML('beforeend', controlsMarkup(current));
  readingArea.insertAdjacentHTML('afterbegin', '<div class="reader-progress" aria-label="阅读进度"><span></span></div><div class="reader-progress-label">0%</div>');
  const field = settingsPanel.querySelector('#readerDisplaySettings');

  function refresh() {
    field.querySelectorAll('[data-reader-mode]').forEach(button => button.classList.toggle('active', button.dataset.readerMode === current.readingMode));
    field.querySelector('[data-reader-toggle="twoColumn"]').classList.toggle('active', current.twoColumn);
    for (const key of ['pageMargin', 'paragraphSpacing']) {
      field.querySelector(`[data-reader-setting="${key}"]`).value = current[key];
      field.querySelector(`[data-reader-value="${key}"]`).textContent = current[key];
    }
  }

  async function change(patch) {
    current = applyReaderSettings({ ...current, ...patch });
    refresh();
    await onChange(current);
  }

  field.addEventListener('click', event => {
    const button = event.target.closest('[data-reader-mode]');
    if (button) change({ readingMode: button.dataset.readerMode });
    const toggle = event.target.closest('[data-reader-toggle="twoColumn"]');
    if (toggle) change({ twoColumn: !current.twoColumn });
  });
  field.addEventListener('input', event => {
    const key = event.target.dataset.readerSetting;
    if (key === 'pageMargin' || key === 'paragraphSpacing') change({ [key]: Number(event.target.value) });
  });
  refresh();

  return {
    apply(value) { current = applyReaderSettings(value); refresh(); },
    setProgress(value) {
      const percent = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
      readingArea.querySelector('.reader-progress > span').style.width = `${percent}%`;
      readingArea.querySelector('.reader-progress-label').textContent = `${percent}%`;
    },
  };
}
