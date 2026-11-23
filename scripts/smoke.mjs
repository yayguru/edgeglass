#!/usr/bin/env node
// Headless Day 1 smoke: Worker + Vite + evenhub-simulator.
// Asserts boot, live Polymarket + Hyperliquid numbers, lit pixels, and
// a framebuffer change after double-tap (system exit dialog).

import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, 'smoke-out')
const APP = join(ROOT, 'app')
const WORKER = join(ROOT, 'worker')
const DISPLAY = process.env.EDGEGLASS_DISPLAY || ':55'
const AUTO = Number(process.env.EDGEGLASS_AUTOMATION_PORT || 9898)
const API = 'http://127.0.0.1:8787'
const DEV = 'http://127.0.0.1:5173'
const SIM = `http://127.0.0.1:${AUTO}`

const TOOLS_SIM =
  '/workspace/even-realities/tools/node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator'
const LOCAL_SIM = join(APP, 'node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator')

mkdirSync(OUT, { recursive: true })

const kids = []
const logs = {
  worker: createWriteStream(join(OUT, 'worker.log')),
  vite: createWriteStream(join(OUT, 'vite.log')),
  xvfb: createWriteStream(join(OUT, 'xvfb.log')),
  sim: createWriteStream(join(OUT, 'simulator.log')),
}

function simBin() {
  if (existsSync(LOCAL_SIM)) return LOCAL_SIM
  if (existsSync(TOOLS_SIM)) return TOOLS_SIM
  throw new Error('evenhub-simulator binary not found (install app deps or use tools/)')
}

function spawnLogged(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, ...opts })
  child.stdout.pipe(logs[name], { end: false })
  child.stderr.pipe(logs[name], { end: false })
  child.on('error', err => console.error(`[smoke] ${name} spawn error`, err))
  kids.push({ name, child })
  return child
}

function killGroup(child, signal) {
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* ignore */
    }
  }
}

async function killAll() {
  for (const { child } of kids.reverse()) {
    if (child.exitCode !== null) continue
    killGroup(child, 'SIGTERM')
  }
  await sleep(500)
  for (const { child } of kids) {
    if (child.exitCode === null && !child.killed) killGroup(child, 'SIGKILL')
  }
  for (const s of Object.values(logs)) s.end()
}

async function waitFor(fn, { timeoutMs = 30_000, intervalMs = 250, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try {
      const v = await fn()
      if (v) return v
    } catch (err) {
      last = err
    }
    await sleep(intervalMs)
  }
  const extra = last ? ` last error: ${last instanceof Error ? last.message : last}` : ''
  throw new Error(`timeout waiting for ${label}${extra}`)
}

