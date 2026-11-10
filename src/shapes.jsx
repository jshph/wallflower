import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, T, stopEventPropagation, useEditor, useIsEditing, useValue } from 'tldraw'
import { entering, idFromShape, leaving, reading } from './state.js'
import { reportOverflow } from './sync.js'

// The server sizes cards from the font's measurements; if a card's text still doesn't fit
// here, say so once per card size, after the handwriting font has loaded.
const reported = new Set()
function useOverflowCheck(ref, id, h, text) {
  useEffect(() => {
    let cancelled = false
    document.fonts.ready.then(() => requestAnimationFrame(() => {
      const el = ref.current
      if (cancelled || !el) return
      // Only text: the quote mark in the header overhangs its row on purpose.
      let by = 0
      for (const t of el.querySelectorAll('.rb-title, .rb-gist, .rb-body, .rb-prompt-title, .rb-prompt-body')) by = Math.max(by, t.scrollHeight - t.clientHeight)
      if (el.classList.contains('rb-prompt')) by = Math.max(by, el.scrollHeight - el.clientHeight)
      const key = `${id}:${h}`
      if (by > 2 && !reported.has(key)) { reported.add(key); reportOverflow(id, by) }
    }))
    return () => { cancelled = true }
  }, [id, h, text])
}

const KIND_LABEL = { note: 'note', quote: 'said', sticky: 'sticky' }

function Glyph({ kind }) {
  return kind === 'quote' ? <span className="rb-quote-glyph">“</span> : <span className="rb-diamond">◆</span>
}

function peopleLine(people) {
  const n = new Set(people ?? []).size
  if (!n) return null
  return n === 1 ? `from ${people[0]}` : `from ${n} people`
}

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// A seeded tilt per card, so a refresh never reshuffles the wall.
function tiltFor(id) {
  return ((hash(id) % 1000) / 1000 - 0.5) * 4
}

export function Card({ shape }) {
  const d = shape.props.data ?? {}
  const id = idFromShape(shape.id)
  const isLeaving = useValue('leaving', () => leaving.get().has(id), [id])
  const root = useRef(null)
  useOverflowCheck(root, id, shape.props.h, `${d.title}|${d.body}`)
  const [enter, setEnter] = useState(() => entering.has(id))
  const delay = useRef(entering.get(id) ?? 0)
  useEffect(() => { entering.delete(id) }, [id])
  const src = d.source ?? {}
  const meta = [src.author, src.date].filter(Boolean).join(' · ')
  const who = peopleLine(d.people)
  // With a passage, the source opens in the reader (which links on to the original); without one, the link opens.
  const canOpen = !!(src.passage || src.url)
  // A click on the source line opens it; a drag that starts there still moves the card. tldraw
  // captures the pointer on press, so listen for the release on the window.
  const openSource = (e) => {
    const x0 = e.clientX
    const y0 = e.clientY
    window.addEventListener('pointerup', (up) => {
      if (Math.hypot(up.clientX - x0, up.clientY - y0) > 4) return
      if (src.passage) reading.set(id)
      else if (src.url) window.open(src.url, '_blank', 'noopener')
    }, { once: true, capture: true })
  }
  const tilt = `${tiltFor(id).toFixed(2)}deg`
  if (d.kind === 'prompt') {
    return (
      <div
        className={`rb-card rb-prompt${enter ? ' rb-enter' : ''}${isLeaving ? ' rb-leaving' : ''}`}
        style={{ width: shape.props.w, height: shape.props.h, animationDelay: enter ? `${delay.current}ms` : undefined, '--rb-tilt': tilt }}
        onAnimationEnd={() => setEnter(false)}
        data-card-id={id}
        data-card-n={d.n}
      ref={root}
        ref={root}
      >
        {d.title && <div className="rb-prompt-title">{d.title}</div>}
        {d.body && <div className="rb-prompt-body">{d.body}</div>}
      </div>
    )
  }
  return (
    <div
      className={`rb-card rb-kind-${d.kind ?? 'note'}${enter ? ' rb-enter' : ''}${isLeaving ? ' rb-leaving' : ''}`}
      style={{ width: shape.props.w, height: shape.props.h, animationDelay: enter ? `${delay.current}ms` : undefined, '--rb-tilt': tilt }}
      onAnimationEnd={() => setEnter(false)}
      data-card-id={id}
      data-card-n={d.n}
    >
      <div className="rb-head">
        <Glyph kind={d.kind} />
        <span className={`rb-source${canOpen ? ' is-link' : ''}`} onPointerDown={canOpen ? openSource : undefined} title={src.passage ? 'Read around this (or double-click the card)' : src.url ?? ''}>
          {src.label ?? KIND_LABEL[d.kind] ?? d.kind}
        </span>
        <span className="rb-n">{d.n}</span>
      </div>
      {d.kind === 'quote' ? (
        <>
          {d.title && <div className="rb-gist">{d.title}</div>}
          <div className="rb-body rb-quote-body">{d.body}</div>
        </>
      ) : (
        <>
          {d.title && <div className="rb-title">{d.title}</div>}
          {d.body && <div className="rb-body">{d.body}</div>}
        </>
      )}
      {(meta || who) && (
        <div className="rb-foot">
          <span>{meta}</span>
          {who && <span className="rb-people">{who}</span>}
        </div>
      )}
    </div>
  )
}

