// Read-back: compare the agent's proposed board (a snapshot) with the board
// after people worked on it, and express the difference as judgments.
import { center, membershipOf, overlaps } from './layout.mjs'

const MOVE_THRESHOLD = 40
// Two cards read as dropped onto each other only when they share real area, not a corner.
const OVERLAP_SHARE = 0.15
const isHuman = (a) => typeof a === 'string' && a.startsWith('human:')
// Prompts are instructions to the room, not material, so they never count as pairs or as untouched.
const isMaterial = (c) => c && c.kind !== 'prompt'

function overlapShare(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  return (w * h) / Math.min(a.w * a.h, b.w * b.h)
}

function groups(state) {
  const out = {}
  for (const c of Object.values(state.cards)) out[c.id] = membershipOf(c, state.clusters)
  return out
}

function label(state, gid) {
  if (!gid) return 'loose'
  const cl = state.clusters[gid]
  if (!cl) return gid
  return cl.label ? `"${cl.label}"` : `unnamed group ${gid}`
}

// Quotes are titled by speaker, so identify them by their words instead.
export function cardName(c) {
  if (c.kind === 'quote' && c.body) return `${c.title ? c.title + ': ' : ''}"${c.body.length > 60 ? c.body.slice(0, 57).replace(/\s+\S*$/, '') + '…' : c.body}"`
  return c.title ? `"${c.title}"` : '(untitled)'
}

function cardRef(c) {
  return `#${c.n} ${cardName(c)}`
}

