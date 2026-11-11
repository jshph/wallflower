#!/usr/bin/env node
// The demo driver: a scripted agent chat beside a real board.
//
//   node examples/demo/run.mjs        (with a board server running; see examples/demo/README.md)
//
// Serves the chat window on http://localhost:5199. Space in that window plays the next
// turn of the conversation; the agent's work goes to the real board through the real
// CLI, and a background `wallflower wait` answers "Take another pass" by itself.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../../server/env.mjs'
import { neighborhood, overlaps } from '../../server/layout.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const CORPUS = path.join(HERE, 'corpus')
const SERVER = (env('URL') ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const TOKEN = env('TOKEN')
const PORT = Number(process.env.DEMO_PORT ?? 5199)
const PERSON = process.env.DEMO_NAME ?? 'Kim'
const ACTOR = 'agent:claude'
const TITLE = "Thursday: what's the list for, and what gets November?"
const SPEED = Number(process.env.DEMO_SPEED ?? 1) // >1 is slower

// Which thread each first-board card belongs to, so a sticky on it pulls that thread's reserve.
const THREAD_OF = { teresa: 1, comments: 1, jonah: 2, persona: 2, editedby: 2, ana: 3, camera: 3, ticket: 4, threemonths: 4, q4: 5, metrics: 5 }
// How the agent refers to cards in conversation, to Maya.
const SHORT = {
  teresa: 'Teresa', jonah: 'Jonah', persona: 'the persona doc', ana: 'Ana', ticket: "Jonah's ticket", camera: "Sam's camera-roll line",
  threemonths: 'the three-months line', onboarding: 'the onboarding copy', comments: 'item comments', editedby: "Dev's edited-by PR",
  pricing: 'the pricing test', q4: 'Q4', metrics: 'your numbers', letters: "Sam's letters line", emoji: 'the emoji request', anatalk: 'Ana',
  rob: 'Rob', whosuser: 'your question in #product', assign: 'assign items', whoadded: 'Priya', alone: 'the ticket from someone who lives alone',
  photo1: 'the first photo request', photo2: 'the second photo request', photoclosed: 'LAR-102', chaos: 'Teresa', filed: "Lin's issue",
  archive141: '#141', thelist: 'Jonah', robarchive: 'Rob', devfirst: 'Dev', prs: "Dev's PRs", slipped: 'the import schedule', door: 'your line about import',
}
const PASS_LINE = {
  1: (s) => `Added four around "${s}", mostly from the calls. One of them disagrees.`,
  2: (s) => `Added four around "${s}". A couple are things we closed or never answered. One is from someone who doesn't share their list at all.`,
  3: (s) => `Added four around "${s}". It was two households asking for photos, not one. Teresa's in there too, she thinks it wouldn't help.`,
  4: (s) => `Added four around "${s}", including the issue Lin filed on the 13th. Rob's in there too, he likes it the way it is.`,
  5: (s) => `Added four around "${s}", mostly Slack and the last few PRs. One of them is yours, from the 20th.`,
}
// What the agent reads during each second pass, for the tool blocks.
const PASS_READS = {
  1: [['slack', 'Search messages', '#random', 'slack/random.md', 'writing letters to each other'], ['granola', 'Read meeting', 'Call with Rob · Oct 22', 'granola/2026-10-22-call-rob.md', 'I strip all that out']],
  2: [['slack', 'Search messages', '#product #support', 'slack/product.md', "who's our user here"], ['linear', 'Read issue', 'LAR-71 Assign items to a person', 'linear/LAR-71-assign-items.md', 'adds complexity for one request']],
  3: [['support', 'Search tickets', '"photo"', 'support/2026-10-23-attach-a-photo.md', 'Can I add a photo to an item?'], ['linear', 'Read issue', 'LAR-102 Photo attachment on item', 'linear/LAR-102-photo-attachment-on-item.md', 'both from the same household']],
  4: [['github', 'Read issue', '#212 Lists auto-archive when every item is checked', 'github/issue-212-lists-auto-archive.md', 'support says people are surprised'], ['granola', 'Read meeting', 'Call with Rob · Oct 22', 'granola/2026-10-22-call-rob.md', 'Auto-archive is the best thing']],
  5: [['slack', 'Search messages', '#eng #product · since Oct 3', 'slack/eng.md', 'doing the sharing fix first'], ['github', 'gh pr list --state merged', '', 'github/recent-prs.md', null]],
}

const PASS_TIMES = ['Thursday 11:06 AM', 'Thursday 11:24 AM', 'Thursday 11:38 AM', 'Thursday 11:47 AM', 'Thursday 11:53 AM']
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms * SPEED))
let state = fresh()
function fresh() { return { boardId: null, url: null, step: 0, busy: false, wait: null, usedThreads: new Set(), handledStickies: new Set(), history: [] } }

