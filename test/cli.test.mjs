import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const BIN = path.resolve('bin/wallflower.mjs')

// Run the CLI with a clean environment: no WALLFLOWER_*/ROOMBOARD_* from the caller.
function run(args, { env = {}, config, home = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-cli-')) } = {}) {
  if (config) {
    fs.mkdirSync(path.join(home, '.config', 'wallflower'), { recursive: true })
    fs.writeFileSync(path.join(home, '.config', 'wallflower', 'config.env'), config)
  }
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(WALLFLOWER|ROOMBOARD)_|^XDG_CONFIG_HOME$/.test(k)))
  return new Promise((ok) => execFile(process.execPath, [BIN, ...args], { env: { ...base, HOME: home, ...env } }, (err, stdout, stderr) => ok({ code: err?.code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() })))
}

// A stand-in server that records the Authorization header of each request.
async function recorder() {
  const seen = []
  const paths = []
  const srv = http.createServer((req, res) => {
    seen.push(req.headers.authorization ?? null)
    paths.push(`${req.method} ${req.url}`)
    res.setHeader('content-type', req.url.endsWith('/view') ? 'text/plain' : 'application/json')
    if (req.url === '/api/boards') res.end(req.method === 'POST' ? '{"id":"b1"}' : '[]')
    else if (req.url.endsWith('/view')) res.end('the board\n')
    else res.end('{"ui":"http://x","hosted":true}')
  })
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, paths, close: () => srv.close() }
}

test('cli: server comes from --server, then WALLFLOWER_URL, then the config file, then this machine', async () => {
  const config = 'WALLFLOWER_URL=https://board.example.com\nWALLFLOWER_TOKEN="secret"\n'
  assert.equal((await run(['server'])).stdout, 'http://127.0.0.1:8787')
  let r = await run(['server'], { config })
  assert.equal(r.stdout, 'https://board.example.com')
  assert.match(r.stderr, /config\.env, with a token/)
  assert.equal((await run(['server'], { config, env: { WALLFLOWER_URL: 'https://other.example.com/' } })).stdout, 'https://other.example.com')
  r = await run(['server', '--server', 'local'], { config })
  assert.equal(r.stdout, 'http://127.0.0.1:8787')
  assert.doesNotMatch(r.stderr, /token/)
  assert.equal((await run(['--server', 'https://third.example.com', 'server'], { config })).stdout, 'https://third.example.com')
})

test('cli: a token is only sent to the server it was set for', async () => {
  const a = await recorder()
  const b = await recorder()
  try {
    const config = `WALLFLOWER_URL=${a.url}\nWALLFLOWER_TOKEN=for-a\n`
    await run(['list'], { config })
    assert.deepEqual(a.seen, ['Bearer for-a'])
    await run(['list', '--server', b.url], { config })
    assert.deepEqual(b.seen, [null], 'the config token stays with its own server')
    await run(['list', '--server', b.url], { env: { WALLFLOWER_URL: a.url, WALLFLOWER_TOKEN: 'env-a' } })
    assert.deepEqual(b.seen, [null, null], 'so does a token from the environment')
    await run(['list', '--server', `${a.url}/`], { config })
    assert.equal(a.seen.at(-1), 'Bearer for-a', 'naming the same server with --server keeps its token')
  } finally { a.close(); b.close() }
})

test('cli: --server without a value is an error', async () => {
  const r = await run(['list', '--server'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /--server needs a URL/)
})

test('cli: the current board remembers its server, so --server is needed only once', async () => {
  const a = await recorder()
  const b = await recorder()
  try {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-cli-'))
    const config = `WALLFLOWER_URL=${a.url}\nWALLFLOWER_TOKEN=for-a\n`
    await run(['new', 'Private', '--server', b.url], { config, home })
    await run(['view'], { config, home })
    assert.ok(b.paths.includes('GET /api/boards/b1/view'), 'view follows the board to b')
    assert.ok(!a.paths.some((p) => p.includes('/view')))
    assert.ok(b.seen.every((h) => h === null), 'and never carries a\'s token')
    const r = await run(['server'], { config, home })
    assert.equal(r.stdout, a.url, 'new boards still go to the default')
    assert.match(r.stderr, new RegExp(`current board, b1, is on ${b.url}`))
    await run(['new', 'Shared'], { config, home })
    await run(['view'], { config, home })
    assert.ok(a.paths.includes('GET /api/boards/b1/view'))
  } finally { a.close(); b.close() }
})
