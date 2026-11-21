import type { PieceId } from './model';

// Placeholder 16x18 sprites, drawn from character maps. Original art.
// v2 swaps these for real animated 16-bit sprites.
//   k outline  s skin  h hair  c shirt  C shirt shade
//   w shorts   W shorts shade  f shoes  r racket frame  n strings

const BACK = [
  '....kkkk........',
  '...khhhhk....rr.',
  '..khhhhhhk..rnnr',
  '..khhhhhhk..rnnr',
  '..khhhhhhk..rnnr',
  '..kshhhhsk...rr.',
  '...kssssk....r..',
  '.kcccccccck.r...',
  'ksccccccccsr....',
  'ksCccccccCsk....',
  '.kCccccccCk.....',
  '..kwwwwwwk......',
  '..kwwWWwwk......',
  '..kwwkkwwk......',
  '..ksk..ksk......',
  '..ksk..ksk......',
  '.kffk..kffk.....',
  '.kkkk..kkkk.....',
];

const FRONT = [
  '....kkkk........',
  '...khhhhk....rr.',
  '..khhhhhhk..rnnr',
  '..khsssshk..rnnr',
  '..kskssksk..rnnr',
  '..kssssssk...rr.',
  '...kssssk....r..',
  '.kcccccccck.r...',
  'ksccccccccsr....',
  'ksCccccccCsk....',
  '.kCccccccCk.....',
  '..kwwwwwwk......',
  '..kwwWWwwk......',
  '..kwwkkwwk......',
  '..ksk..ksk......',
  '..ksk..ksk......',
  '.kffk..kffk.....',
  '.kkkk..kkkk.....',
];

const BALL = ['.kkk.', 'kLyyk', 'kyyyk', 'kyyDk', '.kkk.'];

const BASE: Record<string, string> = {
  k: '#17121f',
  s: '#f2b886',
  w: '#f3f1e6',
  W: '#b9c0d4',
  f: '#f3f1e6',
  r: '#d9dbe6',
  n: '#7d8496',
  y: '#e6ef3a',
  L: '#fbffc4',
  D: '#a9b322',
};

/** Near team warm, far team cool. Partners differ by shade and hair. */
const TEAM: Record<Exclude<PieceId, 'ball'>, { c: string; C: string; h: string }> = {
  A1: { c: '#e8402c', C: '#a5231a', h: '#3b2417' },
  A2: { c: '#f08a24', C: '#b05a12', h: '#e8c04a' },
  B1: { c: '#3d8cf2', C: '#1f55b0', h: '#1c161e' },
  B2: { c: '#25c2bd', C: '#13827f', h: '#8c4a22' },
};

export interface Sprite {
  img: HTMLCanvasElement;
  /** Anchor (the feet) inside the image. */
  ax: number;
  ay: number;
}

function build(rows: string[], pal: Record<string, string>, flip: boolean): HTMLCanvasElement {
  const w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const x = c.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, i) => {
      const col = pal[ch];
      if (!col) return;
      x.fillStyle = col;
      x.fillRect(flip ? w - 1 - i : i, y, 1, 1);
    });
  });
  return c;
}

const cache = new Map<string, Sprite>();

export function playerSprite(id: Exclude<PieceId, 'ball'>): Sprite {
  let s = cache.get(id);
  if (!s) {
    const far = id[0] === 'B';
    const img = build(far ? FRONT : BACK, { ...BASE, ...TEAM[id] }, far);
    s = { img, ax: far ? 9 : 6, ay: 17 };
    cache.set(id, s);
  }
  return s;
}

export function ballSprite(): Sprite {
  let s = cache.get('ball');
  if (!s) {
    s = { img: build(BALL, BASE, false), ax: 2, ay: 2 };
    cache.set('ball', s);
  }
  return s;
}
