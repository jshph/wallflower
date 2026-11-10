// Text rendering of a board so an agent can check layout without a browser.
import { membershipOf } from './layout.mjs'

export function boardToAscii(board, { width = 140 } = {}) {
  const items = [...Object.values(board.clusters), ...Object.values(board.cards)]
  if (!items.length) return '(empty board)'
  const minX = Math.min(...items.map((i) => i.x))
  const minY = Math.min(...items.map((i) => i.y))
  const maxX = Math.max(...items.map((i) => i.x + i.w))
  const maxY = Math.max(...items.map((i) => i.y + i.h))
  const sx = Math.max(12, (maxX - minX) / (width - 2))
  const sy = sx * 2.2
  const cols = Math.ceil((maxX - minX) / sx) + 2
  const rows = Math.ceil((maxY - minY) / sy) + 2
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(' '))
  const put = (r, c, ch) => { if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = ch }
  const text = (r, c, s, max) => { for (let i = 0; i < Math.min(s.length, max ?? s.length); i++) put(r, c + i, s[i]) }
  const toCell = (i) => ({ c0: Math.round((i.x - minX) / sx), r0: Math.round((i.y - minY) / sy), c1: Math.round((i.x + i.w - minX) / sx), r1: Math.round((i.y + i.h - minY) / sy) })

  for (const cl of Object.values(board.clusters)) {
    const { c0, r0, c1, r1 } = toCell(cl)
    const h = cl.role === 'zone' ? '=' : '-'
    for (let c = c0; c <= c1; c++) { put(r0, c, h); put(r1, c, h) }
    for (let r = r0; r <= r1; r++) { put(r, c0, '|'); put(r, c1, '|') }
    for (const [r, c] of [[r0, c0], [r0, c1], [r1, c0], [r1, c1]]) put(r, c, '+')
    // Groups are labelled by id, which is what plans refer to; a name people gave follows it.
    text(r0, c0 + 2, ` ${cl.id}${cl.label ? ` "${cl.label}"` : ''} `, c1 - c0 - 3)
  }
  for (const card of Object.values(board.cards).sort((a, b) => a.n - b.n)) {
    const { c0, r0, c1 } = toCell(card)
    const tag = `[${card.n}${card.kind === 'sticky' ? '*' : ''}]`
    const room = Math.max(tag.length, c1 - c0)
    text(r0, c0, (tag + ' ' + (card.title || '')).slice(0, room), room)
  }
  return grid.map((r) => r.join('').replace(/\s+$/, '')).join('\n').replace(/\n+$/, '')
}

export function boardToListing(board) {
  const L = []
  L.push(board.title)
  const byGroup = {}
  for (const c of Object.values(board.cards)) (byGroup[membershipOf(c, board.clusters) ?? '_loose'] ??= []).push(c)
  const line = (c) => `  #${String(c.n).padEnd(3)} ${c.id.padEnd(14)} ${c.kind.padEnd(7)} ${JSON.stringify(c.title || '').slice(0, 60).padEnd(62)} @${c.x},${c.y} ${c.w}x${c.h}  by ${c.updatedBy ?? c.createdBy}${c.pinned ? ' (placed by a person)' : ''}`
  for (const cl of Object.values(board.clusters)) {
    const cards = (byGroup[cl.id] ?? []).sort((a, b) => a.y - b.y || a.x - b.x)
    L.push(`${cl.role === 'zone' ? 'Zone' : 'Group'} ${cl.label ? JSON.stringify(cl.label) : '(unnamed)'} [${cl.id}] @${cl.x},${cl.y} ${cl.w}x${cl.h} — ${cards.length} card${cards.length === 1 ? '' : 's'}`)
    for (const c of cards) L.push(line(c))
  }
  const loose = byGroup._loose ?? []
  if (loose.length) {
    L.push(`Outside any group — ${loose.length}`)
    for (const c of loose.sort((a, b) => a.y - b.y || a.x - b.x)) L.push(line(c))
  }
  return L.join('\n')
}
