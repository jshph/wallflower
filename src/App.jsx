import { Fragment, useEffect, useRef, useState } from 'react'
import { Tldraw, useEditor, useValue } from 'tldraw'
import { CardShapeUtil, ClusterShapeUtil } from './shapes.jsx'
import { requestPass, startSync } from './sync.js'
import { agentCursor, boardMeta, cardShapeId, passState, presence, reading } from './state.js'

const shapeUtils = [CardShapeUtil, ClusterShapeUtil]
const params = new URLSearchParams(location.search)
const boardId = params.get('board')
// A shared link carries no name, so whoever opens it is asked once and remembered in this browser.
const NAME_KEY = 'wallflower:name'
function savedName() {
  try { return localStorage.getItem(NAME_KEY) ?? localStorage.getItem('roomboard:name') } catch { return null }
}
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

function shortActor(a) {
  const [kind, rest = ''] = a.split(':')
  if (kind === 'agent') return rest.startsWith('thr_') ? `agent ${rest.slice(0, 9)}` : `agent ${rest}`
  return rest || a
}

const isSticky = (s) => s.type === 'note' || s.type === 'text'

function area(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

// What a sticky is attached to, by the same rule the server uses to read it back:
// the card it overlaps most, else the group around its center, else nothing.
function attachment(editor, sticky) {
  const sb = editor.getShapePageBounds(sticky)
  if (!sb) return null
  const shapes = editor.getCurrentPageShapes()
  let best = null
  for (const s of shapes) {
    if (s.type !== 'rb-card') continue
    const b = editor.getShapePageBounds(s)
    const a = b && area(sb, b)
    // Same rule as the server: more than a clipped corner (a tenth of the smaller shape).
    if (a && a >= 0.1 * Math.min(sb.w * sb.h, b.w * b.h) && (!best || a > best.a)) best = { a, kind: 'card', b }
  }
  if (best) return best
  const c = { x: sb.x + sb.w / 2, y: sb.y + sb.h / 2 }
  const groups = shapes.filter((s) => s.type === 'rb-cluster').map((s) => ({ s, b: editor.getShapePageBounds(s) }))
    .filter(({ b }) => b && c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h)
    .sort((p, q) => (p.s.props.role === 'zone' ? -1 : 0) - (q.s.props.role === 'zone' ? -1 : 0) || p.b.w * p.b.h - q.b.w * q.b.h)
  return groups[0] ? { kind: 'group', b: groups[0].b } : null
}

// Drawn in screen space, in front of the cards: a pin on every sticky that sits
// on a card, and, while a sticky is being dragged, an outline on whatever it
// will be read as attached to.
function Attachments() {
  const editor = useEditor()
  const view = (x, y) => editor.pageToViewport({ x, y })
  const pins = useValue('sticky-pins', () => editor.getCurrentPageShapes().filter(isSticky).map((s) => {
    const t = attachment(editor, s)
    const b = editor.getShapePageBounds(s)
    return t?.kind === 'card' && b ? { id: s.id, ...view(b.x + b.w / 2, b.y) } : null
  }).filter(Boolean), [editor])
  const target = useValue('sticky-target', () => {
    const s = editor.getOnlySelectedShape()
    if (!s || !isSticky(s) || !editor.isIn('select.translating')) return null
    const t = attachment(editor, s)
    if (!t) return null
    const a = view(t.b.x, t.b.y)
    const z = editor.getZoomLevel()
    return { kind: t.kind, x: a.x, y: a.y, w: t.b.w * z, h: t.b.h * z }
  }, [editor])
  return (
    <>
      {target && <div className={`rb-attach is-${target.kind}`} style={{ transform: `translate(${target.x}px, ${target.y}px)`, width: target.w, height: target.h }} />}
      {pins.map((p) => <div key={p.id} className="rb-pin" style={{ transform: `translate(${p.x - 7}px, ${p.y - 9}px)` }} />)}
    </>
  )
}

// Drawn in page space, under the UI: the agent's ghost cursor while it writes.
function OnCanvas() {
  const cursor = useValue(agentCursor)
  return (
    <>
      <div className={`rb-agent-cursor${cursor ? ' is-on' : ''}`} style={{ transform: cursor ? `translate(${cursor.x}px, ${cursor.y}px)` : undefined }}>
        <svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 2 L15 8 L9 9.5 L7 16 Z" /></svg>
        {cursor && <span>{shortActor(cursor.actor)}</span>}
      </div>
    </>
  )
}

// Passages are markdown cut from notes; show them as text, with wiki links, links and bold markers unwrapped.
function plainMd(s) {
  return s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__/g, '')
}