// ---------- chat events (server-sent) ----------
const clients = new Set()
function emit(ev) {
  state.history.push(ev)
  for (const res of clients) res.write(`data: ${JSON.stringify(ev)}\n\n`)
}

// ---------- the board ----------
async function api(method, p, body) {
  const headers = { 'content-type': 'application/json', 'x-actor': ACTOR, ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) }
  const res = await fetch(SERVER + p, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

// Plans go through the real CLI, which cuts each card's source preview from the corpus.
function put(planFile, replace = {}) {
  let plan = fs.readFileSync(planFile, 'utf8')
  for (const [k, v] of Object.entries(replace)) plan = plan.replaceAll(k, v)
  return new Promise((ok, fail) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'bin/wallflower.mjs'), 'put', '-'], { cwd: path.dirname(planFile), env: { ...process.env, WALLFLOWER_URL: SERVER, WALLFLOWER_BOARD: state.boardId, WALLFLOWER_ACTOR: ACTOR } })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => (code ? fail(new Error(out)) : ok(out)))
    p.stdin.end(plan)
  })
}

async function reset() {
  state.wait?.abort()
  state = fresh()
  const b = await api('POST', '/api/boards', { title: TITLE })
  const info = await api('GET', '/api/info')
  state.boardId = b.id
  state.url = `${info.ui}/?board=${b.id}`
  emit({ type: 'reset', board: { id: b.id, url: state.url, open: `${state.url}&name=${encodeURIComponent(PERSON)}` } })
  console.log(`\nnew board: ${state.url}\n  open it as ${PERSON}: ${state.url}&name=${encodeURIComponent(PERSON)}\n  chat: http://localhost:${PORT}\n`)
}

// ---------- reading the corpus, for tool blocks ----------
const read = (f) => fs.readFileSync(path.join(CORPUS, f), 'utf8')
function excerpt(file, needle, around = 2) {
  const lines = read(file).split('\n')
  let at = needle ? lines.findIndex((l) => l.includes(needle)) : lines.length - 1
  if (at < 0) at = 0
  while (!needle && at > 0 && !lines[at].trim()) at--
  const from = Math.max(0, at - around)
  const to = Math.min(lines.length, at + (needle ? around + 1 : 1))
  return { file, lines: lines.slice(from, to).map((text, i) => ({ n: from + i + 1, text: text.length > 160 ? text.slice(0, 157) + '…' : text, hit: !!needle && from + i === at })) }
}
const count = (dir, re) => fs.readdirSync(path.join(CORPUS, dir)).filter((f) => !re || re.test(f)).length
const slackMessages = () => fs.readdirSync(path.join(CORPUS, 'slack')).reduce((n, f) => n + (read(`slack/${f}`).match(/^\s*>?\s*\*\*[\w.-]+\*\*\s*·/gm) ?? []).length, 0)

let toolSeq = 0
async function tool({ name, title, detail = '', summary = '', file, needle, work, ms = 1500 }) {
  const id = `t${++toolSeq}`
  emit({ type: 'tool', id, name, title, detail, status: 'running', excerpt: file ? excerpt(file, needle) : null })
  const t0 = Date.now()
  const result = work ? await work() : undefined
  await sleep(Math.max(0, ms - (Date.now() - t0) / SPEED))
  emit({ type: 'tool', id, status: 'done', summary: typeof summary === 'function' ? summary(result) : summary })
  await sleep(250)
  return result
}

async function userSays(text, time) {
  if (time) emit({ type: 'time', label: time })
  emit({ type: 'user', text })
  await sleep(700 + text.length * 38) // the chat types it into the composer first
}
const agentSays = (text, extra = {}) => emit({ type: 'agent', text, ...extra })

