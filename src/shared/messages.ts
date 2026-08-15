import type { Chapter, ChatMessage, TranscriptSegment, VideoMeta } from './types'

export const PORT_NAME = 'summarize-ai'

export type PortRequest =
  | { kind: 'summarize'; transcript: TranscriptSegment[]; meta: VideoMeta }
  | { kind: 'chapters'; transcript: TranscriptSegment[]; meta: VideoMeta }
  | {
      kind: 'chat'
      transcript: TranscriptSegment[]
      meta: VideoMeta
      history: ChatMessage[]
      question: string
    }

export type PortErrorCode = 'LLM_UNREACHABLE' | 'AUTH_FAILED' | 'PARSE_FAILED' | 'UNKNOWN'

export type PortResponse =
  | { kind: 'delta'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'chapters'; chapters: Chapter[] }
  | { kind: 'error'; code: PortErrorCode; message: string }

/** 원샷 메시지 (chrome.runtime.sendMessage) */
export type RuntimeRequest = { kind: 'checkConnection' }
export type RuntimeResponse = { connected: boolean }
