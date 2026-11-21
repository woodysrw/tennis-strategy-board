// Tiny 8x8 pixel icons, drawn as SVG paths.
const PATHS: Record<string, string> = {
  play: 'M2 1L7 4L2 7Z',
  playAll: 'M0 1L4 4L0 7ZM4 1L8 4L4 7Z',
  stop: 'M1 1H7V7H1Z',
  pause: 'M1 1H3V7H1ZM5 1H7V7H5Z',
  undo: 'M0 3L3 0V2H7V7H5V4H3V6Z',
  clear: 'M1 0L4 3L7 0L8 1L5 4L8 7L7 8L4 5L1 8L0 7L3 4L0 1Z',
  delete: 'M1 1H7V2H1ZM3 0H5V1H3ZM2 3H6V8H2Z',
  share: 'M4 0L7 3H5V5H3V3H1ZM0 5H1V7H7V5H8V8H0Z',
  add: 'M3 0H5V3H8V5H5V8H3V5H0V3H3Z',
  new: 'M1 0H5L7 2V8H1ZM2 1V7H6V3H4V1Z',
  prev: 'M5 1L2 4L5 7Z',
  next: 'M3 1L6 4L3 7Z',
  edit: 'M5 0L8 3L3 8H0V5Z',
  pen: 'M6 0L8 2L3 7L0 8L1 5Z',
  eraseInk: 'M5 0L8 3L4 7H8V8H2L0 6Z',
  singles: 'M3 0H5V2H3ZM2 3H6V5H2ZM3 5H5V8H3Z',
  doubles: 'M1 0H3V2H1ZM0 3H4V5H0ZM1 5H3V8H1ZM5 0H7V2H5ZM4 3H8V5H4ZM5 5H7V8H5Z',
};

export const icon = (name: string) =>
  `<svg viewBox="0 0 8 8" aria-hidden="true" focusable="false"><path d="${PATHS[name] ?? ''}"/></svg>`;
