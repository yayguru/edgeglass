import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import {
  createPairing,
  fetchMarkets,
  fetchPairing,
  fetchPositionsFor,
  paperOwner,
  postPaperFill,
  postStt,
  shareToTelegram,
} from './api'
import { eventTypeOf } from './events'
import {
  errorText,
  formatConfirm,
  formatGlance,
  formatMovedLines,
  formatPairing,
  formatPositionLines,
  formatShareResult,
  loadingText,
} from './format'
import { buildMenu, MENU } from './menu'
import { showListScreen, showTextScreen } from './screens'
import {
  MARKET_ORDER,
  type ConfirmOrder,
  type GlancePayload,
  type MarketKey,
  type Screen,
  type VoiceIntent,
} from './types'

const POLL_MS = 3000
const RENDER_DEBOUNCE_MS = 150
const PAPER_USD = 5

const bridge = await waitForEvenAppBridge()
const owner = paperOwner()

const startText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 1,
  borderColor: 8,
  paddingLength: 6,
  containerID: 1,
  containerName: 'glance',
  content: loadingText(),
  textColor: 4,
  isEventCapture: 1,
})

const created = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [startText],
    menuObject: buildMenu(false),
  }),
)

console.log('[edgeglass] page created:', created === 0 ? 'success' : `failed (${created})`)
if (created !== 0) {
  throw new Error(`createStartUpPageContainer failed: ${created}`)
}
console.log('[edgeglass] ready')

let screen: Screen = 'glance'
let alertsPaused = false
let currentKey: MarketKey = 'btc-15m'
let rankedKeys: MarketKey[] = [...MARKET_ORDER]
let marketsByKey = new Map<MarketKey, GlancePayload>()
let pairingCode: string | null = null
let pairingStatus = 'pending'
let liveOnce = false
let currentContent = loadingText()
let lastRendered = ''
let renderTimer: number | null = null
let pollTimer: number | null = null
let pending: ConfirmOrder | null = null
let listening = false
const pcmChunks: Uint8Array[] = []

function orderIndex(key: MarketKey): number {
  const i = rankedKeys.indexOf(key)
  return i >= 0 ? i : 0
}

function cycle(delta: number): MarketKey {
  const keys = rankedKeys.length ? rankedKeys : MARKET_ORDER
  const next = keys[(orderIndex(currentKey) + delta + keys.length) % keys.length]
  currentKey = next
  return next
}

function midOf(key: MarketKey): number | null {
  return marketsByKey.get(key)?.market.upMid ?? null
}

function defaultConfirm(source: ConfirmOrder['source'] = 'tap'): ConfirmOrder {
  return { market: currentKey, side: 'UP', sizeUsd: PAPER_USD, price: midOf(currentKey), source }
}

function scheduleGlanceRender(content: string) {
  currentContent = content
  if (screen !== 'glance') return
  if (renderTimer !== null) return
  renderTimer = window.setTimeout(() => {
    renderTimer = null
    if (screen !== 'glance') return
    if (currentContent === lastRendered) return
    lastRendered = currentContent
    void bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'glance',
        content: currentContent,
      }),
    )
  }, RENDER_DEBOUNCE_MS)
}

async function paintGlance(forceRebuild = false) {
  const g = marketsByKey.get(currentKey)
  const text = g ? formatGlance(g) : loadingText()
  if (forceRebuild) {
    lastRendered = text
    currentContent = text
    const ok = await showTextScreen(bridge, 'glance', text, alertsPaused)
    if (!ok) console.warn('[edgeglass] rebuild glance failed')
    return
  }
  scheduleGlanceRender(text)
}

async function paintMoved() {
  const ranked = rankedKeys.map(k => marketsByKey.get(k)).filter((g): g is GlancePayload => !!g)
  const ok = await showListScreen(bridge, 'What moved · 1m', formatMovedLines(ranked), alertsPaused)
  if (!ok) console.warn('[edgeglass] rebuild moved failed')
  console.log('[edgeglass] screen moved')
}

async function paintPositions() {
  const payload = await fetchPositionsFor(owner, pairingCode ?? undefined)
  const ok = await showListScreen(
    bridge,
    'Positions · paper/testnet',
    formatPositionLines(payload),
    alertsPaused,
  )
  if (!ok) console.warn('[edgeglass] rebuild positions failed')
  console.log('[edgeglass] screen positions', payload.count)
}

async function paintPairing() {
  if (!pairingCode) {
    const createdPair = await createPairing()
    pairingCode = createdPair.code
    pairingStatus = 'pending'
    console.log('[edgeglass] pairing code issued')
  } else {
    const st = await fetchPairing(pairingCode)
    pairingStatus = st.status
  }
  const ok = await showTextScreen(
    bridge,
    'pairing',
    formatPairing(pairingCode, pairingStatus),
    alertsPaused,
  )
  if (!ok) console.warn('[edgeglass] rebuild pairing failed')
  console.log('[edgeglass] screen pairing', pairingStatus)
}

