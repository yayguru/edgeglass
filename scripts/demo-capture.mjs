#!/usr/bin/env node
// Records the demo: real app (Vite) against the PRODUCTION Worker, driven in the
// official evenhub-simulator through its automation API. Saves every glasses
// framebuffer (576x288 RGBA) with a timestamp plus a timeline of inputs, so the
// video is cut from real frames only. Voice uses a virtual PulseAudio mic: a
// recorded command is played into it while long-press is held, and the app
// sends that PCM to the prod Worker /stt (Whisper) like on G2.
//
// Env: EDGEGLASS_API (default prod), DEMO_OUT, DEMO_CMD_WAV, PULSE_SERVER.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'app')
const OUT = process.env.DEMO_OUT || join(ROOT, 'smoke-out', 'demo')
const FRAMES = join(OUT, 'frames')
const API = process.env.EDGEGLASS_API || 'https://edgeglass.merjkerm.workers.dev'
const CMD_WAV = process.env.DEMO_CMD_WAV || ''
const CMD_WAV2 = process.env.DEMO_CMD_WAV2 || ''
const DISPLAY = process.env.EDGEGLASS_DISPLAY || ':57'
const AUTO = 9899
const DEV = 'http://127.0.0.1:5174'
const SIM = `http://127.0.0.1:${AUTO}`
const SIM_BIN = [
  join(APP, 'node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator'),
  '/workspace/even-realities/tools/node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator',
].find(existsSync)

