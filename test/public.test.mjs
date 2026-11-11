// A public server: anyone creates boards, within limits; creators delete them; idle ones expire.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { BoardStore } from '../server/store.mjs'

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname))
const procs = []
after(() => { for (const p of procs) p.kill() })

async function start(env = {}, data = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-public-'))) {
  const s = net.createServer().listen(0, '127.0.0.1')
  await new Promise((ok) => s.once('listening', ok))
  const { port } = s.address()
  await new Promise((ok) => s.close(ok))
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ROOMBOARD|WALLFLOWER)_/.test(k) && k !== 'PORT'))
  const p = spawn(process.execPath, [path.join(root, 'server/index.mjs')], { env: { ...clean, WALLFLOWER_DATA: data, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] })
  procs.push(p)
  let out = ''
  await new Promise((ok, fail) => {
    p.stdout.on('data', (d) => { out += d; if (out.includes('wallflower server on')) ok() })
    p.once('exit', (code) => fail(new Error(`server exited ${code}`)))
  })
  const base = `http://127.0.0.1:${port}`
  const req = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { base, port, req, data, proc: p, log: () => out }
}

const PUBLIC = { WALLFLOWER_TOKEN: 's3cret', WALLFLOWER_PUBLIC: '1' }

test('public: anyone creates a board, nobody lists them without the token', async () => {
  const { req } = await start(PUBLIC)
  const info = await (await req('GET', '/api/info')).json()
  assert.equal(info.public, true)
  const r = await req('POST', '/api/boards', { body: { title: 'Mine' } })
  assert.equal(r.status, 201)
  const { id, ownerKey } = await r.json()
  assert.match(id, /^[\w-]{24}$/)
  assert.match(ownerKey, /^[\w-]{24}$/)
  assert.equal((await req('GET', '/api/boards')).status, 401)
  assert.equal((await req('POST', '/api/boards', { body: { id: 'guessable' } })).status, 400)
  assert.equal((await req('GET', `/api/boards/${id}`)).status, 200)
})

test('public off: a hosted server still needs the token to create', async () => {
  const { req } = await start({ WALLFLOWER_TOKEN: 's3cret' })
  assert.equal((await req('POST', '/api/boards', { body: {} })).status, 401)
  assert.equal((await (await req('GET', '/api/info')).json()).public, false)
})

test('public: creation is rate-limited per address and overall; the token is exempt', async () => {
  const { req } = await start({ ...PUBLIC, WALLFLOWER_CREATE_PER_HOUR: '2', WALLFLOWER_CREATE_PER_HOUR_ALL: '3', WALLFLOWER_CLIENT_IP_HEADER: 'x-real-ip' })
  const make = (ip) => req('POST', '/api/boards', { body: {}, headers: ip ? { 'x-real-ip': ip } : {} })
  assert.equal((await make('1.1.1.1')).status, 201)
  assert.equal((await make('1.1.1.1')).status, 201)
  const third = await make('1.1.1.1')
  assert.equal(third.status, 429)
  assert.match((await third.json()).error, /at most 2 new boards an hour/)
  assert.equal((await make('2.2.2.2')).status, 201, 'another address still can')
  assert.equal((await make('3.3.3.3')).status, 429, 'until the server-wide cap')
  assert.equal((await req('POST', '/api/boards', { token: 's3cret', body: {} })).status, 201)
})

