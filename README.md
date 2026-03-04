# Mini Game Engine + Flappy Clone

This project has two layers:

- `src/engine/core.js`: reusable mini engine (loop, input, entity/system model, collision helpers).
- `src/game/flappy.js`: game logic built on top of the engine (Flappy-style clone).

## Run

Double-click `index.html` to run.

Optional local server:

```bash
npx serve .
```

## Controls

- `Space` / `W` / `ArrowUp`
- mouse click on canvas
- touch on canvas

## Notes

- The gameplay is a logic clone only, with programmatic drawing.
- No original copyrighted art/audio assets are included.
