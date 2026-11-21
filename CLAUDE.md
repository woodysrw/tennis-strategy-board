# tennis-strategy-board

A web app for coaching tennis strategy: drag players and the ball, draw arrows, loop the motion, chain frames into a sequence, share as a link. 90s Neo Geo arcade look with original art. See BUILD_DOC.md for goals, phases and open questions.

## Stack
Vite + TypeScript, no framework. Canvas for the court, plain DOM for the tool panel. Static hosting, no backend.

## Commands
- `npm run dev`: dev server on http://localhost:5173
- `npm run build`: typecheck + static build to `dist/`

## Layout
- `src/model.ts`: data model, mode switching, cascade, validation
- `src/court.ts`: buffer size, `toScreen`/`toCourt`, court drawing
- `src/render.ts`: scene drawing, arrow handles, hit testing
- `src/playback.ts`: timed segments (hold, slide, motion, gate) that loop
- `src/share.ts`: `#v1:` link encode/decode
- `src/main.ts`: app state, input, frame strip, panel, layout

## Rules
- Store all positions in court feet (78 × 36, origin at net center). Only `project()` converts to screen space.
- Render to a low-res offscreen canvas and scale up pixelated. No smoothing.
- Pointer Events only, so mouse and touch share one path. Test on a phone-width viewport.
- Share links are `#v<N>:<lz-string JSON>`. Bump the version on any format change and keep old versions loadable.
- Wrap every `localStorage` access in try/catch.
- Original sprites and art only. Never copy assets from real games.
- Speed of use in a live lesson beats features. Every common action should be one drag or one tap.
