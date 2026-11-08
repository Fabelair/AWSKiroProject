# Flappy Kiro – Requirements

Status: Draft v0.1
Companion document: `implementation-plan.md` (to be updated to match this document).

## 0. Vision

Flappy Kiro is a retro, endless-scroller browser game with a twist: the **gameplay is a protected contract**, and the **look and feel is fully replaceable by AI**.

- The **Core** (backend + side chat) owns the seed, the timeline of required button presses, the physics, input evaluation, scoring and game state. It is never modified by the AI.
- The **Frontend** is a swappable skin. Flappy Kiro (ghost and pipes) is the default. A user can ask an AI to replace it with anything (e.g. a Guitar Hero clone), and the required button presses stay exactly the same for a given seed.

Because the Core decides every outcome, no frontend can change the difficulty or the rules.

### 0.1 Key terms

| Term | Meaning |
|---|---|
| **Seed** | User-selectable value that fully determines the challenge. |
| **Timeline** | Ordered list of cues generated from the seed. |
| **Cue** | One required press: it has a window in time in which a press counts. |
| **Window** | Time range `[open, close]` (ms from run start) in which a press satisfies a cue. |
| **Core** | Protected part: engine, seed management, evaluation, side chat, sandbox host. |
| **Frontend** | AI-replaceable part: rendering, audio, UI layout, theme. |
| **Frontend API** | The only interface between Core and Frontend. |
| **Rulebook** | Versioned set of rules and constants the Core enforces and the AI is told to follow. |

### 0.2 Architecture overview

