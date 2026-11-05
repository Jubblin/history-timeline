// Minimal line diff (LCS) with 2 lines of context; enough for readable CI output.
export function diffLines(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  const n = x.length, m = y.length;
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { out.push('  ' + x[i]); i++; j++; }
    else if (j >= m || (i < n && t[i + 1][j] >= t[i][j + 1])) out.push('- ' + x[i++]);
    else out.push('+ ' + y[j++]);
  }
  const keep = new Set();
  out.forEach((l, k) => { if (l[0] !== ' ') for (let d = -2; d <= 2; d++) keep.add(k + d); });
  const res = [];
  let gap = false;
  out.forEach((l, k) => {
    if (keep.has(k)) { res.push(l); gap = false; }
    else if (!gap) { res.push('  ...'); gap = true; }
  });
  return res.join('\n');
}
