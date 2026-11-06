// Pure view-model logic for the timeline (no DOM, no chrome.* APIs) so it can be unit tested.
import { dayKey, filterVisits, DEFAULT_SESSION_GAP_MS } from '../src/history/index.js';

import { MASK, csvCell, binOf, binRange } from './ui-common.js';
export { MASK, csvCell };
export const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export const EMPTY_HISTORY = 'The browser has no browsing history for this profile (it may be new, or its history was cleared). Visit some pages, then reload.';
export const EMPTY_FILTERED = 'No visits match these filters.';
export const LOADING_MSG = 'Loading your history…';
export const ERROR_NO_ACCESS = 'Chrome did not give this extension access to your history. Check chrome://extensions → Details → Permissions, then try again.';
export const ERROR_GENERIC = 'Your history could not be loaded. Try again; if it keeps failing, restart the browser.';

// Plain-English wording for a load failure. Never exposes the raw JS message.
// A missing history API or a permission error is reported as an access problem.
export function describeLoadError(e, { hasApi = true } = {}) {
  if (!hasApi) return ERROR_NO_ACCESS;
  const msg = String((e && e.message) || '');
  if (/permission|not allowed|denied|cannot read properties of (undefined|null)|undefined is not|is not a function/i.test(msg)) return ERROR_NO_ACCESS;
  return ERROR_GENERIC;
}

// Which main-area state to show. An error or loading state never falls through to the empty text.
export function viewState({ loading = false, error = null, total = 0, shown = 0 } = {}) {
  if (error) return 'error';
  if (loading && !total) return 'loading';
  if (shown > 0) return 'results';
  if (loading) return 'results';
  return total ? 'empty-filtered' : 'empty-history';
}
export const TRANSITION_LABELS = Object.freeze({
  link: 'Clicked link', typed: 'Typed address', auto_bookmark: 'Bookmark or suggestion', auto_subframe: 'Embedded page (automatic)',
  manual_subframe: 'Embedded page (clicked)', generated: 'Search result', auto_toplevel: 'Opened automatically', form_submit: 'Form submit',
  reload: 'Reload', keyword: 'Search shortcut', keyword_generated: 'Search shortcut result',
});
export const transitionLabel = (t) => TRANSITION_LABELS[t] ?? t;

export const RANGE_REVERSED = 'The \u201cTo\u201d date is earlier than the \u201cFrom\u201d date, so nothing can match. Swap the dates or clear one of them.';
export const isReversedRange = (start, end) => !!start && !!end && start > end;

// Empty-result text. With hide on, say how many flagged visits were left out of the search.
export function emptyFilteredMessage({ hide = false, hiddenCount = 0, searching = false } = {}) {
  if (hide && searching && hiddenCount > 0) {
    return `No visible visits match. ${plural(hiddenCount, 'sensitive visit')} would match but ${hiddenCount === 1 ? 'is' : 'are'} hidden and not searched. Turn off \u201cHide sensitive details\u201d to include ${hiddenCount === 1 ? 'it' : 'them'}.`;
  }
  return EMPTY_FILTERED;
}
const pad = (n) => String(n).padStart(2, '0');

export function isFlagged(v) { return v.categories.length > 0; }
export function isMasked(v, hide, revealed) { return hide && isFlagged(v) && !(revealed && revealed.has(v.visitId)); }

// Local-time bounds from <input type=date> values ('' = open).
export function dayStart(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
// Exclusive upper bound: local midnight after the given day (half-open ranges).
export function dayEnd(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d + 1).getTime(); }

export function annotate(visits, classifier) {
  for (const v of visits) v.categories = classifier.classify(v.url);
  return visits;
}

// f: {start, end ('YYYY-MM-DD'), text, domain, transitions (array|null), cats (Set)}.
// With `hide` on, flagged visits never match text/domain filters, so a search cannot
// reveal what a hidden title, URL or domain contains.
export function applyFilters(visits, f, hide, { ignoreTextDomain = false, ignoreTransitions = false } = {}) {
  let out = filterVisits(visits, {
    startTime: dayStart(f.start) ?? undefined,
    transitions: ignoreTransitions ? undefined : f.transitions ?? undefined,
  });
  const endEx = dayEnd(f.end);
  if (endEx != null) out = out.filter((v) => v.time < endEx);
  if (f.cats && f.cats.size) out = out.filter((v) => v.categories.some((c) => f.cats.has(c)));
  const text = (f.text ?? '').trim(), domain = (f.domain ?? '').trim();
  if (!ignoreTextDomain && (text || domain)) {
    if (hide) out = out.filter((v) => !isFlagged(v));
    out = filterVisits(out, { text, domain });
  }
  return out;
}