```
┌──────────────────────── Browser page (Core host) ─────────────────────────┐
│                                                                           │
│  ┌───────────── Side Chat ─────────────┐   ┌──── Sandboxed iframe ──────┐ │
│  │ user prompts  →  AI (user's own key)│   │  FRONTEND (AI-editable)    │ │
│  │ AI output = frontend files only     │──▶│  index.html / css / js     │ │
│  └──────────────┬──────────────────────┘   └───────▲────────┬───────────┘ │
│                 │ validate                          │ state  │ ready/ack   │
│  ┌──────────────▼──────────────────────────────────┴────────▼───────────┐ │
│  │ CORE ENGINE: seed → timeline, physics, input evaluation, scoring,    │ │
│  │ state machine, storage, frontend validator, version history          │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

Requirement IDs: `CORE-*` / `CHAT-*` for Part A, `FE-*` for Part B, `NFR-*` for cross-cutting. Each requirement uses "shall" and should be testable.

---

# PART A – Core (Backend) and Side Chat

The Core is **not modifiable by the AI**. In v1 the Core runs in the browser as a set of protected modules (no server is required). It must be designed with a clean boundary so it could move to a real server later.

## A1. Seed management

- **CORE-SEED-01** The Core shall accept a user-provided seed (string or integer, max 64 characters).
- **CORE-SEED-02** If no seed is provided, the Core shall generate a random seed and show it to the user.
- **CORE-SEED-03** The seed shall be visible at all times (in the Core UI, outside the frontend) and copyable.
- **CORE-SEED-04** The seed shall be settable by: a text field, a URL parameter (`?seed=...`), and a "new random seed" button.
- **CORE-SEED-05** Changing the seed shall be possible only when no run is in progress (READY or GAME_OVER state).
- **CORE-SEED-06** The seed shall be converted to a numeric state with a fixed, documented hash function (e.g. xmur3) and fed to a fixed, documented PRNG (e.g. mulberry32). The Core shall not use `Math.random()` for anything affecting the timeline.
- **CORE-SEED-07** A challenge shall be identified by `(rulebookVersion, seed)`. Same pair ⇒ identical timeline on any device and browser.
- **CORE-SEED-08** The Core shall let the user copy a share link containing seed and rulebook version.

## A2. Timeline generation

- **CORE-TL-01** The Core shall generate the timeline deterministically and lazily (infinite run), using only the seed and rulebook constants.
- **CORE-TL-02** Each cue shall contain at least: `id` (sequential integer), `openMs`, `targetMs`, `closeMs`, and `laneHint` (normalized 0–1 value describing vertical position of the gap, for frontends that want it).
- **CORE-TL-03** Cue spacing, window width and `laneHint` range shall come from the Rulebook constants and shall not be changeable by the user, the frontend or the AI.
- **CORE-TL-04** Every generated cue shall be reachable given the physics (CORE-PHYS-*), verified by a unit test over many seeds.
- **CORE-TL-05** The Core shall be able to produce the first N cues for a seed without running the game (for tests, previews and conformance checks).
- **CORE-TL-06** Timeline difficulty shall be constant, or follow a fixed ramp defined in the Rulebook (see open item OI-02). It shall never depend on the frontend.

## A3. Physics (reference simulation)

The Core runs the reference Flappy simulation, which is what makes the timeline meaningful.

- **CORE-PHYS-01** The simulation shall use a fixed timestep (e.g. 120 Hz) independent of display frame rate, with an accumulator in the game loop.
- **CORE-PHYS-02** The simulation shall use only deterministic arithmetic (`+ - * /`, comparisons). Avoid trigonometric and other functions that may differ across engines.
- **CORE-PHYS-03** Constants (gravity, flap impulse, pipe speed, pipe width, gap size, spawn interval, hit tolerance) shall live in one frozen `rulebook` constants module with a version number.
- **CORE-PHYS-04** On a press, the simulated ghost shall receive the flap impulse; otherwise gravity applies.
- **CORE-PHYS-05** The Core shall expose the simulated ghost position (normalized 0–1) and the pipe layout (normalized) to the frontend as optional render data. Frontends may use or ignore it, but it is read-only.
- **CORE-PHYS-06** Delta time shall be clamped; if the tab is hidden the run shall auto-pause.

## A4. Input handling and evaluation

- **CORE-IN-01** The Core host page (not the frontend) shall capture input: Space, ArrowUp, mouse click/pointer down, and touch. All map to a single `press` action.
- **CORE-IN-02** Each press shall be timestamped against the run clock by the Core.
- **CORE-IN-03** The Core shall evaluate each press against the timeline: a press inside a cue window satisfies it; a missed window or a collision in the reference simulation fails the run.
- **CORE-IN-04** Input evaluation shall be identical regardless of frontend. The frontend can not inject, delay, remove or alter presses.
- **CORE-IN-05** Auto-repeat from a held key shall be ignored (one press per key down).
- **CORE-IN-06** A short lockout (e.g. 400 ms) after GAME_OVER shall prevent accidental restarts.
- **CORE-IN-07** The Core shall record the full input trace (list of press timestamps) for every run, for replay and testing.

## A5. Scoring and run results

- **CORE-SC-01** Score shall increase by 1 for each cue successfully satisfied.
- **CORE-SC-02** The scoring formula shall be defined only in the Rulebook; frontends can display score but not compute it.
- **CORE-SC-03** High score shall be stored per `(rulebookVersion, seed)` and also as an overall best, in `localStorage`, with try/catch and validation, falling back to 0.
- **CORE-SC-04** The Core shall produce a run summary at game over: seed, rulebook version, score, fail cue id, run duration, input trace.

## A6. Game state machine

- **CORE-ST-01** States: `READY → PLAYING → GAME_OVER → READY`. Other transitions shall be ignored.
- **CORE-ST-02** `PAUSED` is allowed from `PLAYING` (tab hidden or pause key) and resumes to `PLAYING`, restoring the exact simulation state.
- **CORE-ST-03** State changes shall be published to the frontend through the Frontend API.

## A7. Frontend API (the contract)

The Frontend API is the **only** channel between Core and Frontend, implemented with `postMessage` between the host page and the sandboxed iframe. It is versioned (`apiVersion`) and fully documented in `docs/frontend-api.md` (to be written).

**Core → Frontend (events and state):**

| Message | Payload |
|---|---|
| `init` | `apiVersion`, `rulebookVersion`, canvas size, seed |
| `state` | game state (`READY`/`PLAYING`/`PAUSED`/`GAME_OVER`) |
| `tick` | run time (ms), score, high score, ghost position, upcoming cues (id, openMs, targetMs, closeMs, laneHint) for at least the next N seconds, pipe layout |
| `cueResult` | cue id, `hit` or `miss`, offset in ms from target |
| `press` | timestamp (echo, so frontends can animate flaps) |
| `gameOver` | run summary |

**Frontend → Core:**

| Message | Payload |
|---|---|
| `ready` | frontend name, version, supported API version |
| `error` | optional diagnostic text |

- **CORE-API-01** The API shall expose enough lookahead (upcoming cues for at least 3 seconds) so a frontend can always warn the player in advance.
- **CORE-API-02** The Frontend can not send messages that change state, seed, score, timing or input. Any unknown message shall be ignored.
- **CORE-API-03** The API shall be backward compatible within a major `apiVersion`; a frontend declaring an unsupported version shall be rejected with a clear message.
- **CORE-API-04** All payload times shall be in ms relative to run start, so frontends never need wall-clock time.

## A8. Frontend sandbox and validation

- **CORE-SBX-01** The Frontend shall run in an `<iframe sandbox="allow-scripts">` (no `allow-same-origin`), so it cannot access the parent DOM, `localStorage`, or Core objects.
- **CORE-SBX-02** The iframe shall be served with a strict Content Security Policy: no network access (`connect-src 'none'`), no external scripts, images or fonts; assets must be inline or bundled (data URIs, canvas drawing).
- **CORE-SBX-03** Before loading any AI-generated frontend, the Core shall run a validator:
  1. Static checks: the bundle only contains allowed file types (HTML, CSS, JS, images, audio as data URIs); no `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `new Function`, `import()` of remote URLs, or `parent`/`top` access.
  2. Size limit (e.g. 2 MB total).
  3. Load test in a hidden iframe: sends `ready` within 3 s, throws no uncaught errors during a scripted test run.
  4. Contract test: replays standard seeds and input traces, and checks that the frontend receives all events and keeps up (no frame stalls above a threshold).
