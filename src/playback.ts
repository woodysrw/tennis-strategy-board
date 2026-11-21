import { endPositions, near, type PieceId, type Positions, type Sequence } from './model';

// Playback is a flat list of timed segments that loops forever.
//   hold   - stand still
//   slide  - quick glide when a frame doesn't start where the last one ended
//   motion - everyone moves along their arrows
//   gate   - wait for a tap (frames set to "click")

type Kind = 'hold' | 'slide' | 'motion' | 'gate';

interface Seg {
  kind: Kind;
  frame: number;
  dur: number;
  from: Positions;
  to: Positions;
}

const MS = { motion: 1100, slide: 450, holdStart: 400, holdEnd: 1200, holdLoop: 700 };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const differs = (a: Positions, b: Positions) =>
  (Object.keys(b) as PieceId[]).some((id) => a[id] && !near(a[id]!, b[id]!, 0.25));

export class Playback {
  private segs: Seg[] = [];
  private i = 0;
  private t = 0;

  /** `only` loops a single frame; null plays the whole sequence. */
  constructor(seq: Sequence, only: number | null) {
    if (only !== null) {
      const f = seq.frames[only];
      const end = endPositions(f);
      this.segs = [
        { kind: 'hold', frame: only, dur: MS.holdStart, from: f.start, to: f.start },
        { kind: 'motion', frame: only, dur: MS.motion, from: f.start, to: end },
        { kind: 'hold', frame: only, dur: MS.holdLoop, from: end, to: end },
      ];
      return;
    }
    let prev: Positions | null = null;
    seq.frames.forEach((f, k) => {
      const end = endPositions(f);
      if (!prev) {
        this.segs.push({ kind: 'hold', frame: k, dur: MS.holdStart, from: f.start, to: f.start });
      } else {
        if (f.advance === 'click') this.segs.push({ kind: 'gate', frame: k - 1, dur: 0, from: prev, to: prev });
        if (differs(prev, f.start)) this.segs.push({ kind: 'slide', frame: k, dur: MS.slide, from: prev, to: f.start });
      }
      this.segs.push({ kind: 'motion', frame: k, dur: MS.motion, from: f.start, to: end });
      prev = end;
    });
    this.segs.push({ kind: 'hold', frame: seq.frames.length - 1, dur: MS.holdEnd, from: prev!, to: prev! });
  }

  private get seg(): Seg {
    return this.segs[this.i];
  }

  get frame(): number {
    return this.seg.frame;
  }

  get waiting(): boolean {
    return this.seg.kind === 'gate';
  }

  release(): void {
    if (!this.waiting) return;
    this.i = (this.i + 1) % this.segs.length;
    this.t = 0;
  }

  update(dt: number): void {
    for (let guard = 0; dt > 0 && guard < 64; guard++) {
      const s = this.seg;
      if (s.kind === 'gate') return;
      const left = s.dur - this.t;
      if (dt < left) {
        this.t += dt;
        return;
      }
      dt -= left;
      this.t = 0;
      this.i = (this.i + 1) % this.segs.length;
    }
  }

  positions(): Positions {
    const s = this.seg;
    const p = s.dur ? Math.min(1, this.t / s.dur) : 1;
    const out: Positions = {};
    for (const id of Object.keys(s.to) as PieceId[]) {
      const b = s.to[id]!;
      const a = s.from[id] ?? b;
      // The ball travels at a steady speed; players ease in and out.
      const e = s.kind === 'motion' && id === 'ball' ? p : easeInOut(p);
      out[id] = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
    return out;
  }
}
