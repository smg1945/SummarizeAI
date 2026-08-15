# SummarizeAI

유튜브 영상을 AI로 요약해 주는 크롬 확장 앱 (Manifest V3). 로컬 LLM(LM Studio)과 상용 API(Google Gemini / Claude / OpenAI)를 모두 지원합니다.

## 기능

- **전체 요약** — 영상 자막을 스트리밍으로 요약 (긴 영상은 청크 분할 → map-reduce)
- **타임라인 챕터** — 구간별 제목·요약 생성, 클릭하면 해당 시점으로 이동
- **영상 Q&A 채팅** — 영상 내용에 대해 자유롭게 질문
- **출력 언어 선택** — 영어 영상도 한국어로 요약 (한국어/English/자막 언어 따름)
- **패널 내 설정** — 유튜브 페이지 패널의 ⚙ 버튼에서 공급자·API 키·언어 바로 변경
- 다크모드 기본 (유튜브 라이트 모드에선 자동으로 라이트 팔레트)

## 설치

```bash
npm install
npm run build
```

1. 크롬에서 `chrome://extensions` 접속 → **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드합니다** → `dist` 폴더 선택
3. 유튜브 영상 페이지를 열면 오른쪽에 패널이 나타납니다

## 모델 설정

패널의 ⚙ 버튼(또는 확장 아이콘 → 옵션)에서 공급자를 선택합니다:

| 공급자 | 준비물 | 기본 모델 |
|---|---|---|
| 로컬 (LM Studio) | [LM Studio](https://lmstudio.ai) 설치 → 모델 로드 → Developer > Start Server | 로드된 모델 |
| Google Gemini | [AI Studio API 키](https://aistudio.google.com/apikey) | gemini-2.5-flash |
| Claude | [Anthropic Console API 키](https://console.anthropic.com) | claude-haiku-4-5 |
| OpenAI | [Platform API 키](https://platform.openai.com/api-keys) | gpt-4o-mini |

> API 키는 브라우저의 확장 저장소(`chrome.storage.local`)에 평문으로 저장됩니다. 개인 사용 목적으로 설계되었습니다.

## 구조

```
src/
├── content/      # 유튜브 페이지 패널 (React, Shadow DOM), 자막 추출 (InnerTube API)
├── background/   # 서비스 워커: LLM 클라이언트, 요약/챕터/Q&A 파이프라인, 세션 캐시
├── options/      # 설정 페이지
└── shared/       # 타입, 메시지 프로토콜, 설정 저장
```

콘텐츠 스크립트와 백그라운드는 `chrome.runtime` Port로 스트리밍 통신합니다. 개발 문서는 `docs/superpowers/`의 설계 스펙과 구현 계획을 참고하세요.

## 개발

```bash
npm test         # Vitest 단위 테스트
npm run build    # tsc --noEmit + vite build (CRXJS)
```

React 18 + TypeScript(strict) + Vite 6 + [@crxjs/vite-plugin](https://crxjs.dev) 2
