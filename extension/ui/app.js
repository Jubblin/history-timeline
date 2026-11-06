// Timeline page. All history-derived strings (titles, URLs, domains) are untrusted:
// they only enter the DOM via textContent / setAttribute, never innerHTML.
import { loadVisits, TRANSITIONS } from '../src/history/index.js';
import { el, pad, localTime, fmtDay, num, debounce, catBadge as makeCatBadge, downloadBlob, buildTransitionFilter, fillRow as sharedFillRow } from './ui-common.js';
import { CATEGORIES, createClassifier, parseUserRules, loadBundledRules } from './classify-import.js';
import { MASK, plural, EMPTY_HISTORY, EMPTY_FILTERED, LOADING_MSG, RANGE_REVERSED, isReversedRange, emptyFilteredMessage, transitionLabel, describeLoadError, viewState, isMasked, annotate, rovingIndex, dismissPopup, applyFilters, categoryCounts, chartBins, domainStats, layout, toCsv, csvFilename, filterSummary } from './model.js';

const PAGE = 200;
const HIDE_KEY = 'history-timeline.hideSensitive';
const RULES_KEY = 'userRulesText';
const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
const catBadge = (c) => makeCatBadge(c, catLabel(c));
const $ = (id) => document.getElementById(id);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const st = { all: [], classifier: null, bundled: null, hide: false, revealed: new Set(), cats: new Set(),
  filtered: [], lay: null, rendered: 0, cur: { day: -1, sess: -1, dayEl: null, sessEl: null }, loading: false, error: null, rulesSaved: '' };

const setStatus = (m) => { $('status').textContent = m || ''; };

// ---- storage (chrome.storage.local; in-memory fallback if the permission is absent) ----
const mem = {};
const store = {
  async get(k) { return chrome.storage?.local ? (await chrome.storage.local.get(k))[k] : mem[k]; },
  async set(k, v) { if (chrome.storage?.local) await chrome.storage.local.set({ [k]: v }); else mem[k] = v; },
  async remove(k) { if (chrome.storage?.local) await chrome.storage.local.remove(k); else delete mem[k]; },
};

// ---- filters ----
function selectedTransitions() {
  const on = [...$('f-trans').querySelectorAll('input')].filter((c) => c.checked).map((c) => c.value);
  return on.length === TRANSITIONS.length ? null : on.length ? on : ['\u0000none'];
}
const filters = () => ({ start: $('f-start').value, end: $('f-end').value, text: $('f-q').value, domain: $('f-domain').value,
  transitions: selectedTransitions(), cats: st.cats });


// ---- rendering ----

function renderChart(visits) {
  const { unit, bins } = chartBins(visits);
  const max = Math.max(1, ...bins.map((b) => b.visits));
  const chart = $('chart');
  const focusKey = chart.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  $('chart-unit').textContent = `(visits per ${unit}, ${TZ})`;
  chart.replaceChildren();
  let focused = null;
  bins.forEach((b, i) => {
    const e = el('button', 'bar');
    e.type = 'button'; e.dataset.key = b.key;
    e.tabIndex = i === 0 ? 0 : -1;
    const label = `${b.key}: ${plural(b.visits, 'visit')}` + (b.flagged ? `, ${num(b.flagged)} flagged` : '');
    e.title = label; e.setAttribute('aria-label', label);
    const bar = el('i'); bar.style.height = Math.max(2, (b.visits / max) * 100) + '%';
    e.appendChild(bar);
    if (b.flagged) { const f = el('b'); f.style.height = Math.max(2, (b.flagged / max) * 100) + '%'; e.appendChild(f); }
    e.addEventListener('click', () => { $('f-start').value = b.range[0]; $('f-end').value = b.range[1]; refresh(); });
    chart.appendChild(e);
    if (b.key === focusKey) focused = e;
  });
  if (focused) { for (const x of chart.children) x.tabIndex = -1; focused.tabIndex = 0; focused.focus(); }
}

