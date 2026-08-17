import { handleRequest } from './router'
import { checkConnection, listModels } from './llm'
import { generateSuggestions } from './suggest'
import { getCache, setCache } from './cache'
import { loadSettings } from '../shared/settings'
import {
  PORT_NAME,
  type AckResponse,
  type GetCachedResponse,
  type ListModelsResponse,
  type PortRequest,
  type RuntimeRequest,
  type RuntimeResponse,
  type SuggestQuestionsResponse,
} from '../shared/messages'
import type { Chapter, ChatMessage } from '../shared/types'

function parseJsonOrNull<T>(value: string | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return
  const controller = new AbortController()
  port.onDisconnect.addListener(() => controller.abort())
  port.onMessage.addListener((req: PortRequest) => {
    void (async () => {
      // MV3 서비스 워커가 LLM 응답을 기다리는 동안 유휴 타임아웃으로 종료되는 것을 방지
      const keepalive = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000)
      try {
        const settings = await loadSettings()
        await handleRequest(
          req,
          settings,
          (msg) => {
            try {
              port.postMessage(msg)
            } catch {
              // 포트가 이미 닫힘 (페이지 이동 등) — 무시
            }
          },
          controller.signal,
        )
      } finally {
        clearInterval(keepalive)
      }
    })()
  })
})

chrome.runtime.onMessage.addListener(
  (
    req: RuntimeRequest,
    _sender,
    sendResponse: (
      res: RuntimeResponse | ListModelsResponse | SuggestQuestionsResponse | GetCachedResponse | AckResponse,
    ) => void,
  ) => {
    if (req.kind === 'checkConnection') {
      void (async () => {
        const settings = await loadSettings()
        sendResponse({ connected: await checkConnection(settings) })
      })()
      return true // 비동기 sendResponse 유지
    }
    if (req.kind === 'listModels') {
      void (async () => {
        sendResponse({ models: await listModels(req.settings) })
      })()
      return true
    }
    if (req.kind === 'getCached') {
      void (async () => {
        const settings = await loadSettings()
        const [summary, chaptersJson, chatJson] = await Promise.all([
          getCache(`summary:${req.videoId}:${settings.language}`),
          getCache(`chapters:${req.videoId}:${settings.language}`),
          getCache(`chat:${req.videoId}`),
        ])
        sendResponse({
          summary: summary ?? null,
          chapters: parseJsonOrNull<Chapter[]>(chaptersJson),
          chat: parseJsonOrNull<ChatMessage[]>(chatJson),
        } satisfies GetCachedResponse)
      })()
      return true
    }
    if (req.kind === 'saveChat') {
      void (async () => {
        await setCache(`chat:${req.videoId}`, JSON.stringify(req.history))
        sendResponse({ ok: true } satisfies AckResponse)
      })()
      return true
    }
    if (req.kind === 'suggestQuestions') {
      void (async () => {
        try {
          const settings = await loadSettings()
          const questions = await generateSuggestions(settings, req.transcript, req.meta, req.history)
          sendResponse({ questions } satisfies SuggestQuestionsResponse)
        } catch {
          sendResponse({ questions: null } satisfies SuggestQuestionsResponse)
        }
      })()
      return true
    }
  },
)
