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
    // 이전 호스트가 DOM에서 제거된 경우 남은 React 트리를 정리한다
    root?.unmount()
    root = null
    const secondary = await waitFor('#secondary', 10000)
    if (!secondary) {
      console.warn('[SummarizeAI] 패널 삽입 지점(#secondary)을 찾지 못했습니다')
      return
    }
    // await 사이에 다른 mountPanel 호출(초기 로드 + yt-navigate-finish 중복)이
    // 이미 호스트를 만들었을 수 있다 — 재확인해 패널 중복 삽입을 막는다
    host = document.getElementById(HOST_ID)
    if (!host) {
      host = document.createElement('div')
      host.id = HOST_ID
      // 다크가 기본값 — 유튜브가 라이트 모드(<html>에 dark 속성 없음)일 때만 라이트 팔레트
      if (!document.documentElement.hasAttribute('dark')) host.classList.add('light')
      secondary.prepend(host)
      const shadow = host.attachShadow({ mode: 'open' })
      const style = document.createElement('style')
      style.textContent = cssText
      shadow.appendChild(style)
      const container = document.createElement('div')
      // Shadow DOM 밖으로 버블링되는 키 이벤트는 target이 호스트로 재지정되어,
      // 유튜브 전역 단축키(스페이스=재생/정지 등)가 입력창 타이핑을 가로챈다 — 전파를 차단한다.
      // React 핸들러(Enter 전송 등)는 같은 노드에 붙어 있어 영향 없음.
      for (const type of ['keydown', 'keyup', 'keypress'] as const) {
        container.addEventListener(type, (e) => e.stopPropagation())
      }
      shadow.appendChild(container)
      root = createRoot(container)
    }
  }
  // key=videoId로 영상 전환 시 패널 상태 리셋
  root?.render(<Panel key={videoId} videoId={videoId} />)
}

// 확장 리로드 시 이전 스크립트 컨텍스트가 남긴 죽은 패널 제거
for (const stale of Array.from(document.querySelectorAll(`#${HOST_ID}`))) stale.remove()

window.addEventListener('yt-navigate-finish', () => void mountPanel())
void mountPanel()
