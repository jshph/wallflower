// Layout v2: prep-time arrangement from intents, live-time placement around what
// people placed, the checks `put` reports, and text measured in the board's font.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BoardStore, PROPOSED } from '../server/store.mjs'
import { checkBoard } from '../server/arrange.mjs'
import { membershipOf, overlaps } from '../server/layout.mjs'
import { lineCount, measureCard } from '../server/text.mjs'

const AG = 'agent:prep'
const HU = 'human:kim'
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rb-layout-'))
function fresh() {
  const s = new BoardStore(tmp())
  s.create({ id: 't', title: 'test' }, AG)
  return s
}
const groupsApart = (b) => {
  const g = Object.values(b.clusters)
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (overlaps(g[i], g[j])) return [g[i].id, g[j].id]
  return null
}

// The shape that broke a real board: a row-0 group whose cards have partners tucked
// onto them and placed below them, with another group in the row underneath.
const crowded = {
  groups: [
    { id: 'spec', col: 0, row: 0 },
    { id: 'move', col: 1, row: 0 },
    { id: 'asks', col: 0, row: 1 },
    { id: 'loop', col: 1, row: 1 },
    { id: 'done', label: 'Settled', col: 2, row: 0, zone: true },
  ],
  cards: [
    { id: 'diagram', kind: 'note', title: 'The sketch from Tuesday: checkout as a single shared step', body: 'cart, then shipping options with many carriers, then the address form, then payment, then review, then the receipt, which goes out by email.', place: { in: 'spec' } },
    { id: 'repo', kind: 'note', title: 'Staging today: one branch, no reviews requested yet', body: 'Access is set up. The review queue is empty: nobody has opened the five drafts.', place: { near: 'diagram', side: 'right', overlap: true } },
    { id: 'handoff', kind: 'quote', title: 'The onboarding test', body: 'if you sent me the link today, would I be able to finish the setup without asking anyone', source: { author: 'A', date: 'Nov 9' }, place: { near: 'repo', side: 'below' } },
    { id: 'comment', kind: 'quote', title: 'A comment on draft two', body: "there's no thread through it, we never say what the reader should do next", source: { author: 'B' }, place: { in: 'move' } },
    { id: 'change', kind: 'note', title: 'By draft five the closing line has changed', place: { near: 'comment', side: 'right', overlap: true } },
    { id: 'medium', kind: 'quote', title: 'Say who it is for before any feedback', body: "it reads like a report, it's too long and it will never reach the people at the front desk", place: { in: 'asks' } },
    { id: 'tone', kind: 'quote', title: 'Most repeated note', body: 'can it sound less like a brochure', place: { in: 'asks' } },
    { id: 'read', kind: 'quote', title: 'What the widget does', body: "it'll just show the totals, right?", place: { in: 'loop' } },
    { id: 'cost', kind: 'quote', title: 'Per-seat pricing', body: 'that would double what we pay', place: { near: 'read', side: 'right', overlap: true } },
    { id: 'echo', kind: 'note', title: 'Four vendors, four hand-written setup guides', place: { edge: 'loop', side: 'right' } },
    { id: 'start', kind: 'prompt', title: 'Start here', body: 'Pull out what Thursday has to settle.', place: { at: { x: 0, y: -220 } } },
  ],
}

test('prep: groups never overlap, every card reads as in the group it was placed in', () => {
  const s = fresh()
  const r = s.applyPlan('t', crowded, AG)
  const b = s.get('t')
  assert.equal(groupsApart(b), null)
  assert.deepEqual(r.problems.filter((p) => p.type !== 'title-clipped'), [])
  const m = (id) => membershipOf(b.cards[id], b.clusters)
  assert.equal(m('diagram'), 'spec')
  assert.equal(m('repo'), 'spec', 'a tucked partner stays in its partner group')
  assert.equal(m('handoff'), 'spec', 'a card placed below a partner stays in its group')
  assert.equal(m('change'), 'move')
  assert.equal(m('cost'), 'loop')
  assert.equal(m('echo'), null, 'an edge card sits outside its group')
  assert.ok(b.clusters.asks.y >= b.clusters.spec.y + b.clusters.spec.h + 60, 'row 1 starts below the tallest group of row 0')
})

test('prep: a single put can mix in, near, and edge placements (no two-step workaround)', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  // Same board built in two steps comes out identical.
  const s2 = fresh()
  s2.applyPlan('t', { groups: crowded.groups, cards: crowded.cards.map(({ place, ...c }) => ({ ...c, place: place.in || place.at || place.edge ? place : { in: 'spec' } })) }, AG)
  s2.applyPlan('t', { cards: crowded.cards.filter((c) => c.place.near).map((c) => ({ id: c.id, place: c.place })) }, AG)
  const pos = (st) => Object.fromEntries(Object.values(st.get('t').cards).map((c) => [c.id, [c.x, c.y]]))
  assert.deepEqual(pos(s2), pos(s))
})

