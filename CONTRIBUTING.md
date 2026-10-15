# Contributing

Agentopolis is a plain Node server and a canvas page, with no dependencies. Most of it is plugins: a floor, a
gadget, a bit of office life. This guide is about writing one.

## Quick start

```sh
npm run new-feature coffee-machine                # a client plugin
npm run new-feature coffee-machine -- --server    # plus a server plugin that reads transcripts
npm run demo                                      # then open http://127.0.0.1:4747/?demo=coffeemachine
```

`new-feature` copies the examples, registers the plugin in `app/tower/tower.js` (an import and a `FEATURES` entry),
and refuses to overwrite anything. The copy is a working sticky note on every session floor; change it into your idea.

## How it fits together

```
~/.claude (read-only) ─▶ server.mjs ─▶ server/features/*.mjs ─▶ /api/state ─▶ app/tower/tower.js ─▶ app/tower/features/*.js
                         builds one snapshot   add data to it      polled 1.5 s   draws the tower     draw on it
```

The server builds a **snapshot** (the sessions, their agents and their states) and the page polls it. Plugins on
both sides add to it.

### Server plugins: `server/features/<name>.mjs`

Every `*.mjs` in that folder is loaded at startup. The default export can have `session(ctx)`, `agent(ctx)`,
`snapshot(snap)` and `routes`. What a session plugin returns shows up on the client as `session.ext['<name>']`, keyed by
the file name. The contract is the comment near the top of `server.mjs`. The worked example is
`server/features/_example.mjs.example`, which ends in `.example` so it is never loaded.

Server plugins **do not run under `--demo`**. If your plugin adds data, add matching invented data to
`server/demo.mjs` too, so the demo shows it.

### Tower plugins: `app/tower/features/<name>.js`

A tower plugin is `export default function init(api, tower)` that registers hooks with `tower.on(name, fn)`: `sync`,
`items`, `glow`, `overlay`, `hover`, `click` and so on. The full API (each hook, the coordinates, the z bands, the
geometry, the people and the camera) is the comment at the top of `app/tower/tower.js`. That comment is the reference,
so read it there.

`app/tower/features/_example.js` uses the common hooks once each, with comments. It is not registered, so it never
runs.

**Find a free spot.** The building is crowded. Open the demo, zoom in to where you want to draw, and check that
nothing else lives there before you pick your coordinates. If two features fight over a wall, the newer one moves.

## Demos

Every feature gets a `?demo=<name>`, using the feature name without hyphens. A demo makes the feature happen right now,
with invented data, so a reviewer can see it without waiting for the real event:

- Read it with `new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('<name>')`.
- Fake the data in the `snapshot` hook, which runs before the tower reads each poll. That way the rest of your code
  can't tell demo data from real data.
- Fly the camera to it (`tower.flyTo`) unless the URL already has `?towerzoom=`.
- It must work both on `npm run demo` and on a real server.

## Privacy rules

These are not negotiable, because people run this against their own work.

- **`~/.claude` is read-only.** Read transcripts and session files there. Never write, move or delete anything under it.
- **No network calls without saying so.** A new outbound request needs a line in the README's Privacy section and in
  your PR description. GitHub goes through `gh` without a shell, and only with read commands.
- **`--demo` invents everything.** Demo data never comes from the machine. Invent repo names (`acme/skyline`),
  logins (`alice-dev`, `bob-codes`) and titles. No real names, companies, repos, ticket ids or home paths go in code,
  demos, docs or screenshots.
- The user's name comes from `--name` (`snap.owner`). Don't hard-code one.
- Escape anything from a transcript or GitHub before it goes into HTML (`api.esc`).

## Testing

There is no test suite. You check a feature by looking at it:

```sh
node server.mjs --demo --port 4800 &
node tools/shot.mjs "http://127.0.0.1:4800/?demo=coffeemachine" shot.png 6000 1500 1000
```

`tools/shot.mjs <url> <out.png> [waitMs] [width] [height]` screenshots the page in headless Chrome and prints its
console errors. A plugin is done when your files print none. For close-ups, add `?towerzoom=<z>&towerat=<floor index>`
(and `&towerx=<x>`). For the whole street, use `?towerzoom=min`. Check both `--demo` and a real server with a session
running.

## Style

- **No dependencies.** No npm packages and no build step. The browser loads `app/` as plain ES modules.
- **Pixel art.** Draw with `fillRect` in whole world pixels. Text goes in the `overlay` hook, so it stays sharp at
  every zoom.
- **Few comments.** One header comment per file says what the feature shows, what data drives it and its `?demo=`. In
  the code, comment only what the code can't say.
- **Keep geometry fresh.** Floors move whenever sessions come and go, so read rects every frame and don't cache them.
- **Fail small.** A throwing hook is logged and skipped. Guard against missing data (`snap.x?.y`) rather than assuming
  it's there.
