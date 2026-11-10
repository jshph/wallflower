import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { BoardStore, PROPOSED } from './store.mjs'
import { diffBoards, diffToMarkdown } from './diff.mjs'
import { boardToAscii, boardToListing } from './ascii.mjs'
import { checkBoard } from './arrange.mjs'
import { roundToMarkdown } from './round.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// PORT is what hosts like Railway set; ROOMBOARD_PORT wins when both are present.
const PORT = Number(process.env.ROOMBOARD_PORT ?? process.env.PORT ?? 8787)
const HOST = process.env.ROOMBOARD_HOST ?? '127.0.0.1'
const DIST = path.join(root, 'dist')
// Where people open boards: the Vite dev server in development, this server when it serves the built UI.
const UI = process.env.ROOMBOARD_UI ?? (process.env.ROOMBOARD_DEV ? `http://localhost:${process.env.ROOMBOARD_UI_PORT ?? 5173}` : `http://localhost:${PORT}`)
const store = new BoardStore(process.env.ROOMBOARD_DATA ?? path.join(os.homedir(), '.roomboard', 'data'))
const MAX_BODY = 1024 * 1024

// Hosted mode. With ROOMBOARD_TOKEN set, a board's id is its capability: new ids are random
// (144 bits), and anyone holding a board's link can view, edit, and read it back. The token
// gates only what isn't scoped to one board: listing every board and creating new ones.
const TOKEN = process.env.ROOMBOARD_TOKEN || null
const digest = (s) => crypto.createHash('sha256').update(s).digest()
function hasToken(req) {
  if (!TOKEN) return true
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  return !!m && crypto.timingSafeEqual(digest(m[1]), digest(TOKEN))
}

// There is no login, so only answer requests addressed to a loopback name or a host listed in
// ROOMBOARD_ALLOWED_HOSTS (comma-separated; ".example.com" matches subdomains, "all" matches
// anything). Checking Host blocks DNS rebinding; checking Origin stops other sites' pages,
// which can open WebSockets to localhost freely, from editing boards.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const ALLOWED = (process.env.ROOMBOARD_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)

function hostAllowed(hostname) {
  hostname = hostname.toLowerCase()
  return LOOPBACK.has(hostname) || ALLOWED.some((a) => a === 'all' || a === hostname || (a.startsWith('.') && (hostname.endsWith(a) || hostname === a.slice(1))))
}

