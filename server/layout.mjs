import { measureCard } from './text.mjs'

// Placement and sizing. Everything an agent writes goes through here so that
// positions and copy stay predictable: fixed widths per kind, heights estimated
// from a greedy word wrap that matches the client's handwriting font.

// Characters per line are calibrated against Shantell Sans in the browser
// (14px 7.37, 15px 7.9, 18px 9.48, 20px 10.54 px per char, minus wrap loss).
export const KINDS = {
  note:   { w: 280, title: 90, body: 300, titleCpl: 27, titleLh: 21, bodyCpl: 32, bodyLh: 19 },
  quote:  { w: 300, title: 90, body: 200, titleCpl: 34, titleLh: 19, bodyCpl: 26, bodyLh: 24 }, // title = gist, body = hook
  sticky: { w: 200, title: 140, body: 0 },
  // Marker text written straight on the board: the start prompt, an open question.
  prompt: { w: 340, title: 160, body: 200, titleCpl: 30, titleLh: 26, bodyCpl: 40, bodyLh: 22, bare: true },
}

// Stable small numbers per id, for jitter (server) and tilt (client).
export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function jitter(id, salt, range) {
  return ((hash(id + salt) % 1000) / 1000 - 0.5) * 2 * range
}

export const GRID = {
  clusterPad: 22,
  clusterHeader: 24, // labels render above the group, so only padding is needed inside
  cardGap: 34,
  colGutter: 240,
  rowGutter: 160,
  defaultCols: 2,
  zoneW: 340,
  zoneH: 420,
}

const PAD_Y = 30 // 14px padding top and bottom plus a 1px border each side
const HEADER = 30
const FOOTER = 30
const MAX_TITLE_LINES = 3
const COL_W = KINDS.note.w + 20

export function wrapLines(text, cpl) {
  if (!text) return 0
  let lines = 0
  for (const para of String(text).split(/\n/)) {
    let cur = 0
    lines += 1
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let len = word.length
      if (cur === 0) {
        while (len > cpl) { lines += 1; len -= cpl }
        cur = len
      } else if (cur + 1 + len <= cpl) {
        cur += 1 + len
      } else {
        lines += 1
        while (len > cpl) { lines += 1; len -= cpl }
        cur = len
      }
    }
  }
  return lines
}

// Clamp copy to the kind's budget and report what was cut, so the calling agent
// can rewrite instead of shipping a silently truncated card.
export function normalizeCopy(card, warnings = []) {
  const spec = KINDS[card.kind] ?? KINDS.note
  const out = { ...card }
  for (const field of ['title', 'body']) {
    const max = spec[field]
    const val = out[field] ?? ''
    if (max === 0 && val && field === 'body') {
      out.title = (out.title ? out.title + ' — ' : '') + val
      out.body = ''
      continue
    }
    if (val.length > max) {
      warnings.push(`card ${card.id}: ${field} is ${val.length} chars, budget for ${card.kind} is ${max}; truncated`)
      out[field] = val.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
    }
  }
  return out
}

export function cardSize(card) {
  const { w, h } = measureCard(card)
  return { w, h }
}

export function overlaps(a, b, margin = 0) {
  return a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y
}