async function paintConfirm(note?: string) {
  if (!pending) pending = defaultConfirm()
  const ok = await showTextScreen(bridge, 'confirm', formatConfirm(pending, note), alertsPaused)
  if (!ok) console.warn('[edgeglass] rebuild confirm failed')
  console.log('[edgeglass] screen confirm', pending.side, pending.market, pending.sizeUsd)
}

async function go(next: Screen, opts: { rebuildGlance?: boolean; note?: string } = {}) {
  screen = next
  if (next === 'glance') {
    await paintGlance(opts.rebuildGlance ?? true)
    console.log('[edgeglass] screen glance', currentKey)
    return
  }
  if (next === 'moved') return paintMoved()
  if (next === 'positions') return paintPositions()
  if (next === 'pairing') return paintPairing()
  if (next === 'confirm') return paintConfirm(opts.note)
}

async function openConfirm(order: ConfirmOrder, note?: string) {
  pending = order
  await go('confirm', { note })
}

async function confirmPaper() {
  if (!pending) return
  const result = await postPaperFill({
    owner,
    market: pending.market,
    side: pending.side,
    sizeUsd: pending.sizeUsd,
    price: pending.price,
  })
  if (result.error === 'cap') {
    await paintConfirm(`cap $${result.spent}/${result.cap} today · swipe=cancel`)
    console.log('[edgeglass] paper cap')
    return
  }
  if (!result.fill) {
    await paintConfirm('fill failed · swipe=cancel')
    console.log('[edgeglass] paper fill failed')
    return
  }
  console.log('[edgeglass] paper filled', result.fill.id)
  pending = null
  await go('glance')
}

async function shareCard() {
  const g = marketsByKey.get(currentKey)
  const card = g ? formatGlance(g) : 'EdgeGlass glance unavailable'
  if (!pairingCode || pairingStatus !== 'linked') {
    const ok = await showTextScreen(bridge, 'pairing', formatShareResult(false, 'unlinked'), alertsPaused)
    if (ok) screen = 'pairing'
    console.log('[edgeglass] share unlinked')
    if (!pairingCode) void paintPairing()
    return
  }
  const result = await shareToTelegram(pairingCode, card)
  const ok = await showTextScreen(
    bridge,
    'glance',
    formatShareResult(!!result.ok, result.error),
    alertsPaused,
  )
  screen = 'glance'
  if (ok) console.log('[edgeglass] share', result.ok ? 'sent' : result.error)
}

async function applyIntent(intent: VoiceIntent, transcript: string) {
  console.log('[edgeglass] intent', intent.kind, transcript.slice(0, 80))
  if (intent.kind === 'moved') return go('moved')
  if (intent.kind === 'positions') return go('positions')
  if (intent.kind === 'send') return shareCard()
  if (intent.kind === 'pause' || intent.kind === 'resume') {
    alertsPaused = intent.kind === 'pause'
    console.log('[edgeglass] alerts', alertsPaused ? 'paused' : 'resumed')
    return go(screen === 'confirm' ? 'glance' : screen, { rebuildGlance: true })
  }
  if (intent.kind === 'market') {
    currentKey = intent.key
    return go('glance')
  }
  if (intent.kind === 'close') {
    return openConfirm(
      {
        market: intent.market === 'all' ? currentKey : intent.market,
        side: 'CLOSE',
        sizeUsd: 0,
        price: null,
        source: 'voice',
      },
      `voice: ${transcript.slice(0, 40)}`,
    )
  }
  if (intent.kind === 'trade') {
    if (intent.market) currentKey = intent.market
    return openConfirm(
      {
        market: currentKey,
        side: intent.side,
        sizeUsd: intent.sizeUsd,
        price: midOf(currentKey),
        source: 'voice',
      },
      `voice: ${transcript.slice(0, 40)}`,
    )
  }
  await openConfirm(defaultConfirm('voice'), `unrecognized: ${transcript.slice(0, 40)}`)
}

async function startListen() {
  if (listening) return
  listening = true
  pcmChunks.length = 0
  try {
    await bridge.audioControl(true)
  } catch (err) {
    console.warn('[edgeglass] audioControl on failed', err instanceof Error ? err.message : err)
  }
  console.log('[edgeglass] listening')
}

