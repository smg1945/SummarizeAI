# SummarizeAI (유튜브 요약 확장 앱) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LM Studio 로컬 LLM으로 유튜브 영상 자막을 요약(전체 요약·타임라인 챕터·Q&A 채팅·출력 언어 선택)하는 크롬 확장 앱(MV3)을 만든다.

**Architecture:** 콘텐츠 스크립트가 유튜브 watch 페이지에 Shadow DOM React 패널을 삽입하고 자막을 추출한다. 모든 LLM 호출은 백그라운드 서비스 워커가 담당하며(`host_permissions`로 localhost CORS 우회), 둘은 `chrome.runtime` Port로 스트리밍 통신한다. 긴 자막은 청크 분할 → 부분 요약 → 통합(map-reduce)한다.

**Tech Stack:** React 18, TypeScript(strict), Vite 6 + @crxjs/vite-plugin 2, Vitest, LM Studio OpenAI 호환 API(`/v1/chat/completions`, SSE 스트리밍)

**Spec:** `docs/superpowers/specs/2026-08-15-youtube-summarizer-design.md`

## Global Constraints

- Manifest V3, Chrome 최신 버전 대상. 개발자 모드 로드용 (스토어 심사 대응 불필요)
- LM Studio 기본 주소는 `http://localhost:1234` (옵션에서 변경 가능). `host_permissions`는 `http://localhost/*`, `http://127.0.0.1/*` (크롬 매치 패턴은 포트를 무시하므로 포트를 쓰지 않는다)
- LLM 호출은 **백그라운드 서비스 워커에서만** 수행한다. 콘텐츠 스크립트는 유튜브 도메인 fetch(자막)만 한다
- 모든 프롬프트에 출력 언어 지시를 주입한다: 설정값 `ko`/`en`/`auto`
- 사용자에게 보이는 UI 문구는 한국어
- TypeScript `strict: true`. 테스트는 Vitest, 순수 로직만 단위 테스트 (UI는 수동 검증 체크리스트)
- 커밋은 태스크마다 1회 이상, 메시지는 conventional commit (`feat:`, `test:`, `chore:` 등)
- 캐시 키는 `요약종류:videoId:언어` 형식으로 `chrome.storage.session`에 저장 (백그라운드에서만 접근)

---

### Task 1: 프로젝트 스캐폴드 (빌드되는 빈 확장 앱)

**Files:**
- Create: `package.json`, `vite.config.ts`, `manifest.config.ts`, `tsconfig.json`, `.gitignore`
- Create: `src/background/index.ts`, `src/content/index.tsx`, `src/options/index.html`, `src/options/main.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `npm run build`로 `dist/`에 로드 가능한 확장 앱, `npm test`로 Vitest 실행 환경

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "summarize-ai",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0",
    "@types/chrome": "^0.0.287",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: 설정 파일 작성**

`manifest.config.ts`:

```ts
import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'SummarizeAI',
  version: '0.1.0',
  description: '로컬 LLM(LM Studio)으로 유튜브 영상을 요약합니다',
  permissions: ['storage'],
  host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/index.tsx'],
      matches: ['https://www.youtube.com/*'],
      run_at: 'document_idle',
    },
  ],
  options_page: 'src/options/index.html',
})
```

`vite.config.ts` (vitest 설정을 함께 쓰기 위해 `vitest/config`에서 import):

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  test: {
    environment: 'node',
  },
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["chrome", "vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "manifest.config.ts", "vite.config.ts"]
}
```

`.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 3: 최소 진입점 작성**

`src/background/index.ts`:

```ts
console.log('[SummarizeAI] background loaded')
```

`src/content/index.tsx`:

```ts
console.log('[SummarizeAI] content script loaded')
```

`src/options/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>SummarizeAI 설정</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/options/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(<h1>SummarizeAI 설정</h1>)
```

- [ ] **Step 4: 설치 및 빌드 확인**

Run: `npm install` 후 `npm run build`
Expected: 에러 없이 `dist/` 생성, `dist/manifest.json` 존재

- [ ] **Step 5: 수동 확인 — 크롬에 로드**

`chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `dist` 폴더 선택.
Expected: 오류 없이 로드, 유튜브 페이지 콘솔에 `[SummarizeAI] content script loaded` 출력

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: CRXJS + React + Vite 프로젝트 스캐폴드"
```

---

### Task 2: 공유 타입과 설정 모듈

**Files:**
- Create: `src/shared/types.ts`, `src/shared/messages.ts`, `src/shared/settings.ts`, `src/shared/format.ts`
- Test: `src/shared/settings.test.ts`, `src/shared/format.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `TranscriptSegment { start: number; duration: number; text: string }`
  - `VideoMeta { videoId: string; title: string; durationSec: number }`
  - `Settings { baseUrl: string; model: string; language: 'ko' | 'en' | 'auto' }`, `DEFAULT_SETTINGS`
  - `Chapter { startTime: number; title: string; summary: string }`
  - `ChatMessage { role: 'user' | 'assistant'; content: string }`
  - `PortRequest`, `PortResponse` (Port 프로토콜), `PORT_NAME`
  - `loadSettings(): Promise<Settings>`, `saveSettings(s: Settings): Promise<void>`
  - `formatTime(sec: number): string` — `"7:05"`, `"1:02:03"` 형식

- [ ] **Step 1: 타입 정의 작성**

`src/shared/types.ts`:

```ts
export interface TranscriptSegment {
  start: number // 초 단위
  duration: number // 초 단위
  text: string
}

export interface VideoMeta {
  videoId: string
  title: string
  durationSec: number
}

export interface Chapter {
  startTime: number // 초 단위
  title: string
  summary: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Settings {
  baseUrl: string
  model: string // 빈 문자열이면 LM Studio가 로드한 기본 모델 사용
  language: 'ko' | 'en' | 'auto'
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://localhost:1234',
  model: '',
  language: 'ko',
}
```

`src/shared/messages.ts`:

```ts
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

export type PortErrorCode = 'LLM_UNREACHABLE' | 'PARSE_FAILED' | 'UNKNOWN'

export type PortResponse =
  | { kind: 'delta'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'chapters'; chapters: Chapter[] }
  | { kind: 'error'; code: PortErrorCode; message: string }

/** 원샷 메시지 (chrome.runtime.sendMessage) */
export type RuntimeRequest = { kind: 'checkConnection' }
export type RuntimeResponse = { connected: boolean }
```

- [ ] **Step 2: 실패하는 테스트 작성 (settings, format)**

`src/shared/settings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, saveSettings } from './settings'
import { DEFAULT_SETTINGS } from './types'

const store: Record<string, unknown> = {}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj)
        }),
      },
    },
  })
})

describe('loadSettings', () => {
  it('저장된 값이 없으면 기본값을 돌려준다', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('저장된 값을 기본값 위에 병합한다 (누락 필드는 기본값 유지)', async () => {
    store.settings = { model: 'qwen2.5-7b' }
    const s = await loadSettings()
    expect(s.model).toBe('qwen2.5-7b')
    expect(s.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
  })
})

describe('saveSettings', () => {
  it('저장 후 다시 읽으면 같은 값이 나온다', async () => {
    const next = { baseUrl: 'http://127.0.0.1:1234', model: 'm', language: 'en' as const }
    await saveSettings(next)
    expect(await loadSettings()).toEqual(next)
  })
})
```

