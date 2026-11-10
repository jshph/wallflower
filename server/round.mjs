// What `board wait` hands the agent when someone presses "Take another pass":
// everything people did this round, with each sticky and moved card shown in
// its neighborhood, and the source files nearby so the agent re-reads those
// rather than elaborating on the cards it already chose.
import { cardName, diffBoards } from './diff.mjs'
import { neighborhood } from './layout.mjs'

// Anything further than a column gutter away is in another part of the board.
const NEARBY = 360

const isHuman = (a) => typeof a === 'string' && a.startsWith('human:')
const who = (a) => (a ?? '').replace(/^human:/, '')

function groupName(board, gid) {
  const cl = gid && board.clusters[gid]
  if (!cl) return 'open space'
  return `${cl.role === 'zone' ? 'zone' : 'group'} ${cl.label ? `"${cl.label}"` : `(unnamed ${cl.id})`}`
}

const ref = (c) => `#${c.n} ${cardName(c)}`

function hood(board, card) {
  const n = neighborhood(board, card)
  const where = n.on ? `on ${ref(n.on)}, ${groupName(board, n.group)}` : n.group ? `in ${groupName(board, n.group)}` : 'in open space'
  const close = n.nearest.filter((x) => x.gap <= NEARBY)
  const near = close.map((x) => `${ref(x.card)}${x.card.kind === 'sticky' ? ' (sticky)' : ''} ${x.gap}px`).join(' · ')
  const sources = [...new Set([n.on, ...close.map((x) => x.card)].filter((c) => c && c.kind !== 'sticky').map((c) => c.source?.label).filter(Boolean))]
  const L = [`  - ${where}${n.ambiguous ? ' (between groups; unclear which it belongs to)' : ''}`]
  L.push(near ? `  - nearby: ${near}` : `  - nothing else within ${NEARBY}px`)
  if (sources.length) L.push(`  - sources nearby: ${sources.join(' · ')}`)
  return L
}

export function roundToMarkdown(board, round) {
  const start = round.start ?? { rev: -1, actor: board.createdBy, state: { cards: {}, clusters: {} } }
  const d = diffBoards(start, board, round.events)
  const byPeople = (c) => c.by.some(isHuman)
  const L = ['# Take another pass', '']
  for (const r of round.requests) L.push(`Requested by ${who(r.actor)} at ${new Date(r.t).toTimeString().slice(0, 5)}${r.note ? `: "${r.note}"` : ''}`)

  const stickies = d.cards.filter((c) => c.kind === 'sticky' && c.status !== 'deleted' && byPeople(c))
  if (stickies.length) {
    L.push('', '## Stickies')
    for (const c of stickies) {
      const card = board.cards[c.id]
      if (!card.title?.trim()) continue
      L.push(`- #${c.n} "${card.title}" (${c.status === 'added' ? `new, by ${who(card.createdBy)}` : c.status === 'untouched' ? 'unchanged' : c.status === 'edited' ? 'edited' : 'moved'})`, ...hood(board, card))
    }
  }

  const moved = d.cards.filter((c) => c.kind !== 'sticky' && (c.status === 'regrouped' || c.status === 'moved-within') && byPeople(c))
  if (moved.length) {
    L.push('', '## Cards people moved')
    for (const c of moved) {
      L.push(`- ${ref(board.cards[c.id])}: ${c.status === 'regrouped' ? `${groupName(start.state, c.groupBefore)} → ${groupName(board, c.groupAfter)}` : `within ${groupName(board, c.groupAfter)}`}`, ...hood(board, board.cards[c.id]))
    }
  }

  const added = d.cards.filter((c) => c.kind !== 'sticky' && c.status === 'added' && isHuman(c.createdBy))
  const edited = d.cards.filter((c) => c.kind !== 'sticky' && c.edits?.some((e) => isHuman(e.actor)))
  if (added.length || edited.length) {
    L.push('', '## Cards people wrote or rewrote')
    for (const c of added) L.push(`- ${ref(board.cards[c.id])} (new)`, ...hood(board, board.cards[c.id]))
    for (const c of edited) for (const e of c.edits) for (const f of e.fields) if (typeof e.before[f] === 'string') L.push(`- #${c.n} ${f}: "${e.before[f]}" → "${e.after[f]}"`)
  }

  const groups = []
  for (const r of d.renames.filter((r) => isHuman(r.actor))) groups.push(`- ${r.from ? `"${r.from}"` : `unnamed ${r.id}`} named "${r.to}" by ${who(r.actor)}`)
  for (const g of d.newClusters.filter((g) => isHuman(g.createdBy))) groups.push(`- new ${g.role === 'zone' ? 'zone' : 'group'} ${g.label ? `"${g.label}"` : `(unnamed ${g.id})`} by ${who(g.createdBy)}: ${g.members.map((id) => '#' + board.cards[id].n).join(' ') || 'empty'}`)
  for (const f of d.clusterFates.filter((f) => f.role !== 'zone' && !['kept', 'kept-and-extended'].includes(f.verdict) && f.members)) groups.push(`- ${groupName(start.state, f.id)} ${f.verdict}`)
  if (groups.length) L.push('', '## Groups', ...groups)

  const removed = d.cards.filter((c) => c.status === 'deleted' && byPeople(c))
  if (removed.length) L.push('', '## Removed', ...removed.map((c) => `- #${c.n} ${c.name}`))

  const pairs = [...d.pairs.overlapping.map((p) => [...p, 'overlapping']), ...d.pairs.new.map((p) => [...p, 'same group'])]
  if (pairs.length) L.push('', '## Pairs people made', ...pairs.slice(0, 15).map(([x, y, how]) => `- ${ref(board.cards[x])} + ${ref(board.cards[y])} (${how})`))

  if (L.length === 2 + round.requests.length) L.push('', 'Nothing on the board changed this round; the request is the whole steer.')
  L.push('', 'Read this round as a whole. Re-read the sources behind the cards people pointed at before adding anything; `board view` shows the whole board.')
  return L.join('\n')
}