- **CORE-SBX-04** If validation fails, the new frontend shall not be activated; the previous working frontend stays and the user sees the reasons.
- **CORE-SBX-05** A "Restore default Flappy Kiro" button shall always be available in the Core UI and shall work even if the active frontend is broken or frozen.
- **CORE-SBX-06** A watchdog shall detect an unresponsive frontend (no `ready`, or exceptions repeatedly) and fall back to the last good version automatically.

## A9. Conformance (what "same gameplay" means)

- **CORE-CF-01** Because the Core decides every outcome, conformance is guaranteed by construction. Tests shall still verify it: a set of recorded input traces (perfect, late, early, spam, idle) on several seeds shall produce identical run summaries regardless of which frontend is loaded (default, test stub frontend, headless frontend).
- **CORE-CF-02** A reference test frontend that renders nothing shall exist; it is used by the test suite to prove the Core runs headless.
- **CORE-CF-03** The Core shall support deterministic replay: feeding a stored input trace and seed shall reproduce the same summary.
- **CORE-CF-04** Playability rule for frontends (checked best-effort by the validator, and stated in the AI instructions): every cue shall be visibly or audibly signaled to the player at least 1000 ms before its window opens, and the frontend shall show current score.

## A10. Version history

- **CORE-VER-01** Each accepted frontend (default or AI-made) is stored locally as a version with: id, timestamp, prompt that created it, and bundle.
- **CORE-VER-02** The user can list, preview, activate, rename, delete, export and import versions.
- **CORE-VER-03** The default Flappy Kiro frontend ships with the app and can not be deleted or overwritten.
- **CORE-VER-04** Storage failures (quota) shall be handled gracefully with a clear message.

## A11. Side chat

A chat panel next to the game where the user describes changes in natural language.

- **CHAT-01** The chat shall be part of the Core host page, outside the sandboxed iframe, and not modifiable by the AI.
- **CHAT-02** The user shall provide their own API key (bring your own key). The chat shall support at least one provider in v1 behind a provider interface so more can be added.
- **CHAT-03** The key shall be stored only in the user's browser (session storage by default; local storage only if the user opts in), never sent anywhere except directly to the chosen provider, never logged, and never exposed to the iframe.
- **CHAT-04** The chat shall work without a key for everything except AI generation (the game remains fully playable).
- **CHAT-05** The AI shall receive a system prompt built by the Core containing: the Rulebook, the Frontend API documentation, the sandbox restrictions, the output format, and the playability rule (CORE-CF-04). It shall be told explicitly that it can only produce frontend files.
- **CHAT-06** The AI output format shall be a defined bundle (file names and contents, e.g. JSON or fenced blocks). The Core shall parse it strictly; anything outside the format is ignored.
- **CHAT-07** The AI shall not be given the ability to edit, or even receive in an editable form, the Core code. Requests to change rules, difficulty, timing, scoring, seed handling or input (e.g. "make the gap bigger", "make it easier") shall be declined with an explanation, ideally offering a visual alternative.
- **CHAT-08** Flow per request: user prompt → AI generates bundle → validator (A8) → preview in the iframe → user chooses **Keep** or **Discard**. Kept bundles become a new version (CORE-VER-01).
- **CHAT-09** If validation fails, the chat shall send the error list back to the AI for up to 2 automatic retries, then show the failure to the user.
- **CHAT-10** The chat shall support iterating on the current frontend ("make the notes bigger") by sending the current bundle with the prompt.
- **CHAT-11** The chat shall show progress, errors (invalid key, rate limit, network) and a cancel button.
- **CHAT-12** Chat history shall be stored locally and clearable; the key shall never be part of any exported data.
- **CHAT-13** Example prompts shall be offered (e.g. "Guitar Hero style", "night theme", "underwater with fish").
- **CHAT-14** The Core UI (seed field, chat, version list, restore button) shall have a fixed layout that the Frontend can not cover, resize or hide.