// One stretch of a passage. Heading lines (only where a line really starts) are set as headings.
function Prose({ text, lineStart }) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const nl = i < lines.length - 1 ? '\n' : ''
    const h = (i > 0 || lineStart) && /^[ \t]*#{1,6}[ \t]+(.*)$/.exec(line)
    return <Fragment key={i}>{h ? <strong className="rb-reader-h">{plainMd(h[1])}</strong> : plainMd(line)}{nl}</Fragment>
  })
}

const READER_W = 400

// The source around a card, from the passage the CLI cut at put time: nothing is fetched, so it opens at once.
// It sits beside the card and follows it as the board pans; Escape or a click elsewhere closes it.
function Reader({ editor }) {
  const id = useValue(reading)
  const data = useValue('reading-card', () => (id && editor ? editor.getShape(cardShapeId(id))?.props.data ?? null : null), [id, editor])
  const box = useValue('reading-box', () => {
    const b = id && editor && editor.getShapePageBounds(cardShapeId(id))
    if (!b) return null
    const a = editor.pageToViewport({ x: b.x, y: b.y })
    const z = editor.pageToViewport({ x: b.maxX, y: b.maxY })
    return { l: a.x, t: a.y, r: z.x, b: z.y }
  }, [id, editor])
  const panel = useRef(null)
  const mark = useRef(null)
  useEffect(() => {
    if (!id) return
    mark.current?.scrollIntoView({ block: 'center' })
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); reading.set(null) } }
    const onDown = (e) => { if (!panel.current?.contains(e.target)) reading.set(null) }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true) }
  }, [id])
  const p = data?.source?.passage
  if (!id || !p || !box) return null
  const src = data.source
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(READER_W, vw - 24)
  const gap = 14
  const left = box.r + gap + w <= vw - 12 ? box.r + gap : box.l - gap - w >= 12 ? box.l - gap - w : Math.max(12, Math.min(vw - w - 12, (box.l + box.r - w) / 2))
  const beside = left >= box.r || left + w <= box.l
  const top = Math.max(64, Math.min(vh - 220, beside ? box.t : box.b + gap))
  const [m0, m1] = p.mark ?? [0, 0]
  const meta = [src.author, src.date].filter(Boolean).join(' · ')
  return (
    <div ref={panel} className="rb-reader" style={{ left, top, width: w, maxHeight: vh - top - 12 }} data-testid="reader" onWheel={(e) => e.stopPropagation()}>
      <div className="rb-reader-head">
        <span className="rb-reader-label">{src.label || 'Source'}</span>
        {meta && <span className="rb-reader-meta">{meta}</span>}
        <button className="rb-reader-close" onClick={() => reading.set(null)} aria-label="Close">×</button>
      </div>
      <div className="rb-reader-text">
        {p.clipped?.[0] && <span className="rb-reader-ellipsis">…</span>}
        {p.mark ? (
          <>
            <Prose text={p.text.slice(0, m0)} lineStart />
            <mark ref={mark}><Prose text={p.text.slice(m0, m1)} lineStart={m0 === 0 || p.text[m0 - 1] === '\n'} /></mark>
            <Prose text={p.text.slice(m1)} lineStart={p.text[m1 - 1] === '\n'} />
          </>
        ) : <Prose text={p.text} lineStart />}
        {p.clipped?.[1] && <span className="rb-reader-ellipsis">…</span>}
      </div>
      <div className="rb-reader-foot">
        <span>{p.at ? `Excerpt as of ${p.at}` : 'Excerpt'}</span>
        {src.url && <a href={src.url} target="_blank" rel="noopener noreferrer">{src.url.startsWith('obsidian:') ? 'Open in Obsidian' : 'Open original'} ↗</a>}
      </div>
    </div>
  )
}

