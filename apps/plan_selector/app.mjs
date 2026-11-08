const planId = new URLSearchParams(window.location.search).get('plan') || 'chat';
const state = { plan: null, selections: {}, savedAt: null };
const localKey = `taiwan-brawl-plan-choice:${planId}`;
const $ = (selector) => document.querySelector(selector);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

async function loadPlan() {
  const response = await fetch(`/data/${encodeURIComponent(planId)}.json`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('找不到這份計畫。');
  state.plan = await response.json();
  document.title = `${state.plan.title}｜計畫選擇`;
  $('#planSubtitle').textContent = state.plan.subtitle;
  renderConfirmed();
  await loadSavedChoices();
  renderDecisions();
}

async function loadSavedChoices() {
  try {
    const response = await fetch(`/api/answers?plan=${encodeURIComponent(planId)}`);
    if (response.ok) {
      const saved = await response.json();
      if (saved?.planId === planId && saved.selections) {
        state.selections = { ...saved.selections };
        state.savedAt = saved.savedAt ?? null;
        localStorage.setItem(localKey, JSON.stringify(saved));
        return;
      }
    }
  } catch (_) {
    // The browser draft is still available if the local server was restarted.
  }
  try {
    const draft = JSON.parse(localStorage.getItem(localKey) || 'null');
    if (draft?.planId === planId && draft.selections) {
      state.selections = { ...draft.selections };
      state.savedAt = draft.savedAt ?? null;
    }
  } catch (_) {
    localStorage.removeItem(localKey);
  }
}

function renderConfirmed() {
  const list = $('#confirmedList');
  list.replaceChildren();
  for (const item of state.plan.confirmed) {
    const card = node('article', 'confirmed-item');
    card.append(node('strong', '', item.title));
    card.append(node('p', '', item.detail));
    list.append(card);
  }
}

function renderDecisions() {
  const list = $('#decisionList');
  list.replaceChildren();
  state.plan.decisions.forEach((decision, index) => {
    const card = node('article', 'decision-card');
    card.id = `decision-${decision.id}`;
    if (state.selections[decision.id]) card.classList.add('is-selected');

    const meta = node('div', 'decision-meta');
    meta.append(node('span', 'pill', decision.category));
    meta.append(node('span', 'pill stage', decision.stage));
    meta.append(node('span', 'question-number', `Q${String(index + 1).padStart(2, '0')}`));
    card.append(meta);
    card.append(node('h3', '', decision.title));
    card.append(node('p', 'decision-context', decision.context));

    const options = node('div', 'options');
    options.setAttribute('role', 'radiogroup');
    options.setAttribute('aria-label', decision.title);
    for (const option of decision.options) {
      const label = node('label', 'option');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = decision.id;
      input.value = option.id;
      input.checked = state.selections[decision.id] === option.id;
      input.setAttribute('aria-label', option.title);
      input.addEventListener('change', () => {
        state.selections[decision.id] = option.id;
        state.savedAt = null;
        renderDecisions();
        setStatus('選擇已更新，記得儲存。');
      });
      label.append(input);

      const copy = node('div', 'option-copy');
      const titleRow = node('div', 'option-title-row');
      titleRow.append(node('span', 'option-title', option.title));
      if (option.recommended) titleRow.append(node('span', 'badge', '建議方向'));
      if (option.current) titleRow.append(node('span', 'badge current', '目前實作'));
      copy.append(titleRow);
      copy.append(node('p', 'option-summary', option.summary));
      const tradeoffs = node('ul', 'tradeoffs');
      for (const item of option.tradeoffs) tradeoffs.append(node('li', '', item));
      copy.append(tradeoffs);
      label.append(copy);
      options.append(label);
    }
    card.append(options);
    list.append(card);
  });
  renderSummary();
}

function renderSummary() {
  const summary = $('#summaryList');
  summary.replaceChildren();
  const answered = state.plan.decisions.filter((decision) => state.selections[decision.id]);
  const total = state.plan.decisions.length;
  $('#progressLabel').textContent = `${answered.length} / ${total} 已選`;
  $('#progressFill').style.width = `${total ? (answered.length / total) * 100 : 0}%`;
  $('#summaryHint').textContent = answered.length === total
    ? '全部選好了。儲存後就能作為聊天計畫的決策草稿。'
    : `已選 ${answered.length} 項，還有 ${total - answered.length} 項可稍後決定。`;

  if (!answered.length) {
    summary.append(node('div', 'summary-empty', '尚未選擇。可以先略過，不會替你預設決定。'));
    return;
  }
  for (const decision of answered) {
    const option = decision.options.find((item) => item.id === state.selections[decision.id]);
    const row = node('div', 'summary-row');
    row.append(node('small', '', decision.category));
    row.append(node('strong', '', option?.title ?? state.selections[decision.id]));
    summary.append(row);
  }
}

function setStatus(message, isError = false) {
  const status = $('#saveStatus');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function answerDocument() {
  return {
    schemaVersion: 1,
    planId,
    selections: { ...state.selections },
    savedAt: new Date().toISOString(),
  };
}

async function saveChoices() {
  const answer = answerDocument();
  localStorage.setItem(localKey, JSON.stringify(answer));
  try {
    const response = await fetch('/api/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answer),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '無法儲存選擇。');
    state.savedAt = result.savedAt;
    setStatus(`已儲存在這台電腦 · ${new Date(result.savedAt).toLocaleString('zh-TW')}`);
  } catch (error) {
    state.savedAt = answer.savedAt;
    setStatus(`已保存在這個瀏覽器；本機檔案尚未更新。${error.message ? ` ${error.message}` : ''}`, true);
  }
  renderSummary();
}

function decisionText() {
  const lines = [`聊天功能計畫選擇 (${planId})`];
  for (const decision of state.plan.decisions) {
    const option = decision.options.find((item) => item.id === state.selections[decision.id]);
    lines.push(`${decision.category}｜${decision.title}：${option?.title ?? '尚未選擇'}`);
  }
  return lines.join('\n');
}

async function copyChoices() {
  try {
    await navigator.clipboard.writeText(decisionText());
    setStatus('選擇摘要已複製。');
  } catch (_) {
    setStatus('瀏覽器未允許複製；請改用下載 JSON 備份。', true);
  }
}

function downloadChoices() {
  const blob = new Blob([JSON.stringify(answerDocument(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${planId}-plan-choices.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus('選擇 JSON 已下載。');
}

async function resetChoices() {
  if (!confirm('清除這份聊天計畫的所有選擇？')) return;
  state.selections = {};
  state.savedAt = null;
  localStorage.removeItem(localKey);
  try {
    await fetch(`/api/answers?plan=${encodeURIComponent(planId)}`, { method: 'DELETE' });
  } catch (_) {
    // Local storage is cleared even if the file-saving server is unreachable.
  }
  renderDecisions();
  setStatus('本機草稿已清除。');
}

$('#toggleConfirmed').addEventListener('click', (event) => {
  const expanded = $('#toggleConfirmed').getAttribute('aria-expanded') === 'true';
  $('#toggleConfirmed').setAttribute('aria-expanded', String(!expanded));
  $('#confirmedList').hidden = expanded;
  event.currentTarget.innerHTML = expanded ? '展開 <span>＋</span>' : '收合 <span>−</span>';
});
$('#saveButton').addEventListener('click', saveChoices);
$('#saveTop').addEventListener('click', saveChoices);
$('#copyButton').addEventListener('click', copyChoices);
$('#downloadButton').addEventListener('click', downloadChoices);
$('#resetButton').addEventListener('click', resetChoices);

loadPlan().catch((error) => {
  $('#planSubtitle').textContent = error.message;
  $('#decisionList').append(node('div', 'summary-empty', '無法載入計畫選項。'));
});