export function diffBoards(snapshot, current, events) {
  const A = snapshot.state
  const B = current
  const gA = groups(A)
  const gB = groups(B)
  const after = events.filter((e) => e.seq > snapshot.rev)
  const proposer = snapshot.actor

  const touches = {}
  for (const e of after) {
    if (!e.id) continue
    ;(touches[e.id] ??= new Set()).add(e.actor)
  }
  const actorsAfter = [...new Set(after.map((e) => e.actor).filter(isHuman))]

  const cards = []
  for (const id of new Set([...Object.keys(A.cards), ...Object.keys(B.cards)])) {
    const a = A.cards[id]
    const b = B.cards[id]
    const fate = { id, n: (a ?? b).n, kind: (a ?? b).kind, title: (b ?? a).title, name: cardName(b ?? a), why: (a ?? b).meta?.why, by: [...(touches[id] ?? [])] }
    if (a && !b) fate.status = 'deleted'
    else if (!a && b) Object.assign(fate, { status: 'added', createdBy: b.createdBy, group: gB[id] })
    else {
      const dist = Math.hypot(center(b).x - center(a).x, center(b).y - center(a).y)
      fate.groupBefore = gA[id]
      fate.groupAfter = gB[id]
      fate.moved = dist > MOVE_THRESHOLD
      fate.distance = Math.round(dist)
      const edits = after.filter((e) => e.op === 'card.edit' && e.id === id)
      if (edits.length) fate.edits = edits.map((e) => ({ actor: e.actor, fields: e.fields, before: e.before, after: e.after }))
      fate.status = fate.groupBefore !== fate.groupAfter ? 'regrouped' : fate.moved ? 'moved-within' : edits.length ? 'edited' : 'untouched'
    }
    cards.push(fate)
  }
  cards.sort((x, y) => x.n - y.n)

  // Pairwise grouping agreement over cards that exist on both boards.
  const both = cards.filter((c) => isMaterial(A.cards[c.id]) && B.cards[c.id]).map((c) => c.id)
  // A new pair is a claim only if a person carried one of its cards into the other's group.
  const fateOf = Object.fromEntries(cards.map((c) => [c.id, c]))
  const carried = (id) => fateOf[id].status === 'regrouped' && fateOf[id].by.some(isHuman)
  const together = (g, x, y) => g[x] && g[x] === g[y] && A.clusters[g[x]]?.role !== 'zone'
  const togetherB = (x, y) => gB[x] && gB[x] === gB[y] && B.clusters[gB[x]]?.role !== 'zone'
  const keptPairs = []
  const brokenPairs = []
  const newPairs = []
  for (let i = 0; i < both.length; i++) for (let j = i + 1; j < both.length; j++) {
    const [x, y] = [both[i], both[j]]
    const ta = together(gA, x, y)
    const tb = togetherB(x, y)
    if (ta && tb) keptPairs.push([x, y])
    else if (ta && !tb) brokenPairs.push([x, y])
    else if (!ta && tb && (carried(x) || carried(y))) newPairs.push([x, y])
  }

  // Cards people dropped onto each other: a stronger pairing claim than sharing a group.
  const solid = (c) => isMaterial(c) && c.kind !== 'sticky'
  const overlapPairs = []
  for (let i = 0; i < both.length; i++) for (let j = i + 1; j < both.length; j++) {
    const [x, y] = [both[i], both[j]]
    if (!solid(B.cards[x]) || !solid(B.cards[y])) continue
    const byPerson = [...(touches[x] ?? []), ...(touches[y] ?? [])].some(isHuman)
    if (byPerson && overlapShare(B.cards[x], B.cards[y]) >= OVERLAP_SHARE && !overlaps(A.cards[x], A.cards[y])) overlapPairs.push([x, y])
  }

  // What happened to each group the agent proposed.
  const clusterFates = []
  for (const cl of Object.values(A.clusters)) {
    const members = Object.keys(gA).filter((id) => gA[id] === cl.id)
    const surviving = members.filter((id) => B.cards[id])
    const dest = {}
    for (const id of surviving) {
      const g = gB[id] ?? 'loose'
      ;(dest[g] ??= []).push(id)
    }
    const b = B.clusters[cl.id]
    const fate = { id: cl.id, role: cl.role, labelBefore: cl.label, labelAfter: b?.label, deleted: !b, members: members.length, surviving: surviving.length, destinations: dest, why: cl.meta?.why }
    if (cl.role === 'zone') { clusterFates.push(fate); continue }
    const intruders = b ? Object.keys(gB).filter((id) => gB[id] === cl.id && !members.includes(id)) : []
    fate.joinedBy = intruders
    // Where most of the group went; cards that left one at a time are departures, not a split.
    // A split needs at least two destinations that each took two or more of its cards.
    const main = Object.keys(dest).sort((x, y) => dest[y].length - dest[x].length || (y === cl.id) - (x === cl.id))[0]
    const blocs = Object.values(dest).filter((ids) => ids.length >= 2).length
    fate.left = Object.entries(dest).filter(([g]) => g !== main).flatMap(([, ids]) => ids)
    if (!surviving.length) fate.verdict = 'emptied'
    else if (blocs >= 2) fate.verdict = 'split'
    else if (main === cl.id) fate.verdict = fate.left.length ? 'thinned' : intruders.length ? 'kept-and-extended' : 'kept'
    else fate.verdict = main === 'loose' ? 'dissolved' : B.clusters[main]?.role === 'zone' ? 'moved-to-zone' : 'merged-into-other'
    if (fate.verdict === 'split') fate.left = []
    if (b && b.label !== cl.label) fate.renamed = true
    clusterFates.push(fate)
  }
  const newClusters = Object.values(B.clusters).filter((c) => !A.clusters[c.id]).map((c) => ({ id: c.id, label: c.label, role: c.role, createdBy: c.createdBy, members: Object.keys(gB).filter((id) => gB[id] === c.id) }))

  const zones = Object.values(B.clusters).filter((c) => c.role === 'zone').map((z) => ({ id: z.id, label: z.label, cards: Object.keys(gB).filter((id) => gB[id] === z.id).map((id) => ({ id, n: B.cards[id].n, title: B.cards[id].title, name: cardName(B.cards[id]), kind: B.cards[id].kind, createdBy: B.cards[id].createdBy })) }))
  const renames = after.filter((e) => e.op === 'cluster.update' && e.renamedFrom !== undefined).map((e) => ({ id: e.id, from: e.renamedFrom, to: e.label, actor: e.actor }))

  const agentPairs = keptPairs.length + brokenPairs.length
  const summary = {
    proposer,
    actorsAfter,
    events: after.filter((e) => isHuman(e.actor)).length,
    cardsProposed: Object.keys(A.cards).length,
    cardsNow: Object.keys(B.cards).length,
    untouched: cards.filter((c) => c.status === 'untouched' && isMaterial(c)).length,
    regrouped: cards.filter((c) => c.status === 'regrouped').length,
    deleted: cards.filter((c) => c.status === 'deleted').length,
    added: cards.filter((c) => c.status === 'added' && isHuman(c.createdBy)).length,
    addedByAgents: cards.filter((c) => c.status === 'added' && !isHuman(c.createdBy)).length,
    groupingAgreement: agentPairs ? +(keptPairs.length / agentPairs).toFixed(2) : null,
    keptPairs: keptPairs.length,
    brokenPairs: brokenPairs.length,
    newPairs: newPairs.length,
    carriedIn: cards.filter((c) => isMaterial(c) && carried(c.id) && c.groupAfter && B.clusters[c.groupAfter]?.role !== 'zone').length,
    clusterVerdicts: Object.fromEntries(clusterFates.filter((c) => c.role !== 'zone').map((c) => [c.id, c.verdict])),
  }

  return { snapshot: { label: snapshot.label, rev: snapshot.rev, t: snapshot.t }, summary, cards, clusterFates, newClusters, zones, renames, pairs: { kept: keptPairs, broken: brokenPairs, new: newPairs, overlapping: overlapPairs } }
}