async function text(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.text()
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

async function getBuf(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`)
}

async function litPixels(png) {
  const { default: PNG } = await importPng()
  const img = PNG.sync.read(png)
  if (img.width !== 576 || img.height !== 288) {
    throw new Error(`expected 576×288, got ${img.width}×${img.height}`)
  }
  let lit = 0
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] > 0) lit += 1
  }
  return { lit, width: img.width, height: img.height }
}

async function importPng() {
  try {
    return await import('pngjs')
  } catch {
    // fallback: decode via Python/PIL if pngjs is not installed
    return {
      sync: {
        read(buf) {
          throw new Error('pngjs missing')
        },
      },
    }
  }
}

async function previewPng(src, dest) {
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(
    'python3',
    [
      '-c',
      'import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGBA"); out=Image.new("RGB", im.size, (0,0,0)); sp,op=im.load(),out.load();\n' +
      'w,h=im.size\n' +
      'for y in range(h):\n' +
      '  for x in range(w):\n' +
      '    r,g,b,a=sp[x,y]\n' +
      '    if a: op[x,y]=(0,a,0)\n' +
      'out.save(sys.argv[2])',
      src,
      dest,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`preview failed: ${r.stderr}`)
}

async function litPixelsPil(pngPath) {

  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(
    'python3',
    [
      '-c',
      'import sys; from PIL import Image; im=Image.open(sys.argv[1]); assert im.size==(576,288), im.size; assert im.mode=="RGBA", im.mode; print(sum(1 for p in im.getdata() if p[3]>0))',
      pngPath,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`PIL lit-pixel check failed: ${r.stderr}`)
  return Number(r.stdout.trim())
}

function consoleMessages(entries) {
  return entries.map(e => String(e.message ?? e.text ?? e)).join('\n')
}

async function main() {
  console.log('[smoke] starting worker')
  spawnLogged('worker', 'npx', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1'], {
    cwd: WORKER,
    env: { ...process.env, FORCE_COLOR: '0' },
  })

  await waitFor(
    async () => {
      const h = await getJson(`${API}/health`)
      return h && h.ok === true
    },
    { timeoutMs: 45_000, label: 'worker /health' },
  )
  console.log('[smoke] worker up')

  const glance = await getJson(`${API}/glance?market=btc-15m`)
  writeFileSync(join(OUT, 'glance.json'), JSON.stringify(glance, null, 2) + '\n')
  if (glance.market?.upMid === null || glance.market?.upMid === undefined) {
    throw new Error('Polymarket upMid is null — feed did not resolve a live market')
  }
  if (glance.hyperliquid?.mid === null || glance.hyperliquid?.mid === undefined) {
    throw new Error('Hyperliquid mid is null')
  }
  if (!Array.isArray(glance.sources) || glance.sources.includes('coingecko')) {
    throw new Error('sources must be polymarket+hyperliquid only')
  }
  console.log(
    `[smoke] live feeds OK  UP ${glance.market.upMid}  HL ${glance.hyperliquid.mid}  slug ${glance.market.slug}`,
  )

  console.log('[smoke] starting vite')
  spawnLogged('vite', 'npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: APP,
    env: { ...process.env, VITE_API_BASE: API },
  })
  await waitFor(
    async () => {
      const html = await text(DEV)
      return html.includes('EdgeGlass')
    },
    { timeoutMs: 45_000, label: 'vite index.html' },
  )
  console.log('[smoke] vite up')

  // Recycle a stale Xvfb on the same display if we own leftovers from the 22 Nov smoke.
  spawnLogged('xvfb', 'Xvfb', [DISPLAY, '-screen', '0', '1280x720x24', '-nolisten', 'tcp'], {
    env: { ...process.env },
  })
  await sleep(500)

  const sim = simBin()
  console.log('[smoke] starting simulator', sim)
  spawnLogged(
    'sim',
    sim,
    [DEV, '--automation-port', String(AUTO), '--no-glow'],
    { env: { ...process.env, DISPLAY, RUST_LOG: 'info' }, cwd: OUT },
  )

  await waitFor(
    async () => {
      const t = await text(`${SIM}/api/ping`)
      return t.trim() === 'pong' || t.includes('pong')
    },
    { timeoutMs: 30_000, label: 'simulator /api/ping' },
  )
  console.log('[smoke] simulator ping ok')

  let sinceId = 0
  const allMsgs = []
  await waitFor(
    async () => {
      const data = await getJson(`${SIM}/api/console?since_id=${sinceId}`)
      for (const entry of data.entries ?? []) {
        sinceId = Math.max(sinceId, entry.id)
        allMsgs.push(entry)
      }
      const blob = consoleMessages(allMsgs)
      return blob.includes('[edgeglass] ready')
    },
    { timeoutMs: 40_000, label: '[edgeglass] ready' },
  )
  console.log('[smoke] app ready')

  await waitFor(
    async () => {
      const data = await getJson(`${SIM}/api/console?since_id=${sinceId}`)
      for (const entry of data.entries ?? []) {
        sinceId = Math.max(sinceId, entry.id)
        allMsgs.push(entry)
      }
      return consoleMessages(allMsgs).includes('[edgeglass] glance live')
    },
    { timeoutMs: 30_000, label: '[edgeglass] glance live' },
  )
  console.log('[smoke] glance live in webview')

  // Let the first upgrade paint.
  await sleep(800)
  const bootPng = await getBuf(`${SIM}/api/screenshot/glasses`)
  const bootPath = join(OUT, 'glance.png')
  writeFileSync(bootPath, bootPng)
  await previewPng(bootPath, join(OUT, 'glance-preview.png'))
  const lit = await litPixelsPil(bootPath)
  console.log(`[smoke] glance framebuffer ${bootPng.length} bytes, lit pixels ${lit}`)
  if (lit < 100) throw new Error(`framebuffer looks blank (${lit} lit pixels)`)

  await postJson(`${SIM}/api/input`, { action: 'double_click' })
  let litExit = lit
  let exitPath = join(OUT, 'exit-dialog.png')
  for (const wait of [150, 350, 700]) {
    await sleep(wait === 150 ? 150 : wait - (wait === 350 ? 150 : 350))
    const exitPng = await getBuf(`${SIM}/api/screenshot/glasses`)
    const framePath = join(OUT, `exit-dialog-${wait}ms.png`)
    writeFileSync(framePath, exitPng)
    await previewPng(framePath, join(OUT, `exit-dialog-${wait}ms-preview.png`))
    const frameLit = await litPixelsPil(framePath)
    console.log(`[smoke] t+${wait}ms after double-tap lit pixels ${frameLit}`)
    if (Math.abs(frameLit - lit) > 50) {
      litExit = frameLit
      exitPath = framePath
      writeFileSync(join(OUT, 'exit-dialog.png'), exitPng)
      await previewPng(join(OUT, 'exit-dialog.png'), join(OUT, 'exit-dialog-preview.png'))
      break
    }
    litExit = frameLit
    writeFileSync(join(OUT, 'exit-dialog.png'), exitPng)
  }
  const delta = Math.abs(litExit - lit)
  console.log(`[smoke] after double-tap lit pixels ${litExit} (delta ${delta}) saved ${exitPath}`)
  if (delta < 50) {
    throw new Error('framebuffer did not change after double_click — exit dialog missing?')
  }

  const consoleDump = consoleMessages(allMsgs)
  writeFileSync(join(OUT, 'console.txt'), consoleDump + '\n')
  if (/\[uncaught]|\[unhandledrejection]/.test(consoleDump)) {
    throw new Error('console contains uncaught errors:\n' + consoleDump)
  }

  console.log('OK — EdgeGlass Day 1 smoke passed (feeds, 576x288 glance, exit dialog)')
}

main()
  .then(async () => {
    await killAll()
    process.exit(0)
  })
  .catch(async err => {
    console.error('[smoke] FAILED', err)
    await killAll()
    process.exit(1)
  })
