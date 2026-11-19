'use strict';

/* ================= storage (never fatal) ================= */
const STORE_KEY = 'speaker-timer-v1';
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode etc. */ }
}

const mid = (a, b) => Math.round((a + b) / 2);
const secs = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
// Older saves have no amber time: put it halfway, as earlier versions did.
function withAmber(o) {
  const min = secs(o.min), max = secs(o.max);
  return { ...o, min, max, amber: Number.isFinite(o.amber) ? o.amber : mid(min, max) };
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
].map(([role, min, max]) => ({ role, name: '', min, amber: mid(min, max), max, used: null }));

const saved = load();
const state = {
  mode: saved.mode === 'conference' ? 'conference' : 'simple',
  dir: saved.dir === 'up' ? 'up' : 'down',
  simple: withAmber(saved.simple && Number.isFinite(saved.simple.max) ? saved.simple : { min: 300, max: 420 }),
  recents: Array.isArray(saved.recents) ? saved.recents.slice(0, 4).map(withAmber) : [],
  agenda: (Array.isArray(saved.agenda) && saved.agenda.length ? saved.agenda : structuredClone(DEFAULT_AGENDA)).map(withAmber),
  selected: Number.isInteger(saved.selected) ? saved.selected : 0,
  // which colours the speaker sees; a switched-off stage keeps the previous colour
  signals: { green: true, amber: true, red: true, bell: true, ...(saved.signals || {}) },
  bellAfter: Number.isFinite(saved.bellAfter) ? saved.bellAfter : 30,
};
if (state.selected >= state.agenda.length) state.selected = 0;

/* ================= helpers ================= */
const $ = (id) => document.getElementById(id);
const main = $('main-view');

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function readMMSS(mmEl, ssEl) {
  const s = Math.min(59, parseInt(ssEl.value, 10) || 0);   // 75 s means 59, not 1:15
  return Math.max(0, (parseInt(mmEl.value, 10) || 0) * 60 + s);
}
function writeMMSS(mmEl, ssEl, sec) {
  mmEl.value = Math.floor(sec / 60);
  ssEl.value = String(sec % 60).padStart(2, '0');
}
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
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
    input.value = String(Math.min(59, parseInt(input.value, 10) || 0)).padStart(2, '0');
  });
}

/* ================= signals ================= */
const STAGES = ['idle', 'green', 'amber', 'red', 'bell'];
function thresholds(c) {
  return { green: c.min, amber: c.amber, red: c.max, bell: c.max + state.bellAfter };
}
function signalFor(elapsed, t) {
  if (elapsed >= t.bell) return 'bell';
  if (elapsed >= t.red) return 'red';
  if (elapsed >= t.amber) return 'amber';
  if (elapsed >= t.green) return 'green';
  return 'idle';
}
// Step back from the reached stage to the nearest one that is switched on.
function shownSignal(sig) {
  for (let i = STAGES.indexOf(sig); i > 0; i--) if (state.signals[STAGES[i]]) return STAGES[i];
  return 'idle';
}
function applySignal(sig) {
  for (const el of [main, document.documentElement]) {
    el.classList.remove('s-green', 's-amber', 's-red', 's-bell');
    if (sig !== 'idle') el.classList.add('s-' + sig);
  }
}

function currentCfg() {
  return state.mode === 'conference' ? state.agenda[state.selected] : state.simple;
}
function cfgLabel(c) {
  return state.mode === 'conference' && c ? [c.role, c.name].filter(Boolean).join(' · ') : '';
}
function validate(c) {
  if (!c) { toast('Add a slot to the agenda first'); return false; }
  if (c.max <= 0) { toast('Set a red (max) time above 0:00'); return false; }
  const pts = [['Green', c.min, state.signals.green], ['Amber', c.amber, state.signals.amber], ['Red', c.max, true]].filter(p => p[2]);
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] < pts[i - 1][1]) { toast(`${pts[i - 1][0]} time must not be later than ${pts[i][0].toLowerCase()} time`); return false; }
  }
  return true;
}
// When amber sat exactly halfway, keep it halfway as min or max change.
function followMidpoint(old, next) {
  if (old.amber === mid(old.min, old.max) && next.amber === old.amber && (next.min !== old.min || next.max !== old.max)) {
    next.amber = mid(next.min, next.max);
  }
  return next;
}

