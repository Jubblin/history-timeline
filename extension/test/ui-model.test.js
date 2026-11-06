import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, toCsv, csvFilename, filterSummary, CSV_BOM, csvCell, layout, chartBins, domainStats, annotate, isMasked, MASK, plural, EMPTY_HISTORY, EMPTY_FILTERED, describeLoadError, viewState, rovingIndex, dismissPopup, ERROR_NO_ACCESS, ERROR_GENERIC, LOADING_MSG } from '../ui/model.js';
import { createClassifier, parseUserRules, loadBundledRules } from '../ui/test-support/stub-classifier.js';

const T0 = new Date(2025, 5, 10, 12, 0).getTime();
const mk = (id, min, url, title, transition = 'link') => ({ visitId: String(id), time: T0 + min * 60000, url, title,
  domain: new URL(url).hostname, transition, referringVisitId: '', isLocal: true });
async function data() {
  const clf = createClassifier({ bundledRules: await loadBundledRules(), userRules: null });
  return annotate([
    mk(1, 0, 'https://casino.example.test/slots', 'Secret slots'),
    mk(2, 5, 'https://a.example.test/x', 'Secret garden'),
    mk(3, 100, 'https://a.example.test/y', '=cmd|calc', 'typed'),
    mk(4, 24 * 60, 'https://b.example.test/z', 'Next day'),
  ], clf);
}

test('masked search does not match flagged values', async () => {
  const vs = await data();
  const f = { text: 'secret', domain: '', cats: new Set() };
  assert.deepEqual(applyFilters(vs, f, false).map((v) => v.visitId), ['1', '2']);
  assert.deepEqual(applyFilters(vs, f, true).map((v) => v.visitId), ['2']);
  assert.deepEqual(applyFilters(vs, { text: '', domain: 'casino.example.test', cats: new Set() }, true), []);
  assert.equal(applyFilters(vs, { text: '', domain: 'casino.example.test', cats: new Set() }, false).length, 1);
});

test('category and transition filters', async () => {
  const vs = await data();
  assert.deepEqual(applyFilters(vs, { cats: new Set(['gambling']) }, false).map((v) => v.visitId), ['1']);
  assert.deepEqual(applyFilters(vs, { transitions: ['typed'] }, false).map((v) => v.visitId), ['3']);
});

test('csv masks flagged rows, guards formulas, adds categories', async () => {
  const vs = await data();
  const lines = toCsv(vs, true).slice(1).trim().split('\r\n');
  assert.equal(lines[0], 'time_utc,url,title,domain,transition,categories');
  assert.ok(lines[1].includes(`${MASK},${MASK},${MASK}`) && lines[1].endsWith('link,gambling'));
  assert.ok(!toCsv(vs, true).includes('Secret slots'));
  assert.ok(toCsv(vs, false).includes('Secret slots'));
  assert.ok(lines[3].includes("'=cmd|calc"));
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
});

test('layout groups by local day and 30 minute sessions, counts flags', async () => {
  const vs = (await data()).sort((a, b) => b.time - a.time);
  const l = layout(vs);
  assert.equal(l.days.length, 2);
  assert.deepEqual(l.days.map((d) => [d.visits, d.flagged]), [[1, 0], [3, 1]]);
  assert.deepEqual(l.sessions.map((s) => s.visits), [1, 1, 2]);
});

test('chart bins, domain stats and masking helpers', async () => {
  const vs = await data();
  const { unit, bins } = chartBins(vs);
  assert.equal(unit, 'day');
  assert.deepEqual(bins.map((b) => [b.visits, b.flagged]), [[3, 1], [1, 0]]);
  const d = domainStats(vs);
  assert.equal(d[0].domain, 'a.example.test');
  assert.deepEqual(d.find((x) => x.domain === 'casino.example.test').categories, ['gambling']);
  assert.equal(isMasked(vs[0], true, new Set()), true);
  assert.equal(isMasked(vs[0], true, new Set(['1'])), false);
  assert.equal(isMasked(vs[1], true, new Set()), false);
});

test('week and month bins for long ranges', () => {
  const vs = [];
  for (let i = 0; i < 150; i++) vs.push({ visitId: String(i), time: new Date(2025, 0, 1 + i, 12).getTime(), categories: [] });
  const w = chartBins(vs);
  assert.equal(w.unit, 'week');
  assert.ok(w.bins.every((b) => new Date(b.key + 'T12:00').getDay() === 1));
  assert.equal(w.bins.reduce((n, b) => n + b.visits, 0), 150);
});

test('stub parseUserRules sanity', () => {
  assert.ok(parseUserRules('{"add":{"finance":{"domains":["x.test"]}}}').rules);
  assert.ok(parseUserRules('{').error);
  assert.ok(!parseUserRules('{"add":{"nope":{}}}').rules);
});

