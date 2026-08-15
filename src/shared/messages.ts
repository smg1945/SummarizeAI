import type { Chapter, ChatMessage, Settings, TranscriptSegment, VideoMeta } from './types'

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
export type RuntimeRequest =
  | { kind: 'checkConnection' }
  | { kind: 'listModels'; settings: Settings } // 저장 전의 폼 값으로도 조회할 수 있게 설정을 함께 보낸다
export type RuntimeResponse = { connected: boolean }
export interface ListModelsResponse {
  models: string[] | null // null이면 조회 실패
}
