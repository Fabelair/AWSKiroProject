# Frontend API v1.0

The only channel between the protected Core and a frontend. A frontend runs in a sandboxed, network-less iframe and gets a small global helper called `FK`.

Messages are plain objects `{ fk: 1, type, payload }` sent with `postMessage`. Positions are normalized (0..1 of the 1024x768 world); times are milliseconds since the run started.

## FK helper (injected before your code)

| Call | Meaning |
|---|---|
| `FK.ready({ name, version })` | Required, once, at startup. Without it the Core rejects the frontend. |
| `FK.onMessage((type, payload) => {})` | Receive Core messages. |
| `FK.send(type, payload)` | Only `ready`, `error` and `heartbeat` are accepted. Heartbeats are automatic. |

## Core -> frontend

| type | payload |
|---|---|
| `init` | `apiVersion, rulebookVersion, seed, canvas:{width,height}, lookaheadMs` (sent after `ready` and when the seed changes) |
| `state` | `state`: `READY`, `PLAYING`, `PAUSED`, `GAME_OVER` |
| `tick` | every frame: `state, seed, runMs, score, highScore, bestOverall, ghost:{x,y,vy}, pipes:[{id,x,gapY,gapHeight,width}], cues:[{id,targetMs,openMs,closeMs,crossMs,laneHint}], lockoutRemainingMs` |
| `press` | `timestampMs, cueId, offsetMs, inWindow` (timing hint for the player's press; `cueId` is `null` for a stray press) |
| `cueResult` | `cueId, result: 'hit'|'miss', offsetMs` (**authoritative**) |
| `gameOver` | `seed, rulebookVersion, score, highScore, failCueId, failReason, durationMs, ticks, pressTicks` |
| `settings` | `muted` (honour it for all sound) |

`cues` always contains every cue whose window opens within the next 4000 ms (at least 3000 ms are guaranteed), so a frontend can warn the player in advance. Cue 0 is already listed in `READY`.

## Frontend -> Core

`ready`, `error { message }`, `heartbeat`. Everything else is silently ignored. A frontend cannot change the seed, state, score, timing or input.

## Bundle format and limits

A bundle is `{ name, files }`. Files are plain names ending in `.html`, `.css` or `.js`; `index.html` is required and may reference the other files. Total size 2 MB at most.

Forbidden (checked statically and enforced by the sandbox): network access, external URLs, `eval`/`Function`/dynamic `import`, browser storage, `parent`/`top` access, `location`, iframes/forms, `@import`.

## Playability rules

1. Show every upcoming cue at least 1000 ms before its window opens.
2. Make the target moment (`targetMs`) identifiable; always show the score.
3. Show hit/miss feedback within 100 ms of `cueResult`, matching the Core's result.
4. No flashing faster than 3 times per second; keep text readable.
