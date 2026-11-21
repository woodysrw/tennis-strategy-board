import './style.css';
import { BUF_H, BUF_W, toCourt, toScreen } from './court';
import { icon } from './icons';
import {
  INK,
  INK_NAMES,
  PIECES,
  cascade,
  chainFrom,
  clampWorld,
  clone,
  endOf,
  near,
  newSequence,
  sanitize,
  setMode,
  type Frame,
  type Mode,
  type PieceId,
  type Sequence,
  type Stroke,
  type Vec,
} from './model';
import { Playback } from './playback';
import { bodyHit, drawOrder, drawScene, knobAt } from './render';
import { decodeSeq, encodeSeq } from './share';

const DRAFT_KEY = 'court-board.draft.v1';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('court');
const box = $('canvasBox');
const strip = $('strip');
const panel = $('panel');
const hudFrame = $('hudFrame');
const hudStatus = $('hudStatus');
const hudMsg = $('hudMsg');
const toastEl = $('toast');
const inkBar = $('inkBar');

canvas.width = BUF_W;
canvas.height = BUF_H;
const ctx = canvas.getContext('2d')!;

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
  el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!));
});

// ---------- State ----------

function readDraft(): Sequence | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const shared = decodeSeq(location.hash);
/** Opened from a share link: a read-only player until "Edit copy". */
let viewOnly = !!shared;
let seq: Sequence = shared ?? readDraft() ?? newSequence('doubles');
let cur = 0;
let playback: Playback | null = null;
let playKind: 'frame' | 'all' | null = null;
let hover: PieceId | null = null;

interface Drag {
  kind: 'body' | 'knob';
  id: PieceId;
  /** Frames as they were at pointerdown; each move re-applies from here. */
  snap: Frame[];
  before: string;
  grab: Vec;
  downBuf: Vec;
  moved: boolean;
}
let drag: Drag | null = null;

let penOn = false;
let penColor = 0;
/** The stroke being drawn right now, plus the state to undo back to. */
let drawing: { stroke: Stroke; before: string } | null = null;

const undoStack: string[] = [];
const snapshot = () => JSON.stringify({ seq, cur });

function pushUndo(state = snapshot()) {
  undoStack.push(state);
  if (undoStack.length > 80) undoStack.shift();
}

function undo() {
  const s = undoStack.pop();
  if (!s) return;
  stopPlay();
  const st = JSON.parse(s) as { seq: Sequence; cur: number };
  seq = st.seq;
  cur = Math.min(st.cur, seq.frames.length - 1);
  changed();
}

function writeDraft() {
  if (viewOnly) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(seq));
  } catch {
    // Storage blocked (private mode etc.). The board still works for this visit.
  }
}

/** Call after any change to the sequence. */
function changed() {
  writeDraft();
  renderStrip();
  updateUI();
  invalidate();
}

// ---------- Actions ----------

function addFrame() {
  if (viewOnly) return;
  stopPlay();
  pushUndo();
  seq.frames.splice(cur + 1, 0, chainFrom(seq.frames[cur]));
  cur++;
  changed();
}

function selectFrame(i: number) {
  if (i < 0 || i >= seq.frames.length) return;
  stopPlay();
  cur = i;
  renderStrip();
  updateUI();
  invalidate();
}

function switchMode(mode: Mode) {
  if (seq.mode === mode) return;
  stopPlay();
  pushUndo();
  setMode(seq, mode);
  changed();
}

function clearArrows() {
  const f = seq.frames[cur];
  const ids = Object.keys(f.arrows) as PieceId[];
  if (!ids.length) return;
  stopPlay();
  pushUndo();
  for (const id of ids) {
    const old = endOf(f, id)!;
    delete f.arrows[id];
    cascade(seq, cur, id, old, f.start[id]!);
  }
  changed();
}

function deleteFrame() {
  if (seq.frames.length < 2) return;
  stopPlay();
  pushUndo();
  seq.frames.splice(cur, 1);
  cur = Math.min(cur, seq.frames.length - 1);
  changed();
}

function newBoard() {
  stopPlay();
  pushUndo();
  seq = newSequence(seq.mode);
  cur = 0;
  changed();
  toast('New board. Undo brings the old one back');
}