// ---------- turns ----------
async function prep() {
  await userSays("can you put together a board for planning tomorrow. main thing is figuring out what we're doing in november. calls, slack, whatever's open in linear/gh", 'Wednesday 4:12 PM')
  emit({ type: 'thinking' })
  await sleep(900)
  await tool({ name: 'granola', title: 'Search meetings', detail: '"list" · since Oct 1', summary: `${count('granola')} meetings`, ms: 1200 })
  await tool({ name: 'granola', title: 'Read meeting', detail: 'Call with Teresa · Oct 14', file: 'granola/2026-10-14-call-teresa.md', needle: 'milk, the GOOD one', summary: 'transcript' })
  await tool({ name: 'granola', title: 'Read meeting', detail: 'Call with Jonah · Oct 16', file: 'granola/2026-10-16-call-jonah.md', needle: null, summary: 'recording ends early', ms: 1300 })
  await tool({ name: 'granola', title: 'Read meeting', detail: 'Call with Jonah · Oct 17', file: 'granola/2026-10-17-call-jonah.md', needle: 'I make the list, he gets blamed', summary: 'transcript' })
  await tool({ name: 'granola', title: 'Read meeting', detail: 'Call with Ana · Oct 21', file: 'granola/2026-10-21-call-ana.md', needle: 'She takes a picture of my fridge', summary: 'transcript' })
  await tool({ name: 'slack', title: 'Search messages', detail: '#product #support #random #eng · since Oct 1', file: 'slack/product.md', needle: 'competing with the camera roll', summary: `${slackMessages()} messages` })
  await tool({ name: 'support', title: 'Search tickets', detail: 'since Oct 1', file: 'support/2026-10-22-where-is-my-list.md', needle: 'the whole list disappeared', summary: `${count('support')} tickets` })
  await tool({ name: 'github', title: 'gh issue list · gh pr list', detail: 'larder/larder', file: 'github/pr-219-last-edited-by.md', needle: 'edited by Wes', summary: `${count('github', /^issue/)} issues · ${count('github', /^pr-/) + 4} PRs` })
  await tool({ name: 'linear', title: 'List issues', detail: 'Cycles 7–9', file: 'linear/LAR-88-item-comments.md', needle: 'Not for Q4', summary: `${count('linear', /^LAR/)} issues` })
  await tool({ name: 'notion', title: 'Read page', detail: 'Q4: Recipe import', file: 'notion/q4-recipe-import.md', needle: '+15% new households', summary: 'Oct 3' })
  await tool({ name: 'notion', title: 'Read page', detail: 'Recipe import, three weeks in', file: 'notion/recipe-import-three-weeks-in.md', needle: '3.1% of weekly actives', summary: 'Oct 24' })
  const out = await tool({ name: 'wallflower', title: 'wallflower put', detail: 'plan.json', ms: 1800, work: () => put(path.join(HERE, 'plans/first.json')), summary: (o) => (/layout check: no overlaps/.test(o) ? '15 cards · layout check passed' : '15 cards') })
  if (/problem:/.test(out)) console.warn(out)
  agentSays(`It's up: ${state.url}\n15 cards, mostly from the October calls and support, plus what's open in Linear and GitHub. Your Q4 doc and your numbers from last week are next to each other.\nGranola had two calls with Jonah. I used the 17th, the first one cuts off.`)
  state.step = 1
  waitLoop()
}

// Block in `wallflower wait` like a real agent; a pass arrives when someone presses the button.
async function waitLoop() {
  const ctrl = new AbortController()
  state.wait = ctrl
  while (!ctrl.signal.aborted) {
    try {
      const res = await fetch(`${SERVER}/api/boards/${state.boardId}/wait?ms=240000`, { headers: { 'x-actor': ACTOR }, signal: ctrl.signal })
      const text = await res.text()
      if (res.status === 200) await pass(text)
      else if (res.status >= 400) await sleep(3000)
    } catch (err) {
      if (ctrl.signal.aborted) return
      await new Promise((ok) => setTimeout(ok, 2000))
    }
  }
}

async function pass(round) {
  if (state.busy) return
  state.busy = true
  try {
    const who = /Requested by ([^\s]+)/.exec(round)?.[1] ?? PERSON
    const note = /Requested by [^\n]*?: "([^"]*)"/.exec(round)?.[1]
    const board = await api('GET', `/api/boards/${state.boardId}`)
    const stickies = Object.values(board.cards).filter((c) => c.kind === 'sticky' && !state.handledStickies.has(c.id)).sort((a, b) => b.n - a.n)
    emit({ type: 'time', label: PASS_TIMES[Math.min(state.usedThreads.size, PASS_TIMES.length - 1)] })
    emit({ type: 'thinking' })
    await tool({ name: 'wallflower', title: 'wallflower wait', detail: '', summary: `${who} asked for another pass`, ms: 900, file: null })
    const sticky = stickies[0]
    if (!sticky) {
      agentSays(`${who} asked for another pass${note ? `: "${note}"` : ''}. There's no new sticky to go on, so I left the board alone. Drop one where you want more.`)
      return
    }
    state.handledStickies.add(sticky.id)
    const hood = neighborhood(board, sticky, 6)
    const near = [hood.on, ...hood.nearest.map((x) => x.card)].filter(Boolean)
    const threads = near.map((c) => THREAD_OF[c.id]).filter((t) => t && !state.usedThreads.has(t))
    const thread = threads[0] ?? [1, 2, 3, 4, 5].find((t) => !state.usedThreads.has(t))
    if (!thread) { agentSays(`${who} asked for another pass. I've already put up everything I had behind those, so I left it.`); return }
    state.usedThreads.add(thread)
    for (const [name, title, detail, file, needle] of PASS_READS[thread]) await tool({ name, title, detail, file, needle, summary: 'read' })
    await tool({ name: 'wallflower', title: 'wallflower put', detail: `around #${sticky.n}`, ms: 1500, work: () => put(path.join(HERE, `plans/pass-${thread}.json`), { __STICKY__: sticky.id }), summary: '4 cards' })
    agentSays(`${who} asked for another pass. ${PASS_LINE[thread](sticky.title || 'the sticky')}`)
  } finally {
    state.busy = false
  }
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
const listJoin = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

