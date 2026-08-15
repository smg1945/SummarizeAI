import { completeChat } from './llm'
import { buildChaptersSystem, buildChaptersUser } from './prompts'
import type { TranscriptChunk } from './pipeline'
import type { Chapter, Settings, TranscriptSegment, VideoMeta } from '../shared/types'

const TARGET_CHAPTER_SEC = 300 // 약 5분 단위
const MIN_CHAPTERS = 3
const MAX_CHAPTERS = 12

export class ChapterParseError extends Error {
  constructor() {
    super('챕터 JSON 파싱에 실패했습니다')
    this.name = 'ChapterParseError'
  }
}

export function segmentForChapters(
  segments: TranscriptSegment[],
  durationSec: number,
): TranscriptChunk[] {
  if (!segments.length) return []
  const last = segments[segments.length - 1]
  const total = durationSec > 0 ? durationSec : last.start + last.duration
  const count = Math.min(MAX_CHAPTERS, Math.max(MIN_CHAPTERS, Math.round(total / TARGET_CHAPTER_SEC)))
  const span = total / count
  const chunks: TranscriptChunk[] = []
  for (let i = 0; i < count; i++) {
    const startT = i * span
    const endT = (i + 1) * span
    const group = segments.filter((s) => s.start >= startT && s.start < endT)
    if (!group.length) continue
    chunks.push({
      text: group.map((s) => s.text).join(' '),
      startTime: startT,
      endTime: endT,
    })
  }
  return chunks
}

export function parseChaptersJson(text: string): Chapter[] | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const chapters = parsed
    .filter(
      (c): c is Chapter =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Chapter).startTime === 'number' &&
        typeof (c as Chapter).title === 'string' &&
        typeof (c as Chapter).summary === 'string',
    )
    .map((c) => ({ startTime: c.startTime, title: c.title, summary: c.summary }))
    .sort((a, b) => a.startTime - b.startTime)
  return chapters.length ? chapters : null
}

export async function generateChapters(
  settings: Settings,
  segments: TranscriptSegment[],
  meta: VideoMeta,
  signal?: AbortSignal,
): Promise<Chapter[]> {
  const groups = segmentForChapters(segments, meta.durationSec)
  const messages = [
    { role: 'system' as const, content: buildChaptersSystem(settings.language) },
    { role: 'user' as const, content: buildChaptersUser(meta, groups) },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await completeChat(settings, messages, signal)
    const chapters = parseChaptersJson(text)
    if (chapters) return chapters
  }
  throw new ChapterParseError()
}
