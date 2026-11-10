// Regenerates server/font-metrics.json: per-character advance widths of the board's
// handwriting font, measured in a real browser, so the server can wrap card text the
// way the client will draw it. Needs a built UI (`npm run build`) and Playwright
// (`npx playwright install chromium`); run when the font or its weights change:
//   node scripts/measure-font.mjs [path-to-playwright]
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const { chromium } = createRequire(process.argv[2] ?? path.join(root, 'package.json'))('playwright')
const fonts = path.join(root, 'public', 'fonts')

const page = `<!doctype html><style>
@font-face { font-family: 'rb-hand'; src: url('/Shantell_Sans-Informal_Regular.woff2'); font-weight: 400; }
@font-face { font-family: 'rb-hand'; src: url('/Shantell_Sans-Informal_Bold.woff2'); font-weight: 700; }
</style><body></body>`
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page) }
  const f = path.join(fonts, path.basename(req.url))
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': 'font/woff2' })
  fs.createReadStream(f).pipe(res)
}).listen(0, '127.0.0.1')
await new Promise((ok) => server.once('listening', ok))

const chars = []
for (let c = 32; c < 127; c++) chars.push(String.fromCharCode(c))
for (let c = 160; c < 256; c++) chars.push(String.fromCharCode(c))
chars.push(...'‘’“”–—…•→←↔·×€£™−′″')

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const p = await browser.newPage()
await p.goto(`http://127.0.0.1:${server.address().port}/`)
const out = await p.evaluate(async (chars) => {
  await document.fonts.load("400 100px 'rb-hand'")
  await document.fonts.load("700 100px 'rb-hand'")
  const ctx = document.createElement('canvas').getContext('2d')
  const table = {}
  for (const weight of [400, 700]) {
    ctx.font = `${weight} 1000px 'rb-hand'`
    table[weight] = Object.fromEntries(chars.map((ch) => [ch, Math.round(ctx.measureText(ch).width) / 1000]))
  }
  return table
}, chars)
await browser.close()
server.close()
fs.writeFileSync(path.join(root, 'server', 'font-metrics.json'), JSON.stringify({ font: 'Shantell Sans Informal', unit: 'em', widths: out }) + '\n')
console.log('wrote server/font-metrics.json', Object.keys(out[400]).length, 'chars')
