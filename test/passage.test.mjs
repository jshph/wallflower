// Source previews: the CLI cuts ~200 words around a quote from a local file; the board stores only that.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { cutPassage, cleanPassage, MAX_PASSAGE, WINDOW_WORDS } from '../server/passage.mjs'
import { BoardStore } from '../server/store.mjs'

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname))
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rb-pass-'))
const filler = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ')
const marked = (p) => p.text.slice(...p.mark)

test('finds the quote despite curly quotes, case, markdown emphasis and edge punctuation', () => {
  const doc = `---\ntitle: x\n---\nIntro line.\n\nRosa said: **“I couldn’t tell** what it wanted from me.” Then we moved on.`
  const { passage } = cutPassage(doc, `"i couldn't tell what it wanted from me"`, '2026-11-10')
  assert.match(marked(passage), /^\*\*“I couldn’t tell\*\* what it wanted from me\.”$/)
  assert.ok(!passage.text.includes('title: x'), 'frontmatter is not part of the passage')
  assert.deepEqual(passage.clipped, [false, false])
  assert.equal(passage.at, '2026-11-10')
})

test('an ellipsis in the quote skips words in the source', () => {
  const doc = 'we keep batching everything up so that we hit the date every time'
  const { passage } = cutPassage(doc, 'we keep batching … hit the date')
  assert.equal(marked(passage), 'we keep batching everything up so that we hit the date')
})

test('a quote that is not in the file is an error, not a preview', () => {
  assert.match(cutPassage('nothing like it here', 'what am I supposed to do first?').error, /not found/)
})

test('about 100 words each side, pulled in to sentence breaks, and clipped flags', () => {
  // Sentence breaks 80 words out on each side, inside the 30-word reach from the 100-word edges.
  const doc = `${filler(150, 'a')}. ${filler(80, 'b')}. the quoted line is here. ${filler(80, 'c')}. ${filler(150, 'd')}.`
  const { passage } = cutPassage(doc, 'the quoted line is here')
  const n = passage.text.split(/\s+/).length
  assert.ok(n <= 2 * WINDOW_WORDS + 5 && n >= 2 * WINDOW_WORDS - 60, `${n} words`)
  assert.match(passage.text, /^b0 /, 'starts on a sentence break')
  assert.match(passage.text, /c79\.$/, 'ends on a sentence break')
  assert.deepEqual(passage.clipped, [true, true])
})

test('stays inside the quote\'s section', () => {
  const doc = `## Earlier\n\n${filler(30, 'x')}.\n\n## Review\n\nKim asked what to do first. ${filler(20, 'y')}.\n\n## Next steps\n\n${filler(30, 'z')}.`
  const { passage } = cutPassage(doc, 'what to do first')
  assert.match(passage.text, /^## Review\n/)
  assert.ok(!passage.text.includes('Next steps') && !passage.text.includes('x0'))
})

test('without a quote, the passage is the opening of the file', () => {
  const { passage } = cutPassage(`# Title\n\n${filler(400, 'w')}`, null)
  assert.equal(passage.mark, undefined)
  assert.match(passage.text, /^# Title/)
  assert.deepEqual(passage.clipped, [false, true])
})

test('the server keeps only a well-formed, bounded passage', () => {
  const w = []
  assert.equal(cleanPassage({ text: '' }, w, 'c'), undefined)
  const big = cleanPassage({ text: 'x'.repeat(MAX_PASSAGE + 10), mark: [0, MAX_PASSAGE + 5] }, w, 'c')
  assert.equal(big.text.length, MAX_PASSAGE)
  assert.equal(big.mark, undefined, 'a mark past the end is dropped')
  assert.deepEqual(big.clipped, [false, true])
  const s = new BoardStore(tmp())
  s.create({ id: 't' }, 'agent:x')
  s.apply('t', [{ op: 'card.upsert', id: 'c', kind: 'quote', body: 'hi', source: { label: 'L', passage: { text: 'say hi now', mark: [4, 6], evil: 1 } }, x: 0, y: 0 }], 'agent:x')
  assert.deepEqual(s.get('t').cards.c.source, { label: 'L', passage: { text: 'say hi now', mark: [4, 6], clipped: [false, false] } })
})

// The whole path: `board put` reads the file on the agent's side and the board stores only the passage.
const procs = []
after(() => { for (const p of procs) p.kill() })

test('board put cuts the passage from source.file and never uploads the file', async () => {
  const s = net.createServer().listen(0, '127.0.0.1')
  await new Promise((ok) => s.once('listening', ok))
  const port = s.address().port
  await new Promise((ok) => s.close(ok))
  const data = tmp()
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ROOMBOARD_') && !k.startsWith('WALLFLOWER_') && k !== 'PORT'))
  const srv = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { env: { ...clean, WALLFLOWER_DATA: data, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] })
  procs.push(srv)
  await new Promise((ok) => srv.stdout.on('data', (d) => { if (String(d).includes('wallflower server on')) ok() }))

  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'notes.md'), `${filler(500, 'secret')}. Rosa said "I couldn't tell what it wanted from me" and laughed. ${filler(500, 'tail')}.`)
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ cards: [
    { id: 'rosa', kind: 'quote', title: 'Rosa', body: 'I couldn’t tell what it wanted from me', source: { label: 'review', file: 'notes.md' } },
    { id: 'kim', kind: 'quote', title: 'Kim', body: 'never said this', source: { file: 'notes.md' } },
    { id: 'hand', kind: 'note', title: 'x', source: { passage: { text: 'written by hand' } } },
  ] }))
  const env = { ...clean, WALLFLOWER_URL: `http://127.0.0.1:${port}`, WALLFLOWER_BOARD: 'p', HOME: tmp() }
  const cli = (...a) => promisify(execFile)(process.execPath, [path.join(root, 'bin/wallflower.mjs'), ...a], { env })
  await cli('new', 'x', '--id', 'p')
  const { stderr } = await cli('put', path.join(dir, 'plan.json'))
  assert.match(stderr, /card kim: quote not found/)
  assert.match(stderr, /card hand: source.passage is cut from source.file/)
  const board = JSON.parse(fs.readFileSync(path.join(data, 'boards/p/state.json'), 'utf8'))
  const p = board.cards.rosa.source.passage
  assert.equal(p.text.slice(...p.mark), `"I couldn't tell what it wanted from me"`)
  assert.equal(board.cards.rosa.source.file, undefined, 'the path stays on the agent\'s machine')
  assert.equal(board.cards.kim.source.passage, undefined)
  assert.equal(board.cards.hand.source.passage, undefined)
  const raw = fs.readFileSync(path.join(data, 'boards/p/state.json'), 'utf8')
  assert.ok(!raw.includes('secret10 ') && !raw.includes('tail400'), 'only the window around the quote was sent')
})
