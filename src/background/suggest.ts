import { completeChat } from './llm'
import { buildSuggestSystem, buildSuggestUser } from './prompts'
import type { ChatMessage, Settings, TranscriptSegment, VideoMeta } from '../shared/types'

const MAX_QUESTIONS = 3

export function parseQuestionsJson(text: string): string[] | null {
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
  const questions = parsed
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    .slice(0, MAX_QUESTIONS)
  return questions.length ? questions : null
}

export async function generateSuggestions(
  settings: Settings,
  segments: TranscriptSegment[],
  meta: VideoMeta,
  history: ChatMessage[],
  signal?: AbortSignal,
): Promise<string[] | null> {
  const messages = [
    { role: 'system' as const, content: buildSuggestSystem(settings.language) },
    { role: 'user' as const, content: buildSuggestUser(meta, segments, history) },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await completeChat(settings, messages, signal)
    const questions = parseQuestionsJson(text)
    if (questions) return questions
  }
  return null
}