test('date range is half-open at the next local midnight', async () => {
  const vs = await data();
  const day2 = '2025-06-11';
  const mid = new Date(2025, 5, 11).getTime();
  const edge = [{ ...vs[0], visitId: 'e1', time: mid - 1 }, { ...vs[0], visitId: 'e2', time: mid }];
  assert.deepEqual(applyFilters(edge, { start: '2025-06-10', end: '2025-06-10' }, false).map((v) => v.visitId), ['e1']);
  assert.equal(applyFilters(edge, { start: day2, end: day2 }, false).map((v) => v.visitId)[0], 'e2');
});

test('plural pluralises', () => {
  assert.equal(plural(0, 'visit'), '0 visits');
  assert.equal(plural(1, 'visit'), '1 visit');
  assert.equal(plural(1234, 'visit'), (1234).toLocaleString() + ' visits');
  assert.equal(plural(1, 'page'), '1 page');
});

test('empty-history message differs from filtered-empty and mentions no sensitive terms', () => {
  assert.notEqual(EMPTY_HISTORY, EMPTY_FILTERED);
  assert.match(EMPTY_HISTORY, /no browsing history/);
});

test('viewState: loading and error never fall through to the empty text', () => {
  assert.equal(viewState({ loading: true, total: 0, shown: 0 }), 'loading');
  assert.equal(viewState({ error: 'x', total: 0, shown: 0 }), 'error');
  assert.equal(viewState({ error: 'x', loading: true, total: 5, shown: 5 }), 'error');
  assert.equal(viewState({ total: 0, shown: 0 }), 'empty-history');
  assert.equal(viewState({ total: 5, shown: 0 }), 'empty-filtered');
  assert.equal(viewState({ total: 5, shown: 3 }), 'results');
  assert.equal(viewState({ loading: true, total: 5, shown: 0 }), 'results');
  assert.match(LOADING_MSG, /^Loading/);
});

test('describeLoadError gives plain wording and never the raw JS message', () => {
  const raw = "Cannot read properties of undefined (reading 'search')";
  assert.equal(describeLoadError(new TypeError(raw), { hasApi: false }), ERROR_NO_ACCESS);
  assert.equal(describeLoadError(new TypeError(raw)), ERROR_NO_ACCESS);
  assert.equal(describeLoadError(new Error('Permission denied')), ERROR_NO_ACCESS);
  assert.equal(describeLoadError(new Error('boom: disk 0x1f')), ERROR_GENERIC);
  assert.equal(describeLoadError(null), ERROR_GENERIC);
  for (const m of [ERROR_NO_ACCESS, ERROR_GENERIC]) assert.doesNotMatch(m, /Cannot read|undefined|boom/);
  assert.match(ERROR_NO_ACCESS, /Permissions/);
});

test('reversed date range is detected and explained', async () => {
  const { isReversedRange, RANGE_REVERSED } = await import('../ui/model.js');
  assert.equal(isReversedRange('2025-06-10', '2025-06-01'), true);
  assert.equal(isReversedRange('2025-06-01', '2025-06-10'), false);
  assert.equal(isReversedRange('2025-06-01', '2025-06-01'), false);
  assert.equal(isReversedRange('', '2025-06-01'), false);
  assert.match(RANGE_REVERSED, /earlier than/);
  const vs = await data();
  assert.deepEqual(applyFilters(vs, { start: '2025-06-11', end: '2025-06-10', cats: new Set() }, false), []);
});

test('hide-mode search gives a specific empty message', async () => {
  const { emptyFilteredMessage } = await import('../ui/model.js');
  const vs = await data();
  const f = { text: 'slots', domain: '', cats: new Set() };
  const hiddenCount = applyFilters(vs, f, false).filter((v) => v.categories.length).length - applyFilters(vs, f, true).filter((v) => v.categories.length).length;
  assert.equal(hiddenCount, 1);
  const m = emptyFilteredMessage({ hide: true, hiddenCount, searching: true });
  assert.match(m, /1 sensitive visit would match but is hidden and not searched/);
  assert.match(emptyFilteredMessage({ hide: true, hiddenCount: 3, searching: true }), /3 sensitive visits would match but are hidden/);
  assert.equal(emptyFilteredMessage({ hide: true, hiddenCount: 0, searching: true }), EMPTY_FILTERED);
  assert.equal(emptyFilteredMessage({ hide: false, hiddenCount: 2, searching: true }), EMPTY_FILTERED);
  assert.equal(emptyFilteredMessage({ hide: true, hiddenCount: 2, searching: false }), EMPTY_FILTERED);
});