function renderDomains(visits) {
  const ol = $('domains');
  const had = ol.contains(document.activeElement) ? document.activeElement.dataset.domain : null;
  ol.replaceChildren();
  for (const d of domainStats(visits)) {
    const li = el('li');
    if (st.hide && d.categories.length) {
      const row = el('div', 'dom-masked');
      const tags = el('span', 'dom-tags');
      for (const c of d.categories) tags.append(catBadge(c));
      row.append(el('span', '', MASK), tags, el('span', 'n', num(d.visits)));
      li.appendChild(row);
    } else {
      const b = el('button');
      b.type = 'button'; b.dataset.domain = d.domain; b.title = d.domain;
      b.tabIndex = -1;
      b.append(el('span', 'dn', d.domain), el('span', 'n', num(d.visits)));
      b.addEventListener('click', () => { $('f-domain').value = d.domain; refresh(); });
      li.appendChild(b);
    }
    ol.appendChild(li);
  }
  // One tab stop for the whole list (roving tabindex); arrow keys move within it.
  const btns = [...ol.querySelectorAll('button')];
  const keep = btns.find((b) => b.dataset.domain === had) ?? btns[0];
  if (keep) keep.tabIndex = 0;
  if (had && keep && keep.dataset.domain === had) keep.focus();
}

function renderChips(visits) {
  const counts = categoryCounts(visits);
  const box = $('cat-chips');
  const had = box.contains(document.activeElement) ? document.activeElement.dataset.cat : null;
  box.replaceChildren();
  for (const c of CATEGORIES) {
    const n = counts.get(c.id) ?? 0;
    if (!n && !st.cats.has(c.id)) continue;
    const b = el('button', 'chip cat-' + c.id);
    b.type = 'button'; b.dataset.cat = c.id;
    b.setAttribute('aria-pressed', st.cats.has(c.id) ? 'true' : 'false');
    b.setAttribute('aria-label', `${c.label}, ${plural(n, 'visit')}`);
    b.append(el('span', '', c.label), el('span', 'n', num(n)));
    b.addEventListener('click', () => { if (st.cats.has(c.id)) st.cats.delete(c.id); else st.cats.add(c.id); refresh(); });
    box.appendChild(b);
  }
  if (had) box.querySelector(`[data-cat="${had}"]`)?.focus();
}

const toView = (v) => ({
  id: v.visitId, timeMs: v.time, iso: new Date(v.time).toISOString(), url: v.url, title: v.title, domain: v.domain,
  transition: transitionLabel(v.transition), categories: v.categories, durationMs: 0,
  masked: isMasked(v, st.hide, st.revealed), hide: st.hide,
  onToggleReveal: () => { if (st.revealed.has(v.visitId)) st.revealed.delete(v.visitId); else st.revealed.add(v.visitId); },
});
const fillRow = (row, v) => {
  sharedFillRow(row, () => toView(v), catBadge);
  const tr = row.querySelector('.tr');
  if (tr) tr.title = v.transition;
};

function renderMore(count) {
  const tl = $('timeline');
  const { days, sessions, entries } = st.lay;
  const end = Math.min(entries.length, st.rendered + count);
  const c = st.cur;
  const frag = document.createDocumentFragment();
  for (let i = st.rendered; i < end; i++) {
    const { v, day, sess } = entries[i];
    if (day !== c.day) {
      c.day = day; c.sess = -1;
      c.dayEl = el('section', 'day');
      const d = days[day];
      const h = el('h3', '', fmtDay(d.ms));
      // Visually hidden commas keep the parts of the heading apart for screen readers.
      h.append(el('span', 'sr-only', ', '), el('span', '', plural(d.visits, 'visit')));
      if (d.flagged) h.append(el('span', 'sr-only', ', '), el('span', 'flagn', `⚑ ${num(d.flagged)} flagged`));
      c.dayEl.appendChild(h);
      frag.appendChild(c.dayEl);
    }
    if (sess !== c.sess) {
      c.sess = sess;
      c.sessEl = el('div', 'session');
      const s = sessions[sess];
      const span = s.first === s.last ? localTime(s.first) : `${localTime(s.last)}–${localTime(s.first)}`;
      c.sessEl.appendChild(el('div', 'session-head', `Session ${span} · ${plural(s.visits, 'visit')}`));
      c.dayEl.appendChild(c.sessEl);
    }
    const row = el('div', 'visit');
    fillRow(row, v);
    c.sessEl.appendChild(row);
  }
  tl.appendChild(frag);
  st.rendered = end;
  $('more').hidden = st.rendered >= entries.length;
  updateSummaryLine();
}

