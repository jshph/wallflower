import { renderPlaintextFromRichText, toRichText } from 'tldraw'
import { agentCursor, boardMeta, cardShapeId, clusterShapeId, entering, idFromShape, leaving, passState, presence } from './state.js'

const FLUSH_MS = 140
const READING_MAX_MS = 5 * 60_000

let sendOps = null
let readingTimer = null

function setPhase(phase) {
  passState.set({ phase })
  clearTimeout(readingTimer)
  if (phase === 'reading') readingTimer = setTimeout(() => passState.set({ phase: 'idle' }), READING_MAX_MS)
}

let sendRaw = null

// A card's text doesn't fit its box in this browser: tell the server, which tells the agent.
export function reportOverflow(id, by) {
  sendRaw?.({ type: 'overflow', id, by })
}

// The person is done for now: ask the agent to take another pass, with an optional steer.
export function requestPass(note) {
  sendOps?.([{ op: 'pass.request', note }])
  const waiting = presence.get().some((p) => p.actor.startsWith('agent:') && p.status === 'waiting')
  setPhase(waiting ? 'reading' : 'saved')
}

export function startSync(editor, { boardId, actor, onStatus }) {
  const client = crypto.randomUUID()
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const pending = new Map()
  let flushTimer = null
  let ws = null
  let closed = false
  let cursorTimer = null
  let motionTimer = null

  const container = editor.getContainer()
  const markRemoteMotion = () => {
    container.classList.add('rb-remote-motion')
    clearTimeout(motionTimer)
    motionTimer = setTimeout(() => container.classList.remove('rb-remote-motion'), 800)
  }

  const remote = (fn) => editor.store.mergeRemoteChanges(fn)

  function cardToShape(rec) {
    if (rec.kind === 'sticky') {
      return { id: cardShapeId(rec.id), type: 'note', x: rec.x, y: rec.y, props: { richText: toRichText(rec.title ?? ''), color: 'yellow', size: 's' } }
    }
    const { x, y, w, h, ...data } = rec
    return { id: cardShapeId(rec.id), type: 'rb-card', x, y, props: { w, h, data } }
  }

  function clusterToShape(rec) {
    return { id: clusterShapeId(rec.id), type: 'rb-cluster', x: rec.x, y: rec.y, props: { w: rec.w, h: rec.h, label: rec.label ?? '', role: rec.role ?? 'cluster' } }
  }

  function moveCursor(rec, actorId) {
    agentCursor.set({ x: rec.x + Math.min(rec.w - 30, 220), y: rec.y + 18, actor: actorId })
    clearTimeout(cursorTimer)
    cursorTimer = setTimeout(() => agentCursor.set(null), 1600)
  }

  function applyChange(ch, actorId) {
    const isAgent = actorId?.startsWith('agent:')
    switch (ch.t) {
      case 'board':
        boardMeta.set({ ...boardMeta.get(), ...ch.rec })
        break
      case 'cluster': {
        const shape = clusterToShape(ch.rec)
        if (editor.getShape(shape.id)) {
          markRemoteMotion()
          remote(() => editor.updateShapes([shape]))
        } else {
          remote(() => { editor.createShapes([shape]); editor.sendToBack([shape.id]) })
        }
        break
      }
      case 'cluster-del':
        remote(() => editor.deleteShapes([clusterShapeId(ch.id)]))
        break
      case 'card': {
        const shape = cardToShape(ch.rec)
        const existing = editor.getShape(shape.id)
        if (existing) {
          markRemoteMotion()
          remote(() => editor.updateShapes([shape]))
        } else {
          entering.set(ch.rec.id, 0)
          remote(() => editor.createShapes([shape]))
        }
        if (isAgent) {
          moveCursor(ch.rec, actorId)
          if (passState.get().phase === 'reading') setPhase('idle')
        }
        break
      }
      case 'pass':
        if (passState.get().phase === 'idle') setPhase('saved')
        break
      case 'pass-taken':
        setPhase('reading')
        break
      case 'card-del': {
        const next = new Set(leaving.get())
        next.add(ch.id)
        leaving.set(next)
        setTimeout(() => {
          remote(() => editor.deleteShapes([cardShapeId(ch.id)]))
          const after = new Set(leaving.get())
          after.delete(ch.id)
          leaving.set(after)
        }, 280)
        break
      }
    }
  }

  // Agent writes play as a tour: the camera visits each neighborhood the agent wrote
  // into, in the order it wrote them, and the cards drop in there one by one.
  let tour = Promise.resolve()
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
  // Never take the camera from someone who is dragging, resizing, or typing.
  const busy = () => editor.isIn('select.translating') || editor.isIn('select.resizing') || editor.isIn('select.brushing') || !!editor.getEditingShapeId()

  function neighborhoodOf(rec) {
    const p = rec.meta?.placement ?? {}
    return p.around ?? p.near ?? p.in ?? p.edge ?? 'loose'
  }

  function boundsOf(rects) {
    const minX = Math.min(...rects.map((r) => r.x))
    const minY = Math.min(...rects.map((r) => r.y))
    const maxX = Math.max(...rects.map((r) => r.x + r.w))
    const maxY = Math.max(...rects.map((r) => r.y + r.h))
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  async function playTour(hoods, actorId) {
    const seen = []
    for (const [key, list] of hoods) {
      const seed = editor.getShapePageBounds(cardShapeId(key)) ?? editor.getShapePageBounds(clusterShapeId(key))
      const rects = [...list.map((ch) => ch.rec), ...(seed ? [{ x: seed.x, y: seed.y, w: seed.w, h: seed.h }] : [])]
      seen.push(...rects)
      const steer = !busy()
      if (steer) {
        editor.zoomToBounds(boundsOf(rects), { animation: { duration: 700 }, inset: 140, targetZoom: 1 })
        await sleep(720)
      }
      for (const ch of list) {
        entering.set(ch.rec.id, 0)
        applyChange(ch, actorId)
        await sleep(steer ? 180 : 40)
      }
      if (steer) await sleep(700)
    }
    if (hoods.length > 1 && !busy()) editor.zoomToBounds(boundsOf(seen), { animation: { duration: 900 }, inset: 120, targetZoom: 1 })
  }

  function applyBatch(changes, actorId) {
    const isNew = (c) => c.t === 'card' && !editor.getShape(cardShapeId(c.rec.id))
    const fresh = actorId?.startsWith('agent:') ? changes.filter(isNew) : []
    // Groups grow and existing cards move right away, so neighborhoods are ready before their cards land.
    for (const ch of changes) {
      if (fresh.includes(ch)) continue
      if (ch.delay && !fresh.length) setTimeout(() => applyChange(ch, actorId), ch.delay)
      else applyChange(ch, actorId)
    }
    if (!fresh.length) return
    const hoods = new Map()
    for (const ch of fresh) {
      const key = neighborhoodOf(ch.rec)
      if (!hoods.has(key)) hoods.set(key, [])
      hoods.get(key).push(ch)
    }
    tour = tour.then(() => playTour([...hoods], actorId)).catch((err) => console.warn('[wallflower] tour', err))
  }

  function init(board) {
    boardMeta.set({ title: board.title })
    remote(() => {
      const existing = editor.getCurrentPageShapes().map((s) => s.id)
      if (existing.length) editor.deleteShapes(existing)
      const clusters = Object.values(board.clusters).map(clusterToShape)
      if (clusters.length) { editor.createShapes(clusters); editor.sendToBack(clusters.map((c) => c.id)) }
      const cards = Object.values(board.cards).sort((a, b) => a.n - b.n)
      cards.forEach((c, i) => entering.set(c.id, Math.min(i * 35, 900)))
      if (cards.length) editor.createShapes(cards.map(cardToShape))
    })
    if (Object.keys(board.cards).length) editor.zoomToFit({ animation: { duration: 300 } })
  }

  function send(ops) {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'ops', ops }))
  }
  sendOps = (ops) => { flush(); send(ops) }
  sendRaw = (msg) => { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)) }

  function queue(key, op) {
    pending.set(key, op)
    clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, FLUSH_MS)
  }

  function flush() {
    if (!pending.size) return
    const ops = [...pending.values()]
    pending.clear()
    send(ops)
  }

  const plain = (shape) => {
    try { return renderPlaintextFromRichText(editor, shape.props.richText).trim() } catch { return '' }
  }
  const isSticky = (s) => s.type === 'note' || s.type === 'text'

  const stopListen = editor.store.listen(({ changes }) => {
    for (const rec of Object.values(changes.added)) {
      if (rec.typeName !== 'shape') continue
      if (isSticky(rec)) {
        const id = idFromShape(rec.id)
        queue(`card:${id}`, { op: 'card.upsert', id, kind: 'sticky', title: plain(rec), x: Math.round(rec.x), y: Math.round(rec.y) })
      } else if (rec.type === 'rb-cluster') {
        const id = idFromShape(rec.id)
        queue(`cluster:${id}`, { op: 'cluster.upsert', id, label: rec.props.label, role: rec.props.role, x: Math.round(rec.x), y: Math.round(rec.y), w: Math.round(rec.props.w), h: Math.round(rec.props.h) })
      }
    }
    for (const [from, to] of Object.values(changes.updated)) {
      if (to.typeName !== 'shape') continue
      const id = idFromShape(to.id)
      if (to.type === 'rb-card' || isSticky(to)) {
        if (from.x !== to.x || from.y !== to.y) queue(`move:${id}`, { op: 'card.move', id, x: Math.round(to.x), y: Math.round(to.y) })
        if (isSticky(to) && from.props.richText !== to.props.richText) queue(`text:${id}`, { op: 'card.update', id, title: plain(to) })
      } else if (to.type === 'rb-cluster') {
        const op = { op: 'cluster.update', id }
        if (from.props.label !== to.props.label) op.label = to.props.label
        if (from.x !== to.x || from.y !== to.y) Object.assign(op, { x: Math.round(to.x), y: Math.round(to.y) })
        if (from.props.w !== to.props.w || from.props.h !== to.props.h) Object.assign(op, { w: Math.round(to.props.w), h: Math.round(to.props.h) })
        const prev = pending.get(`cluster-up:${id}`)
        if (Object.keys(op).length > 2) queue(`cluster-up:${id}`, { ...prev, ...op })
      }
    }
    for (const rec of Object.values(changes.removed)) {
      if (rec.typeName !== 'shape') continue
      const id = idFromShape(rec.id)
      if (rec.type === 'rb-card' || isSticky(rec)) {
        pending.delete(`move:${id}`)
        queue(`del:${id}`, { op: 'card.delete', id })
      } else if (rec.type === 'rb-cluster') queue(`cluster-del:${id}`, { op: 'cluster.delete', id })
    }
  }, { source: 'user', scope: 'document' })

  function connect() {
    ws = new WebSocket(`${proto}://${location.host}/ws?board=${encodeURIComponent(boardId)}&actor=${encodeURIComponent(actor)}&client=${client}`)
    ws.onopen = () => onStatus?.('live')
    ws.onclose = () => {
      onStatus?.('offline')
      if (!closed) setTimeout(connect, 1200)
    }
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'init') init(msg.board)
      if (msg.type === 'presence') presence.set(msg.presence)
      if (msg.type === 'changes' && msg.origin !== client) applyBatch(msg.changes, msg.actor)
      if (msg.type === 'warnings' || msg.type === 'error') console.warn('[wallflower]', msg)
    }
  }
  connect()

  return () => {
    closed = true
    sendOps = null
    sendRaw = null
    flush()
    stopListen()
    ws?.close()
  }
}
