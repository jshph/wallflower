// Board layout. Two regimes, split at the moment a person first touches the board:
//
// Before (prep): the agent owns everything, so every `put` lays the whole board out
// again from the placement intents it stored. Measure inside-out (a card with the
// cards tucked onto or ringed around it is one unit; units fill a group; groups and
// their edge cards fill a grid cell), then place outside-in. Nothing can overlap by
// construction, groups are as big as what they hold, and changing a group's row
// or a card's group just works.
//
// After (live): people have seen the board and may have moved things. Anything a
// person placed is pinned. New agent cards go in by local rules, groups grow to hold
// them, then the agent's own untouched groups are pushed apart, least movement
// first. Pinned things never move.
//
// checkBoard() then says what is still wrong, by id, for `put` to report.
import { contains, center, GRID, jitter, membershipOf, overlaps } from './layout.mjs'
import { measureCard } from './text.mjs'

const COL_W = 300 // one masonry column: the widest card kind
export const MIN_GROUP_GAP = 60 // closer than this and two groups read as one
const TUCK = { right: (t, s) => ({ x: t.x + t.w - 46, y: t.y + t.h - 38 }), left: (t, s) => ({ x: t.x - s.w + 46, y: t.y + t.h - 38 }), below: (t) => ({ x: t.x + 46, y: t.y + t.h - 30 }) }

const intentOf = (c) => c.meta?.placement ?? null
const seedOf = (c) => { const p = intentOf(c); return p?.near ?? p?.around ?? null }
const agentOwned = (x) => !x.pinned
const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x)); const y = Math.min(...rects.map((r) => r.y))
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y }
}
const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x)
const angleGap = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d }

// ---------- units: a root card and the cards placed relative to it ----------

// Follow near/around links up to the card that is placed on its own (in a group, at a
// group's edge, at coordinates). Cycles and dangling links make a card its own root.
function rootOf(board, card) {
  const seen = new Set([card.id])
  let c = card
  for (;;) {
    const s = seedOf(c)
    const next = s && board.cards[s]
    if (!next || seen.has(next.id) || next.pinned) return c
    seen.add(next.id)
    c = next
  }
}

function depth(board, card) {
  let d = 0
  for (let c = card; seedOf(c) && board.cards[seedOf(c)] && d < 50; c = board.cards[seedOf(c)]) d++
  return d
}

// Lay out one unit in local coordinates, root at the origin. Returns rects by id and the bbox.
function layoutUnit(board, root, members) {
  const rects = { [root.id]: { x: 0, y: 0, w: root.w, h: root.h } }
  const ordered = members.filter((c) => c.id !== root.id).sort((a, b) => depth(board, a) - depth(board, b) || a.n - b.n)
  for (const c of ordered) {
    const p = intentOf(c)
    const t = rects[seedOf(c)]
    if (!t) { rects[c.id] = { x: 0, y: rects[root.id].h + 24, w: c.w, h: c.h }; continue }
    const others = () => Object.entries(rects).filter(([id]) => id !== c.id).map(([, r]) => r)
    const size = { w: c.w, h: c.h }
    if (p.near && p.overlap) {
      const order = [p.side ?? 'right', 'below', 'left', 'right'].filter((v, i, a) => TUCK[v] && a.indexOf(v) === i)
      const rest = Object.entries(rects).filter(([id]) => id !== seedOf(c)).map(([, r]) => r)
      const side = order.find((o) => !rest.some((r) => overlaps({ ...TUCK[o](t, size), ...size }, r, 6))) ?? order[0]
      rects[c.id] = { ...TUCK[side](t, size), ...size }
    } else if (p.near) {
      const side = p.side ?? 'right'
      const at = { right: { x: t.x + t.w + 24, y: t.y }, left: { x: t.x - c.w - 24, y: t.y }, below: { x: t.x, y: t.y + t.h + 24 }, above: { x: t.x, y: t.y - c.h - 24 } }[side] ?? { x: t.x + t.w + 24, y: t.y }
      const r = { ...at, ...size }
      for (let guard = 0; guard < 100; guard++) {
        const hit = others().find((o) => overlaps(r, o, 14))
        if (!hit) break
        if (side === 'left') r.x = hit.x - r.w - 14
        else if (side === 'below') r.y = hit.y + hit.h + 14
        else if (side === 'above') r.y = hit.y - r.h - 14
        else r.x = hit.x + hit.w + 14
      }
      rects[c.id] = r
    } else {
      rects[c.id] = ringSlot(c, t, others(), Object.entries(rects).filter(([id]) => id !== c.id && board.cards[id] && intentOf(board.cards[id])?.around === seedOf(c)).map(([, r]) => r))
    }
  }
  const box = union(Object.values(rects))
  for (const r of Object.values(rects)) { r.x -= box.x; r.y -= box.y }
  return { root, rects, w: box.w, h: box.h }
}

