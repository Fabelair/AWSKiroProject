# Traceability: requirements -> implementation -> verification

Legend: **Done** = implemented and checked by an automated test (`npm test`) and/or by driving the real page in headless Chromium. **Partial** / **Not done** are explained honestly. "Browser check" means I ran it in headless Chromium against the real page; those checks are not in the repo as automated tests (only the in-page **Self-test** button is).

## Part A – Core

| Requirement | Status | Where | Verified by |
|---|---|---|---|
| CORE-SEED-01..08 seed text field, URL `?seed=`, random, always visible, copy link, locked during a run, fixed hash + PRNG, `(rulebookVersion, seed)` identity | Done | `core/seed.js`, `core/rng.js`, `core/engine.js`, `main.js` | `rulebook-seed.test.js`, `engine.test.js`; browser check: set seed, URL updated, seed box locked while playing |
| CORE-TL-01..06 deterministic lazy timeline, cue fields, reachable by construction, constant difficulty | Done | `core/timeline.js` | `timeline-simulation.test.js` (40 seeds x 200 cues perfect play passes; golden values) |
| CORE-PHYS-01..06 fixed step, deterministic arithmetic, frozen constants, read-only render data, delta clamp, auto-pause | Done | `core/physics.js`, `core/rulebook.js`, `core/engine.js` | `engine.test.js`, `rulebook-seed.test.js` (hash guard) |
| CORE-IN-01..07 input on the host page, timestamped by tick, identical for every frontend, held keys once, lockout, trace | Done | `input.js`, `core/simulation.js`, `core/engine.js` | `timeline-simulation.test.js`, `engine.test.js`, `conformance.test.js`; browser check: Space starts a run, typing in the seed box does not flap |
| CORE-SC-01..04 score, formula only in the Rulebook, high score per seed + overall in `localStorage` with fallback, run summary | Done | `core/simulation.js`, `core/storage.js` | `engine.test.js` (persistence, broken/corrupt storage) |
| CORE-ST-01..03 state machine, pause, state events | Done | `core/engine.js` | `engine.test.js` |
| CORE-API-01..04 Frontend API, lookahead, whitelist, version check, run-relative times | Done | `core/api.js`, `core/bridge.js` | `bridge-api.test.js`, `engine.test.js` |
| CORE-SBX-01 sandboxed iframe | Done | `core/sandbox.js` | browser check: `contentDocument` blocked, `sandbox="allow-scripts"` |
| CORE-SBX-02 CSP without network | Done | `core/sandbox.js` | `validator-sandbox.test.js`; browser check: a frontend using obfuscated `fetch` and an image to an external host was blocked by the CSP (console shows the violations) |
| CORE-SBX-03 validator: static checks, size, load test, contract test | Partial | `core/validator.js`, `core/loadtest.js` | `validator-sandbox.test.js`; Self-test. The "contract test" is a 2.5 s scripted run that checks for `ready` within 3 s, no runtime errors and heartbeats. It does **not** measure frame stalls. |
| CORE-SBX-04 failed validation keeps the previous frontend | Done | `chat/controller.js`, `main.js` | `chat.test.js` |
| CORE-SBX-05 Restore default always available | Done | `main.js` | browser check |
| CORE-SBX-06 watchdog and fallback to last good | Done, with a limit | `core/watchdog.js`, `main.js` | `bridge-api.test.js`; browser check: a frontend that never calls `ready` triggers the fallback. A frontend that blocks the browser's main thread forever cannot be interrupted by any page script. |
| CORE-CF-01 identical summaries across frontends | Done | `tests/conformance.test.js` | 3 seeds x 7 traces (perfect, idle, spam, late, early, jittery, dropout) x {no frontend, default, guitar, themed, hostile} |
| CORE-CF-02 headless run | Done | whole `src/core` | `conformance.test.js` runs with no `document`/`window` |
| CORE-CF-03 deterministic replay | Done | `core/simulation.js` `replay()` | `timeline-simulation.test.js` |
| CORE-CF-04 cue signalled >= 1000 ms ahead | Partial | `core/engine.js` snapshot (4000 ms lookahead) | `engine.test.js` proves the Core *supplies* every cue 1000+ ms ahead (cue 0 is shown in READY). Whether an AI skin actually *shows* it is only requested in the AI prompt and the docs; there is no automatic check (open item OI-06). |
| CORE-VER-01..04 version history, default protected, export/import, storage errors | Done | `core/versions.js`, `main.js` | `versions.test.js`; browser check: keep, reload, restore |
| CHAT-01 chat outside the iframe, not AI-editable | Done | `main.js` | by design; AI output only becomes an iframe bundle |
| CHAT-02 bring your own key, provider interface | Done | `chat/providers.js` | `chat.test.js` with a fake `fetch`. **Not tested against a real provider** (no key available here). |
| CHAT-03 key handling | Done | `main.js` | key is kept in session storage by default, local storage only with *remember*, only sent to the provider URL (`chat.test.js`), never placed in exports (`versions.test.js`) |
| CHAT-04 playable without a key; offline demo provider | Done | `chat/providers.js` | `chat.test.js`; browser check |
| CHAT-05..06 system prompt, strict output format | Done | `chat/prompt.js`, `chat/parser.js` | `chat.test.js` |
| CHAT-07 decline rule-changing requests | Done (heuristic + prompt) | `chat/guard.js` | `chat.test.js` (16 declined, 8 visual requests allowed). The guard is a keyword heuristic; it can miss unusual wording, in which case the AI is still told to decline and the Core still enforces the rules. |
| CHAT-08 prompt -> validate -> preview -> keep/discard | Done | `main.js`, `chat/controller.js` | browser check |
| CHAT-09 two automatic retries with errors | Done | `chat/controller.js` | `chat.test.js` |
| CHAT-10 iterate on current frontend | Done | `chat/prompt.js` | `chat.test.js` |
| CHAT-11 progress, errors, cancel | Done | `main.js`, `chat/providers.js` | `chat.test.js` |
| CHAT-12 chat history stored and clearable | **Not done** | | The log lives only in memory; a reload clears it. |
| CHAT-13 example prompts | Done | `main.js` | browser check |
| CHAT-14 fixed Core UI the frontend cannot cover | Done | `css/style.css` | the frontend lives in a clipped, fixed-aspect box |
| NFR-CORE-01..03, 06 pure Core, frozen constants, tests, no runtime deps | Done | | `npm test` |
| NFR-CORE-04 ESLint/Prettier | **Not done** | | Code follows the guidelines by hand; no linter configured yet. |
| NFR-CORE-05 under 2 ms per frame | Done | | measured 0.008 ms per frame (engine update + snapshot) in Node |