async function readback() {
  if (state.busy) return
  state.busy = true
  try {
    await userSays("ok we're out. what moved", 'Thursday 12:02 PM')
    emit({ type: 'thinking' })
    const [d, md, board] = await tool({ name: 'wallflower', title: 'wallflower diff', detail: '', ms: 1400, work: () => Promise.all([api('GET', `/api/boards/${state.boardId}/diff?format=json`), api('GET', `/api/boards/${state.boardId}/diff`), api('GET', `/api/boards/${state.boardId}`)]), summary: (r) => (r[0] ? `${r[0].summary.events} changes by people` : 'nobody touched it') })
    if (!d) { agentSays("Nobody touched the board, so there's nothing to read back."); return }
    const name = (id) => SHORT[id] ?? (board.cards[id]?.kind === 'sticky' ? `the sticky "${board.cards[id].title}"` : board.cards[id]?.title ?? id)
    // Pairings: cards people left overlapping that I didn't put together.
    const cards = Object.values(board.cards).filter((c) => c.kind !== 'sticky')
    const meant = (a, b) => (a.meta?.placement?.near === b.id && a.meta?.placement?.overlap) || (b.meta?.placement?.near === a.id && b.meta?.placement?.overlap)
    const pairs = []
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const [a, b] = [cards[i], cards[j]]
      if ((a.pinned || b.pinned) && overlaps(a, b) && !meant(a, b) && area(a, b) >= 0.1 * Math.min(a.w * a.h, b.w * b.h)) pairs.push([a, b])
    }
    const lines = []
    if (pairs.length) {
      const pick = pairs.find(([a, b]) => THREAD_OF[a.id] !== THREAD_OF[b.id]) ?? pairs[0]
      lines.push(`${WORDS[pairs.length] ?? pairs.length} pairing${pairs.length === 1 ? '' : 's'} I hadn't made${pairs.length === 1 ? ':' : ', one of them'} ${name(pick[0].id)} next to ${name(pick[1].id)}.`)
    }
    const names = d.renames.filter((r) => r.to).map((r) => `"${r.to}"`)
    if (names.length === 1) lines.push(`One group got a name, ${names[0]}.`)
    else if (names.length) lines.push(`${WORDS[names.length] ?? names.length} groups got names: ${listJoin(names)}.`)
    const zone = 'november'
    const out = d.cards.filter((c) => c.groupBefore === zone && c.groupAfter !== zone && c.status !== 'deleted').map((c) => name(c.id))
    const inn = d.cards.filter((c) => (c.groupAfter === zone && c.groupBefore !== zone) || (c.status === 'added' && c.group === zone)).map((c) => name(c.id))
    const zl = []
    if (out.length) zl.push(`${listJoin(out)} came out of November`)
    if (inn.length) zl.push(`${listJoin(inn)} went in`)
    if (zl.length) lines.push(zl.join(', and ').replace(/^./, (c) => c.toUpperCase()) + '.')
    if (!lines.length) lines.push(`${d.summary.events} changes, but nothing regrouped, paired, or moved into November.`)
    agentSays(`${lines.join(' ')}\nFull read-back's below if you want it.`, { details: { label: 'Read-back', markdown: md } })
  } finally {
    state.busy = false
  }
}

// ---------- the chat window ----------
const CHAT = path.join(HERE, 'chat')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(`data: ${JSON.stringify({ type: 'replay', events: state.history })}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  if (req.method === 'POST' && url.pathname === '/next') {
    res.end('ok')
    if (state.busy) return
    if (state.step === 0) { state.busy = true; try { await prep() } catch (err) { console.error(err) } finally { state.busy = false } }
    else if (state.step === 1) { try { await readback() } catch (err) { console.error(err) } }
    return
  }
  if (req.method === 'POST' && url.pathname === '/reset') { await reset().catch((err) => console.error(err)); return res.end('ok') }
  const file = path.join(CHAT, url.pathname === '/' ? 'index.html' : path.basename(url.pathname))
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'text/plain' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, '127.0.0.1', async () => {
  try { await reset() } catch (err) { console.error(`can't reach the board server at ${SERVER}: ${err.message}`); process.exit(1) }
})
