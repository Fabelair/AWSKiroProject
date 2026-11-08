# Flappy Kiro – Implementation Plan

A retro, endless-scroller browser game. The player guides a small white ghost through gaps in green pipes. Visual reference: the provided screenshot (sky-blue background, white pill-shaped clouds, green pipes with darker caps, white ghost with two black eyes, "Score: N | High: N" text at bottom center).

## 1. Goals and Scope

- Runs entirely in the browser, no backend, no build step required.
- Plain HTML + CSS + JavaScript using the Canvas 2D API.
- Single-player, endless, one-button control (Space / click / tap).
- Persist the high score locally.

**Out of scope (for v1):** online leaderboards, accounts, multiplayer, level editor.

## 2. Tech Choices

| Area | Choice | Reason |
|---|---|---|
| Rendering | HTML5 `<canvas>` 2D | Simple, fast enough, matches retro look |
| Language | Vanilla JavaScript (ES modules) | No tooling needed |
| Storage | `localStorage` | High score persistence |
| Assets | Drawn with canvas primitives (optionally a ghost sprite PNG) | Zero external dependencies |
| Hosting | Any static server / GitHub Pages | Static files only |

## 3. Proposed Project Structure

```
AWSKiroProject/
├── docs/
│   └── implementation-plan.md
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js        # bootstrap, game loop
│   ├── game.js        # state machine, orchestration
│   ├── ghost.js       # player entity
│   ├── pipes.js       # pipe spawning/movement
│   ├── clouds.js      # background parallax
│   ├── input.js       # keyboard/mouse/touch
│   ├── renderer.js    # all drawing code
│   ├── storage.js     # high score read/write
│   ├── utils.js       # pure helpers (clamp, rectsOverlap, random)
│   └── config.js      # tunable constants
└── README.md
```

## 4. Game Design Spec

**Canvas:** 4:3 ratio, logical size 1024×768 (scaled to fit the window via CSS).

**Visual elements (from screenshot):**
- Background: sky blue (~`#87CEEB`).
- Clouds: white rounded rectangles (pills), varying sizes, drifting slowly left (parallax).
- Pipes: body green (~`#2E7D32`), wider cap in darker green (~`#1B5E20`); top and bottom pipes with a vertical gap.
- Ghost: white blob with a wavy bottom edge and two small black eyes, positioned at ~25% of canvas width.
- HUD: `Score: N | High: N`, white text with soft shadow, bottom center.
- Thin dark border around the canvas.

**Mechanics:**
- Gravity pulls the ghost down constantly; flap gives an upward velocity impulse.
- Pipes spawn at the right edge at fixed horizontal intervals with a random gap height position, move left at constant speed.
- Score +1 each time the ghost fully passes a pipe pair.
- Game over on collision with a pipe, the floor, or the ceiling.
- Optional: speed slowly increases with score.

**Starting tunables (in `config.js`, to be tuned by play-testing):**
- gravity ≈ 1800 px/s², flap impulse ≈ -520 px/s
- pipe speed ≈ 200 px/s, pipe width ≈ 76 px
- gap ≈ 200 px, spawn interval ≈ 1.6 s
- ghost hitbox slightly smaller than sprite (forgiving)

**Game states:** `READY` → `PLAYING` → `GAME_OVER` → (input) → `READY`.

## 5. Implementation Steps

### Step 1 – Project scaffold
- Create `index.html` with a centered `<canvas>`, `css/style.css`, and `js/main.js` loaded as a module.
- Add `README.md` with how to run (open file or `python3 -m http.server`).
- **Done when:** page loads and shows an empty sky-blue canvas.

### Step 2 – Game loop and config
- `requestAnimationFrame` loop with delta-time (clamped, e.g. max 50 ms) so physics is frame-rate independent.
- Create `config.js` with all constants.
- **Done when:** loop runs and logs/updates a frame counter.

### Step 3 – Input handling
- `input.js`: Space/ArrowUp, mouse click, touch → single "flap" event. Prevent page scroll on Space.
- **Done when:** flap events fire from all three input types.

### Step 4 – Ghost entity
- Position, velocity, gravity, flap impulse, small tilt/bob optional.
- Draw ghost (white body, wavy bottom, two black eyes) in `renderer.js`.
- **Done when:** ghost falls and flaps on input.

### Step 5 – Pipes
- Spawner with random gap position (keep margins from top/bottom), movement, off-screen cleanup.
- Draw pipe body + darker cap, top (flipped) and bottom.
- **Done when:** endless stream of pipes scrolls smoothly.

### Step 6 – Collision and scoring
- AABB collision vs. pipes, floor and ceiling.
- Score increments when ghost passes a pipe (flag each pipe once).
- **Done when:** collisions end the run; score increases correctly.

### Step 7 – Clouds and background
- Pill-shaped clouds at random heights/sizes, slower than pipes, wrapping around.
- **Done when:** parallax background matches the screenshot style.