async function share() {
  const url = `${location.origin}${location.pathname}#${encodeSeq(seq)}`;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.share) {
    try {
      await navigator.share({ title: 'Tennis play', url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    prompt('Copy this link', url);
  }
}

function editCopy() {
  stopPlay();
  const old = readDraft();
  viewOnly = false;
  history.replaceState(null, '', location.pathname + location.search);
  if (old) pushUndo(JSON.stringify({ seq: old, cur: 0 }));
  cur = 0;
  changed();
  if (old) toast('Loaded. Undo brings back your old board');
}

function togglePen(on = !penOn) {
  if (viewOnly) return;
  penOn = on;
  hover = null;
  canvas.style.cursor = penOn ? 'crosshair' : 'default';
  updateUI();
  invalidate();
}

function eraseInk() {
  const f = seq.frames[cur];
  if (!f.ink?.length) return;
  stopPlay();
  pushUndo();
  delete f.ink;
  changed();
}

// Pen color swatches + erase, built once.
INK.forEach((color, i) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.background = color;
  b.title = INK_NAMES[i];
  b.setAttribute('aria-label', `${INK_NAMES[i]} pen`);
  b.onclick = () => {
    penColor = i;
    updateUI();
  };
  inkBar.append(b);
});
const eraseBtn = document.createElement('button');
eraseBtn.className = 'ink-erase';
eraseBtn.innerHTML = icon('eraseInk');
eraseBtn.title = 'Erase all drawing in this frame';
eraseBtn.setAttribute('aria-label', 'Erase drawing');
eraseBtn.onclick = eraseInk;
inkBar.append(eraseBtn);

const actions: Record<string, () => void> = {
  play: () => (playKind === 'frame' ? stopPlay() : startPlay('frame')),
  playAll: () => (playKind === 'all' ? stopPlay() : startPlay('all')),
  singles: () => switchMode('singles'),
  doubles: () => switchMode('doubles'),
  undo,
  clear: clearArrows,
  delete: deleteFrame,
  pen: () => togglePen(),
  share: () => void share(),
  new: newBoard,
  viewPlay: () => (playback ? stopPlay() : startPlay('all')),
  prev: () => selectFrame(cur - 1),
  next: () => selectFrame(cur + 1),
  edit: editCopy,
};

panel.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (b && !b.disabled) actions[b.dataset.act!]?.();
});

// ---------- Playback + render loop ----------

let raf = 0;
let lastT = 0;
let playingFrame = -1;

function invalidate() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = 0;
  if (playback) {
    // Cap the step so a backgrounded tab doesn't jump a whole frame on return.
    playback.update(Math.min(250, now - lastT));
    lastT = now;
  }
  render();
  if (playback) raf = requestAnimationFrame(tick);
}

function startPlay(kind: 'frame' | 'all') {
  playback = new Playback(seq, kind === 'frame' ? cur : null);
  playKind = kind;
  lastT = performance.now();
  updateUI();
  invalidate();
}

function stopPlay() {
  if (!playback) return;
  playback = null;
  playKind = null;
  markPlaying(-1);
  updateUI();
  invalidate();
}

function release() {
  if (!playback?.waiting) return false;
  playback.release();
  lastT = performance.now();
  invalidate();
  return true;
}

function markPlaying(fi: number) {
  playingFrame = fi;
  strip.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('playing', i === fi));
}

function render() {
  const n = seq.frames.length;
  if (playback) {
    const fi = playback.frame;
    const f = seq.frames[fi];
    drawScene(ctx, {
      mode: seq.mode,
      pos: playback.positions(),
      arrows: playback.waiting ? undefined : { from: f.start, to: f.arrows, dim: true },
      ink: f.ink,
    });
    hudFrame.textContent = `Frame ${fi + 1}/${n}`;
    hudMsg.hidden = !playback.waiting;
    if (fi !== playingFrame && playKind === 'all') markPlaying(fi);
    return;
  }
  const f = seq.frames[cur];
  drawScene(ctx, {
    mode: seq.mode,
    pos: f.start,
    arrows: { from: f.start, to: f.arrows, dim: false },
    knobs: viewOnly || penOn ? undefined : { start: f.start, arrows: f.arrows },
    highlight: viewOnly || penOn ? null : (drag?.id ?? hover),
    ink: f.ink,
  });
  hudFrame.textContent = `Frame ${cur + 1}/${n}`;
  hudMsg.hidden = true;
}

