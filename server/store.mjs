import fs from 'node:fs'
import path from 'node:path'
import { cleanPassage } from './passage.mjs'
import { cardSize, GRID, membershipOf, normalizeCopy, resolvePlace, KINDS } from './layout.mjs'
import { arrangeBoard, checkBoard, fitGroups, settleBoard } from './arrange.mjs'

const isHuman = (actor) => typeof actor === 'string' && actor.startsWith('human:')

const CONTENT_FIELDS = ['kind', 'title', 'body', 'source', 'people', 'meta']
export const PROPOSED = 'proposed'
export const ROUND = 'round'
const MOVE_COALESCE_MS = 2500
// Board ids become directory names, so keep them to one safe path segment.
const VALID_ID = /^[\w-]{1,64}$/

export class BoardStore {
  constructor(dataDir) {
    this.dataDir = dataDir
    this.boards = new Map()
    fs.mkdirSync(path.join(dataDir, 'boards'), { recursive: true })
  }

  dir(id) {
    return path.join(this.dataDir, 'boards', id)
  }

  list() {
    return fs.readdirSync(path.join(this.dataDir, 'boards')).filter((d) => fs.existsSync(path.join(this.dir(d), 'state.json')))
  }

  get(id) {
    if (typeof id !== 'string' || !VALID_ID.test(id)) return null
    if (this.boards.has(id)) return this.boards.get(id)
    const file = path.join(this.dir(id), 'state.json')
    if (!fs.existsSync(file)) return null
    const board = JSON.parse(fs.readFileSync(file, 'utf8'))
    this.migrate(board)
    this.boards.set(id, board)
    return board
  }

  // Boards from before layout v2 don't record what people placed; read it from the log.
  migrate(board) {
    if (board.layout >= 2) return
    for (const e of this.events(board.id)) {
      if (!isHuman(e.actor) || !e.id) continue
      const item = e.op.startsWith('card.') ? board.cards[e.id] : e.op.startsWith('cluster.') ? board.clusters[e.id] : null
      if (item && (['card.create', 'card.move', 'cluster.create'].includes(e.op) || (e.op === 'cluster.update' && (e.moved || e.resized)))) item.pinned = true
    }
    board.layout = 2
  }

  create({ id, title = 'Untitled board' }, actor) {
    id = id || `b${Date.now().toString(36)}`
    if (typeof id !== 'string' || !VALID_ID.test(id)) throw new Error(`board id must be letters, digits, - or _ (got ${JSON.stringify(id)})`)
    if (this.get(id)) throw new Error(`board ${id} already exists`)
    const board = { id, title, createdAt: new Date().toISOString(), createdBy: actor, rev: 0, nextN: 1, clusters: {}, cards: {} }
    fs.mkdirSync(path.join(this.dir(id), 'snapshots'), { recursive: true })
    this.boards.set(id, board)
    this.save(board)
    this.log(board, actor, { op: 'board.create', title })
    return board
  }

  save(board) {
    fs.writeFileSync(path.join(this.dir(board.id), 'state.json'), JSON.stringify(board, null, 2))
  }

  log(board, actor, entry) {
    const file = path.join(this.dir(board.id), 'events.jsonl')
    const line = { seq: board.rev, t: new Date().toISOString(), actor, ...entry }
    // Collapse a drag into one entry: consecutive moves of the same card by the same actor.
    if (entry.op === 'card.move' && this.lastMove && this.lastMove.board === board.id && this.lastMove.actor === actor && this.lastMove.id === entry.id && Date.now() - this.lastMove.at < MOVE_COALESCE_MS) {
      const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n')
      const prev = JSON.parse(lines.pop())
      prev.to = entry.to
      prev.toGroup = entry.toGroup
      prev.t = line.t
      lines.push(JSON.stringify(prev))
      fs.writeFileSync(file, lines.join('\n') + '\n')
      this.lastMove.at = Date.now()
      return
    }
    fs.appendFileSync(file, JSON.stringify(line) + '\n')
    this.lastMove = entry.op === 'card.move' ? { board: board.id, actor, id: entry.id, at: Date.now() } : null
  }