test('prep: changing a group row or a card group just works', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  s.applyPlan('t', { groups: [{ id: 'asks', row: 2 }], cards: [{ id: 'tone', place: { in: 'move' } }] }, AG)
  const b = s.get('t')
  assert.ok(b.clusters.asks.y > b.clusters.loop.y, 'asks moved down a row')
  assert.equal(membershipOf(b.cards.tone, b.clusters), 'move')
  assert.equal(groupsApart(b), null)
  assert.deepEqual(checkBoard(b).filter((p) => p.type !== 'title-clipped'), [])
})

test('cards can be named by number', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  const n = s.get('t').cards.read.n
  const r = s.applyPlan('t', { cards: [{ id: 'more', kind: 'note', title: 'beside it', place: { around: `#${n}` } }] }, AG)
  assert.deepEqual(r.warnings, [])
  assert.equal(s.get('t').cards.more.meta.placement.around, 'read')
  assert.equal(membershipOf(s.get('t').cards.more, s.get('t').clusters), 'loop')
})

test('live: what people placed never moves; the agent grows into space and pushes only its own groups', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  const b = s.get('t')
  // A person drags the move group a little and drops a sticky on a card in loop.
  s.apply('t', [{ op: 'cluster.update', id: 'move', x: b.clusters.move.x + 20, y: b.clusters.move.y }], HU)
  s.apply('t', [{ op: 'card.upsert', id: 'st', kind: 'sticky', title: 'dig into this', x: b.cards.read.x + 60, y: b.cards.read.y + 40 }], HU)
  assert.ok(s.getSnapshot('t', PROPOSED))
  const pinnedBefore = JSON.stringify([b.clusters.move, b.cards.st].map(({ x, y, w, h }) => ({ x, y, w, h })))
  const r = s.applyPlan('t', { cards: ['a', 'b', 'c', 'd'].map((k) => ({ id: `ring-${k}`, kind: 'note', title: `a longer thought around the sticky, number ${k}`, place: { around: 'st' } })) }, AG)
  const after = s.get('t')
  assert.equal(JSON.stringify([after.clusters.move, after.cards.st].map(({ x, y, w, h }) => ({ x, y, w, h }))), pinnedBefore, 'pinned things stay put')
  assert.equal(groupsApart(after), null)
  for (const k of ['a', 'b', 'c', 'd']) assert.equal(membershipOf(after.cards[`ring-${k}`], after.clusters), 'loop', `ring-${k} stays in the sticky's group`)
  assert.deepEqual(r.problems.filter((p) => ['groups-overlap', 'cards-overlap', 'wrong-group'].includes(p.type)), [])
  // The agent's layout moves are logged as the agent's, not mistaken for people's.
  const layoutMoves = s.events('t').filter((e) => e.reason === 'layout')
  assert.ok(layoutMoves.every((e) => e.actor === AG))
})

test('live: the agent cannot move a card a person placed', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  const { x, y } = s.get('t').cards.read
  s.apply('t', [{ op: 'card.move', id: 'read', x: x + 500, y }], HU)
  const r = s.applyPlan('t', { cards: [{ id: 'read', place: { in: 'asks' } }] }, AG)
  assert.equal(s.get('t').cards.read.x, x + 500)
  assert.match(r.warnings.join(' '), /placed by a person/)
})

test('live: a new group goes into free space', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  s.apply('t', [{ op: 'card.upsert', id: 'st', kind: 'sticky', title: 'hm', x: -600, y: 0 }], HU)
  const r = s.applyPlan('t', { groups: [{ id: 'later', col: 3, row: 0 }], cards: [{ id: 'l1', kind: 'note', title: 'a late addition', place: { in: 'later' } }, { id: 'l2', kind: 'note', title: 'and another', place: { in: 'later' } }] }, AG)
  const b = s.get('t')
  assert.equal(groupsApart(b), null)
  assert.equal(membershipOf(b.cards.l1, b.clusters), 'later')
  assert.equal(membershipOf(b.cards.l2, b.clusters), 'later')
  assert.deepEqual(r.problems.filter((p) => p.type !== 'title-clipped'), [])
})

