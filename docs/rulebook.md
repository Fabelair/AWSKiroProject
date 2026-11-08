# Rulebook v1.0.0

This is the contract that makes every skin play the same. The numbers live in `src/core/rulebook.js` (frozen; a unit test fails if they change without a version bump). Nothing here can be changed by a frontend, the chat or an AI.

## How a challenge is made

1. The **seed** (any text up to 64 characters) is hashed (xmur3) and feeds a mulberry32 random generator. `Math.random()` is never used for the timeline.
2. The generator picks the **ideal press times**: the gap between two ideal presses is 896-1504 ms (112-188 ticks of 8 ms), always chosen so the ghost stays between y=300 and y=620 at each press.
3. The reference physics is run along those ideal presses. A pipe gap (220 px) is centred on the ghost at the moment the pipe crosses it, 600 ms after the ideal press. Every timeline is therefore reachable by construction.
4. A challenge is identified by `(rulebookVersion, seed)`. Same pair, same cues, on any device.

## Cues and windows

Each **cue** is one required press: `targetMs` (ideal press), `crossMs` (pipe crossing), `laneHint` (gap height 0..1) and a measured **hit window** `openMs..closeMs`. The window is not guessed: the Core re-runs the physics with that press shifted earlier/later (all other presses ideal) and records how far it can move while that cue and the next two are still passed. Windows are typically 170-420 ms wide (median about 230 ms).

## Physics (fixed step: 8 ms = 125 Hz)

- Gravity 900 px/s^2, flap sets vertical speed to -540 px/s.
- Ghost x = 256 px, hitbox 36x36 px. Pipes are 76 px wide, move at 200 px/s.
- Only `+ - * /` and comparisons are used, so results are identical on every JavaScript engine.
- Frame rate does not matter: real time feeds an accumulator that is consumed in whole ticks. Frame deltas are clamped to 50 ms.

## Input

- One action, `press` (Space, ArrowUp, mouse/touch on the game area), captured by the Core host page, never by the frontend. Held keys count once.
- The first press in `READY` starts the run (it is the launch flap at tick 0). After `GAME_OVER`, input is locked for 400 ms, then a press returns to `READY`.
- Each press is recorded as the tick it was applied on. Seed + press ticks fully reproduce a run.

## Outcome and score

- The run ends when the ghost touches a pipe, the floor or the ceiling. The reference physics decides, never the frontend.
- A cue is a **hit** when its pipe has completely passed the ghost; score +1 per hit. A **miss** is reported for the cue being attempted when the run ends.
- High score is stored per `(rulebookVersion, seed)` plus an overall best.

## States

`READY -> PLAYING -> GAME_OVER -> READY`, and `PLAYING <-> PAUSED` (pause key `P`, or automatically when the tab is hidden; a press while paused resumes). The seed can only change in `READY` or `GAME_OVER`.

## Difficulty

Constant (no ramp) in v1. It cannot be changed by anyone.