## A12. Core non-functional requirements

- **NFR-CORE-01** Core logic modules (seed, timeline, physics, evaluation, scoring, state machine) shall be pure and rendering-free, so they run headless in Node for tests.
- **NFR-CORE-02** Constants are frozen (`Object.freeze`) and a unit test shall fail if a constant changes without a rulebook version bump.
- **NFR-CORE-03** Unit tests (Vitest or `node:test`) shall cover: seed→timeline determinism over many seeds, reachability, evaluation edge cases (press at window boundaries), scoring, high score storage fallback, state transitions, trace replay, validator rejections.
- **NFR-CORE-04** Code shall follow the quality guidelines (section 6 of `implementation-plan.md`): readable names, no magic numbers, JSDoc, ESLint/Prettier, logic separate from rendering.
- **NFR-CORE-05** Core simulation shall use under 2 ms per frame on a typical laptop.
- **NFR-CORE-06** No third-party runtime dependencies in the Core where avoidable; pinned versions otherwise.

---

# PART B – Default Frontend (AI-editable)

The default Frontend ("Flappy Kiro skin") is the starting point shipped to the user. This is the **only** part the AI may change. It talks to the Core exclusively through the Frontend API (A7).

## B1. Allowed and forbidden changes

**The AI may change:** all visuals, characters, backgrounds, animations, colors, fonts, sounds, music, layout inside the game canvas, HUD design, screen text, effects and optional purely cosmetic features.

**The AI may not (and technically can not):** change seed, timeline, physics, hit windows, scoring, input mapping or evaluation, game state, storage, or anything in the Core UI.

- **FE-RULE-01** The Frontend shall treat all Core data as read-only.
- **FE-RULE-02** The Frontend shall render purely from Core messages, never computing its own pass/fail or score logic.
- **FE-RULE-03** Visual feedback shall match Core outcomes (a `hit` is never shown as a miss, and vice versa).
- **FE-RULE-04** The Frontend shall not hide or obscure cues from the player (see FE-PLAY-01).

## B2. Default look (Flappy Kiro) – based on the reference screenshot

- **FE-VIS-01** Canvas with 4:3 logical size (1024×768), scaled to fit the available space, with a thin dark border.
- **FE-VIS-02** Background sky blue (~`#87CEEB`).
- **FE-VIS-03** Clouds: white rounded pills of varied size, drifting left slowly (parallax), wrapping around.
- **FE-VIS-04** Pipes: green body (~`#2E7D32`) with a wider darker cap (~`#1B5E20`), a top and a bottom pipe per cue, positioned from the cue/pipe layout supplied by the Core.
- **FE-VIS-05** Ghost: white body with a wavy bottom edge and two small black eyes, at about 25% of canvas width, vertical position from the Core's ghost position. Optional small tilt based on velocity.
- **FE-VIS-06** HUD: text `Score: N | High: N`, white with soft shadow, centered at the bottom.
- **FE-VIS-07** All art is drawn with canvas primitives (no external assets), so the default frontend has zero network needs.

## B3. Screens and feedback

- **FE-SCR-01** READY: ghost hovering gently, text such as "Press Space to start".
- **FE-SCR-02** PLAYING: scrolling pipes and clouds, live HUD.
- **FE-SCR-03** PAUSED: dimmed canvas with "Paused".
- **FE-SCR-04** GAME_OVER: overlay with "Game Over", final score, high score, seed, and "Press Space to restart" (shown after the Core lockout ends).
- **FE-SCR-05** Optional: small flap animation on `press`, brief score pop on `cueResult` hit.
- **FE-SCR-06** Optional sound (flap, score, hit) with a mute control inside the frontend; audio must be bundled (data URI) and off by default until the first user interaction.

## B4. Playability requirements (apply to any AI-made frontend too)