// ---------- UI state ----------

const btn = (act: string) => panel.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);

function setBtn(act: string, label: string, ic: string) {
  const b = btn(act);
  if (b) b.innerHTML = `${icon(ic)}<span>${label}</span>`;
}

function updateUI() {
  document.body.classList.toggle('view', viewOnly);
  setBtn('play', playKind === 'frame' ? 'Stop' : 'Play', playKind === 'frame' ? 'stop' : 'play');
  setBtn('playAll', playKind === 'all' ? 'Stop' : 'Play all', playKind === 'all' ? 'stop' : 'playAll');
  setBtn('viewPlay', playback ? 'Stop' : 'Play', playback ? 'stop' : 'play');
  btn('singles')!.setAttribute('aria-pressed', String(seq.mode === 'singles'));
  btn('doubles')!.setAttribute('aria-pressed', String(seq.mode === 'doubles'));
  btn('undo')!.disabled = !undoStack.length;
  btn('clear')!.disabled = !Object.keys(seq.frames[cur].arrows).length;
  btn('delete')!.disabled = seq.frames.length < 2;
  btn('pen')!.setAttribute('aria-pressed', String(penOn));
  inkBar.hidden = !penOn || viewOnly || !!playback;
  inkBar.querySelectorAll('.swatch').forEach((s, i) => s.setAttribute('aria-pressed', String(i === penColor)));
  eraseBtn.disabled = !seq.frames[cur].ink?.length;
  btn('prev')!.disabled = cur === 0;
  btn('next')!.disabled = cur === seq.frames.length - 1;
  hudStatus.textContent = viewOnly
    ? 'Replay'
    : playKind === 'frame'
      ? 'Loop'
      : playKind === 'all'
        ? 'Play all'
        : 'Edit';
  layout();
}

let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 2200);
}

// ---------- Frame strip ----------

const thumbBuf = document.createElement('canvas');
thumbBuf.width = BUF_W;
thumbBuf.height = BUF_H;
const thumbCtx = thumbBuf.getContext('2d')!;

function renderStrip() {
  const items: HTMLElement[] = [];
  seq.frames.forEach((f, i) => {
    if (i > 0) {
      const wait = f.advance === 'click';
      const link = document.createElement('button');
      link.className = 'link' + (wait ? ' wait' : '');
      link.innerHTML = icon(wait ? 'pause' : 'play');
      const label = wait ? `Waits for a tap before frame ${i + 1}` : `Plays straight into frame ${i + 1}`;
      link.title = viewOnly ? label : `${label}. Click to switch.`;
      link.setAttribute('aria-label', label);
      link.disabled = viewOnly;
      link.onclick = () => {
        stopPlay();
        pushUndo();
        f.advance = wait ? 'auto' : 'click';
        changed();
      };
      items.push(link);
    }

    const t = document.createElement('button');
    t.className = 'thumb' + (i === cur ? ' selected' : '');
    t.setAttribute('aria-label', `Frame ${i + 1}`);
    if (i === cur) t.setAttribute('aria-current', 'true');
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 160;
    drawScene(thumbCtx, {
      mode: seq.mode,
      pos: f.start,
      arrows: { from: f.start, to: f.arrows, dim: false },
      ink: f.ink,
    });
    const cc = c.getContext('2d')!;
    cc.imageSmoothingEnabled = true;
    cc.drawImage(thumbBuf, 0, 0, 80, 160);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    t.append(c, num);
    wireThumb(t, i);
    items.push(t);
  });

  if (!viewOnly) {
    const add = document.createElement('button');
    add.className = 'add';
    add.innerHTML = icon('add');
    add.title = 'Add frame: starts where these arrows end (N)';
    add.setAttribute('aria-label', 'Add frame');
    add.onclick = addFrame;
    items.push(add);
  }

  strip.replaceChildren(...items);
  strip.querySelector('.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Tap selects a frame; dragging up or down reorders it (edit mode). */
function wireThumb(t: HTMLElement, i: number) {
  let downY: number | null = null;
  let dragging = false;
  t.addEventListener('pointerdown', (e) => {
    downY = e.clientY;
    dragging = false;
    t.setPointerCapture(e.pointerId);
  });
  t.addEventListener('pointermove', (e) => {
    if (downY === null || viewOnly) return;
    const dy = e.clientY - downY;
    if (!dragging && Math.abs(dy) > 8) {
      dragging = true;
      t.classList.add('dragging');
      stopPlay();
    }
    if (dragging) t.style.transform = `translateY(${dy}px)`;
  });
  t.addEventListener('pointerup', (e) => {
    if (downY === null) return;
    const wasDrag = dragging;
    downY = null;
    dragging = false;
    if (!wasDrag) {
      selectFrame(i);
      return;
    }
    let to = 0;
    strip.querySelectorAll<HTMLElement>('.thumb').forEach((o, j) => {
      if (j === i) return;
      const r = o.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) to++;
    });
    if (to === i) {
      renderStrip();
      return;
    }
    pushUndo();
    const [moved] = seq.frames.splice(i, 1);
    seq.frames.splice(to, 0, moved);
    cur = to;
    changed();
  });
  t.addEventListener('pointercancel', () => {
    downY = null;
    dragging = false;
    renderStrip();
  });
  // Keyboard activation (Enter/Space) arrives as a click with detail 0.
  t.addEventListener('click', (e) => {
    if (e.detail === 0) selectFrame(i);
  });
}

// ---------- Court input ----------

function bufPoint(e: PointerEvent): Vec {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * BUF_W) / r.width, y: ((e.clientY - r.top) * BUF_H) / r.height };
}