/* ================= views ================= */
function show(view) {
  for (const v of ['main-view', 'settings-view', 'summary-view']) $(v).classList.toggle('active', v === view);
  document.documentElement.classList.toggle('timer-on', view === 'main-view');
  if (view === 'main-view') fitClock();
}

/* ================= main clock screen ================= */
const ICON_PLAY = '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/>';
const ICON_PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>';

const run = { phase: 'ready', cfg: null, t: null, dir: 'down', label: '', slotIndex: null, startAt: 0, pausedAt: 0, pausedTotal: 0, tick: null, lastSig: '', stopped: false, stoppedPhase: 'running', prevUsed: null };

function setPhase(p) {
  run.phase = p;
  main.dataset.phase = p;
  main.dataset.mode = state.mode;
  const sp = $('startpause-btn');
  const label = p === 'running' ? 'Pause' : p === 'paused' ? 'Resume' : 'Start';
  sp.setAttribute('aria-label', label);
  sp.querySelector('.ctl-text').textContent = label;
  sp.querySelector('svg').innerHTML = p === 'running' ? ICON_PAUSE : ICON_PLAY;
  $('paused-badge').hidden = p !== 'paused';
  disarmReset();
}

// Count down: remaining time, held at 0:00 once the speaker reaches the red (max) time.
const countdownText = (remaining) => fmt(Math.max(0, remaining));

const DIGIT_EM = 0.68;  // widest Poppins Bold digit
const COLON_EM = 0.3;
function setClock(text) {
  const el = $('clock-text');
  if (el.dataset.text === text) return;
  const lenChanged = (el.dataset.text || '').length !== text.length;
  el.dataset.text = text;
  el.setAttribute('aria-label', text);
  // Poppins digits differ in width, so every digit sits in an equal-width slot (sized for the
  // widest digit) and is centred in it, like tabular figures. The clock never moves as it
  // counts; narrow digits such as "1" simply have more space around them.
  el.innerHTML = [...text].map(ch => ch === ':' ? '<span class="cc">:</span>' : `<span class="cd">${ch}</span>`).join('');
  if (lenChanged) fitClock();
}

function renderReady() {
  main.dataset.mode = state.mode;
  const c = currentCfg();
  setClock(!c || state.dir === 'up' ? '0:00' : countdownText(c.max));
  applySignal('idle'); run.lastSig = '';
  const conf = state.mode === 'conference';
  $('timer-label').textContent = conf ? (c ? cfgLabel(c) : 'The agenda is empty') : '';
  $('prev-slot').hidden = $('next-slot').hidden = !conf;
  $('prev-slot').disabled = state.selected <= 0;
  $('next-slot').disabled = state.selected >= state.agenda.length - 1;
  const items = [];
  if (c) {
    for (const [k, t] of [['green', c.min], ['amber', c.amber], ['red', c.max]]) {
      if (state.signals[k]) items.push(`<span><b class="dot d-${k}"></b>${fmt(t)}</span>`);
    }
    if (state.signals.bell) items.push(`<span><b class="dot d-bell"></b>+${state.bellAfter} s</span>`);
  }
  items.push(`<span class="ri-dir">${state.dir === 'down' ? 'Count down' : 'Count up'}</span>`);
  $('ready-info').innerHTML = items.join('');
}

function moveSlot(step) {
  const i = state.selected + step;
  if (run.phase !== 'ready' || i < 0 || i >= state.agenda.length) return;
  state.selected = i; save(); renderReady(); markSelected();
}

// Size the digits to fill the screen. The widest digit string of this length decides,
// so the size does not jump around as digits change.
function fitClock() {
  if (!main.classList.contains('active')) return;
  const txt = $('clock-text');
  const text = txt.dataset.text || '0:00';
  // width in em from the fixed digit and colon slots (see #clock-text .cd / .cc)
  const w = [...text].reduce((sum, ch) => sum + (ch === ':' ? COLON_EM : DIGIT_EM), 0);
  const byWidth = (window.innerWidth * 0.94) / w;
  const byHeight = (window.innerHeight - 170) / 0.78;  // room for the top label and bottom controls
  txt.style.fontSize = Math.floor(Math.min(byWidth, byHeight)) + 'px';
}
const refit = () => requestAnimationFrame(fitClock);
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', () => setTimeout(refit, 250));
window.visualViewport?.addEventListener('resize', refit);
document.fonts?.ready.then(refit);