  events(id, sinceSeq = -1) {
    const file = path.join(this.dir(id), 'events.jsonl')
    if (!fs.existsSync(file)) return []
    return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.seq > sinceSeq)
  }

  snapshot(id, label, actor) {
    const board = this.get(id)
    const snap = { label, t: new Date().toISOString(), rev: board.rev, actor, state: JSON.parse(JSON.stringify(board)) }
    fs.mkdirSync(path.join(this.dir(id), 'snapshots'), { recursive: true })
    fs.writeFileSync(path.join(this.dir(id), 'snapshots', `${label}.json`), JSON.stringify(snap, null, 2))
    return { label, rev: board.rev, t: snap.t }
  }

  // Someone pressed "Take another pass". Is there a request the agent hasn't taken yet?
  passPending(id) {
    const b = this.get(id)
    return (b.passRequested ?? -1) > (b.passTaken ?? -1)
  }

  // Hand the agent this round: the board as it was when people started the round,
  // the events since, and the requests (with their optional notes). Closes the round.
  takePass(id) {
    if (!this.passPending(id)) return null
    const board = this.get(id)
    const start = this.getSnapshot(id, ROUND)
    const events = this.events(id, start?.rev ?? -1)
    board.passTaken = board.passRequested
    board.roundOpen = false
    this.save(board)
    return { start, events, requests: events.filter((e) => e.op === 'pass.request') }
  }

  getSnapshot(id, label) {
    const file = path.join(this.dir(id), 'snapshots', `${label}.json`)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }

  // Apply a batch of ops. Returns { changes, warnings } where changes are full
  // records to broadcast, each with a stagger delay for the client's entrance.
  // defer: before people start, positions are left to arrangeBoard(), which lays out the
  // whole board from the stored intents once the plan's ops are in.
  apply(id, ops, actor, { staggerMs = 0, defer = false } = {}) {
    const board = this.get(id)
    if (!board) throw new Error(`board ${id} not found`)
    // The agent's proposal is whatever the board looked like just before a person first touched it.
    if (actor.startsWith('human:')) {
      if (!this.getSnapshot(id, PROPOSED)) this.snapshot(id, PROPOSED, board.createdBy)
      // Each round of people's work starts from the board as they found it.
      if (!board.roundOpen) { this.snapshot(id, ROUND, board.createdBy); board.roundOpen = true }
    }
    const warnings = []
    const changes = []
    let order = 0
    const emit = (t, rec) => {
      const existing = changes.findIndex((c) => c.t === t && c.rec?.id === rec.id)
      const change = { t, rec: JSON.parse(JSON.stringify(rec)), delay: staggerMs * order++, actor }
      if (existing >= 0) changes[existing] = { ...change, delay: changes[existing].delay }
      else changes.push(change)
    }
    const emitDel = (t, id) => changes.push({ t, id, delay: 0, actor })

    for (const op of ops) {
      board.rev += 1
      switch (op.op) {
        case 'board.update': {
          if (op.title != null) board.title = op.title
          changes.push({ t: 'board', rec: { title: board.title }, delay: 0, actor })
          this.log(board, actor, { op: op.op, title: op.title })
          break
        }
        case 'cluster.upsert': {
          const existing = board.clusters[op.id]
          const cl = existing ?? { id: op.id, label: '', role: 'cluster', x: 0, y: 0, w: GRID.zoneW, h: GRID.zoneH, createdBy: actor, meta: {} }
          for (const k of ['label', 'role', 'cols']) if (op[k] != null) cl[k] = op[k]
          if (op.why) cl.meta = { ...cl.meta, why: op.why }
          if (op.w) cl.w = op.w
          if (op.h) cl.h = op.h
          const grid = op.grid ?? (op.at?.col != null ? { col: op.at.col, row: op.at.row ?? 0 } : null)
          if (grid) {
            cl.grid = grid
            if (!existing && !defer) Object.assign(cl, newGroupSpot(board, cl))
          } else if (op.at) {
            cl.x = op.at.x
            cl.y = op.at.y
          } else if (op.x != null) {
            cl.x = op.x
            cl.y = op.y
          }
          cl.updatedBy = actor
          // Whatever a person makes or places stays where they put it; layout works around it.
          if (isHuman(actor) && (!existing || op.x != null || op.at)) cl.pinned = true
          board.clusters[cl.id] = cl
          emit('cluster', cl)
          this.log(board, actor, { op: existing ? 'cluster.update' : 'cluster.create', id: cl.id, label: cl.label, role: cl.role, rect: { x: cl.x, y: cl.y, w: cl.w, h: cl.h }, ...(existing && op.label != null && existing.label !== op.label ? { renamedFrom: existing.label } : {}) })
          break
        }
        case 'cluster.update': {
          const cl = board.clusters[op.id]
          if (!cl) { warnings.push(`cluster ${op.id} not found`); break }
          const before = { label: cl.label, x: cl.x, y: cl.y, w: cl.w, h: cl.h }
          for (const k of ['label', 'x', 'y', 'w', 'h']) if (op[k] != null) cl[k] = op[k]
          if (isHuman(actor) && ['x', 'y', 'w', 'h'].some((k) => op[k] != null && op[k] !== before[k])) cl.pinned = true
          cl.updatedBy = actor
          emit('cluster', cl)
          const entry = { op: 'cluster.update', id: cl.id }
          if (op.label != null && op.label !== before.label) Object.assign(entry, { renamedFrom: before.label, label: op.label })
          if ((op.x != null && op.x !== before.x) || (op.y != null && op.y !== before.y)) entry.moved = true
          if ((op.w != null && op.w !== before.w) || (op.h != null && op.h !== before.h)) entry.resized = true
          if (Object.keys(entry).length > 2) this.log(board, actor, entry)
          break
        }
        case 'cluster.delete': {
          if (!board.clusters[op.id]) break
          const label = board.clusters[op.id].label
          delete board.clusters[op.id]
          emitDel('cluster-del', op.id)
          this.log(board, actor, { op: 'cluster.delete', id: op.id, label })
          break
        }
        case 'card.upsert':
        case 'card.update': {
          const existing = board.cards[op.id]
          if (!existing && op.op === 'card.update') { warnings.push(`card ${op.id} not found`); break }
          let card = existing ? { ...existing } : { id: op.id, n: board.nextN++, kind: op.kind ?? 'note', title: '', body: '', people: [], source: {}, meta: {}, createdBy: actor, createdAt: new Date().toISOString() }
          if (!KINDS[op.kind ?? card.kind]) { warnings.push(`card ${op.id}: unknown kind ${op.kind}; using note`); op.kind = 'note' }
          const changed = []
          for (const k of CONTENT_FIELDS) {
            if (op[k] === undefined) continue
            const val = k === 'meta' ? { ...card.meta, ...op.meta } : op[k]
            if (JSON.stringify(card[k]) !== JSON.stringify(val)) changed.push(k)
            card[k] = val
          }
          if (op.why) card.meta = { ...card.meta, why: op.why }
          card = normalizeCopy(card, warnings)
          if (card.source?.passage !== undefined) {
            const { passage, ...rest } = card.source
            const clean = cleanPassage(passage, warnings, card.id)
            card.source = clean ? { ...rest, passage: clean } : rest
          }
          const size = cardSize(card)
          card.w = size.w
          card.h = size.h
          card.updatedBy = actor
          if (!existing || op.place || op.x != null) {
            const place = op.place ?? (op.x != null ? { at: { x: op.x, y: op.y } } : undefined)
            // Raw coordinates (people dragging, agents giving --x/--y) are taken as-is.
            // Before people start, the plan's arrangement places everything afterwards.
            const r = op.x != null && !op.place ? { x: op.x, y: op.y } : defer ? { x: card.x ?? 0, y: card.y ?? 0 } : resolvePlace(board, card, place, warnings)
            card.x = Math.round(r.x)
            card.y = Math.round(r.y)
            if (op.place) card.meta = { ...card.meta, placement: op.place }
            if (isHuman(actor)) card.pinned = true
          }
          board.cards[card.id] = card
          emit('card', card)
          // A placement into a cluster may have grown it.
          if (op.place?.in && board.clusters[op.place.in]) emit('cluster', board.clusters[op.place.in])
          const seedId = op.place?.near ?? op.place?.around
          if (seedId) { const home = board.cards[seedId] && board.clusters[membershipOf(board.cards[seedId], board.clusters)]; if (home) emit('cluster', home) }
          if (!existing) this.log(board, actor, { op: 'card.create', id: card.id, n: card.n, kind: card.kind, title: card.title, at: { x: card.x, y: card.y }, placement: op.place })
          else if (changed.length) this.log(board, actor, { op: 'card.edit', id: card.id, n: card.n, fields: changed, before: Object.fromEntries(changed.map((k) => [k, existing[k]])), after: Object.fromEntries(changed.map((k) => [k, card[k]])) })
          break
        }
        case 'card.move': {
          const card = board.cards[op.id]
          if (!card) { warnings.push(`card ${op.id} not found`); break }
          const from = { x: card.x, y: card.y }
          if (card.pinned && !isHuman(actor)) { warnings.push(`#${card.n} ${card.id} was placed by a person; left where they put it`); break }
          const r = op.place ? (defer ? from : resolvePlace(board, card, op.place, warnings)) : { x: op.x, y: op.y }
          card.x = Math.round(r.x)
          card.y = Math.round(r.y)
          card.updatedBy = actor
          if (isHuman(actor)) card.pinned = true
          if (op.place) card.meta = { ...card.meta, placement: op.place }
          emit('card', card)
          if (op.place?.in && board.clusters[op.place.in]) emit('cluster', board.clusters[op.place.in])
          const seedId = op.place?.near ?? op.place?.around
          if (seedId) { const home = board.cards[seedId] && board.clusters[membershipOf(board.cards[seedId], board.clusters)]; if (home) emit('cluster', home) }
          this.log(board, actor, { op: 'card.move', id: card.id, n: card.n, from, to: { x: card.x, y: card.y } })
          break
        }
        case 'card.delete': {
          const card = board.cards[op.id]
          if (!card) break
          delete board.cards[op.id]
          emitDel('card-del', op.id)
          this.log(board, actor, { op: 'card.delete', id: op.id, n: card.n, kind: card.kind, title: card.title })
          break
        }
        case 'pass.request': {
          const note = String(op.note ?? '').trim().slice(0, 280)
          board.passRequested = board.rev
          changes.push({ t: 'pass', rec: { seq: board.rev, note }, delay: 0, actor })
          this.log(board, actor, { op: 'pass.request', ...(note ? { note } : {}) })
          break
        }
        default:
          warnings.push(`unknown op ${op.op}`)
      }
    }
    this.save(board)
    return { changes, warnings, rev: board.rev }
  }

  // Turn an agent plan into ops. Plans may be partial: existing cards and groups are
  // updated in place, `delete: true` removes one, and cards may be named by number ("#7").
  // Positions are left to applyPlan's layout pass.
  planToOps(id, plan, { prep = true } = {}) {
    const board = this.get(id)
    const ops = []
    const warnings = []
    const byNumber = new Map(Object.values(board.cards).map((c) => [c.n, c.id]))
    const ref = (r) => {
      if (typeof r !== 'string' || !/^#\d+$/.test(r)) return r
      const found = byNumber.get(Number(r.slice(1)))
      if (!found) warnings.push(`no card ${r} on this board`)
      return found ?? r
    }
    if (plan.title && plan.title !== board.title) {
      ops.push({ op: 'board.update', title: plan.title })
      if (board.title && board.title !== 'Untitled board') warnings.push(`board title changed from "${board.title}" to "${plan.title}"`)
    }
    // Groups without a grid cell go to the right end of the first row.
    let nextCol = Math.max(-1, ...Object.values(board.clusters).filter((c) => c.grid?.row === 0).map((c) => c.grid.col), ...(plan.groups ?? []).filter((g) => g.col != null && (g.row ?? 0) === 0).map((g) => g.col)) + 1
    for (const g of plan.groups ?? []) {
      if (g.delete) { ops.push({ op: 'cluster.delete', id: g.id }); continue }
      const existing = board.clusters[g.id]
      const op = { op: 'cluster.upsert', id: g.id }
      for (const k of ['label', 'cols', 'why']) if (g[k] !== undefined) op[k] = g[k]
      if (g.zone !== undefined || !existing) op.role = g.zone ? 'zone' : 'cluster'
      let grid = g.col != null ? { col: g.col, row: g.row ?? 0 } : g.row != null && existing?.grid ? { ...existing.grid, row: g.row } : null
      if (!grid && !existing) grid = { col: nextCol++, row: 0 }
      if (grid && existing && !prep && (grid.col !== existing.grid?.col || grid.row !== existing.grid?.row)) {
        warnings.push(`group ${g.id}: people are working on the board, so it stays where it is (row/col changes apply before anyone touches the board)`)
        grid = null
      }
      if (grid) op.grid = grid
      ops.push(op)
    }
    for (const c of plan.cards ?? []) {
      const id = ref(c.id)
      if (c.delete) { ops.push({ op: 'card.delete', id }); continue }
      const { place: rawPlace, ...rest } = c
      const place = rawPlace && { ...rawPlace, ...(rawPlace.near ? { near: ref(rawPlace.near) } : {}), ...(rawPlace.around ? { around: ref(rawPlace.around) } : {}) }
      if (board.cards[id]) {
        // An existing card: edit its content, and move it as a logged move so the read-back sees it.
        ops.push({ op: 'card.upsert', ...rest, id })
        if (place) ops.push({ op: 'card.move', id, place })
      } else ops.push({ op: 'card.upsert', ...rest, id, ...(place ? { place } : {}) })
    }
    return { ops, warnings }
  }

  // Apply an agent's plan and lay the board out. Before anyone has touched the board the
  // whole layout is rebuilt from intents; after, new things go in locally and only the
  // agent's untouched groups move to make room. Returns changes, warnings, and problems.
  applyPlan(id, plan, actor) {
    const board = this.get(id)
    // A person's plan is their first touch, not prep.
    const prep = !isHuman(actor) && !this.getSnapshot(id, PROPOSED)
    const { ops, warnings } = this.planToOps(id, plan, { prep })
    const before = positions(board)
    const result = this.apply(id, ops, actor, { staggerMs: 110, defer: prep })
    let moved
    if (prep) moved = arrangeWithRetries(board)
    else if (isHuman(actor)) moved = new Set() // people's own moves never shift anything else
    else {
      const touched = new Set(result.changes.filter((c) => c.t === 'card' && !board.cards[c.rec.id]?.pinned).map((c) => c.rec.id))
      const grown = fitGroups(board, touched)
      const anchors = new Set([...grown, ...[...touched].map((cid) => membershipOf(board.cards[cid], board.clusters)).filter(Boolean)])
      moved = new Set([...grown, ...settleBoard(board, anchors)])
      // Moves the agent made to existing things go in the log, so the read-back can tell them from people's.
      for (const mid of moved) {
        const b = before[mid]
        const item = board.cards[mid] ?? board.clusters[mid]
        if (!b || !item || touched.has(mid) || (b.x === item.x && b.y === item.y && b.w === item.w && b.h === item.h)) continue
        if (board.cards[mid]) this.log(board, actor, { op: 'card.move', id: mid, n: item.n, from: { x: b.x, y: b.y }, to: { x: item.x, y: item.y }, reason: 'layout' })
        else this.log(board, actor, { op: 'cluster.update', id: mid, moved: b.x !== item.x || b.y !== item.y, resized: b.w !== item.w || b.h !== item.h, reason: 'layout' })
      }
    }
    refreshChanges(result.changes, board, moved, actor)
    this.save(board)
    return { ...result, warnings: [...warnings, ...result.warnings], problems: checkBoard(board) }
  }

  // The browser found a card whose text doesn't fit; remember it until the card changes size.
  reportOverflow(id, cardId, by) {
    const board = this.get(id)
    const card = board?.cards[cardId]
    if (!card || !(by > 0)) return
    board.overflow = { ...board.overflow, [cardId]: { h: card.h, by: Math.round(by) } }
    this.save(board)
  }
}