// A spot on a loose ellipse around the seed, rings growing outward until one has room;
// prefer the direction furthest from the seed's other ring cards, then open space.
function ringSlot(card, seed, obstacles, siblings, avoid = []) {
  const c = center(seed)
  const sibAngles = siblings.map((s) => angleOf(c, center(s)))
  for (let ring = 0; ring < 6; ring++) {
    const rx = seed.w / 2 + card.w / 2 + 44 + ring * (card.w + 40)
    const ry = seed.h / 2 + card.h / 2 + 34 + ring * (card.h + 34)
    const n = 12 + ring * 6
    const turn = jitter(card.id, `t${ring}`, Math.PI)
    let best = null
    for (let i = 0; i < n; i++) {
      const a = turn + (2 * Math.PI * i) / n
      const k = 1 + jitter(card.id, `r${i}`, 0.12)
      const r = { x: Math.round(c.x + Math.cos(a) * rx * k - card.w / 2), y: Math.round(c.y + Math.sin(a) * ry * k - card.h / 2), w: card.w, h: card.h }
      if (obstacles.some((o) => overlaps(r, o, 18)) || avoid.some((o) => overlaps(r, o, 24))) continue
      const spread = sibAngles.length ? Math.min(...sibAngles.map((s) => angleGap(s, a))) : 0
      const score = spread - Math.abs(Math.sin(a)) * 0.2 // a slight preference for the sides, which keeps groups shorter
      if (!best || score > best.score) best = { score, r }
    }
    if (best) return best.r
  }
  return { x: seed.x + seed.w + 40, y: seed.y, w: card.w, h: card.h }
}

// ---------- groups: units packed into masonry columns ----------

// Skyline packing: each unit goes where its columns are lowest. Units wider than a
// column span several; the group widens if one is wider than all its columns.
function packGroup(cl, units) {
  const gap = GRID.cardGap
  const span = (u) => Math.max(1, Math.ceil((u.w + gap) / (COL_W + gap)))
  const cols = Math.max(cl.cols ?? GRID.defaultCols, ...units.map(span))
  const heights = Array.from({ length: cols }, (_, i) => (i % 2) * 26)
  const placed = []
  for (const u of units) {
    const s = span(u)
    let best = 0
    let bestY = Infinity
    for (let c = 0; c + s <= cols; c++) {
      const y = Math.max(...heights.slice(c, c + s))
      if (y < bestY) { bestY = y; best = c }
    }
    const x = best * (COL_W + gap) + jitter(u.root.id, 'x', 10)
    placed.push({ u, x: GRID.clusterPad + x, y: GRID.clusterHeader + bestY + jitter(u.root.id, 'y', 6) })
    for (let c = best; c < best + s; c++) heights[c] = bestY + u.h + gap
  }
  const right = Math.max(cols * COL_W + (cols - 1) * gap, ...placed.map((p) => p.x - GRID.clusterPad + p.u.w))
  const empty = !units.length
  const w = empty && cl.role === 'zone' ? GRID.zoneW : Math.round(GRID.clusterPad * 2 + right)
  const h = empty && cl.role === 'zone' ? GRID.zoneH : Math.round(GRID.clusterHeader + Math.max(140, Math.max(...heights) - gap) + GRID.clusterPad + 12)
  return { w, h, placed }
}