export class CardShapeUtil extends BaseBoxShapeUtil {
  static type = 'rb-card'
  static props = { w: T.number, h: T.number, data: T.jsonValue }
  getDefaultProps() { return { w: 280, h: 140, data: {} } }
  canResize() { return false }
  hideResizeHandles() { return true }
  hideRotateHandle() { return true }
  canEdit() { return false }
  // Double-click reads the source around the card. Returning a no-op change stops tldraw from
  // also dropping a text shape there.
  onDoubleClick(shape) {
    if (!shape.props.data?.source?.passage) return
    reading.set(idFromShape(shape.id))
    return { id: shape.id, type: shape.type }
  }
  onTranslateStart(shape) {
    // A card someone picks up comes to the front, like a sticky lifted off the wall.
    this.editor.bringToFront([shape.id])
  }
  component(shape) {
    return <HTMLContainer><Card shape={shape} /></HTMLContainer>
  }
  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} ry={10} />
  }
}

const lastLabelDown = new Map()

// Cards whose centers sit inside a cluster when a drag starts travel with it.
const carried = new Map()

function ClusterLabel({ shape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const [draft, setDraft] = useState(shape.props.label)
  const inputRef = useRef(null)
  useEffect(() => {
    if (isEditing) {
      setDraft(shape.props.label)
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
    }
  }, [isEditing])
  const commit = () => {
    if (draft !== shape.props.label) editor.updateShape({ id: shape.id, type: shape.type, props: { label: draft.trim() } })
    editor.setEditingShape(null)
  }
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="rb-cluster-input"
        value={draft}
        placeholder="name this group"
        onChange={(e) => setDraft(e.target.value)}
        onPointerDown={stopEventPropagation}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') editor.setEditingShape(null)
        }}
        onBlur={commit}
      />
    )
  }
  // The label sits outside the group's hit area, so it handles its own clicks.
  return (
    <div
      className={`rb-cluster-label${shape.props.label ? '' : ' is-empty'}`}
      onPointerDown={(e) => {
        stopEventPropagation(e)
        editor.select(shape.id)
        // Our own double-click timing, matching tldraw's (synthetic input often lacks dblclick).
        const now = Date.now()
        if (now - (lastLabelDown.get(shape.id) ?? 0) < 450) editor.setEditingShape(shape.id)
        lastLabelDown.set(shape.id, now)
      }}
    >
      {shape.props.label || '· · ·'}
    </div>
  )
}

export class ClusterShapeUtil extends BaseBoxShapeUtil {
  static type = 'rb-cluster'
  static props = { w: T.number, h: T.number, label: T.string, role: T.string }
  getDefaultProps() { return { w: 640, h: 420, label: '', role: 'cluster' } }
  canEdit() { return true }
  canResize() { return true }
  hideRotateHandle() { return true }
  onTranslateStart(shape) {
    const b = { x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h }
    const selected = new Set(this.editor.getSelectedShapeIds())
    const inside = this.editor.getCurrentPageShapes().filter((s) => {
      if (s.id === shape.id || selected.has(s.id) || s.type === 'rb-cluster') return false
      const bounds = this.editor.getShapePageBounds(s)
      if (!bounds) return false
      const c = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
      return c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h
    })
    carried.set(shape.id, inside.map((s) => ({ id: s.id, type: s.type, x: s.x, y: s.y })))
  }
  onTranslate(initial, current) {
    const list = carried.get(current.id)
    if (!list?.length) return
    const dx = current.x - initial.x
    const dy = current.y - initial.y
    this.editor.updateShapes(list.map((s) => ({ id: s.id, type: s.type, x: s.x + dx, y: s.y + dy })))
  }
  onTranslateEnd(initial, current) {
    carried.delete(current.id)
  }
  component(shape) {
    const zone = shape.props.role === 'zone'
    return (
      <HTMLContainer>
        <div className={`rb-cluster${zone ? ' is-zone' : ''}${shape.props.label ? ' is-named' : ''}`} style={{ width: shape.props.w, height: shape.props.h }}>
          <ClusterLabel shape={shape} />
        </div>
      </HTMLContainer>
    )
  }
  indicator(shape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={18} ry={18} />
  }
}