`src/shared/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatTime } from './format'

describe('formatTime', () => {
  it('1시간 미만은 m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(425)).toBe('7:05')
  })
  it('1시간 이상은 h:mm:ss', () => {
    expect(formatTime(3723)).toBe('1:02:03')
  })
  it('소수점은 버린다', () => {
    expect(formatTime(59.9)).toBe('0:59')
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `settings`, `format` 모듈이 없어서 import 에러

- [ ] **Step 4: 구현**

`src/shared/settings.ts`:

```ts
import { DEFAULT_SETTINGS, type Settings } from './types'

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...((stored.settings as Partial<Settings>) ?? {}) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}
```

`src/shared/format.ts`:

```ts
export function formatTime(sec: number): string {
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (settings 3개 + format 3개)

- [ ] **Step 6: Commit**

```bash
git add src/shared
git commit -m "feat: 공유 타입, 설정 저장, 시간 포맷 모듈"
```

---

### Task 3: 자막 추출 모듈

**Files:**
- Create: `src/content/transcript.ts`
- Test: `src/content/transcript.test.ts`

**Interfaces:**
- Consumes: `TranscriptSegment`, `VideoMeta` (Task 2)
- Produces:
  - `extractPlayerResponse(html: string): unknown | null` — watch 페이지 HTML에서 `ytInitialPlayerResponse` JSON 추출
  - `pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null` — 한국어 수동 > 영어 수동 > 기타 수동 > 한국어 자동 > 영어 자동 > 첫 트랙
  - `parseJson3(data: unknown): TranscriptSegment[]`
  - `fetchTranscript(videoId: string): Promise<{ segments: TranscriptSegment[]; meta: VideoMeta } | null>` — null이면 "자막 없음"

- [ ] **Step 1: 실패하는 테스트 작성**

`src/content/transcript.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractPlayerResponse, parseJson3, pickCaptionTrack } from './transcript'

describe('extractPlayerResponse', () => {
  it('스크립트 안의 JSON을 중괄호 균형으로 추출한다', () => {
    const html = `<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"안녕 {테스트} \\"인용\\"","lengthSeconds":"120"}};var other = 1;</script>`
    const pr = extractPlayerResponse(html) as any
    expect(pr.videoDetails.title).toBe('안녕 {테스트} "인용"')
    expect(pr.videoDetails.lengthSeconds).toBe('120')
  })

  it('마커가 없으면 null', () => {
    expect(extractPlayerResponse('<html></html>')).toBeNull()
  })
})

describe('pickCaptionTrack', () => {
  const ko = { baseUrl: 'u1', languageCode: 'ko' }
  const en = { baseUrl: 'u2', languageCode: 'en' }
  const koAsr = { baseUrl: 'u3', languageCode: 'ko', kind: 'asr' }
  const ja = { baseUrl: 'u4', languageCode: 'ja' }

  it('한국어 수동 자막을 최우선으로 고른다', () => {
    expect(pickCaptionTrack([en, koAsr, ko])).toBe(ko)
  })
  it('한국어가 없으면 영어 수동', () => {
    expect(pickCaptionTrack([ja, en])).toBe(en)
  })
  it('수동이 없으면 자동생성(asr)이라도 고른다', () => {
    expect(pickCaptionTrack([koAsr])).toBe(koAsr)
  })
  it('빈 배열이면 null', () => {
    expect(pickCaptionTrack([])).toBeNull()
  })
})

describe('parseJson3', () => {
  it('events를 초 단위 세그먼트로 정규화한다', () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: '안녕' }, { utf8: '하세요' }] },
        { tStartMs: 2500, dDurationMs: 1500, segs: [{ utf8: '반가워요\n' }] },
        { tStartMs: 4000, dDurationMs: 100 }, // segs 없는 이벤트는 무시
        { tStartMs: 5000, dDurationMs: 100, segs: [{ utf8: '\n' }] }, // 공백뿐이면 무시
      ],
    }
    expect(parseJson3(data)).toEqual([
      { start: 0, duration: 2, text: '안녕하세요' },
      { start: 2.5, duration: 1.5, text: '반가워요' },
    ])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `transcript` 모듈 없음

- [ ] **Step 3: 구현**

`src/content/transcript.ts`:

```ts
import type { TranscriptSegment, VideoMeta } from '../shared/types'

export interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string // 'asr'이면 자동생성
}

const MARKER = 'ytInitialPlayerResponse = '

export function extractPlayerResponse(html: string): unknown | null {
  const idx = html.indexOf(MARKER)
  if (idx === -1) return null
  const start = idx + MARKER.length
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = inString
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const manual = (lang: string) =>
    tracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== 'asr')
  const asr = (lang: string) =>
    tracks.find((t) => t.languageCode.startsWith(lang) && t.kind === 'asr')
  return (
    manual('ko') ??
    manual('en') ??
    tracks.find((t) => t.kind !== 'asr') ??
    asr('ko') ??
    asr('en') ??
    tracks[0] ??
    null
  )
}

interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  segs?: { utf8?: string }[]
}

export function parseJson3(data: unknown): TranscriptSegment[] {
  const events = ((data as { events?: Json3Event[] })?.events ?? []) as Json3Event[]
  const segments: TranscriptSegment[] = []
  for (const ev of events) {
    if (!ev.segs) continue
    const text = ev.segs
      .map((s) => s.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .trim()
    if (!text) continue
    segments.push({
      start: (ev.tStartMs ?? 0) / 1000,
      duration: (ev.dDurationMs ?? 0) / 1000,
      text,
    })
  }
  return segments
}

export async function fetchTranscript(
  videoId: string,
): Promise<{ segments: TranscriptSegment[]; meta: VideoMeta } | null> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    credentials: 'include',
  })
  const html = await res.text()
  const pr = extractPlayerResponse(html) as {
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
    videoDetails?: { title?: string; lengthSeconds?: string }
  } | null
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks?.length) return null
  const track = pickCaptionTrack(tracks)
  if (!track) return null
  const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`
  const capRes = await fetch(url, { credentials: 'include' })
  if (!capRes.ok) return null
  const segments = parseJson3(await capRes.json())
  if (!segments.length) return null
  const meta: VideoMeta = {
    videoId,
    title: pr?.videoDetails?.title ?? '',
    durationSec: Number(pr?.videoDetails?.lengthSeconds ?? 0),
  }
  return { segments, meta }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/transcript.ts src/content/transcript.test.ts
git commit -m "feat: 유튜브 자막 추출 모듈 (playerResponse 파싱, 트랙 선택, json3 정규화)"
```

---

### Task 4: LM Studio 클라이언트 (스트리밍)

**Files:**
- Create: `src/background/llm.ts`
- Test: `src/background/llm.test.ts`

**Interfaces:**
- Consumes: `Settings` (Task 2)
- Produces:
  - `LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }`
  - `LlmUnreachableError` (Error 서브클래스)
  - `parseSseLine(line: string): string | null` — SSE 한 줄 → delta 텍스트
  - `streamChat(settings: Settings, messages: LlmMessage[], signal?: AbortSignal): AsyncGenerator<string>`
  - `completeChat(settings: Settings, messages: LlmMessage[], signal?: AbortSignal): Promise<string>`
  - `checkConnection(settings: Settings): Promise<boolean>` — `GET /v1/models` 성공 여부

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/llm.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmUnreachableError, completeChat, parseSseLine, streamChat } from './llm'
import { DEFAULT_SETTINGS } from '../shared/types'

function sseResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

const delta = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`

afterEach(() => vi.unstubAllGlobals())

describe('parseSseLine', () => {
  it('delta content를 추출한다', () => {
    expect(parseSseLine(delta('안녕').trim())).toBe('안녕')
  })
  it('[DONE], 빈 줄, 비 data 줄은 null', () => {
    expect(parseSseLine('data: [DONE]')).toBeNull()
    expect(parseSseLine('')).toBeNull()
    expect(parseSseLine(': keep-alive')).toBeNull()
  })
  it('content 없는 delta(role만 있는 첫 청크)는 null', () => {
    expect(parseSseLine(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}`)).toBeNull()
  })
})

describe('streamChat', () => {
  it('SSE 스트림을 delta 단위로 yield한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(delta('안') + delta('녕') + 'data: [DONE]\n')))
    const out: string[] = []
    for await (const d of streamChat(DEFAULT_SETTINGS, [{ role: 'user', content: 'hi' }])) {
      out.push(d)
    }
    expect(out).toEqual(['안', '녕'])
  })

  it('서버에 연결할 수 없으면 LlmUnreachableError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    await expect(async () => {
      for await (const _ of streamChat(DEFAULT_SETTINGS, [])) void _
    }).rejects.toThrow(LlmUnreachableError)
  })

  it('model이 빈 문자열이면 요청 body에 model 필드를 넣지 않는다', async () => {
    const fetchMock = vi.fn(async () => sseResponse('data: [DONE]\n'))
    vi.stubGlobal('fetch', fetchMock)
    for await (const _ of streamChat({ ...DEFAULT_SETTINGS, model: '' }, [])) void _
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body)
    expect('model' in body).toBe(false)
  })
})