// ---------- prep: the whole board from intents ----------

export function arrangeBoard(board, { gutterScale = 1, originY = 0 } = {}) {
  const cards = Object.values(board.cards).filter(agentOwned)
  const groups = Object.values(board.clusters)
  const roots = new Map() // rootId -> [members]
  for (const c of cards) {
    const r = rootOf(board, c)
    if (!roots.has(r.id)) roots.set(r.id, [])
    roots.get(r.id).push(c)
  }
  const units = new Map([...roots].map(([rid, members]) => [rid, layoutUnit(board, board.cards[rid], members)]))
  const unitIn = (gid) => [...units.values()].filter((u) => intentOf(u.root)?.in === gid).sort((a, b) => a.root.n - b.root.n)
  const unitAtEdge = (gid) => [...units.values()].filter((u) => intentOf(u.root)?.edge === gid).sort((a, b) => a.root.n - b.root.n)

  // Each gridded agent group with its units and its edge units forms a cell.
  const cells = []
  for (const cl of groups.filter((g) => agentOwned(g) && g.grid)) {
    const pack = packGroup(cl, unitIn(cl.id))
    const items = [{ kind: 'group', cl, x: 0, y: 0, w: pack.w, h: pack.h, pack }]
    const offset = { right: GRID.clusterHeader, left: GRID.clusterHeader, below: GRID.clusterPad, above: GRID.clusterPad }
    for (const u of unitAtEdge(cl.id)) {
      const side = intentOf(u.root).side ?? 'right'
      let r
      if (side === 'left') { r = { x: -u.w - 36, y: offset.left }; offset.left += u.h + 24 }
      else if (side === 'below') { r = { x: offset.below, y: pack.h + 36 }; offset.below += u.w + 24 }
      else if (side === 'above') { r = { x: offset.above, y: -u.h - 36 }; offset.above += u.w + 24 }
      else { r = { x: pack.w + 36, y: offset.right }; offset.right += u.h + 24 }
      items.push({ kind: 'unit', u, ...r, w: u.w, h: u.h })
    }
    const box = union(items)
    cells.push({ cl, items, box })
  }

  // Grid: column widths and row heights from the largest cell in each.
  const colW = {}
  const rowH = {}
  for (const { cl, box } of cells) {
    colW[cl.grid.col] = Math.max(colW[cl.grid.col] ?? 0, box.w)
    rowH[cl.grid.row] = Math.max(rowH[cl.grid.row] ?? 0, box.h)
  }
  const colX = {}
  const rowY = {}
  let x = 0
  for (const c of Object.keys(colW).map(Number).sort((a, b) => a - b)) { colX[c] = x; x += colW[c] + GRID.colGutter * gutterScale }
  let y = originY
  for (const r of Object.keys(rowH).map(Number).sort((a, b) => a - b)) { rowY[r] = y; y += rowH[r] + GRID.rowGutter * gutterScale }

  const moved = new Set()
  const setRect = (item, r) => {
    const next = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w ?? item.w), h: Math.round(r.h ?? item.h) }
    if (next.x !== item.x || next.y !== item.y || next.w !== item.w || next.h !== item.h) moved.add(item.id)
    Object.assign(item, next)
  }
  const placeUnit = (u, ox, oy) => { for (const [id, r] of Object.entries(u.rects)) setRect(board.cards[id], { x: ox + r.x, y: oy + r.y }) }

  for (const { cl, items, box } of cells) {
    const ox = colX[cl.grid.col] - box.x
    const oy = rowY[cl.grid.row] - box.y
    for (const it of items) {
      if (it.kind === 'group') {
        setRect(cl, { x: ox, y: oy, w: it.w, h: it.h })
        for (const p of it.pack.placed) placeUnit(p.u, ox + p.x, oy + p.y)
      } else placeUnit(it.u, ox + it.x, oy + it.y)
    }
  }
  // Units that aren't in a gridded group: their root stays where its intent puts it.
  const done = new Set(cells.flatMap(({ cl }) => [...unitIn(cl.id), ...unitAtEdge(cl.id)].map((u) => u.root.id)))
  for (const u of units.values()) {
    if (done.has(u.root.id)) continue
    const p = intentOf(u.root)
    const at = p?.at ?? { x: u.root.x ?? 0, y: u.root.y ?? 0 }
    const r0 = u.rects[u.root.id]
    placeUnit(u, at.x - r0.x, at.y - r0.y)
  }
  return moved
}

