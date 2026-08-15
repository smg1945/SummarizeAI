import type { Settings } from '../shared/types'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class LlmUnreachableError extends Error {
  constructor(message = 'LLM 서버에 연결할 수 없습니다') {
    super(message)
    this.name = 'LlmUnreachableError'
  }
}

export class LlmAuthError extends Error {
  constructor(message = 'API 키가 올바르지 않습니다') {
    super(message)
    this.name = 'LlmAuthError'
  }
}

// Claude API는 max_tokens가 필수 (요약/챕터 출력에 충분한 값)
const CLAUDE_MAX_TOKENS = 4096

interface Endpoint {
  kind: 'openai' | 'claude'
  chatUrl: string
  modelsUrl: string
  apiKey?: string
  model: string
}

function resolveEndpoint(settings: Settings): Endpoint {
  switch (settings.provider) {
    case 'lmstudio':
      return {
        kind: 'openai',
        chatUrl: `${settings.lmstudio.baseUrl}/v1/chat/completions`,
        modelsUrl: `${settings.lmstudio.baseUrl}/v1/models`,
        model: settings.lmstudio.model,
      }
    case 'gemini':
      return {
        kind: 'openai',
        chatUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
        apiKey: settings.gemini.apiKey,
        model: settings.gemini.model,
      }
    case 'openai':
      return {
        kind: 'openai',
        chatUrl: 'https://api.openai.com/v1/chat/completions',
        modelsUrl: 'https://api.openai.com/v1/models',
        apiKey: settings.openai.apiKey,
        model: settings.openai.model,
      }
    case 'claude':
      return {
        kind: 'claude',
        chatUrl: 'https://api.anthropic.com/v1/messages',
        modelsUrl: 'https://api.anthropic.com/v1/models',
        apiKey: settings.claude.apiKey,
        model: settings.claude.model,
      }
  }
}

function authHeaders(endpoint: Endpoint): Record<string, string> {
  if (endpoint.kind === 'claude') {
    return {
      'x-api-key': endpoint.apiKey ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }
  return endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}
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

export function parseClaudeSseLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  try {
    const parsed = JSON.parse(payload) as {
      type?: string
      delta?: { type?: string; text?: string }
    }
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      return parsed.delta.text ?? null
    }
    return null
  } catch {
    return null
  }
}

function buildRequestBody(endpoint: Endpoint, messages: LlmMessage[]): Record<string, unknown> {
  if (endpoint.kind === 'claude') {
    // Claude API는 system을 top-level 파라미터로 받는다
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const rest = messages.filter((m) => m.role !== 'system')
    const body: Record<string, unknown> = {
      model: endpoint.model,
      max_tokens: CLAUDE_MAX_TOKENS,
      stream: true,
      messages: rest,
    }
    if (system) body.system = system
    return body
  }
  const body: Record<string, unknown> = { messages, stream: true }
  if (endpoint.model) body.model = endpoint.model
  return body
}

export async function* streamChat(
  settings: Settings,
  messages: LlmMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const endpoint = resolveEndpoint(settings)
  const parseLine = endpoint.kind === 'claude' ? parseClaudeSseLine : parseSseLine

  let res: Response
  try {
    res = await fetch(endpoint.chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(endpoint) },
      body: JSON.stringify(buildRequestBody(endpoint, messages)),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new LlmUnreachableError()
  }
  if (res.status === 401 || res.status === 403) throw new LlmAuthError()
  if (!res.ok || !res.body) throw new LlmUnreachableError(`LLM 응답 오류 (HTTP ${res.status})`)

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
      const delta = parseLine(line)
      if (delta) yield delta
    }
  }
  const last = parseLine(buffer)
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
  const endpoint = resolveEndpoint(settings)
  try {
    const res = await fetch(endpoint.modelsUrl, { headers: authHeaders(endpoint) })
    return res.ok
  } catch {
    return false
  }
}
