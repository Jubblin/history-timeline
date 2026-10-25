// Runs the shared filter cases (filter-cases.json, also run by internal/server/filter_cases_test.go)
// through applyFilters so the in-browser filtering cannot drift from the server's.
process.env.TZ = 'UTC'; // the fixture's day boundaries are UTC; applyFilters uses local days
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Classifier } from '../src/classify/classify.js';
import { applyFilters, annotate } from '../ui/model.js';

const fx = JSON.parse(readFileSync(new URL('filter-cases.json', import.meta.url), 'utf8'));
const bundled = JSON.parse(readFileSync(new URL('../src/classify/rules.json', import.meta.url), 'utf8'));
const clf = new Classifier(bundled);

const visits = () => annotate(fx.visits.map((v) => ({
  visitId: String(v.id), time: Date.parse(v.time), url: v.url, title: v.title,
  domain: new URL(v.url).hostname, transition: v.transition, referringVisitId: '', isLocal: true,
})), clf);

for (const c of fx.cases) {
  test(`filter case: ${c.name}`, () => {
    const f = c.filter;
    const got = applyFilters(visits(), {
      start: f.start ?? '', end: f.end ?? '', text: f.text ?? '', domain: f.domain ?? '',
      transitions: f.transitions ?? null, cats: new Set(f.categories ?? []),
    }, !!f.hide).map((v) => Number(v.visitId)).sort((a, b) => a - b);
    const want = c.known?.client ?? c.want;
    assert.deepEqual(got, want);
  });
}
