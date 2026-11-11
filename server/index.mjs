import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { env, homeDir } from './env.mjs'
import { BoardStore, PROPOSED } from './store.mjs'
import { diffBoards, diffToMarkdown } from './diff.mjs'
import { boardToAscii, boardToListing } from './ascii.mjs'
import { checkBoard } from './arrange.mjs'
import { roundToMarkdown } from './round.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// PORT is what hosts like Railway set; WALLFLOWER_PORT wins when both are present.
const PORT = Number(env('PORT') ?? process.env.PORT ?? 8787)
const HOST = env('HOST') ?? '127.0.0.1'
const DIST = path.join(root, 'dist')
// Where people open boards: the Vite dev server in development, this server when it serves the built UI.
const UI = env('UI') ?? (env('DEV') ? `http://localhost:${env('UI_PORT') ?? 5173}` : `http://localhost:${PORT}`)
const store = new BoardStore(env('DATA') ?? path.join(homeDir(), 'data'))
const MAX_BODY = 1024 * 1024

// Hosted mode. With WALLFLOWER_TOKEN set, a board's id is its capability: new ids are random
// (144 bits), and anyone holding a board's link can view, edit, and read it back. The token
// gates only what isn't scoped to one board: listing every board and creating new ones.
const TOKEN = env('TOKEN') || null
const digest = (s) => crypto.createHash('sha256').update(s).digest()
function hasToken(req) {
  if (!TOKEN) return true
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  return !!m && crypto.timingSafeEqual(digest(m[1]), digest(TOKEN))
}

// A public server: with WALLFLOWER_PUBLIC=1 on a hosted server, anyone can create a board without
// the token. Listing every board still needs it. Public boards are rate-limited at creation and,
// with WALLFLOWER_RETAIN_DAYS set, deleted once nobody has touched them for that many days.
const PUBLIC = !!TOKEN && /^(1|true|yes)$/i.test(env('PUBLIC') ?? '')
const RETAIN_DAYS = Number(env('RETAIN_DAYS')) || 0
const PER_HOUR = Number(env('CREATE_PER_HOUR')) || 20 // per client address
const PER_HOUR_ALL = Number(env('CREATE_PER_HOUR_ALL')) || 300 // across everyone
// Behind a proxy, the client's address comes from a header the proxy sets (e.g. x-real-ip).
// For x-forwarded-for, the last entry is the one the nearest proxy added.
const CLIENT_IP_HEADER = (env('CLIENT_IP_HEADER') ?? '').toLowerCase()
function clientAddr(req) {
  const h = CLIENT_IP_HEADER && req.headers[CLIENT_IP_HEADER]
  return (h ? String(h).split(',').at(-1).trim() : '') || req.socket.remoteAddress || 'unknown'
}
const created = [] // [time, address] of public creations in the last hour
function overCreateLimit(addr) {
  const hourAgo = Date.now() - 3600_000
  while (created.length && created[0][0] < hourAgo) created.shift()
  if (created.length >= PER_HOUR_ALL) return 'this server has made too many boards in the last hour; try again later'
  if (created.filter(([, a]) => a === addr).length >= PER_HOUR) return `at most ${PER_HOUR} new boards an hour from one address; try again later`
  return null
}

// Deleting a board takes the server's token or the key handed back when the board was created.
function canDelete(req, id) {
  if (hasToken(req)) return true // a local server without a token trusts everyone who can reach it
  const key = req.headers['x-owner-key']
  const owner = store.owner(id)
  return !!(key && owner?.keyHash) && crypto.timingSafeEqual(digest(String(key)), Buffer.from(owner.keyHash, 'hex'))
}

function dropBoard(id) {
  for (const ws of sockets.get(id) ?? []) ws.close(4004, 'board deleted')
  sockets.delete(id)
  for (const w of waiters.get(id) ?? []) { clearTimeout(w.timer); send(w.res, 404, { error: `board ${id} was deleted` }) }
  waiters.delete(id)
  presence.delete(id)
  store.remove(id)
}

// Public boards nobody has touched in RETAIN_DAYS are deleted; boards made with the token are kept.
function sweep() {
  if (!RETAIN_DAYS) return
  const cutoff = Date.now() - RETAIN_DAYS * 86400_000
  for (const id of store.list()) {
    if (!store.owner(id)?.public || sockets.get(id)?.size || store.lastActive(id) > cutoff) continue
    dropBoard(id)
    console.log(`deleted board ${id}: idle for more than ${RETAIN_DAYS} days`)
  }
}