const PASS_LABEL = { idle: 'Take another pass', saved: 'Saved for the next pass', reading: 'Reading the board…' }

// The person is done for now and hands the board back, with an optional steer.
function PassButton() {
  const { phase } = useValue(passState)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const input = useRef(null)
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const submit = () => { requestPass(note.trim()); setNote(''); setOpen(false) }
  return (
    <div className="rb-pass">
      <button className={`rb-pass-button is-${phase}`} onClick={() => setOpen((o) => !o)} disabled={phase === 'reading'} data-testid="take-another-pass">
        {PASS_LABEL[phase]}
      </button>
      {open && (
        <div className="rb-pass-pop" onPointerDown={(e) => e.stopPropagation()}>
          <input
            ref={input}
            value={note}
            placeholder="Anything in particular?"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setOpen(false)
            }}
          />
          <button onClick={submit}>Send</button>
        </div>
      )}
    </div>
  )
}

// Copies the board's link, without anyone's name in it, for the person to send on.
function ShareButton() {
  const [label, setLabel] = useState(null)
  const link = `${location.origin}${location.pathname}?board=${encodeURIComponent(boardId)}`
  const share = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy this link', link)
      return
    }
    setLabel(LOOPBACK ? 'Copied (this machine only)' : 'Link copied')
    setTimeout(() => setLabel(null), 2400)
  }
  const tip = LOOPBACK ? 'This board is on a local server, so its link only opens on this machine' : 'Anyone with this link can view and edit the board'
  return <button onClick={share} title={tip} data-testid="share">{label ?? 'Share'}</button>
}

function NamePrompt({ onDone }) {
  const [value, setValue] = useState('')
  const [title, setTitle] = useState('')
  useEffect(() => { fetch(`/api/boards/${encodeURIComponent(boardId)}`).then((r) => (r.ok ? r.json() : null)).then((b) => b?.title && setTitle(b.title), () => {}) }, [])
  const submit = (e) => {
    e.preventDefault()
    const n = value.trim()
    if (!n) return
    try { localStorage.setItem(NAME_KEY, n) } catch {}
    onDone(n)
  }
  return (
    <form className="rb-list rb-name" onSubmit={submit}>
      <h1>{title || 'Wallflower'}</h1>
      <p>Your name, so people can see who moved what:</p>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your name" maxLength={40} data-testid="name-input" />
      <button type="submit">Open the board</button>
      <button type="button" className="rb-name-skip" onClick={() => onDone('guest')}>Join as guest</button>
    </form>
  )
}

// A card or sticky dropped into a group, but hanging over its edge, grows the group to hold it,
// so what a person put in a group still reads as in it.
function growGroupsOnDrop(editor) {
  const pad = 22
  const grow = () => {
    const groups = editor.getCurrentPageShapes().filter((s) => s.type === 'rb-cluster')
    for (const s of editor.getSelectedShapes()) {
      if (s.type === 'rb-cluster') continue
      const b = editor.getShapePageBounds(s)
      if (!b) continue
      const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
      // The same rule the server reads membership by: zones first, then the smallest group around the center.
      const home = groups.map((g) => ({ g, gb: editor.getShapePageBounds(g) }))
        .filter(({ gb }) => gb && c.x >= gb.x && c.x <= gb.x + gb.w && c.y >= gb.y && c.y <= gb.y + gb.h)
        .sort((p, q) => (p.g.props.role === 'zone' ? -1 : 0) - (q.g.props.role === 'zone' ? -1 : 0) || p.gb.w * p.gb.h - q.gb.w * q.gb.h)[0]
      if (!home) continue
      const { g, gb } = home
      const x0 = Math.min(gb.x, b.x - pad), y0 = Math.min(gb.y, b.y - pad)
      const x1 = Math.max(gb.x + gb.w, b.x + b.w + pad), y1 = Math.max(gb.y + gb.h, b.y + b.h + pad)
      if (x0 === gb.x && y0 === gb.y && x1 === gb.x + gb.w && y1 === gb.y + gb.h) continue
      editor.updateShape({ id: g.id, type: g.type, x: Math.round(x0), y: Math.round(y0), props: { w: Math.round(x1 - x0), h: Math.round(y1 - y0) } })
    }
  }
  const onEvent = (info) => { if (info.type === 'pointer' && info.name === 'pointer_up') setTimeout(grow, 0) }
  editor.on('event', onEvent)
  return () => editor.off('event', onEvent)
}