/* ================= timer engine ================= */
// Elapsed time comes from the clock, not from counting ticks, so it stays accurate
// even when the browser throttles timers.
function elapsedSec() {
  if (!run.startAt) return 0;
  const now = run.pausedAt || performance.now();
  return Math.floor((now - run.startAt - run.pausedTotal) / 1000);
}

function startTimer() {
  const c = currentCfg();
  if (!validate(c)) return;
  const slotIndex = state.mode === 'conference' ? state.selected : null;
  Object.assign(run, {
    cfg: { min: c.min, amber: c.amber, max: c.max }, t: thresholds(c), dir: state.dir, label: cfgLabel(c), slotIndex,
    startAt: performance.now(), pausedAt: 0, pausedTotal: 0, lastSig: '', stopped: false,
    prevUsed: slotIndex != null ? (c.used ?? null) : null,
  });
  if (state.mode === 'simple') { pushRecent(c); save(); }
  $('timer-label').textContent = run.label;
  setPhase('running');
  enterFullscreen();
  requestWakeLock();
  render();
  clearInterval(run.tick);
  run.tick = setInterval(render, 100);
}

function render() {
  const el = elapsedSec();
  setClock(run.dir === 'down' ? countdownText(run.cfg.max - el) : fmt(el));
  const sig = shownSignal(signalFor(el, run.t));
  if (sig !== run.lastSig) { applySignal(sig); run.lastSig = sig; }
}

function startPause() {
  if (run.phase === 'ready') return startTimer();
  if (run.phase === 'running') { run.pausedAt = performance.now(); setPhase('paused'); }
  else { run.pausedTotal += performance.now() - run.pausedAt; run.pausedAt = 0; setPhase('running'); }
  render();
}

function endRun() {
  clearInterval(run.tick); run.tick = null;
  releaseWakeLock();
  applySignal('idle'); run.lastSig = '';
}

// Reset needs a second tap within 3 s, so a stray touch cannot wipe a speech in progress.
let resetArmed = null;
function disarmReset() {
  clearTimeout(resetArmed); resetArmed = null;
  $('reset-btn').classList.remove('armed');
  $('reset-btn').querySelector('.ctl-text').textContent = 'Reset';
}
function resetTimer() {
  if (run.phase === 'ready' || state.mode === 'simple') return;   // Simple mode has no Reset
  if (!resetArmed) {
    $('reset-btn').classList.add('armed');
    $('reset-btn').querySelector('.ctl-text').textContent = 'Tap again';
    resetArmed = setTimeout(disarmReset, 3000);
    return;
  }
  endRun();
  run.startAt = 0;
  setPhase('ready');
  renderReady();
}

function stopTimer() {
  if (run.phase === 'ready') return;
  const used = elapsedSec();
  run.stoppedPhase = run.phase;
  run.stopped = true;
  endRun();
  if (run.slotIndex != null && state.agenda[run.slotIndex]) {
    state.agenda[run.slotIndex].used = used;
    if (run.slotIndex < state.agenda.length - 1) state.selected = run.slotIndex + 1;  // ready for the next speaker
    save(); renderAgenda();
  }
  setPhase('ready');
  // Simple mode is a plain countdown: Stop just returns the clock to its start time.
  // The results window (with Resume / Restart) is for Conference mode, where times are recorded.
  if (run.slotIndex == null) {
    run.stopped = false; run.startAt = 0;
    renderReady();
    toast(`Stopped after ${fmt(used)}`);
    return;
  }
  showSummary(used);
}

