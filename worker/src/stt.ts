import { parseVoiceIntent, type VoiceIntent } from './grammar'

// Glasses PCM only. Telegram voice/text is never sent here or to any AI.

export const WHISPER_MODEL_PRIMARY = '@cf/openai/whisper-large-v3-turbo'
export const WHISPER_MODEL_FALLBACK = '@cf/openai/whisper'

type AiRunner = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>
}

function s16leToWav(pcm: Uint8Array, sampleRate = 16000): Uint8Array {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const dataSize = pcm.byteLength
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  writeStr(36, 'data')
  v.setUint32(40, dataSize, true)
  const out = new Uint8Array(44 + dataSize)
  out.set(new Uint8Array(header), 0)
  out.set(pcm, 44)
  return out
}

function transcriptOf(result: unknown): string {
  if (!result) return ''
  if (typeof result === 'string') return result
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>
    for (const k of ['text', 'transcript', 'transcription']) {
      if (typeof r[k] === 'string') return r[k] as string
    }
    if (r.response && typeof r.response === 'object') return transcriptOf(r.response)
  }
  return ''
}

export async function transcribePcm(ai: AiRunner | undefined, pcm: Uint8Array): Promise<string> {
  if (!ai) throw new Error('stt unavailable')
  if (pcm.byteLength < 3200) throw new Error('audio too short')
  const wav = s16leToWav(pcm)
  const audio = Array.from(wav)
  let lastErr: unknown
  for (const model of [WHISPER_MODEL_PRIMARY, WHISPER_MODEL_FALLBACK]) {
    try {
      const result = await ai.run(model, { audio })
      return transcriptOf(result).trim()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('whisper failed')
}

export function intentFromTranscript(transcript: string): VoiceIntent {
  return parseVoiceIntent(transcript)
}