// ---------- live: grow groups to hold their cards, then push apart ----------

// Every group holds the cards whose centers are in it, with padding.
export function fitGroups(board, ids = null) {
  const grown = new Set()
  for (const cl of Object.values(board.clusters)) {
    if (cl.role === 'zone' && cl.pinned) continue
    // A group a person placed grows only for the agent's new cards, never to tidy what was there.
    const inside = Object.values(board.cards).filter((c) => membershipOf(c, board.clusters) === cl.id && (ids?.has(c.id) || (!cl.pinned && !c.pinned)))
    if (!inside.length) continue
    const box = union(inside)
    const left = Math.min(cl.x, box.x - GRID.clusterPad)
    const top = Math.min(cl.y, box.y - GRID.clusterHeader)
    const right = Math.max(cl.x + cl.w, box.x + box.w + GRID.clusterPad)
    const bottom = Math.max(cl.y + cl.h, box.y + box.h + GRID.clusterPad)
    if (left !== cl.x || top !== cl.y || right !== cl.x + cl.w || bottom !== cl.y + cl.h) {
      Object.assign(cl, { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) })
      grown.add(cl.id)
    }
  }
  return grown
}

// Separate overlapping groups (and loose agent cards) with the least movement: each
// overlap is resolved along its shallower axis by moving whichever side may move.
// A group moves with its cards. Pinned groups, groups holding a pinned card, and the
// anchors (groups that just received the agent's new cards) stay put.
export function settleBoard(board, anchors = new Set()) {
  const members = {}
  for (const c of Object.values(board.cards)) { const g = membershipOf(c, board.clusters); if (g) (members[g] ??= []).push(c) }
  const bodies = [
    ...Object.values(board.clusters).map((cl) => ({ id: cl.id, rect: cl, cards: members[cl.id] ?? [], movable: agentOwned(cl) && !anchors.has(cl.id) && !(members[cl.id] ?? []).some((c) => c.pinned) })),
    ...Object.values(board.cards).filter((c) => !membershipOf(c, board.clusters) && c.kind !== 'sticky').map((c) => ({ id: c.id, rect: c, cards: [], movable: agentOwned(c) && !anchors.has(c.id), card: true })),
  ]
  const moved = new Set()
  const shift = (b, dx, dy) => {
    b.rect.x = Math.round(b.rect.x + dx); b.rect.y = Math.round(b.rect.y + dy)
    for (const c of b.cards) { c.x = Math.round(c.x + dx); c.y = Math.round(c.y + dy); moved.add(c.id) }
    moved.add(b.id)
  }
  const gapFor = (a, b) => (a.card && b.card ? 24 : MIN_GROUP_GAP)
  for (let iter = 0; iter < 200; iter++) {
    let pair = null
    for (let i = 0; i < bodies.length && !pair; i++) for (let j = i + 1; j < bodies.length && !pair; j++) {
      const [a, b] = [bodies[i], bodies[j]]
      if (!a.movable && !b.movable) continue
      // A loose card inside a group's box is that group's business, not a collision.
      if (a.card !== b.card && (a.card ? contains(b.rect, center(a.rect)) : contains(a.rect, center(b.rect)))) continue
      if (overlaps(a.rect, b.rect, gapFor(a, b) - 1)) pair = [a, b]
    }
    if (!pair) break
    let [a, b] = pair
    if (!b.movable) [a, b] = [b, a] // b is the one that moves
    const g = gapFor(a, b)
    const ca = center(a.rect); const cb = center(b.rect)
    const dx = cb.x >= ca.x ? a.rect.x + a.rect.w + g - b.rect.x : a.rect.x - g - (b.rect.x + b.rect.w)
    const dy = cb.y >= ca.y ? a.rect.y + a.rect.h + g - b.rect.y : a.rect.y - g - (b.rect.y + b.rect.h)
    if (Math.abs(dx) <= Math.abs(dy)) shift(b, dx, 0)
    else shift(b, 0, dy)
  }
  return moved
}

