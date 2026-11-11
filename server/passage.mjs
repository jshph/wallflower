// A source preview: about 200 words of the source around a card's quote, cut by the CLI
// at `wallflower put` time so the board carries a frozen copy and never needs the full file.

export const WINDOW_WORDS = 100 // on each side of the quote
const SNAP_WORDS = 30 // how far the edges may move inward to land on a sentence break
export const MAX_PASSAGE = 6000 // chars; the server's cap on what a card may carry

// One word for matching: case, curly quotes, markdown emphasis, link brackets and edge punctuation don't count.
function norm(w) {
  return w.toLowerCase().replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[*_`[\]()>#|"]/g, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function words(text) {
  const out = []
  for (const m of text.matchAll(/\S+/g)) {
    const n = norm(m[0])
    if (!n) continue
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1
    // The first word of a markdown heading starts the heading's line, hashes included.
    const heading = /^[ \t]*#{1,6}[ \t]+$/.test(text.slice(lineStart, m.index))
    out.push({ n, start: heading ? lineStart : m.index, end: m.index + m[0].length, raw: m[0], heading })
  }
  return out
}

export function stripFrontmatter(text) {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '')
}

// Find the quote's words in order. An ellipsis in the quote ("we keep … the date") elides
// up to 60 words of the source.
function locate(doc, quote) {
  const segs = quote.split(/…|\.\.\./).map((s) => words(s).map((w) => w.n)).filter((s) => s.length)
  if (!segs.length) return null
  const at = (seg, from, to) => {
    for (let i = from; i <= Math.min(to, doc.length - seg.length); i++) {
      if (seg.every((n, k) => doc[i + k].n === n)) return i
    }
    return -1
  }
  for (let first = at(segs[0], 0, doc.length); first >= 0; first = at(segs[0], first + 1, doc.length)) {
    let end = first + segs[0].length - 1
    let ok = true
    for (const seg of segs.slice(1)) {
      const i = at(seg, end + 1, end + 61)
      if (i < 0) { ok = false; break }
      end = i + seg.length - 1
    }
    if (ok) return [first, end]
  }
  return null
}

const endsSentence = (w) => /[.!?]["'”’)\]*_]*$/.test(w.raw)
const gapHasBreak = (text, a, b) => /\n\s*\n|\n\s*([-*>#]|\d+\.)\s/.test(text.slice(a.end, b.start))

// Cut the passage around [s, e] (word indexes). It never crosses into another section: it starts
// at the quote's own heading when that is in reach and stops before the next one. Otherwise each
// edge is pulled in to a sentence or paragraph break when one is close.
function cut(text, doc, s, e) {
  let a = Math.max(0, s - WINDOW_WORDS)
  const head = doc.slice(a, s + 1).findLastIndex((w) => w.heading)
  if (head >= 0) a += head
  else if (a > 0) {
    for (let i = a; i <= Math.min(s, a + SNAP_WORDS); i++) {
      if (endsSentence(doc[i - 1]) || gapHasBreak(text, doc[i - 1], doc[i])) { a = i; break }
    }
  }
  let b = Math.min(doc.length - 1, e + WINDOW_WORDS)
  const next = doc.slice(e + 1, b + 1).findIndex((w) => w.heading)
  if (next >= 0) b = e + next
  else if (b < doc.length - 1) {
    for (let j = b; j >= Math.max(e, b - SNAP_WORDS); j--) {
      if (endsSentence(doc[j]) || gapHasBreak(text, doc[j], doc[j + 1])) { b = j; break }
    }
  }
  return { a, b }
}

// The passage for one card. `quote` is the verbatim text to find; without one, the passage is
// the opening of the source. Returns { passage } or { error }.
export function cutPassage(fileText, quote, at = new Date().toISOString().slice(0, 10)) {
  const text = stripFrontmatter(fileText)
  const doc = words(text)
  if (!doc.length) return { error: 'source file is empty' }
  let s = 0
  let e = -1
  if (quote && quote.trim()) {
    const hit = locate(doc, quote)
    if (!hit) return { error: 'quote not found in the source file' }
    ;[s, e] = hit
  }
  const { a, b } = e < 0 ? { a: 0, b: Math.min(doc.length - 1, 2 * WINDOW_WORDS) } : cut(text, doc, s, e)
  const off = doc[a].start
  const passage = {
    text: text.slice(off, doc[b].end),
    clipped: [a > 0, b < doc.length - 1],
    at,
  }
  if (e >= 0) passage.mark = [doc[s].start - off, doc[e].end - off]
  return { passage }
}

// Server side: keep only a well-formed passage of bounded size.
export function cleanPassage(p, warnings, id) {
  if (p == null) return undefined
  if (typeof p !== 'object' || typeof p.text !== 'string' || !p.text.trim()) {
    warnings.push(`card ${id}: source.passage needs a text; dropped`)
    return undefined
  }
  const out = { text: p.text.slice(0, MAX_PASSAGE) }
  if (p.text.length > MAX_PASSAGE) warnings.push(`card ${id}: source.passage is ${p.text.length} chars, over ${MAX_PASSAGE}; truncated`)
  const m = p.mark
  if (Array.isArray(m) && Number.isInteger(m[0]) && Number.isInteger(m[1]) && m[0] >= 0 && m[0] < m[1] && m[1] <= out.text.length) out.mark = [m[0], m[1]]
  out.clipped = [!!p.clipped?.[0], !!p.clipped?.[1] || p.text.length > MAX_PASSAGE]
  if (typeof p.at === 'string') out.at = p.at.slice(0, 32)
  return out
}