export function categoryCounts(visits) {
  const m = new Map();
  for (const v of visits) for (const c of v.categories) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

// ---- chart bins (local days; weeks start Monday) ----
export function chartBins(visits) {
  const days = new Map();
  for (const v of visits) {
    const k = dayKey(v.time);
    const e = days.get(k) ?? { visits: 0, flagged: 0 };
    e.visits++; if (isFlagged(v)) e.flagged++;
    days.set(k, e);
  }
  const unit = days.size > 400 ? 'month' : days.size > 120 ? 'week' : 'day';
  const bins = new Map();
  for (const [k, e] of days) {
    const b = binOf(k, unit);
    const x = bins.get(b) ?? { key: b, visits: 0, flagged: 0 };
    x.visits += e.visits; x.flagged += e.flagged;
    bins.set(b, x);
  }
  const list = [...bins.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const b of list) b.range = binRange(b.key, unit);
  return { unit, bins: list };
}

// [{domain, visits, categories:[...]}] top n; categories = union over the domain's visits.
export function domainStats(visits, n = 12) {
  const m = new Map();
  for (const v of visits) {
    if (!v.domain) continue;
    const e = m.get(v.domain) ?? { domain: v.domain, visits: 0, cats: new Set() };
    e.visits++; for (const c of v.categories) e.cats.add(c);
    m.set(v.domain, e);
  }
  return [...m.values()].sort((a, b) => b.visits - a.visits || (a.domain < b.domain ? -1 : 1))
    .slice(0, n).map((e) => ({ domain: e.domain, visits: e.visits, categories: [...e.cats].sort() }));
}

// Lay visits (newest first) out into days and sessions. entries[i] = {v, day, sess}.
export function layout(visits, gapMs = DEFAULT_SESSION_GAP_MS) {
  const days = [], sessions = [], entries = [];
  let lastMs = null;
  for (const v of visits) {
    const k = dayKey(v.time);
    let d = days[days.length - 1];
    if (!d || d.key !== k) { d = { key: k, ms: v.time, visits: 0, flagged: 0 }; days.push(d); lastMs = null; }
    let s = sessions[sessions.length - 1];
    if (!s || lastMs === null || lastMs - v.time > gapMs) { s = { first: v.time, last: v.time, visits: 0 }; sessions.push(s); }
    s.last = v.time; s.visits++; d.visits++; if (isFlagged(v)) d.flagged++;
    lastMs = v.time;
    entries.push({ v, day: days.length - 1, sess: sessions.length - 1 });
  }
  return { days, sessions, entries };
}

// ---- CSV ----
// Masks every flagged visit regardless of per-row reveals when `hide` is on.
// UTF-8 BOM first so Excel reads non-Latin titles correctly; times are ISO 8601 UTC, as the header says.
export const CSV_BOM = '\uFEFF';
export function toCsv(visits, hide) {
  const rows = [['time_utc', 'url', 'title', 'domain', 'transition', 'categories'].join(',')];
  for (const v of visits) {
    const m = hide && isFlagged(v);
    rows.push([new Date(v.time).toISOString(), m ? MASK : v.url, m ? MASK : v.title, m ? MASK : v.domain,
      v.transition, v.categories.join(';')].map(csvCell).join(','));
  }
  return CSV_BOM + rows.join('\r\n') + '\r\n';
}

// Export file name: history-<today, local>[-<from>][-to-<to>][-<domain>][-search].csv, safe for file systems.
export function csvFilename(f, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const slug = (t) => t.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(0, 30);
  const parts = ['history', today];
  if (f.start && f.end) parts.push(f.start === f.end ? `on-${f.start}` : `${f.start}-to-${f.end}`);
  else if (f.start) parts.push(`from-${f.start}`);
  else if (f.end) parts.push(`to-${f.end}`);
  const d = slug(f.domain || ''); if (d) parts.push(d);
  if ((f.text || '').trim()) parts.push('search');
  return parts.join('-') + '.csv';
}

// Active filters as [{key, label}] for the summary line; each key says which filter its remove button clears.
export function filterSummary(f, { catLabel = (c) => c, transitionLabel: tl = (t) => t, allTransitions = 0 } = {}) {
  const out = [];
  const day = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
  if (f.start && f.end && f.start === f.end) out.push({ key: 'dates', label: day(f.start) });
  else {
    if (f.start) out.push({ key: 'start', label: `from ${day(f.start)}` });
    if (f.end) out.push({ key: 'end', label: `to ${day(f.end)}` });
  }
  if ((f.text || '').trim()) out.push({ key: 'text', label: `search \u201c${f.text.trim()}\u201d` });
  if ((f.domain || '').trim()) out.push({ key: 'domain', label: f.domain.trim() });
  if (f.transitions) {
    const on = f.transitions.filter((t) => t !== '\u0000none');
    out.push({ key: 'transitions', label: on.length ? `types: ${on.map(tl).join(', ')}` : 'no transition types' });
  }
  for (const c of f.cats || []) out.push({ key: 'cat:' + c, label: `flagged: ${catLabel(c)}` });
  return out;
}

// ---- keyboard helpers (DOM-free apart from the objects passed in, so they are unit-tested in Node) ----

// Index to focus after `key` in a roving group of `n` items currently at `i`; null when the key is not handled.
export function rovingIndex(key, i, n, keys = { next: 'ArrowDown', prev: 'ArrowUp' }) {
  if (n <= 0 || i < 0) return null;
  const j = { [keys.next]: i + 1, [keys.prev]: i - 1, Home: 0, End: n - 1 }[key];
  return j == null ? null : Math.max(0, Math.min(n - 1, j));
}

// Closes a <details> popup on Escape (returning focus to its summary) and on a click outside it.
// `doc` only needs addEventListener; `details` needs open, contains() and a summary with focus().
export function dismissPopup(details, doc, summary) {
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !details.open) return;
    details.open = false;
    summary.focus();
  });
  doc.addEventListener('click', (e) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
}