function TopBar({ editor, status }) {
  const meta = useValue(boardMeta)
  const people = useValue(presence)
  const addGroup = (zone) => {
    if (!editor) return
    const c = editor.getViewportPageBounds().center
    const id = `shape:cl.g${Date.now().toString(36)}`
    editor.createShape({ id, type: 'rb-cluster', x: Math.round(c.x - 300), y: Math.round(c.y - 180), props: { w: 600, h: 360, label: zone ? 'Decided' : '', role: zone ? 'zone' : 'cluster' } })
    editor.sendToBack([id])
    editor.select(id)
  }
  return (
    <div className="rb-topbar">
      <div className="rb-title-block">
        <div className="rb-board-title">{meta.title || boardId}</div>
      </div>
      <div className="rb-presence">
        {people.map((p) => (
          <span key={p.actor} className={`rb-person${p.actor.startsWith('agent:') ? ' is-agent' : ''}${p.status && p.status !== 'viewing' ? ' is-busy' : ''}`}>
            <i />{shortActor(p.actor)}{p.status && p.status !== 'viewing' ? ` · ${p.status}` : ''}
          </span>
        ))}
        <span className={`rb-conn is-${status}`}>{status}</span>
      </div>
      <div className="rb-actions">
        <button onClick={() => addGroup(false)} data-testid="add-group">+ Group</button>
        <button onClick={() => addGroup(true)} data-testid="add-zone">+ Zone</button>
        <ShareButton />
        <PassButton />
      </div>
    </div>
  )
}

function BoardList({ name }) {
  // null while loading, 'private' when the server is hosted and doesn't list its boards.
  const [boards, setBoards] = useState(null)
  useEffect(() => {
    fetch('/api/boards')
      .then((r) => (r.status === 401 ? 'private' : r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setBoards, () => setBoards('error'))
  }, [])
  return (
    <div className="rb-list">
      <h1>Wallflower</h1>
      {Array.isArray(boards) && boards.map((b) => <a key={b.id} href={`?board=${b.id}${name ? `&name=${encodeURIComponent(name)}` : ''}`}>{b.title} <small>{b.cards} cards</small></a>)}
      {Array.isArray(boards) && !boards.length && <p>No boards yet. Create one with <code>wallflower new "Title"</code></p>}
      {boards === 'private' && <p>Boards here are private. Open one from the link you were given.</p>}
      {boards === 'error' && <p>Couldn't reach the board server.</p>}
    </div>
  )
}

export default function App() {
  const [editor, setEditor] = useState(null)
  const [status, setStatus] = useState('connecting')
  const [name, setName] = useState(() => params.get('name') || savedName() || '')
  useEffect(() => {
    if (!editor) return
    window.editor = editor
    return startSync(editor, { boardId, actor: `human:${name}`, onStatus: setStatus })
  }, [editor])
  if (!boardId) return <BoardList name={name} />
  if (!name) return <NamePrompt onDone={setName} />
  return (
    <div className="rb-app rb-sketch">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="rb-rough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="3.2" /></filter>
        <filter id="rb-rough-soft"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale="6" /></filter>
      </svg>
      <Tldraw
        licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
        shapeUtils={shapeUtils}
        onMount={(e) => {
          e.user.updateUserPreferences({ colorScheme: 'light', name })
          setEditor(e)
          return growGroupsOnDrop(e)
        }}
        components={{ OnTheCanvas: OnCanvas, InFrontOfTheCanvas: Attachments, PageMenu: null, MainMenu: null, HelpMenu: null, DebugMenu: null, DebugPanel: null, StylePanel: null }}
      />
      <TopBar editor={editor} status={status} />
      <Reader editor={editor} />
    </div>
  )
}
