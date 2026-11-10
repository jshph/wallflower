import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BoardStore, PROPOSED } from '../server/store.mjs'
import { diffBoards, diffToMarkdown } from '../server/diff.mjs'
import { boardToAscii, boardToListing } from '../server/ascii.mjs'
import { collisions, membershipOf, overlaps, wrapLines } from '../server/layout.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'))
const AG = 'agent:prep'
const HU = 'human:kim'

const plan = {
  title: 'test',
  groups: [
    { id: 'a', col: 0, why: 'counting rule' },
    { id: 'b', col: 1 },
    { id: 'decided', label: 'Decided', col: 2, zone: true },
  ],
  cards: [
    { id: 'c1', kind: 'quote', title: 'Rosa on counting', body: 'more than half of the people', people: ['Rosa'], place: { in: 'a' } },
    { id: 'c2', kind: 'note', title: 'saved rule', body: 'more than half of the submissions', place: { in: 'a' } },
    { id: 'c3', kind: 'note', title: 'count people, name stretches', place: { in: 'a' } },
    { id: 'c4', kind: 'note', title: 'rerun stability test', place: { in: 'b' } },
    { id: 'c5', kind: 'quote', title: 'Q3 rerun', body: 'found 2 not 3', place: { near: 'c4', side: 'right', overlap: true } },
    { id: 'ed', kind: 'note', title: 'outside card', place: { edge: 'b', side: 'right' } },
  ],
}

function fresh() {
  const s = new BoardStore(tmp())
  s.create({ id: 't', title: 'test' }, AG)
  return s
}

test('wrapLines', () => {
  assert.equal(wrapLines('', 10), 0)
  assert.equal(wrapLines('one two three', 7), 2)
  assert.equal(wrapLines('a\nb', 10), 2)
})

test('a plan lays out without accidental overlaps and keeps placement intent', () => {
  const s = fresh()
  const r = s.applyPlan('t', plan, AG)
  assert.deepEqual(r.warnings, [])
  const b = s.get('t')
  assert.deepEqual(collisions(b), [], 'only the deliberate overlap pair touches')
  assert.ok(overlaps(b.cards.c4, b.cards.c5), 'overlap pair touches')
  assert.equal(membershipOf(b.cards.c1, b.clusters), 'a')
  assert.equal(membershipOf(b.cards.c4, b.clusters), 'b')
  assert.equal(membershipOf(b.cards.ed, b.clusters), null, 'edge card sits outside')
  assert.equal(b.clusters.decided.role, 'zone')
  assert.deepEqual(b.cards.c1.meta.placement, { in: 'a' })
  assert.ok(boardToAscii(b).includes('[1]'))
  assert.match(boardToListing(b), /Zone "Decided"/)
})

test('plans are partial: update in place, delete by flag', () => {
  const s = fresh()
  s.applyPlan('t', plan, AG)
  const before = { ...s.get('t').cards.c1 }
  s.applyPlan('t', { cards: [{ id: 'c1', title: 'Rosa, reworded' }, { id: 'ed', delete: true }] }, AG)
  const b = s.get('t')
  assert.equal(b.cards.c1.title, 'Rosa, reworded')
  assert.equal(b.cards.c1.x, before.x, 'an update without a placement stays put')
  assert.equal(b.cards.ed, undefined)
})

test('collisions flag cards that cover each other by accident', () => {
  const s = fresh()
  s.applyPlan('t', { cards: [
    { id: 'x', kind: 'note', title: 'x', place: { at: { x: 0, y: 0 } } },
    { id: 'y', kind: 'note', title: 'y', place: { near: 'x', side: 'right', overlap: true } },
  ] }, AG)
  assert.deepEqual(collisions(s.get('t')), [])
  s.apply('t', [{ op: 'card.move', id: 'y', x: 10, y: 10 }], AG)
  assert.equal(collisions(s.get('t')).length, 0, 'the pair was meant to overlap')
  s.applyPlan('t', { cards: [{ id: 'z', kind: 'note', title: 'z' }] }, AG)
  s.apply('t', [{ op: 'card.move', id: 'z', x: 5, y: 5 }], AG)
  assert.ok(collisions(s.get('t')).length >= 1)
})

test('copy over budget is truncated with a warning', () => {
  const s = fresh()
  const r = s.applyPlan('t', { cards: [{ id: 'x', kind: 'quote', title: 't', body: 'word '.repeat(80) }] }, AG)
  assert.equal(r.warnings.length, 1)
  assert.ok(s.get('t').cards.x.body.length <= 200)
})

