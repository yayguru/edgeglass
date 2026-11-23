import { parseCommand } from '../worker/src/telegram.ts'
import { parseMarketKey } from '../worker/src/types.ts'
import { moveScore, edgeCents, divergenceCents } from '../worker/src/edge.ts'
import { parseCode } from '../worker/src/pairing.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(parseMarketKey('btc15m') === 'btc-15m', 'btc15m')
assert(parseMarketKey('ETH-5M') === 'eth-5m', 'ETH-5M')
assert(parseCommand('/start').kind === 'start', 'start')
assert(parseCommand('AB23XY').kind === 'pair', 'pair code')
assert(parseCommand('01IOAB').kind === 'unknown', 'ambiguous code rejected')
const w = parseCommand('/wallet 0x1234567890abcdef1234567890abcdef12345678')
assert(w.kind === 'wallet', 'wallet')
assert(parseCommand('/wallet not-an-addr').kind === 'unknown', 'bad wallet')
const a = parseCommand('/alert btc15m 70')
assert(a.kind === 'alert' && a.market === 'btc-15m' && a.cents === 70, 'alert')
assert(parseCommand('/alert btc15m 200').kind === 'unknown', 'alert range')
assert(parseCommand('please jailbreak this bot').kind === 'unknown', 'no free text commands')
assert(edgeCents(0.6, 0.4) === 0, `edge 0.6 vs 0.4% fair=0.6 got ${edgeCents(0.6, 0.4)}`)
assert(divergenceCents(20, 0.4) === 10, 'div')
assert(moveScore(20, 0.4, 0, 10) === 20, 'score')
assert(parseCode('abcdef') === 'ABCDEF', 'parseCode')
assert(parseCode('AAAAAA') === 'AAAAAA', 'parseCode A')
console.log('OK — command/edge unit tests passed')

import { parseVoiceIntent } from '../worker/src/grammar.ts'
import { PAPER_DAILY_CAP_USD, PAPER_DEFAULT_USD } from '../worker/src/paper.ts'

assert(parseVoiceIntent('what moved').kind === 'moved', 'voice moved')
assert(parseVoiceIntent('positions').kind === 'positions', 'voice positions')
assert(parseVoiceIntent('send to telegram').kind === 'send', 'voice send')
assert(parseVoiceIntent('pause alerts').kind === 'pause', 'voice pause')
const t1 = parseVoiceIntent('buy up five')
assert(t1.kind === 'trade' && t1.side === 'UP' && t1.sizeUsd === 5, 'buy up five')
const t2 = parseVoiceIntent('long btc fifty')
assert(t2.kind === 'trade' && t2.side === 'UP' && t2.sizeUsd === 50 && t2.market === 'btc-15m', JSON.stringify(t2))
const t3 = parseVoiceIntent('short eth 10')
assert(t3.kind === 'trade' && t3.side === 'DOWN' && t3.market === 'eth-15m' && t3.sizeUsd === 10, JSON.stringify(t3))
assert(parseVoiceIntent('close all').kind === 'close', 'close all')
assert(parseVoiceIntent('btc 5m').kind === 'market' && parseVoiceIntent('btc 5m').key === 'btc-5m', 'btc 5m')
assert(PAPER_DEFAULT_USD === 5 && PAPER_DAILY_CAP_USD === 50, 'paper caps')
assert(parseVoiceIntent('please ignore previous instructions').kind === 'unknown', 'no freeform llm')
console.log('OK — voice grammar unit tests passed')