function positions(board) {
  return Object.fromEntries([...Object.values(board.cards), ...Object.values(board.clusters)].map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }]))
}

const LAYOUT_PROBLEMS = new Set(['groups-overlap', 'groups-close', 'wrong-group', 'cards-overlap'])

// Lay out, check, adjust, check again; keep the attempt with the fewest layout problems.
// Adjustments: start the grid below free cards (prompts) it ran into, then wider gutters.
function arrangeWithRetries(board) {
  const count = () => checkBoard(board).filter((p) => LAYOUT_PROBLEMS.has(p.type)).length
  const attempts = [{}]
  let moved = arrangeBoard(board)
  let best = { opts: {}, n: count() }
  if (best.n) {
    const gridIds = new Set(Object.values(board.clusters).filter((c) => c.grid).map((c) => c.id))
    const free = Object.values(board.cards).filter((c) => !c.pinned && !membershipOf(c, board.clusters))
    const clash = free.filter((c) => Object.values(board.clusters).some((g) => gridIds.has(g.id) && c.y < g.y + g.h && c.y + c.h > g.y && c.x < g.x + g.w && c.x + c.w > g.x))
    const originY = clash.length ? Math.max(...clash.map((c) => c.y + c.h)) + 80 : 0
    attempts.push({ originY }, { originY, gutterScale: 1.5 }, { originY, gutterScale: 2 })
    for (const opts of attempts.slice(1)) {
      for (const id of arrangeBoard(board, opts)) moved.add(id)
      const n = count()
      if (n < best.n) best = { opts, n }
      if (!n) break
    }
    for (const id of arrangeBoard(board, best.opts)) moved.add(id)
  }
  return moved
}

