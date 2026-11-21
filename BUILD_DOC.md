# Tennis Strategy Board: Build Doc

## Goal
A web app for coaching tennis strategy on the fly. Set up singles or doubles players and the ball on a court, drag arrows out of them, hit Play, and they loop along those arrows. Chain frames into a sequence like slides and send it to a student as a link. Looks like a 90s Neo Geo arcade sports game, with original art.

**Who:** me, coaching students. Laptop and phone first, iPad comes free.
**Main use:** live in a lesson. Speed and ease beat features.
**Second use:** build a sequence, send it after the lesson.

## Core model
- **Frame:** where every piece starts, plus an optional arrow per piece. Loops on its own.
- **Sequence:** an ordered strip of frames. Each step is **auto** (plays straight on) or **click** (waits).
- **+ button:** new frame whose start positions are the previous frame's arrow tips. Arrows clear.
- **Mismatch:** if a frame doesn't start where the previous one ended, pieces slide to their new spots (~0.4s) before it plays.
- A single-frame demo is just a sequence of one frame.

```ts
type PieceId = 'A1' | 'A2' | 'B1' | 'B2' | 'ball'
type Vec = { x: number; y: number }          // court feet, origin at net center

type Frame = {
  start: Partial<Record<PieceId, Vec>>
  arrows: Partial<Record<PieceId, Vec>>    // arrow tip, absent = stays put
  advance: 'auto' | 'click'
}

type Sequence = { v: 1; mode: 'singles' | 'doubles'; frames: Frame[] }
```

**Rule:** everything is stored in court feet (78 × 36 ft). One `project(courtPos) → screenPos` function does the drawing. The v2 perspective camera only swaps that function.

## Stack
- **Vite + TypeScript, no framework.** One canvas does almost all of it. The tool panel is plain DOM styled as arcade HUD boxes.
- **Pixel rendering:** draw to a low-res offscreen canvas (around 384×216), scale up with `image-rendering: pixelated`.
- **Input:** Pointer Events, so mouse and touch share one code path.
- **Sharing:** the sequence goes in the URL hash: `#v1:<lz-string compressed JSON>`. No backend, no database. The hash never reaches the server.
- **Draft autosave:** current sequence in `localStorage` (wrapped in try/catch), so a page refresh mid-lesson loses nothing.
- **Hosting:** GitHub Pages, deployed by GitHub Actions on every push to `main`. Live at https://woodysrw.github.io/tennis-strategy-board/
- **Font:** a free pixel font (e.g. Press Start 2P from Google Fonts).

## Phases

### v1: the board works (~2 days) — built 2026-11-20, needs a real-phone test
Done when I can demo a 3-frame doubles point on my phone and text the link to a student.
1. Flat top-down court with grid lines, drawn from court-feet coordinates
2. Pieces: 2 or 4 players + ball, with shadows. Near team warm colors, far team cool colors. Placeholder sprites.
3. Drag a piece to move it. Drag its arrow handle to stretch an arrow.
4. Play / Pause: loop the current frame along its arrows (~1.2s, eased)
5. + button, frame strip with thumbnails, drag to reorder, delete, auto/click toggle per frame
6. Play All with slide-over on mismatched starts
7. HUD-style tool panel: Singles/Doubles, Play, +, Share, Reset. Shows "FRAME 2/5".
8. Share button copies the link. Opening a link loads the sequence in a view-only player with play, pause and step.
9. Pen: freehand drawing per frame in 4 colors (white, yellow, red, blue), with erase. Saved in the draft and share links.

### v2: it looks like the arcade (~2–3 days + sprite time)
1. Real 16-bit sprites: idle, run cycle, swing. One design, palette-swapped per team.
2. Perspective camera toggle (behind the baseline, slight tilt). Flat stays the default.
3. Lob arc: drag up on the ball's arrow to set height. Ball rises while its shadow follows the court.

### v3: polish (~1 day)
1. READY... PLAY! flash at sequence start
2. Chiptune blips on hit and bounce, with mute
3. Court surfaces: hard, clay, grass palettes
4. Ghost trails behind moving players
5. Save GIF / video from the canvas

## Open questions
- **Move vs arrow gesture:** v1 ships drag body = move, drag the dot = arrow (dot sits toward the net). Drop a dot back on its piece to delete the arrow. Revisit after using it in a lesson.
- **Ball handoff on +:** snap the ball to the nearest player automatically?
- **Sprites:** draw in Aseprite, buy an itch.io pack, or commission? Needed before v2.
- **Perspective on phone:** far-side players get small. Is a toggle enough, or do we need bigger hit areas?
- **Saved frame library:** reusing frames across sequences. Not in v1. Add if I miss it.

## Out of scope
- Accounts, a database, multiplayer editing
- Copying any real game's sprites, HUD or logos. Inspired-by only.
