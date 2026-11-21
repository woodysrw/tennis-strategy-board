// Crisp 1px drawing helpers. Canvas lines antialias, so lines and
// ellipses are plotted pixel by pixel instead.

type Ctx = CanvasRenderingContext2D;

export function line(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  dash?: [on: number, off: number],
  size = 1,
): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let step = 0;
  ctx.fillStyle = color;
  for (;;) {
    if (!dash || step % (dash[0] + dash[1]) < dash[0]) ctx.fillRect(x0, y0, size, size);
    step++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export function fillEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

export function ringEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.fillStyle = color;
  const seen = new Set<string>();
  const steps = Math.ceil((rx + ry) * 4);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + rx * Math.cos(a));
    const y = Math.round(cy + ry * Math.sin(a));
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ctx.fillRect(x, y, 1, 1);
  }
}
