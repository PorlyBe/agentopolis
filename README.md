# Agentopolis

**A living pixel-art skyscraper of your Claude Code sessions.**

Every running session gets its own floor. Its subagents and workflow agents walk in through the lobby, ride the glass
elevator and sit down at the desks beside it. You watch them work, take coffee breaks, get stuck, celebrate, and queue
outside your office when they need you. Your teammates' open pull requests line the street as neighbouring buildings,
and a failing CI run sets them on fire.

![The tower](docs/screenshots/hero.png)

It is a read-only window onto `~/.claude`. It installs no hooks, changes no settings and runs no agents. It's a plain
Node server with no dependencies and a canvas page.

## Getting started

### 1. What you need

- **Node.js 24.** It's the version Agentopolis is tested on. Check with `node -v`; get it from
  [nodejs.org](https://nodejs.org) or `nvm install 24`. There's nothing to `npm install`, because there are no
  dependencies.
- **Claude Code**, running on the same machine. Agentopolis shows the sessions that are open right now.
- **Optional: the [GitHub CLI](https://cli.github.com), signed in** (`gh auth login`). This lights up the street,
  post room, CI subway, deploy rockets and your PR board for the GitHub repo your sessions are working in. Without
  it the tower still works and the street stays quiet.
- Tested on macOS. Linux and Windows (WSL) should work but haven't been tried yet; reports welcome.

### 2. Try the demo (no setup)

```sh
git clone https://github.com/PorlyBe/agentopolis.git
cd agentopolis
npm run demo          # or: node server.mjs --demo
```

Open **http://127.0.0.1:4747**. You get a made-up office with five sessions, teammates, PRs and deploys. The demo
reads nothing from your machine and makes no network calls.

### 3. Run it on your own sessions

```sh
npm start -- --name "Ada"        # or: node server.mjs --name "Ada"; your name goes on the CEO office
```

Open **http://127.0.0.1:4747**, then start or switch to a Claude Code session in any terminal. Its floor is
built within a couple of seconds, and each subagent it spawns walks in through the lobby.

To keep it running in the background and open the browser for you:

```sh
AGENTOPOLIS_NAME="Ada" ./start.sh      # logs go to server.log
pkill -f agentopolis/server.mjs       # stop it
```

### Updating

Agentopolis never updates itself. To get the latest version, in the folder you cloned:

```sh
git pull
npm start             # after stopping the running server; or ./start.sh
```

You don't have to remember to look: every 6 hours the server asks GitHub whether `main` has commits you don't have,
and a small ⬆ appears in the toolbar with the list. It only tells you; nothing is downloaded or run. Switch it off
under **⚙ Settings → Updates**. It only checks a git clone of this repo, so a fork or a copy stays quiet.

### Options

Most options live in the **⚙ Settings** panel at the bottom of the toolbar: your name, your character, the theme (or one
you make in its editor, shared as a short JSON text), floor styling by session title, which features run, the update check, and how long an inactive session keeps its floor. Changes show within a couple of seconds, without a
restart; switching features on or off reloads the page. The panel saves to `~/.agentopolis/settings.json`.

The flags below set the startup defaults. A value saved in the panel wins over its flag, and resetting it in the panel
goes back to the flag's value.

| Flag | Default | What it does |
|---|---|---|
| `--name <you>` | `You` | The name on the CEO office |
| `--port <n>` | `4747` | Port, always on 127.0.0.1 |
| `--demo` | off | An invented office; no real data is read |
| `--window-min <n>` | `30` | How long a running but inactive session keeps its floor |
| `--avatar "<look>"` | today's look | Your character, e.g. `"hair=bun,haircolour=red,suit=navy,skin=3,glasses=round,pet=cat"`: hair `short` `long` `bun` `curly` `bald` `mohawk`; haircolour `brown` `black` `blonde` `red` `grey` `white` `pink` `blue`; suit `charcoal` `navy` `burgundy` `forest` `cream`; skin `1`–`6`; glasses `none` `round` `square`; pet `none` `cat` `dog` `claudio`. `?avatar=` on the URL overrides it |
| `--theme <name>` | `auto` | The tower's skin: `classic`, `cyberpunk`, `cottage`, `brutalist`, `synthwave`, `noir`, `underwater`, `space-station`, `gameboy`, `blueprint`, `steampunk`, `winter-cabin`, `candy`, a custom theme made in **⚙ Settings → Look** (`custom:<name>`), or a holiday (`halloween`, `christmas`, `newyear`, `valentine`, `lunar`, `hanami`, `goldenweek`, `tanabata`, `obon`, `tsukimi`), or a mix like `cyberpunk+halloween`. `auto` is classic plus whatever holiday the date brings. `?theme=` overrides it |

`?demo=<feature>` on the URL plays any single feature (see [Demos](#demos)), and `?towerzoom=min` shows the whole
street.

### Troubleshooting

- **"No Claude sessions running".** Only sessions whose Claude Code process is alive are shown; they're read from
  `~/.claude/sessions/` and `~/.claude/projects/`. Start a session, or check that you run the server as the same
  user as Claude Code.
- **The street is empty.** Run `gh auth status`. The repo is taken from the `origin` remote of your sessions'
  working directories, so it needs to be on GitHub, and your account needs read access to it.
- **"Port 4747 is in use".** It's already running, or something else holds the port. Use `--port 4800`.
- **Clicking a floor says it isn't in an Orca terminal.** Jumping to a session's terminal needs
  Orca; everything else works without it.

## What's in the building

| | |
|---|---|
| ![Session floors](docs/screenshots/floors.png) | **Session floors.** One per live session: desk, monitor, task board, plaque with context bar and cost jar. Subagents fill the spare desks; idle ones wander off to the café. |
| ![CEO office](docs/screenshots/ceo.png) | **Your office.** Sessions waiting on you queue at your desk with their last question; the phone rings for permission prompts. A board lists your open PRs and blinks red when CI fails. |
| ![Post room](docs/screenshots/post-room.png) | **Post room.** One parcel per open PR: drafts caged, ready ones on the rack, approved ones outbound. Size by diff, cobwebs when stale, crushed on conflict. Merges leave by van. |
| ![Roof](docs/screenshots/roof.png) | **Roof.** Deploys launch as rockets from the pad — orbit on success, a smoking wreck on failure. Remote work leaves by helicopter. Friday drinks after 17:00. |
| ![Street](docs/screenshots/street.png) | **Street.** Teammates' buildings, one floor per open PR, on fire when CI is red. Reviewers walk over to pin notes on your floor. A red trunk triggers a fire drill. |

And a lot more, each driven by something real in your transcripts or on GitHub:

- **Work signals:** the printer jams on a tool call stuck for minutes, a character walks in circles when it retries
  the same failing call (Groundhog Day), and test-lab flasks bubble green or red per suite. Books come off the shelf
  when a skill loads, someone looks out with binoculars during web research, and a phone booth lights up while a
  browser is being driven.
- **Office life:** floors are built with scaffolding and a ribbon-cut when a session starts, and a closed one moves
  out with boxes. There's a cake at 100, 500 and 1000 tool calls, a punch clock with each session's hours, a stand-up
  at 10:00, a lunch rush at noon, a screensaver when you've been away, and holidays on the calendar.
- **Character:** outfits follow the model (a suit for Opus, a hoodie for Haiku), and hats follow the language
  being edited (a crab for Rust, a snake scarf for Python). Destructive commands shake their floor and draw on the
  lobby seismograph, a hall of records keeps your all-time bests, a blimp trails the day's headline, and at night
  the windows chart today's activity by hour.
- **Up close:** zoom in on a desk and its monitor is a tiny live terminal showing the real command, file or diff
  line; with ambience on you also hear that floor (keyboards, the copier, the lift, coffee, traffic, wind).
- **Mood:** grumpy prompts ("wtf", "ugh", ALL CAPS) park a rain cloud over that floor until you say thanks; a stray
  cat makes mischief on floors left idle; a plant in your office grows with your daily streak; and there are a few
  secrets to find.
- **Share your day:** the 📊 button draws a daily report card (sessions, tool calls, PRs, deploys, spend, the moment of
  the day) as an image to paste into Slack.
- **Watch it on a TV:** 🎬 director mode (or `D`, or `?director=1`) flies a slow auto-pilot camera between whatever is
  happening, with a small caption; touching the view pauses it for a minute.
- **More of the building:** a second express elevator opens when the line gets long; a ghost annex keeps today's
  closed sessions as translucent floors at night; a records room files every write to a CLAUDE.md or memory file;
  the subway wall carries a metro map of your branches; a review turns the meeting room into a courtroom; ivy grows on
  long-running floors; a roof smokestack puffs with the token rate; subagent types level up; and you can squash the
  bug critters for a high score.
- **Infrastructure:** a server room with a rack per background job, a parking garage with one car per session's
  model, an IT technician when a tool server drops, and a security desk that stamps DENIED on blocked actions.
- **Around the building:** weather and a day–night cycle for your time zone, the Gazette (a daily paper of the repo),
  replay of the last hours, a photo booth and an ambient soundscape.

![A close-up of a busy floor](docs/screenshots/closeup.png)

## Demos

Add `?demo=<name>` to see any feature without waiting for it to happen. For example: `towerlife`, `moveinout`,
`waitline`, `myprs`, `postroom`, `rocket`, `helipad`, `firedrill`, `printerjam`, `groundhog`, `milestonecake`,
`walkabout`, `reviewervisits`, `fridaydrinks`, `standup`, `lunchrush`, `screensaver`, `cisubway`, `seismograph`,
`windowheatmap`, `readablemonitors`, `floorsounds`, `stormcloud`, `catchaos`, `tamagotchiplant`, `reportcard`,
`hallofrecords`, `expresselevator`, `directormode`, `ghostannex`, `memoryarchive`, `agentxp`, `branchmetro`,
`courtroom`, `bugsquash`, `ivywear`, `smokestack`, `blimp`, `uniforms`, `wardrobe`, `themes`, `skylinetowers`, `avatar`,
`holidays&date=2026-12-25`.

`?towerzoom=min` shows the whole street.

## Privacy

- **Local only.** The server listens on `127.0.0.1` and refuses any other `Host`.
- **Transcripts.** It only reads them (`~/.claude/projects`, `~/.claude/sessions`) and never writes under `~/.claude`.
- **Its own data.** The only files it writes are `~/.agentopolis/records.json` (the hall of records) and
  `~/.agentopolis/settings.json` (what you set in the ⚙ panel, which only the page itself can change). `--demo` writes
  nothing; its settings last until the server stops.
- **GitHub.** It runs `gh` without a shell, and only read commands (`pr list`, `run list`, `api` GETs), cached and
  rate-limited. It never writes to GitHub.
- **Update check.** Every 6 hours (and when you press **Check now**) it sends one unauthenticated request to
  `api.github.com` comparing your checkout's commit with `main`. The request carries that commit id and an
  `agentopolis-update-check` user agent: no token, no cookies. It's skipped under `--demo`, when the folder isn't a git clone of this repo, and when you
  switch it off in **⚙ Settings → Updates** (`"updateCheck": false` in `settings.json`).
- **Outbound requests.** Apart from GitHub, it makes two: [Open-Meteo](https://open-meteo.com) for the weather, for a
  coarse location taken from your system time zone (there's no IP geolocation), and a public price feed for the
  BTC/BCH billboard. Neither carries any data about you.
- **Links.** They open in your default browser via `/api/open`, which only accepts `https://github.com/` URLs from
  the page itself.

## How it works

```
~/.claude/projects/*.jsonl ─┐
~/.claude/sessions/*.json  ─┼─▶ server.mjs ──/api/state──▶ app/core.js ──▶ app/tower/ (canvas)
gh (read-only)             ─┘   server/features/*.mjs        polls 1.5 s     app/tower/features/*.js
```

- **Server.** `server.mjs` parses transcripts incrementally into a snapshot of sessions, agents and their states.
  Each file in `server/features/` can add data per session (`session(ctx)`), per agent (`agent(ctx)`) or to the
  whole snapshot (`snapshot(snap)`).
- **Tower.** `app/tower/tower.js` draws the building and owns the people, the elevator and the camera. Each file in
  `app/tower/features/` is a plugin that hooks into `sync`, `step`, `items`, `overlay`, `hover`, `click` and so on.
  The full plugin API is documented at the top of `tower.js`.
- **Page.** The DOM around the canvas (header, side panel, toasts, replay) lives in `app/features/`.

## Write your own floor

Most of the building is plugins, and adding one takes one command:

```sh
npm run new-feature coffee-machine              # app/tower/features/coffee-machine.js, registered in tower.js
npm run new-feature coffee-machine -- --server  # also server/features/coffee-machine.mjs
npm run demo                                    # then open http://127.0.0.1:4747/?demo=coffeemachine
```

The copy starts as a working, commented example. [CONTRIBUTING.md](CONTRIBUTING.md) covers how plugins work, demos,
the privacy rules every plugin follows, and how to check yours with screenshots.


## Credits

Character, furniture and pet sprites come from [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)
(MIT, © Pablo De Lucca). The characters are based on
[JIK-A-4's Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) pack (CC0). Everything else is drawn
in code.

Not affiliated with Anthropic. "Claude" and "Claude Code" are Anthropic's trademarks.

## License

[MIT](LICENSE)