### Step 8 – HUD and persistence
- Render `Score: N | High: N` bottom center with text shadow.
- `storage.js`: load/save high score in `localStorage` (guard with try/catch).
- **Done when:** high score survives page reloads.

### Step 9 – State machine and screens
- READY: "Press Space to start" prompt, ghost hovering.
- GAME_OVER: "Game Over" overlay, final score, "Press Space to restart".
- Short input lockout after death to avoid accidental restart.
- **Done when:** full play → die → restart cycle works.

### Step 10 – Polish (optional)
- Sound effects (flap, score, hit) with a mute toggle; pause on `P`/tab blur.
- Responsive scaling and high-DPI (`devicePixelRatio`) crisp rendering.
- Slight difficulty ramp.

### Step 11 – Testing and QA
- Manual checklist: all input types, collision edges, restart, high score persistence, resize, tab switching.
- Test in Chrome, Firefox, Safari, and mobile browsers.
- Optional: unit tests for pure logic (collision, scoring) with a lightweight runner.

### Step 12 – Deployment
- Publish via GitHub Pages (static files from the main branch).
- Add a screenshot and play link to `README.md`.

## 6. Code Quality Guidelines

### Readability
- Use clear, descriptive names (`spawnPipePair`, `isColliding`), not abbreviations or single letters.
- Keep functions short and single-purpose (aim for under ~30 lines); avoid deep nesting by using early returns.
- No magic numbers: every tunable value (gravity, gap size, speeds, colors, sizes) lives in `config.js` with a descriptive name and a unit comment (e.g. `// px/s`).
- Use JSDoc comments on public functions and classes; comment *why*, not *what*.
- Consistent style enforced by tooling: ESLint + Prettier (2-space indent, semicolons, single quotes, `const`/`let` only).
- One module per responsibility, with named exports and a short header comment describing its purpose.

### Reusability
- Separate **logic** (update/physics/collision/score) from **rendering** (canvas drawing). Entities hold state and `update(dt)`; `renderer.js` draws them. This allows reuse and headless testing.
- Make pure helpers (e.g. `rectsOverlap`, `clamp`, `randomRange`) in a small `utils.js` and reuse them across entities.
- Entities take their dependencies and configuration through constructor parameters rather than reading globals, so they can be reused with different settings (e.g. difficulty presets).
- Use a small input abstraction that emits events (`onFlap`) so new input sources (gamepad) can be added without changing game logic.
- Drawing helpers (`drawPill`, `drawPipe`, `drawGhost`) are generic and parameterized by position/size/color.

### Durability (robustness and maintainability)
- **Frame-rate independence:** all movement uses delta time, clamped to avoid huge jumps after tab switches.
- **Defensive storage:** wrap `localStorage` access in try/catch (private mode or disabled storage) and validate parsed values; fall back to 0.
- **Safe state transitions:** the state machine only permits valid transitions (`READY → PLAYING → GAME_OVER → READY`); invalid inputs are ignored.
- **No leaks:** clean up off-screen pipes/clouds; register and remove event listeners in clear `start()`/`stop()` methods.
- **Graceful degradation:** show a friendly message if canvas 2D is unsupported; pause when the tab loses focus.
- **Guaranteed passable gaps:** the spawner clamps gap position so consecutive pipes are always reachable given the physics config.
- **Deterministic logic:** allow an injectable random function (seedable) so tests and bug reproductions are repeatable.
- **Tests:** unit tests for pure logic (collision, scoring, spawner bounds, storage fallback) using a lightweight runner (e.g. Vitest or Node's built-in `node:test`).
- **Tooling and CI:** lint and test run on every push via GitHub Actions; keep dependencies minimal and pinned.
- **Documentation:** keep `README.md` current (run, test, tune) and record notable decisions in `docs/`.

### Definition of Done (per step)
- [ ] Code follows the readability rules and passes lint/format checks.
- [ ] Logic is separated from rendering and has no hidden globals.
- [ ] Edge cases handled (resize, tab blur, storage failure).
- [ ] Unit tests added for any new pure logic and passing.
- [ ] Manually verified in the browser.

## 7. Acceptance Criteria

- [ ] Looks recognizably like the reference screenshot.
- [ ] Ghost flaps on Space, click, and touch.
- [ ] Pipes spawn endlessly with random gaps; all gaps are passable.
- [ ] Collision with pipe/floor/ceiling ends the game.
- [ ] Score and persisted high score are shown in the HUD.
- [ ] Game can be restarted without reloading the page.
- [ ] Runs at a steady 60 FPS on a typical laptop.

## 8. Risks and Open Questions

- Ghost art: draw with canvas paths, or supply a sprite? (Default: canvas paths.)
- Should difficulty increase over time, or stay constant?
- Sound: include or skip for v1?
- Target devices: desktop-only or also mobile touch?
