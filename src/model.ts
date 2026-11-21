// Core data model. All positions are in court feet: x across the court,
// y along it, origin at the center of the net. Near team (A) has y > 0.

export type PieceId = 'A1' | 'A2' | 'B1' | 'B2' | 'ball';
export type Vec = { x: number; y: number };
export type Mode = 'singles' | 'doubles';
export type Positions = Partial<Record<PieceId, Vec>>;

/** A freehand pen stroke. `p` is flat court-feet pairs: x0, y0, x1, y1, ... */
export interface Stroke {
  c: number;
  p: number[];
}

/** Pen colors, indexed by Stroke.c. */
export const INK = ['#f3f1e6', '#ffd21f', '#e8402c', '#3d8cf2'];
export const INK_NAMES = ['White', 'Yellow', 'Red', 'Blue'];

export interface Frame {
  start: Positions;
  /** Arrow tip per piece. Absent means the piece stays put. */
  arrows: Positions;
  /** How playback enters this frame from the previous one. */
  advance: 'auto' | 'click';
  ink?: Stroke[];
}

export interface Sequence {
  v: 1;
  mode: Mode;
  frames: Frame[];
}

export const PIECES: Record<Mode, PieceId[]> = {
  singles: ['B1', 'A1', 'ball'],
  doubles: ['B1', 'B2', 'A1', 'A2', 'ball'],
};

const DEFAULT_POS: Record<Mode, Positions> = {
  singles: {
    A1: { x: 3, y: 40.5 },
    B1: { x: -11, y: -41 },
    ball: { x: 7, y: 39.5 },
  },
  doubles: {
    A1: { x: 4, y: 40.5 },
    A2: { x: -9, y: 12 },
    B1: { x: -13, y: -41 },
    B2: { x: 8, y: -21 },
    ball: { x: 8, y: 39.5 },
  },
};

/** Room around the court that pieces may be dragged into. */
export const WORLD = { halfW: 25.5, halfL: 52 };

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const near = (a: Vec, b: Vec, eps = 0.3) => Math.hypot(a.x - b.x, a.y - b.y) < eps;

export const teamOf = (id: PieceId): 'A' | 'B' | null =>
  id === 'ball' ? null : (id[0] as 'A' | 'B');

export const clampWorld = (v: Vec): Vec => ({
  x: Math.max(-WORLD.halfW, Math.min(WORLD.halfW, v.x)),
  y: Math.max(-WORLD.halfL, Math.min(WORLD.halfL, v.y)),
});

export const endOf = (f: Frame, id: PieceId): Vec | undefined => f.arrows[id] ?? f.start[id];

export function endPositions(f: Frame): Positions {
  const out: Positions = {};
  for (const id of Object.keys(f.start) as PieceId[]) out[id] = endOf(f, id);
  return out;
}

export function newSequence(mode: Mode = 'doubles'): Sequence {
  return { v: 1, mode, frames: [{ start: clone(DEFAULT_POS[mode]), arrows: {}, advance: 'auto' }] };
}

/** A new frame that starts where every arrow in `f` ends. */
export function chainFrom(f: Frame): Frame {
  return { start: clone(endPositions(f)), arrows: {}, advance: 'auto' };
}

/** Add or remove the second player on each side, across every frame. */
export function setMode(seq: Sequence, mode: Mode): void {
  if (seq.mode === mode) return;
  const keep = new Set(PIECES[mode]);
  seq.frames.forEach((f, i) => {
    for (const id of Object.keys(f.start) as PieceId[]) {
      if (!keep.has(id)) {
        delete f.start[id];
        delete f.arrows[id];
      }
    }
    for (const id of PIECES[mode]) {
      if (f.start[id]) continue;
      const prev = i > 0 ? endOf(seq.frames[i - 1], id) : undefined;
      f.start[id] = clone(prev ?? DEFAULT_POS[mode][id]!);
    }
  });
  seq.mode = mode;
}

/**
 * A piece's end position in frame `i` moved from `oldEnd` to `newEnd`.
 * Later frames that started exactly where it used to end follow it, so
 * chains built with + stay connected when an earlier arrow is edited.
 */
export function cascade(seq: Sequence, i: number, id: PieceId, oldEnd: Vec, newEnd: Vec): void {
  let o = oldEnd;
  let n = newEnd;
  for (let k = i + 1; k < seq.frames.length; k++) {
    const f = seq.frames[k];
    const s = f.start[id];
    if (!s || !near(s, o)) break;
    const prevEnd = endOf(f, id)!;
    const d = { x: n.x - s.x, y: n.y - s.y };
    f.start[id] = { ...n };
    const a = f.arrows[id];
    if (a) f.arrows[id] = clampWorld({ x: a.x + d.x, y: a.y + d.y });
    o = prevEnd;
    n = endOf(f, id)!;
  }
}

/** Validate untrusted input (a share link or saved draft). */
export function sanitize(raw: unknown): Sequence | null {
  const r = raw as { v?: unknown; mode?: unknown; frames?: unknown };
  if (!r || r.v !== 1 || (r.mode !== 'singles' && r.mode !== 'doubles')) return null;
  if (!Array.isArray(r.frames) || r.frames.length === 0 || r.frames.length > 200) return null;
  const ids = PIECES[r.mode];
  const vec = (v: unknown): Vec | undefined => {
    const p = v as { x?: unknown; y?: unknown } | undefined;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return undefined;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined;
    return clampWorld({ x: p.x, y: p.y });
  };
  const frames: Frame[] = [];
  type RawFrame = { start?: Record<string, unknown>; arrows?: Record<string, unknown>; advance?: unknown; ink?: unknown };
  for (const f of r.frames as RawFrame[]) {
    const start: Positions = {};
    const arrows: Positions = {};
    for (const id of ids) {
      const s = vec(f?.start?.[id]);
      if (!s) return null;
      start[id] = s;
      const a = vec(f?.arrows?.[id]);
      if (a) arrows[id] = a;
    }
    const frame: Frame = { start, arrows, advance: f?.advance === 'click' ? 'click' : 'auto' };
    const ink = sanitizeInk(f?.ink);
    if (ink.length) frame.ink = ink;
    frames.push(frame);
  }
  return { v: 1, mode: r.mode, frames };
}

function sanitizeInk(raw: unknown): Stroke[] {
  if (!Array.isArray(raw)) return [];
  const out: Stroke[] = [];
  for (const s of raw.slice(0, 200) as { c?: unknown; p?: unknown }[]) {
    const c = typeof s?.c === 'number' && Number.isInteger(s.c) && s.c >= 0 && s.c < INK.length ? s.c : 0;
    if (!Array.isArray(s?.p) || s.p.length < 2 || s.p.length > 4000) continue;
    const p = (s.p as unknown[]).slice(0, s.p.length - (s.p.length % 2));
    if (!p.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    const nums = p as number[];
    for (let i = 0; i < nums.length; i += 2) {
      const v = clampWorld({ x: nums[i], y: nums[i + 1] });
      nums[i] = v.x;
      nums[i + 1] = v.y;
    }
    out.push({ c, p: nums });
  }
  return out;
}
