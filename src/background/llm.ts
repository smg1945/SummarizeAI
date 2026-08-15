import type { Settings } from '../shared/types'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class LlmUnreachableError extends Error {
  constructor(message = 'LM Studio 서버에 연결할 수 없습니다') {
    super(message)
    this.name = 'LlmUnreachableError'
  }
}

export function parseSseLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return null
  try {
    const parsed = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[]
    }
    return parsed.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}

export async function* streamChat(
  settings: Settings,
  messages: LlmMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const body: Record<string, unknown> = { messages, stream: true }
  if (settings.model) body.model = settings.model

  let res: Response
  try {
    res = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new LlmUnreachableError()
  }
  if (!res.ok || !res.body) throw new LlmUnreachableError(`LM Studio 응답 오류 (HTTP ${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const delta = parseSseLine(line)
      if (delta) yield delta
    }
  }
  const last = parseSseLine(buffer)
  if (last) yield last
}

export async function completeChat(
  settings: Settings,
  messages: LlmMessage[],
  signal?: AbortSignal,
): Promise<string> {
  let out = ''
  for await (const delta of streamChat(settings, messages, signal)) out += delta
  return out
}

export async function checkConnection(settings: Settings): Promise<boolean> {
  try {
    const res = await fetch(`${settings.baseUrl}/v1/models`)
    return res.ok
  } catch {
    return false
  }
}
