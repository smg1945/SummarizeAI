import { streamChat, type LlmMessage } from './llm'
import { singlePassLimit } from './pipeline'
import { buildChatSystem, transcriptToText } from './prompts'
import type { ChatMessage, Settings, TranscriptSegment, VideoMeta } from '../shared/types'

export function buildChatMessages(
  settings: Settings,
  segments: TranscriptSegment[],
  meta: VideoMeta,
  history: ChatMessage[],
  question: string,
  summary?: string,
): LlmMessage[] {
  const context = transcriptToText(segments).slice(0, singlePassLimit(settings))
  return [
    { role: 'system', content: buildChatSystem(settings.language, meta, context, summary) },
    ...history,
    { role: 'user', content: question },
  ]
}

export function answerQuestion(
  settings: Settings,
  segments: TranscriptSegment[],
  meta: VideoMeta,
  history: ChatMessage[],
  question: string,
  signal?: AbortSignal,
  summary?: string,
): AsyncGenerator<string> {
  return streamChat(settings, buildChatMessages(settings, segments, meta, history, question, summary), signal)
}
