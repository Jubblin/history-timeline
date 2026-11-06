// Generates the 1280x800 Web Store screenshots from SYNTHETIC fixture data, loading the
// UNPACKED extension (not the zip) via its test-support fixture page. Sensitive-looking
// rows are masked with "Hide sensitive details" so no brand-name examples are shown.
// Usage: PLAYWRIGHT_BROWSERS_PATH=<dir> NODE_PATH=<dir>/node_modules node store/make-screenshots.cjs OUTDIR
const { chromium } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');

const ext = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'screenshots'));
fs.mkdirSync(out, { recursive: true });

async function open(scheme) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'shot-')), {
    headless: false, channel: 'chromium', colorScheme: scheme, locale: 'en-GB', env: { ...process.env, LANGUAGE: 'en_GB', LC_ALL: 'en_GB.UTF-8' }, viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--headless=new', '--no-sandbox', '--lang=en-GB', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch'],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/ui/test-support/timeline-fixture.html?clean=1`);
  await page.waitForFunction(() => /visits? loaded/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  await page.check('#f-hide'); // on by default; check() is a no-op then
  await page.waitForTimeout(400);
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(out, name) });

(async () => {
  let { ctx, page } = await open('light');
  await shot(page, '1-timeline-light.png');
  const chip = page.locator('#cat-chips button, #cat-chips input, #cat-chips label').first();
  if (await chip.count()) { await chip.click(); await page.waitForTimeout(500); await shot(page, '2-category-filter-light.png'); await chip.click(); }
  await page.click('#settings-btn');
  await page.fill('#rules-text', JSON.stringify({ add: { finance: { domains: ['mybank.example'] } }, allow: { news_politics: { domains: ['example.org'] } } }, null, 1));
  await page.waitForTimeout(300);
  await shot(page, '3-rules-settings-light.png');
  // 5: hide sensitive details ON (top) versus OFF (bottom), same Gambling filter, composed from two real captures.
  await page.click('#settings-btn').catch(() => {});
  await page.waitForTimeout(300);
  const clip = { x: 0, y: 400, width: 1280, height: 340 };
  const chip5 = page.locator('#cat-chips button, #cat-chips input, #cat-chips label').first();
  await chip5.click(); await page.waitForTimeout(500);
  const on = (await page.screenshot({ clip })).toString('base64');
  await page.uncheck('#f-hide');
  await page.waitForTimeout(500);
  // Replace the fixture's real-looking brand with a reserved example domain (screenshot only).
  await page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) n.nodeValue = n.nodeValue.replace(/bet365\.com/g, 'casino.example.test'); });
  const off = (await page.screenshot({ clip })).toString('base64');
  const cmp = await ctx.newPage();
  await cmp.setViewportSize({ width: 1280, height: 800 });
  await cmp.setContent(`<body style="margin:0;background:#fff;font:600 20px system-ui,sans-serif;padding:6px 8px;box-sizing:border-box;height:800px"><div>Hide sensitive details ON (default): flagged rows are masked</div><img style="width:100%;border:1px solid #888;margin:4px 0 8px" src="data:image/png;base64,${on}"><div>Hide sensitive details OFF: details shown (synthetic data)</div><img style="width:100%;border:1px solid #888;margin-top:4px" src="data:image/png;base64,${off}"></body>`);
  await shot(cmp, '5-hide-sensitive-before-after.png');
  await ctx.close();
  ({ ctx, page } = await open('dark'));
  await shot(page, '4-timeline-dark.png');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