function updateSummaryLine() {
  const total = st.filtered.length;
  $('summary-line').textContent = total ? `${plural(total, 'visit')} ${total === 1 ? 'matches' : 'match'} · showing ${num(Math.min(st.rendered, total))}` : '';
}

// Main-area message: loading, error (with Retry), empty history (with Reload) or no filter matches.
// The overview panels are hidden while there is no data at all.
function renderState() {
  const kind = viewState({ loading: st.loading, error: st.error, total: st.all.length, shown: st.filtered.length });
  const box = $('state');
  const msg = $('state-msg');
  const act = $('state-action');
  $('overview').hidden = st.all.length === 0;
  box.hidden = kind === 'results';
  box.classList.toggle('state-error', kind === 'error');
  box.removeAttribute('role');
  act.hidden = true;
  act.onclick = null;
  if (kind === 'results') return;
  if (kind === 'error') {
    box.setAttribute('role', 'alert');
    msg.textContent = st.error;
    act.textContent = 'Retry'; act.hidden = false; act.onclick = () => retry();
  } else if (kind === 'loading') {
    box.setAttribute('role', 'status');
    msg.textContent = LOADING_MSG;
  } else if (kind === 'empty-history') {
    msg.textContent = EMPTY_HISTORY;
    act.textContent = 'Reload'; act.hidden = false; act.onclick = () => location.reload();
  } else {
    const f = filters();
    const searching = !!(f.text.trim() || f.domain.trim());
    const hiddenCount = st.hide && searching ? applyFilters(st.all, f, false).filter((v) => v.categories.length).length - st.filtered.filter((v) => v.categories.length).length : 0;
    msg.textContent = isReversedRange(f.start, f.end) ? RANGE_REVERSED : emptyFilteredMessage({ hide: st.hide, hiddenCount, searching });
  }
}

function checkSentinel() {
  if (!st.lay || st.rendered >= st.lay.entries.length) return;
  if ($('sentinel').getBoundingClientRect().top < window.innerHeight + 600) { renderMore(PAGE); checkSentinel(); }
}

function updateMaskNote() {
  $('mask-note').hidden = !(st.hide && ($('f-q').value.trim() || $('f-domain').value.trim()));
}

// Recompute everything from st.all. keepCount keeps already-rendered rows when
// background loading adds visits.
function updateRangeNote() {
  const bad = isReversedRange($('f-start').value, $('f-end').value);
  $('range-msg').hidden = !bad;
  $('range-msg').textContent = bad ? RANGE_REVERSED : '';
  for (const id of ['f-start', 'f-end']) { if (bad) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid'); }
}

function renderSummary() {
  const box = $('filter-summary');
  const items = filterSummary(filters(), { catLabel, transitionLabel, allTransitions: TRANSITIONS.length });
  const list = $('filter-chips');
  list.replaceChildren();
  $('filter-summary-text').textContent = items.length ? `Showing ${plural(st.filtered.length, 'visit')} matching:` : `Showing all ${plural(st.filtered.length, 'visit')}.`;
  for (const it of items) {
    const li = el('li', 'fchip');
    const b = el('button', '', '\u00d7');
    b.type = 'button'; b.setAttribute('aria-label', `Remove filter: ${it.label}`);
    b.addEventListener('click', () => { clearFilter(it.key); $('f-reset').focus(); });
    li.append(el('span', '', it.label + ' '), b);
    list.appendChild(li);
  }
  box.classList.toggle('has-filters', items.length > 0);
}

function clearFilter(key) {
  if (key === 'dates') { $('f-start').value = ''; $('f-end').value = ''; }
  else if (key === 'start') $('f-start').value = '';
  else if (key === 'end') $('f-end').value = '';
  else if (key === 'text') $('f-q').value = '';
  else if (key === 'domain') $('f-domain').value = '';
  else if (key === 'transitions') for (const c of $('f-trans').querySelectorAll('input')) c.checked = true;
  else if (key.startsWith('cat:')) st.cats.delete(key.slice(4));
  refresh();
}

function refresh({ keepCount = false } = {}) {
  updateMaskNote();
  updateRangeNote();
  const f = filters();
  const prev = keepCount ? st.rendered : 0;
  const inRange = applyFilters(st.all, { ...f, cats: null, transitions: null }, st.hide, { ignoreTextDomain: true });
  const overview = applyFilters(st.all, f, st.hide, { ignoreTextDomain: true, ignoreTransitions: true });
  st.filtered = applyFilters(st.all, f, st.hide).sort((a, b) => b.time - a.time || (b.visitId < a.visitId ? -1 : 1));
  renderChart(overview);
  renderDomains(overview);
  renderChips(inRange);
  st.lay = layout(st.filtered);
  st.rendered = 0;
  st.cur = { day: -1, sess: -1, dayEl: null, sessEl: null };
  $('timeline').replaceChildren();
  renderMore(Math.max(PAGE, prev));
  renderState();
  renderSummary();
  checkSentinel();
}

// ---- loading ----
const hasHistoryApi = (h) => !!h && typeof h.search === 'function';
let currentHistory = null;
function retry() {
  st.all = []; st.error = null; st.revealed.clear();
  setStatus('');
  refresh();
  return loadAll(currentHistory);
}

let refreshTimer = 0;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => { refreshTimer = 0; refresh({ keepCount: true }); }, 400);
}