function showSummary(used) {
  $('sum-label').textContent = run.label || 'Time taken';
  $('sum-time').textContent = fmt(used);
  $('sum-min').textContent = fmt(run.cfg.min);
  $('sum-amb').textContent = fmt(run.cfg.amber);
  $('sum-max').textContent = fmt(run.cfg.max);
  const v = $('sum-verdict');
  v.className = 'verdict';
  if (used < run.cfg.min) { v.textContent = `Under minimum by ${fmt(run.cfg.min - used)}`; v.classList.add('v-under'); }
  else if (used <= run.cfg.max) { v.textContent = 'Within time'; v.classList.add('v-ok'); }
  else { v.textContent = `Over time by ${fmt(used - run.cfg.max)}`; v.classList.add('v-over'); }
  show('summary-view');
  $('back-btn').focus();
}

$('startpause-btn').addEventListener('click', startPause);
$('stop-btn').addEventListener('click', stopTimer);
$('reset-btn').addEventListener('click', resetTimer);
$('prev-slot').addEventListener('click', () => moveSlot(-1));
$('next-slot').addEventListener('click', () => moveSlot(1));

// Summary: Done, Restart, or Resume (stopped by mistake: carry on as if the clock never
// stopped, since the speaker kept talking).
$('back-btn').addEventListener('click', () => {
  run.stopped = false; run.startAt = 0;
  show('main-view'); renderReady();
});
$('again-btn').addEventListener('click', () => {
  run.stopped = false;
  if (run.slotIndex != null) { state.selected = run.slotIndex; save(); renderAgenda(); }
  show('main-view');
  startTimer();
});
$('resume-btn').addEventListener('click', () => {
  if (!run.stopped) return;
  run.stopped = false;
  if (run.slotIndex != null && state.agenda[run.slotIndex]) {
    state.agenda[run.slotIndex].used = run.prevUsed;
    state.selected = run.slotIndex;
    save(); renderAgenda();
  }
  show('main-view');
  $('timer-label').textContent = run.label;
  setPhase(run.stoppedPhase);
  enterFullscreen();
  requestWakeLock();
  render();
  run.tick = setInterval(render, 100);
});

document.addEventListener('keydown', (e) => {
  if (!main.classList.contains('active') || e.target.closest('input')) return;
  if (e.code === 'Space') {
    if (e.target.closest('button')) return;   // the focused button handles Space itself
    e.preventDefault(); startPause();
  } else if (e.key === 'Escape') { e.preventDefault(); stopTimer(); }
  else if (e.key === 'r' || e.key === 'R') resetTimer();
  else if (e.key === 'ArrowLeft') moveSlot(-1);
  else if (e.key === 'ArrowRight') moveSlot(1);
});

/* ================= settings ================= */
$('settings-btn').addEventListener('click', () => {
  if (run.phase !== 'ready') return;
  renderSettings();
  exitFullscreen();
  show('settings-view');
  window.scrollTo(0, 0);
});
$('done-btn').addEventListener('click', () => {
  if (state.mode === 'simple' && !validate(state.simple)) return;
  show('main-view');
  renderReady();
});

