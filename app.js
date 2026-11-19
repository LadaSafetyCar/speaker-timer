'use strict';

/* ================= storage (never fatal) ================= */
const STORE_KEY = 'speaker-timer-v1';
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode etc. */ }
}

const DEFAULT_AGENDA = [
  ['Toastmaster of the evening – opening', 120, 180],
  ['Timekeeper introduction', 30, 60],
  ['Grammarian introduction', 30, 60],
  ['Speaker #1', 300, 420],
  ['Speaker #2', 300, 420],
  ['Table Topics Master introduction', 60, 120],
  ['Table Topics #1', 60, 120],
  ['Table Topics #2', 60, 120],
  ['Table Topics #3', 60, 120],
  ['Table Topics #4', 60, 120],
  ['President’s announcements', 60, 120],
  ['Speech evaluation #1', 120, 180],
  ['Speech evaluation #2', 120, 180],
  ['Table Topics evaluator', 120, 240],
  ['Grammarian report', 60, 120],
  ['Ah-Counter report', 60, 120],
  ['Timekeeper report', 60, 120],
  ['General Evaluator', 180, 300],
  ['Call for volunteers', 60, 180],
].map(([role, min, max]) => ({ role, name: '', min, max, used: null }));

const saved = load();
const state = {
  mode: saved.mode === 'conference' ? 'conference' : 'simple',
  dir: saved.dir === 'up' ? 'up' : 'down',
  simple: saved.simple && Number.isFinite(saved.simple.max) ? saved.simple : { min: 300, max: 420 },
  recents: Array.isArray(saved.recents) ? saved.recents.slice(0, 4) : [],
  agenda: Array.isArray(saved.agenda) && saved.agenda.length ? saved.agenda : structuredClone(DEFAULT_AGENDA),
  selected: Number.isInteger(saved.selected) ? saved.selected : 0,
};

/* ================= helpers ================= */
const $ = (id) => document.getElementById(id);
const BELL_AFTER = 30; // seconds past max before the screen flashes

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function readMMSS(mmEl, ssEl) {
  const m = parseInt(mmEl.value, 10) || 0;
  const s = parseInt(ssEl.value, 10) || 0;
  return Math.max(0, m * 60 + s);
}
function writeMMSS(mmEl, ssEl, sec) {
  mmEl.value = Math.floor(sec / 60);
  ssEl.value = String(sec % 60).padStart(2, '0');
}
function thresholds(min, max) {
  return { green: min, amber: (min + max) / 2, red: max, bell: max + BELL_AFTER };
}
function signalFor(elapsed, t) {
  if (elapsed >= t.bell) return 'bell';
  if (elapsed >= t.red) return 'red';
  if (elapsed >= t.amber) return 'amber';
  if (elapsed >= t.green) return 'green';
  return 'idle';
}
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
function confirmBox(msg, yesLabel, onYes) {
  const box = $('confirm');
  $('confirm-msg').textContent = msg;
  $('confirm-yes').textContent = yesLabel;
  box.hidden = false;
  const close = () => { box.hidden = true; $('confirm-yes').onclick = $('confirm-no').onclick = null; };
  $('confirm-no').onclick = close;
  $('confirm-yes').onclick = () => { close(); onYes(); };
  $('confirm-no').focus();
}
// digits only; seconds capped at 59 on blur
function bindNumeric(input, isSeconds) {
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });
  input.addEventListener('focus', () => input.select());
  if (isSeconds) input.addEventListener('blur', () => {
    let v = parseInt(input.value, 10) || 0;
    input.value = String(Math.min(59, v)).padStart(2, '0');
  });
}

/* ================= views ================= */
function show(view) {
  for (const v of ['setup-view', 'timer-view', 'summary-view']) $(v).classList.toggle('active', v === view);
}

function renderToggles() {
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
  for (const b of document.querySelectorAll('[data-dir]')) b.setAttribute('aria-checked', String(b.dataset.dir === state.dir));
  $('simple-panel').classList.toggle('active', state.mode === 'simple');
  $('conference-panel').classList.toggle('active', state.mode === 'conference');
  $('dir-hint').textContent = state.dir === 'down'
    ? 'Counts down from the max time and holds at 0:00 once the speaker is over. Colours change as normal.'
    : 'Counts up from 0:00. Colours change at min, halfway and max.';
}