## Part B – Default frontend

| Requirement | Status | Verified by |
|---|---|---|
| FE-RULE-01..04 read-only, no own pass/fail, consistent feedback, cues never hidden | Done | `frontends.test.js`, `conformance.test.js` |
| FE-VIS-01..07 4:3 canvas with border, sky, clouds, pipes with caps, ghost with wavy edge and two eyes, HUD `Score: N \| High: N`, no external assets | Done | `frontends.test.js`; screenshot compared with your reference |
| FE-SCR-01..05 READY, PLAYING, PAUSED, GAME_OVER (restart prompt only after the lockout), flap squash and `+1` pop | Done | `frontends.test.js`, browser check |
| FE-SCR-06 sound with a mute control | Partial | Synthesized beeps exist in both skins. The mute control is the Core's **Sound** button (delivered as a `settings` message) because pointer input never reaches the iframe, so a button *inside* the frontend cannot work. Not auditioned in a headless browser. |
| FE-PLAY-01..04, 06 | Partial | Cues are shown seconds ahead (pipes appear at the right edge; notes 2.6 s ahead) and hit/miss feedback follows `cueResult`. No flashing above 3 Hz was chosen by design, not measured. |
| FE-PLAY-05 steady 60 FPS with interpolation | Partial | Draws on `requestAnimationFrame` from the latest tick; there is no interpolation between ticks and FPS was not measured. |
| FE-TECH-01..07 plain HTML/CSS/JS, `ready`, tolerant of unknown messages, size limit, resize + high-DPI, no storage | Done | `frontends.test.js`, `validator-sandbox.test.js` |
| B6 Guitar Hero acceptance scenario | Done | `conformance.test.js` (identical summaries); browser check: the same run kept scoring after swapping skins |

## Deliberate differences from `requirements.md`

1. **Physics is the single authority.** Instead of a second "press inside a window" rule, a cue is passed when the reference physics passes the pipe. The hit window is *measured* from the physics (the press may move that far with everything else ideal), which keeps the two always consistent. Windows are informational for rhythm skins (`press.inWindow`); `cueResult` is authoritative.
2. **Cue results arrive about 0.9 s after the press**, when the pipe has fully passed. Rhythm skins get immediate timing feedback from the `press` event.
3. Cue 0 is displayed in READY, so it can be studied for as long as the player wants.
4. A press while paused resumes instead of flapping.
5. Open items resolved: OI-01 Anthropic, OpenAI-compatible (OpenAI, OpenRouter) plus an offline demo; OI-02 constant difficulty; OI-04 browser-only Core; OI-05 file-block output format (`=== FILE: name ===`).

## Not verified

- Real AI providers (no API key in this environment).
- Browsers other than headless Chromium; real touch devices.
- Audio output, and the visual feel at 60 FPS on real hardware.