const cssToBuf = (px: number) => (px * BUF_W) / canvas.getBoundingClientRect().width;

function hitTest(b: Vec): { kind: 'body' | 'knob'; id: PieceId } | null {
  const f = seq.frames[cur];
  const ids = PIECES[seq.mode];
  let best: PieceId | null = null;
  let bestD = Math.max(3.5, cssToBuf(18));
  for (const id of ids) {
    const k = toScreen(knobAt(id, f.start[id]!, f.arrows[id]));
    const d = Math.hypot(k.x - b.x, k.y - b.y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  if (best) return { kind: 'knob', id: best };
  const minHalf = cssToBuf(20);
  for (const id of drawOrder(ids, f.start).reverse()) {
    if (bodyHit(id, f.start[id]!, b, minHalf)) return { kind: 'body', id };
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (playback) {
    if (!release()) stopPlay();
    return;
  }
  if (viewOnly) {
    startPlay('all');
    return;
  }
  const b = bufPoint(e);
  if (penOn) {
    const p = clampWorld(toCourt(b));
    const stroke: Stroke = { c: penColor, p: [p.x, p.y] };
    const before = snapshot();
    const f = seq.frames[cur];
    (f.ink ??= []).push(stroke);
    drawing = { stroke, before };
    canvas.setPointerCapture(e.pointerId);
    invalidate();
    return;
  }
  const hit = hitTest(b);
  if (!hit) return;
  const f = seq.frames[cur];
  const origin = hit.kind === 'body' ? f.start[hit.id]! : knobAt(hit.id, f.start[hit.id]!, f.arrows[hit.id]);
  const p = toCourt(b);
  drag = {
    ...hit,
    snap: clone(seq.frames),
    before: snapshot(),
    grab: { x: p.x - origin.x, y: p.y - origin.y },
    downBuf: b,
    moved: false,
  };
  canvas.setPointerCapture(e.pointerId);
  invalidate();
});

canvas.addEventListener('pointermove', (e) => {
  const b = bufPoint(e);
  if (drawing) {
    const p = clampWorld(toCourt(b));
    const pts = drawing.stroke.p;
    // Skip points closer than ~half a foot to keep strokes (and links) small.
    if (Math.hypot(p.x - pts[pts.length - 2], p.y - pts[pts.length - 1]) >= 0.5) {
      pts.push(p.x, p.y);
      invalidate();
    }
    return;
  }
  if (!drag) {
    if (e.pointerType !== 'mouse' || playback || viewOnly || penOn) return;
    const h = hitTest(b);
    canvas.style.cursor = h ? (h.kind === 'knob' ? 'crosshair' : 'grab') : 'default';
    const id = h?.id ?? null;
    if (id !== hover) {
      hover = id;
      invalidate();
    }
    return;
  }
  if (!drag.moved && Math.hypot(b.x - drag.downBuf.x, b.y - drag.downBuf.y) < cssToBuf(4)) return;
  if (!drag.moved) {
    drag.moved = true;
    pushUndo(drag.before);
  }
  const p = toCourt(b);
  const target = clampWorld({ x: p.x - drag.grab.x, y: p.y - drag.grab.y });
  seq.frames = clone(drag.snap);
  const f = seq.frames[cur];
  const id = drag.id;
  const oldEnd = endOf(f, id)!;
  if (drag.kind === 'body') {
    const s = f.start[id]!;
    const a = f.arrows[id];
    f.start[id] = target;
    if (a) f.arrows[id] = clampWorld({ x: a.x + target.x - s.x, y: a.y + target.y - s.y });
  } else {
    f.arrows[id] = target;
  }
  cascade(seq, cur, id, oldEnd, endOf(f, id)!);
  invalidate();
});

function endDrag() {
  if (drawing) {
    pushUndo(drawing.before);
    drawing = null;
    changed();
    return;
  }
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) {
    invalidate();
    return;
  }
  // Dropping an arrow back on its piece removes it.
  const f = seq.frames[cur];
  const a = f.arrows[d.id];
  if (d.kind === 'knob' && a && near(a, f.start[d.id]!, 2)) {
    delete f.arrows[d.id];
    cascade(seq, cur, d.id, a, f.start[d.id]!);
  }
  changed();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => {
  if (hover && !drag) {
    hover = null;
    invalidate();
  }
});

// ---------- Keyboard ----------

addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  // Let keyboard users activate a focused button normally.
  if (target.tagName === 'BUTTON' && target.matches(':focus-visible') && (e.key === ' ' || e.key === 'Enter')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (!viewOnly) undo();
    return;
  }
  if (mod || e.altKey) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (!release()) (viewOnly ? actions.viewPlay : actions.play)();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (!release()) (viewOnly ? actions.viewPlay : actions.playAll)();
  } else if (e.key === 'ArrowLeft') {
    selectFrame(cur - 1);
  } else if (e.key === 'ArrowRight') {
    selectFrame(cur + 1);
  } else if (e.key === 'n' || e.key === 'N' || e.key === '+' || e.key === '=') {
    addFrame();
  } else if (e.key === 'p' || e.key === 'P') {
    togglePen();
  } else if (e.key === 'Escape' && penOn) {
    togglePen(false);
  }
});

