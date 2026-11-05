// Drift check: this repo is the MASTER for the shared fixture and rules.
//   extension/test/filter-cases.json      -> app repo internal/server/testdata/filter-cases.json
//   extension/src/classify/rules.json     -> app repo internal/classify/rules.json
// The app repo copies are downstream. On mismatch, update the app repo from this one, never the reverse.
// Reads the app repo anonymously over HTTPS, pinned to DRIFT_REF (default: main branch).
// DRIFT_BASE_URL may point at a local directory (testing) instead of GitHub.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffLines } from './lib/line-diff.mjs';

const REPO = 'Jubblin/history-timeline-app';
const ref = process.env.DRIFT_REF || 'main';
const base = process.env.DRIFT_BASE_URL || `https://raw.githubusercontent.com/${REPO}/${ref}`;

const pairs = [
  ['extension/test/filter-cases.json', 'internal/server/testdata/filter-cases.json'],
  ['extension/src/classify/rules.json', 'internal/classify/rules.json'],
];

const root = new URL('../../', import.meta.url);
const canon = (v) => JSON.stringify(v, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x, 2);

async function remote(path) {
  if (base.startsWith('/')) return readFileSync(join(base, path), 'utf8');
  const res = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${base}/${path}`);
  return res.text();
}

let failed = false;
for (const [local, theirs] of pairs) {
  let a, b;
  try { a = canon(JSON.parse(readFileSync(new URL(local, root), 'utf8'))); }
  catch (e) { console.error(`ERROR reading ${local}: ${e.message}`); process.exit(2); }
  try { b = canon(JSON.parse(await remote(theirs))); }
  catch (e) {
    console.error(`ERROR: could not fetch ${REPO}:${theirs} (${ref}): ${e.message}`);
    console.error('The drift check did NOT run for this file; this is not a pass.');
    process.exit(2);
  }
  if (a === b) { console.log(`ok   ${local} == ${REPO}:${theirs}`); continue; }
  failed = true;
  console.error(`DRIFT ${local} differs from ${REPO}:${theirs} (${ref})`);
  console.error('  This repo is the master. Update the app repo from this one, never the reverse.');
  console.error('  Diff (- this repo, + app repo):');
  console.error(diffLines(a, b).split('\n').map((l) => '    ' + l).join('\n'));
}
process.exit(failed ? 1 : 0);
