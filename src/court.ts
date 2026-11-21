import type { Vec } from './model';

// Low-res buffer, scaled up with CSS `image-rendering: pixelated`.
export const BUF_W = 160;
export const BUF_H = 320;
/** Buffer pixels per court foot. */
export const PPF = 3;

/**
 * Court feet -> buffer pixels. The flat top-down view for v1.
 * The v2 perspective camera only needs to replace this pair.
 */
export const toScreen = (p: Vec): Vec => ({ x: BUF_W / 2 + p.x * PPF, y: BUF_H / 2 + p.y * PPF });
export const toCourt = (s: Vec): Vec => ({ x: (s.x - BUF_W / 2) / PPF, y: (s.y - BUF_H / 2) / PPF });

const C = {
  surround: '#15803a',
  court: '#1f9a48',
  grid: 'rgba(150, 255, 175, 0.16)',
  line: '#f3f1e6',
  netTape: '#f3f1e6',
  netDark: '#14141f',
  netMesh: '#5b5d72',
  post: '#2a2a36',
  netShadow: 'rgba(0, 24, 8, 0.35)',
};

/** Real dimensions in feet (half sizes from center). */
const COURT = { halfL: 39, halfW: 18, halfSingles: 13.5, service: 21, post: 21 };

type Ctx = CanvasRenderingContext2D;

function hline(ctx: Ctx, y: number, x0: number, x1: number) {
  const a = toScreen({ x: x0, y });
  const b = toScreen({ x: x1, y });
  ctx.fillRect(Math.floor(a.x), Math.floor(a.y), Math.floor(b.x) - Math.floor(a.x) + 1, 1);
}

function vline(ctx: Ctx, x: number, y0: number, y1: number) {
  const a = toScreen({ x, y: y0 });
  const b = toScreen({ x, y: y1 });
  ctx.fillRect(Math.floor(a.x), Math.floor(a.y), 1, Math.floor(b.y) - Math.floor(a.y) + 1);
}

export function drawCourt(ctx: Ctx): void {
  ctx.fillStyle = C.surround;
  ctx.fillRect(0, 0, BUF_W, BUF_H);

  const tl = toScreen({ x: -COURT.halfW, y: -COURT.halfL });
  const br = toScreen({ x: COURT.halfW, y: COURT.halfL });
  ctx.fillStyle = C.court;
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  // Arcade grid, every 3 ft, aligned to the center of the net.
  ctx.fillStyle = C.grid;
  const step = 3 * PPF;
  for (let x = (BUF_W / 2) % step; x < BUF_W; x += step) ctx.fillRect(x, 0, 1, BUF_H);
  for (let y = (BUF_H / 2) % step; y < BUF_H; y += step) ctx.fillRect(0, y, BUF_W, 1);

  ctx.fillStyle = C.line;
  const { halfL, halfW, halfSingles, service } = COURT;
  hline(ctx, -halfL, -halfW, halfW);
  hline(ctx, halfL, -halfW, halfW);
  vline(ctx, -halfW, -halfL, halfL);
  vline(ctx, halfW, -halfL, halfL);
  vline(ctx, -halfSingles, -halfL, halfL);
  vline(ctx, halfSingles, -halfL, halfL);
  hline(ctx, -service, -halfSingles, halfSingles);
  hline(ctx, service, -halfSingles, halfSingles);
  vline(ctx, 0, -service, service);
  vline(ctx, 0, -halfL, -halfL + 1);
  vline(ctx, 0, halfL - 1, halfL);

  // Net: tape, a checkered mesh, posts, and a hard shadow.
  const l = Math.floor(toScreen({ x: -COURT.post, y: 0 }).x);
  const r = Math.floor(toScreen({ x: COURT.post, y: 0 }).x);
  const y = Math.floor(BUF_H / 2);
  ctx.fillStyle = C.netShadow;
  ctx.fillRect(l, y + 2, r - l + 1, 2);
  ctx.fillStyle = C.netTape;
  ctx.fillRect(l, y - 1, r - l + 1, 1);
  for (let x = l; x <= r; x++) {
    for (let dy = 0; dy < 2; dy++) {
      ctx.fillStyle = (x + dy) % 2 ? C.netMesh : C.netDark;
      ctx.fillRect(x, y + dy, 1, 1);
    }
  }
  ctx.fillStyle = C.post;
  ctx.fillRect(l - 1, y - 2, 2, 4);
  ctx.fillRect(r, y - 2, 2, 4);
}
