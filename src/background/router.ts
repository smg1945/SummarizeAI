import { generateChapters, ChapterParseError } from './chapters'
import { answerQuestion } from './chat'
import { getCache, setCache } from './cache'
import { LlmUnreachableError } from './llm'
import { summarize } from './pipeline'
import type { PortErrorCode, PortRequest, PortResponse } from '../shared/messages'
import type { Chapter, Settings } from '../shared/types'

function errorCode(e: unknown): PortErrorCode {
  if (e instanceof LlmUnreachableError) return 'LLM_UNREACHABLE'
  if (e instanceof ChapterParseError) return 'PARSE_FAILED'
  return 'UNKNOWN'
}

export async function handleRequest(
  req: PortRequest,
  settings: Settings,
  post: (msg: PortResponse) => void,
  signal: AbortSignal,
): Promise<void> {
  try {
    switch (req.kind) {
      case 'summarize': {
        const cacheKey = `summary:${req.meta.videoId}:${settings.language}`
        const cached = await getCache(cacheKey)
        if (cached !== undefined) {
          post({ kind: 'done', text: cached })
          return
        }
        let full = ''
        for await (const delta of summarize(settings, req.transcript, req.meta, signal)) {
          full += delta
          post({ kind: 'delta', text: delta })
        }
        await setCache(cacheKey, full)
        post({ kind: 'done', text: full })
        return
      }
      case 'chapters': {
        const cacheKey = `chapters:${req.meta.videoId}:${settings.language}`
        const cached = await getCache(cacheKey)
        if (cached !== undefined) {
          post({ kind: 'chapters', chapters: JSON.parse(cached) as Chapter[] })
          return
        }
        const chapters = await generateChapters(settings, req.transcript, req.meta, signal)
        await setCache(cacheKey, JSON.stringify(chapters))
        post({ kind: 'chapters', chapters })
        return
      }
      case 'chat': {
        let full = ''
        for await (const delta of answerQuestion(
          settings,
          req.transcript,
          req.meta,
          req.history,
          req.question,
          signal,
        )) {
          full += delta
          post({ kind: 'delta', text: delta })
        }
        post({ kind: 'done', text: full })
        return
      }
    }
  } catch (e) {
    if (signal.aborted) return
    post({ kind: 'error', code: errorCode(e), message: e instanceof Error ? e.message : String(e) })
  }
}