/* ---------- simple mode ---------- */
const sIn = { minMM: $('s-min-mm'), minSS: $('s-min-ss'), maxMM: $('s-max-mm'), maxSS: $('s-max-ss') };
bindNumeric(sIn.minMM); bindNumeric(sIn.maxMM); bindNumeric(sIn.minSS, true); bindNumeric(sIn.maxSS, true);
for (const el of Object.values(sIn)) el.addEventListener('change', () => {
  state.simple = { min: readMMSS(sIn.minMM, sIn.minSS), max: readMMSS(sIn.maxMM, sIn.maxSS) };
  save(); renderRecents();
});
function renderSimple() {
  writeMMSS(sIn.minMM, sIn.minSS, state.simple.min);
  writeMMSS(sIn.maxMM, sIn.maxSS, state.simple.max);
  renderRecents();
}
function renderRecents() {
  const wrap = $('recents');
  wrap.textContent = '';
  for (const r of state.recents) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'recent';
    if (r.min === state.simple.min && r.max === state.simple.max && r.dir === state.dir) b.classList.add('current');
    b.innerHTML = `<span class="r-times"><span class="c-green">${fmt(r.min)}</span><span class="arrow">→</span><span class="c-red">${fmt(r.max)}</span></span>
      <span class="r-dir">${r.dir === 'down' ? 'Count down' : 'Count up'}</span>`;
    b.title = 'Load this timer';
    b.addEventListener('click', () => {
      state.simple = { min: r.min, max: r.max };
      state.dir = r.dir;
      save(); renderToggles(); renderSimple();
      toast(`Loaded ${fmt(r.min)} → ${fmt(r.max)}, ${r.dir === 'down' ? 'count down' : 'count up'}`);
    });
    wrap.appendChild(b);
  }
  $('recents-empty').hidden = state.recents.length > 0;
}
function pushRecent(min, max, dir) {
  state.recents = [{ min, max, dir }, ...state.recents.filter(r => !(r.min === min && r.max === max && r.dir === dir))].slice(0, 4);
  renderRecents();
}

$('simple-start').addEventListener('click', () => {
  const min = readMMSS(sIn.minMM, sIn.minSS), max = readMMSS(sIn.maxMM, sIn.maxSS);
  if (!validate(min, max)) return;
  state.simple = { min, max };
  pushRecent(min, max, state.dir);
  save();
  startTimer({ min, max, label: '', slotIndex: null });
});

function validate(min, max) {
  if (max <= 0) { toast('Set a max time above 0:00'); return false; }
  if (min > max) { toast('Min time must not be later than max time'); return false; }
  return true;
}

/* ---------- conference mode ---------- */
const agendaEl = $('agenda');
const tpl = $('slot-tpl');

function renderAgenda() {
  agendaEl.textContent = '';
  if (state.selected >= state.agenda.length) state.selected = state.agenda.length - 1;
  state.agenda.forEach((slot, i) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    const q = (c) => li.querySelector(c);
    q('.role').value = slot.role;
    q('.name').value = slot.name;
    writeMMSS(q('.min-mm'), q('.min-ss'), slot.min);
    writeMMSS(q('.max-mm'), q('.max-ss'), slot.max);
    bindNumeric(q('.min-mm')); bindNumeric(q('.max-mm')); bindNumeric(q('.min-ss'), true); bindNumeric(q('.max-ss'), true);
    paintUsed(q('.used'), slot);
    li.classList.toggle('selected', i === state.selected);

    li.addEventListener('click', (e) => {
      if (e.target.closest('.del')) return;
      if (state.selected !== i) { state.selected = i; save(); markSelected(); }
    });
    li.addEventListener('change', () => {
      slot.role = q('.role').value;
      slot.name = q('.name').value;
      slot.min = readMMSS(q('.min-mm'), q('.min-ss'));
      slot.max = readMMSS(q('.max-mm'), q('.max-ss'));
      paintUsed(q('.used'), slot);
      save();
    });
    q('.del').addEventListener('click', () => {
      confirmBox(`Delete “${slot.role || 'this slot'}”?`, 'Delete', () => {
        state.agenda.splice(i, 1);
        if (state.selected > i || state.selected >= state.agenda.length) state.selected = Math.max(0, state.selected - 1);
        save(); renderAgenda();
      });
    });
    agendaEl.appendChild(li);
  });
  $('conf-start').disabled = state.agenda.length === 0;
}
function markSelected() {
  [...agendaEl.children].forEach((li, i) => li.classList.toggle('selected', i === state.selected));
}
function paintUsed(el, slot) {
  el.classList.remove('u-green', 'u-amber', 'u-red');
  const text = el.querySelector('.used-text'), bar = el.querySelector('i');
  if (slot.used == null) { text.textContent = '–'; bar.style.width = '0'; return; }
  const t = thresholds(slot.min, slot.max);
  const sig = signalFor(slot.used, t);
  text.textContent = fmt(slot.used);
  bar.style.width = Math.min(100, (slot.used / t.bell) * 100) + '%';
  if (sig === 'green') el.classList.add('u-green');
  else if (sig === 'amber') el.classList.add('u-amber');
  else if (sig === 'red' || sig === 'bell') el.classList.add('u-red');
}