test('every transition has a plain label', async () => {
  const { transitionLabel, TRANSITION_LABELS } = await import('../ui/model.js');
  const { TRANSITIONS } = await import('../src/history/index.js');
  for (const t of TRANSITIONS) assert.ok(TRANSITION_LABELS[t] && !/_/.test(TRANSITION_LABELS[t]), t);
  assert.equal(transitionLabel('typed'), 'Typed address');
  assert.equal(transitionLabel('mystery'), 'mystery');
});

// ---- popup dismissal and roving focus (F6) ----
function popupFixture() {
  const handlers = {};
  const doc = { addEventListener: (t, f) => { handlers[t] = f; } };
  const inside = {}, outside = {};
  const summary = { focused: 0, focus() { this.focused++; } };
  const details = { open: true, contains: (n) => n === inside };
  dismissPopup(details, doc, summary);
  return { handlers, details, summary, inside, outside };
}

test('Escape closes the open popup and returns focus to its summary', () => {
  const { handlers, details, summary } = popupFixture();
  handlers.keydown({ key: 'a' });
  assert.equal(details.open, true);
  handlers.keydown({ key: 'Escape' });
  assert.equal(details.open, false);
  assert.equal(summary.focused, 1);
  handlers.keydown({ key: 'Escape' }); // already closed: focus is left alone
  assert.equal(summary.focused, 1);
});

test('a click outside closes the popup; a click inside does not and focus is not stolen', () => {
  const { handlers, details, summary, inside, outside } = popupFixture();
  handlers.click({ target: inside });
  assert.equal(details.open, true);
  handlers.click({ target: outside });
  assert.equal(details.open, false);
  assert.equal(summary.focused, 0);
});

test('rovingIndex moves within bounds with Up/Down/Home/End and ignores other keys', () => {
  assert.equal(rovingIndex('ArrowDown', 0, 3), 1);
  assert.equal(rovingIndex('ArrowDown', 2, 3), 2);
  assert.equal(rovingIndex('ArrowUp', 0, 3), 0);
  assert.equal(rovingIndex('ArrowUp', 2, 3), 1);
  assert.equal(rovingIndex('Home', 2, 3), 0);
  assert.equal(rovingIndex('End', 0, 3), 2);
  assert.equal(rovingIndex('Tab', 0, 3), null);
  assert.equal(rovingIndex('ArrowDown', -1, 3), null);
  assert.equal(rovingIndex('ArrowDown', 0, 0), null);
});

test('csv starts with a UTF-8 BOM and labels its times as UTC', async () => {
  const csv = toCsv(await data(), false);
  assert.equal(csv[0], CSV_BOM);
  assert.ok(csv.startsWith(CSV_BOM + 'time_utc,url,'));
  assert.match(csv.split('\r\n')[1], /^\d{4}-\d\d-\d\dT[\d:.]+Z,/);
});

test('csvFilename includes local date and filters, and is file-system safe', () => {
  const now = new Date(2026, 10, 6, 9, 0);
  assert.equal(csvFilename({}, now), 'history-2026-11-06.csv');
  assert.equal(csvFilename({ start: '2026-08-21', end: '2026-08-21' }, now), 'history-2026-11-06-on-2026-08-21.csv');
  assert.equal(csvFilename({ start: '2026-08-01', end: '2026-08-31', domain: 'Site0.example.test', text: 'x' }, now),
    'history-2026-11-06-2026-08-01-to-2026-08-31-site0.example.test-search.csv');
  assert.equal(csvFilename({ domain: '../../etc/passwd ' }, now), 'history-2026-11-06-etc-passwd.csv');
  assert.ok(!/[\\/:*?"<>|\s]/.test(csvFilename({ domain: 'a/b c:d' }, now)));
});

test('filterSummary lists each active filter with a key for its remove button', () => {
  assert.deepEqual(filterSummary({ start: '', end: '', text: ' ', domain: '', transitions: null, cats: new Set() }), []);
  const s = filterSummary({ start: '2026-08-21', end: '2026-08-21', text: 'cat', domain: 'a.test', transitions: ['typed'], cats: new Set(['gambling']) },
    { catLabel: (c) => c.toUpperCase() });
  assert.deepEqual(s.map((x) => x.key), ['dates', 'text', 'domain', 'transitions', 'cat:gambling']);
  assert.ok(s[1].label.includes('cat') && s[4].label.includes('GAMBLING'));
  assert.deepEqual(filterSummary({ start: '2026-08-01', end: '2026-08-02' }).map((x) => x.key), ['start', 'end']);
  assert.equal(filterSummary({ transitions: ['\u0000none'] })[0].label, 'no transition types');
});
