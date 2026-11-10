#!/usr/bin/env node
// Agent interface to a roomboard. Talks to the running server so every write
// shows up live on any open board.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cutPassage } from '../server/passage.mjs'

const SERVER = process.env.ROOMBOARD_URL ?? `http://127.0.0.1:${process.env.ROOMBOARD_PORT ?? 8787}`
const CURRENT = path.join(os.homedir(), '.roomboard', 'current')

const HELP = `board — put cards on a shared board, then read back what people did

  board serve                     run the board server and UI (default http://localhost:8787)
  board new "Title" [--id ID]     create a board and make it current; prints its URL (hosted servers pick the id)
  board put plan.json|-           add or update groups and cards; prints the layout, then warnings and layout problems
  board view                      the board as text: layout map, then every card with its position
  board diff                      what people changed since they first touched the board
  board wait [--timeout SECONDS]  block (default 20 minutes) until someone presses "Take another pass", then print that
                                  round: stickies and moved cards in their neighborhoods, groups,
                                  removals, and any note. Exits 2 if the timeout passes first.
  board url [--name Name]         the board's URL, with a name for whoever opens it
  board share                     the link to send to other people, and whether they can reach it
  board list | board use <id>

Plan (every field optional except ids; plans can be partial):
  { "title": "…",
    "groups": [{ "id": "g1", "label": "", "col": 0, "row": 0, "cols": 2, "zone": false, "why": "…" }],
    "cards":  [{ "id": "c1", "kind": "quote|note|sticky|prompt", "title": "…", "body": "…",
                 "source": { "label": "…", "url": "…", "author": "…", "date": "…", "file": "path/to/source.md" }, "people": ["…"],
                 "why": "…", "place": PLACE }] }
  PLACE: { "in": "g1" } | { "around": "c1" } | { "near": "c1", "side": "right|left|below", "overlap": true }
         | { "edge": "g1", "side": "right|left|below|above" } | { "at": { "x": 0, "y": 0 } }
  Remove something with { "id": "c1", "delete": true } in cards or groups.
  Cards can be named by number anywhere an id goes ("#7"), including in PLACE.
  Until a person touches the board, every put lays the whole board out again from these intents, so
  moving a group to another row or a card to another group just works. After that, anything a person
  placed stays put; new cards go in around it, and only your own untouched groups shift to make room.
  source.file: put reads it here and attaches ~200 words around the card's quote (a quote card's body, or
  source.quote) as a preview people can open on the board; without a quote, the opening of the file.
  The file itself is never uploaded. A file:// url works too.
`

function die(msg) {
  console.error(msg)
  process.exit(1)
}

const args = process.argv.slice(2)
const cmd = args.shift()
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : undefined }
const actor = process.env.ROOMBOARD_ACTOR ?? (process.env.BB_THREAD_ID ? `agent:${process.env.BB_THREAD_ID}` : `agent:${os.userInfo().username}`)

function current() {
  const id = process.env.ROOMBOARD_BOARD ?? (fs.existsSync(CURRENT) ? fs.readFileSync(CURRENT, 'utf8').trim() : null)
  if (!id) die('no board selected: run `board new "Title"` or `board use <id>`')
  return id
}

function setCurrent(id) {
  fs.mkdirSync(path.dirname(CURRENT), { recursive: true })
  fs.writeFileSync(CURRENT, id)
}