export function center(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function contains(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

// Which group a card sits in, by its center. Zones win over clusters when they overlap.
export function membershipOf(card, clusters) {
  const c = center(card)
  const hits = Object.values(clusters).filter((cl) => contains(cl, c))
  if (!hits.length) return null
  hits.sort((a, b) => (a.role === 'zone' ? -1 : 0) - (b.role === 'zone' ? -1 : 0) || a.w * a.h - b.w * b.h)
  return hits[0].id
}

// Masonry flow inside a cluster: each card goes to the currently shortest column.
// Columns are staggered and cards jittered a little, so nothing lines up.
export function flowCluster(cluster, cards) {
  const cols = cluster.cols ?? GRID.defaultCols
  const gap = GRID.cardGap
  const heights = Array.from({ length: cols }, (_, i) => (i % 2) * 26)
  const placed = []
  for (const card of cards) {
    const size = cardSize(card)
    let col = 0
    for (let i = 1; i < cols; i++) if (heights[i] < heights[col]) col = i
    placed.push({ id: card.id, dx: GRID.clusterPad + col * (COL_W + gap) + jitter(card.id, 'x', 12), dy: GRID.clusterHeader + heights[col] + jitter(card.id, 'y', 8), ...size })
    heights[col] += size.h + gap
  }
  const w = GRID.clusterPad * 2 + cols * COL_W + (cols - 1) * gap
  const h = GRID.clusterHeader + Math.max(140, Math.max(...heights)) + GRID.clusterPad - gap + 12
  return { w, h, placed }
}

// Lay clusters on a coarse grid. Column widths and row heights come from the
// largest cluster in each, so nothing overlaps.
export function placeGrid(clusters, origin = { x: 0, y: 0 }) {
  const colW = {}
  const rowH = {}
  for (const cl of clusters) {
    const { col, row } = cl.at
    colW[col] = Math.max(colW[col] ?? 0, cl.w)
    rowH[row] = Math.max(rowH[row] ?? 0, cl.h)
  }
  const colX = {}
  const rowY = {}
  let x = origin.x
  for (const c of Object.keys(colW).map(Number).sort((a, b) => a - b)) { colX[c] = x; x += colW[c] + GRID.colGutter }
  let y = origin.y
  for (const r of Object.keys(rowH).map(Number).sort((a, b) => a - b)) { rowY[r] = y; y += rowH[r] + GRID.rowGutter }
  return Object.fromEntries(clusters.map((cl) => [cl.id, { x: colX[cl.at.col], y: rowY[cl.at.row] }]))
}

// Nudge a rect down until it clears every obstacle.
export function settle(r, obstacles, margin = 14) {
  const out = { ...r }
  for (let guard = 0; guard < 200; guard++) {
    const hit = obstacles.find((o) => overlaps(out, o, margin))
    if (!hit) return out
    out.y = hit.y + hit.h + margin
  }
  return out
}

function obstaclesFor(state, exceptId) {
  return Object.values(state.cards).filter((c) => c.id !== exceptId)
}

function freeSlotInCluster(state, cluster, size, exceptId) {
  const inside = obstaclesFor(state, exceptId).filter((c) => membershipOf(c, { [cluster.id]: cluster }) === cluster.id)
  const cols = Math.max(1, Math.floor((cluster.w - GRID.clusterPad * 2 + GRID.cardGap) / (COL_W + GRID.cardGap)))
  let best = null
  for (let col = 0; col < cols; col++) {
    const x = cluster.x + GRID.clusterPad + col * (COL_W + GRID.cardGap)
    const candidate = settle({ x, y: cluster.y + GRID.clusterHeader, ...size }, inside, 16)
    if (!best || candidate.y < best.y) best = candidate
  }
  return best
}

const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x)
const angleGap = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d }