function requestAllowed(req) {
  try {
    if (!hostAllowed(new URL(`http://${req.headers.host}`).hostname)) return false
    return !req.headers.origin || hostAllowed(new URL(req.headers.origin).hostname)
  } catch {
    return false
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' }

// Serve the built client from dist/, falling back to index.html for board URLs.
function serveStatic(res, pathname) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) return send(res, 404, 'No built UI here. Run `npm run build`, or `npm run dev` and open the Vite URL.\n', 'text/plain')
  let file = path.join(DIST, path.normalize(decodeURIComponent(pathname)))
  if (!file.startsWith(DIST + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

const sockets = new Map() // boardId -> Set<ws>
const presence = new Map() // boardId -> Map<actor, {status, t}>
const viewers = new Map() // `${boardId} ${actor}` -> open socket count
const waiters = new Map() // boardId -> Set<{ res, actor, timer }>: agents blocked in `board wait`
const WAIT_MS = 240_000 // under undici's 300s header timeout; the CLI re-polls

function broadcast(boardId, msg) {
  const data = JSON.stringify(msg)
  for (const ws of sockets.get(boardId) ?? []) if (ws.readyState === 1) ws.send(data)
}

function presenceList(boardId) {
  return [...(presence.get(boardId) ?? new Map()).entries()].map(([actor, p]) => ({ actor, ...p }))
}

const presenceTimers = new Map()
function setPresence(boardId, actor, status, ttlMs) {
  if (!presence.has(boardId)) presence.set(boardId, new Map())
  if (status) presence.get(boardId).set(actor, { status, t: Date.now() })
  else presence.get(boardId).delete(actor)
  const key = `${boardId} ${actor}`
  clearTimeout(presenceTimers.get(key))
  if (status && ttlMs) presenceTimers.set(key, setTimeout(() => setPresence(boardId, actor, null), ttlMs))
  broadcast(boardId, { type: 'presence', presence: presenceList(boardId) })
}

// If an agent is waiting and someone has asked for another pass, hand it over now.
function servePass(boardId) {
  const set = waiters.get(boardId)
  if (!set?.size || !store.passPending(boardId)) return
  const round = store.takePass(boardId)
  const text = roundToMarkdown(store.get(boardId), round) + '\n'
  for (const w of set) {
    clearTimeout(w.timer)
    send(w.res, 200, text, 'text/plain')
    setPresence(boardId, w.actor, 'working', 10 * 60_000)
  }
  set.clear()
  broadcast(boardId, { type: 'changes', changes: [{ t: 'pass-taken', rec: { seq: store.get(boardId).passTaken }, delay: 0 }], actor: null, origin: null })
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function body(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) throw new HttpError(413, `request body over ${MAX_BODY} bytes`)
    chunks.push(c)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function send(res, status, data, type = 'application/json') {
  if (res.headersSent) return res.end()
  res.writeHead(status, { 'content-type': type })
  res.end(type === 'application/json' ? JSON.stringify(data, null, 2) : data)
}

function applyAndBroadcast(id, actor, fn) {
  const result = fn()
  broadcast(id, { type: 'changes', changes: result.changes, actor, origin: null })
  if (result.changes.some((c) => c.t === 'pass')) servePass(id)
  return result
}

const server = http.createServer(async (req, res) => {
  // Board links are capabilities: keep them out of Referer headers and search indexes.
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('x-robots-tag', 'noindex, nofollow')
  try {
    if (!requestAllowed(req)) return send(res, 403, { error: 'host not allowed; see ROOMBOARD_ALLOWED_HOSTS' })
    const url = new URL(req.url, `http://${req.headers.host}`)
    const actor = req.headers['x-actor'] || url.searchParams.get('actor') || 'agent:unknown'
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'api') return req.method === 'GET' ? serveStatic(res, url.pathname) : send(res, 404, { error: 'not found' })
    // hosted: board links work for anyone who has them, so the CLI can say a link is safe to share.
    if (parts[1] === 'info' && parts.length === 2) return send(res, 200, { ui: UI, hosted: !!TOKEN })

    if (parts[1] === 'boards' && parts.length === 2) {
      if (!hasToken(req)) return send(res, 401, { error: 'this server needs ROOMBOARD_TOKEN to list or create boards; open a board by its link' })
      if (req.method === 'GET') return send(res, 200, store.list().map((id) => { const b = store.get(id); return { id, title: b.title, cards: Object.keys(b.cards).length, rev: b.rev } }))
      if (req.method === 'POST') {
        const { id: wanted, ...rest } = await body(req)
        if (TOKEN && wanted) return send(res, 400, { error: 'custom board ids are off on a hosted server, so links stay unguessable' })
        const b = store.create({ ...rest, id: TOKEN ? crypto.randomBytes(18).toString('base64url') : wanted }, actor)
        return send(res, 201, { id: b.id, title: b.title })
      }
    }
    const id = parts[2]
    const board = id && store.get(id)
    if (!board) return send(res, 404, { error: `board ${id} not found` })
    const sub = parts[3]

    if (!sub && req.method === 'GET') return send(res, 200, board)
    if (sub === 'view') {
      const f = url.searchParams.get('format') ?? 'both'
      if (f === 'json') return send(res, 200, board)
      const out = f === 'ascii' ? boardToAscii(board) : f === 'listing' ? boardToListing(board) : `${boardToAscii(board)}\n\n${boardToListing(board)}`
      const problems = f === 'ascii' ? [] : checkBoard(board)
      return send(res, 200, out + (problems.length ? `\n\nProblems:\n${problems.map((p) => `- ${p.message}`).join('\n')}` : '') + '\n', 'text/plain')
    }
    if (sub === 'plan' && req.method === 'POST') {
      const plan = await body(req)
      const r = applyAndBroadcast(id, actor, () => store.applyPlan(id, plan, actor))
      return send(res, 200, { warnings: r.warnings, problems: r.problems.map((p) => p.message), ascii: boardToAscii(store.get(id)) })
    }
    if (sub === 'wait' && req.method === 'GET') {
      if (store.passPending(id)) {
        const text = roundToMarkdown(store.get(id), store.takePass(id)) + '\n'
        broadcast(id, { type: 'changes', changes: [{ t: 'pass-taken', rec: {}, delay: 0 }], actor: null, origin: null })
        setPresence(id, actor, 'working', 10 * 60_000)
        return send(res, 200, text, 'text/plain')
      }
      if (!waiters.has(id)) waiters.set(id, new Set())
      const w = { res, actor }
      const holdMs = Math.min(WAIT_MS, Number(url.searchParams.get('ms')) || WAIT_MS)
      w.timer = setTimeout(() => { waiters.get(id)?.delete(w); setPresence(id, actor, null); send(res, 204, '', 'text/plain') }, holdMs)
      res.on('close', () => { if (waiters.get(id)?.delete(w)) { clearTimeout(w.timer); setPresence(id, actor, null) } })
      waiters.get(id).add(w)
      setPresence(id, actor, 'waiting')
      return
    }
    if (sub === 'diff') {
      const from = store.getSnapshot(id, PROPOSED)
      if (!from) return send(res, 200, 'Nobody has touched the board yet.\n', 'text/plain')
      const d = diffBoards(from, board, store.events(id))
      return send(res, 200, diffToMarkdown(d, from.state, board) + '\n', 'text/plain')
    }
    return send(res, 404, { error: 'not found' })
  } catch (err) {
    send(res, err.status ?? 400, { error: err.message })
  }
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_BODY, verifyClient: ({ req }) => requestAllowed(req) })
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x')
  const id = url.searchParams.get('board')
  const actor = url.searchParams.get('actor') || 'human:anonymous'
  const client = url.searchParams.get('client')
  const board = store.get(id)
  if (!board) { ws.close(4004, 'board not found'); return }
  if (!sockets.has(id)) sockets.set(id, new Set())
  sockets.get(id).add(ws)
  ws.send(JSON.stringify({ type: 'init', board, presence: presenceList(id) }))
  const key = `${id} ${actor}`
  viewers.set(key, (viewers.get(key) ?? 0) + 1)
  setPresence(id, actor, 'viewing')
  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }
    // A browser found a card whose text doesn't fit: the agent hears about it on its next put or view.
    if (msg.type === 'overflow' && typeof msg.id === 'string') store.reportOverflow(id, msg.id, Number(msg.by))
    if (msg.type === 'ops' && Array.isArray(msg.ops) && msg.ops.length) {
      try {
        const r = store.apply(id, msg.ops, actor)
        broadcast(id, { type: 'changes', changes: r.changes, actor, origin: client })
        if (r.changes.some((c) => c.t === 'pass')) servePass(id)
        if (r.warnings.length) ws.send(JSON.stringify({ type: 'warnings', warnings: r.warnings }))
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: err.message }))
      }
    }
  })
  ws.on('close', () => {
    sockets.get(id)?.delete(ws)
    viewers.set(key, viewers.get(key) - 1)
    if (!viewers.get(key)) setPresence(id, actor, null)
  })
})

server.listen(PORT, HOST, () => console.log(`roomboard server on http://${HOST.includes(':') ? `[${HOST}]` : HOST}:${PORT}, boards at ${UI}${TOKEN ? ' (hosted: token required to list or create boards)' : ''}`))