describe('completeChat', () => {
  it('전체 스트림을 이어붙여 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(delta('가나') + delta('다') + 'data: [DONE]\n')))
    expect(await completeChat(DEFAULT_SETTINGS, [])).toBe('가나다')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `llm` 모듈 없음

- [ ] **Step 3: 구현**

`src/background/llm.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/llm.ts src/background/llm.test.ts
git commit -m "feat: LM Studio OpenAI 호환 스트리밍 클라이언트"
```

---

### Task 5: 요약 파이프라인 (청크 분할 + map-reduce)

**Files:**
- Create: `src/background/prompts.ts`, `src/background/pipeline.ts`
- Test: `src/background/pipeline.test.ts`

**Interfaces:**
- Consumes: `streamChat`, `completeChat`, `LlmMessage` (Task 4), `TranscriptSegment`, `VideoMeta`, `Settings` (Task 2)
- Produces:
  - `languageInstruction(language: Settings['language']): string`
  - `transcriptToText(segments: TranscriptSegment[]): string`
  - `TranscriptChunk { text: string; startTime: number; endTime: number }`
  - `chunkTranscript(segments: TranscriptSegment[], maxChars?: number): TranscriptChunk[]`
  - `summarize(settings, segments, meta, signal?): AsyncGenerator<string>`
  - 상수 `MAX_SINGLE_PASS_CHARS = 12000`, `CHUNK_CHARS = 8000`

- [ ] **Step 1: 프롬프트 모듈 작성 (테스트는 파이프라인 테스트에 포함)**

`src/background/prompts.ts`:

```ts
import type { Settings, TranscriptSegment, VideoMeta } from '../shared/types'

export function languageInstruction(language: Settings['language']): string {
  switch (language) {
    case 'ko':
      return '반드시 한국어로 답하세요.'
    case 'en':
      return 'You must answer in English.'
    case 'auto':
      return '자막과 같은 언어로 답하세요.'
  }
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(' ')
}

export function buildSummarySystem(language: Settings['language']): string {
  return [
    '당신은 유튜브 영상 요약 도우미입니다.',
    '핵심 주장, 근거, 결론을 빠뜨리지 말고 명확하게 요약하세요.',
    '불릿 목록과 짧은 단락을 섞어 읽기 쉽게 작성하세요.',
    languageInstruction(language),
  ].join('\n')
}

export function buildSummaryUser(meta: VideoMeta, transcriptText: string): string {
  return `영상 제목: ${meta.title}\n\n다음 자막 전체를 요약해 주세요:\n\n${transcriptText}`
}

export function buildMapUser(chunkText: string): string {
  return `다음은 긴 영상 자막의 일부입니다. 이 부분의 핵심 내용을 5문장 이내로 요약하세요:\n\n${chunkText}`
}

export function buildReduceUser(meta: VideoMeta, partials: string[]): string {
  const joined = partials.map((p, i) => `[부분 ${i + 1}]\n${p}`).join('\n\n')
  return `영상 제목: ${meta.title}\n\n다음은 영상을 구간별로 나눠 요약한 부분 요약들입니다. 이를 통합해 전체 영상의 최종 요약을 작성하세요:\n\n${joined}`
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/background/pipeline.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./llm', () => ({
  streamChat: vi.fn(),
  completeChat: vi.fn(),
}))

import { completeChat, streamChat } from './llm'
import { CHUNK_CHARS, MAX_SINGLE_PASS_CHARS, chunkTranscript, summarize } from './pipeline'

const meta = { videoId: 'v1', title: '테스트 영상', durationSec: 600 }

function seg(start: number, text: string): TranscriptSegment {
  return { start, duration: 5, text }
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = ''
  for await (const d of gen) out += d
  return out
}

beforeEach(() => vi.clearAllMocks())

describe('chunkTranscript', () => {
  it('maxChars를 넘지 않게 세그먼트를 묶는다', () => {
    const segments = [seg(0, 'a'.repeat(50)), seg(10, 'b'.repeat(50)), seg(20, 'c'.repeat(50))]
    const chunks = chunkTranscript(segments, 110)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].startTime).toBe(0)
    expect(chunks[1].startTime).toBe(20)
  })

  it('단일 세그먼트가 maxChars보다 커도 자체 청크로 포함한다', () => {
    const chunks = chunkTranscript([seg(0, 'x'.repeat(500))], 100)
    expect(chunks).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('짧은 자막은 한 번에 스트리밍 요약한다 (completeChat 미호출)', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield '요약'
    })
    const result = await collect(summarize(DEFAULT_SETTINGS, [seg(0, '짧은 자막')], meta))
    expect(result).toBe('요약')
    expect(completeChat).not.toHaveBeenCalled()
  })

  it('긴 자막은 map(completeChat) 후 reduce(streamChat)한다', async () => {
    vi.mocked(completeChat).mockResolvedValue('부분요약')
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield '최종요약'
    })
    const longSegments = Array.from({ length: 30 }, (_, i) =>
      seg(i * 10, 'x'.repeat(Math.ceil(MAX_SINGLE_PASS_CHARS / 20))),
    )
    const result = await collect(summarize(DEFAULT_SETTINGS, longSegments, meta))
    expect(result).toBe('최종요약')
    expect(vi.mocked(completeChat).mock.calls.length).toBeGreaterThan(1)
    // reduce 프롬프트에 부분 요약이 포함된다
    const reduceMessages = vi.mocked(streamChat).mock.calls[0][1]
    expect(reduceMessages.some((m) => m.content.includes('부분요약'))).toBe(true)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `pipeline` 모듈 없음

- [ ] **Step 4: 구현**

`src/background/pipeline.ts`:

```ts
import { completeChat, streamChat } from './llm'
import {
  buildMapUser,
  buildReduceUser,
  buildSummarySystem,
  buildSummaryUser,
  transcriptToText,
} from './prompts'
import type { Settings, TranscriptSegment, VideoMeta } from '../shared/types'

export const MAX_SINGLE_PASS_CHARS = 12000
export const CHUNK_CHARS = 8000

export interface TranscriptChunk {
  text: string
  startTime: number
  endTime: number
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  maxChars: number = CHUNK_CHARS,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = []
  let current: TranscriptSegment[] = []
  let length = 0

  const flush = () => {
    if (!current.length) return
    const last = current[current.length - 1]
    chunks.push({
      text: current.map((s) => s.text).join(' '),
      startTime: current[0].start,
      endTime: last.start + last.duration,
    })
    current = []
    length = 0
  }

  for (const seg of segments) {
    if (length + seg.text.length > maxChars && current.length) flush()
    current.push(seg)
    length += seg.text.length + 1
  }
  flush()
  return chunks
}

export async function* summarize(
  settings: Settings,
  segments: TranscriptSegment[],
  meta: VideoMeta,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const system = buildSummarySystem(settings.language)
  const fullText = transcriptToText(segments)

  if (fullText.length <= MAX_SINGLE_PASS_CHARS) {
    yield* streamChat(
      settings,
      [
        { role: 'system', content: system },
        { role: 'user', content: buildSummaryUser(meta, fullText) },
      ],
      signal,
    )
    return
  }

  const chunks = chunkTranscript(segments)
  const partials: string[] = []
  for (const chunk of chunks) {
    partials.push(
      await completeChat(
        settings,
        [
          { role: 'system', content: system },
          { role: 'user', content: buildMapUser(chunk.text) },
        ],
        signal,
      ),
    )
  }

  yield* streamChat(
    settings,
    [
      { role: 'system', content: system },
      { role: 'user', content: buildReduceUser(meta, partials) },
    ],
    signal,
  )
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/background/prompts.ts src/background/pipeline.ts src/background/pipeline.test.ts
git commit -m "feat: 요약 파이프라인 (청크 분할, map-reduce, 스트리밍)"
```

---

### Task 6: 챕터 생성

**Files:**
- Modify: `src/background/prompts.ts` (챕터 프롬프트 추가)
- Create: `src/background/chapters.ts`
- Test: `src/background/chapters.test.ts`

**Interfaces:**
- Consumes: `completeChat` (Task 4), `TranscriptChunk` (Task 5), `Chapter`, `formatTime` (Task 2)
- Produces:
  - `segmentForChapters(segments: TranscriptSegment[], durationSec: number): TranscriptChunk[]` — 약 5분 단위, 3~12개 구간
  - `parseChaptersJson(text: string): Chapter[] | null`
  - `ChapterParseError` (Error 서브클래스)
  - `generateChapters(settings, segments, meta, signal?): Promise<Chapter[]>` — 파싱 실패 시 1회 재시도, 그래도 실패면 `ChapterParseError` throw

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/chapters.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./llm', () => ({ completeChat: vi.fn(), streamChat: vi.fn() }))

import { completeChat } from './llm'
import { ChapterParseError, generateChapters, parseChaptersJson, segmentForChapters } from './chapters'

const meta = { videoId: 'v1', title: '테스트', durationSec: 1800 }

function segsEvery10s(totalSec: number): TranscriptSegment[] {
  return Array.from({ length: totalSec / 10 }, (_, i) => ({
    start: i * 10,
    duration: 10,
    text: `내용${i}`,
  }))
}

beforeEach(() => vi.clearAllMocks())

describe('segmentForChapters', () => {
  it('30분 영상은 6개 구간 (약 5분 단위)', () => {
    const chunks = segmentForChapters(segsEvery10s(1800), 1800)
    expect(chunks).toHaveLength(6)
    expect(chunks[0].startTime).toBe(0)
    expect(chunks[1].startTime).toBe(300)
  })

  it('짧은 영상도 최소 3개 구간', () => {
    expect(segmentForChapters(segsEvery10s(300), 300)).toHaveLength(3)
  })

  it('아주 긴 영상도 최대 12개 구간', () => {
    expect(segmentForChapters(segsEvery10s(36000), 36000)).toHaveLength(12)
  })

  it('빈 자막이면 빈 배열', () => {
    expect(segmentForChapters([], 600)).toEqual([])
  })
})

describe('parseChaptersJson', () => {
  it('앞뒤 잡담이 섞여도 JSON 배열만 추출해 파싱한다', () => {
    const text = '다음과 같습니다:\n[{"startTime": 0, "title": "도입", "summary": "소개"}]\n이상입니다.'
    expect(parseChaptersJson(text)).toEqual([{ startTime: 0, title: '도입', summary: '소개' }])
  })

  it('필수 필드가 잘못된 항목은 걸러낸다', () => {
    const text = '[{"startTime": "abc", "title": "x", "summary": "y"}, {"startTime": 5, "title": "ok", "summary": "z"}]'
    expect(parseChaptersJson(text)).toEqual([{ startTime: 5, title: 'ok', summary: 'z' }])
  })

  it('배열이 없거나 유효 항목이 0개면 null', () => {
    expect(parseChaptersJson('JSON 못 만들겠어요')).toBeNull()
    expect(parseChaptersJson('[]')).toBeNull()
  })
})

describe('generateChapters', () => {
  it('첫 응답이 파싱 실패면 1회 재시도한다', async () => {
    vi.mocked(completeChat)
      .mockResolvedValueOnce('망가진 응답')
      .mockResolvedValueOnce('[{"startTime": 0, "title": "도입", "summary": "s"}]')
    const chapters = await generateChapters(DEFAULT_SETTINGS, segsEvery10s(600), meta)
    expect(chapters).toHaveLength(1)
    expect(completeChat).toHaveBeenCalledTimes(2)
  })

  it('재시도도 실패하면 ChapterParseError', async () => {
    vi.mocked(completeChat).mockResolvedValue('여전히 망가진 응답')
    await expect(generateChapters(DEFAULT_SETTINGS, segsEvery10s(600), meta)).rejects.toThrow(
      ChapterParseError,
    )
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `chapters` 모듈 없음

- [ ] **Step 3: 프롬프트 추가 및 구현**

`src/background/prompts.ts`에 추가:

```ts
import { formatTime } from '../shared/format'
import type { TranscriptChunk } from './pipeline'

const CHAPTER_GROUP_MAX_CHARS = 3000

export function buildChaptersSystem(language: Settings['language']): string {
  return [
    '당신은 유튜브 영상의 챕터(구간별 목차)를 만드는 도우미입니다.',
    '반드시 JSON 배열만 출력하세요. 다른 텍스트를 덧붙이지 마세요.',
    '형식: [{"startTime": 초단위숫자, "title": "구간 제목", "summary": "한 줄 요약"}]',
    'startTime은 각 구간에 표기된 "시작" 초 값을 그대로 사용하세요.',
    languageInstruction(language),
  ].join('\n')
}

export function buildChaptersUser(meta: VideoMeta, groups: TranscriptChunk[]): string {
  const body = groups
    .map(
      (g, i) =>
        `구간 ${i + 1} (시작: ${Math.round(g.startTime)}초, ${formatTime(g.startTime)}):\n${g.text.slice(0, CHAPTER_GROUP_MAX_CHARS)}`,
    )
    .join('\n\n')
  return `영상 제목: ${meta.title}\n\n다음 구간별 자막을 보고 각 구간의 챕터를 만들어 주세요:\n\n${body}`
}
```

`src/background/chapters.ts`:

```ts
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
```

주의: `segmentForChapters`의 `startTime`은 구간 경계(`i * span`)를 사용한다. 테스트의 `chunks[1].startTime === 300` 기대값과 일치해야 한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/chapters.ts src/background/chapters.test.ts src/background/prompts.ts
git commit -m "feat: 타임라인 챕터 생성 (구간 분할, JSON 파싱, 재시도)"
```

---

### Task 7: Q&A 채팅 파이프라인

**Files:**
- Modify: `src/background/prompts.ts` (채팅 프롬프트 추가)
- Create: `src/background/chat.ts`
- Test: `src/background/chat.test.ts`

**Interfaces:**
- Consumes: `streamChat`, `LlmMessage` (Task 4), `MAX_SINGLE_PASS_CHARS` (Task 5), `ChatMessage` (Task 2)
- Produces:
  - `buildChatMessages(settings, segments, meta, history, question): LlmMessage[]`
  - `answerQuestion(settings, segments, meta, history, question, signal?): AsyncGenerator<string>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/chat.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./llm', () => ({ streamChat: vi.fn(), completeChat: vi.fn() }))

import { buildChatMessages } from './chat'
import { MAX_SINGLE_PASS_CHARS } from './pipeline'

const meta = { videoId: 'v1', title: '테스트 영상', durationSec: 600 }
const segs: TranscriptSegment[] = [{ start: 0, duration: 5, text: '자막 내용입니다' }]

describe('buildChatMessages', () => {
  it('시스템 프롬프트에 제목과 자막을 넣고, 히스토리와 질문을 이어붙인다', () => {
    const messages = buildChatMessages(
      DEFAULT_SETTINGS,
      segs,
      meta,
      [
        { role: 'user', content: '이전 질문' },
        { role: 'assistant', content: '이전 답변' },
      ],
      '새 질문',
    )
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('테스트 영상')
    expect(messages[0].content).toContain('자막 내용입니다')
    expect(messages).toHaveLength(4)
    expect(messages[3]).toEqual({ role: 'user', content: '새 질문' })
  })

  it('자막이 길면 컨텍스트를 MAX_SINGLE_PASS_CHARS로 자른다', () => {
    const long: TranscriptSegment[] = [{ start: 0, duration: 5, text: 'x'.repeat(MAX_SINGLE_PASS_CHARS * 2) }]
    const messages = buildChatMessages(DEFAULT_SETTINGS, long, meta, [], '질문')
    expect(messages[0].content.length).toBeLessThan(MAX_SINGLE_PASS_CHARS * 1.5)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `chat` 모듈 없음

- [ ] **Step 3: 구현**

`src/background/prompts.ts`에 추가:

```ts
export function buildChatSystem(
  language: Settings['language'],
  meta: VideoMeta,
  transcriptContext: string,
): string {
  return [
    '당신은 유튜브 영상 내용에 대해 답하는 도우미입니다.',
    '아래 자막에 근거해서만 답하고, 자막에 없는 내용은 모른다고 하세요.',
    `영상 제목: ${meta.title}`,
    '자막:',
    transcriptContext,
    languageInstruction(language),
  ].join('\n')
}
```

`src/background/chat.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/chat.ts src/background/chat.test.ts src/background/prompts.ts
git commit -m "feat: 영상 Q&A 채팅 파이프라인"
```

---

### Task 8: 백그라운드 라우터 + 캐시

**Files:**
- Create: `src/background/cache.ts`, `src/background/router.ts`
- Modify: `src/background/index.ts` (라우터 연결)
- Test: `src/background/router.test.ts`

**Interfaces:**
- Consumes: `summarize` (Task 5), `generateChapters`, `ChapterParseError` (Task 6), `answerQuestion` (Task 7), `LlmUnreachableError`, `checkConnection` (Task 4), `loadSettings` (Task 2), `PortRequest`, `PortResponse`, `PORT_NAME`, `RuntimeRequest`, `RuntimeResponse` (Task 2)
- Produces:
  - `getCache(key: string): Promise<string | undefined>`, `setCache(key: string, value: string): Promise<void>` — `chrome.storage.session` 사용
  - `handleRequest(req: PortRequest, settings: Settings, post: (msg: PortResponse) => void, signal: AbortSignal): Promise<void>` — 테스트 가능한 순수 라우팅 로직
  - `chrome.runtime.onConnect` / `onMessage` 연결 (index.ts)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/background/router.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortResponse, PortRequest } from '../shared/messages'
import { DEFAULT_SETTINGS } from '../shared/types'

vi.mock('./pipeline', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  summarize: vi.fn(),
}))
vi.mock('./chapters', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateChapters: vi.fn(),
}))
vi.mock('./chat', () => ({ answerQuestion: vi.fn() }))
vi.mock('./cache', () => ({ getCache: vi.fn(), setCache: vi.fn() }))

import { LlmUnreachableError } from './llm'
import { summarize } from './pipeline'
import { generateChapters } from './chapters'
import { getCache, setCache } from './cache'
import { handleRequest } from './router'

const meta = { videoId: 'v1', title: 't', durationSec: 60 }
const transcript = [{ start: 0, duration: 5, text: '자막' }]
const summarizeReq: PortRequest = { kind: 'summarize', transcript, meta }

function makePost() {
  const messages: PortResponse[] = []
  return { messages, post: (m: PortResponse) => messages.push(m) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCache).mockResolvedValue(undefined)
})

describe('handleRequest: summarize', () => {
  it('delta를 스트리밍하고 done + 캐시 저장', async () => {
    vi.mocked(summarize).mockImplementation(async function* () {
      yield '요'
      yield '약'
    })
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([
      { kind: 'delta', text: '요' },
      { kind: 'delta', text: '약' },
      { kind: 'done', text: '요약' },
    ])
    expect(setCache).toHaveBeenCalledWith('summary:v1:ko', '요약')
  })

  it('캐시가 있으면 LLM을 부르지 않고 done만 보낸다', async () => {
    vi.mocked(getCache).mockResolvedValue('캐시된 요약')
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([{ kind: 'done', text: '캐시된 요약' }])
    expect(summarize).not.toHaveBeenCalled()
  })

  it('LlmUnreachableError는 LLM_UNREACHABLE 에러 응답', async () => {
    vi.mocked(summarize).mockImplementation(async function* () {
      throw new LlmUnreachableError()
    })
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([
      expect.objectContaining({ kind: 'error', code: 'LLM_UNREACHABLE' }),
    ])
  })

  it('abort된 뒤에는 에러 응답을 보내지 않는다', async () => {
    const controller = new AbortController()
    vi.mocked(summarize).mockImplementation(async function* () {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const { messages, post } = makePost()
    await handleRequest(summarizeReq, DEFAULT_SETTINGS, post, controller.signal)
    expect(messages).toEqual([])
  })
})

describe('handleRequest: chapters', () => {
  it('챕터를 생성해 응답하고 JSON으로 캐시한다', async () => {
    const chapters = [{ startTime: 0, title: '도입', summary: 's' }]
    vi.mocked(generateChapters).mockResolvedValue(chapters)
    const { messages, post } = makePost()
    await handleRequest({ kind: 'chapters', transcript, meta }, DEFAULT_SETTINGS, post, new AbortController().signal)
    expect(messages).toEqual([{ kind: 'chapters', chapters }])
    expect(setCache).toHaveBeenCalledWith('chapters:v1:ko', JSON.stringify(chapters))
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `router`, `cache` 모듈 없음

- [ ] **Step 3: 구현**

`src/background/cache.ts`:

```ts
export async function getCache(key: string): Promise<string | undefined> {
  const stored = await chrome.storage.session.get(key)
  return stored[key] as string | undefined
}

export async function setCache(key: string, value: string): Promise<void> {
  await chrome.storage.session.set({ [key]: value })
}
```

`src/background/router.ts`:

```ts
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
```

`src/background/index.ts` 전체 교체:

```ts
import { handleRequest } from './router'
import { checkConnection } from './llm'
import { loadSettings } from '../shared/settings'
import { PORT_NAME, type PortRequest, type RuntimeRequest, type RuntimeResponse } from '../shared/messages'

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return
  const controller = new AbortController()
  port.onDisconnect.addListener(() => controller.abort())
  port.onMessage.addListener((req: PortRequest) => {
    void (async () => {
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
    })()
  })
})

chrome.runtime.onMessage.addListener(
  (req: RuntimeRequest, _sender, sendResponse: (res: RuntimeResponse) => void) => {
    if (req.kind !== 'checkConnection') return
    void (async () => {
      const settings = await loadSettings()
      sendResponse({ connected: await checkConnection(settings) })
    })()
    return true // 비동기 sendResponse 유지
  },
)
```

- [ ] **Step 4: 테스트 통과 및 빌드 확인**

Run: `npm test` 후 `npm run build`
Expected: 테스트 PASS, 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add src/background src/shared
git commit -m "feat: 백그라운드 메시지 라우터와 세션 캐시"
```

---

### Task 9: 콘텐츠 스크립트 마운트 + 패널 골격

**Files:**
- Modify: `src/content/index.tsx` (전체 교체)
- Create: `src/content/Panel.tsx`, `src/content/panel.css`, `src/content/usePortStream.ts`

**Interfaces:**
- Consumes: `fetchTranscript` (Task 3), `PORT_NAME`, `PortRequest`, `PortResponse`, `RuntimeRequest`/`RuntimeResponse` (Task 2)
- Produces:
  - Shadow DOM 안에 `<Panel videoId={...} />` 마운트, `yt-navigate-finish`마다 갱신
  - `usePortStream()` 훅: `{ text, status: 'idle' | 'streaming' | 'done' | 'error', error, chapters, start(req), abort() }` — Task 10~12의 탭들이 사용
  - `Panel`: 연결 상태 표시등, 자막 로딩, 탭(요약/챕터/채팅) 골격. 탭 컴포넌트는 props로 `{ transcript, meta }`를 받는다

- [ ] **Step 1: usePortStream 훅 작성**

`src/content/usePortStream.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { PORT_NAME, type PortRequest, type PortResponse } from '../shared/messages'
import type { Chapter } from '../shared/types'

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export function usePortStream() {
  const [text, setText] = useState('')
  const [chapters, setChapters] = useState<Chapter[] | null>(null)
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const portRef = useRef<chrome.runtime.Port | null>(null)

  const abort = useCallback(() => {
    portRef.current?.disconnect()
    portRef.current = null
  }, [])

  // 언마운트(영상 전환 등) 시 포트를 닫아 백그라운드 작업을 중단시킨다
  useEffect(() => abort, [abort])

  const start = useCallback(
    (req: PortRequest, onDone?: (finalText: string) => void) => {
      abort()
      setText('')
      setChapters(null)
      setError(null)
      setStatus('streaming')
      const port = chrome.runtime.connect({ name: PORT_NAME })
      portRef.current = port
      port.onMessage.addListener((msg: PortResponse) => {
        switch (msg.kind) {
          case 'delta':
            setText((t) => t + msg.text)
            break
          case 'done':
            setText(msg.text)
            setStatus('done')
            onDone?.(msg.text)
            port.disconnect()
            break
          case 'chapters':
            setChapters(msg.chapters)
            setStatus('done')
            port.disconnect()
            break
          case 'error':
            setError(
              msg.code === 'LLM_UNREACHABLE'
                ? 'LM Studio에 연결할 수 없습니다. LM Studio를 실행하고 서버(Developer > Start Server)를 켜 주세요.'
                : msg.code === 'PARSE_FAILED'
                  ? '챕터 생성에 실패했습니다. 다시 시도해 주세요.'
                  : `오류가 발생했습니다: ${msg.message}`,
            )
            setStatus('error')
            port.disconnect()
            break
        }
      })
      port.postMessage(req)
    },
    [abort],
  )

  return { text, chapters, status, error, start, abort }
}
```

- [ ] **Step 2: Panel 골격 작성**

`src/content/panel.css`:

```css
:host {
  all: initial;
}
.panel {
  font-family: 'Roboto', 'Noto Sans KR', sans-serif;
  font-size: 14px;
  color: #0f0f0f;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e5e5;
  font-weight: 700;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d93025;
}
.status-dot.connected {
  background: #1e8e3e;
}
.tabs {
  display: flex;
  border-bottom: 1px solid #e5e5e5;
}
.tab {
  flex: 1;
  padding: 10px 0;
  text-align: center;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #606060;
}
.tab.active {
  color: #0f0f0f;
  font-weight: 700;
  border-bottom: 2px solid #0f0f0f;
}
.body {
  padding: 16px;
  max-height: 480px;
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.6;
}
.primary-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 18px;
  background: #0f0f0f;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.primary-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.error {
  color: #d93025;
}
.muted {
  color: #606060;
}
.chapter {
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}
.chapter:hover {
  background: #f2f2f2;
}
.chapter-time {
  color: #065fd4;
  font-weight: 700;
  margin-right: 8px;
}
.chat-log {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.chat-msg {
  padding: 8px 12px;
  border-radius: 12px;
  max-width: 90%;
}
.chat-msg.user {
  align-self: flex-end;
  background: #0f0f0f;
  color: #fff;
}
.chat-msg.assistant {
  align-self: flex-start;
  background: #f2f2f2;
}
.chat-input-row {
  display: flex;
  gap: 8px;
}
.chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e5e5e5;
  border-radius: 18px;
  font-size: 13px;
}
```

`src/content/Panel.tsx` (탭 콘텐츠는 Task 10~12에서 채운다 — 지금은 자리 표시 텍스트):

```tsx
import { useEffect, useState } from 'react'
import { fetchTranscript } from './transcript'
import type { RuntimeRequest, RuntimeResponse } from '../shared/messages'
import type { TranscriptSegment, VideoMeta } from '../shared/types'

export type TabKey = 'summary' | 'chapters' | 'chat'

export interface TabProps {
  transcript: TranscriptSegment[]
  meta: VideoMeta
}

export function Panel({ videoId }: { videoId: string }) {
  const [tab, setTab] = useState<TabKey>('summary')
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState<{ segments: TranscriptSegment[]; meta: VideoMeta } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const req: RuntimeRequest = { kind: 'checkConnection' }
    chrome.runtime.sendMessage(req, (res: RuntimeResponse) => setConnected(res?.connected ?? false))
  }, [videoId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    fetchTranscript(videoId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [videoId])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '요약' },
    { key: 'chapters', label: '챕터' },
    { key: 'chat', label: '채팅' },
  ]

  return (
    <div className="panel">
      <div className="header">
        <span className={`status-dot${connected ? ' connected' : ''}`} title={connected ? 'LM Studio 연결됨' : 'LM Studio 연결 안 됨'} />
        SummarizeAI
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="body">
        {loading ? (
          <span className="muted">자막을 불러오는 중...</span>
        ) : !data ? (
          <span className="muted">이 영상은 자막이 없어 요약할 수 없습니다.</span>
        ) : (
          <TabContent tab={tab} transcript={data.segments} meta={data.meta} />
        )}
      </div>
    </div>
  )
}

function TabContent({ tab, transcript, meta }: { tab: TabKey } & TabProps) {
  // Task 10~12에서 SummaryTab / ChaptersTab / ChatTab으로 교체된다
  switch (tab) {
    case 'summary':
      return <span className="muted">요약 탭 (구현 예정)</span>
    case 'chapters':
      return <span className="muted">챕터 탭 (구현 예정)</span>
    case 'chat':
      return <span className="muted">채팅 탭 (구현 예정)</span>
  }
}
```

- [ ] **Step 3: 마운트 로직 작성**

`src/content/index.tsx` 전체 교체:

```tsx
import { createRoot, type Root } from 'react-dom/client'
import { Panel } from './Panel'
import cssText from './panel.css?inline'

const HOST_ID = 'summarize-ai-host'
let root: Root | null = null

function getVideoId(): string | null {
  if (!location.pathname.startsWith('/watch')) return null
  return new URLSearchParams(location.search).get('v')
}

function waitFor(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector)
    if (found) return resolve(found)
    const started = Date.now()
    const timer = setInterval(() => {
      const el = document.querySelector(selector)
      if (el || Date.now() - started > timeoutMs) {
        clearInterval(timer)
        resolve(el)
      }
    }, 250)
  })
}

async function mountPanel() {
  const videoId = getVideoId()
  if (!videoId) {
    root?.render(null)
    return
  }
  let host = document.getElementById(HOST_ID)
  if (!host) {
    const secondary = await waitFor('#secondary', 10000)
    if (!secondary) {
      console.warn('[SummarizeAI] 패널 삽입 지점(#secondary)을 찾지 못했습니다')
      return
    }
    host = document.createElement('div')
    host.id = HOST_ID
    secondary.prepend(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = cssText
    shadow.appendChild(style)
    const container = document.createElement('div')
    shadow.appendChild(container)
    root = createRoot(container)
  }
  // key=videoId로 영상 전환 시 패널 상태 리셋
  root?.render(<Panel key={videoId} videoId={videoId} />)
}

window.addEventListener('yt-navigate-finish', () => void mountPanel())
void mountPanel()
```

- [ ] **Step 4: 빌드 및 수동 확인**

Run: `npm run build` 후 크롬에서 확장 새로고침, 유튜브 영상 페이지 접속.
Expected:
- 추천 영상 목록 위에 SummarizeAI 패널 표시, 탭 3개 전환 동작
- 자막 있는 영상에서 "자막을 불러오는 중..." → 탭 자리 표시 텍스트
- 자막 없는 영상에서 "자막이 없어 요약할 수 없습니다" 표시
- 다른 영상 클릭(SPA 이동) 시 패널 유지 + 상태 리셋
- LM Studio 켜져 있으면 초록 점, 꺼져 있으면 빨간 점

- [ ] **Step 5: Commit**

```bash
git add src/content
git commit -m "feat: 유튜브 페이지 패널 마운트 (Shadow DOM, SPA 네비게이션, 연결 상태)"
```

---

### Task 10: 요약 탭

**Files:**
- Create: `src/content/components/SummaryTab.tsx`
- Modify: `src/content/Panel.tsx` (`TabContent`의 summary 분기 교체)

**Interfaces:**
- Consumes: `usePortStream` (Task 9), `TabProps` (Task 9)
- Produces: `SummaryTab({ transcript, meta }: TabProps)` — 요약 버튼 → 스트리밍 표시 → 완료/에러 처리

- [ ] **Step 1: 구현**

`src/content/components/SummaryTab.tsx`:

```tsx
import { usePortStream } from '../usePortStream'
import type { TabProps } from '../Panel'

export function SummaryTab({ transcript, meta }: TabProps) {
  const { text, status, error, start } = usePortStream()

  const run = () => start({ kind: 'summarize', transcript, meta })

  if (status === 'idle') {
    return (
      <button className="primary-btn" onClick={run}>
        이 영상 요약하기
      </button>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <p className="error">{error}</p>
        <button className="primary-btn" onClick={run}>
          다시 시도
        </button>
      </div>
    )
  }
  return (
    <div>
      {text || <span className="muted">요약 생성 중...</span>}
      {status === 'streaming' && text && <span className="muted"> ▍</span>}
    </div>
  )
}
```

`src/content/Panel.tsx`의 `TabContent`에서 summary 분기를 교체:

```tsx
import { SummaryTab } from './components/SummaryTab'
// ...
    case 'summary':
      return <SummaryTab transcript={transcript} meta={meta} />
```

- [ ] **Step 2: 빌드 및 수동 확인**

Run: `npm run build`, 확장 새로고침. LM Studio 서버를 켜고 모델을 로드한 상태에서:
Expected:
- "이 영상 요약하기" 클릭 → 요약이 실시간으로 타이핑되듯 표시 → 완료
- 같은 영상에서 새로고침 후 다시 클릭 → 캐시로 즉시 표시
- LM Studio를 끄고 클릭 → 연결 안내 에러 + "다시 시도" 버튼

- [ ] **Step 3: Commit**

```bash
git add src/content
git commit -m "feat: 전체 요약 탭 (스트리밍 표시, 에러/재시도)"
```

---

### Task 11: 챕터 탭

**Files:**
- Create: `src/content/components/ChaptersTab.tsx`
- Modify: `src/content/Panel.tsx` (chapters 분기 교체)

**Interfaces:**
- Consumes: `usePortStream`, `TabProps` (Task 9), `formatTime` (Task 2), `Chapter` (Task 2)
- Produces: `ChaptersTab({ transcript, meta }: TabProps)` — 챕터 생성 → 목록 표시 → 클릭 시 해당 시점으로 이동

- [ ] **Step 1: 구현**

`src/content/components/ChaptersTab.tsx`:

```tsx
import { usePortStream } from '../usePortStream'
import { formatTime } from '../../shared/format'
import type { TabProps } from '../Panel'

function seekTo(sec: number) {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video')
  if (video) video.currentTime = sec
}

export function ChaptersTab({ transcript, meta }: TabProps) {
  const { chapters, status, error, start } = usePortStream()

  const run = () => start({ kind: 'chapters', transcript, meta })

  if (status === 'idle') {
    return (
      <button className="primary-btn" onClick={run}>
        챕터 만들기
      </button>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <p className="error">{error}</p>
        <button className="primary-btn" onClick={run}>
          다시 시도
        </button>
      </div>
    )
  }
  if (status === 'streaming') {
    return <span className="muted">챕터 생성 중... (구간별 분석에 시간이 걸립니다)</span>
  }
  return (
    <div>
      {(chapters ?? []).map((c) => (
        <div key={c.startTime} className="chapter" onClick={() => seekTo(c.startTime)}>
          <span className="chapter-time">{formatTime(c.startTime)}</span>
          <strong>{c.title}</strong>
          <div className="muted">{c.summary}</div>
        </div>
      ))}
    </div>
  )
}
```

`Panel.tsx`의 chapters 분기를 `<ChaptersTab transcript={transcript} meta={meta} />`로 교체.

- [ ] **Step 2: 빌드 및 수동 확인**

Run: `npm run build`, 확장 새로고침.
Expected:
- "챕터 만들기" → 로딩 → 타임스탬프 + 제목 + 한 줄 요약 목록
- 챕터 클릭 → 영상이 해당 시점으로 점프
- 챕터 수가 영상 길이에 비례 (10분 영상 ≈ 3개, 1시간 영상 ≈ 12개)

- [ ] **Step 3: Commit**

```bash
git add src/content
git commit -m "feat: 타임라인 챕터 탭 (클릭 시 해당 시점 이동)"
```

---

### Task 12: 채팅 탭

**Files:**
- Create: `src/content/components/ChatTab.tsx`
- Modify: `src/content/Panel.tsx` (chat 분기 교체)

**Interfaces:**
- Consumes: `usePortStream`, `TabProps` (Task 9), `ChatMessage` (Task 2)
- Produces: `ChatTab({ transcript, meta }: TabProps)` — 질문 입력 → 스트리밍 답변 → 히스토리 유지 (영상 전환 시 Panel의 key 리셋으로 초기화됨)

- [ ] **Step 1: 구현**

`src/content/components/ChatTab.tsx`:

```tsx
import { useState } from 'react'
import { usePortStream } from '../usePortStream'
import type { TabProps } from '../Panel'
import type { ChatMessage } from '../../shared/types'

export function ChatTab({ transcript, meta }: TabProps) {
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const { text, status, error, start } = usePortStream()

  const streaming = status === 'streaming'

  const send = () => {
    const question = input.trim()
    if (!question || streaming) return
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: question }]
    setHistory(nextHistory)
    setInput('')
    start({ kind: 'chat', transcript, meta, history, question }, (finalText) => {
      setHistory([...nextHistory, { role: 'assistant', content: finalText }])
    })
  }

  return (
    <div>
      <div className="chat-log">
        {history.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {streaming && <div className="chat-msg assistant">{text || '...'}</div>}
        {status === 'error' && <p className="error">{error}</p>}
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          placeholder="영상에 대해 질문해 보세요"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
          }}
        />
        <button className="primary-btn" onClick={send} disabled={streaming || !input.trim()}>
          전송
        </button>
      </div>
    </div>
  )
}
```

주의: 한국어 IME 입력 중 Enter가 중복 전송되지 않도록 `isComposing`을 확인한다.

`Panel.tsx`의 chat 분기를 `<ChatTab transcript={transcript} meta={meta} />`로 교체.

- [ ] **Step 2: 빌드 및 수동 확인**

Run: `npm run build`, 확장 새로고침.
Expected:
- 질문 입력 → 답변이 스트리밍으로 표시 → 히스토리에 누적
- 후속 질문에서 이전 대화 맥락 유지 ("방금 말한 그거 더 설명해줘")
- 다른 영상으로 이동 → 히스토리 초기화

- [ ] **Step 3: Commit**

```bash
git add src/content
git commit -m "feat: 영상 Q&A 채팅 탭 (히스토리, IME 처리)"
```

---

### Task 13: 옵션 페이지

**Files:**
- Modify: `src/options/main.tsx` (전체 교체)

**Interfaces:**
- Consumes: `loadSettings`, `saveSettings` (Task 2), `RuntimeRequest`/`RuntimeResponse` (Task 2)
- Produces: 설정 폼 (LM Studio 주소, 모델명, 출력 언어) + 연결 테스트 버튼

- [ ] **Step 1: 구현**

`src/options/main.tsx` 전체 교체:

```tsx
import { useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { loadSettings, saveSettings } from '../shared/settings'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import type { RuntimeRequest, RuntimeResponse } from '../shared/messages'

function OptionsApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  const save = async () => {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const test = async () => {
    setTestResult('확인 중...')
    await saveSettings(settings)
    const req: RuntimeRequest = { kind: 'checkConnection' }
    chrome.runtime.sendMessage(req, (res: RuntimeResponse) => {
      setTestResult(res?.connected ? '✅ 연결 성공' : '❌ 연결 실패 — LM Studio 서버가 켜져 있는지 확인하세요')
    })
  }

  const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }
  const input: CSSProperties = { padding: 8, fontSize: 14, width: 360 }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 480 }}>
      <h1>SummarizeAI 설정</h1>
      <div style={row}>
        <label>LM Studio 주소</label>
        <input
          style={input}
          value={settings.baseUrl}
          onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
        />
      </div>
      <div style={row}>
        <label>모델명 (비워두면 LM Studio에 로드된 기본 모델 사용)</label>
        <input
          style={input}
          value={settings.model}
          placeholder="예: qwen2.5-7b-instruct"
          onChange={(e) => setSettings({ ...settings, model: e.target.value })}
        />
      </div>
      <div style={row}>
        <label>요약 출력 언어</label>
        <select
          style={input}
          value={settings.language}
          onChange={(e) => setSettings({ ...settings, language: e.target.value as Settings['language'] })}
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
          <option value="auto">자막 언어 따름</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => void save()}>저장</button>
        <button onClick={() => void test()}>연결 테스트</button>
        {saved && <span>저장됨 ✓</span>}
        {testResult && <span>{testResult}</span>}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<OptionsApp />)
```

- [ ] **Step 2: 빌드 및 수동 확인**

Run: `npm run build`, 확장 새로고침, 확장 관리 페이지에서 "확장 프로그램 옵션" 열기.
Expected: 설정 변경 → 저장 → 페이지 다시 열어도 유지. 연결 테스트 동작. 언어를 English로 바꾸면 새 요약(다른 영상 또는 시크릿 창)이 영어로 출력.

- [ ] **Step 3: Commit**

```bash
git add src/options
git commit -m "feat: 옵션 페이지 (주소, 모델, 출력 언어, 연결 테스트)"
```

---

### Task 14: 최종 수동 검증 (스펙 체크리스트)

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 + 빌드**

Run: `npm test` 후 `npm run build`
Expected: 전부 PASS, 빌드 성공

- [ ] **Step 2: 스펙의 수동 검증 체크리스트 실행**

LM Studio를 켜고 모델을 로드한 상태에서 각 시나리오 확인:

1. **짧은 영상** (10분 이내, 자막 있음): 요약·챕터·채팅 모두 동작
2. **1시간 이상 긴 영상**: 요약이 map-reduce 경로로 완료됨 (시간이 걸리더라도 결과 출력)
3. **자막 없는 영상**: "자막이 없어 요약할 수 없습니다" 안내
4. **LM Studio 꺼진 상태**: 빨간 상태 점 + 요약 시도 시 연결 안내 에러 + 다시 시도 동작
5. **영상 간 연속 이동**: SPA 이동 5회 반복 — 패널이 매번 새 영상 기준으로 리셋, 진행 중이던 요청이 새 영상에 출력되지 않음

- [ ] **Step 3: 발견된 문제 수정 후 Commit**

문제가 있으면 superpowers:systematic-debugging 스킬로 수정하고 커밋. 모두 통과하면:

```bash
git add -A
git commit -m "chore: 수동 검증 체크리스트 통과"
```