// A spot on a loose ellipse around the seed: rings grow outward until one has room.
// Among the free spots, prefer the direction furthest from the seed's other
// expansions (so they fan out instead of stacking), then open space, then staying
// inside the seed's group. Other groups are obstacles, so a ring never spills into
// a neighboring group and changes what a card reads as belonging to.
function aroundSlot(state, card, seed, seedId) {
  const c = center(seed)
  const cards = obstaclesFor(state, card.id)
  const homeId = membershipOf(seed, state.clusters)
  const home = homeId && state.clusters[homeId]
  const foreign = Object.values(state.clusters).filter((cl) => cl.id !== homeId)
  const siblings = cards.filter((o) => o.meta?.placement?.around === seedId).map((o) => angleOf(c, center(o)))
  for (let ring = 0; ring < 6; ring++) {
    const rx = seed.w / 2 + card.w / 2 + 44 + ring * (card.w + 40)
    const ry = seed.h / 2 + card.h / 2 + 34 + ring * (card.h + 34)
    const n = 12 + ring * 6
    const turn = jitter(card.id, `t${ring}`, Math.PI)
    let best = null
    for (let i = 0; i < n; i++) {
      const a = turn + (2 * Math.PI * i) / n
      const k = 1 + jitter(card.id, `r${i}`, 0.12)
      const r = { x: c.x + Math.cos(a) * rx * k - card.w / 2, y: c.y + Math.sin(a) * ry * k - card.h / 2, w: card.w, h: card.h }
      if (cards.some((o) => overlaps(r, o, 18)) || foreign.some((cl) => overlaps(r, cl, 24))) continue
      const clearance = Math.min(220, ...cards.map((o) => gapBetween(r, o)))
      const spread = siblings.length ? Math.min(...siblings.map((s) => angleGap(s, a))) : 0
      const outside = home && !contains(home, center(r)) ? 0.5 : 0
      // How far the group would have to grow: rings that keep the neighborhood compact win.
      const growth = home ? Math.max(0, home.x - r.x) + Math.max(0, r.x + r.w - home.x - home.w) + Math.max(0, home.y - r.y) + Math.max(0, r.y + r.h - home.y - home.h) : 0
      const score = spread + clearance / 300 - outside - growth / 250
      if (!best || score > best.score) best = { score, r }
    }
    if (best) return { x: Math.round(best.r.x), y: Math.round(best.r.y), w: card.w, h: card.h }
  }
  return settle({ x: seed.x + seed.w + 40, y: seed.y, w: card.w, h: card.h }, cards)
}

// If the partner card sits in a group, the group stretches to hold the new card too.
function stretchHome(state, partner, r) {
  const home = membershipOf(partner, state.clusters)
  const cl = home && state.clusters[home]
  if (!cl || cl.role === 'zone') return
  const right = Math.max(cl.x + cl.w, r.x + r.w + GRID.clusterPad)
  const bottom = Math.max(cl.y + cl.h, r.y + r.h + GRID.clusterPad)
  const left = Math.min(cl.x, r.x - GRID.clusterPad)
  const top = Math.min(cl.y, r.y - GRID.clusterHeader)
  cl.w = right - left
  cl.h = bottom - top
  cl.x = left
  cl.y = top
}

