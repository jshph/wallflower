# roomboard

A shared tldraw whiteboard that an agent fills with what's worth discussing before a meeting, and reads back afterwards to separate the room's judgment from its own.

## Use it

```bash
npm install -g roomboard        # or use `npx roomboard` wherever `board` appears below
board serve                     # board server and UI on http://localhost:8787
```

In another terminal, try the example plan:

```bash
board new "Pick the next thing to build"        # prints the board URL
board put "$(npm root -g)/roomboard/examples/plan.json"
```

Open the printed URL, move some cards, add stickies (press `n`, then click), then run `board diff` to see the read-back. Run `board` with no arguments for the full CLI and the plan format.

### With an agent

`skill/roomboard/SKILL.md` teaches an agent the whole loop: deciding what the board is for, gathering material, writing the plan, taking another pass when someone presses **Take another pass**, and reading back what people did. Copy or link the `skill/roomboard` folder into your agent's skills directory (for Claude Code, `~/.claude/skills/roomboard`). Gathering material is the agent's job, with whatever search tools it has.

## Develop

```bash
npm install
npm run dev            # board server :8787 (watch mode) + Vite UI with hot reload :5173
npm test               # layout and its checks, text sizing, copy budgets, read-back diff, hosted mode
npm run build          # builds the UI into dist/, which `board serve` serves
```

- `server/`: the board model (cards, groups, zones), placement, collision checks, the event log with actors, the automatic "proposed" snapshot taken when a person first touches a board, per-round snapshots for each pass, sticky neighborhoods, and the diff.
- Layout (`server/arrange.mjs`): until a person touches a board, each `put` lays the whole board out again from the agent's placements. A card plus the cards tucked onto or ringed around it is one unit, units pack into groups, groups and their edge cards fill a grid, so nothing overlaps and groups are as big as what they hold. After that, whatever a person placed is pinned: new cards go in locally, groups grow to hold them, and only the agent's untouched groups are pushed apart. `put` then checks the board (groups overlapping or too close, cards reading as in the wrong group, cards covering each other, clipped titles, text the browser reports as cut off) and reports problems by id.
- Card text is sized with the handwriting font's real glyph widths (`server/text.mjs`, `server/font-metrics.json`); regenerate the widths with `node scripts/measure-font.mjs` if the font changes.
- `src/`: the tldraw client. It has four card kinds (quote, note, prompt, sticky) in one hand-drawn style, groups that carry their cards, a reader that opens the source passage behind a card (cut by `board put` from `source.file`), fade-in for agent writes, animated remote moves, and an agent cursor.
- `bin/board.mjs`: the agent interface: `serve`, `new`, `put`, `view`, `diff`, `wait`, `url`, `share`, `list`, `use`. `wait` blocks until someone presses **Take another pass** on the board, then prints that round (`server/round.mjs`): people's stickies and moves in their computed neighborhoods, with the source files nearby.
- Boards live in `~/.roomboard/data/boards/<id>/` as `state.json`, `events.jsonl`, and `snapshots/`.

## Settings

All optional, as environment variables. `npm run dev` also reads them from `.env.local`, which is gitignored.

| Variable | Default | |
|---|---|---|
| `ROOMBOARD_DATA` | `~/.roomboard/data` | where boards are stored |
| `ROOMBOARD_PORT` | `$PORT`, else `8787` | board server port |
| `ROOMBOARD_UI_PORT` | `5173` | Vite port in development |
| `ROOMBOARD_HOST` | `127.0.0.1` | interface both servers listen on |
| `ROOMBOARD_ALLOWED_HOSTS` | none | extra hostnames to accept, comma-separated; `.example.com` matches subdomains, `all` matches anything |
| `ROOMBOARD_TOKEN` | none | turns on hosted mode (below); the CLI sends it too |
| `VITE_TLDRAW_LICENSE_KEY` | none | a tldraw business license key, read at build time; not needed (see License) |
| `ROOMBOARD_URL` | `http://127.0.0.1:8787` | where the CLI finds the server |
| `ROOMBOARD_UI` | asked from the server | base URL the CLI prints for boards |
| `ROOMBOARD_ACTOR` | `agent:<username>` | who the CLI writes as |
| `ROOMBOARD_BOARD` | the last `board new` / `board use` | which board the CLI acts on |

### Sharing a board with people on other machines

There are no accounts. Without `ROOMBOARD_TOKEN`, anyone who can reach the server can list and edit every board, so by default it listens only on this machine and refuses requests addressed to any other hostname, or coming from other sites' pages. Add the hostname people will use to `ROOMBOARD_ALLOWED_HOSTS` only behind a tunnel or proxy that does its own authentication.

**Hosted mode.** Set `ROOMBOARD_TOKEN` to a long random secret and the server can face the internet:

- A board's link is its key. New boards get random 24-character ids (144 bits), and anyone holding a board's link can view it, edit it, and read it back with the CLI. Nobody can find a board without its link.
- The token is needed only to list all boards and to create boards. Custom `--id`s are refused, so ids stay unguessable.
- Request bodies and socket messages are capped at 1 MB.

To run it (on Railway, Fly, a VPS…): `npm run build`, then `node bin/board.mjs serve` with `ROOMBOARD_HOST=0.0.0.0`, `ROOMBOARD_DATA` on a persistent disk, `ROOMBOARD_ALLOWED_HOSTS=board.example.com`, `ROOMBOARD_UI=https://board.example.com`, and `ROOMBOARD_TOKEN`. The server honors `PORT`.

An agent uses a hosted server with:

```bash
export ROOMBOARD_URL=https://board.example.com
export ROOMBOARD_TOKEN=…        # only for `board new` and `board list`
board new "Title"                # prints the link to share (`board share` prints it again)
board diff                       # works for anyone with the board id, token or not
```

People who open a link are asked their name once; the board's **Share** button copies its link. Whoever has only a link (`…/?board=<id>`) can still use the CLI: `ROOMBOARD_URL=https://board.example.com board use <id>`, then `view`, `put`, `diff`, `wait`.

## License

MIT; see `LICENSE`. The UI is built on tldraw 3.15.6, pinned exactly, which is under its own license: a verbatim copy of the license for that version is in `public/TLDRAW-LICENSE.md` (shipped in `dist/` and the npm package). It allows commercial and non-commercial use, including in production, as long as the "Made with tldraw" watermark stays visible; don't hide or remove it. Later tldraw versions (4 and up) are under a different license that needs a license key for production use, so check it before upgrading. Shantell Sans (`public/fonts`) is under the SIL Open Font License (`public/fonts/OFL.txt`).