$('add-slot').addEventListener('click', () => {
  const src = state.agenda[state.selected];
  const slot = src ? { role: src.role, name: '', min: src.min, max: src.max, used: null } : { role: 'Speaker', name: '', min: 300, max: 420, used: null };
  const at = state.agenda.length ? state.selected + 1 : 0;
  state.agenda.splice(at, 0, slot);
  state.selected = at;
  save(); renderAgenda();
  agendaEl.children[at]?.querySelector('.role').focus();
});
$('conf-start').addEventListener('click', () => {
  const slot = state.agenda[state.selected];
  if (!slot || !validate(slot.min, slot.max)) return;
  const label = [slot.role, slot.name].filter(Boolean).join(' · ');
  startTimer({ min: slot.min, max: slot.max, label, slotIndex: state.selected });
});
$('reset-agenda').addEventListener('click', () => {
  confirmBox('Replace the agenda with the default list? Names and recorded times will be cleared.', 'Reset', () => {
    state.agenda = structuredClone(DEFAULT_AGENDA); state.selected = 0; save(); renderAgenda(); toast('Agenda reset');
  });
});
$('export-btn').addEventListener('click', async () => {
  const name = `agenda-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify({ app: 'speaker-timer', version: 1, agenda: state.agenda }, null, 2);
  // iPad: the Share sheet offers Save to Files / AirDrop, which is more reliable than a download.
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Speaker Timer agenda' }); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.agenda;
    if (!Array.isArray(list)) throw new Error('no agenda list');
    state.agenda = list.map(s => ({
      role: String(s.role ?? ''), name: String(s.name ?? ''),
      min: Math.max(0, parseInt(s.min, 10) || 0), max: Math.max(0, parseInt(s.max, 10) || 0),
      used: Number.isFinite(s.used) ? s.used : null,
    }));
    state.selected = 0; save(); renderAgenda(); toast(`Loaded ${state.agenda.length} slots`);
  } catch {
    toast('That file is not a Speaker Timer agenda (.json)');
  }
});

/* ---------- toggles ---------- */
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { state.mode = b.dataset.mode; save(); renderToggles(); });
for (const b of document.querySelectorAll('[data-dir]')) b.addEventListener('click', () => { state.dir = b.dataset.dir; save(); renderToggles(); renderRecents(); });

/* ================= timer engine ================= */
// Elapsed time comes from the clock, not from counting ticks, so it stays accurate
// even when the browser throttles timers.
const run = { t: null, min: 0, max: 0, dir: 'down', label: '', slotIndex: null, startAt: 0, pausedAt: 0, pausedTotal: 0, tick: null, lastShown: '', lastSig: '' };

function elapsedSec() {
  const now = run.pausedAt || performance.now();
  return Math.floor((now - run.startAt - run.pausedTotal) / 1000);
}

function startTimer({ min, max, label, slotIndex }) {
  Object.assign(run, { t: thresholds(min, max), min, max, dir: state.dir, label, slotIndex, startAt: performance.now(), pausedAt: 0, pausedTotal: 0, lastShown: '', lastSig: '', stopped: false,
    prevUsedAtStart: slotIndex != null ? state.agenda[slotIndex]?.used ?? null : null });
  $('timer-label').textContent = label;
  $('paused-badge').hidden = true;
  setPauseIcon(false);
  show('timer-view');
  document.documentElement.classList.add('timer-on');
  enterFullscreen();
  requestWakeLock();
  render();
  clearInterval(run.tick);
  run.tick = setInterval(render, 100);
}

function render() {
  const el = elapsedSec();
  const shown = run.dir === 'down' ? fmt(Math.max(0, run.max - el)) : fmt(el);
  if (shown !== run.lastShown) {
    const lenChanged = shown.length !== run.lastShown.length;
    $('clock-text').textContent = shown;
    run.lastShown = shown;
    if (lenChanged) fitClock();
  }
  const sig = signalFor(el, run.t);
  if (sig !== run.lastSig) {
    for (const el of [$('timer-view'), document.documentElement]) {
      el.classList.remove('s-green', 's-amber', 's-red', 's-bell');
      if (sig !== 'idle') el.classList.add('s-' + sig);
    }
    run.lastSig = sig;
  }
}

// Size the digits to fill the screen. Widest digit string for this length decides,
// so the size does not jump around as digits change.
function fitClock() {
  const txt = $('clock-text');
  const sample = run.lastShown.replace(/\d/g, '0');
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:100px;line-height:.78;';
  probe.style.fontFamily = getComputedStyle(txt).fontFamily;
  probe.style.fontWeight = '700';
  probe.style.fontVariantNumeric = 'tabular-nums lining-nums';
  probe.textContent = sample;
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 100;  // em width
  probe.remove();
  const vw = window.innerWidth, vh = window.innerHeight;
  const byWidth = (vw * 0.94) / w;
  const byHeight = (vh - 120) / 0.78;   // leave room for the label and buttons
  txt.style.fontSize = Math.floor(Math.min(byWidth, byHeight)) + 'px';
}
const refit = () => { if ($('timer-view').classList.contains('active')) requestAnimationFrame(fitClock); };
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', () => setTimeout(refit, 250));
window.visualViewport?.addEventListener('resize', refit);
document.fonts?.ready.then(() => { if ($('timer-view').classList.contains('active')) fitClock(); });

function setPauseIcon(paused) {
  $('pause-btn').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('pause-btn').innerHTML = paused
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
}
function togglePause() {
  if (run.pausedAt) { run.pausedTotal += performance.now() - run.pausedAt; run.pausedAt = 0; }
  else run.pausedAt = performance.now();
  $('paused-badge').hidden = !run.pausedAt;
  setPauseIcon(!!run.pausedAt);
  render();
}

function stopTimer() {
  const used = elapsedSec();
  run.prevSelected = state.selected;
  run.stopped = true;
  clearInterval(run.tick);
  releaseWakeLock();
  exitFullscreen();
  $('timer-view').classList.remove('s-green', 's-amber', 's-red', 's-bell');
  document.documentElement.classList.remove('timer-on', 's-green', 's-amber', 's-red', 's-bell');

  if (run.slotIndex != null && state.agenda[run.slotIndex]) {
    run.prevUsed = run.prevUsedAtStart;
    state.agenda[run.slotIndex].used = used;
    if (run.slotIndex < state.agenda.length - 1) state.selected = run.slotIndex + 1;  // ready for the next speaker
    save(); renderAgenda();
  }
  showSummary(used);
}

function showSummary(used) {
  $('sum-label').textContent = run.label || 'Time taken';
  $('sum-time').textContent = fmt(used);
  $('sum-min').textContent = fmt(run.min);
  $('sum-max').textContent = fmt(run.max);
  $('sum-dir').textContent = run.dir === 'down' ? 'Count down' : 'Count up';
  const v = $('sum-verdict');
  v.className = 'verdict';
  if (used < run.min) { v.textContent = `Under minimum by ${fmt(run.min - used)}`; v.classList.add('v-under'); }
  else if (used <= run.max) { v.textContent = 'Within time'; v.classList.add('v-ok'); }
  else { v.textContent = `Over time by ${fmt(used - run.max)}`; v.classList.add('v-over'); }
  show('summary-view');
  $('back-btn').focus();
}

$('pause-btn').addEventListener('click', togglePause);
$('stop-btn').addEventListener('click', stopTimer);
$('back-btn').addEventListener('click', () => { run.stopped = false; show('setup-view'); });
// Stopped by mistake? Carry on as if the clock never stopped: the time spent on the
// summary screen still counts, because the speaker kept talking.
$('resume-btn').addEventListener('click', () => {
  if (!run.stopped) return;
  run.stopped = false;
  if (run.slotIndex != null && state.agenda[run.slotIndex]) {
    state.agenda[run.slotIndex].used = run.prevUsed ?? null;
    state.selected = run.slotIndex;
    save(); renderAgenda();
  }
  run.lastShown = ''; run.lastSig = '';
  show('timer-view');
  document.documentElement.classList.add('timer-on');
  enterFullscreen();
  requestWakeLock();
  render();
  run.tick = setInterval(render, 100);
});
$('again-btn').addEventListener('click', () => {
  if (run.slotIndex != null) state.selected = run.slotIndex;
  startTimer({ min: run.min, max: run.max, label: run.label, slotIndex: run.slotIndex });
});
document.addEventListener('keydown', (e) => {
  if (!$('timer-view').classList.contains('active')) return;
  if (e.code === 'Space' || e.key === 'p') { e.preventDefault(); togglePause(); }
  else if (e.key === 'Escape' || e.key === 's') { e.preventDefault(); stopTimer(); }
});

/* ================= screen wake lock & fullscreen ================= */
// Screen Wake Lock where supported; otherwise (older iPadOS, and home-screen apps before
// iPadOS 18.4) a tiny muted looping video keeps the display from sleeping.
let wakeLock = null, wantWake = false, keepAwakeVideo = null;
// 2 s silent black 16×16 MP4, inline so it works offline without range-request trouble in the service worker.
const KEEP_AWAKE_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAhEbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAul0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAJhbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACDG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAcxzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMAUDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAy8AAAMvAAAABhzdHRzAAAAAAAAAAEAAAAUAAAEAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAAGRzdHN6AAAAAAAAAAAAAAAUAAACgwAAAAkAAAAKAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAAAJAAAACQAAAAkAAABgc3RjbwAAAAAAAAAUAAAIiQAACyAAAAs5AAALUwAAC3AAAAuJAAALogAAC78AAAvYAAAL8QAADA4AAAwnAAAMQAAADFkAAAx2AAAMjwAADKgAAAzFAAAM3gAADPcAAASFdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAgAAAAAAAAfQAAAAAAAAAAAAAAABAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAH0AAABAAAAQAAAAAD/W1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAArEQAAVyIVcQAAAAAAC1oZGxyAAAAAAAAAABzb3VuAAAAAAAAAAAAAAAAU291bmRIYW5kbGVyAAAAA6htaW5mAAAAEHNtaGQAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAA2xzdGJsAAAAfnN0c2QAAAAAAAAAAQAAAG5tcDRhAAAAAAAAAAEAAAAAAAAAAAABABAAAAAArEQAAAAAADZlc2RzAAAAAAOAgIAlAAIABICAgBdAFQAAAAAAH0AAAAWzBYCAgAUSCFblAAaAgIABAgAAABRidHJ0AAAAAAAAH0AAAAWzAAAAIHN0dHMAAAAAAAAAAgAAAFcAAAQAAAAAAQAAAIgAAAC4c3RzYwAAAAAAAAAOAAAAAQAAAAEAAAABAAAAAgAAAAUAAAABAAAAAwAAAAQAAAABAAAABQAAAAUAAAABAAAABgAAAAQAAAABAAAACAAAAAUAAAABAAAACQAAAAQAAAABAAAACwAAAAUAAAABAAAADAAAAAQAAAABAAAADwAAAAUAAAABAAAAEAAAAAQAAAABAAAAEgAAAAUAAAABAAAAEwAAAAQAAAABAAAAFQAAAAUAAAABAAABdHN0c3oAAAAAAAAAAAAAAFgAAAAVAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAAZHN0Y28AAAAAAAAAFQAACHQAAAsMAAALKQAAC0MAAAtcAAALeQAAC5IAAAurAAALyAAAC+EAAAv6AAAMFwAADDAAAAxJAAAMYgAADH8AAAyYAAAMsQAADM4AAAznAAANAAAAABpzZ3BkAQAAAHJvbGwAAAACAAAAAf//AAAAHHNiZ3AAAAAAcm9sbAAAAAEAAABYAAAAAQAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAASobWRhdN4CAExhdmM2MC4zMS4xMDIAAjBADgAAAnEGBf//bdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAACmWIhA/yYoAAw+4BGCAHARggBwEYIAcBGCAHARggBwAAAAVBmjgf6gEYIAcBGCAHARggBwEYIAcAAAAGQZpUB/qAARggBwEYIAcBGCAHARggBwAAAAVBmmA/1AEYIAcBGCAHARggBwEYIAcBGCAHAAAABUGagD/UARggBwEYIAcBGCAHARggBwAAAAVBmqA/1AEYIAcBGCAHARggBwEYIAcAAAAFQZrAP9QBGCAHARggBwEYIAcBGCAHARggBwAAAAVBmuA/1AEYIAcBGCAHARggBwEYIAcAAAAFQZsAP9QBGCAHARggBwEYIAcBGCAHAAAABUGbID/UARggBwEYIAcBGCAHARggBwEYIAcAAAAFQZtAP9QBGCAHARggBwEYIAcBGCAHAAAABUGbYD/UARggBwEYIAcBGCAHARggBwAAAAVBm4A/1AEYIAcBGCAHARggBwEYIAcAAAAFQZugP9QBGCAHARggBwEYIAcBGCAHARggBwAAAAVBm8A/1AEYIAcBGCAHARggBwEYIAcAAAAFQZvgP9QBGCAHARggBwEYIAcBGCAHAAAABUGaAD/UARggBwEYIAcBGCAHARggBwEYIAcAAAAFQZogP9QBGCAHARggBwEYIAcBGCAHAAAABUGaQDvUARggBwEYIAcBGCAHARggBwAAAAVBmmA31AEYIAcBGCAHARggBwEYIAcBGCAH';
async function requestWakeLock() {
  wantWake = true;
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      return;
    }
  } catch { /* refused: fall through to the video */ }
  try {
    if (!keepAwakeVideo) {
      keepAwakeVideo = document.createElement('video');
      keepAwakeVideo.src = KEEP_AWAKE_MP4;
      keepAwakeVideo.muted = true; keepAwakeVideo.loop = true;
      keepAwakeVideo.setAttribute('playsinline', ''); keepAwakeVideo.setAttribute('muted', '');
      keepAwakeVideo.setAttribute('aria-hidden', 'true');
      keepAwakeVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0;';
      document.body.appendChild(keepAwakeVideo);
    }
    await keepAwakeVideo.play();
  } catch { /* nothing else we can do; see README for Auto-Lock */ }
}
function releaseWakeLock() {
  wantWake = false;
  try { wakeLock?.release(); } catch { }
  wakeLock = null;
  try { keepAwakeVideo?.pause(); } catch { }
}
document.addEventListener('visibilitychange', () => {
  if (wantWake && document.visibilityState === 'visible') requestWakeLock();
});
function enterFullscreen() {
  const d = document.documentElement;
  try { (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d)?.catch?.(() => {}); } catch { }
}
function exitFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { }
}

/* ================= iPad / iOS ================= */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
// Ask the browser not to evict the saved agenda (iOS clears storage of unvisited sites).
try { navigator.storage?.persist?.(); } catch { }
function setupInstallTip() {
  const tip = $('install-tip');
  let dismissed = false;
  try { dismissed = localStorage.getItem('speaker-timer-tip') === '1'; } catch { }
  if (!isIOS || isInstalled || dismissed) return;
  tip.hidden = false;
  $('install-tip-close').addEventListener('click', () => {
    tip.hidden = true;
    try { localStorage.setItem('speaker-timer-tip', '1'); } catch { }
  });
}

/* ================= boot ================= */
setupInstallTip();
renderToggles();
renderSimple();
renderAgenda();
show('setup-view');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* preview hosts may refuse */ });
  });
}