async function loadAll(history) {
  st.loading = true;
  st.error = null;
  const prog = $('load-progress');
  const cancel = $('load-cancel');
  const ac = new AbortController();
  prog.hidden = false;
  cancel.hidden = false;
  cancel.onclick = () => ac.abort();
  try {
    await loadVisits(history, {
      signal: ac.signal,
      startTime: 0, endTime: Date.now() + 1, // endTime is exclusive
      onBatch: (batch) => { annotate(batch, st.classifier); st.all.push(...batch); scheduleRefresh(); },
      onProgress: ({ urls, visits, done }) => { if (!done) setStatus(`Loading… ${plural(visits, 'visit')} from ${plural(urls, 'page')}`); },
    });
    setStatus(`${plural(st.all.length, 'visit')} loaded`);
  } catch (e) {
    if (e && e.name === 'AbortError') setStatus(`Loading cancelled: ${plural(st.all.length, 'visit')} loaded (partial)`);
    else {
      console.error('History load failed', e);
      st.error = describeLoadError(e, { hasApi: hasHistoryApi(history) });
      setStatus('');
    }
  } finally {
    st.loading = false;
    prog.hidden = true;
    cancel.hidden = true;
    clearTimeout(refreshTimer); refreshTimer = 0;
    refresh({ keepCount: true });
  }
}

// ---- settings: user rules ----
function userRulesFromText(text) {
  if (!text.trim()) return { rules: null };
  return parseUserRules(text);
}
function rebuildClassifier(userRules) {
  st.classifier = createClassifier({ bundledRules: st.bundled, userRules });
  for (const v of st.all) v.categories = st.classifier.classify(v.url);
}
function initSettings(savedText) {
  st.rulesSaved = savedText ?? '';
  $('rules-text').value = st.rulesSaved;
  $('settings-btn').addEventListener('click', () => {
    const open = $('settings').hidden;
    $('settings').hidden = !open;
    $('settings-btn').setAttribute('aria-expanded', String(open));
    if (open) $('rules-text').focus();
  });
  $('rules-save').addEventListener('click', async () => {
    const text = $('rules-text').value;
    const r = userRulesFromText(text);
    $('rules-status').textContent = '';
    if (r.error) { $('rules-error').textContent = r.error; $('rules-text').setAttribute('aria-invalid', 'true'); return; }
    $('rules-error').textContent = '';
    $('rules-notice').textContent = '';
    $('rules-text').removeAttribute('aria-invalid');
    try {
      if (text.trim()) await store.set(RULES_KEY, text); else await store.remove(RULES_KEY);
    } catch (e) { $('rules-error').textContent = 'Could not save the rules.'; return; }
    st.rulesSaved = text;
    rebuildClassifier(r.rules);
    $('rules-status').textContent = 'Rules saved and applied.';
    refresh({ keepCount: true });
  });
  $('rules-revert').addEventListener('click', () => {
    $('rules-text').value = st.rulesSaved;
    $('rules-error').textContent = '';
    $('rules-text').removeAttribute('aria-invalid');
    $('rules-status').textContent = 'Changes reverted.';
  });
}

