#!/usr/bin/env node
/*
 * End-to-end test for Simple mode.
 *
 *   node tests/simple-mode.test.js
 *
 * Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
 * Serves the project folder on a random local port, drives the app in headless Chromium with
 * a fake clock (so minutes of timing run in milliseconds), and exits non-zero on any failure.
 */
'use strict';
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/* ---------- tiny test runner ---------- */
const results = [];
let current = '';
function check(cond, what, detail = '') {
  results.push({ ok: !!cond, name: `${current} › ${what}`, detail });
  if (!cond) console.log(`   ✗ ${what}${detail ? ' — ' + detail : ''}`);
}
const eq = (a, b, what) => check(JSON.stringify(a) === JSON.stringify(b), what, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/* ---------- app helpers ---------- */
async function openApp(browser, base, device = 'iPad Pro 11 landscape', { clock = true } = {}) {
  const ctx = await browser.newContext({ ...devices[device], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', e => page.problems.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page.problems.push('console: ' + m.text()); });
  page.on('requestfailed', r => page.problems.push('request failed: ' + r.url()));
  if (clock) await page.clock.install();
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  if (clock) await page.clock.runFor(2000); else await page.waitForTimeout(2000);  // past the launch logo
  return { ctx, page };
}
const tapOrClick = (page, sel) => page.locator(sel).click();
async function state(page) {
  return page.evaluate(() => {
    const m = document.getElementById('main-view');
    const sig = ([...m.classList].find(c => c.startsWith('s-')) || 's-idle').slice(2);
    return { text: document.getElementById('clock-text').getAttribute('aria-label'), sig, phase: m.dataset.phase };
  });
}
const tick = (page, secs) => page.clock.runFor(secs * 1000);
async function openSettings(page) { await tapOrClick(page, '#settings-btn'); }
async function done(page) { await tapOrClick(page, '#done-btn'); }
async function setTime(page, prefix, secs) {
  await page.fill(`#s-${prefix}-mm`, String(Math.floor(secs / 60)));
  await page.fill(`#s-${prefix}-ss`, String(secs % 60).padStart(2, '0'));
  await page.locator(`#s-${prefix}-ss`).dispatchEvent('change');
}
async function setTimes(page, { min, amber, max }) {
  if (max != null) await setTime(page, 'max', max);
  if (min != null) await setTime(page, 'min', min);
  if (amber != null) await setTime(page, 'amb', amber);
}
async function setSignals(page, on) {
  for (const k of ['green', 'amber', 'red', 'bell']) {
    const box = page.locator(`#sig-${k}`);
    if ((await box.isChecked()) !== on.includes(k)) await box.click();
  }
}
// offsetParent is null for fixed elements, so check for layout boxes instead
const visible = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; }, sel);
const toastText = page => page.evaluate(() => { const t = document.getElementById('toast'); return t.hidden ? '' : t.textContent; });
async function configure(page, opts) {
  await openSettings(page);
  if (opts.dir) await tapOrClick(page, opts.dir === 'up' ? '#dir-up' : '#dir-down');
  if (opts.times) await setTimes(page, opts.times);
  if (opts.signals) await setSignals(page, opts.signals);
  if (opts.bellAfter != null) { await page.fill('#bell-after', String(opts.bellAfter)); await page.locator('#bell-after').dispatchEvent('change'); }
  await done(page);
}
async function signalsAt(page, seconds) {
  await tapOrClick(page, '#startpause-btn');
  const out = []; let t = 0;
  for (const s of seconds) { await tick(page, s - t); t = s; const st = await state(page); out.push(`${st.text} ${st.sig}`); }
  await tapOrClick(page, '#stop-btn');
  return out;
}

/* ---------- tests ---------- */
async function run() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const allProblems = [];
  const T = async (name, fn) => {
    current = name; console.log(`• ${name}`);
    try { await fn(); } catch (e) { check(false, 'threw', e.message.split('\n')[0]); }
  };
  const fresh = async (fn, device) => {
    const { ctx, page } = await openApp(browser, base, device);
    try { await fn(page); } finally { allProblems.push(...page.problems.map(p => `[${current}] ${p}`)); await ctx.close(); }
  };

  await T('Launch logo and start-up screen', async () => {
    const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'], deviceScaleFactor: 1 });
    const page = await ctx.newPage(); await page.clock.install(); await page.goto(base);
    check(await visible(page, '#launch'), 'launch logo shows on open');
    await page.clock.runFor(2000); await page.waitForTimeout(700);
    check(!(await page.$('#launch')), 'launch logo gone after ~1.5 s');
    const st = await state(page);
    eq(st, { text: '7:00', sig: 'idle', phase: 'ready' }, 'opens on the ready clock at the default 7:00');
    check(await visible(page, '#startpause-btn'), 'Start is shown');
    check(!(await visible(page, '#reset-btn')) && !(await visible(page, '#stop-btn')), 'Reset and Stop hidden before a run');
    check(!(await visible(page, '#prev-slot')) && !(await visible(page, '#next-slot')), 'no slot arrows in Simple mode');
    check(await visible(page, '#settings-btn'), 'Settings gear is shown');
    eq(await page.innerText('#ready-info').then(t => t.replace(/\s+/g, ' ').trim()), '5:00 6:00 7:00 +30 s COUNT DOWN', 'ready line lists the colour times');
    eq(await page.evaluate(() => getComputedStyle(document.getElementById('main-view')).backgroundColor), 'rgb(13, 110, 156)', 'waiting background is Sea Country Dark');
    await ctx.close();
  });

  await T('Count down: colours, hold at 0:00, flashing', () => fresh(async page => {
    await configure(page, { dir: 'down', times: { min: 10, amber: 15, max: 20 } });
    eq((await state(page)).text, '0:20', 'ready clock shows the red (max) time');
    eq(await signalsAt(page, [0, 9, 10, 15, 20, 35, 49, 50, 120]), [
      '0:20 idle', '0:11 idle', '0:10 green', '0:05 amber', '0:00 red', '0:00 red', '0:00 red', '0:00 bell', '0:00 bell',
    ], 'counts down, colours at 10/15/20 s, holds 0:00, flashes 30 s after red');
    eq(await state(page), { text: '0:20', sig: 'idle', phase: 'ready' }, 'Stop returns to the start time');
    check(!(await visible(page, '#summary-view')), 'no results window in Simple mode');
    eq(await toastText(page), 'Stopped after 2:00', 'toast reports the real time taken');
  }));

  await T('Flashing alternates red and near-black', () => fresh(async page => {
    await configure(page, { dir: 'down', times: { min: 1, amber: 2, max: 3 } });
    await tapOrClick(page, '#startpause-btn'); await tick(page, 40);
    const seen = new Set();
    for (let i = 0; i < 8; i++) { seen.add(await page.evaluate(() => getComputedStyle(document.getElementById('main-view')).backgroundColor)); await page.waitForTimeout(150); }
    check(seen.has('rgb(211, 38, 58)') && seen.has('rgb(16, 20, 19)'), 'flash shows red and near-black', [...seen].join(' | '));
  }));

  await T('Count up: elapsed time, keeps going past max', () => fresh(async page => {
    await configure(page, { dir: 'up', times: { min: 10, amber: 15, max: 20 } });
    eq((await state(page)).text, '0:00', 'ready clock shows 0:00');
    eq(await signalsAt(page, [0, 10, 15, 20, 49, 50, 600]), [
      '0:00 idle', '0:10 green', '0:15 amber', '0:20 red', '0:49 red', '0:50 bell', '10:00 bell',
    ], 'counts up through the colours and past max to 10:00');
  }));

  await T('Pause and resume', () => fresh(async page => {
    await configure(page, { dir: 'down', times: { min: 10, amber: 15, max: 20 } });
    await tapOrClick(page, '#startpause-btn'); await tick(page, 5);
    await tapOrClick(page, '#startpause-btn');
    eq(await state(page), { text: '0:15', sig: 'idle', phase: 'paused' }, 'pauses at 0:15');
    check(await visible(page, '#paused-badge'), 'PAUSED badge shows');
    eq(await page.textContent('#startpause-btn .ctl-text'), 'Resume', 'button reads Resume');
    await tick(page, 60);
    eq((await state(page)).text, '0:15', 'clock frozen for 60 s while paused');
    await tapOrClick(page, '#startpause-btn'); await page.clock.runFor(6200);  // the display redraws every 100 ms
    eq(await state(page), { text: '0:09', sig: 'green', phase: 'running' }, 'resumes without counting the paused minute');
    check(!(await visible(page, '#paused-badge')), 'badge hidden after resume');
  }));

  await T('Simple-mode controls (iPhone-timer style)', () => fresh(async page => {
    await tapOrClick(page, '#startpause-btn'); await tick(page, 3);
    const shown = await page.$$eval('.timer-controls .ctl', els => els.filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => e.querySelector('.ctl-text').textContent));
    eq(shown, ['Stop', 'Pause'], 'only Stop and Pause while running');
    check(!(await visible(page, '#settings-btn')), 'gear hidden while running');
    await page.keyboard.press('r'); await page.keyboard.press('r');
    eq((await state(page)).phase, 'running', 'R key does nothing in Simple mode');
    await page.locator('body').focus();
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Space');
    eq((await state(page)).phase, 'paused', 'Space pauses');
    await page.keyboard.press('Space');
    eq((await state(page)).phase, 'running', 'Space resumes');
    await page.keyboard.press('Escape');
    eq((await state(page)).phase, 'ready', 'Esc stops');
    await page.keyboard.press('Space');
    eq((await state(page)).phase, 'running', 'Space starts from ready');
  }));

  await T('Colour tick boxes', () => fresh(async page => {
    const times = { min: 10, amber: 15, max: 20 };
    await configure(page, { dir: 'up', times, signals: ['green', 'red', 'bell'] });
    eq(await signalsAt(page, [10, 15, 20]), ['0:10 green', '0:15 green', '0:20 red'], 'amber off: stays green until red');
    await configure(page, { signals: ['green', 'amber', 'bell'] });
    eq(await signalsAt(page, [20, 50]), ['0:20 amber', '0:50 bell'], 'red off: amber holds until flashing');
    await configure(page, { signals: ['green', 'amber', 'red'] });
    eq(await signalsAt(page, [20, 90]), ['0:20 red', '1:30 red'], 'flashing off: stays red');
    await configure(page, { signals: [] });
    eq(await signalsAt(page, [10, 20, 90]), ['0:10 idle', '0:20 idle', '1:30 idle'], 'all off: stays blue');
    eq(await page.innerText('#ready-info').then(t => t.replace(/\s+/g, ' ').trim()), 'COUNT UP', 'ready line hides switched-off colours');
    await configure(page, { signals: ['green', 'amber', 'red', 'bell'], bellAfter: 10 });
    eq(await signalsAt(page, [29, 30]), ['0:29 red', '0:30 bell'], 'flashing delay is configurable (10 s)');
  }));

  await T('Settings validation', () => fresh(async page => {
    await openSettings(page);
    await setTimes(page, { max: 20, min: 30, amber: 25 });
    await done(page);
    check(await visible(page, '#settings-view'), 'Done refused when green is after red');
    check((await toastText(page)).includes('must not be later'), 'explains the problem', await toastText(page));
    await setTimes(page, { min: 10, amber: 25, max: 20 });
    await done(page);
    check(await visible(page, '#settings-view'), 'Done refused when amber is after red');
    await page.locator('#sig-amber').click();
    await done(page);
    check(await visible(page, '#main-view'), 'accepted once amber is switched off');
    await openSettings(page); await page.locator('#sig-amber').click();
    await setTimes(page, { min: 0, amber: 0, max: 0 });
    await done(page);
    check(await visible(page, '#settings-view') && (await toastText(page)).includes('above 0:00'), 'Done refused with a 0:00 red time');
  }));

  await T('Amber follows the midpoint until set by hand', () => fresh(async page => {
    await openSettings(page);
    await setTime(page, 'max', 480);
    eq([await page.inputValue('#s-amb-mm'), await page.inputValue('#s-amb-ss')], ['6', '30'], 'amber moves to the new midpoint (5:00–8:00 → 6:30)');
    await setTime(page, 'amb', 400);
    await setTime(page, 'max', 500);
    eq([await page.inputValue('#s-amb-mm'), await page.inputValue('#s-amb-ss')], ['6', '40'], 'a hand-set amber stays put');
  }));

  await T('Time inputs clean up what is typed', () => fresh(async page => {
    await openSettings(page);
    await page.fill('#s-max-ss', '');
    await page.locator('#s-max-ss').pressSequentially('7a5');
    eq(await page.inputValue('#s-max-ss'), '75', 'letters are removed');
    await page.locator('#s-max-mm').focus();
    eq(await page.inputValue('#s-max-ss'), '59', 'seconds above 59 become 59');
  }));

  await T('Recent timers', () => fresh(async page => {
    for (const max of [60, 120, 180, 240, 300]) {
      await configure(page, { dir: 'down', times: { min: 10, amber: 30, max } });
      await tapOrClick(page, '#startpause-btn'); await tick(page, 1); await tapOrClick(page, '#stop-btn');
    }
    await openSettings(page);
    const list = async () => page.$$eval('.recent .r-times', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    eq(await list(), ['0:10 0:30 5:00', '0:10 0:30 4:00', '0:10 0:30 3:00', '0:10 0:30 2:00'], 'keeps the last 4, newest first');
    await done(page);
    await configure(page, { times: { min: 10, amber: 30, max: 180 } });
    await tapOrClick(page, '#startpause-btn'); await tick(page, 1); await tapOrClick(page, '#stop-btn');
    await openSettings(page);
    eq((await list())[0], '0:10 0:30 3:00', 're-used timer moves to the front');
    eq((await list()).length, 4, 'no duplicate added');
    await tapOrClick(page, '#dir-up');
    await page.locator('.recent').nth(2).click();
    eq([await page.inputValue('#s-max-mm'), await page.getAttribute('#dir-down', 'aria-checked')], ['4', 'true'], 'tapping one loads its times and direction');
    check(await page.locator('.recent').nth(2).evaluate(e => e.classList.contains('current')), 'the loaded timer is highlighted');
  }));

  await T('Settings are remembered after reopening', () => fresh(async page => {
    await configure(page, { dir: 'up', times: { min: 70, amber: 80, max: 90 }, signals: ['green', 'red'] });
    await page.reload(); await page.clock.runFor(2000);
    eq(await state(page), { text: '0:00', sig: 'idle', phase: 'ready' }, 'reopens on the ready clock');
    eq(await page.innerText('#ready-info').then(t => t.replace(/\s+/g, ' ').trim()), '1:10 1:30 COUNT UP', 'times, direction and colours kept');
  }));

  for (const device of ['iPad Pro 11 landscape', 'iPad (gen 7)', 'iPhone 13']) {
    await T(`Clock layout on ${device}`, () => fresh(async page => {
      await configure(page, { dir: 'up', times: { min: 300, amber: 600, max: 900 } });
      const vw = await page.evaluate(() => innerWidth), vh = await page.evaluate(() => innerHeight);
      // stop the page clock flowing on its own, so each reading is taken after the centring glide settles
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
      await tapOrClick(page, '#startpause-btn');
      const widths = new Set(), lefts = new Set(); let worstCentre = 0, outside = 0;
      for (let s = 1; s <= 80; s++) {
        await tick(page, 1);
        const r = await page.evaluate(() => {
          const box = document.getElementById('clock-text').getBoundingClientRect();
          return { w: Math.round(box.width), x: Math.round(box.left), left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        });
        widths.add(r.w); lefts.add(r.x);
        if (r.left < 0 || r.right > vw || r.top < 0 || r.bottom > vh) outside++;
        worstCentre = Math.max(worstCentre, Math.abs((r.left + r.right) / 2 - vw / 2));
      }
      eq(widths.size, 1, 'clock keeps one width while counting');
      eq(lefts.size, 1, 'clock never moves sideways while counting');
      check(outside === 0, 'digits always inside the screen');
      check(worstCentre <= 2, 'clock centred on screen', `worst ${worstCentre.toFixed(1)} px`);
      eq(await page.evaluate(() => document.documentElement.scrollWidth), vw, 'no sideways scrolling');
      const overlap = await page.evaluate(() => {
        const c = document.getElementById('clock-text').getBoundingClientRect();
        const k = document.querySelector('.timer-controls').getBoundingClientRect();
        return !(k.top >= c.bottom - 2 || k.bottom <= c.top || k.left >= c.right || k.right <= c.left);
      });
      check(!overlap, 'controls do not cover the digits');
    }, device));
  }

  for (const [label, query] of [['10-minute countdown (current)', ''], ['10-minute countdown with ?start959 preview', '?start959']]) {
    await T(label, async () => {
      const { ctx, page } = await openApp(browser, base + query);
      try {
        await configure(page, { dir: 'down', times: { min: 300, amber: 480, max: 600 } });
        const size = () => page.evaluate(() => parseFloat(document.getElementById('clock-text').style.fontSize));
        const readyText = (await state(page)).text, readySize = await size();
        await tapOrClick(page, '#startpause-btn');
        const seen = []; const sizes = new Set([readySize]); let t = 0;
        for (const at of [0, 1, 2, 3, 300, 480, 599, 600]) { await tick(page, at - t); t = at; const st = await state(page); seen.push(`${st.text} ${st.sig}`); sizes.add(await size()); }
        if (query) {
          eq(readyText, '9:59', 'ready clock shows 9:59');
          eq(seen, ['9:59 idle', '9:59 idle', '9:58 idle', '9:57 idle', '5:00 green', '2:00 amber', '0:01 amber', '0:00 red'], 'holds 9:59 for 2 s, red at exactly 10:00');
          eq(sizes.size, 1, 'digit size never changes');
        } else {
          eq(readyText, '10:00', 'ready clock shows 10:00');
          eq(seen, ['10:00 idle', '9:59 idle', '9:58 idle', '9:57 idle', '5:00 green', '2:00 amber', '0:01 amber', '0:00 red'], 'counts 10:00 down to 0:00, red at 10:00');
          check(sizes.size === 2, 'digits grow once when 10:00 becomes 9:59 (known, the reason for the preview)', `sizes ${[...sizes].join(', ')}`);
        }
      } finally { allProblems.push(...page.problems.map(p => `[${current}] ${p}`)); await ctx.close(); }
    });
  }

  await T('Long run keeps exact time', () => fresh(async page => {
    await configure(page, { dir: 'up', times: { min: 60, amber: 120, max: 180 } });
    await tapOrClick(page, '#startpause-btn');
    for (let i = 0; i < 60; i++) await tick(page, 60);
    eq((await state(page)).text, '60:00', 'one hour of counting reads 60:00');
  }));

  await T('Works offline once loaded', async () => {
    const { ctx, page } = await openApp(browser, base, 'iPad Pro 11 landscape', { clock: false });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForTimeout(2200);
    check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker is in control');
    await ctx.setOffline(true);
    await page.reload(); await page.waitForTimeout(2200);
    eq((await state(page)).phase, 'ready', 'app opens with the network off');
    check(await page.evaluate(() => document.fonts.check('700 100px Poppins')), 'brand font available offline');
    check(await page.evaluate(() => { const i = document.querySelector('.brand-logo'); return i.complete && i.naturalWidth > 0; }), 'logo available offline');
    await ctx.setOffline(false);
    allProblems.push(...page.problems.filter(p => !p.startsWith('request failed')).map(p => `[${current}] ${p}`));
    await ctx.close();
  });

  await T('Install files are valid', () => fresh(async page => {
    const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
    check(manifest.name && manifest.start_url && manifest.display, 'manifest has name, start_url and display');
    for (const icon of manifest.icons) {
      const ok = await page.evaluate(async src => (await fetch(src)).ok, icon.src);
      check(ok, `icon ${icon.src} loads`);
    }
    const shell = await page.evaluate(async () => { const t = await (await fetch('sw.js')).text(); return [...t.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]); });
    for (const f of shell) check(await page.evaluate(async src => (await fetch(src || './')).ok, f), `offline file ${f || '(index)'} exists`);
  }));

  current = 'Errors';
  console.log('• No errors in any run');
  check(allProblems.length === 0, 'no page errors, console errors or failed requests', allProblems.join('\n     '));

  await browser.close(); server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('\nFailed:'); for (const f of failed) console.log(` ✗ ${f.name}${f.detail ? '\n     ' + f.detail : ''}`); }
  process.exit(failed.length ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(2); });