mkdirSync(FRAMES, { recursive: true })
const TL = join(OUT, 'timeline.jsonl')
writeFileSync(TL, '')
const kids = []
const t0 = Date.now()
const mark = (label, extra = {}) => {
  const e = { t: (Date.now() - t0) / 1000, label, ...extra }
  appendFileSync(TL, JSON.stringify(e) + '\n')
  console.log(`[demo] ${e.t.toFixed(1)}s ${label}`, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

function run(name, cmd, args, opts = {}) {
  const log = createWriteStream(join(OUT, `${name}.log`))
  const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts })
  c.stdout.pipe(log)
  c.stderr.pipe(log)
  kids.push(c)
  return c
}
async function killAll() {
  for (const c of kids.reverse()) try { process.kill(-c.pid, 'SIGTERM') } catch {}
  await sleep(500)
  for (const c of kids) try { process.kill(-c.pid, 'SIGKILL') } catch {}
}
async function waitFor(fn, ms = 30000, label = 'cond') {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v } catch {}
    await sleep(250)
  }
  throw new Error('timeout ' + label)
}
let since = 0
const consoleLog = []
async function pollConsole() {
  const r = await fetch(`${SIM}/api/console?since_id=${since}`)
  const d = await r.json()
  for (const e of d.entries ?? []) {
    since = Math.max(since, e.id)
    const m = String(e.message ?? e.text ?? e)
    consoleLog.push(m)
    if (m.includes('[edgeglass]') || m.startsWith('[')) mark('console', { m: m.slice(0, 160) })
  }
}
const seen = s => consoleLog.some(m => m.includes(s))
async function waitConsole(s, ms = 15000) {
  await waitFor(async () => { await pollConsole(); return seen(s) }, ms, s)
}
async function input(action) {
  mark('input', { action })
  await fetch(`${SIM}/api/input`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
}
let grabbing = true
let n = 0
async function grabber() {
  while (grabbing) {
    const t = (Date.now() - t0) / 1000
    try {
      const r = await fetch(`${SIM}/api/screenshot/glasses`)
      if (r.ok) {
        const f = `f${String(n).padStart(5, '0')}.png`
        writeFileSync(join(FRAMES, f), Buffer.from(await r.arrayBuffer()))
        appendFileSync(join(OUT, 'frames.jsonl'), JSON.stringify({ t, f }) + '\n')
        n++
      }
    } catch {}
    await sleep(150)
  }
}
async function voice(wav) {
  const before = consoleLog.filter(m => m.includes('[edgeglass] intent')).length
  await input('long_press'); await waitConsole('listening'); await sleep(300)
  if (wav) {
    mark('voice audio', { wav: wav.split('/').pop() })
    await new Promise(res => spawn('paplay', [wav], { env: process.env, stdio: 'ignore' }).on('exit', res))
  }
  await sleep(300)
  await input('long_press_release')
  await waitFor(async () => { await pollConsole(); return consoleLog.filter(m => m.includes('[edgeglass] intent')).length > before }, 20000, 'intent').catch(() => mark('no intent'))
}
const hold = async (s, label) => { mark('hold', { s, label }); for (let i = 0; i < s * 4; i++) { await sleep(250); await pollConsole().catch(() => {}) } }

async function main() {
  // Fresh paper owner per recording (demo origin :5174 only), so the daily cap starts at $0.
  const LS = join(process.env.HOME || '', '.local/share/com.evenrealities.evenhub-simulator/localstorage')
  for (const ext of ['', '-wal', '-shm']) rmSync(join(LS, `http_127.0.0.1_5174.localstorage${ext}`), { force: true })
  writeFileSync(join(OUT, 'frames.jsonl'), '')
  run('vite', 'npx', ['vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: APP, env: { ...process.env, VITE_API_BASE: API } })
  await waitFor(async () => (await (await fetch(DEV)).text()).includes('EdgeGlass'), 45000, 'vite')
  run('xvfb', 'Xvfb', [DISPLAY, '-screen', '0', '1280x720x24', '-nolisten', 'tcp'])
  await sleep(600)
  run('sim', SIM_BIN, [DEV, '--automation-port', String(AUTO), '--no-glow'], { env: { ...process.env, DISPLAY }, cwd: OUT })
  await waitFor(async () => (await (await fetch(`${SIM}/api/ping`)).text()).includes('pong'), 30000, 'sim')
  mark('sim up', { api: API })
  // Warm the Worker's Whisper binding so the recorded voice step shows real, warm latency.
  await fetch(`${API}/stt`, { method: 'POST', body: new Uint8Array(16000) }).catch(() => null)
  void grabber()
  await waitConsole('[edgeglass] glance live', 40000)
  mark('scene glance')
  await hold(14, 'glance live ticking')
  mark('scene swipe')
  await input('down'); await hold(3.5, 'next market')
  await input('down'); await hold(3.5, 'next market')
  await input('down'); await hold(3, 'next market')
  mark('scene tap')
  await input('click'); await waitConsole('screen confirm'); await hold(4.5, 'confirm')
  await input('click'); await waitConsole('paper filled'); await hold(3, 'filled')
  mark('scene voice')
  await voice(CMD_WAV)
  await hold(5, 'voice confirm')
  await input('click'); await waitConsole('paper filled'); await hold(3, 'voice filled')
  mark('scene cap')
  await voice(CMD_WAV2)
  await hold(3, 'voice confirm 2')
  await input('click'); await hold(4, 'cap')
  await input('down'); await hold(2, 'cancelled')
  mark('scene positions')
  await input('context_menu'); await hold(1.5, 'menu')
  await input('down'); await hold(1, 'menu positions')
  await input('click'); await hold(5, 'positions')
  await input('double_click'); await hold(1.5, 'back')
  mark('scene moved')
  await input('context_menu'); await hold(1.5, 'menu')
  await input('click'); await hold(6, 'what moved')
  await input('double_click'); await hold(1.5, 'back')
  mark('scene pairing')
  await input('context_menu'); await hold(1.2, 'menu')
  await input('down'); await input('down'); await hold(1, 'menu pair')
  await input('click'); await hold(6, 'pairing code')
  await input('double_click'); await hold(3, 'glance end')
  mark('done')
  grabbing = false
  await sleep(400)
  writeFileSync(join(OUT, 'console.txt'), consoleLog.join('\n') + '\n')
}
main().then(killAll).then(() => process.exit(0)).catch(async e => { console.error('[demo] FAILED', e); grabbing = false; await killAll(); process.exit(1) })