// A mouse-clicked button keeps focus; stop Space from re-clicking it.
addEventListener('keyup', (e) => {
  const target = e.target as HTMLElement;
  if (e.key === ' ' && target.tagName === 'BUTTON' && !target.matches(':focus-visible')) e.preventDefault();
});

// ---------- Layout ----------

/** Fit the 1:2 court into whatever space the frame column and panel leave. */
function layout() {
  const mobile = innerWidth < 760;
  const pad = mobile ? 8 : 20;
  const gap = mobile ? 8 : 16;
  const stageGap = mobile ? 6 : 12;
  const shadow = mobile ? 6 : 12; // court outline + drop shadow
  const besideCourt = strip.offsetWidth + stageGap + shadow;
  const availW = mobile
    ? innerWidth - pad * 2 - besideCourt
    : innerWidth - pad * 2 - besideCourt - panel.offsetWidth - gap;
  const availH = mobile
    ? innerHeight - pad * 2 - panel.offsetHeight - gap - shadow
    : innerHeight - pad * 2 - shadow;
  const s = Math.max(1, Math.min(availW / BUF_W, availH / BUF_H));
  const h = Math.floor(BUF_H * s);
  box.style.width = `${Math.floor(BUF_W * s)}px`;
  box.style.height = `${h}px`;
  strip.style.height = `${h + 6}px`;
}

addEventListener('resize', layout);
addEventListener('hashchange', () => {
  if (decodeSeq(location.hash)) location.reload();
});
document.fonts?.ready.then(layout);

// ---------- Boot ----------

renderStrip();
updateUI();
invalidate();
if (viewOnly) startPlay('all');