test('checks: overlaps people made are not the agent\'s problem; clipped titles are', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  const b = s.get('t')
  s.apply('t', [{ op: 'card.move', id: 'tone', x: b.cards.medium.x + 10, y: b.cards.medium.y + 10 }], HU)
  assert.equal(checkBoard(s.get('t')).filter((p) => p.type === 'cards-overlap').length, 0)
  s.applyPlan('t', { cards: [{ id: 'long', kind: 'note', title: 'Extraordinarily comprehensive understanding regarding interdisciplinary collaborations', place: { in: 'asks' } }] }, AG)
  assert.ok(checkBoard(s.get('t')).some((p) => p.type === 'title-clipped' && p.ids[0] === 'long'))
})

test('old boards learn what people placed from their log', () => {
  const dir = tmp()
  const s = new BoardStore(dir)
  s.create({ id: 't', title: 'old' }, AG)
  s.applyPlan('t', crowded, AG)
  s.apply('t', [{ op: 'card.move', id: 'read', x: 5, y: 5 }], HU)
  const file = path.join(dir, 'boards', 't', 'state.json')
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete raw.layout
  for (const c of Object.values(raw.cards)) delete c.pinned
  fs.writeFileSync(file, JSON.stringify(raw))
  const b = new BoardStore(dir).get('t')
  assert.equal(b.cards.read.pinned, true)
  assert.ok(!b.cards.cost.pinned)
})

test('text: wraps at spaces with the font widths, never predicting too few lines', () => {
  assert.equal(lineCount('', 252, 16, 700), 0)
  assert.equal(lineCount('short', 252, 16, 700), 1)
  assert.equal(lineCount('a\nb', 252, 14, 400, { preWrap: true }), 2)
  assert.equal(lineCount('a\nb', 252, 14, 400), 1, 'newlines collapse outside pre-wrap')
  const wide = 'word '.repeat(40)
  assert.ok(lineCount(wide, 252, 14, 400) > lineCount(wide, 400, 14, 400))
  // An empty quote still draws its curly quotes on one line.
  assert.ok(measureCard({ kind: 'quote', title: 'gist', body: '' }).h > measureCard({ kind: 'note', title: 'gist' }).h)
})

test('live: cards ringed around a sticky keep the neighborhood compact', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  const b = s.get('t')
  const g0 = { ...b.clusters.loop }
  s.apply('t', [{ op: 'card.upsert', id: 'st', kind: 'sticky', title: 'more on this', x: b.cards.read.x + 60, y: b.cards.read.y + 30 }], HU)
  s.applyPlan('t', { cards: ['a', 'b', 'c'].map((k) => ({ id: `r-${k}`, kind: 'note', title: `one more thought, ${k}`, body: 'a line of detail under it', place: { around: 'st' } })) }, AG)
  const g = s.get('t').clusters.loop
  assert.ok(g.w * g.h < 3 * g0.w * g0.h, `group grew from ${g0.w}x${g0.h} to ${g.w}x${g.h}`)
  assert.ok(g.w < 1.6 * g0.w, `group widened from ${g0.w} to ${g.w}`)
})

test('checks: once a person moves a card\'s partner, the pairing is no longer held against the board', () => {
  const s = fresh()
  s.applyPlan('t', crowded, AG)
  const b = s.get('t')
  s.apply('t', [{ op: 'card.move', id: 'read', x: b.clusters.asks.x + 40, y: b.clusters.asks.y + b.clusters.asks.h - 140 }], HU)
  assert.equal(checkBoard(s.get('t')).filter((p) => p.type === 'wrong-group').length, 0)
})

test('live: a growing group pushes the agent\'s free-standing prompt clear instead of swallowing it', () => {
  const s = fresh()
  s.applyPlan('t', { groups: [{ id: 'g', col: 0 }], cards: [{ id: 'c1', kind: 'note', title: 'a card', place: { in: 'g' } }, { id: 'p', kind: 'prompt', title: 'Start here', place: { at: { x: 0, y: -140 } } }] }, AG)
  const b = s.get('t')
  s.apply('t', [{ op: 'card.upsert', id: 'st', kind: 'sticky', title: 'more', x: b.cards.c1.x + 40, y: b.cards.c1.y + 10 }], HU)
  s.applyPlan('t', { cards: ['a', 'b', 'c', 'd', 'e'].map((k) => ({ id: `r-${k}`, kind: 'note', title: `ring ${k}`, place: { around: 'st' } })) }, AG)
  const a = s.get('t')
  assert.equal(membershipOf(a.cards.p, a.clusters), null, 'the prompt still reads as outside any group')
  assert.ok(!overlaps(a.cards.p, a.clusters.g), 'and sits clear of the group')
})