// ---- "Hide sensitive details": on by default for first-time users; a saved choice always wins ----
export const HIDE_DEFAULT = true;
export function initialHide(stored) {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return HIDE_DEFAULT; // nothing (or something unrecognised) stored: first-time default
}

// ---- rules editor ----
export const RULES_EXAMPLE = '{\n  "add": {\n    "finance": { "domains": ["mybank.example"] }\n  },\n  "allow": {\n    "news_politics": { "domains": ["example.org"] }\n  }\n}';
export const RULES_EMPTY_CONFIRM = 'Saving an empty box removes all your custom rules. Press “Save rules” again to confirm.';
export const rulesCategoryList = (cats) => cats.map((c) => `${c.id} (${c.label})`).join(', ');
// Saving blank text over saved rules would silently delete them, so it needs a second press.
export const needsEmptyConfirm = (text, saved) => !String(text).trim() && !!String(saved).trim();

// Plain-English version of a rules parser error. The technical detail is kept after the plain text.
export function friendlyRulesError(msg, cats = []) {
  const m = String(msg ?? '');
  const valid = cats.length ? ` Valid categories: ${cats.map((c) => c.id).join(', ')}.` : '';
  let plain;
  if (/^(invalid|not valid) JSON/i.test(m)) plain = 'This is not valid JSON, so nothing was saved. Check for a missing quote, comma or bracket, or press “Insert example” to start from a working one.';
  else if (/must be a JSON object/i.test(m)) plain = 'The rules must be a JSON object that starts with { and ends with }.';
  else if (/unknown field/i.test(m)) plain = 'Only “add” and “allow” are allowed at the top level.';
  else if (/unknown category/i.test(m)) plain = 'One of the category names is not recognised.' + valid;
  else if (/larger than/i.test(m)) plain = 'The rules text is too large.';
  else if (/keyword/i.test(m)) plain = 'A keyword is too short or contains a space, /, ? or #.';
  else plain = 'These rules could not be used, so nothing was saved.';
  return `${plain} (Detail: ${m})`;
}

// Index of the chart bar under a pointer at clientX, for touch scrubbing.
export function barIndexAt(x, left, width, n) {
  if (!n || !(width > 0)) return -1;
  return Math.max(0, Math.min(n - 1, Math.floor(((x - left) / width) * n)));
}