function renderSettings() {
  for (const b of document.querySelectorAll('button[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
  for (const b of document.querySelectorAll('[data-dir]')) b.setAttribute('aria-checked', String(b.dataset.dir === state.dir));
  $('settings-view').dataset.mode = state.mode;
  $('dir-hint').textContent = state.dir === 'down'
    ? 'Counts down from the red (max) time and holds at 0:00 once the speaker is over. The colours carry on as normal.'
    : 'Counts up from 0:00.';
  for (const cb of document.querySelectorAll('[data-sig]')) {
    cb.checked = !!state.signals[cb.dataset.sig];
    cb.closest('.sig-row').classList.toggle('off', !cb.checked);
  }
  $('bell-after').value = state.bellAfter;
  writeSimple();
  renderRecents();
  renderAgenda();
}

for (const b of document.querySelectorAll('button[data-mode]')) b.addEventListener('click', () => { state.mode = b.dataset.mode; save(); renderSettings(); });
for (const b of document.querySelectorAll('[data-dir]')) b.addEventListener('click', () => { state.dir = b.dataset.dir; save(); renderSettings(); });
for (const cb of document.querySelectorAll('[data-sig]')) cb.addEventListener('change', () => {
  state.signals[cb.dataset.sig] = cb.checked;
  cb.closest('.sig-row').classList.toggle('off', !cb.checked);
  save();
});
bindNumeric($('bell-after'));
$('bell-after').addEventListener('change', () => {
  state.bellAfter = Math.min(600, secs($('bell-after').value, 30));
  $('bell-after').value = state.bellAfter;
  save();
});

/* ---------- simple mode times ---------- */
const sIn = {
  minMM: $('s-min-mm'), minSS: $('s-min-ss'), ambMM: $('s-amb-mm'), ambSS: $('s-amb-ss'), maxMM: $('s-max-mm'), maxSS: $('s-max-ss'),
};
for (const [k, el] of Object.entries(sIn)) {
  bindNumeric(el, k.endsWith('SS'));
  el.addEventListener('change', () => {
    const next = { min: readMMSS(sIn.minMM, sIn.minSS), amber: readMMSS(sIn.ambMM, sIn.ambSS), max: readMMSS(sIn.maxMM, sIn.maxSS) };
    state.simple = followMidpoint(state.simple, next);
    save(); writeSimple(); renderRecents();
  });
}
function writeSimple() {
  writeMMSS(sIn.minMM, sIn.minSS, state.simple.min);
  writeMMSS(sIn.ambMM, sIn.ambSS, state.simple.amber);
  writeMMSS(sIn.maxMM, sIn.maxSS, state.simple.max);
}

const sameTimer = (a, b) => a.min === b.min && a.amber === b.amber && a.max === b.max && a.dir === b.dir;
function renderRecents() {
  const wrap = $('recents');
  wrap.textContent = '';
  for (const r of state.recents) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'recent';
    if (sameTimer(r, { ...state.simple, dir: state.dir })) b.classList.add('current');
    b.innerHTML = `<span class="r-times"><span><b class="dot d-green"></b>${fmt(r.min)}</span><span><b class="dot d-amber"></b>${fmt(r.amber)}</span><span><b class="dot d-red"></b>${fmt(r.max)}</span></span>
      <span class="r-dir">${r.dir === 'down' ? 'Count down' : 'Count up'}</span>`;
    b.addEventListener('click', () => {
      state.simple = { min: r.min, amber: r.amber, max: r.max };
      state.dir = r.dir;
      save(); renderSettings();
      toast(`Loaded ${fmt(r.min)} / ${fmt(r.amber)} / ${fmt(r.max)}, ${r.dir === 'down' ? 'count down' : 'count up'}`);
    });
    wrap.appendChild(b);
  }
  $('recents-empty').hidden = state.recents.length > 0;
}
function pushRecent(c) {
  const r = { min: c.min, amber: c.amber, max: c.max, dir: state.dir };
  state.recents = [r, ...state.recents.filter(x => !sameTimer(x, r))].slice(0, 4);
}

/* ---------- conference agenda ---------- */
const agendaEl = $('agenda');
const tpl = $('slot-tpl');

function renderAgenda() {
  agendaEl.textContent = '';
  if (state.selected >= state.agenda.length) state.selected = Math.max(0, state.agenda.length - 1);
  state.agenda.forEach((slot, i) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    const q = (c) => li.querySelector(c);
    const write = () => {
      writeMMSS(q('.min-mm'), q('.min-ss'), slot.min);
      writeMMSS(q('.amb-mm'), q('.amb-ss'), slot.amber);
      writeMMSS(q('.max-mm'), q('.max-ss'), slot.max);
    };
    q('.role').value = slot.role;
    q('.name').value = slot.name;
    write();
    for (const el of li.querySelectorAll('.mmss input')) bindNumeric(el, el.classList.contains('ss'));
    paintUsed(q('.used'), slot);
    li.classList.toggle('selected', i === state.selected);

    li.addEventListener('click', (e) => {
      if (e.target.closest('.del')) return;
      if (state.selected !== i) { state.selected = i; save(); markSelected(); }
    });
    li.addEventListener('change', () => {
      slot.role = q('.role').value;
      slot.name = q('.name').value;
      const next = followMidpoint(slot, {
        min: readMMSS(q('.min-mm'), q('.min-ss')), amber: readMMSS(q('.amb-mm'), q('.amb-ss')), max: readMMSS(q('.max-mm'), q('.max-ss')),
      });
      Object.assign(slot, next);
      write();
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
}
function markSelected() {
  [...agendaEl.children].forEach((li, i) => li.classList.toggle('selected', i === state.selected));
}
function paintUsed(el, slot) {
  el.classList.remove('u-green', 'u-amber', 'u-red');
  const text = el.querySelector('.used-text'), bar = el.querySelector('i');
  if (slot.used == null) { text.textContent = '–'; bar.style.width = '0'; return; }
  const t = thresholds(slot);
  const sig = signalFor(slot.used, t);
  text.textContent = fmt(slot.used);
  bar.style.width = Math.min(100, (slot.used / t.bell) * 100) + '%';
  if (sig === 'green') el.classList.add('u-green');
  else if (sig === 'amber') el.classList.add('u-amber');
  else if (sig === 'red' || sig === 'bell') el.classList.add('u-red');
}

$('add-slot').addEventListener('click', () => {
  const src = state.agenda[state.selected];
  const slot = src
    ? { role: src.role, name: '', min: src.min, amber: src.amber, max: src.max, used: null }
    : { role: 'Speaker', name: '', min: 300, amber: 360, max: 420, used: null };
  const at = state.agenda.length ? state.selected + 1 : 0;
  state.agenda.splice(at, 0, slot);
  state.selected = at;
  save(); renderAgenda();
  agendaEl.children[at]?.querySelector('.role').focus();
});
$('reset-agenda').addEventListener('click', () => {
  confirmBox('Replace the agenda with the default list? Names and recorded times will be cleared.', 'Reset', () => {
    state.agenda = structuredClone(DEFAULT_AGENDA); state.selected = 0; save(); renderAgenda(); toast('Agenda reset');
  });
});
$('export-btn').addEventListener('click', async () => {
  const name = `agenda-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify({ app: 'speaker-timer', version: 2, agenda: state.agenda }, null, 2);
  // iPad: the Share sheet offers Save to Files / AirDrop, which is more reliable than a download.
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Speaker Timer agenda' }); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
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
    state.agenda = list.map(s => withAmber({
      role: String(s.role ?? ''), name: String(s.name ?? ''), min: s.min, amber: s.amber, max: s.max,
      used: Number.isFinite(s.used) ? s.used : null,
    }));
    state.selected = 0; save(); renderAgenda(); toast(`Loaded ${state.agenda.length} slots`);
  } catch {
    toast('That file is not a Speaker Timer agenda (.json)');
  }
});

/* ================= screen wake lock & fullscreen ================= */
// Screen Wake Lock where supported; otherwise (older iPadOS, and home-screen apps before
// iPadOS 18.4) a tiny muted looping video keeps the display from sleeping.
let wakeLock = null, wantWake = false, keepAwakeVideo = null;
// 2 s silent black 16×16 MP4, inline so it works offline without range-request trouble in the service worker.
const KEEP_AWAKE_MP4 = 'data:video/mp4;base64,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';
async function requestWakeLock() {
  wantWake = true;
  try {
    if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); return; }
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
// Ask the browser not to evict saved settings (iOS clears storage of unvisited sites).
try { navigator.storage?.persist?.(); } catch { }
function setupInstallTip() {
  let dismissed = false;
  try { dismissed = localStorage.getItem('speaker-timer-tip') === '1'; } catch { }
  if (!isIOS || isInstalled || dismissed) return;
  $('install-tip').hidden = false;
  $('install-tip-close').addEventListener('click', () => {
    $('install-tip').hidden = true;
    try { localStorage.setItem('speaker-timer-tip', '1'); } catch { }
  });
}

/* ================= launch logo ================= */
// Shown on every fresh launch; fades out after 1.5 s, or straight away on a tap.
(() => {
  const el = $('launch');
  if (!el) return;
  const hide = () => {
    if (el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
  };
  setTimeout(hide, 1500);
  el.addEventListener('pointerdown', hide);
})();

/* ================= boot: open straight on the clock ================= */
setupInstallTip();
renderSettings();
setPhase('ready');
show('main-view');
renderReady();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* preview hosts may refuse */ });
  });
}