// Resolve an agent placement spec to absolute coordinates.
//   { in: groupId }                     next free slot inside the group (grows it if needed)
//   { near: cardId, side, overlap }     beside another card; overlap tucks it onto the partner's footer corner
//   { edge: groupId, side }             just outside a group (right|left|below|above)
//   { around: cardId }                  on a loose ring around a card or sticky, each in a new direction
//   { at: { x, y } }                    absolute page coordinates
export function resolvePlace(state, card, place, warnings = []) {
  const size = { w: card.w, h: card.h }
  const others = obstaclesFor(state, card.id)
  if (!place) place = { at: { x: card.x ?? 0, y: card.y ?? 0 } }

  if (place.at) return settle({ x: place.at.x, y: place.at.y, ...size }, others)

  if (place.in) {
    const cl = state.clusters[place.in]
    if (!cl) { warnings.push(`card ${card.id}: group ${place.in} not found; placed at origin`); return { x: 0, y: 0, ...size } }
    const r = freeSlotInCluster(state, cl, size, card.id)
    const bottom = r.y + r.h + GRID.clusterPad
    if (bottom > cl.y + cl.h) cl.h = bottom - cl.y
    return r
  }

  // Two cards to read together: the second overlaps the first's footer corner, never its hook.
  if (place.near && place.overlap) {
    const t = state.cards[place.near]
    if (!t) { warnings.push(`card ${card.id}: ${place.near} not found`); return { x: 0, y: 0, ...size } }
    const at = {
      right: { x: t.x + t.w - 46, y: t.y + t.h - 38 },
      left: { x: t.x - size.w + 46, y: t.y + t.h - 38 },
      below: { x: t.x + 46, y: t.y + t.h - 30 },
    }
    const order = [place.side ?? 'right', 'below', 'left', 'right'].filter((v, i, a) => at[v] && a.indexOf(v) === i)
    const rest = Object.values(state.cards).filter((c) => c.id !== card.id && c.id !== t.id)
    const side = order.find((o) => !rest.some((c) => overlaps({ ...at[o], ...size }, c, 6))) ?? order[0]
    const r = { ...at[side], ...size }
    stretchHome(state, t, r)
    return r
  }

  if (place.around) {
    const seed = state.cards[place.around]
    if (!seed) { warnings.push(`card ${card.id}: ${place.around} not found`); return { x: 0, y: 0, ...size } }
    const r = aroundSlot(state, card, seed, place.around)
    stretchHome(state, seed, r)
    return r
  }

  if (place.edge || place.near) {
    const target = place.edge ? state.clusters[place.edge] : state.cards[place.near]
    if (!target) { warnings.push(`card ${card.id}: ${place.edge ?? place.near} not found`); return { x: 0, y: 0, ...size } }
    const side = place.side ?? 'right'
    const m = place.edge ? 36 : 24
    let r
    if (side === 'right') r = { x: target.x + target.w + m, y: target.y + (place.edge ? GRID.clusterHeader : 0) }
    else if (side === 'left') r = { x: target.x - size.w - m, y: target.y + (place.edge ? GRID.clusterHeader : 0) }
    else if (side === 'below') r = { x: target.x + (place.edge ? GRID.clusterPad : 0), y: target.y + target.h + m }
    else r = { x: target.x + (place.edge ? GRID.clusterPad : 0), y: target.y - size.h - m }
    const out = settle({ ...r, ...size }, others)
    // Beside a card means in its neighborhood; at a group's edge means deliberately outside it.
    if (place.near) stretchHome(state, target, out)
    return out
  }

  warnings.push(`card ${card.id}: unknown placement ${JSON.stringify(place)}`)
  return { x: 0, y: 0, ...size }
}

// Cards that cover each other without being placed to overlap on purpose.
// This is what a screenshot used to be for.
// Stickies are left out: a person's sticky on a card is an attachment, not an accident.
export function collisions(state) {
  const cards = Object.values(state.cards).filter((c) => c.kind !== 'sticky')
  const meant = (a, b) => a.meta?.placement?.near === b.id && a.meta?.placement?.overlap
  const out = []
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const [a, b] = [cards[i], cards[j]]
    if (overlaps(a, b) && !meant(a, b) && !meant(b, a)) out.push([a, b])
  }
  return out
}

// Edge-to-edge distance between two rects; 0 when they touch or overlap.
export function gapBetween(a, b) {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h))
  return Math.round(Math.hypot(dx, dy))
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

// A sticky is on a card only when the overlap is more than a clipped corner:
// at least a tenth of the smaller of the two. The client draws pins by the same rule.
export const ATTACH_SHARE = 0.1
function attaches(a, b) {
  return overlapArea(a, b) >= ATTACH_SHARE * Math.min(a.w * a.h, b.w * b.h)
}

// What a card (usually a person's sticky) is attached to, computed the same way
// the board shows it: on a card it overlaps, else in the group around its center,
// else in open space. `nearest` lists the closest other cards by edge gap, and
// `ambiguous` flags a near-tie between two cards in different groups.
export function neighborhood(state, card, k = 3) {
  const others = Object.values(state.cards).filter((c) => c.id !== card.id)
  const on = others.filter((c) => c.kind !== 'sticky' && attaches(card, c)).sort((a, b) => overlapArea(card, b) - overlapArea(card, a))[0] ?? null
  const group = membershipOf(card, state.clusters)
  const nearest = others.filter((c) => c !== on).map((c) => ({ card: c, gap: gapBetween(card, c) })).sort((a, b) => a.gap - b.gap).slice(0, k)
  const [n1, n2] = nearest
  const ambiguous = !on && !group && !!n2 && n2.gap - n1.gap < 40 && membershipOf(n1.card, state.clusters) !== membershipOf(n2.card, state.clusters)
  return { on, group, nearest, ambiguous }
}
