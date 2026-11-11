// The chat window. Events come from the driver (run.mjs) in order; each one animates
// before the next starts. Space plays the next turn; Shift+R starts a new take.
const thread = document.getElementById('thread')
const scroller = document.getElementById('scroll')
const draft = document.getElementById('draft')
const send = document.getElementById('send')
const hint = document.getElementById('hint')
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
let instant = false // replaying history after a reload: no animation

const ICONS = {
  granola: ['#5b8a3c', 'G'], slack: ['#4a154b', '#'], github: ['#24292f', 'gh'], linear: ['#5e6ad2', 'L'],
  notion: ['#2f2f2f', 'N'], support: ['#d6893a', '✉'], wallflower: ['#2d4e8f', '▦'],
}
const LABEL = { granola: 'Granola', slack: 'Slack', github: 'GitHub', linear: 'Linear', notion: 'Notion', support: 'Help Scout', wallflower: 'Wallflower' }

const SPARK = '<svg viewBox="0 0 24 24"><g fill="#d97757">' + Array.from({ length: 8 }, (_, i) => `<rect x="11" y="1.5" width="2" height="9" rx="1" transform="rotate(${i * 45} 12 12)"/>`).join('') + '</g></svg>'

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const bottom = () => { scroller.scrollTop = scroller.scrollHeight }

let spark = null
let toolGroup = null
const tools = {}
function stopSpark() { spark?.remove(); spark = null }
function showSpark() { stopSpark(); spark = el('div', 'spark', SPARK); thread.append(spark); bottom() }
function place(node) { if (spark) thread.insertBefore(node, spark); else thread.append(node); bottom() }

async function typeDraft(text) {
  draft.classList.remove('is-empty')
  send.classList.add('is-ready')
  if (instant) return
  for (let i = 1; i <= text.length; i++) {
    draft.innerHTML = esc(text.slice(0, i)) + '<span class="cursor"></span>'
    await sleep(text[i - 1] === ' ' ? 45 : 22 + Math.random() * 30)
  }
  await sleep(380)
}

function linkify(s) {
  return esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '')}</a>`)
}

function renderMd(md) {
  const out = []
  let list = false
  for (const line of md.split('\n')) {
    if (/^\s*-\s/.test(line)) { if (!list) { out.push('<ul>'); list = true } out.push(`<li>${esc(line.replace(/^\s*-\s/, ''))}</li>`); continue }
    if (list) { out.push('</ul>'); list = false }
    if (/^#+\s/.test(line)) out.push(`<h4>${esc(line.replace(/^#+\s/, ''))}</h4>`)
    else if (line.trim()) out.push(`<p>${esc(line)}</p>`)
  }
  if (list) out.push('</ul>')
  return out.join('')
}

const handlers = {
  reset(ev) {
    thread.innerHTML = ''; toolGroup = null; stopSpark(); draft.textContent = 'Reply…'; draft.classList.add('is-empty'); send.classList.remove('is-ready')
    // Only shown until the first message, so it's out of the recording once you start.
    const open = ev?.board?.open
    hint.innerHTML = `space: next · shift+R: new take${open ? ` · <a href="${esc(open)}" target="_blank" rel="noopener">open this take's board ↗</a>` : ''}`
  },
  time(ev) { toolGroup = null; place(el('div', 'time', esc(ev.label))) },
  async user(ev) {
    hint.textContent = ''
    await typeDraft(ev.text)
    draft.textContent = 'Reply…'; draft.classList.add('is-empty'); send.classList.remove('is-ready')
    const row = el('div', 'user'); row.append(el('div', 'bubble', esc(ev.text)))
    place(row)
    toolGroup = null
  },
  thinking() { showSpark() },
  tool(ev) {
    if (ev.status === 'running') {
      if (!toolGroup) { toolGroup = el('div', 'tools'); place(toolGroup) }
      const [bg, glyph] = ICONS[ev.name] ?? ['#888', '•']
      const t = el('div', 'tool is-running is-open')
      const ex = ev.excerpt
      t.innerHTML = `<div class="tool-head"><span class="tool-icon" style="background:${bg}">${esc(glyph)}</span><span class="tool-title"><b>${esc(LABEL[ev.name] ?? ev.name)}</b> ${esc(ev.title)}<span class="detail">${esc(ev.detail ?? '')}</span></span><span class="tool-summary"></span><span class="tool-chev">›</span></div>` +
        `<div class="tool-body">${ex ? `<div class="excerpt"><div class="file">${esc(ex.file)}</div>${ex.lines.map((l) => `<div class="ln${l.hit ? ' hit' : ''}"><span class="n">${l.n}</span><span>${esc(l.text) || ' '}</span></div>`).join('')}</div>` : ''}</div>`
      if (!ex) t.classList.remove('is-open')
      t.querySelector('.tool-head').onclick = () => t.classList.toggle('is-open')
      toolGroup.append(t)
      tools[ev.id] = t
      bottom()
    } else {
      const t = tools[ev.id]
      if (!t) return
      t.classList.remove('is-running')
      t.querySelector('.tool-summary').textContent = ev.summary ?? ''
      if (instant) t.classList.remove('is-open')
      else setTimeout(() => t.classList.remove('is-open'), 450)
    }
  },
  async agent(ev) {
    toolGroup = null
    const box = el('div', 'agent')
    const text = el('div', 'text')
    box.append(text)
    stopSpark()
    place(box)
    const paras = ev.text.split('\n')
    if (instant) text.innerHTML = paras.map((p) => `<p>${linkify(p)}</p>`).join('')
    else {
      for (let i = 0; i < paras.length; i++) {
        const p = el('p'); text.append(p)
        const words = paras[i].split(/(\s+)/)
        let acc = ''
        for (const w of words) { acc += w; p.innerHTML = linkify(acc); bottom(); await sleep(w.trim() ? 28 + Math.random() * 26 : 0) }
        await sleep(120)
      }
    }
    if (ev.details) {
      const d = el('details', 'details')
      d.innerHTML = `<summary>${esc(ev.details.label)}</summary><div class="md">${renderMd(ev.details.markdown)}</div>`
      box.append(d)
    }
    bottom()
  },
}

// One queue, so each event finishes animating before the next begins.
let queue = Promise.resolve()
function handle(ev) {
  if (ev.type === 'replay') {
    queue = queue.then(async () => { instant = true; handlers.reset(); for (const e of ev.events) await handlers[e.type]?.(e); instant = false; if (ev.events.length > 1) hint.textContent = '' })
    return
  }
  queue = queue.then(() => handlers[ev.type]?.(ev)).catch((err) => console.error(err))
}
new EventSource('/events').onmessage = (m) => handle(JSON.parse(m.data))

addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); fetch('/next', { method: 'POST' }) }
  if (e.code === 'KeyR' && e.shiftKey) fetch('/reset', { method: 'POST' })
})
