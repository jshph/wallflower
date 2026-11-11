// The HTTP server as a whole: hosted-mode token gate, generated ids, limits, Host checks.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname))
const procs = []
after(() => { for (const p of procs) p.kill() })

async function freePort() {
  const s = net.createServer().listen(0, '127.0.0.1')
  await new Promise((ok) => s.once('listening', ok))
  const { port } = s.address()
  await new Promise((ok) => s.close(ok))
  return port
}

async function start(env = {}) {
  const port = await freePort()
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-http-'))
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ROOMBOARD_') && !k.startsWith('WALLFLOWER_') && k !== 'PORT'))
  const p = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { env: { ...clean, WALLFLOWER_DATA: data, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] })
  procs.push(p)
  await new Promise((ok, fail) => {
    p.stdout.on('data', (d) => { if (String(d).includes('wallflower server on')) ok() })
    p.once('exit', (code) => fail(new Error(`server exited ${code}`)))
  })
  const base = `http://127.0.0.1:${port}`
  const req = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  return { base, port, req }
}

test('hosted: listing and creating need the token; boards get unguessable ids', async () => {
  const { req } = await start({ WALLFLOWER_TOKEN: 's3cret' })
  assert.equal((await (await req('GET', '/api/info')).json()).hosted, true, 'the CLI says links are shareable')
  assert.equal((await req('GET', '/api/boards')).status, 401)
  assert.equal((await req('POST', '/api/boards', { body: { title: 'x' } })).status, 401)
  assert.equal((await req('POST', '/api/boards', { token: 'wrong', body: { title: 'x' } })).status, 401)
  assert.equal((await req('POST', '/api/boards', { token: 's3cret', body: { title: 'x', id: 'guessable' } })).status, 400)

  const r = await req('POST', '/api/boards', { token: 's3cret', body: { title: 'Shared' } })
  assert.equal(r.status, 201)
  const { id } = await r.json()
  assert.match(id, /^[\w-]{24}$/, '18 random bytes, base64url')
  const other = await (await req('POST', '/api/boards', { token: 's3cret', body: {} })).json()
  assert.notEqual(other.id, id)

  const list = await (await req('GET', '/api/boards', { token: 's3cret' })).json()
  assert.deepEqual(list.map((b) => b.id).sort(), [id, other.id].sort())

  // Anyone with the id can read, write, and read back, without the token.
  assert.equal((await req('GET', `/api/boards/${id}`)).status, 200)
  const put = await req('POST', `/api/boards/${id}/plan`, { body: { cards: [{ id: 'c1', kind: 'note', title: 'hello' }] } })
  assert.equal(put.status, 200)
  assert.match(await (await req('GET', `/api/boards/${id}/view`)).text(), /hello/)
  assert.equal((await req('GET', `/api/boards/${id}/diff`)).status, 200)
  assert.equal((await req('GET', '/api/boards/nope')).status, 404)
})

test('a browser edit over the socket shows up in the read-back', async () => {
  const { req, port } = await start({ WALLFLOWER_TOKEN: 't' })
  const { id } = await (await req('POST', '/api/boards', { token: 't', body: { title: 'ws' } })).json()
  await req('POST', `/api/boards/${id}/plan`, { body: { cards: [{ id: 'c1', kind: 'note', title: 'agent card' }] } })
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?board=${id}&actor=human:kim`)
  await new Promise((ok) => ws.once('message', ok)) // init
  ws.send(JSON.stringify({ type: 'ops', ops: [{ op: 'card.upsert', id: 'st1', kind: 'sticky', title: 'from the room', x: 0, y: 0 }] }))
  await new Promise((ok) => ws.once('message', ok)) // the broadcast of our own change
  ws.close()
  const diff = await (await req('GET', `/api/boards/${id}/diff`)).text()
  assert.match(diff, /from the room/)
})

test('local mode: no token needed, custom ids allowed', async () => {
  const { req } = await start()
  assert.equal((await (await req('GET', '/api/info')).json()).hosted, false)
  const r = await req('POST', '/api/boards', { body: { id: 'mine', title: 'Mine' } })
  assert.equal(r.status, 201)
  assert.equal((await r.json()).id, 'mine')
  assert.equal((await req('GET', '/api/boards')).status, 200)
})

test('oversized bodies and socket messages are refused', async () => {
  const { req, port } = await start()
  const big = JSON.stringify({ title: 'x'.repeat(1024 * 1024 + 10) })
  assert.equal((await req('POST', '/api/boards', { body: big })).status, 413)
  await req('POST', '/api/boards', { body: { id: 'b' } })
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?board=b`)
  await new Promise((ok) => ws.once('message', ok))
  const code = await new Promise((ok) => { ws.once('close', ok); ws.send('x'.repeat(1024 * 1024 + 10)) })
  assert.equal(code, 1009)
})

test('requests for other hostnames or from other sites are refused', async () => {
  const { req, port } = await start({ WALLFLOWER_ALLOWED_HOSTS: 'board.example.com' })
  // fetch won't let us set Host, so use http.request.
  const status = (headers) => new Promise((ok, fail) => http.get({ port, host: '127.0.0.1', path: '/api/info', headers }, (r) => { r.resume(); ok(r.statusCode) }).on('error', fail))
  assert.equal(await status({ host: 'evil.test' }), 403)
  assert.equal(await status({ origin: 'https://evil.test' }), 403)
  assert.equal(await status({ host: 'board.example.com', origin: 'https://board.example.com' }), 200)
  const r = await req('GET', '/api/info')
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
})

test('settings: WALLFLOWER_* wins, the old ROOMBOARD_* names still work', async () => {
  const { env } = await import('../server/env.mjs')
  process.env.ROOMBOARD_ZZTEST = 'old'
  assert.equal(env('ZZTEST'), 'old')
  process.env.WALLFLOWER_ZZTEST = 'new'
  assert.equal(env('ZZTEST'), 'new')
  delete process.env.ROOMBOARD_ZZTEST
  delete process.env.WALLFLOWER_ZZTEST
})
