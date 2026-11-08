# Flappy Kiro

A retro, endless-scroller browser game with a twist: **the gameplay is a protected contract and the look is replaceable by AI.**

- The **Core** owns the seed, the timeline of required presses, the physics, input, scoring and game state.
- The **frontend** is a swappable skin. Flappy Kiro (a ghost and pipes) is the default. An AI can replace it with anything (a Guitar Hero version is included), but the presses a seed demands stay exactly the same.

## Play it

No build step. Any static file server works. From the repo folder:

```bash
python3 -m http.server 8080     # or: npm run serve
# then open http://localhost:8080
```

| Do this | To |
|---|---|
| Space / ArrowUp / click / tap on the game | press (start, flap, restart) |
| `P` | pause / resume (also automatic when the tab is hidden) |
| Seed box + Set / Random / Copy link | pick a challenge; `?seed=my-seed` in the URL also works |
| **Test bot** | watch the ideal player; works with any skin |
| **Side chat** | restyle the game (pick *Demo (offline)* to try it without a key) |
| **Self-test** | run the guarantees in your browser (determinism, reachability, sandbox, validator) |
| **Restore default** | always brings back the original frontend |

Try the Guitar Hero skin: chat -> "Make it a Guitar Hero style game" -> Generate -> play the preview -> Keep. Same seed, same required presses, different skin.

## Side chat and your own AI key

Choose Anthropic, OpenAI or OpenRouter, paste your key and describe what you want. The key stays in your browser (session storage by default, local storage only if you tick *remember*) and is sent only to the provider you picked. Requests to change difficulty, timing, scoring, seeds or controls are declined; the AI only receives instructions to write frontend files.

Every generated frontend must pass static checks and a load test in a hidden sandbox before you can even preview it. You then **Keep** or **Discard** it; kept versions are stored locally and can be activated, renamed, exported, imported and deleted.

## Tests

```bash
npm test      # node:test, no dependencies
```

## Layout

```
index.html, css/            Core host page
src/core/                   PROTECTED: rulebook, rng, timeline, physics, simulation, engine,
                            bridge (Frontend API), sandbox, validator, versions, storage, bot
src/chat/                   side chat: guard, prompt, parser, providers, controller
src/frontend/default/       default Flappy Kiro frontend (AI-editable part)
src/frontend/examples/      Guitar Kiro example frontend
docs/                       requirements, rulebook, frontend API, traceability, plan
tests/                      unit, conformance and frontend tests
```

## Security model in one paragraph

AI code only ever runs in `<iframe sandbox="allow-scripts">` (no parent access, no storage) with a Content-Security-Policy that blocks all network access (`connect-src 'none'`, no external images/fonts/scripts). Input is captured by the Core page, and the Core accepts only `ready`, `error` and `heartbeat` back from a frontend. Known limit: a frontend that locks up the browser's main thread cannot be interrupted by the page; the watchdog and *Restore default* cover everything short of a hard freeze.