// A readable account of the delta for the agent that proposed the board.
export function diffToMarkdown(d, A, B) {
  const byId = (id) => B.cards[id] ?? A.cards[id]
  const ref = (id) => cardRef(byId(id))
  const L = []
  const s = d.summary
  L.push('# Board read-back')
  L.push('')
  L.push(`Proposed by ${s.proposer}. Since people started on it: ${s.events} events by ${s.actorsAfter.join(', ') || 'nobody'}.`)
  L.push(`Cards: ${s.cardsProposed} proposed, ${s.cardsNow} now. ${s.regrouped} regrouped, ${s.deleted} removed, ${s.added} added by people, ${s.untouched} untouched.${s.addedByAgents ? ` Agents added ${s.addedByAgents} more after hand-off.` : ''}`)
  if (s.groupingAgreement != null) L.push(`Grouping agreement: ${Math.round(s.groupingAgreement * 100)}% of the pairs the agent put together are still together (${s.keptPairs} kept, ${s.brokenPairs} broken). People carried ${s.carriedIn} ${s.carriedIn === 1 ? 'card' : 'cards'} into other groups${d.pairs.overlapping.length ? ` and dropped ${d.pairs.overlapping.length} ${d.pairs.overlapping.length === 1 ? 'pair' : 'pairs'} onto each other` : ''}.`)
  L.push('')
  L.push('## Proposed groups')
  for (const c of d.clusterFates.filter((c) => c.role !== 'zone')) {
    const name = c.labelBefore ? `"${c.labelBefore}"` : `unnamed group ${c.id}`
    const dest = Object.entries(c.destinations).map(([g, ids]) => `${g === 'loose' ? 'loose' : label(B, g)}: ${ids.map((id) => '#' + byId(id).n).join(' ')}`).join('; ')
    const left = c.left?.length ? `, ${c.left.map((id) => '#' + byId(id).n).join(' ')} left` : ''
    L.push(`- ${name} → **${c.verdict}**${left}${c.renamed ? `, renamed to "${c.labelAfter}"` : ''}${c.deleted ? ' (group deleted)' : ''}. Members now: ${dest || 'none'}.${c.joinedBy?.length ? ` Joined by ${c.joinedBy.map(ref).join(', ')}.` : ''}`)
    if (c.why) L.push(`  - agent's reason: ${c.why}`)
  }
  if (d.newClusters.length) {
    L.push('')
    L.push('## Groups people made')
    for (const c of d.newClusters) L.push(`- ${c.label ? `"${c.label}"` : 'unnamed'} (${c.role}) by ${c.createdBy}: ${c.members.map(ref).join(', ') || 'empty'}`)
  }
  if (d.renames.length) {
    L.push('')
    L.push('## Naming')
    for (const r of d.renames) L.push(`- ${r.from ? `"${r.from}"` : 'unnamed'} → "${r.to}" by ${r.actor}`)
  }
  L.push('')
  L.push('## Card by card')
  const agentAdded = d.cards.filter((c) => c.status === 'added' && !isHuman(c.createdBy))
  for (const c of d.cards) {
    if (c.status === 'untouched' || agentAdded.includes(c)) continue
    let line = `- #${c.n} ${c.kind} ${c.name}: `
    if (c.status === 'deleted') line += 'removed'
    else if (c.status === 'added') line += `added by ${c.createdBy}${c.group ? `, in ${label(B, c.group)}` : ''}`
    else if (c.status === 'regrouped') line += `${label(A, c.groupBefore)} → ${label(B, c.groupAfter)}`
    else if (c.status === 'moved-within') line += `moved within ${label(B, c.groupAfter)}`
    else line += 'edited'
    if (c.edits) line += `; edited ${c.edits.map((e) => e.fields.join('+')).join(', ')}`
    if (c.by.length) line += ` (by ${c.by.join(', ')})`
    L.push(line)
    if (c.why && c.status !== 'added') L.push(`  - agent's reason: ${c.why}`)
    if (c.edits) for (const e of c.edits) for (const f of e.fields) if (typeof e.before[f] === 'string') L.push(`  - ${f}: "${e.before[f]}" → "${e.after[f]}"`)
  }
  const untouched = d.cards.filter((c) => c.status === 'untouched' && isMaterial(c))
  if (untouched.length) {
    L.push('')
    L.push(`## Untouched (${untouched.length})`)
    L.push(untouched.map((c) => `#${c.n} ${c.name}`).join(' · '))
  }
  // One line per card a person carried into a group, naming what it now sits with,
  // rather than one line per pair it now shares a group with.
  const joined = new Map()
  for (const [x, y] of d.pairs.new) for (const [m, o] of [[x, y], [y, x]]) {
    const f = d.cards.find((c) => c.id === m)
    if (f.status === 'regrouped' && f.by.some(isHuman)) (joined.get(m) ?? joined.set(m, []).get(m)).push(o)
  }
  if (joined.size || d.pairs.overlapping.length) {
    L.push('')
    L.push('## Connections people made that the agent did not')
    for (const [x, y] of d.pairs.overlapping) L.push(`- ${ref(x)} + ${ref(y)} (placed overlapping)`)
    for (const [m, others] of joined) L.push(`- ${ref(m)} carried into ${label(B, d.cards.find((c) => c.id === m).groupAfter)}, now with ${others.map((id) => '#' + byId(id).n).join(' ')}`)
  }
  if (agentAdded.length) {
    L.push('')
    L.push('## Added by agents after hand-off')
    for (const c of agentAdded) L.push(`- #${c.n} ${c.kind} ${c.name} by ${c.createdBy}${c.group ? `, in ${label(B, c.group)}` : ''}`)
  }
  if (d.pairs.broken.length) {
    L.push('')
    L.push('## Agent pairings people undid')
    for (const [x, y] of d.pairs.broken.slice(0, 30)) L.push(`- ${ref(x)} / ${ref(y)}`)
  }
  for (const z of d.zones) {
    L.push('')
    L.push(`## Zone "${z.label}"`)
    L.push(z.cards.length ? z.cards.map((c) => `- #${c.n} ${c.name}${c.kind === 'sticky' ? ` (sticky by ${c.createdBy})` : ''}`).join('\n') : '- empty')
  }
  return L.join('\n')
}
