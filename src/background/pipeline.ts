import { completeChat, streamChat } from './llm'
import {
  buildMapUser,
  buildReduceUser,
  buildSummarySystem,
  buildSummaryUser,
  transcriptToText,
} from './prompts'
import type { Settings, TranscriptSegment, VideoMeta } from '../shared/types'

export const MAX_SINGLE_PASS_CHARS = 12000
export const CHUNK_CHARS = 8000

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

  if (fullText.length <= MAX_SINGLE_PASS_CHARS) {
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
  const partials: string[] = []
  for (const chunk of chunks) {
    partials.push(
      await completeChat(
        settings,
        [
          { role: 'system', content: system },
          { role: 'user', content: buildMapUser(chunk.text) },
        ],
        signal,
      ),
    )
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