// ---- CSV ----
let exportTimer = 0;
function exportCsv() {
  const blob = new Blob([toCsv(st.filtered, st.hide)], { type: 'text/csv' });
  const name = csvFilename(filters());
  downloadBlob(blob, name);
  const msg = `Exported ${plural(st.filtered.length, 'row')} to ${name}. Times are in UTC.`;
  setStatus(msg);
  const fb = $('export-feedback');
  fb.textContent = msg;
  clearTimeout(exportTimer);
  exportTimer = setTimeout(() => { fb.textContent = ''; }, 8000);
}

// ---- wiring ----

function wire() {
  buildTransitionFilter($('f-trans'), TRANSITIONS, () => refresh());
  for (const l of $('f-trans').querySelectorAll('label')) {
    const raw = l.querySelector('input').value;
    l.lastChild.textContent = transitionLabel(raw);
    l.title = raw;
  }
  $('filters').addEventListener('submit', (e) => e.preventDefault());
  const deb = debounce(() => refresh(), 250);
  $('f-q').addEventListener('input', deb);
  $('f-domain').addEventListener('input', deb);
  $('f-start').addEventListener('change', () => refresh());
  $('f-end').addEventListener('change', () => refresh());
  $('f-reset').addEventListener('click', () => {
    for (const id of ['f-start', 'f-end', 'f-q', 'f-domain']) $(id).value = '';
    st.cats.clear();
    for (const c of $('f-trans').querySelectorAll('input')) c.checked = true;
    refresh();
  });
  $('f-csv').addEventListener('click', exportCsv);
  dismissPopup($('f-trans').closest('details'), document, $('f-trans').closest('details').querySelector('summary'));
  try { st.hide = localStorage.getItem(HIDE_KEY) === '1'; } catch { /* ignore */ }
  $('f-hide').checked = st.hide;
  $('f-hide').addEventListener('change', (e) => {
    st.hide = e.target.checked;
    st.revealed.clear();
    try { localStorage.setItem(HIDE_KEY, st.hide ? '1' : '0'); } catch { /* ignore */ }
    refresh({ keepCount: true });
  });
  $('more').addEventListener('click', () => renderMore(PAGE));
  window.addEventListener('scroll', checkSentinel, { passive: true });
  window.addEventListener('resize', checkSentinel);
  $('domains').addEventListener('keydown', (e) => {
    const btns = [...$('domains').querySelectorAll('button')];
    const i = btns.indexOf(document.activeElement);
    const j = rovingIndex(e.key, i, btns.length);
    if (j == null) return;
    e.preventDefault();
    btns[i].tabIndex = -1; btns[j].tabIndex = 0; btns[j].focus();
  });
  // Roving tabindex on the chart.
  const chart = $('chart');
  chart.addEventListener('keydown', (e) => {
    const bars = [...chart.querySelectorAll('.bar')];
    const i = bars.indexOf(document.activeElement);
    if (i < 0) return;
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: bars.length - 1 }[e.key];
    if (j == null) return;
    e.preventDefault();
    const t = bars[Math.max(0, Math.min(bars.length - 1, j))];
    bars[i].tabIndex = -1; t.tabIndex = 0; t.focus();
  });
  chart.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('.bar');
    if (t) for (const b of chart.querySelectorAll('.bar')) b.tabIndex = b === t ? 0 : -1;
  });
}

// `history` is the chrome.history API, passed in by ui/main.js. This module never selects the source itself.
export async function start(history) {
  wire();
  try {
    st.bundled = await loadBundledRules();
    const text = (await store.get(RULES_KEY)) ?? '';
    const r = userRulesFromText(typeof text === 'string' ? text : '');
    st.classifier = createClassifier({ bundledRules: st.bundled, userRules: r.rules ?? null });
    initSettings(typeof text === 'string' ? text : '');
    if (r.error) {
      const msg = 'Saved rules are invalid and were ignored (built-in rules only): ' + r.error;
      $('rules-error').textContent = msg;
      $('rules-notice').textContent = msg + ' Open Settings to fix them; the saved text is kept until you save a valid replacement.';
    }
  } catch (e) { setStatus('Error starting: ' + (e && e.message ? e.message : 'unknown error')); return; }
  currentHistory = history;
  st.loading = true; // before the first refresh, so the empty-history text is never shown while loading
  refresh();
  if (!hasHistoryApi(history)) {
    st.loading = false;
    st.error = describeLoadError(null, { hasApi: false });
    refresh();
    return;
  }
  await loadAll(history);
}
