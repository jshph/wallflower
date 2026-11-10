// Card text measured the way the browser draws it: per-character advance widths of the
// board's handwriting font (server/font-metrics.json, measured by scripts/measure-font.mjs)
// and the greedy line breaking CSS does at spaces. Sizes and line heights mirror the
// sketch style in src/styles.css; change them together.
import fs from 'node:fs'

const { widths } = JSON.parse(fs.readFileSync(new URL('./font-metrics.json', import.meta.url), 'utf8'))
const AVG = { 400: avg(widths[400]), 700: avg(widths[700]) }

function avg(table) {
  const letters = Object.entries(table).filter(([ch]) => /[a-z]/.test(ch)).map(([, w]) => w)
  return letters.reduce((a, b) => a + b, 0) / letters.length
}

// Browsers round glyph advances differently (Linux hints to whole pixels; macOS doesn't),
// so a line that fits here by a hair may wrap there. Leave a little room so the server
// errs toward one line too many (a little blank space) rather than a clipped card.
const SLACK = 4

export function textWidth(s, size, weight = 400) {
  const t = widths[weight] ?? widths[400]
  let w = 0
  for (const ch of s) w += t[ch] ?? AVG[weight] ?? AVG[400]
  return w * size
}

// How many lines `text` takes in a box `width` px wide. Breaks only at spaces, like CSS
// with overflow-wrap: normal, so an overlong word stays on one (overflowing) line.
// preWrap keeps newlines (the card body); otherwise they collapse into spaces.
export function lineCount(text, width, size, weight = 400, { preWrap = false, before = 0, after = 0 } = {}) {
  if (!text) return 0
  const space = textWidth(' ', size, weight)
  const paras = preWrap ? String(text).split('\n') : [String(text).replace(/\s+/g, ' ')]
  let lines = 0
  paras.forEach((para, pi) => {
    const words = para.split(/ +/).filter(Boolean)
    lines += 1
    let cur = pi === 0 ? before : 0
    words.forEach((word, wi) => {
      let w = textWidth(word, size, weight)
      if (pi === paras.length - 1 && wi === words.length - 1) w += after
      if (wi === 0) { cur += w; return }
      if (cur + space + w <= width - SLACK) cur += space + w
      else { lines += 1; cur = w }
    })
  })
  return lines
}

// One entry per card kind. Width is the card's; text boxes are width minus padding.
export const CARD_TEXT = {
  note: { w: 280, padX: 28, padY: 28, head: 30, foot: 30, gap: 6, title: { size: 16, weight: 700, lh: 21, clamp: 3 }, body: { size: 14, weight: 400, lh: 19, preWrap: true } },
  // A quote's title is its gist (small, clamped); its body is the hook in large type with curly quotes.
  quote: { w: 300, padX: 28, padY: 28, head: 30, foot: 30, gap: 6, title: { size: 14, weight: 400, lh: 19, clamp: 3 }, body: { size: 18, weight: 400, lh: 24, preWrap: true, quotes: true }, bodyAlways: true },
  // Marker text straight on the board: no head, no foot.
  prompt: { w: 340, padX: 8, padY: 16, head: 0, foot: 0, gap: 6, title: { size: 20, weight: 700, lh: 26 }, body: { size: 16, weight: 400, lh: 22, preWrap: true } },
}

export function measureCard(card) {
  if (card.kind === 'sticky') return { w: 200, h: 200, titleLines: 0, clipped: false }
  const spec = CARD_TEXT[card.kind] ?? CARD_TEXT.note
  const inner = spec.w - spec.padX
  const t = spec.title
  const b = spec.body
  const titleLines = lineCount(card.title, inner, t.size, t.weight)
  const shownTitle = t.clamp ? Math.min(t.clamp, titleLines) : titleLines
  const q = b.quotes ? textWidth('“', b.size, b.weight) + 1 : 0
  const bodyLines = lineCount(card.body, inner, b.size, b.weight, { preWrap: b.preWrap, before: q, after: q })
  // An empty quote still draws its curly quote marks: one line.
  const bodyLinesShown = b.quotes ? Math.max(1, bodyLines) : bodyLines
  const hasBody = !!card.body || spec.bodyAlways
  const gap = shownTitle && hasBody ? spec.gap : 0
  const foot = spec.foot && (card.source?.author || card.source?.date || card.people?.length) ? spec.foot : 0
  const h = spec.padY + spec.head + shownTitle * t.lh + gap + bodyLinesShown * b.lh + foot
  return { w: spec.w, h: Math.max(card.kind === 'prompt' ? 40 : 96, Math.ceil(h)), titleLines, clipped: !!t.clamp && titleLines > t.clamp }
}