// Where a group made while people are working goes: at the right end of its grid row,
// past everything already there, sized for its columns.
function newGroupSpot(board, cl) {
  const cols = cl.cols ?? GRID.defaultCols
  const w = cl.role === 'zone' ? GRID.zoneW : GRID.clusterPad * 2 + cols * 300 + (cols - 1) * GRID.cardGap
  const h = cl.role === 'zone' ? GRID.zoneH : 200
  const row = Object.values(board.clusters).filter((c) => c.id !== cl.id && c.grid?.row === cl.grid.row)
  const all = [...Object.values(board.clusters).filter((c) => c.id !== cl.id), ...Object.values(board.cards)]
  if (row.length) {
    const y = Math.min(...row.map((c) => c.y))
    const band = all.filter((i) => i.y < y + h && i.y + i.h > y)
    return { x: Math.max(...band.map((i) => i.x + i.w)) + GRID.colGutter, y, w, h }
  }
  return { x: 0, y: (all.length ? Math.max(...all.map((i) => i.y + i.h)) : 0) + GRID.rowGutter, w, h }
}

// After layout, the changes to broadcast must carry final positions, including things
// the layout moved that the plan didn't mention.
function refreshChanges(changes, board, moved, actor) {
  const latest = (t, id) => (t === 'card' ? board.cards[id] : board.clusters[id])
  for (const ch of changes) if ((ch.t === 'card' || ch.t === 'cluster') && latest(ch.t, ch.rec.id)) ch.rec = JSON.parse(JSON.stringify(latest(ch.t, ch.rec.id)))
  for (const id of moved) {
    const t = board.cards[id] ? 'card' : board.clusters[id] ? 'cluster' : null
    if (t && !changes.some((c) => c.t === t && c.rec?.id === id)) changes.push({ t, rec: JSON.parse(JSON.stringify(latest(t, id))), delay: 0, actor })
  }
  // Groups first, so cards land inside groups that are already the right size.
  changes.sort((a, b) => (a.t === 'cluster' ? 0 : 1) - (b.t === 'cluster' ? 0 : 1))
}