// There is no login, so only answer requests addressed to a loopback name or a host listed in
// WALLFLOWER_ALLOWED_HOSTS (comma-separated; ".example.com" matches subdomains, "all" matches
// anything). Checking Host blocks DNS rebinding; checking Origin stops other sites' pages,
// which can open WebSockets to localhost freely, from editing boards.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const ALLOWED = (env('ALLOWED_HOSTS') ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)

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
const waiters = new Map() // boardId -> Set<{ res, actor, timer }>: agents blocked in `wallflower wait`
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
    if (!requestAllowed(req)) return send(res, 403, { error: 'host not allowed; see WALLFLOWER_ALLOWED_HOSTS' })
    const url = new URL(req.url, `http://${req.headers.host}`)
    const actor = req.headers['x-actor'] || url.searchParams.get('actor') || 'agent:unknown'
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'api') return req.method === 'GET' ? serveStatic(res, url.pathname) : send(res, 404, { error: 'not found' })
    // hosted: board links work for anyone who has them, so the CLI can say a link is safe to share.
    if (parts[1] === 'info' && parts.length === 2) return send(res, 200, { ui: UI, hosted: !!TOKEN, public: PUBLIC, retainDays: PUBLIC ? RETAIN_DAYS || null : null })

    if (parts[1] === 'boards' && parts.length === 2) {
      const authed = hasToken(req)
      if (!authed && !(PUBLIC && req.method === 'POST')) return send(res, 401, { error: PUBLIC ? 'this server needs WALLFLOWER_TOKEN to list boards; open a board by its link' : 'this server needs WALLFLOWER_TOKEN to list or create boards; open a board by its link' })
      if (req.method === 'GET') return send(res, 200, store.list().map((id) => { const b = store.get(id); return { id, title: b.title, cards: Object.keys(b.cards).length, rev: b.rev } }))
      if (req.method === 'POST') {
        const { id: wanted, ...rest } = await body(req)
        if (TOKEN && wanted) return send(res, 400, { error: 'custom board ids are off on a hosted server, so links stay unguessable' })
        const addr = clientAddr(req)
        if (!authed) { const over = overCreateLimit(addr); if (over) return send(res, 429, { error: over }) }
        const b = store.create({ ...rest, id: TOKEN ? crypto.randomBytes(18).toString('base64url') : wanted }, actor)
        const ownerKey = crypto.randomBytes(18).toString('base64url')
        store.setOwner(b.id, { keyHash: digest(ownerKey).toString('hex'), public: !authed, createdAt: b.createdAt })
        if (!authed) { created.push([Date.now(), addr]); console.log(`public board created (${created.length} this hour)`) }
        return send(res, 201, { id: b.id, title: b.title, ownerKey })
      }
    }
    const id = parts[2]
    const board = id && store.get(id)
    if (!board) return send(res, 404, { error: `board ${id} not found` })
    const sub = parts[3]

    if (!sub && req.method === 'GET') return send(res, 200, board)
    if (!sub && req.method === 'DELETE') {
      if (!canDelete(req, id)) return send(res, 403, { error: 'only whoever created this board (or the server token) can delete it' })
      dropBoard(id)
      return send(res, 200, { deleted: id })
    }
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
      if (!from) return url.searchParams.get('format') === 'json' ? send(res, 200, null) : send(res, 200, 'Nobody has touched the board yet.\n', 'text/plain')
      const d = diffBoards(from, board, store.events(id))
      if (url.searchParams.get('format') === 'json') return send(res, 200, d)
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

server.listen(PORT, HOST, () => console.log(`wallflower server on http://${HOST.includes(':') ? `[${HOST}]` : HOST}:${PORT}, boards at ${UI}${PUBLIC ? ` (public: anyone can create boards${RETAIN_DAYS ? `; idle public boards deleted after ${RETAIN_DAYS} days` : ''})` : TOKEN ? ' (hosted: token required to list or create boards)' : ''}`))
if (RETAIN_DAYS) { sweep(); setInterval(sweep, 3600_000).unref() }
