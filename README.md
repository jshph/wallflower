# Wallflower

A shared tldraw whiteboard that an agent fills with what's worth discussing before a meeting, and helps flesh out as the ideas on the board evolve.

Wallflower publishes whiteboards to byenzyme.com so you can share boards with other people. You can also run it locally for your own use, or deploy your own copy (see [Run a shared server](#run-a-shared-server)).

## Use it

```bash
npm install -g wallflower-board   # installs `wallflower`, and `wf` for short
wallflower serve                  # board server and UI on http://localhost:8787
```

In another terminal, try the example plan:

```bash
wallflower new "Pick the next thing to build"        # prints the board URL
wallflower put "$(npm root -g)/wallflower-board/examples/plan.json"
```

Open the printed URL, move some cards, add stickies (press `n`, then click), then run `wallflower diff` to see the read-back. Run `wallflower` with no arguments for the full CLI and the plan format.

### With an agent

`skill/wallflower/SKILL.md` teaches an agent the whole loop: deciding what the board is for, gathering material, writing the plan, taking another pass when someone presses **Take another pass**, and reading back what people did. Copy or link the `skill/wallflower` folder into your agent's skills directory. For Claude Code, with the npm package installed:

```bash
ln -s "$(npm root -g)/wallflower-board/skill/wallflower" ~/.claude/skills/wallflower
```

Gathering material is the agent's job, with whatever search tools it has.

## Develop

```bash
npm install
npm run dev            # board server :8787 (watch mode) + Vite UI with hot reload :5173
npm test               # layout and its checks, text sizing, copy budgets, read-back diff, hosted mode
npm run build          # builds the UI into dist/, which `wallflower serve` serves
```

- `server/`: the board model (cards, groups, zones), placement, collision checks, the event log with actors, the automatic "proposed" snapshot taken when a person first touches a board, per-round snapshots for each pass, sticky neighborhoods, and the diff.
- Layout (`server/arrange.mjs`): until a person touches a board, each `put` lays the whole board out again from the agent's placements. A card plus the cards tucked onto or ringed around it is one unit, units pack into groups, groups and their edge cards fill a grid, so nothing overlaps and groups are as big as what they hold. After that, whatever a person placed is pinned: new cards go in locally, groups grow to hold them, and only the agent's untouched groups are pushed apart. `put` then checks the board (groups overlapping or too close, cards reading as in the wrong group, cards covering each other, clipped titles, text the browser reports as cut off) and reports problems by id.
- Card text is sized with the handwriting font's real glyph widths (`server/text.mjs`, `server/font-metrics.json`); regenerate the widths with `node scripts/measure-font.mjs` if the font changes.
- `src/`: the tldraw client. It has four card kinds (quote, note, prompt, sticky) in one hand-drawn style, groups that carry their cards, a reader that opens the source passage behind a card (cut by `wallflower put` from `source.file`), fade-in for agent writes, animated remote moves, and an agent cursor.
- `bin/wallflower.mjs`: the agent interface: `serve`, `new`, `put`, `view`, `diff`, `wait`, `url`, `share`, `list`, `use`. `wait` blocks until someone presses **Take another pass** on the board, then prints that round (`server/round.mjs`): people's stickies and moves in their computed neighborhoods, with the source files nearby.
- Boards live in `~/.wallflower/data/boards/<id>/` as `state.json`, `events.jsonl`, and `snapshots/`.

## Settings

All optional, as environment variables. The older `ROOMBOARD_*` names still work, and an existing `~/.roomboard` folder is still used. `npm run dev` also reads them from `.env.local`, which is gitignored.

| Variable | Default | |
|---|---|---|
| `WALLFLOWER_DATA` | `~/.wallflower/data` | where boards are stored |
| `WALLFLOWER_PORT` | `$PORT`, else `8787` | board server port |
| `WALLFLOWER_UI_PORT` | `5173` | Vite port in development |
| `WALLFLOWER_HOST` | `127.0.0.1` | interface both servers listen on |
| `WALLFLOWER_ALLOWED_HOSTS` | none | extra hostnames to accept, comma-separated; `.example.com` matches subdomains, `all` matches anything |
| `WALLFLOWER_TOKEN` | none | turns on hosted mode for a shared server (below); the CLI sends it too |
| `VITE_TLDRAW_LICENSE_KEY` | none | a tldraw business license key, read at build time; not needed (see License) |
| `WALLFLOWER_URL` | from the config file, else `http://127.0.0.1:8787` | where the CLI finds the server; `--server` overrides it per command |
| `WALLFLOWER_CONFIG` | `~/.config/wallflower/config.env` | the CLI's config file (below) |
| `WALLFLOWER_UI` | asked from the server | base URL the CLI prints for boards |
| `WALLFLOWER_ACTOR` | `agent:<username>` | who the CLI writes as |
| `WALLFLOWER_BOARD` | the last `wallflower new` / `wallflower use` | which board the CLI acts on |

## Run a shared server

There are no accounts. Without `WALLFLOWER_TOKEN`, anyone who can reach the server can list and edit every board, so by default it listens only on this machine and refuses requests addressed to any other hostname, or coming from other sites' pages. You can add the hostname people will use to `WALLFLOWER_ALLOWED_HOSTS`, but only behind a tunnel or proxy that does its own authentication.

To share boards with people elsewhere, deploy your own server with `WALLFLOWER_TOKEN` set. The server and CLI call this **hosted mode**:

- A board's link is its key. New boards get random 24-character ids (144 bits), and anyone holding a board's link can view it, edit it, and read it back with the CLI. Nobody can find a board without its link.
- The token is needed only to list all boards and to create boards. Custom `--id`s are refused, so ids stay unguessable.
- Request bodies and socket messages are capped at 1 MB.

### Deploy

The `Dockerfile` builds the UI and runs the server, with boards in `/data`. Mount a persistent volume there:

```bash
docker build -t wallflower .
docker run -d -p 8787:8787 -v wallflower-data:/data \
  -e WALLFLOWER_TOKEN="$(openssl rand -base64 32)" \
  -e WALLFLOWER_ALLOWED_HOSTS=board.example.com \
  -e WALLFLOWER_UI=https://board.example.com \
  wallflower
```

Keep the token somewhere you can find it again; your CLI needs it. The server speaks plain HTTP, so put it behind something that terminates HTTPS (a reverse proxy, or a platform such as Railway or Fly that does it for you). It honors `PORT`, which those platforms set. `WALLFLOWER_ALLOWED_HOSTS` must name every hostname people or the CLI use to reach it, including a platform's default domain if you use that; other hostnames get a 403.

Without Docker: `npm install`, `npm run build`, then `node bin/wallflower.mjs serve` with the same variables plus `WALLFLOWER_HOST=0.0.0.0` and `WALLFLOWER_DATA` on a persistent disk.

### What running one means

- **Your data is one folder.** Every board lives under `WALLFLOWER_DATA` (`boards/<id>/`). Back it up; losing the volume loses every board.
- **Boards can't be deleted from the CLI or UI yet.** To remove one, stop the server and delete its folder.
- **A link can't be revoked.** Anyone who has it keeps access until the board is deleted, so share links only with the people who should be in the room.
- **Names aren't verified.** People type their name when they first open a board, and the CLI writes as `WALLFLOWER_ACTOR`. The read-back credits changes to those names, which works for people who trust each other but doesn't prove who did what.

### Use it from an agent

Make the shared server this machine's default by putting it in the CLI's config file, `~/.config/wallflower/config.env`:

```bash
mkdir -p ~/.config/wallflower
cat > ~/.config/wallflower/config.env <<'EOF'
WALLFLOWER_URL=https://board.example.com
WALLFLOWER_TOKEN=…
EOF
chmod 600 ~/.config/wallflower/config.env
```

Every `wallflower` command then talks to that server, from any shell or agent, with no environment to set up. The token is needed only for `wallflower new` and `wallflower list`. Only the CLI reads this file; `wallflower serve` ignores it.

```bash
wallflower new "Title"                  # prints the link to share (`wallflower share` prints it again)
wallflower diff                         # works for anyone with the board id, token or not
wallflower new "Just me" --server local # this board stays on this machine
wallflower server                       # which server, and where that setting came from
```

`--server <url>` works on any command, and so does `--server local`. Otherwise the CLI uses `WALLFLOWER_URL` from the environment, then the config file, then a server on this machine. A board you make or pick with `--server` stays on that server: later `put`, `view`, `diff` and `wait` follow it without the flag. A token goes only to the server it was set with, so pointing a command at another server never sends it your token.

People who open a link are asked their name once; the board's **Share** button copies its link. Whoever has only a link (`…/?board=<id>`) can still use the CLI: `wallflower use <id> --server https://board.example.com`, then `view`, `put`, `diff`, `wait`.

## License

MIT; see `LICENSE`. The UI is built on tldraw 3.15.6, pinned exactly, which is under its own license: a verbatim copy of the license for that version is in `public/TLDRAW-LICENSE.md` (shipped in `dist/` and the npm package). It allows commercial and non-commercial use, including in production, as long as the "Made with tldraw" watermark stays visible; don't hide or remove it. Later tldraw versions (4 and up) are under a different license that needs a license key for production use, so check it before upgrading. Shantell Sans (`public/fonts`) is under the SIL Open Font License (`public/fonts/OFL.txt`).
