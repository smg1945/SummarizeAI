import { streamChat, type LlmMessage } from './llm'
import { MAX_SINGLE_PASS_CHARS } from './pipeline'
import { buildChatSystem, transcriptToText } from './prompts'
import type { ChatMessage, Settings, TranscriptSegment, VideoMeta } from '../shared/types'

export function buildChatMessages(
  settings: Settings,
  segments: TranscriptSegment[],
  meta: VideoMeta,
  history: ChatMessage[],
  question: string,
): LlmMessage[] {
  const context = transcriptToText(segments).slice(0, MAX_SINGLE_PASS_CHARS)
  return [
    { role: 'system', content: buildChatSystem(settings.language, meta, context) },
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
): AsyncGenerator<string> {
  return streamChat(settings, buildChatMessages(settings, segments, meta, history, question), signal)
}
