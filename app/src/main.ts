import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { createPairing, fetchMarkets, fetchPairing, fetchPositions } from './api'
import { eventTypeOf } from './events'
import {
  errorText,
  formatGlance,
  formatMovedLines,
  formatPairing,
  formatPositionLines,
  loadingText,
} from './format'
import { buildMenu, MENU } from './menu'
import { showListScreen, showTextScreen } from './screens'
import { MARKET_ORDER, type GlancePayload, type MarketKey, type Screen } from './types'

const POLL_MS = 3000
const RENDER_DEBOUNCE_MS = 150

const bridge = await waitForEvenAppBridge()

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
  const payload = await fetchPositions(pairingCode ?? undefined)
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

async function go(next: Screen, opts: { rebuildGlance?: boolean } = {}) {
  screen = next
  if (next === 'glance') {
    await paintGlance(opts.rebuildGlance ?? true)
    console.log('[edgeglass] screen glance', currentKey)
    return
  }
  if (next === 'moved') return paintMoved()
  if (next === 'positions') return paintPositions()
  if (next === 'pairing') return paintPairing()
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
  unsubscribe()
}

const unsubscribe = bridge.onEvenHubEvent(event => {
  const itemID = event.menuItemClickEvent?.itemID
  if (itemID !== undefined) {
    if (itemID === MENU.MOVED) void go('moved')
    else if (itemID === MENU.POSITIONS) void go('positions')
    else if (itemID === MENU.PAIR) void go('pairing')
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

  if (
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    listType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    if (screen !== 'glance') {
      void go('glance')
      return
    }
    bridge.shutDownPageContainer(1)
    return
  }

  const scroll = textType ?? sysType
  if (screen === 'glance' && (scroll === OsEventTypeList.SCROLL_TOP_EVENT || scroll === OsEventTypeList.SCROLL_BOTTOM_EVENT)) {
    const key = cycle(scroll === OsEventTypeList.SCROLL_BOTTOM_EVENT ? 1 : -1)
    console.log(`[edgeglass] swipe ${key}`)
    void paintGlance(false)
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
    if (screen === 'glance') console.log('[edgeglass] tap (paper confirm not wired yet)')
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    cleanup()
  }
})

window.addEventListener('beforeunload', cleanup)
