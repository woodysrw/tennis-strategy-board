import { drawCourt, toScreen } from './court';
import { INK, PIECES, teamOf, type Mode, type PieceId, type Positions, type Stroke, type Vec } from './model';
import { fillEllipse, line, ringEllipse } from './pixel';
import { ballSprite, playerSprite } from './sprites';

export interface Scene {
  mode: Mode;
  /** Where each piece is drawn right now. */
  pos: Positions;
  arrows?: { from: Positions; to: Positions; dim: boolean };
  /** Editable handles, when the board is in edit mode. */
  knobs?: { start: Positions; arrows: Positions };
  highlight?: PieceId | null;
  /** Pen drawings, drawn over everything like a telestrator. */
  ink?: Stroke[];
}

const COL = {
  arrow: '#f3f1e6',
  ballArrow: '#ecf23f',
  arrowShadow: 'rgba(0, 20, 6, 0.6)',
  shadow: 'rgba(0, 24, 8, 0.45)',
  ring: '#ffd21f',
  knobEdge: '#14141f',
};

/** Ball floats this many buffer pixels above its shadow. */
const BALL_LIFT = 4;

/** Where a piece's arrow handle sits before it has an arrow: toward the net. */
export function defaultKnob(id: PieceId, start: Vec): Vec {
  const t = teamOf(id);
  if (t === 'A') return { x: start.x, y: start.y - 8.5 };
  if (t === 'B') return { x: start.x, y: start.y + 4 };
  return { x: start.x + 4, y: start.y };
}

export const knobAt = (id: PieceId, start: Vec, arrow?: Vec): Vec => arrow ?? defaultKnob(id, start);

/** Is buffer point `b` on the piece's body? `minHalf` keeps touch targets usable. */
export function bodyHit(id: PieceId, pos: Vec, b: Vec, minHalf: number): boolean {
  const s = toScreen(pos);
  if (id === 'ball') return Math.hypot(b.x - s.x, b.y - (s.y - BALL_LIFT)) <= Math.max(4, minHalf);
  const hw = Math.max(6, minHalf);
  const hh = Math.max(10, minHalf);
  return Math.abs(b.x - s.x) <= hw && Math.abs(b.y - (s.y - 8.5)) <= hh;
}

/** Back to front: far pieces first, the ball always on top. */
export function drawOrder(ids: PieceId[], pos: Positions): PieceId[] {
  return ids
    .filter((id) => pos[id])
    .sort((a, b) => Number(a === 'ball') - Number(b === 'ball') || pos[a]!.y - pos[b]!.y);
}

type Ctx = CanvasRenderingContext2D;

function drawArrow(ctx: Ctx, from: Vec, to: Vec, color: string) {
  const a = toScreen(from);
  const b = toScreen(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  line(ctx, a.x + 1, a.y + 1, b.x + 1, b.y + 1, COL.arrowShadow, [3, 2]);
  line(ctx, a.x, a.y, b.x, b.y, color, [3, 2]);
  if (len < 6) return;
  const ux = dx / len;
  const uy = dy / len;
  for (const sgn of [1, -1]) {
    const ang = Math.PI * 0.8 * sgn;
    const hx = b.x + (ux * Math.cos(ang) - uy * Math.sin(ang)) * 5;
    const hy = b.y + (ux * Math.sin(ang) + uy * Math.cos(ang)) * 5;
    line(ctx, b.x + 1, b.y + 1, hx + 1, hy + 1, COL.arrowShadow);
    line(ctx, b.x, b.y, hx, hy, color);
  }
}

function drawKnob(ctx: Ctx, at: Vec, active: boolean, isBall: boolean) {
  const x = Math.round(at.x);
  const y = Math.round(at.y);
  ctx.fillStyle = COL.knobEdge;
  ctx.fillRect(x - 2, y - 2, 5, 5);
  ctx.fillStyle = isBall ? COL.ballArrow : COL.arrow;
  ctx.fillRect(x - 1, y - 1, 3, 3);
  if (!active) {
    ctx.fillStyle = COL.knobEdge;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** 2px pen line with a 1px dark shadow so every color reads on the court. */
function drawStroke(ctx: Ctx, s: Stroke) {
  const pts: Vec[] = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) pts.push(toScreen({ x: s.p[i], y: s.p[i + 1] }));
  if (!pts.length) return;
  if (pts.length === 1) pts.push(pts[0]);
  const color = INK[s.c] ?? INK[0];
  for (const [col, off] of [[COL.arrowShadow, 1], [color, 0]] as const) {
    for (let i = 1; i < pts.length; i++) {
      line(ctx, pts[i - 1].x + off, pts[i - 1].y + off, pts[i].x + off, pts[i].y + off, col, undefined, 2);
    }
  }
}

export function drawScene(ctx: Ctx, sc: Scene): void {
  ctx.imageSmoothingEnabled = false;
  drawCourt(ctx);
  const ids = PIECES[sc.mode];

  if (sc.arrows) {
    ctx.globalAlpha = sc.arrows.dim ? 0.5 : 1;
    for (const id of ids) {
      const f = sc.arrows.from[id];
      const t = sc.arrows.to[id];
      if (f && t) drawArrow(ctx, f, t, id === 'ball' ? COL.ballArrow : COL.arrow);
    }
    ctx.globalAlpha = 1;
  }

  const order = drawOrder(ids, sc.pos);
  for (const id of order) {
    const s = toScreen(sc.pos[id]!);
    if (id === 'ball') fillEllipse(ctx, s.x, s.y, 2, 1, COL.shadow);
    else fillEllipse(ctx, s.x, s.y, 5, 2, COL.shadow);
  }

  const hl = sc.highlight;
  if (hl && sc.pos[hl]) {
    const s = toScreen(sc.pos[hl]!);
    if (hl === 'ball') ringEllipse(ctx, s.x, s.y, 4, 2, COL.ring);
    else ringEllipse(ctx, s.x, s.y, 8, 3, COL.ring);
  }

  for (const id of order) {
    const s = toScreen(sc.pos[id]!);
    const spr = id === 'ball' ? ballSprite() : playerSprite(id);
    const lift = id === 'ball' ? BALL_LIFT : 0;
    ctx.drawImage(spr.img, Math.round(s.x) - spr.ax, Math.round(s.y) - spr.ay - lift);
  }

  if (sc.ink) for (const s of sc.ink) drawStroke(ctx, s);

  if (sc.knobs) {
    for (const id of ids) {
      const st = sc.knobs.start[id];
      if (!st) continue;
      const arrow = sc.knobs.arrows[id];
      drawKnob(ctx, toScreen(knobAt(id, st, arrow)), !!arrow, id === 'ball');
    }
  }
}
