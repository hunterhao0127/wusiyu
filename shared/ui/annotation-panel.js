import {
  ANNOTATION_COLORS,
  annotationsForBook,
  annotationsToMarkdown,
  createAnnotationRecord,
  deleteAnnotationRecord,
  overlappingAnnotation,
  resolveAnnotation,
  updateAnnotationRecord,
} from '../core/reader/annotation.js';

const COLOR_NAMES = { yellow: '黄', green: '绿', blue: '蓝', pink: '粉' };

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

function wrapTextRange(block, start, end, record) {
  const nodes = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node;
  while (node = walker.nextNode()) {
    const next = offset + node.textContent.length;
    if (offset < end && next > start) nodes.push({ node, offset, next });
    offset = next;
  }
  for (let index = nodes.length - 1; index >= 0; index--) {
    const item = nodes[index];
    const range = document.createRange();
    range.setStart(item.node, Math.max(0, start - item.offset));
    range.setEnd(item.node, Math.min(item.node.textContent.length, end - item.offset));
    const mark = document.createElement('mark');
    mark.className = `annotation-highlight annotation-${record.payload.color}`;
    mark.dataset.annotationId = record.id;
    mark.title = record.payload.note || '双击编辑批注';
    range.surroundContents(mark);
  }
}

export function mountAnnotationPanel({
  getRecords,
  getBook,
  getBlocks,
  getDeviceId,
  commitRecord,
  onChanged,
  onJump,
  onTranslate,
  onAddVocabulary,
  onMessage,
  onDownload,
}) {
  if (document.getElementById('annotationPanel')) return null;
  const style = document.createElement('style');
  style.textContent = `
    .annotation-selection-menu{display:none;position:fixed;z-index:1250;gap:4px;padding:6px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow)}
    .annotation-selection-menu.show{display:flex}.annotation-selection-menu button{border:0;border-radius:7px;padding:7px 9px;background:transparent;color:var(--text);cursor:pointer;white-space:nowrap}.annotation-selection-menu button:hover{background:var(--accent-light)}
    .annotation-highlight{padding:0;background:transparent;color:inherit;border-radius:2px;cursor:pointer}.annotation-yellow{background:rgba(250,204,21,.42)}.annotation-green{background:rgba(74,222,128,.34)}.annotation-blue{background:rgba(96,165,250,.32)}.annotation-pink{background:rgba(244,114,182,.3)}
    .annotation-highlight.annotation-focus{outline:2px solid var(--accent);outline-offset:2px}
    .annotation-panel{position:fixed;z-index:1150;top:0;right:-390px;width:min(390px,100vw);height:100vh;background:var(--card-bg);color:var(--text);border-left:1px solid var(--border);box-shadow:var(--shadow);transition:right .22s;display:flex;flex-direction:column}.annotation-panel.open{right:0}
    .annotation-head{display:flex;align-items:center;gap:10px;padding:18px;border-bottom:1px solid var(--border)}.annotation-head h2{font-size:18px;margin:0;flex:1}.annotation-close{border:0;background:none;color:var(--text-secondary);font-size:21px;cursor:pointer}
    .annotation-tools{display:flex;gap:8px;padding:12px 18px;border-bottom:1px solid var(--border)}.annotation-tools button{border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:8px;padding:7px 10px;cursor:pointer}.annotation-tools button.active{background:var(--accent);border-color:var(--accent);color:white}.annotation-tools [data-action="export"]{margin-left:auto}
    .annotation-list{padding:10px 18px 24px;overflow:auto}.annotation-item{border:1px solid var(--border);border-left:5px solid #facc15;border-radius:9px;padding:10px 12px;margin:9px 0;cursor:pointer}.annotation-item[data-color="green"]{border-left-color:#4ade80}.annotation-item[data-color="blue"]{border-left-color:#60a5fa}.annotation-item[data-color="pink"]{border-left-color:#f472b6}.annotation-quote{font-size:14px;line-height:1.5}.annotation-note{font-size:13px;color:var(--text-secondary);margin-top:7px}.annotation-meta{font-size:11px;color:var(--text-secondary);margin-top:7px}.annotation-edit{float:right;border:0;background:transparent;color:var(--accent);padding:0;cursor:pointer;font-size:12px}.annotation-empty{text-align:center;color:var(--text-secondary);padding:42px 8px;line-height:1.7}
    .annotation-editor{display:none;position:fixed;inset:0;z-index:1300;background:rgba(15,23,42,.52);padding:18px;align-items:center;justify-content:center}.annotation-editor.open{display:flex}.annotation-editor-card{width:min(520px,100%);background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:16px;padding:20px;box-shadow:var(--shadow)}.annotation-editor-card h3{margin:0 0 12px}.annotation-editor-quote{padding:10px 12px;background:var(--bg);border-radius:8px;line-height:1.55;max-height:150px;overflow:auto}.annotation-colors{display:flex;gap:10px;margin:14px 0}.annotation-color{width:30px;height:30px;border:2px solid transparent;border-radius:50%;cursor:pointer}.annotation-color.selected{border-color:var(--text)}.annotation-color[data-color="yellow"]{background:#facc15}.annotation-color[data-color="green"]{background:#4ade80}.annotation-color[data-color="blue"]{background:#60a5fa}.annotation-color[data-color="pink"]{background:#f472b6}.annotation-editor textarea{width:100%;box-sizing:border-box;min-height:110px;resize:vertical;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg);color:var(--text);font:inherit}.annotation-editor-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.annotation-editor-actions button{border:1px solid var(--border);border-radius:8px;padding:8px 13px;background:var(--bg);color:var(--text);cursor:pointer}.annotation-editor-actions .primary{background:var(--accent);border-color:var(--accent);color:white}.annotation-editor-actions .danger{color:#dc2626;margin-right:auto}
    @media(max-width:700px){.annotation-selection-menu{max-width:calc(100vw - 16px);overflow-x:auto}.annotation-panel{width:100vw}}
  `;
  document.head.appendChild(style);

  const menu = document.createElement('div');
  menu.id = 'annotationSelectionMenu';
  menu.className = 'annotation-selection-menu';
  menu.innerHTML = '<button data-action="translate">🌐 翻译</button><button data-action="highlight">🖍️ 高亮</button><button data-action="note">💬 写批注</button><button data-action="vocabulary">📕 加入单词本</button>';
  document.body.appendChild(menu);

  const panel = document.createElement('aside');
  panel.id = 'annotationPanel';
  panel.className = 'annotation-panel';
  panel.innerHTML = `<div class="annotation-head"><h2>📌 批注</h2><button class="annotation-close" data-action="close" aria-label="关闭">✕</button></div>
    <div class="annotation-tools"><button class="active" data-filter="all">全部</button><button data-filter="notes">有笔记</button><button data-action="export">导出 Markdown</button></div><div class="annotation-list"></div>`;
  document.body.appendChild(panel);

  const editor = document.createElement('div');
  editor.id = 'annotationEditor';
  editor.className = 'annotation-editor';
  editor.innerHTML = `<section class="annotation-editor-card" role="dialog" aria-modal="true" aria-label="编辑批注"><h3>批注</h3><div class="annotation-editor-quote"></div><div class="annotation-colors">${ANNOTATION_COLORS.map(color => `<button class="annotation-color" data-color="${color}" title="${COLOR_NAMES[color]}" aria-label="${COLOR_NAMES[color]}"></button>`).join('')}</div><textarea maxlength="10000" placeholder="写下你的想法（可选）"></textarea><div class="annotation-editor-actions"><button class="danger" data-action="delete">删除</button><button data-action="cancel">取消</button><button class="primary" data-action="save">保存</button></div></section>`;
  document.body.appendChild(editor);

  const topbar = document.querySelector('.topbar');
  const button = document.createElement('button');
  button.className = 'btn';
  button.title = '批注';
  button.textContent = '📌 批注';
  topbar.insertBefore(button, topbar.querySelector('button[title="设置"]'));

  let draft = null;
  let editing = null;
  let color = 'yellow';
  let filter = 'all';
  let selectedAnnotation = null;

  function records() {
    return getBook() ? annotationsForBook(getRecords(), getBook()) : [];
  }

  function hideSelection() {
    menu.classList.remove('show');
  }

  function showSelection(value, rect) {
    draft = value;
    selectedAnnotation = getBook() ? overlappingAnnotation(records(), value) : null;
    const noteButton = menu.querySelector('[data-action="note"]');
    if (selectedAnnotation) {
      noteButton.textContent = selectedAnnotation.payload.note ? '📝 查看笔记' : '📝 添加笔记';
      menu.querySelector('[data-action="highlight"]').style.display = 'none';
    } else {
      noteButton.textContent = '💬 写批注';
      menu.querySelector('[data-action="highlight"]').style.display = '';
    }
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 360, rect.left + rect.width / 2 - 170))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 55, rect.bottom + 8)}px`;
    menu.classList.add('show');
  }

  function renderList() {
    const list = panel.querySelector('.annotation-list');
    const items = records().filter(record => filter === 'all' || record.payload.note);
    list.innerHTML = items.length ? items.map(record => {
      const location = resolveAnnotation(record, getBlocks());
      return `<article class="annotation-item" data-id="${escapeHtml(record.id)}" data-color="${record.payload.color}"><div class="annotation-quote">${escapeHtml(record.payload.quote)}</div>${record.payload.note ? `<div class="annotation-note">${escapeHtml(record.payload.note)}</div>` : ''}<div class="annotation-meta">${escapeHtml(record.payload.chapterTitle || `第 ${record.payload.blockIndex + 1} 段`)}${location ? (location.moved ? ' · 已重新定位' : '') : ' · 原文位置已变化'}<button class="annotation-edit" data-action="edit" data-id="${escapeHtml(record.id)}">编辑</button></div></article>`;
    }).join('') : '<div class="annotation-empty">这本书还没有批注。<br>在正文中选中一段文字即可开始。</div>';
  }

  function openEditor(record = null, initialDraft = null) {
    editing = record;
    draft = initialDraft || draft;
    color = record?.payload.color || 'yellow';
    editor.querySelector('.annotation-editor-quote').textContent = record?.payload.quote || draft?.quote || '';
    editor.querySelector('textarea').value = record?.payload.note || '';
    editor.querySelector('[data-action="delete"]').style.display = record ? '' : 'none';
    editor.querySelectorAll('[data-color]').forEach(item => item.classList.toggle('selected', item.dataset.color === color));
    editor.classList.add('open');
    if (!record) editor.querySelector('textarea').focus();
  }

  function closeEditor() {
    editor.classList.remove('open');
    editing = null;
  }

  async function create(colorValue, note = '') {
    if (!draft || !getBook()) return;
    const overlap = overlappingAnnotation(records(), draft);
    if (overlap) {
      onMessage('这段文字已有批注，请点击已有高亮进行编辑。', 'error');
      return;
    }
    const record = createAnnotationRecord({ ...draft, ...getBook(), color: colorValue, note }, {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      now: Date.now(),
      deviceId: getDeviceId(),
    });
    await commitRecord(record);
    hideSelection();
    window.getSelection()?.removeAllRanges();
    onChanged();
    renderList();
    onMessage(note ? '✅ 批注已保存' : '✅ 已高亮', 'success');
  }

  function applyHighlights(container) {
    if (!getBook()) return;
    for (const record of records()) {
      const location = resolveAnnotation(record, getBlocks());
      if (!location) continue;
      const block = container.querySelector(`[data-block-index="${location.blockIndex}"]`);
      if (block) wrapTextRange(block, location.startOffset, location.endOffset, record);
    }
  }

  button.addEventListener('click', () => {
    panel.classList.toggle('open');
    renderList();
  });

  menu.addEventListener('mousedown', event => event.preventDefault());
  menu.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'translate') { hideSelection(); onTranslate(draft); }
    else if (action === 'highlight') await create('yellow');
    else if (action === 'note') { hideSelection(); openEditor(selectedAnnotation, selectedAnnotation ? null : draft); }
    else if (action === 'vocabulary') { hideSelection(); await onAddVocabulary(draft.quote); }
  });

  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') panel.classList.remove('open');
    if (action === 'export') {
      const items = records();
      if (!items.length) return onMessage('当前书籍还没有批注', 'error');
      onDownload(`${getBook().name || '书籍'}-批注.md`, annotationsToMarkdown(items, { bookTitle: getBook().name }));
    }
    if (action === 'edit') {
      const record = records().find(value => value.id === event.target.closest('[data-id]')?.dataset.id);
      if (record) openEditor(record);
      return;
    }
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
      filter = filterButton.dataset.filter;
      panel.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === filterButton));
      renderList();
    }
    const item = event.target.closest('.annotation-item');
    if (item) {
      const record = records().find(value => value.id === item.dataset.id);
      const location = record && resolveAnnotation(record, getBlocks());
      if (!location) return onMessage('原文位置已变化，批注内容仍已保留。', 'error');
      panel.classList.remove('open');
      onJump(location, record);
    }
  });

  editor.addEventListener('click', async event => {
    if (event.target === editor || event.target.closest('[data-action="cancel"]')) return closeEditor();
    const colorButton = event.target.closest('[data-color]');
    if (colorButton) {
      color = colorButton.dataset.color;
      editor.querySelectorAll('[data-color]').forEach(item => item.classList.toggle('selected', item === colorButton));
      return;
    }
    if (event.target.closest('[data-action="save"]')) {
      const note = editor.querySelector('textarea').value;
      if (editing) {
        await commitRecord(updateAnnotationRecord(editing, { color, note }, { now: Date.now(), deviceId: getDeviceId() }));
        closeEditor(); onChanged(); renderList(); onMessage('✅ 批注已更新', 'success');
      } else {
        closeEditor(); await create(color, note);
      }
    }
    if (event.target.closest('[data-action="delete"]') && editing) {
      await commitRecord(deleteAnnotationRecord(editing, { now: Date.now(), deviceId: getDeviceId() }));
      closeEditor(); onChanged(); renderList(); onMessage('批注已删除', 'success');
    }
  });

  document.addEventListener('dblclick', event => {
    const mark = event.target.closest?.('[data-annotation-id]');
    if (mark) {
      const record = records().find(item => item.id === mark.dataset.annotationId);
      if (record) openEditor(record);
    }
  });

  return { applyHighlights, hideSelection, showSelection, refresh: renderList };
}
