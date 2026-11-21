import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { sanitize, type Positions, type Sequence } from './model';

// A shared play lives entirely in the URL hash: #v1:<compressed JSON>.
// The hash never reaches a server, so there is no backend to run.
// If the format changes, add a v2 decoder and keep v1 links loading.

const round = (p: Positions): Positions => {
  const out: Positions = {};
  for (const [id, v] of Object.entries(p)) {
    if (v) out[id as keyof Positions] = { x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10 };
  }
  return out;
};

export function encodeSeq(seq: Sequence): string {
  const slim = {
    m: seq.mode === 'singles' ? 's' : 'd',
    f: seq.frames.map((f) => ({
      s: round(f.start),
      a: round(f.arrows),
      w: f.advance === 'click' ? 1 : 0,
      ...(f.ink?.length ? { i: f.ink.map((s) => ({ c: s.c, p: s.p.map((n) => Math.round(n * 10) / 10) })) } : {}),
    })),
  };
  return 'v1:' + compressToEncodedURIComponent(JSON.stringify(slim));
}

export function decodeSeq(hash: string): Sequence | null {
  const m = /^#?v1:(.+)$/.exec(hash);
  if (!m) return null;
  try {
    const raw = JSON.parse(decompressFromEncodedURIComponent(m[1]) || 'null');
    if (!raw || !Array.isArray(raw.f)) return null;
    return sanitize({
      v: 1,
      mode: raw.m === 's' ? 'singles' : 'doubles',
      frames: raw.f.map((f: { s?: unknown; a?: unknown; w?: unknown; i?: unknown }) => ({
        start: f?.s,
        arrows: f?.a,
        advance: f?.w ? 'click' : 'auto',
        ink: f?.i,
      })),
    });
  } catch {
    return null;
  }
}
