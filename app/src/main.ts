import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { fetchGlance } from './api'
import { eventTypeOf } from './events'
import { errorText, formatGlance, loadingText } from './format'
import type { MarketKey } from './types'

const MARKET: MarketKey = 'btc-15m'
const POLL_MS = 3000
const RENDER_DEBOUNCE_MS = 150

const bridge = await waitForEvenAppBridge()

const mainText = new TextContainerProperty({
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
    textObject: [mainText],
  }),
)

console.log('[edgeglass] page created:', created === 0 ? 'success' : `failed (${created})`)
if (created !== 0) {
  throw new Error(`createStartUpPageContainer failed: ${created}`)
}
console.log('[edgeglass] ready')

let currentContent = loadingText()
let lastRendered = ''
let renderTimer: number | null = null
let pollTimer: number | null = null
let liveOnce = false

function scheduleRender(content: string) {
  currentContent = content
  if (renderTimer !== null) return
  renderTimer = window.setTimeout(() => {
    renderTimer = null
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

async function refresh() {
  try {
    const glance = await fetchGlance(MARKET)
    const text = formatGlance(glance)
    scheduleRender(text)
    const up = glance.market.upMid
    const hl = glance.hyperliquid.mid
    if (!liveOnce && up !== null && hl !== null) {
      liveOnce = true
      console.log(
        `[edgeglass] glance live ${glance.market.coin} ${glance.market.window} UP ${up} HL ${hl} slug ${glance.market.slug}`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[edgeglass] glance fetch failed', msg)
    scheduleRender(errorText(msg.slice(0, 80)))
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
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    // Day 2: Confirm card. Day 1 tap is a no-op besides a log.
    console.log('[edgeglass] tap (paper confirm not wired yet)')
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    cleanup()
  }
})

window.addEventListener('beforeunload', cleanup)