async function api(method, p, data) {
  let res
  try {
    const headers = { 'content-type': 'application/json', 'x-actor': actor }
    // A hosted server wants its token to list or create boards; per-board calls need only the id.
    if (process.env.ROOMBOARD_TOKEN) headers.authorization = `Bearer ${process.env.ROOMBOARD_TOKEN}`
    res = await fetch(SERVER + p, { method, headers, body: data ? JSON.stringify(data) : undefined })
  } catch {
    const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(SERVER)
    die(local
      ? `cannot reach roomboard server at ${SERVER}; start it with \`board serve\` (or \`npm run dev\` in a checkout)`
      : `cannot reach roomboard server at ${SERVER}; check the address in ROOMBOARD_URL and your connection`)
  }
  const text = await res.text()
  if (!res.ok) die(`error ${res.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

// The server knows where its UI lives (Vite in development, itself otherwise) and whether it's hosted.
let infoCache
async function info() {
  infoCache ??= await api('GET', '/api/info')
  return infoCache
}
async function ui() {
  return process.env.ROOMBOARD_UI ?? (await info()).ui
}

// Whether the link just printed can go to other people. On stderr, so stdout stays just the id and URL.
async function shareNote() {
  if ((await info()).hosted) console.error('Anyone with this link can view, edit, and read back the board. Send it only to the people who should be in the room.')
  else console.error('This is a local server, so the link only opens on this machine (unless you put the server behind a tunnel). To share a board with other people, create it on a hosted server: set ROOMBOARD_URL and ROOMBOARD_TOKEN.')
}

// Cards that name a local source file (source.file, or a file:// url) get a preview cut here, on the
// agent's machine: about 200 words around the quote. Only that passage goes to the server, never the file.
function attachPassages(plan, baseDir) {
  const warnings = []
  const files = new Map()
  for (const card of plan.cards ?? []) {
    const s = card.source
    if (!s || typeof s !== 'object' || card.delete) continue
    let file = s.file
    if (!file && typeof s.url === 'string' && s.url.startsWith('file://')) try { file = fileURLToPath(s.url) } catch {}
    const quote = s.quote ?? (card.kind === 'quote' ? card.body : null)
    // Previews are cut from the file, never written by hand.
    if (s.passage !== undefined) { warnings.push(`card ${card.id}: source.passage is cut from source.file by put; dropped the one in the plan`); delete s.passage }
    delete s.file
    delete s.quote
    if (!file) continue
    file = path.resolve(baseDir, file.replace(/^~(?=\/|$)/, os.homedir()))
    if (!files.has(file)) { try { files.set(file, fs.readFileSync(file, 'utf8')) } catch (err) { files.set(file, err) } }
    const text = files.get(file)
    if (text instanceof Error) { warnings.push(`card ${card.id}: can't read ${file} (${text.code ?? text.message}); no preview`); continue }
    const r = cutPassage(text, quote)
    if (r.error) warnings.push(`card ${card.id}: ${r.error} (${path.basename(file)}); no preview. Quote it verbatim, or set source.quote to a verbatim phrase`)
    else s.passage = r.passage
  }
  return warnings
}

switch (cmd) {
  case 'serve':
    await import('../server/index.mjs')
    break
  case 'new': {
    const r = await api('POST', '/api/boards', { id: flag('id'), title: args.join(' ') || undefined })
    setCurrent(r.id)
    console.log(`${r.id}\n${await ui()}/?board=${r.id}`)
    await shareNote()
    break
  }
  case 'put': {
    const fromStdin = !args[0] || args[0] === '-'
    const src = fromStdin ? fs.readFileSync(0, 'utf8') : fs.readFileSync(args[0], 'utf8')
    const plan = JSON.parse(src)
    const local = attachPassages(plan, fromStdin ? process.cwd() : path.dirname(path.resolve(args[0])))
    const r = await api('POST', `/api/boards/${current()}/plan`, plan)
    console.log(r.ascii)
    for (const w of [...local, ...r.warnings]) console.error(`warning: ${w}`)
    // Problems are layout mistakes still on the board after put tried to fix them; fix the plan.
    for (const p of r.problems ?? []) console.error(`problem: ${p}`)
    if (!r.problems?.length) console.error('layout check: no overlaps, every card in its group, no cut-off text')
    break
  }
  case 'view':
    process.stdout.write(await api('GET', `/api/boards/${current()}/view`))
    break
  case 'diff':
    process.stdout.write(await api('GET', `/api/boards/${current()}/diff`))
    break
  case 'wait': {
    const until = Date.now() + Number(flag('timeout') ?? 20 * 60) * 1000
    const id = current()
    console.error(`waiting for someone to press "Take another pass" on ${await ui()}/?board=${id}`)
    // The server holds each request for up to four minutes; keep asking until a pass arrives.
    for (;;) {
      const ms = Math.round(Math.max(1000, Math.min(240_000, until - Date.now())))
      let r
      try {
        const res = await fetch(`${SERVER}/api/boards/${id}/wait?ms=${ms}`, { headers: { 'x-actor': actor } })
        r = { status: res.status, text: await res.text() }
      } catch {
        // The server restarted or dropped the connection; a saved request will still be there.
        await new Promise((ok) => setTimeout(ok, 2000))
        r = { status: 0 }
      }
      if (r.status === 200) { process.stdout.write(r.text); break }
      // A hosted server answers 502-504 while it restarts or redeploys; keep waiting through it.
      if (r.status >= 502 && r.status <= 504) await new Promise((ok) => setTimeout(ok, 5000))
      else if (r.status >= 400) die(`error ${r.status}: ${r.text}`)
      if (Date.now() >= until) { console.error('no pass requested yet'); process.exit(2) }
    }
    break
  }
  case 'url': {
    const name = flag('name')
    console.log(`${await ui()}/?board=${current()}${name ? `&name=${encodeURIComponent(name)}` : ''}`)
    break
  }
  case 'share':
    console.log(`${await ui()}/?board=${current()}`)
    await shareNote()
    break
  case 'list':
    for (const b of await api('GET', '/api/boards')) console.log(`${b.id}\t${b.cards} cards\t${b.title}`)
    break
  case 'use':
    if (!args[0]) die('board use <id>')
    setCurrent(args[0])
    console.log(args[0])
    break
  default:
    console.log(HELP)
}