async function stopListenAndTranscribe() {
  if (!listening) return
  listening = false
  try {
    await bridge.audioControl(false)
  } catch {
    /* ignore */
  }
  const total = pcmChunks.reduce((n, c) => n + c.byteLength, 0)
  const pcm = new Uint8Array(total)
  let off = 0
  for (const c of pcmChunks) {
    pcm.set(c, off)
    off += c.byteLength
  }
  pcmChunks.length = 0
  console.log('[edgeglass] listen end', total, 'bytes')
  if (total < 3200) {
    await openConfirm(defaultConfirm('voice'), 'no audio captured · tap to confirm default')
    return
  }
  const result = await postStt(pcm)
  if (result.intent && result.transcript) {
    await applyIntent(result.intent, result.transcript)
    return
  }
  await openConfirm(defaultConfirm('voice'), result.message || result.error || 'stt unavailable')
}

async function refresh() {
  try {
    const bundle = await fetchMarkets()
    rankedKeys = bundle.ranked.map(g => g.market.key)
    marketsByKey = new Map(bundle.ranked.map(g => [g.market.key, g]))
    if (!liveOnce) {
      const top = bundle.ranked[0]
      if (top && top.moveScore > 0) currentKey = top.market.key
      const g = marketsByKey.get(currentKey)
      if (g && g.market.upMid !== null && g.hyperliquid.mid !== null) {
        liveOnce = true
        console.log(
          `[edgeglass] glance live ${g.market.coin} ${g.market.window} UP ${g.market.upMid} HL ${g.hyperliquid.mid} slug ${g.market.slug}`,
        )
        console.log(`[edgeglass] ranked ${rankedKeys.join(',')}`)
      }
    }
    if (screen === 'glance') await paintGlance(false)
    else if (screen === 'moved') await paintMoved()
    else if (screen === 'pairing' && pairingCode && pairingStatus !== 'linked') await paintPairing()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[edgeglass] markets fetch failed', msg)
    if (screen === 'glance') scheduleGlanceRender(errorText(msg.slice(0, 80)))
  }
}

void refresh()
pollTimer = window.setInterval(() => {
  void refresh()
}, POLL_MS)

let cleanedUp = false
function cleanup() {
  if (cleanedUp) return
  cleanedUp = true
  if (pollTimer !== null) window.clearInterval(pollTimer)
  if (renderTimer !== null) window.clearTimeout(renderTimer)
  if (listening) void bridge.audioControl(false)
  unsubscribe()
}

const unsubscribe = bridge.onEvenHubEvent(event => {
  const pcm = event.audioEvent?.audioPcm
  if (pcm && listening) pcmChunks.push(pcm)

  const itemID = event.menuItemClickEvent?.itemID
  if (itemID !== undefined) {
    if (itemID === MENU.MOVED) void go('moved')
    else if (itemID === MENU.POSITIONS) void go('positions')
    else if (itemID === MENU.PAIR) void go('pairing')
    else if (itemID === MENU.SEND) void shareCard()
    else if (itemID === MENU.PAUSE) {
      alertsPaused = !alertsPaused
      console.log('[edgeglass] alerts', alertsPaused ? 'paused' : 'resumed')
      void go(screen, { rebuildGlance: true })
    }
    return
  }

  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)
  const listType = eventTypeOf(event.listEvent)

  if (sysType === OsEventTypeList.LONG_PRESS_EVENT || textType === OsEventTypeList.LONG_PRESS_EVENT) {
    void startListen()
    return
  }
  if (sysType === OsEventTypeList.LONG_PRESS_RELEASE_EVENT || textType === OsEventTypeList.LONG_PRESS_RELEASE_EVENT) {
    void stopListenAndTranscribe()
    return
  }

  if (
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    listType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    if (screen !== 'glance') {
      pending = null
      void go('glance')
      return
    }
    bridge.shutDownPageContainer(1)
    return
  }

  const scroll = textType ?? sysType
  if (scroll === OsEventTypeList.SCROLL_TOP_EVENT || scroll === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    if (screen === 'confirm') {
      pending = null
      console.log('[edgeglass] confirm cancelled')
      void go('glance')
      return
    }
    if (screen === 'glance') {
      const key = cycle(scroll === OsEventTypeList.SCROLL_BOTTOM_EVENT ? 1 : -1)
      console.log(`[edgeglass] swipe ${key}`)
      void paintGlance(false)
    }
    return
  }

  if (screen === 'moved' && listType === OsEventTypeList.CLICK_EVENT) {
    const idx = event.listEvent?.currentSelectItemIndex ?? 0
    const key = rankedKeys[idx]
    if (key) {
      currentKey = key
      void go('glance')
    }
    return
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    if (screen === 'confirm') {
      void confirmPaper()
      return
    }
    if (screen === 'glance') {
      void openConfirm(defaultConfirm('tap'))
      return
    }
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    cleanup()
  }
})

window.addEventListener('beforeunload', cleanup)