// ---------- checks ----------

const ref = (c) => `#${c.n} ${c.id}`

// What is wrong with the board as laid out, as problems an agent can act on.
// Only the agent's own work is checked: whatever people arranged is theirs.
export function checkBoard(board) {
  const problems = []
  const groups = Object.values(board.clusters)
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const [a, b] = [groups[i], groups[j]]
    if (a.pinned && b.pinned) continue
    if (overlaps(a, b)) problems.push({ type: 'groups-overlap', ids: [a.id, b.id], message: `groups ${a.id} and ${b.id} overlap` })
    else if (overlaps(a, b, MIN_GROUP_GAP - 1)) problems.push({ type: 'groups-close', ids: [a.id, b.id], message: `groups ${a.id} and ${b.id} are under ${MIN_GROUP_GAP}px apart and may read as one` })
  }
  const cards = Object.values(board.cards)
  for (const c of cards.filter(agentOwned)) {
    const p = intentOf(c)
    if (!p) continue
    const actual = membershipOf(c, board.clusters)
    let expected
    if (p.in) expected = board.clusters[p.in] ? p.in : undefined
    else if (p.edge) { if (actual === p.edge) problems.push({ type: 'wrong-group', ids: [c.id], message: `${ref(c)} was put at the edge of ${p.edge} but sits inside it` }) }
    // Once a person moves the partner, the pairing is theirs to keep or break: don't hold it against them.
    else if (seedOf(c) && board.cards[seedOf(c)] && !board.cards[seedOf(c)].pinned) expected = membershipOf(board.cards[seedOf(c)], board.clusters)
    if (expected !== undefined && actual !== expected) problems.push({ type: 'wrong-group', ids: [c.id], message: `${ref(c)} should read as ${expected ? `in ${expected}` : 'outside any group'} but sits ${actual ? `in ${actual}` : 'outside any group'}` })
  }
  const meant = (a, b) => (intentOf(a)?.near === b.id && intentOf(a)?.overlap) || (intentOf(b)?.near === a.id && intentOf(b)?.overlap)
  const solid = cards.filter((c) => c.kind !== 'sticky')
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const [a, b] = [solid[i], solid[j]]
    if (a.pinned || b.pinned) continue // people put it there; that is a reading, not a mistake
    if (overlaps(a, b) && !meant(a, b)) problems.push({ type: 'cards-overlap', ids: [a.id, b.id], message: `${ref(a)} and ${ref(b)} cover each other` })
  }
  for (const c of cards) {
    if (c.kind === 'sticky') continue
    const m = measureCard(c)
    if (m.clipped) problems.push({ type: 'title-clipped', ids: [c.id], message: `${ref(c)} title wraps to ${m.titleLines} lines and shows 3; shorten it` })
    if (board.overflow?.[c.id] && board.overflow[c.id].h === c.h) problems.push({ type: 'text-cut', ids: [c.id], message: `${ref(c)} text is cut off in the browser by ${board.overflow[c.id].by}px; shorten it` })
  }
  return problems
}
