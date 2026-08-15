import { completeChat, streamChat } from './llm'
import {
  buildMapUser,
  buildReduceUser,
  buildSummarySystem,
  buildSummaryUser,
  transcriptToText,
} from './prompts'
import type { Settings, TranscriptSegment, VideoMeta } from '../shared/types'

export const MAX_SINGLE_PASS_CHARS = 12000 // 로컬 소형 모델(컨텍스트 4~8k) 기준
export const COMMERCIAL_SINGLE_PASS_CHARS = 400_000 // 상용 모델은 컨텍스트가 커서 사실상 항상 단일 호출
export const CHUNK_CHARS = 8000

export function singlePassLimit(settings: Settings): number {
  return settings.provider === 'lmstudio' ? MAX_SINGLE_PASS_CHARS : COMMERCIAL_SINGLE_PASS_CHARS
}

export interface TranscriptChunk {
  text: string
  startTime: number
  endTime: number
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  maxChars: number = CHUNK_CHARS,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = []
  let current: TranscriptSegment[] = []
  let length = 0

  const flush = () => {
    if (!current.length) return
    const last = current[current.length - 1]
    chunks.push({
      text: current.map((s) => s.text).join(' '),
      startTime: current[0].start,
      endTime: last.start + last.duration,
    })
    current = []
    length = 0
  }

  for (const seg of segments) {
    if (length + seg.text.length > maxChars && current.length) flush()
    current.push(seg)
    length += seg.text.length + 1
  }
  flush()
  return chunks
}

export async function* summarize(
  settings: Settings,
  segments: TranscriptSegment[],
  meta: VideoMeta,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const system = buildSummarySystem(settings.language)
  const fullText = transcriptToText(segments)

  if (fullText.length <= singlePassLimit(settings)) {
    yield* streamChat(
      settings,
      [
        { role: 'system', content: system },
        { role: 'user', content: buildSummaryUser(meta, fullText) },
      ],
      signal,
    )
    return
  }

  const chunks = chunkTranscript(segments)
  const mapOne = (chunk: TranscriptChunk) =>
    completeChat(
      settings,
      [
        { role: 'system', content: system },
        { role: 'user', content: buildMapUser(chunk.text) },
      ],
      signal,
    )

  let partials: string[]
  if (settings.provider === 'lmstudio') {
    // 로컬 서버는 요청을 순차 처리하므로 병렬화 이득이 없다
    partials = []
    for (const chunk of chunks) partials.push(await mapOne(chunk))
  } else {
    partials = await Promise.all(chunks.map(mapOne))
  }

  yield* streamChat(
    settings,
    [
      { role: 'system', content: system },
      { role: 'user', content: buildReduceUser(meta, partials) },
    ],
    signal,
  )
}