- **FE-PLAY-01** Every upcoming cue shall be clearly signaled at least 1000 ms before its window opens (default: pipes appear from the right edge and are visible for well over 1 s).
- **FE-PLAY-02** The target moment of each cue shall be visually or audibly identifiable (default: the gap passing the ghost).
- **FE-PLAY-03** The current score shall always be visible.
- **FE-PLAY-04** The frontend shall show `hit`/`miss` feedback within 100 ms of `cueResult`.
- **FE-PLAY-05** The frontend shall render at a steady 60 FPS on a typical laptop, and use `requestAnimationFrame` with interpolation between `tick` messages.
- **FE-PLAY-06** The frontend shall be readable: sufficient text contrast and no flashing effects above 3 flashes per second (photosensitivity safety).

## B5. Technical requirements for the frontend bundle

- **FE-TECH-01** Plain HTML, CSS and JavaScript only; no build step; no external network resources.
- **FE-TECH-02** Entry point `index.html`, which sends `ready` on load and handles every Core→Frontend message type from A7.
- **FE-TECH-03** Unknown or missing optional fields in messages shall be tolerated (forward compatibility).
- **FE-TECH-04** Total bundle under the size limit (CORE-SBX-03).
- **FE-TECH-05** The frontend shall handle resizing and high-DPI (`devicePixelRatio`) rendering.
- **FE-TECH-06** The frontend shall not store data or access browser storage (not available in the sandbox anyway).
- **FE-TECH-07** Code quality: readable, commented, constants named; the AI instructions shall ask for this, so users can learn from and edit their frontends.

## B6. Example reskin (acceptance scenario)

"Guitar Hero" skin generated by AI from the prompt *"make it a Guitar Hero style game"*:
- Cues appear as notes moving down a highway; the target line is the moment `targetMs`.
- Pressing Space plays a guitar sound; `hit` shows a spark, `miss` shows a muted string.
- Score and seed are displayed.
- For the same seed and the same input trace, the run summary (score, fail cue, duration) is **identical** to the one from the default Flappy Kiro skin.

---

# PART C – Cross-cutting

## C1. Acceptance criteria

- [ ] For any seed, two different frontends produce identical run summaries for the same input trace.
- [ ] The same seed gives the same timeline after reload, on another browser, and on another device.
- [ ] The user can set a seed via text field and URL, and see/copy it at all times.
- [ ] The AI can generate a new frontend through the chat using the user's own key, and the frontend can be kept, discarded and rolled back.
- [ ] Requests to alter difficulty or rules are declined, and no mechanism exists for the frontend to change them.
- [ ] A malicious or broken AI frontend (network call, infinite loop, parent access, crash) is blocked or recovered from, and the default can always be restored.
- [ ] The default frontend matches the reference screenshot style.
- [ ] The game stays playable without any API key.

## C2. Security and privacy summary

- AI-generated code only ever runs inside the sandboxed, network-less iframe.
- API keys never reach the iframe, logs, exports, or any server other than the chosen provider.
- No user data leaves the browser except prompts (and the current frontend bundle) sent to the chosen AI provider; the UI shall tell the user this before first use.

## C3. Out of scope for v1

- Online leaderboards and accounts (a future extension, which would make the Core a real server).
- Multiplayer.
- AI changing anything in the Core, including difficulty presets.
- Mobile app packaging.

## C4. Open items

| ID | Question |
|---|---|
| OI-01 | Which AI provider is first supported (Anthropic, OpenAI, Gemini, Amazon Bedrock, OpenRouter)? |
| OI-02 | Constant difficulty or a fixed ramp defined in the Rulebook? |
| OI-03 | Exact hit-window width and flap-to-gap reachability rules (tune by playtesting). |
| OI-04 | Should the Core stay browser-only, or be an actual server in v1 (relevant for future leaderboards)? |
| OI-05 | Bundle format the AI returns (single JSON vs. fenced files) and how strictly to enforce it. |
| OI-06 | How to best check the "cue signaled ≥1000 ms ahead" rule automatically (static hints vs. headless rendering checks). |
| OI-07 | Reference tolerance for display/audio latency in rhythm-style skins. |

## C5. Suggested build order (to be merged into the implementation plan)

1. Core: rulebook constants, seeded RNG, timeline generator, headless tests.
2. Core: fixed-timestep physics, input evaluation, scoring, state machine, replay.
3. Core host page + Frontend API + sandboxed iframe + test stub frontend.
4. Default Flappy Kiro frontend (Part B).
5. Seed UI, high score storage, share link.
6. Frontend validator and watchdog, restore default.
7. Version history.
8. Side chat with bring-your-own-key provider, prompt builder, retry loop.
9. Polish, accessibility, cross-browser testing, deployment (GitHub Pages).