test('the proposal is snapshotted when a person first touches the board', () => {
  const s = fresh()
  s.applyPlan('t', plan, AG)
  s.applyPlan('t', { cards: [{ id: 'late', kind: 'note', title: 'added before anyone looked', place: { in: 'b' } }] }, AG)
  assert.equal(s.getSnapshot('t', PROPOSED), null, 'agent writes never snapshot')
  const b = s.get('t')
  const B = b.clusters.b, D = b.clusters.decided
  s.apply('t', [
    { op: 'card.move', id: 'c3', x: B.x + 30, y: B.y + 60 },
    { op: 'card.delete', id: 'ed' },
    { op: 'cluster.update', id: 'a', label: 'which unit counts' },
    { op: 'card.upsert', id: 's1', kind: 'sticky', title: 'ask Rosa first', place: { at: { x: D.x + 40, y: D.y + 80 } } },
  ], HU)
  const snap = s.getSnapshot('t', PROPOSED)
  assert.ok(snap.state.cards.late, 'proposal includes everything the agent wrote before hand-off')
  assert.equal(snap.actor, AG)
  s.apply('t', [{ op: 'card.move', id: 'c1', x: 0, y: 2000 }], HU)
  assert.equal(s.getSnapshot('t', PROPOSED).rev, snap.rev, 'later edits do not move the baseline')

  const d = diffBoards(s.getSnapshot('t', PROPOSED), s.get('t'), s.events('t'))
  const fate = (id) => d.cards.find((c) => c.id === id)
  assert.equal(fate('c3').status, 'regrouped')
  assert.equal(fate('c3').groupAfter, 'b')
  assert.equal(fate('ed').status, 'deleted')
  assert.equal(fate('s1').status, 'added')
  assert.equal(fate('c2').status, 'untouched')
  assert.equal(d.renames[0].to, 'which unit counts')
  assert.equal(d.zones[0].cards[0].id, 's1')
  assert.ok(d.summary.groupingAgreement < 1)
  assert.ok(d.summary.actorsAfter.includes(HU))
  const md = diffToMarkdown(d, s.getSnapshot('t', PROPOSED).state, s.get('t'))
  assert.match(md, /Grouping agreement/)
  assert.match(md, /agent's reason: counting rule/)
})

test('moving an existing card through a plan is logged as a move', () => {
  const s = fresh()
  s.applyPlan('t', plan, AG)
  s.applyPlan('t', { cards: [{ id: 'c4', place: { in: 'decided' } }] }, HU)
  assert.equal(membershipOf(s.get('t').cards.c4, s.get('t').clusters), 'decided')
  const d = diffBoards(s.getSnapshot('t', PROPOSED), s.get('t'), s.events('t'))
  assert.equal(d.summary.events, 1)
  assert.equal(d.cards.find((c) => c.id === 'c4').status, 'regrouped')
})

test('a sticky reads as attached to the card it overlaps, else its group', async () => {
  const { neighborhood } = await import('../server/layout.mjs')
  const s = fresh()
  s.applyPlan('t', plan, AG)
  const c1 = s.get('t').cards.c1
  s.apply('t', [{ op: 'card.upsert', id: 'on', kind: 'sticky', title: 'more of this', x: c1.x + 40, y: c1.y + 40 }], HU)
  const b = s.get('t')
  assert.equal(neighborhood(b, b.cards.on).on.id, 'c1')
  const A = b.clusters.a
  const bottom = A.y + A.h
  s.apply('t', [{ op: 'cluster.update', id: 'a', h: A.h + 260 }, { op: 'card.move', id: 'on', x: A.x + 30, y: bottom + 20 }], HU)
  const n = neighborhood(s.get('t'), s.get('t').cards.on)
  assert.equal(n.on, null)
  assert.equal(n.group, 'a')
  assert.ok(n.nearest.length && n.nearest[0].gap >= 0)
})

test('rounds: a pass hands over only what people did since the last pass', async () => {
  const { roundToMarkdown } = await import('../server/round.mjs')
  const s = fresh()
  s.applyPlan('t', plan, AG)
  assert.equal(s.takePass('t'), null, 'nothing to take before anyone asks')
  const c1 = s.get('t').cards.c1
  s.apply('t', [
    { op: 'card.upsert', id: 'k1', kind: 'sticky', title: 'more of this', x: c1.x + 40, y: c1.y + 40 },
    { op: 'card.move', id: 'c4', x: s.get('t').clusters.a.x + 30, y: s.get('t').clusters.a.y + 400 },
    { op: 'pass.request', note: 'go further back' },
  ], HU)
  assert.ok(s.passPending('t'))
  const md = roundToMarkdown(s.get('t'), s.takePass('t'))
  assert.match(md, /go further back/)
  assert.match(md, /"more of this" \(new, by kim\)/)
  assert.match(md, /on #1 /)
  assert.match(md, /Cards people moved/)
  assert.ok(!s.passPending('t'))

  // The agent answers; that is not part of the next round.
  s.applyPlan('t', { cards: [{ id: 'more1', kind: 'note', title: 'an earlier moment', place: { near: 'k1', side: 'right' } }] }, AG)
  s.apply('t', [{ op: 'cluster.update', id: 'b', label: 'stability' }, { op: 'pass.request' }], HU)
  const md2 = roundToMarkdown(s.get('t'), s.takePass('t'))
  assert.match(md2, /named "stability"/)
  assert.doesNotMatch(md2, /more of this/, 'last round is not repeated')
  assert.doesNotMatch(md2, /an earlier moment/, 'the agent’s own cards are not reported back')

  const d = diffBoards(s.getSnapshot('t', PROPOSED), s.get('t'), s.events('t'))
  assert.equal(d.summary.addedByAgents, 1)
  assert.equal(d.summary.added, 1, 'the sticky counts as added by people')
})

test('people dropping one card onto another counts as a pairing', () => {
  const s = fresh()
  s.applyPlan('t', plan, AG)
  const c4 = s.get('t').cards.c4
  s.apply('t', [{ op: 'card.move', id: 'c2', x: c4.x + 30, y: c4.y + 30 }], HU)
  const d = diffBoards(s.getSnapshot('t', PROPOSED), s.get('t'), s.events('t'))
  assert.ok(d.pairs.overlapping.some((p) => p.includes('c2') && p.includes('c4')))
  assert.match(diffToMarkdown(d, s.getSnapshot('t', PROPOSED).state, s.get('t')), /placed overlapping/)
})

test('a card placed beside a card in a group lands inside that group', () => {
  const s = fresh()
  s.applyPlan('t', plan, AG)
  for (const side of ['right', 'below', 'left']) {
    s.applyPlan('t', { cards: [{ id: `x-${side}`, kind: 'note', title: 'an earlier moment', place: { near: 'c4', side } }] }, AG)
    assert.equal(membershipOf(s.get('t').cards[`x-${side}`], s.get('t').clusters), 'b', side)
  }
  assert.deepEqual(collisions(s.get('t')).map(([a, b]) => [a.id, b.id]).filter(([a, b]) => ![a, b].includes('c5')), [])
})

test('around: expansions fan out radially, stay in the seed group, and keep out of other groups', () => {
  const s = fresh()
  s.applyPlan('t', plan, AG)
  const A = s.get('t').clusters.a
  s.apply('t', [{ op: 'cluster.update', id: 'a', h: A.h + 300 }, { op: 'card.upsert', id: 'k', kind: 'sticky', title: 'more of this', x: A.x + 200, y: A.y + A.h + 40 }], HU)
  const cards = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, kind: i % 2 ? 'quote' : 'note', title: `expansion ${i}`, body: 'a line from the source', place: { around: 'k' } }))
  const r = s.applyPlan('t', { cards }, AG)
  assert.deepEqual(r.warnings, [])
  const b = s.get('t')
  assert.deepEqual(collisions(b), [].concat(collisions(b).filter(([x, y]) => [x.id, y.id].includes('c5'))), 'no new collisions')
  for (const c of cards) assert.equal(membershipOf(b.cards[c.id], b.clusters), 'a', `${c.id} stays in the seed's group`)
  for (const c of cards) for (const g of ['b', 'decided']) assert.ok(!overlaps(b.cards[c.id], b.clusters[g]), `${c.id} keeps out of ${g}`)
  const k = b.cards.k
  const angles = cards.map((c) => Math.atan2(b.cards[c.id].y + b.cards[c.id].h / 2 - (k.y + k.h / 2), b.cards[c.id].x + b.cards[c.id].w / 2 - (k.x + k.w / 2))).sort((x, y) => x - y)
  const gaps = angles.map((a, i) => (i ? a - angles[i - 1] : a + 2 * Math.PI - angles[angles.length - 1]))
  assert.ok(Math.max(...gaps) < Math.PI, `fanned out, not stacked on one side (largest empty arc ${(Math.max(...gaps) * 180 / Math.PI).toFixed(0)}°)`)
  assert.deepEqual(b.cards.e0.meta.placement, { around: 'k' })
})

test('board ids must be a single safe path segment', () => {
  const s = new BoardStore(tmp())
  for (const id of ['../escape', 'a/b', '..', 'x'.repeat(65)]) {
    assert.throws(() => s.create({ id, title: 'bad' }, AG), /board id/)
    assert.equal(s.get(id), null)
  }
  assert.equal(s.get(null), null)
  assert.equal(s.create({ id: 'ok_id-1', title: 'fine' }, AG).id, 'ok_id-1')
})
