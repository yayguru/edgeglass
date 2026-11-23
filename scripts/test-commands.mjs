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