test('public: only the creator (or the token) deletes a board, and open sockets are closed', async () => {
  const { req, port, data } = await start(PUBLIC)
  const { id, ownerKey } = await (await req('POST', '/api/boards', { body: { title: 'x' } })).json()
  assert.equal((await req('DELETE', `/api/boards/${id}`)).status, 403, 'a link alone is not enough')
  assert.equal((await req('DELETE', `/api/boards/${id}`, { headers: { 'x-owner-key': 'nope' } })).status, 403)
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?board=${id}&actor=human:kim`)
  await new Promise((ok) => ws.once('message', ok))
  const closed = new Promise((ok) => ws.once('close', (code) => ok(code)))
  assert.equal((await req('DELETE', `/api/boards/${id}`, { headers: { 'x-owner-key': ownerKey } })).status, 200)
  assert.equal(await closed, 4004)
  assert.equal((await req('GET', `/api/boards/${id}`)).status, 404)
  assert.ok(!fs.existsSync(path.join(data, 'boards', id)), 'its files are gone')

  const other = await (await req('POST', '/api/boards', { body: {} })).json()
  assert.equal((await req('DELETE', `/api/boards/${other.id}`, { token: 's3cret' })).status, 200)
})

test('public: idle public boards expire; boards made with the token are kept', async () => {
  const env = { ...PUBLIC, WALLFLOWER_RETAIN_DAYS: '30' }
  const first = await start(env)
  const pub = (await (await first.req('POST', '/api/boards', { body: {} })).json()).id
  const fresh = (await (await first.req('POST', '/api/boards', { body: {} })).json()).id
  const mine = (await (await first.req('POST', '/api/boards', { token: 's3cret', body: {} })).json()).id
  first.proc.kill()
  const old = (Date.now() - 31 * 86400_000) / 1000
  for (const id of [pub, mine]) for (const f of ['state.json', 'events.jsonl']) fs.utimesSync(path.join(first.data, 'boards', id, f), old, old)
  const second = await start(env, first.data)
  assert.equal((await second.req('GET', `/api/boards/${pub}`)).status, 404, 'idle public board deleted')
  assert.equal((await second.req('GET', `/api/boards/${fresh}`)).status, 200, 'recent public board kept')
  assert.equal((await second.req('GET', `/api/boards/${mine}`)).status, 200, 'token board kept however old')
  assert.match(second.log(), /idle public boards deleted after 30 days/)
})

test('a board holds a bounded number of cards and groups', () => {
  const s = new BoardStore(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-cap-')), { maxCards: 3, maxGroups: 1 })
  s.create({ id: 't' }, 'agent:x')
  s.apply('t', [1, 2, 3].map((n) => ({ op: 'card.upsert', id: `c${n}`, kind: 'note', title: 'x' })), 'agent:x')
  s.apply('t', [{ op: 'card.upsert', id: 'c1', title: 'edit is fine' }], 'agent:x')
  assert.throws(() => s.apply('t', [{ op: 'card.upsert', id: 'c4', kind: 'note', title: 'x' }], 'agent:x'), /at most 3 cards/)
  s.apply('t', [{ op: 'cluster.upsert', id: 'g1' }], 'agent:x')
  assert.throws(() => s.apply('t', [{ op: 'cluster.upsert', id: 'g2' }], 'agent:x'), /at most 1 groups/)
})

test('cli: `new` keeps the creator key, `delete` uses it; someone with only the link cannot', async () => {
  const { execFile } = await import('node:child_process')
  const { base } = await start(PUBLIC)
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ROOMBOARD|WALLFLOWER)_|^XDG_CONFIG_HOME$/.test(k)))
  const cli = (home, ...args) => new Promise((ok) => execFile(process.execPath, [path.join(root, 'bin/wallflower.mjs'), ...args], { env: { ...clean, HOME: home } }, (err, stdout, stderr) => ok({ code: err?.code ?? 0, stdout, stderr })))
  const me = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-me-'))
  const them = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-them-'))
  const made = await cli(me, 'new', 'Mine', '--server', base)
  assert.equal(made.code, 0, made.stderr)
  const id = made.stdout.split('\n')[0]
  assert.equal(fs.statSync(path.join(me, '.wallflower', 'keys', id)).mode & 0o777, 0o600)
  assert.equal((await cli(them, 'use', id, '--server', base)).code, 0)
  const refused = await cli(them, 'delete')
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /403/)
  const done = await cli(me, 'delete')
  assert.equal(done.code, 0, done.stderr)
  assert.match(done.stdout, new RegExp(`deleted ${id}`))
  assert.ok(!fs.existsSync(path.join(me, '.wallflower', 'keys', id)))
})
